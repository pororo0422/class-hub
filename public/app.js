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

  const soonEvents = state.events
    .filter((e) => daysLeft(e.date) >= 0 && daysLeft(e.date) <= 7)
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
    headline = `${fmtDate(soonEvents[0].date)}에 ${soonEvents[0].title}`;
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
    ? soonHw.map((h) => `
      <article class="card">
        <div class="card__top">
          <h3 class="card__title"><span class="tag tag--sub">${esc(h.subject)}</span> ${esc(h.title)}</h3>
          ${ddayHtml(h.due)}
        </div>
        <p class="card__meta">${fmtDate(h.due)}까지 · ${h.doneBy.length}명 완료</p>
      </article>`).join("")
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
          ${ddayHtml(e.date)}
        </div>
        <p class="card__meta">${fmtWhen(e.date, e.time)}${e.place ? ` · ${esc(e.place)}` : ""}</p>
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
  return p.kind === "yesno" ? renderYesNoPoll(p) : renderDatePoll(p);
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
              data-yes-vote="${p.id}" data-option="${o.id}">
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
          <button class="btn btn--sm" data-close-yesno="${p.id}" type="button">투표 마감</button>
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
      `<span class="cal__chip ${it.type === "hw" ? "cal__chip--hw" : ""}">${esc(it.label)}</span>`
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
  state.events.filter((e) => e.date === key)
    .forEach((e) => out.push({ type: "event", label: e.title, data: e }));
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
          ${ddayHtml(it.data.date)}
        </div>
        <p class="card__meta">${fmtWhen(it.data.date, it.data.time)}${it.data.place ? ` · ${esc(it.data.place)}` : ""}</p>
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

/** 고른 종류에 맞춰 폼을 바꿈 (찬반이면 후보 날짜를 숨김) */
function syncPollKind() {
  const yesno = $("#pollForm").elements.kind.value === "yesno";
  $("#dateOptionsField").hidden = yesno;
  $("#yesnoHint").hidden = !yesno;
  $("#pollTitleLabel").textContent = yesno ? "무엇을 물어볼까요" : "무슨 일정인가요";
  $("#pollTitleInput").placeholder = yesno
    ? "예) 체육대회 종목 피구로 바꿀까요?"
    : "예) 반 바베큐 파티";
  $("#pollDescInput").placeholder = yesno
    ? "왜 물어보는지 적어 주면 좋아요."
    : "되는 날 다 골라 주세요. 제일 많이 겹치는 날로 정할게요.";
}

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

  // 찬반은 선택지를 서버가 만들어 주니까 안 보냄
  const options = kind === "yesno" ? [] : $("#optionRows .option-row").map((r) => {
    const [d, t, n] = r.querySelectorAll("input");
    return { date: d.value, time: t.value, note: n.value };
  });

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

  /* 찬반 투표 - 누르면 바로 저장 */
  const yesVote = t.closest("[data-yes-vote]");
  if (yesVote) {
    if (!myName) { toast("이름을 먼저 설정해 주세요."); return; }
    return act(() => api("POST", `/api/polls/${yesVote.dataset.yesVote}/vote`,
      { name: myName, optionIds: [yesVote.dataset.option] }), "표를 냈어요.");
  }

  const closeYN = t.closest("[data-close-yesno]");
  if (closeYN && confirm("투표를 마감할까요? 표가 더 많은 쪽으로 결론이 나요."))
    return act(() => api("POST", `/api/polls/${closeYN.dataset.closeYesno}/close`), "마감했어요.");

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
  startRealtime(applyState, (msg) => {
    toast(msg);
    if (!state) $("#todayBoard").innerHTML = emptyBox(msg);
  });

  if (!myName) $("#nameModal").showModal();
})();
