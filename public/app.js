/* ==================================================================
   우리 반 알림장 - 프론트엔드
   서버에서 /api/state 로 전체 데이터를 받아서 탭별로 그려주는 구조.
   ================================================================== */

import { api, startRealtime, configReady } from "./data.js";

let state = null;      // Firebase에서 받아온 전체 데이터
let myName = "";       // 내 이름
let adminKey = "";     // 반장 모드 비밀번호 (맞을 때만 채워짐)
let activeTab = "today";

let calCursor = new Date();   // 달력에서 보고 있는 달
let selectedDate = null;      // 달력에서 고른 날

/* ------------------------------------------------------------------
 * 작은 도구들
 * ---------------------------------------------------------------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/** localStorage 못 쓰는 환경에서도 안 터지게 감싸둠 */
const store = {
  get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } },
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("is-on");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove("is-on"), 2200);
}

/* ------------------------------------------------------------------
 * 폭죽 - 숙제 다 했다고 누를 때 터짐
 *
 * 라이브러리 없이 canvas에 직접 그림. 종잇조각이 사방으로 퍼졌다가
 * 중력을 받아 떨어지면서 서서히 사라져.
 * ---------------------------------------------------------------- */

const 폭죽색 = ["#FFE87C", "#A9E3F7", "#D93A2B", "#1B2A45", "#FFB4A8", "#8FD9A8"];

const confettiCanvas = $("#confetti");
const cctx = confettiCanvas.getContext("2d");
let 조각들 = [];
let 폭죽도는중 = false;

function fitConfetti() {
  const r = window.devicePixelRatio || 1;
  confettiCanvas.width = window.innerWidth * r;
  confettiCanvas.height = window.innerHeight * r;
  cctx.setTransform(r, 0, 0, r, 0, 0);
}
fitConfetti();
window.addEventListener("resize", fitConfetti);

/** 화면의 (x, y) 자리에서 폭죽을 터뜨림 */
function fireConfetti(x, y) {
  // 움직임 줄이기를 켜 둔 사람에겐 안 터뜨림
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  for (let i = 0; i < 120; i++) {
    const 각도 = Math.random() * Math.PI * 2;
    const 속도 = 2 + Math.random() * 6.5;
    const 종이 = Math.random() > 0.25;          // 대부분 종잇조각, 가끔 반짝이
    조각들.push({
      x, y,
      vx: Math.cos(각도) * 속도,
      vy: Math.sin(각도) * 속도 - 4,            // 살짝 위로 솟았다가 떨어지게
      w: 종이 ? 5 + Math.random() * 6 : 3 + Math.random() * 2,
      h: 종이 ? 3 + Math.random() * 6 : 3 + Math.random() * 2,
      둥글다: !종이,
      각: Math.random() * Math.PI,
      회전: (Math.random() - 0.5) * 0.35,
      색: 폭죽색[(Math.random() * 폭죽색.length) | 0],
      수명: 1,
    });
  }

  if (!폭죽도는중) { 폭죽도는중 = true; requestAnimationFrame(그리기); }
}

