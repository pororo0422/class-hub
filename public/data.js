/* ==================================================================
 * 데이터 층 - Firebase Firestore
 * ------------------------------------------------------------------
 * 예전엔 server.js(Express)가 하던 일을 이제 브라우저가 직접 해.
 * app.js의 화면 코드를 안 고치려고, 예전 서버와 똑같은 주소 규칙을
 * 그대로 흉내 냈음:   api("POST", "/api/notices", { ... })
 *
 * 저장되는 곳 (Firestore):
 *   notices / homework / polls / events / suggestions   ← 컬렉션
 *   meta/class 문서의 className                          ← 반 이름
 * ================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, setDoc,
  onSnapshot, query, orderBy, arrayUnion, arrayRemove, writeBatch, FieldPath,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

import { firebaseConfig, ADMIN_KEY } from "./firebase-config.js";

/** 설정을 아직 안 채웠으면 시작 화면에서 안내하려고 알려줌 */
export const configReady = !String(firebaseConfig.projectId || "").includes("붙여넣기");

/* 설정이 비어 있으면 Firebase를 아예 켜지 않음.
 * (여기서 터지면 app.js가 통째로 안 돌아서 하얀 화면이 됨) */
let db = null;
if (configReady) {
  try {
    db = getFirestore(initializeApp(firebaseConfig));
  } catch (e) {
    console.error("Firebase 초기화 실패", e);
  }
}

/** db가 없으면 그 이유를 알려주고 멈춤 */
function requireDb() {
  if (!db) throw new Error("Firebase 설정이 아직 안 됐어요. public/firebase-config.js 를 확인해 주세요.");
  return db;
}

/* ------------------------------------------------------------------
 * 예전 server.js에 있던 도우미들 (그대로 옮겨옴)
 * ---------------------------------------------------------------- */

/** 문자열 정리 - 빈 값이면 null */
function clean(v, max = 2000) {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s.length ? s : null;
}

