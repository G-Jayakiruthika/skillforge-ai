/*
 * main.js - SkillForge AI front end (multi-page).
 * Each feature has its own page (profile.html, analysis.html, career.html, learn.html,
 * progress.html, mentor.html ...) that can be opened in a new tab. Pages share this module:
 * <body data-page="analysis"> tells it what to render. Navigation plays a "portal" transition.
 *
 * Two modes, picked automatically:
 *   server mode : FastAPI backend found (LangGraph agents, optional Gemini)
 *   web mode    : no server (e.g. GitHub Pages) -> the same agents run in the browser (engine.js)
 * Force web mode with ?mode=web
 */
import { createScene, createFallback } from "./scene.js";
import { initCursor, setCursor } from "./cursor.js";
import { scramble, observeReveals, countUp, typewrite, interactions, confetti, sound, tween, reduced } from "./fx.js";
import { createExplainer } from "./explainer.js";
import { renderArena } from "./arena.js";
import { renderWorld } from "./world.js";
import * as PV from "./privacy.js";
import * as theme from "./theme.js";
import { initVoice } from "./voice.js";
import { DOLLS, dollHtml, mountAll, guideForSkill } from "./avatars.js";
import * as P2 from "./pages2.js";
import { stopGame } from "./games.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const pretty = (s) => String(s || "").replace(/_/g, " ");
const PALETTE = ["#3cf0ff", "#ff3ea5", "#ffb547", "#9dff6a", "#8b5cff", "#4dd5a6", "#ff7a59", "#5b8cff"];
const colorFor = (s) => PALETTE[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const PAGE = document.body.dataset.page || "home";
const S = { mode: "server", engine: null, accounts: null, user: null, meta: null, learner: null, learners: [], selected: null, quiz: null, quizSkill: null, scene: null, lastXP: null };

/* ===================== Pages ===================== */
// [id, file, icon, label, feature number, group, hover note]
const PAGES = [
  ["app", "app.html", "◈", "Dashboard", "", "Learn", "Your overview: readiness, mentor message and the six features"],
  ["profile", "profile.html", "◍", "User Profile", "1", "Learn", "Your details, skills, certificates, projects and goals"],
  ["analysis", "analysis.html", "◎", "Skill Analysis", "2", "Learn", "Strengths and weaknesses, for every industry"],
  ["career", "career.html", "🎯", "Career Matching", "3", "Learn", "Compare yourself with job roles and companies"],
  ["learn", "learn.html", "⟟", "Learning Path", "4", "Learn", "Courses, tutorials and exercises in the right order"],
  ["progress", "progress.html", "↗", "Progress", "5", "Learn", "Study hours, test scores and achievements"],
  ["mentor", "mentor.html", "✧", "AI Mentor", "6", "Learn", "Ask questions and get guidance"],
  ["world", "world.html", "🗺", "Skill World", "", "Play", "See where you are as a game map"],
  ["arena", "arena.html", "✪", "Skill Arena", "", "Play", "Quiz missions with lives and combos"],
  ["games", "games.html", "🎮", "Games", "", "Play", "Doll Dash, Bridge Builder and Memory Match"],
  ["compete", "compete.html", "🏆", "Compete", "", "Play", "Leaderboard and head-to-head duels"],
  ["agents", "agents.html", "🤖", "Meet the agents", "", "Play", "The 3D agent and skill-guide dolls"],
  ["colleges", "colleges.html", "🏫", "By college", "", "Community", "Student lists for each college and university"],
  ["places", "places.html", "📍", "By city & state", "", "Community", "Student lists by state, district and city"],
  ["browse", "browse.html", "🔎", "Find students", "", "Community", "Dropdowns to pick a university or college and see its students"],
  ["faculty", "faculty.html", "👩‍🏫", "Faculty", "", "Community", "Contact a faculty member and learn from them"],
  ["portal", "portal.html", "🎓", "Faculty portal", "", "Community", "For faculty: view your students' profiles"],
  ["org", "org.html", "▦", "Organization", "", "Community", "Cohort skill gaps for trainers"],
  ["about", "about.html", "ℹ", "About", "", "More", "What SkillForge AI is and how it protects your data"],
  ["contact", "contact.html", "✉", "Contact", "", "More", "Send us a message"],
  ["consent", "consent.html", "🛡", "Data Consent", "", "More", "Choose what we may use your data for"],
  ["privacy", "privacy.html", "🔐", "Data Privacy", "", "More", "What we keep, download it, or delete it"],
  ["guide", "guide.html", "?", "Guide", "", "More", "How to use everything"],
];
const HIDDEN_PAGES = { signup: "Sign up", login: "Sign in", account: "Account" };
const FEATURES6 = [
  ["profile", "1", "User Profile", "Learner details, existing skills, certifications, projects, dream company and career goal.", "#3cf0ff"],
  ["analysis", "2", "Skill Analysis", "Strengths and weaknesses from your skills and assessments — scored for every industry.", "#8b5cff"],
  ["career", "3", "Career Matching", "Compare your skills with any job role and with companies hiring for it.", "#ffb547"],
  ["learn", "4", "Learning Recommendations", "Courses, tutorials, practice and micro-projects on a prerequisite-ordered roadmap.", "#9dff6a"],
  ["progress", "5", "Progress Tracking", "Learning hours, assessment scores, achievements and readiness over time.", "#ff3ea5"],
  ["mentor", "6", "AI Mentor", "Guidance that updates your plan after every success or struggle — ask it anything.", "#5b8cff"],
];

/* ===================== Chrome (shared layout for app pages) ===================== */
function topbarHtml() {
  return `<header class="topbar" id="topbar">
    <a class="logo" href="index.html" data-cursor="Home"><svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#3cf0ff"/><stop offset="1" stop-color="#ff3ea5"/></linearGradient></defs><path d="M6 24 16 4l10 20-10-6z" fill="url(#lg)"/></svg>
      <span class="logo-text glitch" data-text="SkillForge">SkillForge</span><span class="logo-ai">AI</span></a>
    <nav class="top-links" aria-label="Quick links"><a href="index.html#watch" data-tip="Watch the 1-minute explainer">Watch</a><a href="games.html" data-tip="Play learning games">Games</a><a href="about.html">About</a></nav>
    <div class="top-tools">
      <span class="mode-pill" id="mode-pill">…</span>
      <span id="user-slot"></span>
      <div class="xp-chip" id="xp-chip" data-tip="Your XP and level — earned by passing tests, studying and playing"><span class="lvl" id="xp-lvl">L1</span><span class="xp-bar"><i id="xp-fill"></i></span><span id="xp-num">0 XP</span></div>
      <button class="icon-btn" id="btn-mode" aria-label="Switch between bright and dark mode" data-tip="Switch to bright mode">☀️</button>
      <button class="icon-btn" id="btn-settings" aria-label="Display and accessibility settings" data-tip="Colours, text size, contrast, minimalist style and more">⚙</button>
      <button class="icon-btn" id="btn-sound" aria-label="Toggle sound" data-tip="Turn sound effects on or off">🔈</button>
      <div class="cursor-picker"><button class="icon-btn" id="btn-cursor" aria-label="Choose cursor style" data-tip="Choose a cursor style">✦</button>
        <div class="cursor-menu glass" id="cursor-menu" hidden><div class="menu-title">Cursor style</div>
          <button data-mode="orb">◎ Orbit ring</button><button data-mode="comet">☄ Comet trail</button><button data-mode="neon">〰 Neon ribbon</button><button data-mode="spark">✺ Spark burst</button><button data-mode="system">↖ System default</button></div></div>
    </div></header>`;
}
function injectChrome() {
  const layers = `
  <div id="loader" aria-hidden="true"><div class="loader-core"><span class="loader-pct" id="loader-pct">0</span><span class="loader-unit">%</span></div><div class="loader-label">OPENING ${esc(((PAGES.find((p) => p[0] === PAGE) || [])[3] || HIDDEN_PAGES[PAGE] || "SKILLFORGE").toUpperCase())}</div><div class="loader-bar"><span id="loader-bar"></span></div></div>
  <canvas id="gl" aria-hidden="true"></canvas><div class="grain" aria-hidden="true"></div>
  <canvas id="cursor-canvas" aria-hidden="true"></canvas><div id="cursor-dot" aria-hidden="true"></div><div id="cursor-ring" aria-hidden="true"><span id="cursor-label"></span></div>
  <canvas id="confetti" aria-hidden="true"></canvas>
  <a class="skip-link" href="#main">Skip to content</a>
  ${topbarHtml()}
  <div id="app">
    <aside class="side" id="side">
      <div class="who"><div class="avatar" id="avatar" aria-hidden="true">?</div><div class="who-text"><select id="learner-select" aria-label="Choose learner" data-tip="Switch between learner profiles"></select><span id="who-role" class="muted small"></span></div></div>
      <nav class="side-nav" id="side-nav" aria-label="Pages">${PAGES.map(([id, href, ico, label, num, group, tip], i) => `${i === 0 || PAGES[i - 1][5] !== group ? `<div class="nav-group">${group}</div>` : ""}<a href="${href}" class="${id === PAGE ? "active" : ""}" ${id === PAGE ? 'aria-current="page"' : ""} data-tip="${tip}"><i aria-hidden="true">${ico}</i><span>${label}</span>${num ? `<em class="num" aria-label="feature ${num}">${num}</em>` : ""}<button class="newtab" data-href="${href}" data-tip="Open ${label} in a new tab" aria-label="Open ${label} in a new tab">↗</button></a>`).join("")}</nav>
      <a class="btn ghost small-btn" id="new-learner" href="signup.html" data-tip="Create a free account to get your own profile, roadmap and progress">+ Create my profile</a>
    </aside>
    <main class="stage" id="main" tabindex="-1"><div id="page" class="page-in"></div></main>
  </div>
  <aside class="bus collapsed" id="bus" aria-label="Agent messages"><button class="bus-head" id="bus-toggle" data-tip="Live messages between the 8 AI agents — click to open or close"><span class="pulse-dot"></span><b>Agent bus</b><span class="muted small" id="bus-count">8 agents ready</span><span class="chev">▾</span></button><ol id="bus-list"></ol></aside>`;
  document.body.insertAdjacentHTML("afterbegin", layers);
}
function injectCommon() {
  document.body.insertAdjacentHTML("beforeend", `
  <div class="modal" id="modal" hidden><div class="modal-card glass" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-head"><h3 id="modal-title">Assessment</h3><button class="icon-btn" id="modal-close" aria-label="Close" data-cursor="Close">✕</button></div>
    <div class="seg" id="modal-seg"><button data-mode="quiz" class="active">Quiz</button><button data-mode="explain">Explain it (voice / text)</button></div><div id="modal-body"></div></div></div>
  <div class="modal" id="gmodal" hidden><div class="modal-card glass" role="dialog" aria-modal="true" aria-labelledby="gmodal-title"><div class="modal-head"><h3 id="gmodal-title"></h3><button class="icon-btn" id="gmodal-close" aria-label="Close">✕</button></div><div id="gmodal-body"></div></div></div>
  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div><div id="portal" aria-hidden="true"><span class="portal-text" id="portal-text"></span></div>`);
}

/* ===================== Portal page transitions ===================== */
function portalIn() {
  let from = null; try { from = JSON.parse(sessionStorage.getItem("sf-portal") || "null"); sessionStorage.removeItem("sf-portal"); } catch (_) {}
  const p = $("#portal"); if (!from || reduced || theme.isMinimal() || theme.motionOff()) return;
  p.style.setProperty("--px", from.x + "px"); p.style.setProperty("--py", from.y + "px");
  $("#portal-text").textContent = from.label || "";
  p.classList.add("cover"); requestAnimationFrame(() => requestAnimationFrame(() => { p.classList.remove("cover"); p.classList.add("reveal"); setTimeout(() => p.classList.remove("reveal"), 900); }));
}
function portalTo(href, x, y, label) {
  if (reduced || theme.isMinimal() || theme.motionOff()) { location.href = href; return; }
  const p = $("#portal");
  p.style.setProperty("--px", x + "px"); p.style.setProperty("--py", y + "px"); $("#portal-text").textContent = label || "";
  p.classList.add("go"); sound.play("whoosh"); S.scene?.warp();
  try { sessionStorage.setItem("sf-portal", JSON.stringify({ x, y, label })); } catch (_) {}
  setTimeout(() => (location.href = href), 560);
}
document.addEventListener("click", (e) => {
  const nt = e.target.closest(".newtab"); if (nt) { e.preventDefault(); e.stopPropagation(); window.open(nt.dataset.href, "_blank", "noopener"); return; }
  const a = e.target.closest("a[href]"); if (!a || e.defaultPrevented) return;
  const href = a.getAttribute("href");
  if (a.target === "_blank" || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0 || href.startsWith("#") || /^(https?:|mailto:)/.test(href)) return;
  if (!/\.html(\?|#|$)/.test(href)) return;
  if (href.startsWith("index.html#") && PAGE === "home") return; // same-page anchors on landing
  e.preventDefault();
  portalTo(href, e.clientX, e.clientY, a.textContent.replace(/↗/g, "").trim().slice(0, 40));
});

/* ===================== API (server or in-browser) ===================== */
async function api(path, body) {
  const method = body === undefined ? "GET" : "POST";
  if (S.engine) {
    const [p, qs] = path.split("?"), query = Object.fromEntries(new URLSearchParams(qs || ""));
    busBusy(true); await new Promise((r) => setTimeout(r, method === "POST" ? 240 : 0));
    const [status, res] = await S.accounts.handle(method, "/" + p.replace(/^\//, ""), query, body || {});
    busBusy(false);
    if (status !== 200) throw new Error(res.detail || "Error");
    return JSON.parse(JSON.stringify(res));
  }
  busBusy(true);
  try {
    const res = await fetch(path.replace(/^\//, ""), body === undefined ? { credentials: "same-origin" } : { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || res.statusText);
    return data;
  } finally { busBusy(false); }
}
async function detectMode() {
  if (new URLSearchParams(location.search).get("mode") === "web" || sessionStorage.getItem("sf-web") === "1") return startLocal();
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 2500);
    const h = await (await fetch("api/health", { signal: ctl.signal, cache: "no-store" })).json();
    if (h.status !== "ok") throw 0;
    S.mode = "server"; S.health = h;
  } catch (_) { await startLocal(); }
}
async function startLocal() {
  const [{ createEngine }, { createAccounts }] = await Promise.all([import("./engine.js"), import("./engine-accounts.js")]);
  S.engine = createEngine(); S.accounts = createAccounts(S.engine); S.mode = "web"; S.health = S.engine.svc.health();
  try { sessionStorage.setItem("sf-web", "1"); } catch (_) {}
}
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2800); }

/* ===================== Landing ===================== */
const AGENTS = [
  ["Supervisor", "🛰", "#3cf0ff", "Receives every event — a new profile, a quiz, a goal change — and routes it to the right agent."],
  ["Profiler", "🧬", "#8b5cff", "Turns messy skills like “js”, “tally” or “autocad” into standard skills and scores them from your level, certificates and projects."],
  ["Skill Analyst", "🔬", "#ff3ea5", "Finds strengths, weaknesses and the exact concepts you got wrong — and flags skills that are only self-reported."],
  ["Career Matcher", "🎯", "#ffb547", "Scores you against 14 roles in 9 industries and 30 well-known employers, including your dream company."],
  ["Path Architect", "🗺", "#9dff6a", "Sorts skills by prerequisites into a roadmap, picks your next milestone and builds a weekly plan from your study hours."],
  ["Resource Curator", "📚", "#4dd5a6", "Attaches a course, a tutorial, hands-on practice, a video and a micro-project to every milestone."],
  ["Assessor", "🧪", "#ff7a59", "Grades quizzes, game missions and spoken explanations. Below 60%? It triggers a remedial lab."],
  ["Mentor", "✨", "#5b8cff", "Explains what changed in plain words, lists your next actions, and answers your questions in chat."],
];
function renderLanding() {
  const ids = ["supervisor", "profiler", "analyst", "matcher", "architect", "curator", "assessor", "mentor"];
  $("#agent-grid").innerHTML = AGENTS.map(([n, ico, col, d], i) => `<article class="glass tilt agent-card reveal" style="--ac:${col}" data-doll-hover="${ids[i]}" data-tip="${esc(DOLLS[ids[i]].name)} — the ${n} agent"><span class="idx">0${i + 1}</span>${dollHtml(ids[i], 96)}<h3>${n} <span class="small muted">· ${esc(DOLLS[ids[i]].name)}</span></h3><p>${d}</p></article>`).join("");
  const landDolls = mountAll($("#agent-grid"));
  $$("[data-doll-hover]").forEach((c) => (c.onpointerenter = () => landDolls[c.dataset.dollHover]?.play("wave", 1500)));
  $("#feature-grid").innerHTML = FEATURES6.map(([id, num, title, desc, col]) => `<a class="glass tilt feature-card portal-card reveal" href="${id}.html" style="--ac:${col}" data-cursor="Enter"><span class="num">FEATURE ${num}</span><h3>${title}</h3><p>${desc}</p><span class="enter">Enter →</span><button class="newtab" data-href="${id}.html" title="Open in a new page">↗</button></a>`).join("")
    + `<a class="glass tilt feature-card portal-card reveal" href="world.html" style="--ac:#4dd5a6" data-cursor="Explore"><span class="num">BONUS</span><h3>🗺 Skill World</h3><p>See where you are on your journey as a game map — islands, fog, volcanoes and your dream company's castle.</p><span class="enter">Explore →</span><button class="newtab" data-href="world.html">↗</button></a>
       <a class="glass tilt feature-card portal-card reveal" href="arena.html" style="--ac:#ff7a59" data-cursor="Play"><span class="num">BONUS</span><h3>🎮 Skill Arena</h3><p>Prove skills in timed missions with lives and combos — results count as real assessments.</p><span class="enter">Play →</span><button class="newtab" data-href="arena.html">↗</button></a>`;
  const ind = $("#industry-strip");
  if (ind && S.meta) ind.innerHTML = Object.entries(S.meta.industries).map(([n, v]) => `<div class="ind-pill reveal" style="--ac:${v.color}"><span>${v.icon}</span>${esc(n)}<small>${v.roles.length} role${v.roles.length > 1 ? "s" : ""}</small></div>`).join("");
}

/* ===================== Learner state ===================== */
async function loadLearners() {
  S.learners = await api("api/learners");
  const sel = $("#learner-select"); if (!sel) return;
  // Your own profile first, then your students (faculty), then the fictional demo learners.
  const opt = (l) => `<option value="${esc(l.id)}">${esc(l.name)}${l.mine ? " (you)" : ""}</option>`;
  const mine = S.learners.filter((l) => l.mine), real = S.learners.filter((l) => !l.mine && !l.demo), demo = S.learners.filter((l) => l.demo);
  sel.innerHTML = mine.map(opt).join("") + (real.length ? `<optgroup label="Students">${real.map(opt).join("")}</optgroup>` : "") + (demo.length ? `<optgroup label="Demo learners (sample data)">${demo.map(opt).join("")}</optgroup>` : "");
}
async function selectLearner(id, rerender = true) {
  try {
    const r = await api(`api/learners/${encodeURIComponent(id)}`);
    S.learner = r.learner; S.canEdit = r.can_edit !== false; S.selected = null; S.lastXP = null;
    document.body.classList.toggle("read-only", !S.canEdit);
    try { localStorage.setItem("sf-learner", id); } catch (_) {}
    if ($("#learner-select")) $("#learner-select").value = id;
    updateWho(); updateXP(true); if (rerender) renderPage();
  } catch (e) { if (S.learners[0] && id !== S.learners[0].id) await selectLearner(S.learners[0].id, rerender); }
}
function updateWho() {
  const L = S.learner; if (!L || !$("#avatar")) return;
  $("#avatar").textContent = (L.name || "?").trim()[0].toUpperCase();
  $("#who-role").textContent = `${L.target_role} · ${L.match?.readiness ?? 0}%`;
}
function applyResult(r) {
  S.learner = r.learner; updateWho(); updateXP(); showTrace(r.trace || []);
  if (!S.learners.find((x) => x.id === r.learner.id)) loadLearners().then(() => $("#learner-select") && ($("#learner-select").value = r.learner.id));
  renderPage();
}

/* ===================== XP + achievements ===================== */
function arenaStore(id = S.learner?.id) { try { return JSON.parse(localStorage.getItem("sf-arena-" + id) || "{}"); } catch (_) { return {}; } }
function saveArena(data, game = "arena") {
  // Stars/bests stay in this browser; the points are also sent to the server so they count on the leaderboard.
  const before = arenaStore().xp || 0, gained = Math.max(0, (data.xp || 0) - before);
  try { localStorage.setItem("sf-arena-" + S.learner.id, JSON.stringify(data)); } catch (_) {}
  updateXP();
  if (gained > 0 && S.canEdit) api(`api/learners/${S.learner.id}/game`, { game, points: Math.min(300, gained) }).catch(() => {});
}
function xpOf(L) {
  const a = arenaStore(L.id);
  const fromAssess = (L.assessments || []).reduce((s, x) => s + Math.round(x.score / 5) + (x.passed ? 25 : 0), 0);
  const hours = (L.study_log || []).reduce((s, e) => s + Number(e.hours || 0), 0);
  return Math.round(fromAssess + hours * 5 + (a.xp || 0) + Math.max(0, (L.role_history || []).length - 1) * 10 + 20);
}
const levelOf = (xp) => Math.floor(Math.sqrt(xp / 40)) + 1;
function updateXP(silent) {
  if (!S.learner || !$("#xp-lvl")) return;
  const xp = xpOf(S.learner), lvl = levelOf(xp), lo = 40 * (lvl - 1) ** 2, hi = 40 * lvl ** 2;
  $("#xp-lvl").textContent = "L" + lvl; $("#xp-num").textContent = xp + " XP"; $("#xp-fill").style.width = `${((xp - lo) / (hi - lo)) * 100}%`;
  if (!silent && S.lastXP != null && xp > S.lastXP) {
    const chip = $("#xp-chip"); chip.classList.remove("bump"); void chip.offsetWidth; chip.classList.add("bump");
    if (levelOf(S.lastXP) < lvl) { toast(`Level up! You reached level ${lvl}`); sound.play("level"); confetti(innerWidth - 160, 60, 80); }
  }
  S.lastXP = xp;
}
function achievements(L) {
  const as = L.assessments || [], a = arenaStore(L.id), failed = new Set();
  const comeback = as.some((x) => { if (!x.passed) failed.add(x.skill); return x.passed && failed.has(x.skill); });
  return [
    ["🚀", "First steps", "Created a learner profile", true],
    ["✅", "Verified", "Passed your first assessment", as.some((x) => x.passed)],
    ["🔁", "Comeback kid", "Passed after a remedial lab", comeback],
    ["🎙", "Voice of reason", "Passed a spoken explanation", as.some((x) => x.mode === "explain" && x.passed)],
    ["🧭", "Explorer", "Changed your career goal", (L.role_history || []).length > 1],
    ["⏱", "Grinder", "Logged 5+ study hours", (L.study_log || []).reduce((s, e) => s + Number(e.hours || 0), 0) >= 5],
    ["🌟", "Arena ace", "3 stars in a Skill Arena mission", Object.values(a.stars || {}).some((v) => v >= 3)],
    ["🏰", "Castle in sight", "50%+ ready for your dream company", (L.match?.dream?.readiness || 0) >= 50],
  ];
}
const achHtml = (L) => `<div class="badges-row">${achievements(L).map(([i, n, d, got]) => `<div class="ach ${got ? "got" : ""}"><span class="ai">${i}</span><div><b>${n}</b><span>${d}</span></div></div>`).join("")}</div>`;

/* ===================== Agent bus ===================== */
function busBusy(on) { $("#bus")?.classList.toggle("busy", on); }
function showTrace(trace) {
  if (!trace.length || !$("#bus")) return;
  const list = $("#bus-list"); list.innerHTML = ""; $("#bus").classList.remove("collapsed");
  $("#bus-count").textContent = `${trace.length} messages`;
  trace.forEach((t, i) => setTimeout(() => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="who2">${esc(t.agent)}</span>${t.to ? ` <span class="to">→ ${esc(pretty(t.to))}</span>` : ""}<br>${esc(t.msg)}`;
    list.appendChild(li); list.scrollTop = list.scrollHeight; sound.play("tick");
  }, reduced ? 0 : i * 260));
}

/* ===================== Guide notes ===================== */
const NOTES = {
  app: ["Your career cockpit", ["The tiles show readiness for your goal, skills met, your current milestone and weeks to job-ready.", "Read the AI Mentor message — it changes after every action.", "Open any of the 6 feature pages below. The ↗ button opens a page in a new tab.", "Watch the Agent bus (bottom-right) light up whenever the agents re-plan."], "Tip: switch learners from the name at the top-left. Jane Doe is the sample student from the problem statement; the others come from mechanical, commerce, electronics and pharma."],
  profile: ["Feature 1 · Tell the agents about you", ["Fill your details, degree, college, career goal, dream company and weekly study hours.", "Add skills with a level — shortcuts like “js”, “tally”, “autocad”, “arduino” or “basic HTML” are understood.", "Add certifications and projects: they raise skill scores as evidence.", "Or paste your resume and press “Extract skills”. Then Save & run diagnosis."], "Tip: the table on the right shows exactly how the Profiler scored each skill and why."],
  analysis: ["Feature 2 · Where you're strong, where you're not", ["The radar compares your level (cyan) with what your goal needs (amber).", "Strengths and weaknesses update after every assessment — weak concepts come from the questions you missed.", "“Self-reported” skills aren't proven yet — verify them with a quiz.", "The industry map shows how ready you are for every industry, not just your own."], "Tip: click an industry card to see its best-fit role on the Career page."],
  career: ["Feature 3 · Match roles and companies", ["Pick any role from 9 industries and press “Set as goal” — the agents rebuild your plan.", "See every requirement for the role and your gap for each skill.", "Company cards show how ready you are for employers who commonly hire for this role, what they usually emphasise and their typical process.", "Choose a dream company to get a personal preparation plan."], "Company details are indicative — always confirm on the company's official careers page."],
  learn: ["Feature 4 · Your learning recommendations", ["Milestones are ordered by prerequisites — arrows show what unlocks what.", "Colours: green mastered · cyan active · violet unlocked · dashed locked · red remedial lab.", "Click a milestone for its course, tutorial, practice, video and micro-project.", "Take the assessment or log study hours; the weekly plan updates instantly."], "Tip: “Demo: simulate fail” in the assessment shows the remedial lab appear."],
  world: ["Your journey as a game map", ["Each island is a skill on your roadmap. Your avatar stands where you are now.", "Green flags = conquered skills. Fog = locked until you finish prerequisites. Volcano = remedial lab.", "The golden route shows how far you've sailed; the castle is your dream company or goal.", "Click an island to train or battle it in the Skill Arena."], "Tip: on small screens, scroll the map sideways."],
  arena: ["Test your skills like a game", ["Mission mode: pick a skill planet. 3 lives, 20 seconds per question, combos for streaks.", "Answer by clicking an asteroid or pressing 1–4.", "Missions are saved as real assessments — your roadmap and mentor adapt.", "Blitz mode is 60 seconds of practice across all your skills for XP."], "Tip: turn sound on with 🔈 in the top bar."],
  progress: ["Feature 5 · See how far you've come", ["Readiness over time shows the effect of every action.", "Assessment scores: green passed, red sent you to a remedial lab (dashed line = 60% pass mark).", "Achievements unlock as you learn; XP and level are in the top bar.", "Study hours per skill come from what you log on the Learning Path page."], ""],
  mentor: ["Feature 6 · Ask the AI Mentor", ["Type any question or tap a suggestion.", "Answers use your real plan: active milestone, gaps, hours, ETA.", "The mentor message and next actions change after every success or struggle.", "With a Gemini key on the server version, answers are written by Gemini."], "Tip: try “Am I ready for interviews?”"],
  org: ["For universities & companies", ["Every learner in the organisation at a glance — across all industries.", "The heat map shows which skills most learners lack.", "“Needs attention” lists learners with low readiness, repeated failures or a remedial lab.", "Click a name to open that learner's dashboard."], "Tip: “Reset demo data” restores the 9 sample learners."],
  games: ["Learn by playing", ["Doll Dash: a 3D run — steer your guide into the lane with the right answer (← → or tap).", "Bridge Builder: lay skills in prerequisite order so the doll can cross.", "Memory Match: pair each concept with its meaning.", "Doll Dash is saved as a real assessment; the other two give XP."], "Tip: choose the skill for Doll Dash in the dropdown under the game cards."],
  compete: ["Friendly competition", ["The leaderboard ranks learners by proven progress, not clicks.", "Switch between everyone and only your college.", "Pick an opponent and start a 5-question duel.", "Winning duels earns XP for your level."], "Duel opponents are simulated from their real scores — live matches need a real-time server."],
  agents: ["Who is who", ["The 8 agents run the platform; each has its own 3D doll.", "The 9 skill guides each teach one industry's skills.", "Point at or click a doll to see it wave and hear what it does.", "You will meet your guides again on the Learning Path and in the games."], ""],
  colleges: ["Students by institution", ["Search or filter the list of Tamil Nadu universities and colleges.", "Click an institution to see its students and faculty.", "Cards show public information only: goal, readiness and top skills.", "Full profiles open only for the student, their college's faculty, or an admin."], "More institutions and other states can be added later."],
  places: ["Students by place", ["Open the state, then a district, then a city.", "Click a count to list every student in that district.", "Click a city to list students there.", "Sign in as faculty to open full profiles from your own college."], ""],
  browse: ["Dropdown finder", ["Choose a state, then narrow by district and city.", "Pick a university or college from the last dropdown.", "Optionally filter by career goal or name.", "Results update instantly."], ""],
  faculty: ["Learn from faculty", ["Choose an institution to list its faculty members.", "Press “Ask a question” to send a message.", "Your message is saved and passed to that faculty member.", "Faculty emails are never shown publicly."], "Are you a faculty member? Sign up to appear here."],
  portal: ["For faculty members", ["See every student from your own college in one table.", "“Need help” lists students with low readiness, repeated failures or a remedial lab.", "“Skills to teach next” shows what most students are missing.", "Press View to open a student's full profile."], "Demo faculty logins are on the Sign in page."],
  signup: ["Create an account", ["Choose Student or Faculty member.", "Pick your college from the list (grouped by district).", "Use a password of 8+ characters with a letter and a number.", "Students get a personal profile; faculty get the faculty portal."], ""],
  login: ["Sign in", ["Enter the email and password you signed up with.", "Or tap a demo account to try the faculty portal or admin view.", "Too many wrong attempts pause sign-in for 15 minutes.", "Use ⚙ → Account to change your password later."], ""],
  contact: ["Send a message", ["Fill in your name and email.", "Choose a subject and write at least 10 characters.", "Press Send — the message is stored in the database.", "An admin can read it from their Account page."], ""],
  consent: ["Data Consent — your choices", ["Essential is always on: your sign-in and the display settings you pick.", "Analytics, Marketing and AI processing stay OFF until you switch them on.", "Use Accept all, Reject non-essential, or set each one and press Save preferences.", "Switching one off also deletes whatever it had collected."], "Tip: with AI processing off, your answers are graded by the built-in rules on the server and never leave it."],
  privacy: ["Data Privacy — what we keep", ["The table lists every kind of data we store and why we store it.", "Download my data gives you a JSON file with everything about your account.", "Delete my account & data erases it all permanently, after you type DELETE.", "To stop appearing in college lists without deleting, use the checkbox on your Profile."], "Your password is never stored — only an unreadable hash, and it is never included in the download."],
  guide: ["How to use SkillForge AI", ["Start on the Dashboard with the sample learner, or create your own profile.", "Follow the 6 feature pages in order: Profile → Analysis → Career → Learning → Progress → Mentor.", "Prove skills in the Skill Arena and see your position on the Skill World map.", "Change your goal anytime — nothing you mastered is lost."], ""],
};
function note(tab) {
  const [title, steps, tip] = NOTES[tab]; let collapsed = false;
  try { collapsed = localStorage.getItem("sf-note-" + tab) === "0"; } catch (_) {}
  return `<div class="note ${collapsed ? "collapsed" : ""}" data-note="${tab}"><div class="note-ico">📘</div><div><h4>How to use this page — ${title}</h4><ol>${steps.map((s) => `<li>${s}</li>`).join("")}</ol>${tip ? `<div class="tip">${tip}</div>` : ""}</div><button class="note-toggle" data-cursor="Toggle">${collapsed ? "show ▾" : "hide ▴"}</button></div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(".note-toggle"); if (!b) return;
  const n = b.closest(".note"); n.classList.toggle("collapsed"); const c = n.classList.contains("collapsed");
  b.textContent = c ? "show ▾" : "hide ▴"; try { localStorage.setItem("sf-note-" + n.dataset.note, c ? "0" : "1"); } catch (_) {}
});
const head = (title, sub, extra = "") => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${extra}</div>`;

/* ===================== Page rendering ===================== */
function renderPage() {
  const el = $("#page"); if (!el) return;
  stopGame();
  const c = pageCtx(), w = (fn) => (el) => fn(el, c);
  const fns = { app: pDashboard, profile: pProfile, analysis: pAnalysis, career: pCareer, learn: pLearn, world: pWorld, arena: pArena, progress: pProgress, mentor: pMentor, org: pOrg, guide: pGuide,
    signup: w(P2.pSignup), login: w(P2.pLogin), account: w(P2.pAccount), colleges: w(P2.pColleges), places: w(P2.pPlaces), browse: w(P2.pBrowse), faculty: w(P2.pFaculty), portal: w(P2.pPortal),
    compete: w(P2.pCompete), agents: w(P2.pAgents), games: w(P2.pGames), about: w(P2.pAbout), contact: w(P2.pContact),
    consent: w(PV.pConsent), privacy: w(PV.pPrivacy) };
  const needsLearner = ["app", "analysis", "career", "learn", "world", "arena", "progress", "mentor", "games", "compete"].includes(PAGE);
  if (needsLearner && !S.learner) { el.innerHTML = note(PAGE) + `<div class="card"><h3>No learner yet</h3><p class="muted">Create a profile to start.</p><a class="btn primary" href="profile.html?new=1">Create profile</a></div>`; return; }
  const out = (fns[PAGE] || pDashboard)(el);
  if (needsLearner || PAGE === "profile") Promise.resolve(out).then(() => {
    if (S.learner && S.canEdit === false && !el.querySelector(".ro-banner")) el.querySelector(".page-head")?.insertAdjacentHTML("afterend", `<div class="demo-banner ro-banner" role="note">👁 <b>View only.</b> You are looking at ${esc(S.learner.name)}'s profile as ${esc(S.user?.role || "a guest")}. Only the student can change it.</div>`);
    else if (S.learner?.demo && !el.querySelector(".ro-banner") && PAGE === "app") el.querySelector(".page-head")?.insertAdjacentHTML("afterend", `<div class="demo-banner ro-banner" role="note">🧪 <b>${esc(S.learner.name)} is a sample learner</b> — fictional data anyone can try things on. <a href="signup.html">Create a free account</a> to get your own private profile.</div>`);
  });
  Promise.resolve(out).then(() => { animate(el); mountAll(el); el.querySelectorAll("[data-scramble]").forEach((x) => scramble(x, undefined, 700)); });
}
function animate(root) {
  root.querySelectorAll("[data-count]").forEach((x) => countUp(x, +x.dataset.count, 1100, x.dataset.suffix || ""));
  requestAnimationFrame(() => root.querySelectorAll(".meter > span[data-w]").forEach((m) => (m.style.width = m.dataset.w + "%")));
}
/* Forms rendered inside the modal overlay do not trigger implicit submission in every browser,
   so wire the submit button's click as well as the form's submit event. */
function onSubmit(form, handler) {
  if (!form) return;
  const run = (e) => { if (e && e.preventDefault) e.preventDefault(); return handler(e); };
  form.onsubmit = run;
  const btn = form.querySelector("button[type=submit]");
  if (btn) btn.onclick = run;
}
function gmodal(title, html) { $("#gmodal-title").innerHTML = title; $("#gmodal-body").innerHTML = html; $("#gmodal").hidden = false; $("#gmodal-close").focus(); }
function pageCtx() {
  return { S, api, esc, head, note, toast, sound, confetti, meter, ring, animate, modal: gmodal, runAssess, store: arenaStore, saveStore: saveArena,
    go: (href, label) => portalTo(href, innerWidth / 2, innerHeight / 2, label), speak: (t) => S.voice?.say(t),
    closeModal: () => ($("#gmodal").hidden = true), track: PV.track, onSubmit };
}
function renderUser() {
  const slot = $("#user-slot"); if (!slot) return; const u = S.user;
  slot.innerHTML = u ? `<a class="user-chip" href="account.html" data-tip="Your account — ${esc(u.role)}${u.institution ? " at " + esc(u.institution) : ""}"><span class="ua">${esc((u.name || "?")[0].toUpperCase())}</span>${esc(u.name.split(" ")[0])} <small>${esc(u.role)}</small></a>`
    : `<a class="btn ghost sm" href="login.html" data-tip="Sign in to your account">Sign in</a> <a class="btn primary sm" href="signup.html" data-tip="Create a student or faculty account">Sign up</a>`;
  const nl = $("#new-learner");
  if (nl && u) {
    if (u.role === "student") { nl.href = "profile.html"; nl.textContent = "✎ Edit my profile"; nl.dataset.tip = "Update your skills, certificates, projects and goal"; }
    else if (u.role === "admin" && !u.demo) { nl.href = "profile.html?new=1"; nl.textContent = "+ New learner"; nl.dataset.tip = "Admins can add learner profiles"; }
    else { nl.href = "portal.html"; nl.textContent = "🏫 My students"; nl.dataset.tip = "Open the faculty portal"; }
  }
}
const statusBadge = (s) => ({ met: "ok", partial: "warn", missing: "bad" }[s] || "");
const confBadge = (c) => ({ verified: "ok", evidence: "brand" }[c] || "");
const meter = (v, color, mark) => `<div class="meter"><span data-w="${Math.max(0, Math.min(100, v))}" style="${color ? `background:${color}` : ""}"></span>${mark != null ? `<i style="left:${mark}%"></i>` : ""}</div>`;
const ring = (pct, color = "#3cf0ff", size = 74) => { const r = size / 2 - 6, c = 2 * Math.PI * r; return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="rgba(255,255,255,.08)" stroke-width="6" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" style="--to:${c * (1 - pct / 100)}" class="ring-arc"/><text x="50%" y="54%" text-anchor="middle" font-size="${size / 4.6}" font-weight="700" fill="#eef1ff">${pct}%</text></svg>`; };
const roleOptions = (selected) => Object.entries(S.meta.industries).map(([ind, v]) => `<optgroup label="${v.icon} ${esc(ind)}">${v.roles.map((r) => `<option ${r === selected ? "selected" : ""}>${esc(r)}</option>`).join("")}</optgroup>`).join("");
const companyOptions = (selected) => `<option value="">— none —</option>` + [...new Set(S.meta.companies.map((c) => c.type))].map((t) => `<optgroup label="${esc(t)}">${S.meta.companies.filter((c) => c.type === t).map((c) => `<option ${c.name === selected ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</optgroup>`).join("");
const jobsLink = (company, role) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(`${role} ${company}`)}`;

/* ----- Dashboard ----- */
function pDashboard(el) {
  const L = S.learner, m = L.match || {}, rm = L.roadmap || {}, mentor = L.mentor || {}, rem = Object.keys(L.remedial || {}), d = m.dream;
  el.innerHTML = `
  ${head(`Hi ${esc((L.name || "").split(" ")[0])} <span class="grad">— ${esc(m.role)}</span>`, `${esc(m.industry || "")} · ${esc(m.description)}`, `<a class="btn ghost sm" href="index.html#watch" data-cursor="Play">▶ Watch explainer</a>`)}
  ${note("app")}
  <div class="grid g4">
    <div class="card stat stat-glow"><div class="label">Readiness</div><div class="value"><span data-count="${m.readiness || 0}" data-suffix="%">0</span></div>${meter(m.readiness || 0)}</div>
    <div class="card stat"><div class="label">Skills met</div><div class="value"><span data-count="${(m.matched || []).length}">0</span><span class="muted"> / ${(m.skills || []).length}</span></div><div class="small muted">${(m.partial || []).length} partial · ${(m.missing || []).length} missing</div></div>
    <div class="card stat"><div class="label">Current milestone</div><div class="value sm">${esc(rm.active || "All mastered 🎉")}</div>${rem.length ? `<span class="badge bad">⚠ remedial lab active</span>` : `<span class="badge brand">start here</span>`}</div>
    <div class="card stat"><div class="label">${d ? "Dream company" : "Job-ready in"}</div>${d ? `<div class="value sm">${esc(d.company)}</div><div class="small">${d.readiness}% ready as ${esc(d.role)}</div>` : `<div class="value"><span data-count="${rm.eta_weeks || 0}">0</span><span class="muted" style="font-size:18px"> weeks</span></div>`}</div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="mentor"><div id="mentor-orb" data-tip="${esc(DOLLS.mentor.name)}, your mentor agent">${dollHtml("mentor", 72, 'data-mood="talk"')}</div><div>
      <h3>AI Mentor <span class="small muted">· ${esc(DOLLS.mentor.name)}</span> <span class="badge brand">${esc(mentor.source || "")}</span></h3><div class="mentor-msg" id="mentor-msg" aria-live="polite"></div>
      <ol class="next-list">${(mentor.next_actions || []).map((a, i) => `<li><b>0${i + 1}</b>${esc(a)}</li>`).join("")}</ol>
      <div class="row" style="margin-top:14px">${rm.active ? `<button class="btn primary sm" data-assess="${esc(rm.active)}" data-cursor="Test">Assess ${esc(rm.active)}</button><a class="btn ghost sm" href="arena.html">🎮 Arena</a>` : ""}<a class="btn ghost sm" href="world.html">🗺 Where am I?</a></div>
    </div></div></div>
    <div class="card"><h3>Skill gap radar <span class="muted small">current vs required</span></h3><div id="radar"></div><div class="legend"><span><i style="background:#3cf0ff"></i>Current</span><span><i style="background:#ffb547"></i>Required</span></div></div>
  </div>
  <h2 class="section-title">The six features <span class="muted small">— each opens as its own page (↗ = new tab)</span></h2>
  <div class="portal-grid">${FEATURES6.map(([id, num, title, desc, col]) => `<a class="glass tilt feature-card portal-card" href="${id}.html" style="--ac:${col}" data-cursor="Enter"><span class="num">FEATURE ${num}</span><h3>${title}</h3><p>${desc}</p><span class="enter">Enter →</span><button class="newtab" data-href="${id}.html" title="Open in a new page">↗</button></a>`).join("")}</div>
  <div class="card" style="margin-top:16px"><h3>🏅 Achievements</h3>${achHtml(L)}</div>`;
  radar($("#radar"), m.skills || []);
  const md = mountAll($("#mentor-orb")).mentor; typewrite($("#mentor-msg"), mentor.message || "", 12, () => md?.set("idle"));
}
function radar(host, rows) {
  if (!rows.length) return;
  const W = 380, cx = W / 2, cy = 175, R = 125, n = rows.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [cx + Math.cos(a) * R * v / 100, cy + Math.sin(a) * R * v / 100]; };
  let g = "";
  [25, 50, 75, 100].forEach((v) => (g += `<polygon points="${rows.map((_, i) => pt(i, v).join(",")).join(" ")}" fill="none" stroke="rgba(160,170,255,.14)"/>`));
  rows.forEach((r, i) => { const [x, y] = pt(i, 100), [lx, ly] = pt(i, 121); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(160,170,255,.14)"/><text x="${lx}" y="${ly}" font-size="11.5" text-anchor="middle" dominant-baseline="middle" fill="${r.status === "missing" ? "#ff4d5e" : "#c6cbea"}">${esc(r.skill)}</text>`; });
  host.innerHTML = `<svg viewBox="0 0 ${W} 350" width="100%" role="img" aria-label="Skill radar">${g}<polygon id="rq" fill="rgba(255,181,71,.10)" stroke="#ffb547" stroke-dasharray="5 4" stroke-width="2"/><polygon id="rc" fill="rgba(60,240,255,.22)" stroke="#3cf0ff" stroke-width="2.5" style="filter:drop-shadow(0 0 8px #3cf0ff)"/></svg>`;
  const rq = $("#rq", host), rc = $("#rc", host);
  tween(1300, (p) => {
    rq.setAttribute("points", rows.map((r, i) => pt(i, r.required * p).join(",")).join(" "));
    rc.setAttribute("points", rows.map((r, i) => pt(i, Math.max(4, r.current) * Math.max(0, p * 1.15 - .15)).join(",")).join(" "));
  });
}

/* ----- 1. Profile ----- */
function pProfile(el) {
  const isNew = new URLSearchParams(location.search).get("new") === "1";
  const L = (!isNew && S.learner) || { skills: [], certifications: [], projects: [] };
  const levels = ["beginner", "intermediate", "advanced", "expert"];
  const skillItem = (s = {}) => `<div class="item"><input placeholder="e.g. Python, tally, autocad, basic HTML" value="${esc(s.name)}" data-k="name"><select data-k="level">${levels.map((l) => `<option ${l === (s.level || "intermediate") ? "selected" : ""}>${l}</option>`).join("")}</select><button class="x-btn" title="Remove" data-rm>✕</button></div>`;
  const certItem = (c = {}) => `<div class="item two"><input placeholder="Certification name" value="${esc(c.name)}" data-k="name"><input placeholder="Issuer (optional)" value="${esc(c.issuer)}" data-k="issuer"><button class="x-btn" data-rm>✕</button></div>`;
  const projItem = (p = {}) => `<div class="item two"><input placeholder="Project title" value="${esc(p.name)}" data-k="name"><input placeholder="What it does + tools used" value="${esc(p.description)}" data-k="description"><button class="x-btn" data-rm>✕</button></div>`;
  S.tpl = { skillItem, certItem, projItem };
  el.innerHTML = `
  ${head(L.id ? `Profile <span class="grad">· ${esc(L.name)}</span>` : "Create your profile", "Feature 1 — the Profiler agent reads everything here")}
  ${note("profile")}
  <div class="grid g2">
    <div class="card">
      <div class="row"><div class="field grow"><label class="lbl">Full name</label><input id="p-name" value="${esc(L.name)}"></div><div class="field grow"><label class="lbl">Email</label><input id="p-email" value="${esc(L.email)}"></div></div>
      <div class="row"><div class="field grow"><label class="lbl">Degree / course</label><input id="p-edu" value="${esc(L.education)}" placeholder="e.g. MCA, B.E. Mechanical, B.Com"></div><div class="field grow"><label class="lbl" for="p-inst">College / university</label><select id="p-inst" data-tip="Choose your institution — it places you in the college and city lists"><option value="">— choose —</option>${S.meta.institutions.map((i) => `<option value="${esc(i.id)}" ${i.id === L.institution_id ? "selected" : ""}>${esc(i.name)}${i.city ? " — " + esc(i.city) : ""}</option>`).join("")}</select></div></div>
      <div class="row"><div class="field grow"><label class="lbl">Career goal (any industry)</label><select id="p-role">${roleOptions(L.target_role || "Full Stack Developer")}</select></div><div class="field" style="width:140px"><label class="lbl">Hours / week</label><input id="p-hours" type="number" min="1" max="60" value="${esc(L.hours_per_week || 8)}"></div></div>
      <div class="row"><div class="field grow"><label class="lbl">Dream company</label><select id="p-dream">${companyOptions(L.dream_company)}</select></div><div class="field grow"><label class="lbl">Interests</label><input id="p-int" value="${esc(L.interests)}" placeholder="e.g. automobiles, analytics"></div></div>
      <label class="check" data-tip="When on, your name, college, goal and readiness appear in college lists and the leaderboard. Your email, skills detail and test history are never shown."><input type="checkbox" id="p-listed" ${L.listed === false ? "" : "checked"}> Show me in college lists and the leaderboard</label>
      <label class="lbl">Existing skills</label><div class="list-edit" id="p-skills">${(L.skills || []).map(skillItem).join("")}</div><button class="btn ghost sm" data-add="p-skills:skillItem">+ Add skill</button>
      <label class="lbl" style="margin-top:16px">Certifications</label><div class="list-edit" id="p-certs">${(L.certifications || []).map(certItem).join("")}</div><button class="btn ghost sm" data-add="p-certs:certItem">+ Add certification</button>
      <label class="lbl" style="margin-top:16px">Projects</label><div class="list-edit" id="p-projs">${(L.projects || []).map(projItem).join("")}</div><button class="btn ghost sm" data-add="p-projs:projItem">+ Add project</button>
      <div class="row" style="margin-top:20px"><button class="btn primary" id="btn-save" data-cursor="Save">Save &amp; run diagnosis</button><button class="btn ghost sm" id="btn-sample">Fill sample scenario</button></div>
    </div>
    <div>
      <div class="card"><h3>📄 Import from resume / LinkedIn</h3><p class="small muted">Paste resume text — the Profiler finds skills from any industry and maps them to the taxonomy.</p>
        <textarea id="p-resume" rows="7" placeholder="e.g. B.E. Mechanical. Skills: AutoCAD, SolidWorks, CNC, MS Excel. Project: go-kart chassis..."></textarea>
        <button class="btn ghost sm" style="margin-top:10px" id="btn-extract">✨ Extract skills</button><div id="p-extract" class="small" style="margin-top:8px"></div></div>
      ${L.id ? `<div class="card" style="margin-top:16px"><h3>🧬 How the Profiler scored you</h3><div style="overflow-x:auto"><table><tr><th>Skill</th><th>Score</th><th>Confidence</th><th>Evidence</th></tr>
        ${Object.entries(L.proficiency || {}).sort((a, b) => b[1].score - a[1].score).map(([k, p]) => `<tr><td><b>${esc(k)}</b><div class="small muted">${esc(p.esco)}</div></td><td>${p.score}</td><td><span class="badge ${confBadge(p.confidence)}">${esc(p.confidence)}</span></td><td class="small">${p.sources.map(esc).join("<br>") || "assessment"}</td></tr>`).join("")}</table></div>
        ${(L.unmapped_skills || []).length ? `<p class="small muted">Not in taxonomy yet: ${L.unmapped_skills.map(esc).join(", ")}</p>` : ""}</div>` : ""}
    </div></div>`;
  if (!(L.skills || []).length) addItem("p-skills", "skillItem");
  $("#btn-save").onclick = () => saveProfile(L.id); $("#btn-sample").onclick = loadSample; $("#btn-extract").onclick = extractResume;
}
function addItem(id, tpl, data) { $("#" + id).insertAdjacentHTML("beforeend", S.tpl[tpl](data || {})); }
document.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]"); if (add) { const [id, tpl] = add.dataset.add.split(":"); addItem(id, tpl); }
  const rm = e.target.closest("[data-rm]"); if (rm) rm.parentElement.remove();
  const as = e.target.closest("[data-assess]"); if (as) openAssess(as.dataset.assess);
});
const readList = (id) => $$(`#${id} .item`).map((row) => { const o = {}; $$("[data-k]", row).forEach((i) => (o[i.dataset.k] = i.value.trim())); return o; }).filter((o) => o.name);
async function saveProfile(id) {
  const body = { id, name: $("#p-name").value.trim(), email: $("#p-email").value.trim(), education: $("#p-edu").value.trim(), institution_id: $("#p-inst").value,
    hours_per_week: Number($("#p-hours").value) || 8, target_role: $("#p-role").value, dream_company: $("#p-dream").value, interests: $("#p-int").value.trim(),
    listed: $("#p-listed") ? $("#p-listed").checked : true, skills: readList("p-skills"), certifications: readList("p-certs"), projects: readList("p-projs") };
  if (!body.name) return toast("Please enter a name");
  try {
    const r = await api("api/learners", body); await loadLearners();
    try { localStorage.setItem("sf-learner", r.learner.id); } catch (_) {}
    S.learner = r.learner; showTrace(r.trace); toast("Diagnosis complete ✨"); sound.play("good"); S.scene?.pulse("warp");
    setTimeout(() => portalTo("analysis.html", innerWidth / 2, innerHeight / 2, "Skill Analysis"), 1400);
  } catch (e) { toast(e.message); }
}
function loadSample() {
  $("#p-name").value = $("#p-name").value || "Sample Student"; $("#p-role").value = "Full Stack Developer"; $("#p-hours").value = 8;
  $("#p-skills").innerHTML = ""; [{ name: "Python", level: "intermediate" }, { name: "SQL", level: "intermediate" }, { name: "basic HTML", level: "beginner" }].forEach((s) => addItem("p-skills", "skillItem", s));
}
async function extractResume() {
  const text = $("#p-resume").value; if (!text.trim()) return toast("Paste some text first");
  const r = await api("api/resume/extract", { text });
  const have = new Set(readList("p-skills").map((s) => s.name.toLowerCase())); let added = 0;
  (r.skills || []).forEach((s) => { if (!have.has(String(s.name).toLowerCase())) { addItem("p-skills", "skillItem", s); added++; } });
  (r.certifications || []).forEach((c) => addItem("p-certs", "certItem", c)); (r.projects || []).forEach((p) => addItem("p-projs", "projItem", p));
  $("#p-extract").innerHTML = `Found <b>${r.skills.length}</b> skills via ${esc(r.extractor)}: ${r.skills.map((s) => `<span class="badge brand">${esc(s.name)}</span>`).join("") || "none"} — ${added} added. Review levels, then save.`;
  sound.play("good");
}

/* ----- 2. Skill Analysis ----- */
function pAnalysis(el) {
  const L = S.learner, m = L.match || {}, an = L.analysis || {};
  el.innerHTML = `
  ${head(`Skill Analysis <span class="grad">· ${esc(L.name)}</span>`, "Feature 2 — strengths & weaknesses from your skills and assessments")}
  ${note("analysis")}
  <div class="grid g2">
    <div class="card"><h3>🎯 Gap radar — ${esc(m.role)}</h3><div id="radar"></div><div class="legend"><span><i style="background:#3cf0ff"></i>Current</span><span><i style="background:#ffb547"></i>Required</span></div></div>
    <div class="card"><h3>💪 Strengths</h3>${(an.strengths || []).map((s) => `<div class="skill-line"><b>${esc(s.skill)}</b>${meter(s.score, "linear-gradient(90deg,#9dff6a,#3cf0ff)")}<span class="badge ${confBadge(s.confidence)}">${s.score} ${esc(s.confidence)}</span></div>`).join("") || '<p class="muted">None yet — verify a skill in the Skill Arena.</p>'}
      <h3 style="margin-top:18px">🔧 Weaknesses to fix</h3>${(an.weaknesses || []).map((w) => `<div class="skill-line"><b>${esc(w.skill)}</b>${meter(w.score, "linear-gradient(90deg,#ffb547,#ff3ea5)", w.required)}<span class="badge warn">${w.score}/${w.required}</span></div>${w.missed_concepts.length ? `<div class="small muted" style="margin:-4px 0 6px">weak concepts: ${w.missed_concepts.map(pretty).map(esc).join(", ")}</div>` : ""}`).join("") || '<p class="muted">Nothing partial right now.</p>'}
      ${(m.missing || []).length ? `<p class="small" style="margin-top:12px">Not started yet: ${m.missing.map((s) => `<span class="badge bad">${esc(s)}</span>`).join("")}</p>` : ""}
      ${(an.unverified || []).length ? `<p class="small muted">Self-reported — prove it: ${an.unverified.map((s) => `<button class="chip" data-assess="${esc(s)}">${esc(s)} ▸ quiz</button>`).join(" ")}</p>` : ""}</div>
  </div>
  <h2 class="section-title">🌍 Industry readiness map <span class="muted small">— your skills analysed for every industry</span></h2>
  <div class="industry-grid">${(m.industry_ranking || []).map((x, i) => `<a class="glass tilt ind-card" href="career.html?role=${encodeURIComponent(x.role)}" style="--ac:${x.color};animation-delay:${i * 60}ms" data-cursor="Match">
      <div class="ind-top"><span class="ind-ico">${x.icon}</span>${ring(x.readiness, x.color, 70)}</div><h3>${esc(x.industry)}</h3><p class="small muted">Best fit: <b>${esc(x.role)}</b></p>${x.industry === m.industry ? '<span class="badge brand">your industry</span>' : ""}</a>`).join("")}</div>
  <div class="card" style="margin-top:16px"><h3>🧬 Proficiency detail</h3><div style="overflow-x:auto"><table><tr><th>Skill</th><th>Level</th><th>Confidence</th><th>Why</th></tr>
    ${Object.entries(L.proficiency || {}).sort((a, b) => b[1].score - a[1].score).map(([k, p]) => `<tr><td><b>${esc(k)}</b></td><td style="min-width:140px">${meter(p.score)}<span class="small">${p.score}/100</span></td><td><span class="badge ${confBadge(p.confidence)}">${esc(p.confidence)}</span></td><td class="small">${p.sources.map(esc).join(" · ") || "assessment"}</td></tr>`).join("")}</table></div></div>`;
  radar($("#radar"), m.skills || []);
}

/* ----- 3. Career Matching ----- */
function pCareer(el) {
  const L = S.learner, m = L.match || {}, preview = new URLSearchParams(location.search).get("role");
  el.innerHTML = `
  ${head(`Career Matching <span class="grad">· ${esc(m.role)}</span>`, "Feature 3 — compare your skills with roles and companies")}
  ${note("career")}
  <div class="grid g2">
    <div class="card"><h3>🔁 Choose a role (9 industries)</h3>
      <div class="row"><select id="pivot-role" class="grow">${roleOptions(preview || m.role)}</select><button class="btn primary sm" id="btn-pivot" data-cursor="Pivot">Set as goal</button></div>
      <p class="small muted" style="margin-top:8px">Changing your goal keeps everything you have mastered — the agents re-plan in seconds.</p>
      <h3 style="margin-top:16px">Your match for every role</h3>
      <div class="role-rank">${(m.role_ranking || []).map((r) => `<div class="skill-line" style="grid-template-columns:1fr 100px 46px"><span>${esc(r.role)} ${r.role === m.role ? '<span class="badge brand">goal</span>' : ""}</span>${meter(r.readiness)}<b>${r.readiness}%</b></div>`).join("")}</div></div>
    <div class="card"><h3>📋 Requirements — ${esc(m.role)}</h3><p class="small muted">${esc(m.description)}</p><div style="overflow-x:auto"><table><tr><th>Skill</th><th>Need</th><th>You</th><th>Gap</th><th>Status</th></tr>
      ${(m.skills || []).map((s) => `<tr><td><b>${esc(s.skill)}</b></td><td>${s.required}</td><td>${s.current}</td><td>${s.gap}</td><td><span class="badge ${statusBadge(s.status)}">${s.status}</span></td></tr>`).join("")}</table></div>
      <div style="margin-top:12px">${ring(m.readiness || 0, "#3cf0ff", 96)}</div></div>
  </div>
  ${dreamCard(m)}
  <h2 class="section-title">🏢 Companies hiring for ${esc(m.role)} <span class="muted small">— sorted by your fit</span></h2>
  <div class="company-grid">${(m.companies_for_role || []).map(companyCard).join("") || `<p class="muted">No companies in the catalogue for this role yet.</p>`}</div>
  <h2 class="section-title">⭐ Your best company matches across all roles</h2>
  <div class="company-grid">${(m.company_top || []).map(companyCard).join("")}</div>
  <p class="small muted" style="margin-top:12px">ⓘ ${esc(S.meta.company_note)}</p>`;
  $("#btn-pivot").onclick = pivot;
  $("#btn-dream").onclick = async () => {
    const dc = $("#dream-pick").value;
    try { applyResult(await api("api/learners", { ...S.learner, dream_company: dc })); toast(dc ? `Dream company: ${dc}` : "Dream company cleared"); sound.play("good"); } catch (e) { toast(e.message); }
  };
}
function companyCard(c) {
  return `<div class="glass tilt company-card"><div class="cc-top"><div class="logo-mark" style="--ac:${colorFor(c.company)}">${esc(c.company.slice(0, 2))}</div><div><b>${esc(c.company)}</b><div class="small muted">${esc(c.sector)} · ${esc(c.type)}</div></div>${ring(c.readiness, colorFor(c.company), 58)}</div>
    <div class="small">as <b>${esc(c.role)}</b></div>
    <div class="small muted">Usually values: ${c.focus.map((f) => `<span class="badge">${esc(f)}</span>`).join("")}</div>
    ${c.gaps.length ? `<div class="small">Close the gap: ${c.gaps.map((g) => `<span class="badge warn">${esc(g)}</span>`).join("")}</div>` : `<div class="small" style="color:var(--lime)">You meet every listed requirement 🎉</div>`}
    <div class="small muted">Typical process: ${esc(c.process)}</div>
    <a class="small" href="${jobsLink(c.company, c.role)}" target="_blank" rel="noopener">Search open jobs ↗</a></div>`;
}
function dreamCard(m) {
  const d = m.dream;
  return `<div class="card dream-card" style="margin-top:16px"><div class="row" style="justify-content:space-between"><h3>🏰 Dream company plan</h3><div class="row"><select id="dream-pick" style="width:220px">${companyOptions(S.learner.dream_company)}</select><button class="btn sm" id="btn-dream">Save</button></div></div>
    ${d ? `<div class="grid g3" style="align-items:center">
      <div>${ring(d.readiness, "#ffb547", 120)}<p><b>${esc(d.company)}</b> as <b>${esc(d.role)}</b>${d.role_matches_goal ? "" : ` <span class="badge warn">not your current goal</span>`}</p></div>
      <div><h4>Prepare in this order</h4><ol class="next-list">${d.gaps.map((g, i) => `<li><b>0${i + 1}</b><span>Raise <b>${esc(g)}</b> — <a href="learn.html">see resources</a> · <a href="arena.html">test it</a></span></li>`).join("") || "<li>You meet the listed requirements — keep verifying skills and build projects.</li>"}</ol></div>
      <div><h4>What they usually emphasise</h4><p>${d.focus.map((f) => `<span class="badge brand">${esc(f)}</span>`).join("")}</p><h4>Typical selection process</h4><p class="small">${esc(d.process)}</p>
        <a class="btn ghost sm" href="${jobsLink(d.company, d.role)}" target="_blank" rel="noopener">Search ${esc(d.company)} jobs ↗</a></div></div>`
      : `<p class="muted">Pick a dream company to get a personal preparation plan.</p>`}</div>`;
}
async function pivot() {
  const role = $("#pivot-role").value; if (role === S.learner.target_role) return toast("That's already your goal");
  try { S.scene?.warp(); sound.play("whoosh"); history.replaceState(null, "", "career.html"); applyResult(await api(`api/learners/${S.learner.id}/pivot`, { target_role: role })); toast(`New goal: ${role}`); } catch (e) { toast(e.message); }
}

/* ----- 4. Learning Path ----- */
const STATUS_TEXT = { mastered: "Mastered", active: "Start here", available: "Unlocked", locked: "Locked", remedial: "Do this first", paused: "Paused" };
function pLearn(el) {
  const L = S.learner, rm = L.roadmap || {}, nodes = rm.nodes || [];
  const colW = 250, rowH = 104, cols = {}, pos = {};
  nodes.forEach((n) => (cols[n.depth] = cols[n.depth] || []).push(n));
  let maxRows = 0; Object.entries(cols).forEach(([d, list]) => { list.forEach((n, i) => (pos[n.id] = { x: +d * colW + 8, y: i * rowH + 8 })); maxRows = Math.max(maxRows, list.length); });
  const width = (Math.max(0, ...Object.keys(cols).map(Number)) + 1) * colW + 16, height = maxRows * rowH + 16;
  const bySkill = {}; nodes.forEach((n) => { if (!n.is_remedial) bySkill[n.skill] = n; });
  let lines = "";
  nodes.forEach((n) => (n.prerequisites || []).forEach((grp) => grp.split("|").forEach((p) => {
    const from = bySkill[p]; if (!from) return; const a = pos[from.id], b = pos[n.id], live = from.status === "mastered" && n.status !== "locked";
    lines += `<path class="${live ? "flow" : ""}" d="M${a.x + 210} ${a.y + 36} C ${a.x + 235} ${a.y + 36}, ${b.x - 25} ${b.y + 36}, ${b.x} ${b.y + 36}" fill="none" stroke="${live ? "#8b5cff" : "rgba(160,170,255,.25)"}" stroke-width="2" marker-end="url(#arr)"/>`;
  })));
  nodes.filter((n) => n.is_remedial).forEach((n) => { const a = pos[n.id], b = pos[bySkill[n.skill]?.id]; if (a && b) lines += `<path class="flow" d="M${a.x + 105} ${a.y + 72} L ${b.x + 105} ${b.y}" stroke="#ff4d5e" stroke-width="2" fill="none" marker-end="url(#arr)"/>`; });
  if (!S.selected || !nodes.find((n) => n.id === S.selected)) S.selected = (nodes.find((n) => ["remedial", "active"].includes(n.status)) || nodes[0] || {}).id;
  const sel = nodes.find((n) => n.id === S.selected), hpw = rm.hours_per_week || 8;
  el.innerHTML = `
  ${head(`Learning Path <span class="grad">→ ${esc(L.target_role)}</span>`, `Feature 4 — ${rm.milestones_done_pct ?? 0}% mastered · ${rm.hours_remaining}h left · target ${esc(rm.eta_date || "—")}`, `<a class="btn ghost sm" href="world.html" data-cursor="Map">🗺 View as Skill World</a>`)}
  ${note("learn")}
  <div class="card"><div class="legend" style="margin-bottom:8px"><span><i style="background:#9dff6a"></i>Mastered</span><span><i style="background:#3cf0ff"></i>Active</span><span><i style="background:#8b5cff"></i>Unlocked</span><span><i style="background:#ff4d5e"></i>Remedial</span><span><i style="background:#3a4170"></i>Locked</span></div>
    <div class="dag-wrap"><div class="dag" style="width:${width}px;height:${height}px">
    <svg width="${width}" height="${height}"><defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#8b93b8"/></marker></defs>${lines}</svg>
    ${nodes.map((n, i) => `<div class="node ${n.status} ${n.id === S.selected ? "selected" : ""}" data-node="${esc(n.id)}" data-cursor="Open" style="left:${pos[n.id].x}px;top:${pos[n.id].y}px;animation-delay:${i * 70}ms">
      <div class="t"><span>${esc(n.title || n.skill)}</span><span>${n.status === "mastered" ? "✓" : n.status === "locked" ? "🔒" : n.status === "remedial" ? "⚠" : ""}</span></div>
      <div class="s">${STATUS_TEXT[n.status] || n.status} · ${n.status === "mastered" ? `${n.current}/${n.required}` : `~${n.est_hours}h`}</div>${meter(n.required ? (n.current / n.required) * 100 : 0)}</div>`).join("")}
  </div></div></div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card" id="node-detail">${sel ? nodeDetail(sel) : ""}</div>
    <div class="card"><h3>🗓 Weekly study plan <span class="muted small">${hpw}h / week</span></h3>
      <div class="weeks">${(rm.weeks || []).slice(0, 10).map((w, wi) => { const used = w.items.reduce((a, b) => a + b.hours, 0); return `<div class="week"><b>WEEK ${w.week}</b><div class="week-bar">${w.items.map((it) => `<span style="flex:${it.hours};background:${it.item.startsWith("Remedial") ? "#ff4d5e" : colorFor(it.item)};animation-delay:${wi * 80}ms" title="${esc(it.item)} · ${it.hours}h">${esc(it.item)} ${it.hours}h</span>`).join("")}${used < hpw ? `<span style="flex:${hpw - used};background:rgba(255,255,255,.05)"></span>` : ""}</div></div>`; }).join("") || '<p class="muted">Nothing left — every milestone is mastered! 🎉</p>'}
      ${(rm.weeks || []).length > 10 ? `<p class="small muted">+ ${rm.weeks.length - 10} more weeks</p>` : ""}</div></div>
  </div>`;
  $$(".node", el).forEach((n) => (n.onclick = () => { S.selected = n.dataset.node; $$(".node", el).forEach((x) => x.classList.toggle("selected", x === n)); $("#node-detail").innerHTML = nodeDetail(nodes.find((x) => x.id === S.selected)); mountAll($("#node-detail")); bindDetail(); sound.play("click"); }));
  bindDetail();
}
function nodeDetail(n) {
  const gid = guideForSkill(n.skill), g = DOLLS[gid];
  return `<div class="guide-strip" style="--ac:${g.color}" data-tip="${esc(g.name)} is the ${esc(g.role)} — the guide for ${esc(n.skill)}">${dollHtml(gid, 76, n.is_remedial ? 'data-mood="think"' : 'data-mood="wave"')}<div><b>${esc(g.name)}</b> <span class="small muted">· ${esc(g.role)}</span><div class="small">${esc(n.is_remedial ? "Let's fix the parts you missed, one at a time." : g.line)}</div></div></div>
    <h3>${esc(n.title || n.skill)} <span class="badge">${esc(n.esco)}</span></h3>
    <p class="small muted">${STATUS_TEXT[n.status] || ""}${(n.prerequisites || []).length ? ` · needs ${n.prerequisites.map((p) => esc(p.replace("|", " or "))).join(", ")}` : ""}</p>
    ${n.is_remedial ? `<p>Targets what you missed: ${(n.missed_concepts || []).map((c) => `<span class="badge bad">${esc(pretty(c))}</span>`).join("")}${n.attempts > 1 ? ` <span class="badge warn">attempt #${n.attempts}</span>` : ""}</p>` : ""}
    ${n.format_note ? `<p class="small" style="color:var(--amber)">↺ ${esc(n.format_note)}</p>` : ""}
    ${(n.resources || []).map((r) => `<div class="res"><span class="rt">${esc(r.type)}</span><div><a href="${esc(r.url)}" target="_blank" rel="noopener" data-cursor="Open">${esc(r.title)} ↗</a><div class="small muted">~${r.hours}h</div></div></div>`).join("")}
    <h4 style="margin:14px 0 6px">🛠 Practical exercise / micro-project</h4><p style="margin:0 0 14px">${esc(n.project)}</p>
    <div class="row"><button class="btn primary sm" data-assess="${esc(n.skill)}" ${n.status === "locked" ? "disabled" : ""} data-cursor="Test">Take assessment</button>
      <input type="number" min="0.5" max="12" step="0.5" value="1" id="log-h" style="width:80px"><button class="btn ghost sm" id="btn-log" data-skill="${esc(n.skill)}" data-cursor="Log">⏱ Log hours</button></div>
    <p class="small muted">Logged so far: ${n.logged_hours || 0}h of ~${n.est_hours}h</p>`;
}
function bindDetail() { const b = $("#btn-log"); if (b) b.onclick = () => logHours(b.dataset.skill); }
async function logHours(skill) {
  const h = Number($("#log-h").value); if (!(h > 0)) return toast("Enter hours");
  try { applyResult(await api(`api/learners/${S.learner.id}/progress`, { skill, hours: h })); toast(`Logged ${h}h on ${skill} · +${Math.round(h * 5)} XP`); sound.play("good"); } catch (e) { toast(e.message); }
}

/* ----- Skill World & Arena ----- */
function pWorld(el) {
  el.innerHTML = head(`Skill World <span class="grad">· ${esc(S.learner.name)}</span>`, "Your journey as a game map — where you are, what's next, what's still in the fog") + note("world") + `<div id="world-host"></div>`;
  renderWorld($("#world-host"), { learner: S.learner, esc, sound });
}
function pArena(el) {
  el.innerHTML = head("Skill Arena", "Game-style skill tests — missions count as real assessments") + note("arena") + `<div id="arena-host"></div>`;
  const host = $("#arena-host"); host.dataset.mode = el.dataset.mode || "mission";
  renderArena(host, { learner: S.learner, api, esc, sound, confetti, toast, runAssess, store: arenaStore, saveStore: saveArena, scene: S.scene, rerender: () => pArena(el) });
}

/* ----- assessment modal ----- */
async function openAssess(skill) {
  if (!skill) return;
  S.quizSkill = skill; S.quiz = await api(`api/quiz?skill=${encodeURIComponent(skill)}`);
  $("#modal-title").textContent = `${skill} — prove it (pass mark ${S.quiz.pass_mark}%)`;
  $("#modal").hidden = false; setMode("quiz"); sound.play("click");
}
function setMode(mode) {
  $$("#modal-seg button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  const body = $("#modal-body");
  if (mode === "quiz") {
    body.innerHTML = S.quiz.questions.map((q, i) => `<div class="q"><b>${i + 1}. ${esc(q.q)}</b>${q.options.map((o, j) => `<label class="opt"><input type="radio" name="q${i}" value="${j}"> ${esc(o)}</label>`).join("")}</div>`).join("") +
      `<div class="row"><button class="btn primary" id="btn-submit">Submit answers</button><button class="btn danger sm" id="btn-sim" title="Demo: show adaptive remediation">Demo: simulate fail (45%)</button></div><div id="assess-result"></div>`;
    $("#btn-submit").onclick = submitQuiz; $("#btn-sim").onclick = () => runAssess({ skill: S.quizSkill, mode: "simulate", score: 45 });
  } else {
    const hasSpeech = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
    body.innerHTML = `<p><b>Question:</b> ${esc(S.quiz.explain_prompt)}</p>
      <div class="row"><button class="mic" id="mic" ${hasSpeech ? "" : "disabled"} data-cursor="Speak">🎙</button><div class="wave" id="wave">${"<i></i>".repeat(24)}</div></div>
      <p class="small muted">${hasSpeech ? "Tap the mic and explain out loud (great interview practice) — or type below." : "Voice input needs Chrome or Edge. Type your answer below."}</p>
      <textarea id="explain-text" rows="5" placeholder="Your explanation..."></textarea>
      <button class="btn primary" style="margin-top:10px" id="btn-explain">Evaluate my explanation</button><div id="assess-result"></div>`;
    $("#mic").onclick = toggleMic; $("#btn-explain").onclick = submitExplain;
  }
}
let rec = null, waveT = 0;
function toggleMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition, btn = $("#mic");
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = true;
  const base = $("#explain-text").value;
  rec.onresult = (e) => { let t = ""; for (const r of e.results) t += r[0].transcript; $("#explain-text").value = (base + " " + t).trim(); };
  rec.onend = () => { rec = null; btn.classList.remove("rec"); clearInterval(waveT); $$("#wave i").forEach((i) => (i.style.height = "6px")); };
  rec.onerror = (e) => toast("Mic: " + e.error);
  rec.start(); btn.classList.add("rec");
  waveT = setInterval(() => $$("#wave i").forEach((i) => (i.style.height = 6 + Math.random() * 32 + "px")), 110);
}
async function submitQuiz() {
  const answers = S.quiz.questions.map((_, i) => { const c = $(`input[name=q${i}]:checked`); return c ? Number(c.value) : null; });
  if (answers.includes(null)) return toast("Answer every question");
  await runAssess({ skill: S.quizSkill, mode: "quiz", answers });
}
async function submitExplain() {
  const text = $("#explain-text").value.trim(); if (text.split(/\s+/).length < 4) return toast("Say or type a few sentences first");
  if (rec) rec.stop(); await runAssess({ skill: S.quizSkill, mode: "explain", text });
}
async function runAssess(body, { quiet } = {}) {
  const r = await api(`api/learners/${S.learner.id}/assess`, body);
  const la = r.learner.last_assessment;
  celebrate(la.passed);
  if (quiet) { S.learner = r.learner; updateWho(); updateXP(); showTrace(r.trace); return r; }
  applyResult(r);
  (la.review || []).forEach((rv, i) => $$(`input[name=q${i}]`).forEach((inp) => { const v = Number(inp.value); if (v === rv.correct) inp.parentElement.classList.add("right"); else if (v === rv.your_answer) inp.parentElement.classList.add("wrong"); }));
  $("#assess-result").innerHTML = `<div class="result ${la.passed ? "ok" : "bad"}"><h3>${la.score.toFixed(0)}% — ${la.passed ? "Passed ✓" : "Below pass mark"}</h3><p class="small muted">graded by ${esc(la.grader)}</p>
    ${la.feedback ? `<p>${esc(la.feedback)}</p>` : ""}${la.missed_concepts.length && !la.passed ? `<p class="small">Missed: ${la.missed_concepts.map((c) => `<span class="badge bad">${esc(pretty(c))}</span>`).join("")}</p>` : ""}
    <p>${esc(r.learner.mentor.message)}</p><div class="row"><a class="btn sm" href="learn.html">Updated learning path →</a><a class="btn ghost sm" href="world.html">🗺 Skill World</a></div></div>`;
  return r;
}
function celebrate(passed) {
  if (passed) { confetti(); sound.play("good"); S.scene?.pulse("good"); }
  else { sound.play("bad"); S.scene?.pulse("bad"); document.body.animate([{ filter: "none" }, { filter: "hue-rotate(-40deg) saturate(2)" }, { filter: "none" }], { duration: 500 }); }
}
function closeModal() { $("#modal").hidden = true; if (rec) rec.stop(); }

/* ----- 5. Progress ----- */
function pProgress(el) {
  const L = S.learner, as = L.assessments || [], log = L.study_log || [], tl = L.timeline || [], rm = L.roadmap || {};
  const hours = log.reduce((a, e) => a + Number(e.hours || 0), 0), xp = xpOf(L);
  const perSkill = {}; log.forEach((e) => (perSkill[e.skill] = (perSkill[e.skill] || 0) + Number(e.hours || 0)));
  el.innerHTML = `
  ${head("Progress Tracking", `Feature 5 — level ${levelOf(xp)} · ${xp} XP`)}
  ${note("progress")}
  <div class="grid g4">
    <div class="card stat"><div class="label">Milestones mastered</div><div class="value"><span data-count="${rm.milestones_done_pct || 0}" data-suffix="%">0</span></div>${meter(rm.milestones_done_pct || 0, "linear-gradient(90deg,#9dff6a,#3cf0ff)")}</div>
    <div class="card stat"><div class="label">Assessments</div><div class="value"><span data-count="${as.length}">0</span></div><div class="small muted">${as.filter((a) => a.passed).length} passed</div></div>
    <div class="card stat"><div class="label">Average score</div><div class="value">${as.length ? `<span data-count="${Math.round(as.reduce((a, x) => a + x.score, 0) / as.length)}" data-suffix="%">0</span>` : "—"}</div></div>
    <div class="card stat"><div class="label">Study hours</div><div class="value">${hours.toFixed(1)}</div></div>
  </div>
  <div class="grid g2" style="margin-top:16px"><div class="card"><h3>📈 Readiness over time</h3>${lineChart(tl.map((t) => t.readiness ?? 0))}</div><div class="card"><h3>🧪 Assessment scores</h3>${scoreBars(as)}</div></div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>⏱ Study hours by skill</h3>${Object.entries(perSkill).map(([s, h]) => `<div class="skill-line"><b>${esc(s)}</b>${meter(Math.min(100, (h / Math.max(...Object.values(perSkill))) * 100), colorFor(s))}<span class="small">${h}h</span></div>`).join("") || '<p class="muted">Log hours from the Learning Path page.</p>'}</div>
    <div class="card"><h3>🏅 Achievements</h3>${achHtml(L)}</div></div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>History</h3><div style="overflow-x:auto"><table><tr><th>When</th><th>Skill</th><th>How</th><th>Score</th><th></th></tr>
      ${as.slice().reverse().map((a) => `<tr><td class="small">${fmtDate(a.ts)}</td><td>${esc(a.skill)}</td><td class="small">${esc(a.mode)}</td><td><b>${a.score.toFixed(0)}%</b></td><td><span class="badge ${a.passed ? "ok" : "bad"}">${a.passed ? "pass" : "remedial"}</span></td></tr>`).join("") || '<tr><td colspan="5" class="muted">No assessments yet.</td></tr>'}</table></div></div>
    <div class="card"><h3>Timeline</h3><ul class="next-list">${tl.slice().reverse().slice(0, 10).map((t) => `<li><span class="badge brand">${esc(t.event)}</span><div><div class="small muted">${fmtDate(t.ts)} · readiness ${t.readiness}%</div><div class="small">${esc(t.message)}</div></div></li>`).join("")}</ul></div></div>`;
}
function lineChart(vals) {
  if (vals.length < 2) return '<p class="muted">Take an assessment or log hours to see your trend.</p>';
  const W = 520, H = 200, p = 30, step = (W - 2 * p) / (vals.length - 1), y = (v) => H - p - (v / 100) * (H - 2 * p);
  const pts = vals.map((v, i) => [p + i * step, y(v)]), d = pts.map((q, i) => (i ? "L" : "M") + q.join(" ")).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%"><defs><linearGradient id="lg2" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3cf0ff" stop-opacity=".35"/><stop offset="1" stop-color="#3cf0ff" stop-opacity="0"/></linearGradient></defs>
    ${[0, 50, 100].map((v) => `<line x1="${p}" x2="${W - p}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(160,170,255,.12)"/><text x="4" y="${y(v) + 4}" font-size="10" fill="#8b93b8">${v}</text>`).join("")}
    <path d="${d} L ${pts.at(-1)[0]} ${H - p} L ${p} ${H - p} Z" fill="url(#lg2)" opacity=".8"/>
    <path d="${d}" fill="none" stroke="#3cf0ff" stroke-width="3" pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:1;animation:drawLine 1.8s cubic-bezier(.22,1,.36,1) forwards;filter:drop-shadow(0 0 6px #3cf0ff)"/>
    ${pts.map(([x, yy], i) => `<circle cx="${x}" cy="${yy}" r="4" fill="#05060f" stroke="#ff3ea5" stroke-width="2"><title>${vals[i]}%</title></circle>`).join("")}</svg>`;
}
function scoreBars(as) {
  if (!as.length) return '<p class="muted">No assessments yet — try the Skill Arena.</p>';
  const last = as.slice(-10), W = 520, H = 200, p = 26, bw = (W - 2 * p) / last.length, pass = S.meta.pass_mark;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%"><line x1="${p}" x2="${W - p}" y1="${H - p - pass / 100 * (H - 2 * p)}" y2="${H - p - pass / 100 * (H - 2 * p)}" stroke="#ffb547" stroke-dasharray="5 4"/>
    ${last.map((a, i) => { const h = Math.max(2, (a.score / 100) * (H - 2 * p)); return `<rect x="${p + i * bw + 5}" y="${H - p - h}" width="${bw - 10}" height="${h}" rx="6" fill="${a.passed ? "#9dff6a" : "#ff4d5e"}" style="transform-box:fill-box;transform-origin:bottom;animation:barUp .9s ${i * 80}ms cubic-bezier(.22,1,.36,1) both"><title>${esc(a.skill)}: ${a.score}%</title></rect><text x="${p + i * bw + bw / 2}" y="${H - 8}" font-size="10" text-anchor="middle" fill="#8b93b8">${esc(a.skill.slice(0, 9))}</text>`; }).join("")}</svg>`;
}

/* ----- 6. Mentor ----- */
function pMentor(el) {
  const L = S.learner;
  el.innerHTML = `
  ${head("AI Mentor", `Feature 6 — grounded in your live plan · ${esc(L.mentor?.source || "")}`)}
  ${note("mentor")}
  <div class="grid g2"><div class="card"><div class="row" style="margin-bottom:12px"><div class="mentor-orb" style="width:48px;height:48px" id="chat-orb"></div><div><b>Forge Mentor</b><div class="small muted">online · knows your roadmap</div></div></div>
    <div class="chat" id="chat">${(L.chat || []).map((c) => `<div class="msg me">${esc(c.q)}</div><div class="msg ai">${esc(c.a)}<div class="small muted">${esc(c.source)}</div></div>`).join("") || `<div class="msg ai">${esc(L.mentor?.message || "Hi! Ask me anything about your learning path.")}</div>`}</div>
    <div class="chips">${["Why should I learn this first?", "How long will it take?", "What should I study now?", "Am I ready for interviews?", "I'm stuck, what do I do?"].map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <div class="row"><input id="chat-q" class="grow" placeholder="Type a question..."><button class="btn primary sm" id="chat-send">Send</button></div></div>
    <div><div class="card"><h3>✨ Latest guidance</h3><p>${esc(L.mentor?.message || "")}</p><ol class="next-list">${(L.mentor?.next_actions || []).map((a, i) => `<li><b>0${i + 1}</b>${esc(a)}</li>`).join("")}</ol></div>
    <div class="card" style="margin-top:16px"><h3>How the mentor updates your plan</h3><ol class="next-list">
      <li><b>01</b><span><b>Score below ${S.meta.pass_mark}%</b> → later milestones pause and a remedial lab targeting only the missed concepts appears.</span></li>
      <li><b>02</b><span><b>Second failed attempt</b> → resources switch to video + hands-on first, weak prerequisites are re-opened.</span></li>
      <li><b>03</b><span><b>Pass</b> → skill becomes <i>verified</i>, dependants unlock, readiness and ETA update.</span></li>
      <li><b>04</b><span><b>Goal or dream company change</b> → mastered skills are kept; a new plan and company prep appear.</span></li>
      <li><b>05</b><span><b>Study hours logged</b> → the weekly plan and target date move.</span></li></ol></div></div></div>`;
  const c = $("#chat"); c.scrollTop = c.scrollHeight;
  $$(".chip", el).forEach((b) => (b.onclick = () => ask(b.dataset.q)));
  $("#chat-send").onclick = () => ask(); $("#chat-q").onkeydown = (e) => e.key === "Enter" && ask();
}
async function ask(q) {
  q = q || $("#chat-q").value.trim(); if (!q) return; $("#chat-q").value = "";
  const c = $("#chat"); c.insertAdjacentHTML("beforeend", `<div class="msg me">${esc(q)}</div><div class="msg ai typing" id="typing"><i></i><i></i><i></i></div>`); c.scrollTop = c.scrollHeight;
  $("#chat-orb").classList.add("talking"); sound.play("click");
  try {
    const r = await api(`api/learners/${S.learner.id}/chat`, { question: q });
    S.learner.chat = [...(S.learner.chat || []), { q, a: r.answer, source: r.source }];
    const t = $("#typing"); t.classList.remove("typing"); t.removeAttribute("id"); t.innerHTML = ""; const span = document.createElement("span"); t.append(span);
    typewrite(span, r.answer, 10, () => { $("#chat-orb")?.classList.remove("talking"); t.insertAdjacentHTML("beforeend", `<div class="small muted">${esc(r.source)}</div>`); });
    c.scrollTop = c.scrollHeight;
  } catch (e) { toast(e.message); $("#typing")?.remove(); }
}

/* ----- Organisation ----- */
async function pOrg(el) {
  const c = await api("api/cohort"), heat = (p) => `hsl(${120 - p * 1.2}, 85%, ${55 - p * .08}%)`;
  el.innerHTML = `
  ${head("Organization view", esc(c.organizations.join(", ") || "All learners"), `<button class="btn ghost sm" id="btn-reset">↺ Reset demo data</button>`)}
  ${note("org")}
  <div class="grid g4">
    <div class="card stat"><div class="label">Learners</div><div class="value"><span data-count="${c.learners}">0</span></div></div>
    <div class="card stat"><div class="label">Avg readiness</div><div class="value"><span data-count="${c.avg_readiness}" data-suffix="%">0</span></div>${meter(c.avg_readiness)}</div>
    <div class="card stat"><div class="label">Need attention</div><div class="value" style="color:var(--amber)"><span data-count="${c.at_risk.length}">0</span></div></div>
    <div class="card stat"><div class="label">Target roles</div><div class="small">${Object.entries(c.roles).map(([r, n]) => `${esc(r)} <b>${n}</b>`).join("<br>")}</div></div>
  </div>
  <div class="card" style="margin-top:16px"><h3>🔥 Skill-gap heat map <span class="muted small">% of learners (who need the skill) still below level</span></h3>
    <div class="heat-grid">${c.skill_gaps.map((g, i) => `<div class="heat-cell" style="background:${heat(g.pct_lacking)};animation-delay:${i * 30}ms" title="needed by ${g.needed_by}, avg gap ${g.avg_gap}"><b>${g.pct_lacking}%</b><span>${esc(g.skill)}</span></div>`).join("")}</div></div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>💡 Recommendations for trainers</h3><ol class="next-list">${c.recommendations.map((r, i) => `<li><b>0${i + 1}</b>${esc(r)}</li>`).join("") || "<li>No cohort-wide gaps.</li>"}</ol></div>
    <div class="card"><h3>⚠ Needs attention</h3><ol class="next-list">${c.at_risk.map((a) => `<li><div><a href="app.html" data-open="${esc(a.id)}">${esc(a.name)}</a> <span class="small muted">${esc(a.role)} · ${a.readiness}%</span><div>${a.reasons.map((r) => `<span class="badge warn">${esc(r)}</span>`).join("")}</div></div></li>`).join("") || "<li>Everyone is on track.</li>"}</ol></div></div>
  <div class="card" style="margin-top:16px"><h3>All learners</h3><div style="overflow-x:auto"><table><tr><th>Name</th><th>Goal</th><th>Readiness</th><th>Milestone</th><th>Tests</th><th>Avg</th><th>Hours</th></tr>
    ${c.table.map((r) => `<tr><td><a href="app.html" data-open="${esc(r.id)}">${esc(r.name)}</a></td><td>${esc(r.role)}</td><td style="min-width:120px">${meter(r.readiness)}<span class="small">${r.readiness}%</span></td><td>${esc(r.active || "—")}${r.remedial.length ? ' <span class="badge bad">remedial</span>' : ""}</td><td>${r.assessments}</td><td>${r.avg_score ?? "—"}</td><td>${r.hours}</td></tr>`).join("")}</table></div></div>`;
  $$("[data-open]", el).forEach((a) => a.addEventListener("click", () => { try { localStorage.setItem("sf-learner", a.dataset.open); } catch (_) {} }, true));
  $("#btn-reset").onclick = async () => {
    if (!confirm("Delete all learners and reload the 9 demo learners?")) return;
    await api("api/demo/reset", {}); try { localStorage.setItem("sf-learner", "jane-doe"); } catch (_) {}
    await loadLearners(); await selectLearner("jane-doe"); toast("Demo data reset");
  };
  el.querySelectorAll("[data-count]").forEach((x) => countUp(x, +x.dataset.count, 1100, x.dataset.suffix || ""));
  requestAnimationFrame(() => el.querySelectorAll(".meter > span[data-w]").forEach((m) => (m.style.width = m.dataset.w + "%")));
}

/* ----- Guide ----- */
function pGuide(el) {
  el.innerHTML = `
  ${head("Guide", "Everything you need to use SkillForge AI fully", `<a class="btn primary sm" href="index.html#watch">▶ 1-minute explainer</a>`)}
  ${note("guide")}
  <div class="grid g2">
    <div class="card"><h3>🧭 A 5-minute tour</h3><ol class="next-list">
      <li><b>01</b><span><b>Dashboard</b> — choose <i>Jane Doe</i> (top-left): Python, SQL, basic HTML → Full Stack Developer, dream company Zoho.</span></li>
      <li><b>02</b><span><b>Skill Analysis</b> — strengths, weaknesses and the industry readiness map for all 9 industries.</span></li>
      <li><b>03</b><span><b>Career Matching</b> — see companies that hire for the role and your dream-company plan.</span></li>
      <li><b>04</b><span><b>Learning Path</b> → <b>Skill World</b> — your roadmap as a game map.</span></li>
      <li><b>05</b><span><b>Skill Arena</b> — play the HTML/CSS mission. Lose once to see the remedial lab, then win.</span></li>
      <li><b>06</b><span><b>Progress</b> and <b>AI Mentor</b> — watch everything update. Then try learners from other industries.</span></li></ol></div>
    <div class="card"><h3>⚙ Modes & settings</h3><ol class="next-list">
      <li><b>◉</b><span>The pill in the top bar shows where the agents run: <b>Server · LangGraph</b> (FastAPI backend, optional Gemini) or <b>Web · in-browser</b> (GitHub Pages — same 8 agents in JavaScript, data saved in your browser).</span></li>
      <li><b>↗</b><span>Every page has its own address — use ↗ in the menu to open it in a new tab.</span></li>
      <li><b>✦</b><span>Cursor styles: orbit ring, comet trail, neon ribbon, spark burst or system default.</span></li>
      <li><b>🔈</b><span>Sound effects for the arena and achievements. In the arena, answer with keys 1–4. Esc closes dialogs.</span></li>
      <li><b>📄</b><span><a href="https://github.com/G-Jayakiruthika/skillforge-ai" target="_blank" rel="noopener">Source code, tests and setup on GitHub ↗</a></span></li></ol></div></div>
  <div class="card" style="margin-top:16px"><h3>🌍 Industries & roles covered</h3><div class="industry-grid">${Object.entries(S.meta.industries).map(([n, v]) => `<div class="glass ind-card" style="--ac:${v.color}"><span class="ind-ico">${v.icon}</span><h3>${esc(n)}</h3><p class="small muted">${v.roles.map(esc).join(" · ")}</p></div>`).join("")}</div></div>
  <div class="card" style="margin-top:16px"><h3>🤖 The 8 agents</h3><div class="agent-grid" style="margin-top:8px">${AGENTS.map(([n, ico, col, d]) => `<div class="glass agent-card" style="--ac:${col}"><div class="orb">${ico}</div><h3>${n}</h3><p>${d}</p></div>`).join("")}</div></div>`;
}

/* ===================== Boot ===================== */
function onScroll() { const max = document.documentElement.scrollHeight - innerHeight; S.scene?.setProgress(max > 0 ? scrollY / max : 0); }
async function boot() {
  if (PAGE !== "home") injectChrome();
  injectCommon();
  theme.initTheme();
  let pct = 0; const lp = $("#loader-pct"), lb = $("#loader-bar");
  if ($(".loader-label")) scramble($(".loader-label"));
  const lt = setInterval(() => { pct = Math.min(96, pct + Math.random() * 14); lp.textContent = Math.round(pct); lb.style.width = pct + "%"; }, 60);

  const gl = $("#gl"), calm = theme.isMinimal() || theme.motionOff();
  if (calm) S.scene = { setProgress() {}, setMode() {}, pulse() {}, warp() {}, setAccent() {} };     // no 3D in calm modes
  else { try { S.scene = createScene(gl, { reduced }); } catch (e) { console.warn("WebGL failed", e); } }
  if (!S.scene) S.scene = createFallback(gl);
  if (PAGE !== "home") S.scene.setMode("app");
  S.scene.setAccent?.(...theme.accentPair());
  theme.onChange(() => S.scene.setAccent?.(...theme.accentPair()));
  initCursor(); if (!calm) interactions();

  await detectMode();
  S.meta = await api("api/meta");
  const pill = $("#mode-pill");
  if (pill) { pill.classList.add("live"); pill.textContent = S.mode === "web" ? "● Web · in-browser agents" : `● Server · ${S.health.agent_engine}${/active/.test(S.health.gemini) ? " · Gemini" : ""}`;
    pill.title = S.mode === "web" ? "No server needed: the 8 agents run in your browser and data stays on this device." : `FastAPI backend · Gemini: ${S.health.gemini}`; }

  try { S.user = (await api("api/auth/me")).user; } catch (_) { S.user = null; }
  renderUser();
  await PV.initConsent(api);                 // load the saved choice before anything optional runs
  PV.consentBanner(pageCtx());               // ask, if they have not chosen yet
  PV.track("page:" + PAGE);                  // no-op until analytics is consented to
  if (PAGE === "home") {
    renderLanding();
    S.explainer = createExplainer({ canvas: $("#explainer"), caption: $("#player-caption"), fill: $("#player-fill"), time: $("#player-time"), playBtn: $("#player-play"), bigBtn: $("#player-big"), track: $("#player-track"), chaptersEl: $("#player-chapters"), recBtn: $("#player-rec"), fsBtn: $("#player-fs"), player: $("#player"), onPlay: () => sound.play("click") });
    addEventListener("scroll", onScroll, { passive: true });
  } else {
    await loadLearners();
    const want = S.user?.learner_id || (() => { try { return localStorage.getItem("sf-learner"); } catch (_) { return null; } })() || "jane-doe";
    if (S.learners.length) await selectLearner(S.learners.find((l) => l.id === want) ? want : S.learners[0].id, false);
    renderPage();
    $("#learner-select").onchange = (e) => selectLearner(e.target.value);
    $("#bus-toggle").onclick = () => $("#bus").classList.toggle("collapsed");
  }

  clearInterval(lt); lp.textContent = 100; lb.style.width = "100%";
  setTimeout(() => {
    document.body.classList.remove("is-loading"); portalIn();
    if (PAGE === "home") { observeReveals(); $$(".hero [data-scramble]").forEach((el, i) => setTimeout(() => scramble(el, undefined, 1100), 200 + i * 250)); if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView(); }
  }, 300);

  S.voice = initVoice({ getLearner: () => S.learner, toast, go: (href, label) => portalTo(href, 40, innerHeight - 40, label),
    ask: async (q) => (await api(`api/learners/${S.learner.id}/chat`, { question: q })).answer });
  $("#gmodal-close").onclick = () => ($("#gmodal").hidden = true);
  $("#gmodal").onclick = (e) => e.target.id === "gmodal" && ($("#gmodal").hidden = true);
  $("#modal-close").onclick = closeModal;
  $("#modal").onclick = (e) => e.target.id === "modal" && closeModal();
  $("#modal-seg").onclick = (e) => e.target.dataset.mode && setMode(e.target.dataset.mode);
  $("#btn-sound").onclick = () => { $("#btn-sound").textContent = sound.toggle() ? "🔊" : "🔈"; };
  $("#btn-sound").textContent = sound.on ? "🔊" : "🔈";
  $("#btn-cursor").onclick = (e) => { e.stopPropagation(); $("#cursor-menu").hidden = !$("#cursor-menu").hidden; };
  $("#cursor-menu").onclick = (e) => { const m = e.target.dataset.mode; if (m) { setCursor(m); toast("Cursor: " + e.target.textContent.trim()); $("#cursor-menu").hidden = true; } };
  document.addEventListener("click", (e) => { if (!e.target.closest(".cursor-picker")) $("#cursor-menu").hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); $("#gmodal").hidden = true; } });
  document.addEventListener("pointerover", (e) => { if (e.target.closest?.(".btn, .side-nav a, .chip, .portal-card")) sound.play("hover"); });
  addEventListener("pageshow", (e) => { if (e.persisted) $("#portal")?.classList.remove("go"); });
}
boot();