function 그리기() {
  const W = window.innerWidth, H = window.innerHeight;
  cctx.clearRect(0, 0, W, H);

  조각들 = 조각들.filter((p) => p.수명 > 0 && p.y < H + 50);

  for (const p of 조각들) {
    p.vy += 0.28;        // 중력
    p.vx *= 0.975;       // 공기 저항 (너무 멀리 안 날아가게)
    p.x += p.vx;
    p.y += p.vy;
    p.각 += p.회전;
    p.수명 -= 0.011;

    cctx.save();
    cctx.translate(p.x, p.y);
    cctx.rotate(p.각);
    cctx.globalAlpha = Math.max(0, Math.min(1, p.수명));
    cctx.fillStyle = p.색;
    if (p.둥글다) {
      cctx.beginPath();
      cctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
      cctx.fill();
    } else {
      cctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    cctx.restore();
  }

  if (조각들.length) {
    requestAnimationFrame(그리기);
  } else {
    폭죽도는중 = false;
    cctx.clearRect(0, 0, W, H);
  }
}

/* ---------- 날짜 ---------- */

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function today() { return ymd(new Date()); }

function parseYmd(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** '2026-08-25' → '8월 25일 (화)' */
function fmtDate(s) {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
}

/** 오늘로부터 며칠 남았는지 */
function daysLeft(s) {
  const a = parseYmd(today());
  const b = parseYmd(s);
  return Math.round((b - a) / 86400000);
}

function ddayHtml(dateStr) {
  const n = daysLeft(dateStr);
  const cls = n < 0 ? "dday dday--past" : n <= 2 ? "dday dday--urgent" : "dday";
  const label = n < 0 ? `${-n}일 지남` : n === 0 ? "오늘까지" : `D-${n}`;
  return `<span class="${cls}">${label}</span>`;
}

/** ISO 문자열 → '8월 25일 (화)' (내 시간대 기준) */
function fmtStamp(iso) {
  return fmtDate(ymd(new Date(iso)));
}

function fmtWhen(dateStr, time) {
  return fmtDate(dateStr) + (time ? ` ${time}` : "");
}

/** 두 날짜 사이가 며칠인지 */
function daysBetween(a, b) {
  return Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
}

/** 일정이 그 날에 걸쳐 있나 (기간 일정이면 중간 날짜도 포함) */
function eventCovers(e, key) {
  return e.endDate ? key >= e.date && key <= e.endDate : e.date === key;
}

/** 일정 날짜 표시 - 기간이면 '8월 3일 (월) ~ 8월 7일 (금) (5일간)' */
function fmtEventWhen(e) {
  if (!e.endDate) return fmtWhen(e.date, e.time);
  const days = daysBetween(e.date, e.endDate) + 1;
  return `${fmtDate(e.date)} ~ ${fmtDate(e.endDate)} · ${days}일간`;
}

/** 기간 일정이 지금 진행 중이면 며칠째인지 보여줌 */
function eventDdayHtml(e) {
  if (!e.endDate) return ddayHtml(e.date);
  if (daysLeft(e.date) <= 0 && daysLeft(e.endDate) >= 0) {
    const nth = daysBetween(e.date, today()) + 1;
    const total = daysBetween(e.date, e.endDate) + 1;
    return `<span class="dday dday--urgent">${nth}일째 / ${total}일</span>`;
  }
  return ddayHtml(e.date);
}

/* ------------------------------------------------------------------
 * 데이터 (Firebase)
 *
 * 예전엔 여기서 fetch로 우리 서버(server.js)를 불렀어. 이제는 data.js가
 * Firestore를 상대해. 부르는 방법(api)은 똑같이 맞춰놔서 아래 화면
 * 코드는 그대로 씀.
 * ---------------------------------------------------------------- */

/** 새 데이터가 들어올 때마다 화면을 다시 그림 */
function applyState(next) {
  state = next;
  $("#classNameEl").textContent = state.className;
  document.title = `${state.className} 알림장`;
  render();
}

async function refresh() {
  applyState(await api("GET", "/api/state"));
}

/** 요청 → 새로고침 → 안내 (에러는 토스트로) */
async function act(fn, okMsg) {
  try {
    await fn();
    await refresh();
    if (okMsg) toast(okMsg);
  } catch (e) {
    toast(e.message);
  }
}

/* ------------------------------------------------------------------
 * 그리기
 * ---------------------------------------------------------------- */

function render() {
  if (!state) return;
  renderToday();
  renderNotices();
  renderHomework();
  renderPolls();
  renderCalendar();
  renderSuggestions();
}

function emptyBox(msg) {
  return `<p class="empty">${esc(msg)}</p>`;
}

/* ---------- 오늘 ---------- */

function renderToday() {
  const box = $("#todayBoard");
  const d = new Date();
  $("#todayLine").textContent =
    `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;

  const soonHw = state.homework
    .filter((h) => daysLeft(h.due) >= 0 && daysLeft(h.due) <= 2)
    .sort((a, b) => a.due.localeCompare(b.due));

  const openPolls = state.polls.filter((p) => !p.closed);

  // 아직 안 끝났고, 일주일 안에 시작하는 일정 (진행 중인 기간 일정 포함)
  const soonEvents = state.events
    .filter((e) => daysLeft(e.endDate || e.date) >= 0 && daysLeft(e.date) <= 7)
    .sort((a, b) => a.date.localeCompare(b.date));

  const pinned = state.notices.filter((n) => n.pinned);

  // 헤드라인 - 제일 급한 걸 형광펜으로
  let headline = "오늘은 특별한 일 없음";
  if (soonHw.length) {
    const h = soonHw[0];
    const when = daysLeft(h.due) === 0 ? "오늘까지" : daysLeft(h.due) === 1 ? "내일까지" : "모레까지";
    headline = `${when} ${h.subject} ${h.title}`;
  } else if (openPolls.length) {
    headline = `${openPolls[0].title} 날짜 정하는 중`;
  } else if (soonEvents.length) {
    const e = soonEvents[0];
    const 진행중 = e.endDate && daysLeft(e.date) <= 0 && daysLeft(e.endDate) >= 0;
    headline = 진행중 ? `${e.title} 기간 중` : `${fmtDate(e.date)}에 ${e.title}`;
  }
  $("#todayHeadline").textContent = headline;

  const parts = [];

  if (pinned.length) {
    parts.push(section("고정된 공지", pinned.map((n) => `
      <article class="card card--pinned">
        <h3 class="card__title">${esc(n.title)}</h3>
        ${n.body ? `<p class="card__body">${esc(n.body)}</p>` : ""}
      </article>`).join("")));
  }

  parts.push(section("곧 마감인 숙제", soonHw.length
    ? soonHw.map((h) => {
        const done = myName && h.doneBy.includes(myName);
        return `
      <article class="card">
        <div class="card__top">
          <h3 class="card__title"><span class="tag tag--sub">${esc(h.subject)}</span> ${esc(h.title)}</h3>
          ${ddayHtml(h.due)}
        </div>
        <p class="card__meta">${fmtDate(h.due)}까지 · ${h.doneBy.length}명 완료</p>
        <div class="card__foot">
          <button class="btn btn--sm ${done ? "" : "btn--ghost"}" data-done-hw="${h.id}" type="button">
            ${done ? "✓ 다 했어요" : "다 했어요"}
          </button>
        </div>
      </article>`;
      }).join("")
    : emptyBox("이틀 안에 마감인 숙제는 없어요.")));

  parts.push(section("투표하는 중", openPolls.length
    ? openPolls.map((p) => {
        const voted = myName && p.votes[myName];
        return `
        <article class="card">
          <div class="card__top">
            <h3 class="card__title">${esc(p.title)}</h3>
            <span class="tag">${Object.keys(p.votes).length}명 참여</span>
          </div>
          <p class="card__meta">${voted ? "내 표는 이미 냈어요" : "아직 투표 안 했어요"}</p>
          <div class="card__foot">
            <button class="btn btn--sm" data-goto-poll="${p.id}" type="button">
              ${voted ? "표 바꾸기" : "투표하러 가기"}
            </button>
          </div>
        </article>`;
      }).join("")
    : emptyBox("진행 중인 투표가 없어요.")));

  parts.push(section("이번 주 일정", soonEvents.length
    ? soonEvents.map((e) => `
      <article class="card">
        <div class="card__top">
          <h3 class="card__title">${esc(e.title)}</h3>
          ${eventDdayHtml(e)}
        </div>
        <p class="card__meta">${fmtEventWhen(e)}${e.place ? ` · ${esc(e.place)}` : ""}</p>
      </article>`).join("")
    : emptyBox("일주일 안에 잡힌 일정이 없어요.")));

  box.innerHTML = parts.join("");
}

function section(label, inner) {
  return `<div><p class="annot">${esc(label)}</p><div class="stack">${inner}</div></div>`;
}

/* ---------- 공지 ---------- */

function renderNotices() {
  const list = [...state.notices].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  $("#noticeList").innerHTML = list.length
    ? list.map((n) => `
      <article class="card ${n.pinned ? "card--pinned" : ""}">
        <div class="card__top">
          <h3 class="card__title">${n.pinned ? "📌 " : ""}${esc(n.title)}</h3>
        </div>
        <p class="card__meta">${esc(n.author)} · ${fmtStamp(n.createdAt)}</p>
        ${n.body ? `<p class="card__body">${esc(n.body)}</p>` : ""}
        <div class="card__foot">
          <button class="link-btn" data-pin-notice="${n.id}" type="button">${n.pinned ? "고정 풀기" : "위에 고정"}</button>
          <button class="link-btn" data-del-notice="${n.id}" type="button">지우기</button>
        </div>
      </article>`).join("")
    : emptyBox("아직 올라온 공지가 없어요. '공지 쓰기'로 첫 공지를 올려 보세요.");
}

/* ---------- 숙제 ---------- */

function renderHomework() {
  const list = [...state.homework].sort((a, b) => a.due.localeCompare(b.due));
  $("#homeworkList").innerHTML = list.length
    ? list.map((h) => {
        const done = myName && h.doneBy.includes(myName);
        return `
        <article class="card">
          <div class="card__top">
            <h3 class="card__title"><span class="tag tag--sub">${esc(h.subject)}</span> ${esc(h.title)}</h3>
            ${ddayHtml(h.due)}
          </div>
          <p class="card__meta">${fmtDate(h.due)}까지${h.author ? ` · ${esc(h.author)} 올림` : ""}${h.doneBy.length ? ` · ${h.doneBy.length}명 완료` : ""}</p>
          ${h.detail ? `<p class="card__body">${esc(h.detail)}</p>` : ""}
          <div class="card__foot">
            <button class="btn btn--sm ${done ? "" : "btn--ghost"}" data-done-hw="${h.id}" type="button">
              ${done ? "✓ 다 했어요" : "다 했어요"}
            </button>
            ${h.doneBy.length ? `<span class="tag tag--done">${esc(h.doneBy.join(", "))}</span>` : ""}
            <button class="link-btn" data-del-hw="${h.id}" type="button">지우기</button>
          </div>
        </article>`;
      }).join("")
    : emptyBox("등록된 숙제가 없어요. '숙제 올리기'로 오늘 숙제를 적어 보세요.");
}

/* ---------- 투표 ---------- */

function renderPolls() {
  $("#pollList").innerHTML = state.polls.length
    ? state.polls.map(renderOnePoll).join("")
    : emptyBox("아직 투표가 없어요. 바베큐 날짜부터 정해 볼까요?");
}

function renderOnePoll(p) {
  // kind가 없는 예전 투표는 전부 날짜 투표
  if (p.kind === "yesno") return renderYesNoPoll(p);
  if (p.kind === "choice") return renderChoicePoll(p);
  return renderDatePoll(p);
}

/* 후보 중 고르기 - 하나만 고를 수 있고, 누가 뭘 골랐는지 보임 */
function renderChoicePoll(p) {
  const counts = {};
  p.options.forEach((o) => (counts[o.id] = 0));
  Object.values(p.votes).forEach((picks) =>
    picks.forEach((id) => { if (counts[id] !== undefined) counts[id]++; })
  );

  const max = Math.max(1, ...Object.values(counts));
  const mine = (myName && p.votes[myName]) || [];
  const myPick = p.options.find((o) => o.id === mine[0]);
  const voters = Object.keys(p.votes);

  const opts = p.options.map((o) => {
    const c = counts[o.id];
    const picked = mine.includes(o.id);
    const won = p.decidedOptionId === o.id;
    const who = voters.filter((v) => p.votes[v].includes(o.id));
    return `
      <button class="poll__opt poll__opt--pick ${picked ? "is-picked" : ""} ${won ? "is-won" : ""}"
              type="button" ${p.closed ? "disabled" : ""}
              data-pick-vote="${p.id}" data-option="${o.id}">
        <span class="poll__bar" style="width:${(c / max) * 100}%"></span>
        <span>
          <span class="poll__date">${esc(o.label)}${picked ? " ✓" : ""}</span>
          ${who.length ? `<br><span class="poll__note">${esc(who.join(", "))}</span>` : ""}
        </span>
        <span class="poll__count">${c}표${won ? " · 당선" : ""}</span>
      </button>`;
  }).join("");

  let verdict = "";
  if (p.closed) {
    const win = p.options.find((o) => o.id === p.decidedOptionId);
    verdict = win
      ? `<p class="poll__verdict">${esc(win.label)} (으)로 정해졌어요</p>`
      : `<p class="poll__verdict">동점이라 결론이 안 났어요</p>`;
  }

  return `
    <article class="card">
      <div class="card__top">
        <h3 class="card__title">${esc(p.title)}</h3>
        <span class="tag tag--sub">후보</span>
        <span class="tag">${p.closed ? "마감됨" : `${voters.length}명 참여`}</span>
      </div>
      ${p.description ? `<p class="card__body">${esc(p.description)}</p>` : ""}
      <div class="poll__opts">${opts}</div>
      ${verdict}
      <div class="card__foot">
        ${p.closed ? "" : `
          <button class="btn btn--sm" data-close-tally="${p.id}" type="button">투표 마감</button>
          <span class="poll__who">${myPick ? `내 표는 ${esc(myPick.label)} · 다시 누르면 바꿀 수 있어요` : "후보 중 하나를 눌러 주세요"}</span>`}
        <button class="link-btn" data-del-poll="${p.id}" type="button">지우기</button>
      </div>
    </article>`;
}

/* 찬반 투표 - 누가 어느 쪽인지는 안 보이고 숫자만 */
function renderYesNoPoll(p) {
  const counts = {};
  p.options.forEach((o) => (counts[o.id] = 0));
  Object.values(p.votes).forEach((picks) =>
    picks.forEach((id) => { if (counts[id] !== undefined) counts[id]++; })
  );

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const mine = (myName && p.votes[myName]) || [];
  const myPick = p.options.find((o) => o.id === mine[0]);

  const sides = p.options.map((o) => {
    const c = counts[o.id];
    const pct = total ? Math.round((c / total) * 100) : 0;
    const picked = mine.includes(o.id);
    const won = p.decidedOptionId === o.id;
    return `
      <button class="yesno ${o.label === "찬성" ? "yesno--yes" : "yesno--no"} ${picked ? "is-picked" : ""} ${won ? "is-won" : ""}"
              type="button" ${p.closed ? "disabled" : ""}
              data-pick-vote="${p.id}" data-option="${o.id}">
        <span class="yesno__bar" style="width:${pct}%"></span>
        <span class="yesno__label">${esc(o.label)}${picked ? " ✓" : ""}</span>
        <span class="yesno__count">${c}표<span class="yesno__pct"> · ${pct}%</span></span>
      </button>`;
  }).join("");

  let verdict = "";
  if (p.closed) {
    const win = p.options.find((o) => o.id === p.decidedOptionId);
    verdict = win
      ? `<p class="poll__verdict">${win.label === "찬성" ? "가결됐어요" : "부결됐어요"} · ${esc(win.label)}이 더 많았어요</p>`
      : `<p class="poll__verdict">동점이라 결론이 안 났어요</p>`;
  }

  return `
    <article class="card">
      <div class="card__top">
        <h3 class="card__title">${esc(p.title)}</h3>
        <span class="tag tag--sub">찬반</span>
        <span class="tag">${p.closed ? "마감됨" : `${Object.keys(p.votes).length}명 참여`}</span>
      </div>
      ${p.description ? `<p class="card__body">${esc(p.description)}</p>` : ""}
      <div class="yesno__row">${sides}</div>
      ${verdict}
      <div class="card__foot">
        ${p.closed ? "" : `
          <button class="btn btn--sm" data-close-tally="${p.id}" type="button">투표 마감</button>
          <span class="poll__who">${myPick ? `내 표는 ${esc(myPick.label)} · 다시 누르면 바꿀 수 있어요` : "찬성이나 반대를 눌러 주세요"}</span>`}
        <button class="link-btn" data-del-poll="${p.id}" type="button">지우기</button>
      </div>
    </article>`;
}

/* 날짜 투표 - 되는 날 여러 개 고르기 */
function renderDatePoll(p) {
  const counts = {};
  p.options.forEach((o) => (counts[o.id] = 0));
  Object.values(p.votes).forEach((picks) =>
    picks.forEach((id) => { if (counts[id] !== undefined) counts[id]++; })
  );

  const max = Math.max(1, ...Object.values(counts));
  const mine = (myName && p.votes[myName]) || [];
  const voters = Object.keys(p.votes);

  const opts = p.options.map((o) => {
    const c = counts[o.id];
    const won = p.decidedOptionId === o.id;
    const who = voters.filter((v) => p.votes[v].includes(o.id));
    return `
      <label class="poll__opt ${mine.includes(o.id) ? "is-picked" : ""} ${won ? "is-won" : ""}">
        <span class="poll__bar" style="width:${(c / max) * 100}%"></span>
        ${p.closed ? "" : `<input class="poll__check" type="checkbox" data-poll="${p.id}" value="${o.id}" ${mine.includes(o.id) ? "checked" : ""} />`}
        <span>
          <span class="poll__date">${fmtWhen(o.date, o.time)}</span>
          ${o.note ? `<br><span class="poll__note">${esc(o.note)}</span>` : ""}
          ${who.length ? `<br><span class="poll__note">${esc(who.join(", "))}</span>` : ""}
        </span>
        <span class="poll__count">${c}표${won ? " · 확정" : ""}</span>
      </label>`;
  }).join("");

  const adminFoot = p.closed ? "" : `
    <div class="card__foot">
      <select class="btn btn--ghost btn--sm" data-decide-select="${p.id}">
        ${p.options.map((o) => `<option value="${o.id}">${fmtWhen(o.date, o.time)}</option>`).join("")}
      </select>
      <button class="btn btn--sm" data-close-poll="${p.id}" type="button">이 날로 확정</button>
      <button class="link-btn" data-del-poll="${p.id}" type="button">지우기</button>
    </div>`;

  return `
    <article class="card">
      <div class="card__top">
        <h3 class="card__title">${esc(p.title)}</h3>
        <span class="tag">${p.closed ? "확정됨" : `${voters.length}명 참여`}</span>
      </div>
      ${p.description ? `<p class="card__body">${esc(p.description)}</p>` : ""}
      <div class="poll__opts">${opts}</div>
      ${p.closed ? "" : `
        <div class="card__foot">
          <button class="btn btn--sm" data-save-vote="${p.id}" type="button">내 표 저장</button>
          <span class="poll__who">${mine.length ? `${mine.length}개 고름` : "되는 날 다 골라도 돼요"}</span>
        </div>`}
      ${adminFoot}
    </article>`;
}

/* ---------- 달력 ---------- */

function renderCalendar() {
  const y = calCursor.getFullYear();
  const m = calCursor.getMonth();
  $("#calMonth").textContent = `${y}년 ${m + 1}월`;

  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay());
  const cells = [];

  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = ymd(d);
    const items = itemsOn(key);
    const chips = items.slice(0, 2).map((it) =>
      `<span class="cal__chip ${it.type === "hw" ? "cal__chip--hw" : ""} ${it.range ? "cal__chip--range" : ""}">${esc(it.label)}</span>`
    ).join("");

    cells.push(`
      <button class="cal__cell
        ${d.getMonth() !== m ? "is-muted" : ""}
        ${key === today() ? "is-today" : ""}
        ${key === selectedDate ? "is-selected" : ""}
        ${d.getDay() === 0 ? "is-sun" : ""} ${d.getDay() === 6 ? "is-sat" : ""}"
        data-date="${key}" type="button">
        <span class="cal__num">${d.getDate()}</span>
        <span class="cal__chips">
          ${chips}
          ${items.length > 2 ? `<span class="cal__more">+${items.length - 2}</span>` : ""}
        </span>
      </button>`);
  }

  $("#calGrid").innerHTML = cells.join("");
  renderDayDetail();
}

/** 그 날에 있는 일정 + 숙제 마감 */
function itemsOn(key) {
  const out = [];
  state.events.filter((e) => eventCovers(e, key))
    .forEach((e) => out.push({ type: "event", label: e.title, data: e, range: !!e.endDate }));
  state.homework.filter((h) => h.due === key)
    .forEach((h) => out.push({ type: "hw", label: `${h.subject} 숙제`, data: h }));
  return out;
}

function renderDayDetail() {
  const box = $("#dayDetail");
  if (!selectedDate) { box.innerHTML = ""; return; }

  const items = itemsOn(selectedDate);
  box.innerHTML = `
    <p class="annot" style="margin-top:20px">${fmtDate(selectedDate)}</p>
    ${items.length ? items.map((it) => it.type === "event" ? `
      <article class="card">
        <div class="card__top">
          <h3 class="card__title">${esc(it.data.title)}</h3>
          ${eventDdayHtml(it.data)}
        </div>
        <p class="card__meta">${fmtEventWhen(it.data)}${it.data.place ? ` · ${esc(it.data.place)}` : ""}</p>
        ${it.data.memo ? `<p class="card__body">${esc(it.data.memo)}</p>` : ""}
        <div class="card__foot">
          <button class="link-btn" data-del-event="${it.data.id}" type="button">지우기</button>
        </div>
      </article>` : `
      <article class="card">
        <div class="card__top">
          <h3 class="card__title"><span class="tag tag--sub">${esc(it.data.subject)}</span> ${esc(it.data.title)}</h3>
          ${ddayHtml(it.data.due)}
        </div>
        <p class="card__meta">숙제 마감</p>
      </article>`).join("")
    : emptyBox("이 날은 아무 일정도 없어요.")}`;
}

/* ---------- 건의함 ---------- */

function renderSuggestions() {
  $("#suggestList").innerHTML = state.suggestions.length
    ? state.suggestions.map((s) => `
      <article class="card">
        <p class="card__body" style="margin-top:0">${esc(s.body)}</p>
        <p class="card__meta">${esc(s.author)} · ${fmtStamp(s.createdAt)}</p>
        ${s.replies.map((r) => `
          <div class="reply">
            <p class="reply__who">${esc(r.author)}의 답</p>
            <p style="margin:2px 0 0">${esc(r.body)}</p>
          </div>`).join("")}
        <div class="card__foot">
          <button class="link-btn" data-reply-sug="${s.id}" type="button">답하기</button>
          <button class="link-btn" data-del-sug="${s.id}" type="button">지우기</button>
        </div>
      </article>`).join("")
    : emptyBox("첫 번째 건의를 남겨 보세요.");
}

/* ------------------------------------------------------------------
 * 탭
 * ---------------------------------------------------------------- */

function goTab(name) {
  activeTab = name;
  $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${name}`));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("#tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (btn) goTab(btn.dataset.tab);
});

