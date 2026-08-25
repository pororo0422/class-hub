/**
 * 우리 반 알림장 - 서버
 * -------------------------------------------------------------
 * Node.js + Express + JSON 파일 저장 (data/db.json)
 *
 * 나중에 MongoDB로 바꾸고 싶으면 아래 readDB() / writeDB() 두 함수만
 * Mongo 쿼리로 갈아끼우면 나머지 라우터는 거의 그대로 쓸 수 있어.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// 반장/선생님 모드 비밀번호. 실제로 쓸 땐 꼭 바꾸고,
// 배포할 땐 환경변수(ADMIN_KEY)로 넘기는 걸 추천.
const ADMIN_KEY = process.env.ADMIN_KEY || "class3";

const DB_PATH = path.join(__dirname, "data", "db.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ------------------------------------------------------------------
 * 저장소 (JSON 파일)
 * ---------------------------------------------------------------- */

const EMPTY_DB = {
  className: "1학년 3반",
  notices: [],
  homework: [],
  polls: [],
  events: [],
  suggestions: [],
};

function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    return { ...EMPTY_DB, ...JSON.parse(raw) };
  } catch (e) {
    return { ...EMPTY_DB };
  }
}

function writeDB(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function now() {
  return new Date().toISOString();
}

/** 문자열 정리 - 빈 값이면 null */
function clean(v, max = 2000) {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s.length ? s : null;
}

/* ------------------------------------------------------------------
 * 반장 모드 확인
 *
 * 지금은 모든 기능을 반 전체에 열어둬서 이 함수를 쓰는 곳이 없음.
 * 다시 잠그고 싶은 라우터가 있으면 경로 뒤에 끼워 넣으면 됨:
 *   app.delete("/api/notices/:id", requireAdmin, (req, res) => { ... })
 * ---------------------------------------------------------------- */

function requireAdmin(req, res, next) {
  if (req.get("x-admin-key") === ADMIN_KEY) return next();
  res.status(401).json({ error: "반장 모드에서만 할 수 있어요." });
}

app.post("/api/admin/check", (req, res) => {
  const ok = clean(req.body?.key, 100) === ADMIN_KEY;
  res.json({ ok });
});

/* ------------------------------------------------------------------
 * 전체 상태 한 번에 내려주기 (베타라 단순하게)
 * ---------------------------------------------------------------- */

app.get("/api/state", (req, res) => {
  res.json(readDB());
});

/* ------------------------------------------------------------------
 * 공지
 * ---------------------------------------------------------------- */

app.post("/api/notices", (req, res) => {
  const title = clean(req.body?.title, 120);
  if (!title) return res.status(400).json({ error: "제목을 입력해 주세요." });

  const author = clean(req.body?.author, 40);
  if (!author) return res.status(400).json({ error: "이름을 먼저 설정해 주세요." });

  const db = readDB();
  db.notices.unshift({
    id: uid(),
    title,
    body: clean(req.body?.body, 4000) || "",
    author,
    pinned: !!req.body?.pinned,
    createdAt: now(),
  });
  writeDB(db);
  res.json({ ok: true });
});

app.patch("/api/notices/:id/pin", (req, res) => {
  const db = readDB();
  const n = db.notices.find((x) => x.id === req.params.id);
  if (!n) return res.status(404).json({ error: "공지를 찾을 수 없어요." });
  n.pinned = !n.pinned;
  writeDB(db);
  res.json({ ok: true });
});

app.delete("/api/notices/:id", (req, res) => {
  const db = readDB();
  db.notices = db.notices.filter((x) => x.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------
 * 숙제
 * ---------------------------------------------------------------- */

app.post("/api/homework", (req, res) => {
  const title = clean(req.body?.title, 120);
  const due = clean(req.body?.due, 10); // YYYY-MM-DD
  if (!title) return res.status(400).json({ error: "숙제 내용을 입력해 주세요." });
  if (!due) return res.status(400).json({ error: "마감 날짜를 골라 주세요." });

  const author = clean(req.body?.author, 40);
  if (!author) return res.status(400).json({ error: "이름을 먼저 설정해 주세요." });

  const db = readDB();
  db.homework.push({
    id: uid(),
    subject: clean(req.body?.subject, 20) || "기타",
    title,
    detail: clean(req.body?.detail, 2000) || "",
    due,
    author,
    doneBy: [], // 다 한 사람 이름 목록
    createdAt: now(),
  });
  writeDB(db);
  res.json({ ok: true });
});

/** 다 했어요 체크 (이름 기준 토글) */
app.post("/api/homework/:id/done", (req, res) => {
  const who = clean(req.body?.name, 40);
  if (!who) return res.status(400).json({ error: "이름을 먼저 설정해 주세요." });

  const db = readDB();
  const hw = db.homework.find((x) => x.id === req.params.id);
  if (!hw) return res.status(404).json({ error: "숙제를 찾을 수 없어요." });

  hw.doneBy = hw.doneBy.includes(who)
    ? hw.doneBy.filter((n) => n !== who)
    : [...hw.doneBy, who];

  writeDB(db);
  res.json({ ok: true, doneBy: hw.doneBy });
});

app.delete("/api/homework/:id", (req, res) => {
  const db = readDB();
  db.homework = db.homework.filter((x) => x.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------
 * 날짜 투표 (바베큐 언제 할지 정하기)
 * ---------------------------------------------------------------- */

app.post("/api/polls", (req, res) => {
  const title = clean(req.body?.title, 120);
  const options = Array.isArray(req.body?.options) ? req.body.options : [];

  if (!title) return res.status(400).json({ error: "투표 제목을 입력해 주세요." });

  const parsed = options
    .map((o) => ({
      id: uid(),
      date: clean(o?.date, 10),
      time: clean(o?.time, 5) || "",
      note: clean(o?.note, 60) || "",
    }))
    .filter((o) => o.date);

  if (parsed.length < 2)
    return res.status(400).json({ error: "후보 날짜를 2개 이상 넣어 주세요." });

  const db = readDB();
  db.polls.unshift({
    id: uid(),
    title,
    description: clean(req.body?.description, 500) || "",
    createdBy: clean(req.body?.author, 40) || "익명",
    options: parsed,
    votes: {}, // { 이름: [optionId, ...] } - 여러 개 고를 수 있음
    closed: false,
    decidedOptionId: null,
    createdAt: now(),
  });
  writeDB(db);
  res.json({ ok: true });
});

/** 투표하기 - 같은 이름이면 이전 표를 덮어씀 */
app.post("/api/polls/:id/vote", (req, res) => {
  const who = clean(req.body?.name, 40);
  const picked = Array.isArray(req.body?.optionIds) ? req.body.optionIds : [];
  if (!who) return res.status(400).json({ error: "이름을 먼저 설정해 주세요." });

  const db = readDB();
  const poll = db.polls.find((x) => x.id === req.params.id);
  if (!poll) return res.status(404).json({ error: "투표를 찾을 수 없어요." });
  if (poll.closed) return res.status(400).json({ error: "이미 마감된 투표예요." });

  const valid = poll.options.map((o) => o.id);
  poll.votes[who] = picked.filter((id) => valid.includes(id));
  writeDB(db);
  res.json({ ok: true, votes: poll.votes });
});

/** 투표 마감 + 확정된 날짜를 달력 일정으로 등록 */
app.post("/api/polls/:id/close", (req, res) => {
  const db = readDB();
  const poll = db.polls.find((x) => x.id === req.params.id);
  if (!poll) return res.status(404).json({ error: "투표를 찾을 수 없어요." });

  const optionId = clean(req.body?.optionId, 40);
  const chosen = poll.options.find((o) => o.id === optionId);
  if (!chosen) return res.status(400).json({ error: "확정할 날짜를 골라 주세요." });

  poll.closed = true;
  poll.decidedOptionId = chosen.id;

  db.events.push({
    id: uid(),
    title: poll.title,
    date: chosen.date,
    time: chosen.time,
    place: chosen.note,
    memo: "투표로 정해진 일정",
    fromPollId: poll.id,
    createdAt: now(),
  });

  writeDB(db);
  res.json({ ok: true });
});

app.delete("/api/polls/:id", (req, res) => {
  const db = readDB();
  db.polls = db.polls.filter((x) => x.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------
 * 일정 (달력)
 * ---------------------------------------------------------------- */

app.post("/api/events", (req, res) => {
  const title = clean(req.body?.title, 120);
  const date = clean(req.body?.date, 10);
  if (!title || !date)
    return res.status(400).json({ error: "일정 이름과 날짜가 필요해요." });

  const db = readDB();
  db.events.push({
    id: uid(),
    title,
    date,
    time: clean(req.body?.time, 5) || "",
    place: clean(req.body?.place, 60) || "",
    memo: clean(req.body?.memo, 500) || "",
    createdAt: now(),
  });
  writeDB(db);
  res.json({ ok: true });
});

app.delete("/api/events/:id", (req, res) => {
  const db = readDB();
  db.events = db.events.filter((x) => x.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------
 * 건의함 (의견 수렴)
 * ---------------------------------------------------------------- */

app.post("/api/suggestions", (req, res) => {
  const body = clean(req.body?.body, 1000);
  if (!body) return res.status(400).json({ error: "내용을 입력해 주세요." });

  const db = readDB();
  db.suggestions.unshift({
    id: uid(),
    body,
    author: req.body?.anonymous ? "익명" : clean(req.body?.author, 40) || "익명",
    replies: [],
    createdAt: now(),
  });
  writeDB(db);
  res.json({ ok: true });
});

app.post("/api/suggestions/:id/reply", (req, res) => {
  const body = clean(req.body?.body, 1000);
  if (!body) return res.status(400).json({ error: "답변 내용을 입력해 주세요." });

  const db = readDB();
  const s = db.suggestions.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: "건의를 찾을 수 없어요." });

  s.replies.push({
    id: uid(),
    body,
    author: clean(req.body?.author, 40) || "반장",
    createdAt: now(),
  });
  writeDB(db);
  res.json({ ok: true });
});

app.delete("/api/suggestions/:id", (req, res) => {
  const db = readDB();
  db.suggestions = db.suggestions.filter((x) => x.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------
 * 반 이름 바꾸기
 * ---------------------------------------------------------------- */

app.patch("/api/class-name", (req, res) => {
  const name = clean(req.body?.className, 30);
  if (!name) return res.status(400).json({ error: "반 이름을 입력해 주세요." });
  const db = readDB();
  db.className = name;
  writeDB(db);
  res.json({ ok: true, className: name });
});

/* ---------------------------------------------------------------- */

app.listen(PORT, () => {
  console.log(`\n  우리 반 알림장 실행 중 →  http://localhost:${PORT}`);
  console.log(`  반장 모드 비밀번호: ${ADMIN_KEY}\n`);
});