/** 두 날짜(YYYY-MM-DD) 사이가 며칠인지 */
function daysBetween(a, b) {
  return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function now() {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------
 * 실시간 구독
 *
 * 예전엔 뭘 저장할 때마다 /api/state를 다시 불러왔는데, 이제는
 * Firestore가 바뀔 때마다 알아서 알려줘. 그래서 다른 애가 공지를
 * 올리면 새로고침 안 해도 내 화면에 바로 뜸.
 * ---------------------------------------------------------------- */

const EMPTY = {
  className: "1학년 3반",
  notices: [],
  homework: [],
  polls: [],
  events: [],
  suggestions: [],
};

/** 지금까지 받아온 전체 데이터 (예전 db.json과 같은 모양) */
let cache = { ...EMPTY };

/** 예전 서버는 새 글을 위(unshift)에, 숙제·일정은 뒤(push)에 넣었음 */
const LISTS = [
  ["notices", "desc"],
  ["homework", "asc"],
  ["polls", "desc"],
  ["events", "asc"],
  ["suggestions", "desc"],
];

/**
 * 실시간 구독 시작.
 * @param {(state) => void} onChange  데이터가 바뀔 때마다 호출됨
 * @param {(err) => void}   onError   읽기에 실패했을 때
 */
export function startRealtime(onChange, onError, onCleanup) {
  if (!db) {
    onError?.("Firebase 설정이 아직 안 됐어요. public/firebase-config.js 를 확인해 주세요.");
    return;
  }
  const push = () => onChange({ ...cache });
  const fail = (where) => (err) => {
    console.error(`[${where}] 읽기 실패`, err);
    onError?.(friendly(err));
  };

  onSnapshot(
    doc(db, "meta", "class"),
    (snap) => {
      cache.className = (snap.exists() && snap.data().className) || EMPTY.className;
      push();
    },
    fail("meta/class"),
  );

  for (const [name, dir] of LISTS) {
    onSnapshot(
      query(collection(db, name), orderBy("createdAt", dir)),
      (snap) => {
        cache[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        push();
        // 숙제 목록이 서버에서 실제로 도착했을 때 오래된 것들을 치움.
        // fromCache를 안 보면 첫 스냅샷이 빈 채로 와서 정리가 헛돌 수 있음.
        if (name === "homework" && !snap.metadata.fromCache) {
          지난숙제정리(cache.homework, onCleanup);
        }
      },
      fail(name),
    );
  }
}

/* ------------------------------------------------------------------
 * 지난 숙제 자동 정리
 *
 * 서버가 없어서 시간 맞춰 도는 게 아니야. 누군가 사이트를 열었을 때
 * 그 브라우저가 대신 치우는 방식이라, 아무도 안 들어오면 안 지워져.
 * 지우면 되돌릴 수 없으니 마감에서 며칠 지난 것만 건드림.
 * ---------------------------------------------------------------- */

/** 마감 뒤 이만큼 지나면 지움 */
const 보관일수 = 3;

/** 한 번에 이보다 많이는 안 지움 (기기 시계가 이상할 때 피해를 줄이려고) */
const 한번에최대 = 20;

let 정리했음 = false;

/** 이 날짜 이전(같은 날 포함)에 마감된 숙제는 정리 대상 (기기 시간대 기준) */
function 정리기준일() {
  const d = new Date();
  d.setDate(d.getDate() - 보관일수);
  const p = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 마감이 한참 지난 숙제를 지움. 몇 개 지웠는지 알려줌 */
async function 지난숙제정리(목록, 알림) {
  if (정리했음) return;
  정리했음 = true;                       // 한 번 접속에 한 번만

  const 기준 = 정리기준일();
  const 오래된 = 목록
    .filter((h) => typeof h.due === "string" && h.due <= 기준)
    .slice(0, 한번에최대);

  if (!오래된.length) return;

  // 하나씩 지우면 개수만큼 왕복해서 느려. 한 번에 묶어서 보냄
  try {
    const batch = writeBatch(db);
    오래된.forEach((h) => batch.delete(doc(db, "homework", h.id)));
    await batch.commit();

    console.log(`지난 숙제 ${오래된.length}개 정리함 (${기준} 이전 마감)`);
    알림?.(오래된.length);
  } catch (e) {
    console.warn("지난 숙제 정리 실패:", e?.code || e);
    정리했음 = false;              // 실패했으면 다음 기회에 다시
  }
}

/** Firebase 에러를 사람 말로 바꿔줌 */
function friendly(err) {
  switch (err?.code) {
    case "permission-denied":
      return "저장할 권한이 없어요. Firebase의 Firestore 규칙을 확인해 주세요.";
    case "unavailable":
    case "failed-precondition":
      return "인터넷 연결이 불안정해요. 잠시 뒤에 다시 해볼래?";
    case "not-found":
      return "찾을 수 없어요. 누가 이미 지웠을 수도 있어요.";
    default:
      return err?.message || "저장하지 못했어요. 다시 해볼래?";
  }
}

/* ------------------------------------------------------------------
 * api() - 예전 서버 주소를 그대로 받아서 Firestore 작업으로 바꿔줌
 * ---------------------------------------------------------------- */

export async function api(method, url, body = {}) {
  if (method !== "GET") requireDb();
  try {
    return await route(method, url, body || {});
  } catch (err) {
    // 내가 직접 던진 안내 문구는 그대로, Firebase 에러만 다듬어서
    throw err?.code ? new Error(friendly(err)) : err;
  }
}

async function route(method, url, b) {
  const [, , kind, id, action] = url.split("/"); // "" / "api" / "notices" / :id / "pin"
  const key = `${method} ${kind}${id ? "/:id" : ""}${action ? "/" + action : ""}`;

  switch (key) {
    /* ---------- 전체 상태 ---------- */
    case "GET state":
      return { ...cache };

    /* ---------- 반장 모드 ---------- */
    case "POST admin/:id": // /api/admin/check
      return { ok: clean(b.key, 100) === ADMIN_KEY };

    /* ---------- 공지 ---------- */
    case "POST notices": {
      const title = need(clean(b.title, 120), "제목을 입력해 주세요.");
      const author = need(clean(b.author, 40), "이름을 먼저 설정해 주세요.");
      await addDoc(collection(db, "notices"), {
        title,
        body: clean(b.body, 4000) || "",
        author,
        pinned: !!b.pinned,
        createdAt: now(),
      });
      return { ok: true };
    }

    case "PATCH notices/:id/pin": {
      const n = find("notices", id, "공지를 찾을 수 없어요.");
      await updateDoc(doc(db, "notices", id), { pinned: !n.pinned });
      return { ok: true };
    }

    case "DELETE notices/:id":
      await deleteDoc(doc(db, "notices", id));
      return { ok: true };

    /* ---------- 숙제 ---------- */
    case "POST homework": {
      const title = need(clean(b.title, 120), "숙제 내용을 입력해 주세요.");
      const due = need(clean(b.due, 10), "마감 날짜를 골라 주세요.");
      const author = need(clean(b.author, 40), "이름을 먼저 설정해 주세요.");
      await addDoc(collection(db, "homework"), {
        subject: clean(b.subject, 20) || "기타",
        title,
        detail: clean(b.detail, 2000) || "",
        due,
        author,
        doneBy: [],
        createdAt: now(),
      });
      return { ok: true };
    }

    /* 다 했어요 체크 - 이름 기준 토글 */
    case "POST homework/:id/done": {
      const who = need(clean(b.name, 40), "이름을 먼저 설정해 주세요.");
      const hw = find("homework", id, "숙제를 찾을 수 없어요.");
      const already = (hw.doneBy || []).includes(who);
      await updateDoc(doc(db, "homework", id), {
        doneBy: already ? arrayRemove(who) : arrayUnion(who),
      });
      return { ok: true };
    }

    case "DELETE homework/:id":
      await deleteDoc(doc(db, "homework", id));
      return { ok: true };

    /* ---------- 날짜 투표 ---------- */
    case "POST polls": {
      const title = need(clean(b.title, 120), "투표 제목을 입력해 주세요.");

      // 날짜 정하기(date) / 찬반 묻기(yesno) / 후보 중 고르기(choice)
      const kind = ["yesno", "choice"].includes(b.kind) ? b.kind : "date";

      let options;
      if (kind === "yesno") {
        // 찬반은 선택지가 정해져 있어서 따로 안 받음
        options = [{ id: uid(), label: "찬성" }, { id: uid(), label: "반대" }];
      } else if (kind === "choice") {
        // 후보군은 적어 준 글자들이 그대로 선택지가 됨
        options = (Array.isArray(b.options) ? b.options : [])
          .map((o) => ({ id: uid(), label: clean(typeof o === "string" ? o : o?.label, 40) }))
          .filter((o) => o.label)
          .slice(0, 10);

        if (options.length < 2) throw new Error("후보를 2개 이상 넣어 주세요.");
      } else {
        options = (Array.isArray(b.options) ? b.options : [])
          .map((o) => ({
            id: uid(),
            date: clean(o?.date, 10),
            time: clean(o?.time, 5) || "",
            note: clean(o?.note, 60) || "",
          }))
          .filter((o) => o.date);

        if (options.length < 2) throw new Error("후보 날짜를 2개 이상 넣어 주세요.");
      }

      await addDoc(collection(db, "polls"), {
        kind,
        title,
        description: clean(b.description, 500) || "",
        createdBy: clean(b.author, 40) || "익명",
        options,
        votes: {}, // { 이름: [optionId, ...] }
        closed: false,
        decidedOptionId: null,
        createdAt: now(),
      });
      return { ok: true };
    }

    /* 투표하기 - 같은 이름이면 이전 표를 덮어씀 */
    case "POST polls/:id/vote": {
      const who = need(clean(b.name, 40), "이름을 먼저 설정해 주세요.");
      const poll = find("polls", id, "투표를 찾을 수 없어요.");
      if (poll.closed) throw new Error("이미 마감된 투표예요.");

      const valid = (poll.options || []).map((o) => o.id);
      const picked = (Array.isArray(b.optionIds) ? b.optionIds : []).filter((x) =>
        valid.includes(x),
      );
      // 날짜 투표만 여러 개 고를 수 있고, 찬반·후보군은 하나만
      const final = poll.kind === "date" || !poll.kind ? picked : picked.slice(0, 1);

      // 이름에 점(.)이 들어가도 안 깨지게 FieldPath로 콕 집어서 저장
      await updateDoc(doc(db, "polls", id), new FieldPath("votes", who), final);
      return { ok: true };
    }

    /* 투표 마감 + 확정된 날짜를 달력 일정으로 등록 (둘 다 되거나 둘 다 안 되거나) */
    case "POST polls/:id/close": {
      const poll = find("polls", id, "투표를 찾을 수 없어요.");

      // 찬반·후보군은 표를 제일 많이 받은 쪽이 결론. 달력에 넣을 일정이 없음
      if (poll.kind === "yesno" || poll.kind === "choice") {
        const tally = {};
        (poll.options || []).forEach((o) => (tally[o.id] = 0));
        Object.values(poll.votes || {}).forEach((picks) =>
          (picks || []).forEach((oid) => {
            if (tally[oid] !== undefined) tally[oid]++;
          }),
        );
        const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
        const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1];

        await updateDoc(doc(db, "polls", id), {
          closed: true,
          decidedOptionId: tied ? null : ranked[0][0], // 동점이면 결론 없음
        });
        return { ok: true };
      }

      const chosen = (poll.options || []).find((o) => o.id === clean(b.optionId, 40));
      if (!chosen) throw new Error("확정할 날짜를 골라 주세요.");

      const batch = writeBatch(db);
      batch.update(doc(db, "polls", id), { closed: true, decidedOptionId: chosen.id });
      batch.set(doc(collection(db, "events")), {
        title: poll.title,
        date: chosen.date,
        endDate: null, // 투표로 정한 날은 하루짜리
        time: chosen.time || "",
        place: chosen.note || "",
        memo: "투표로 정해진 일정",
        fromPollId: id,
        createdAt: now(),
      });
      await batch.commit();
      return { ok: true };
    }

    case "DELETE polls/:id":
      await deleteDoc(doc(db, "polls", id));
      return { ok: true };

    /* ---------- 일정 (달력) ---------- */
    case "POST events": {
      const title = clean(b.title, 120);
      const date = clean(b.date, 10);
      if (!title || !date) throw new Error("일정 이름과 날짜가 필요해요.");

      // 여러 날에 걸친 일정이면 끝나는 날까지. 하루짜리면 endDate는 없음
      let endDate = clean(b.endDate, 10);
      if (endDate) {
        if (endDate < date) throw new Error("끝나는 날이 시작하는 날보다 빠를 수 없어요.");
        if (endDate === date) endDate = null;           // 같은 날이면 하루짜리
        else if (daysBetween(date, endDate) > 365)
          throw new Error("기간이 너무 길어요. 1년까지만 돼요.");
      }

      await addDoc(collection(db, "events"), {
        title,
        date,
        endDate: endDate || null,
        time: clean(b.time, 5) || "",
        place: clean(b.place, 60) || "",
        memo: clean(b.memo, 500) || "",
        createdAt: now(),
      });
      return { ok: true };
    }

    case "DELETE events/:id":
      await deleteDoc(doc(db, "events", id));
      return { ok: true };

    /* ---------- 건의함 ---------- */
    case "POST suggestions": {
      const text = need(clean(b.body, 1000), "내용을 입력해 주세요.");
      await addDoc(collection(db, "suggestions"), {
        body: text,
        author: b.anonymous ? "익명" : clean(b.author, 40) || "익명",
        replies: [],
        createdAt: now(),
      });
      return { ok: true };
    }

    case "POST suggestions/:id/reply": {
      const text = need(clean(b.body, 1000), "답변 내용을 입력해 주세요.");
      await updateDoc(doc(db, "suggestions", id), {
        replies: arrayUnion({
          id: uid(),
          body: text,
          author: clean(b.author, 40) || "반장",
          createdAt: now(),
        }),
      });
      return { ok: true };
    }

    case "DELETE suggestions/:id":
      await deleteDoc(doc(db, "suggestions", id));
      return { ok: true };

    /* ---------- 반 이름 ---------- */
    case "PATCH class-name": {
      const name = need(clean(b.className, 30), "반 이름을 입력해 주세요.");
      await setDoc(doc(db, "meta", "class"), { className: name }, { merge: true });
      return { ok: true, className: name };
    }

    default:
      throw new Error(`알 수 없는 요청이에요: ${method} ${url}`);
  }
}

/** 값이 비어 있으면 안내 문구와 함께 멈춤 */
function need(v, msg) {
  if (!v) throw new Error(msg);
  return v;
}

/** 지금 화면에 들고 있는 데이터에서 찾기 */
function find(kind, id, msg) {
  const hit = (cache[kind] || []).find((x) => x.id === id);
  if (!hit) throw new Error(msg);
  return hit;
}