/* ------------------------------------------------------------------
 * 이름 / 반장 모드
 * ---------------------------------------------------------------- */

function setName(name) {
  myName = name;
  store.set("classhub:name", name);
  $("#nameValue").textContent = name || "설정하기";
  if (state) render();
}

$("#nameBtn").addEventListener("click", () => {
  $("#nameForm").elements.name.value = myName;
  $("#nameModal").showModal();
});

$("#nameForm").addEventListener("submit", (e) => {
  if (e.submitter && e.submitter.value === "save") {
    const v = $("#nameForm").elements.name.value.trim();
    if (v) setName(v);
  }
});

$("#adminBtn").addEventListener("click", () => {
  if (adminKey) {                       // 이미 반장 모드면 끄기
    adminKey = "";
    document.body.classList.remove("is-admin");
    $("#adminBtn").classList.remove("is-on");
    $("#adminValue").textContent = "학생";
    toast("학생 모드로 돌아왔어요.");
    return;
  }
  $("#adminError").hidden = true;
  $("#adminForm").elements.key.value = "";
  $("#adminModal").showModal();
});

$("#adminForm").addEventListener("submit", async (e) => {
  if (!e.submitter || e.submitter.value !== "save") return;
  const key = $("#adminForm").elements.key.value;
  try {
    const r = await api("POST", "/api/admin/check", { key });
    if (!r.ok) { toast("비밀번호가 달라요."); return; }
    adminKey = key;
    document.body.classList.add("is-admin");
    $("#adminBtn").classList.add("is-on");
    $("#adminValue").textContent = "반장";
    toast("반장 모드로 바꿨어요.");
    render();
  } catch (err) {
    toast(err.message);
  }
});

