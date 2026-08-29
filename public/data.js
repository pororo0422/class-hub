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
export function startRealtime(onChange, onError) {
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
      },
      fail(name),
    );
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
      const options = (Array.isArray(b.options) ? b.options : [])
        .map((o) => ({
          id: uid(),
          date: clean(o?.date, 10),
          time: clean(o?.time, 5) || "",
          note: clean(o?.note, 60) || "",
        }))
        .filter((o) => o.date);

      if (options.length < 2) throw new Error("후보 날짜를 2개 이상 넣어 주세요.");

      await addDoc(collection(db, "polls"), {
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
      // 이름에 점(.)이 들어가도 안 깨지게 FieldPath로 콕 집어서 저장
      await updateDoc(doc(db, "polls", id), new FieldPath("votes", who), picked);
      return { ok: true };
    }

    /* 투표 마감 + 확정된 날짜를 달력 일정으로 등록 (둘 다 되거나 둘 다 안 되거나) */
    case "POST polls/:id/close": {
      const poll = find("polls", id, "투표를 찾을 수 없어요.");
      const chosen = (poll.options || []).find((o) => o.id === clean(b.optionId, 40));
      if (!chosen) throw new Error("확정할 날짜를 골라 주세요.");

      const batch = writeBatch(db);
      batch.update(doc(db, "polls", id), { closed: true, decidedOptionId: chosen.id });
      batch.set(doc(collection(db, "events")), {
        title: poll.title,
        date: chosen.date,
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
      await addDoc(collection(db, "events"), {
        title,
        date,
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