/* ------------------------------------------------------------------
 * 폼 열고 닫기
 * ---------------------------------------------------------------- */

document.addEventListener("click", (e) => {
  const open = e.target.closest("[data-open-form]");
  if (open) {
    const f = $(`#${open.dataset.openForm}`);
    f.hidden = !f.hidden;
    if (!f.hidden) f.querySelector("input, textarea")?.focus();
  }
  const close = e.target.closest("[data-close-form]");
  if (close) close.closest(".composer").hidden = true;
});

/* ------------------------------------------------------------------
 * 폼 제출
 * ---------------------------------------------------------------- */

$("#noticeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (!myName) { toast("먼저 이름을 설정해 주세요."); $("#nameModal").showModal(); return; }
  act(async () => {
    await api("POST", "/api/notices", {
      title: f.elements.title.value,
      body: f.elements.body.value,
      author: myName,
      pinned: f.elements.pinned.checked,   // 반장이 아니면 서버가 무시함
    });
    f.reset(); f.hidden = true;
  }, "공지를 올렸어요.");
});

$("#homeworkForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (!myName) { toast("먼저 이름을 설정해 주세요."); $("#nameModal").showModal(); return; }
  act(async () => {
    await api("POST", "/api/homework", {
      subject: f.elements.subject.value,
      title: f.elements.title.value,
      detail: f.elements.detail.value,
      due: f.elements.due.value,
      author: myName,
    });
    f.reset(); f.hidden = true;
  }, "숙제를 올렸어요.");
});

$("#eventForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  act(async () => {
    await api("POST", "/api/events", {
      title: f.elements.title.value,
      date: f.elements.date.value,
      endDate: f.elements.endDate.value,
      time: f.elements.time.value,
      place: f.elements.place.value,
    });
    f.reset(); f.hidden = true;
  }, "일정을 추가했어요.");
});

$("#suggestForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  act(async () => {
    await api("POST", "/api/suggestions", {
      body: f.elements.body.value,
      author: myName,
      anonymous: f.elements.anonymous.checked,
    });
    f.elements.body.value = "";
  }, "건의를 보냈어요.");
});

/* ---------- 투표 만들기 폼: 후보 날짜 줄 ---------- */

function addOptionRow(date = "") {
  const row = document.createElement("div");
  row.className = "option-row";
  row.innerHTML = `
    <input type="date" value="${date}" />
    <input type="time" />
    <input type="text" maxlength="60" placeholder="메모 (장소 등)" />
    <button class="link-btn" type="button" data-remove-row>×</button>`;
  $("#optionRows").appendChild(row);
}

/** 고른 종류에 맞춰 폼을 바꿈 (필요 없는 입력칸은 숨김) */
function syncPollKind() {
  const kind = $("#pollForm").elements.kind.value;

  $("#dateOptionsField").hidden = kind !== "date";
  $("#choiceOptionsField").hidden = kind !== "choice";
  $("#yesnoHint").hidden = kind !== "yesno";
  $("#choiceHint").hidden = kind !== "choice";

  const 문구 = {
    date: ["무슨 일정인가요", "예) 반 바베큐 파티",
           "되는 날 다 골라 주세요. 제일 많이 겹치는 날로 정할게요."],
    yesno: ["무엇을 물어볼까요", "예) 체육대회 종목 피구로 바꿀까요?",
            "왜 물어보는지 적어 주면 좋아요."],
    choice: ["무엇을 고르나요", "예) 우리 반 반티 뭐로 할까요?",
             "후보를 아래에 적어 주세요."],
  }[kind];

  $("#pollTitleLabel").textContent = 문구[0];
  $("#pollTitleInput").placeholder = 문구[1];
  $("#pollDescInput").placeholder = 문구[2];
}

/** 후보군 투표의 후보 한 줄 */
function addChoiceRow(value = "") {
  if ($$("#choiceRows .option-row").length >= 10) {
    toast("후보는 10개까지 넣을 수 있어요.");
    return;
  }
  const row = document.createElement("div");
  row.className = "option-row";
  row.innerHTML = `
    <input type="text" maxlength="40" value="${esc(value)}" placeholder="예) 검정 후드티" />
    <button class="link-btn" type="button" data-remove-row>×</button>`;
  $("#choiceRows").appendChild(row);
}

$("#addChoiceBtn").addEventListener("click", () => addChoiceRow());

$("#choiceRows").addEventListener("click", (e) => {
  if (e.target.closest("[data-remove-row]")) e.target.closest(".option-row").remove();
});

$("#pollForm").addEventListener("change", (e) => {
  if (e.target.name === "kind") syncPollKind();
});

$("#addOptionBtn").addEventListener("click", () => addOptionRow());

$("#optionRows").addEventListener("click", (e) => {
  if (e.target.closest("[data-remove-row]")) e.target.closest(".option-row").remove();
});

$("#pollForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const kind = f.elements.kind.value;

  // 찬반은 선택지를 서버가 만들어 주고, 후보군은 적어 준 글자를 그대로 보냄
  let options = [];
  if (kind === "date") {
    options = $$("#optionRows .option-row").map((r) => {
      const [d, t, n] = r.querySelectorAll("input");
      return { date: d.value, time: t.value, note: n.value };
    });
  } else if (kind === "choice") {
    options = $$("#choiceRows .option-row input").map((i) => i.value).filter((v) => v.trim());
  }

  act(async () => {
    await api("POST", "/api/polls", {
      kind,
      title: f.elements.title.value,
      description: f.elements.description.value,
      author: myName,
      options,
    });
    f.reset(); f.hidden = true;
    $("#optionRows").innerHTML = "";
    addOptionRow(); addOptionRow();
    $("#choiceRows").innerHTML = "";
    addChoiceRow(); addChoiceRow();
    syncPollKind();
  }, "투표를 열었어요.");
});

/* ------------------------------------------------------------------
 * 목록 안의 버튼들 (이벤트 위임)
 * ---------------------------------------------------------------- */

document.addEventListener("click", (e) => {
  const t = e.target;

  /* 오늘 탭 → 투표 탭으로 이동 */
  if (t.closest("[data-goto-poll]")) { goTab("poll"); return; }

  /* 공지 */
  const pin = t.closest("[data-pin-notice]");
  if (pin) return act(() => api("PATCH", `/api/notices/${pin.dataset.pinNotice}/pin`));

  const delN = t.closest("[data-del-notice]");
  if (delN && confirm("이 공지를 지울까요?"))
    return act(() => api("DELETE", `/api/notices/${delN.dataset.delNotice}`), "지웠어요.");

  /* 숙제 */
  const doneHw = t.closest("[data-done-hw]");
  if (doneHw) {
    if (!myName) { toast("먼저 이름을 설정해 주세요."); $("#nameModal").showModal(); return; }

    // 체크할 때만 터뜨림 (취소할 땐 조용히)
    const hw = state.homework.find((h) => h.id === doneHw.dataset.doneHw);
    if (hw && !hw.doneBy.includes(myName)) {
      const r = doneHw.getBoundingClientRect();
      fireConfetti(r.left + r.width / 2, r.top + r.height / 2);
    }
    return act(() => api("POST", `/api/homework/${doneHw.dataset.doneHw}/done`, { name: myName }));
  }

  const delH = t.closest("[data-del-hw]");
  if (delH && confirm("이 숙제를 지울까요?"))
    return act(() => api("DELETE", `/api/homework/${delH.dataset.delHw}`), "지웠어요.");

  /* 투표 */
  const saveVote = t.closest("[data-save-vote]");
  if (saveVote) {
    if (!myName) { toast("먼저 이름을 설정해 주세요."); $("#nameModal").showModal(); return; }
    const id = saveVote.dataset.saveVote;
    const picked = $$(`input[data-poll="${id}"]:checked`).map((c) => c.value);
    return act(() => api("POST", `/api/polls/${id}/vote`, { name: myName, optionIds: picked }), "표를 저장했어요.");
  }

  /* 찬반·후보군 - 하나만 고르는 투표. 누르면 바로 저장 */
  const pick = t.closest("[data-pick-vote]");
  if (pick) {
    if (!myName) { toast("이름을 먼저 설정해 주세요."); return; }
    return act(() => api("POST", `/api/polls/${pick.dataset.pickVote}/vote`,
      { name: myName, optionIds: [pick.dataset.option] }), "표를 냈어요.");
  }

  const closeTally = t.closest("[data-close-tally]");
  if (closeTally && confirm("투표를 마감할까요? 표를 제일 많이 받은 쪽으로 결론이 나요."))
    return act(() => api("POST", `/api/polls/${closeTally.dataset.closeTally}/close`), "마감했어요.");

  const closePoll = t.closest("[data-close-poll]");
  if (closePoll) {
    const id = closePoll.dataset.closePoll;
    const sel = $(`[data-decide-select="${id}"]`);
    return act(() => api("POST", `/api/polls/${id}/close`, { optionId: sel.value }), "일정으로 확정했어요. 달력을 확인해 보세요.");
  }

  const delP = t.closest("[data-del-poll]");
  if (delP && confirm("이 투표를 지울까요?"))
    return act(() => api("DELETE", `/api/polls/${delP.dataset.delPoll}`), "지웠어요.");

  /* 달력 */
  const cell = t.closest("[data-date]");
  if (cell) {
    selectedDate = selectedDate === cell.dataset.date ? null : cell.dataset.date;
    renderCalendar();
    return;
  }

  const delE = t.closest("[data-del-event]");
  if (delE && confirm("이 일정을 지울까요?"))
    return act(() => api("DELETE", `/api/events/${delE.dataset.delEvent}`), "지웠어요.");

  /* 건의함 */
  const reply = t.closest("[data-reply-sug]");
  if (reply) {
    const body = prompt("답변을 적어 주세요");
    if (body) return act(() => api("POST", `/api/suggestions/${reply.dataset.replySug}/reply`, { body, author: myName || "반장" }), "답을 남겼어요.");
  }

  const delS = t.closest("[data-del-sug]");
  if (delS && confirm("이 건의를 지울까요?"))
    return act(() => api("DELETE", `/api/suggestions/${delS.dataset.delSug}`), "지웠어요.");
});

/* 달력 월 이동 */
$("#prevMonth").addEventListener("click", () => {
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
  renderCalendar();
});
$("#nextMonth").addEventListener("click", () => {
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
  renderCalendar();
});

/* ------------------------------------------------------------------
 * 시작
 * ---------------------------------------------------------------- */

(function init() {
  setName(store.get("classhub:name"));
  addOptionRow();
  addOptionRow();
  addChoiceRow();
  addChoiceRow();
  syncPollKind();

  if (!configReady) {
    $("#todayBoard").innerHTML = emptyBox(
      "Firebase 설정이 아직 비어 있어요. public/firebase-config.js 를 채워 주세요.",
    );
    return;
  }

  $("#todayBoard").innerHTML = emptyBox("불러오는 중…");

  // 이제부터는 Firestore가 바뀔 때마다 applyState가 자동으로 불림.
  // 다른 애가 공지를 올리면 새로고침 없이 내 화면에도 바로 뜸.
  startRealtime(
    applyState,
    (msg) => {
      toast(msg);
      if (!state) $("#todayBoard").innerHTML = emptyBox(msg);
    },
    // 마감 지난 숙제를 치웠을 때 (조용히 사라지면 놀라니까 알려줌)
    (개수) => toast(`마감 지난 숙제 ${개수}개를 정리했어요.`),
  );

  if (!myName) $("#nameModal").showModal();
})();
