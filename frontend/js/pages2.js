/*
 * pages2.js - account, community and information pages.
 *   signup / login / account      create and manage an account (stored in the database)
 *   colleges / places / browse    student lists by institution, by state-district-city, and a dropdown finder
 *   faculty / portal              faculty directory (students contact them) and the faculty view of their students
 *   compete                       leaderboard + head-to-head duel
 *   agents                        meet the 3D agent and guide dolls
 *   about / contact               information, and a contact form saved to the database
 * Every value that came from a person is passed through esc() before it reaches the page.
 */
import { DOLLS, AGENT_IDS, GUIDE_IDS, dollHtml, mountAll, guideForSkill } from "./avatars.js";
import { renderGames } from "./games.js";
import { passwordProblem } from "./engine-accounts.js";

const opt = (v, label, sel) => `<option value="${v}" ${sel ? "selected" : ""}>${label}</option>`;
const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function demoBanner(c) {
  return c.S.mode === "web" ? `<div class="demo-banner" role="note">ℹ️ <b>Web demo:</b> this hosted version has no server, so accounts and messages are saved <b>in this browser only</b>. Passwords are still hashed, never stored as plain text. The full version (FastAPI) saves them in a real database — see the README.</div>` : "";
}
function instSelect(c, id, selected = "", allowEmpty = "— choose your college / university —") {
  const byDistrict = {};
  for (const i of c.S.meta.institutions) (byDistrict[i.district || "Other"] = byDistrict[i.district || "Other"] || []).push(i);
  return `<select id="${id}" data-tip="Tamil Nadu universities and colleges, grouped by district">${opt("", allowEmpty, !selected)}${Object.keys(byDistrict).sort().map((d) => `<optgroup label="${c.esc(d)}">${byDistrict[d].map((i) => opt(c.esc(i.id), c.esc(i.name), i.id === selected)).join("")}</optgroup>`).join("")}</select>`;
}
function personCard(c, p, extra = "") {
  const { esc } = c;
  return `<div class="glass person"><div class="p-top"><div class="pa">${esc(initials(p.name))}</div><div><b>${esc(p.name)}</b><div class="small muted">${esc(p.education || "")}</div></div>${c.ring(p.readiness || 0, "var(--accent)", 54)}</div>
    <div class="small">🎯 ${esc(p.target_role || "")}${p.industry ? ` <span class="muted">· ${esc(p.industry)}</span>` : ""}</div>
    <div class="small muted">🏫 ${esc(p.institution || "Not specified")}${p.city ? ` · ${esc(p.city)}` : ""}</div>
    ${(p.top_skills || []).length ? `<div>${p.top_skills.map((s) => `<span class="badge ok">${esc(s)}</span>`).join("")}</div>` : ""}
    ${p.dream_company ? `<div class="small">🏰 ${esc(p.dream_company)}</div>` : ""}${extra}</div>`;
}
const openBtn = (c, p) => p.can_open ? `<button class="btn sm" data-open-student="${c.esc(p.id)}" data-tip="Open this student's full profile">Open full profile</button>` : `<span class="small muted" data-tip="Full profiles open only for the student, faculty of the same college, or an admin">🔒 full profile: own college faculty only</span>`;
function bindOpen(c, root) { root.querySelectorAll("[data-open-student]").forEach((b) => (b.onclick = () => showStudent(c, b.dataset.openStudent))); }

async function showStudent(c, id) {
  const { esc } = c;
  try {
    const { learner: L } = await c.api(`api/students/${encodeURIComponent(id)}`), m = L.match || {}, an = L.analysis || {};
    c.modal(`${esc(L.name)} — full profile`, `
      <p class="small muted">${esc(L.education || "")} · ${esc(L.institution || "")} · goal: <b>${esc(L.target_role)}</b></p>
      <div class="grid g3" style="margin:12px 0"><div class="card stat"><div class="label">Readiness</div><div class="value sm">${m.readiness}%</div></div><div class="card stat"><div class="label">Milestone</div><div class="value sm">${esc(L.roadmap?.active || "—")}</div></div><div class="card stat"><div class="label">Assessments</div><div class="value sm">${(L.assessments || []).length}</div></div></div>
      <h4>Strengths</h4><p>${(an.strengths || []).map((s) => `<span class="badge ok">${esc(s.skill)} ${s.score}</span>`).join("") || "—"}</p>
      <h4>Needs work</h4><p>${(an.weaknesses || []).map((w) => `<span class="badge warn">${esc(w.skill)} ${w.score}/${w.required}</span>`).join("")}${(m.missing || []).map((s) => `<span class="badge bad">${esc(s)}</span>`).join("") || ""}</p>
      <h4>Mentor's latest guidance</h4><p>${esc(L.mentor?.message || "")}</p>
      <h4>Recent assessments</h4><table><tr><th>Skill</th><th>Score</th><th></th></tr>${(L.assessments || []).slice(-6).reverse().map((a) => `<tr><td>${esc(a.skill)}</td><td>${a.score.toFixed(0)}%</td><td><span class="badge ${a.passed ? "ok" : "bad"}">${a.passed ? "pass" : "remedial"}</span></td></tr>`).join("") || '<tr><td colspan="3" class="muted">None yet</td></tr>'}</table>`);
  } catch (e) { c.toast(e.message); }
}

/* ============================ accounts ============================ */
export function pSignup(el, c) {
  const { esc } = c;
  if (c.S.user) return pAccount(el, c);
  el.innerHTML = `${c.head("Create your account", "Sign up as a student or a faculty member")}${c.note("signup")}${demoBanner(c)}
  <div class="auth-wrap"><form class="card" id="f-signup" novalidate autocomplete="on">
      <div class="field"><label class="lbl" for="su-role">I am a</label><div class="seg" id="su-role" role="radiogroup"><button type="button" class="active" data-v="student" data-tip="Students get a personal learning profile">🎓 Student</button><button type="button" data-v="faculty" data-tip="Faculty can view students of their own college">👩‍🏫 Faculty member</button></div></div>
      <div class="row"><div class="field grow"><label class="lbl" for="su-name">Full name</label><input id="su-name" name="name" autocomplete="name" required maxlength="80"></div>
        <div class="field grow"><label class="lbl" for="su-email">Email</label><input id="su-email" name="email" type="email" autocomplete="email" required maxlength="254"></div></div>
      <div class="field"><label class="lbl" for="su-inst">College / university</label>${instSelect(c, "su-inst")}</div>
      <div class="field"><label class="lbl" for="su-dept" id="su-dept-lbl">Degree / course</label><input id="su-dept" maxlength="80" placeholder="e.g. MCA, B.E. Mechanical, B.Com"></div>
      <div class="row"><div class="field grow"><label class="lbl" for="su-pw">Password</label><input id="su-pw" type="password" autocomplete="new-password" required minlength="8" maxlength="200" data-tip="At least 8 characters with a letter and a number"><div class="pw-meter"><i id="su-meter"></i></div><div class="field-err" id="su-pw-err" aria-live="polite"></div></div>
        <div class="field grow"><label class="lbl" for="su-pw2">Confirm password</label><input id="su-pw2" type="password" autocomplete="new-password" required maxlength="200"></div></div>
      <div class="field declare">
        <label class="opt" for="su-age"><input type="checkbox" id="su-age" required> <span>I confirm I am <b>18 years or older</b>.</span></label>
        <label class="opt" for="su-terms"><input type="checkbox" id="su-terms" required> <span>I accept the <a href="terms.html" target="_blank" rel="noopener">Terms of Service</a> and the <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>
        <p class="small muted">Under 18? Ask your college to enrol you — we are not able to open an account for you directly.</p>
      </div>
      <input class="hp" tabindex="-1" autocomplete="off" id="su-hp" aria-hidden="true">
      <button class="btn primary" type="submit" data-tip="Creates your account and signs you in">Create account</button> <a href="login.html" class="small" style="margin-left:10px">Already have an account? Sign in</a>
      <div id="su-msg" aria-live="assertive"></div></form>
    <div class="card auth-side">${dollHtml("profiler", 150)}<h3 style="justify-content:center;margin-top:10px">${esc(DOLLS.profiler.name)} will set you up</h3>
      <ul class="check-list" style="text-align:left;margin-top:12px"><li>Your password is hashed (PBKDF2-SHA256) — nobody can read it, including us.</li><li>Students get a personal profile, roadmap and progress tracking.</li><li>Faculty see only students of their own college.</li><li>You can change your password or sign out everywhere at any time.</li></ul></div></div>`;
  mountAll(el, { mood: "wave" });
  let role = "student";
  el.querySelectorAll("#su-role button").forEach((b) => (b.onclick = () => { role = b.dataset.v; el.querySelectorAll("#su-role button").forEach((x) => x.classList.toggle("active", x === b)); el.querySelector("#su-dept-lbl").textContent = role === "faculty" ? "Department" : "Degree / course"; el.querySelector("#su-dept").placeholder = role === "faculty" ? "e.g. Computer Applications" : "e.g. MCA, B.E. Mechanical, B.Com"; }));
  const pw = el.querySelector("#su-pw"), meter = el.querySelector("#su-meter"), err = el.querySelector("#su-pw-err");
  pw.oninput = () => { const p = pw.value, prob = passwordProblem(p, el.querySelector("#su-email").value, el.querySelector("#su-name").value);
    const score = Math.min(4, (p.length >= 8) + (p.length >= 12) + (/[A-Z]/.test(p) && /[a-z]/.test(p)) + (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)));
    meter.style.width = `${(prob ? Math.min(1, score) : Math.max(2, score)) * 25}%`; meter.style.background = prob ? "var(--red)" : score >= 3 ? "var(--lime)" : "var(--amber)"; err.textContent = p && prob ? prob : ""; };
  el.querySelector("#f-signup").onsubmit = async (e) => {
    e.preventDefault(); const msg = el.querySelector("#su-msg");
    if (el.querySelector("#su-hp").value) return;                                  // honeypot
    const body = { role, name: el.querySelector("#su-name").value, email: el.querySelector("#su-email").value, institution_id: el.querySelector("#su-inst").value,
      department: el.querySelector("#su-dept").value, password: pw.value, confirm: el.querySelector("#su-pw2").value,
      age_confirmed: el.querySelector("#su-age").checked, terms_accepted: el.querySelector("#su-terms").checked };
    // Checked again on the server; this only saves a round trip and names the box to tick.
    if (!body.age_confirmed || !body.terms_accepted) {
      msg.innerHTML = `<div class="form-msg bad">Please confirm your age and accept the terms.</div>`;
      c.sound.play("bad"); return;
    }
    try {
      const r = await c.api("api/auth/signup", body); c.S.user = r.user; pw.value = el.querySelector("#su-pw2").value = "";
      if (r.user.learner_id) { try { localStorage.setItem("sf-learner", r.user.learner_id); } catch (_) {} }
      c.sound.play("level"); c.confetti(); msg.innerHTML = `<div class="form-msg ok">Welcome, ${esc(r.user.name)}! Taking you to ${r.user.role === "faculty" ? "your faculty portal" : "your profile"}…</div>`;
      setTimeout(() => c.go(r.user.role === "faculty" ? "portal.html" : "profile.html", "Welcome"), 1300);
    } catch (x) { msg.innerHTML = `<div class="form-msg bad">${esc(x.message)}</div>`; c.sound.play("bad"); }
  };
}

export function pLogin(el, c) {
  const { esc } = c;
  if (c.S.user) return pAccount(el, c);
  el.innerHTML = `${c.head("Sign in", "Welcome back")}${c.note("login")}${demoBanner(c)}
  <div class="auth-wrap"><form class="card" id="f-login" novalidate>
      <div class="field"><label class="lbl" for="li-email">Email</label><input id="li-email" type="email" autocomplete="email" required maxlength="254"></div>
      <div class="field"><label class="lbl" for="li-pw">Password</label><input id="li-pw" type="password" autocomplete="current-password" required maxlength="200"></div>
      <button class="btn primary" type="submit">Sign in</button> <a href="signup.html" class="small" style="margin-left:10px">New here? Create an account</a>
      <a href="forgot.html" class="small" style="margin-left:10px">Forgot your password?</a>
      <div id="li-msg" aria-live="assertive"></div></form>
    <div class="card"><h3>Try the demo — no password</h3><p class="small muted">Demo sessions only ever open the <b>fictional sample learners</b>, never a real student's profile. There is no shared demo password, and demo sessions are switched off on public servers.</p>
      <div class="chips"><button class="chip" data-demo="faculty" data-tip="See the faculty portal as a sample faculty member at Rathinam Technical Campus">👩‍🏫 Enter as demo faculty</button>${c.S.mode === "web" ? `<button class="chip" data-demo="admin" data-tip="Web demo only: sees every page, using the data stored in this browser">🛡 Enter as demo admin</button>` : ""}</div>
      <p class="small muted" style="margin-top:10px">After 8 wrong attempts sign-in is paused for 15 minutes — that protects accounts from password guessing.</p></div></div>`;
  el.querySelectorAll("[data-demo]").forEach((b) => (b.onclick = async () => { const msg = el.querySelector("#li-msg");
    try { const r = await c.api("api/auth/demo", { role: b.dataset.demo }); c.S.user = r.user; c.sound.play("good"); msg.innerHTML = `<div class="form-msg ok">Demo session started as ${esc(r.user.name)}.</div>`; setTimeout(() => c.go("portal.html", "Faculty portal"), 700); }
    catch (x) { msg.innerHTML = `<div class="form-msg bad">${esc(x.message)}</div>`; } }));
  el.querySelector("#f-login").onsubmit = async (e) => {
    e.preventDefault(); const msg = el.querySelector("#li-msg");
    try {
      const r = await c.api("api/auth/login", { email: el.querySelector("#li-email").value, password: el.querySelector("#li-pw").value });
      c.S.user = r.user; el.querySelector("#li-pw").value = ""; if (r.user.learner_id) { try { localStorage.setItem("sf-learner", r.user.learner_id); } catch (_) {} }
      c.sound.play("good"); msg.innerHTML = `<div class="form-msg ok">Signed in as ${esc(r.user.name)}.</div>`;
      setTimeout(() => c.go(r.user.role === "student" ? "app.html" : "portal.html", "Welcome back"), 800);
    } catch (x) { msg.innerHTML = `<div class="form-msg bad">${esc(x.message)}</div>`; c.sound.play("bad"); }
  };
}

export async function pAccount(el, c) {
  const { esc } = c, u = c.S.user;
  if (!u) { el.innerHTML = `${c.head("Account", "")}<div class="card"><p>You are not signed in.</p><a class="btn primary" href="login.html">Sign in</a> <a class="btn ghost" href="signup.html">Create account</a></div>`; return; }
  let inbox = "";
  if (u.role === "admin") {
    try { const r = await c.api("api/admin/contacts"), cfg = await c.api("api/admin/config");
      inbox = `<div class="card" style="margin-top:16px"><h3>🛡 Admin · contact inbox <span class="count-pill">${r.total}</span></h3>${r.messages.map((m) => `<div class="res" style="display:block"><b>${esc(m.subject)}</b> <span class="small muted">— ${esc(m.name)} &lt;${esc(m.email)}&gt; · ${esc(String(m.created).slice(0, 16))}</span><div class="small" style="white-space:pre-wrap">${esc(m.message)}</div></div>`).join("") || '<p class="muted">No messages yet.</p>'}</div>
      <div class="card" style="margin-top:16px"><h3>🛡 Admin · server configuration</h3><table><tr><td>Debug mode</td><td><span class="badge ${cfg.debug ? "bad" : "ok"}">${cfg.debug ? "ON" : "off"}</span></td></tr><tr><td>Gemini key</td><td>${cfg.gemini_configured ? `configured <span class="cred">${esc(cfg.gemini_key_preview || "")}</span>` : "not set"}</td></tr><tr><td>Allowed origins (CORS)</td><td class="small">${(cfg.cors_origins || []).map(esc).join(", ")}</td></tr><tr><td>Session secret</td><td class="small">${esc(cfg.secret_source)}</td></tr></table>${(cfg.warnings || []).map((w) => `<div class="form-msg bad">${esc(w)}</div>`).join("")}</div>`;
    } catch (_) {}
  }
  // An unconfirmed address cannot receive a reset link, so say so where it matters.
  const verifyBanner = (!u.demo && !u.email_verified)
    ? `<div class="card" id="verify-card" style="border-color:var(--amber)"><h3>✉ Confirm your email address</h3>
        <p class="small muted">Your address has not been confirmed yet. Confirming it is what lets you get back in
        if you ever forget your password — without it, there is nowhere to send a reset link.</p>
        <button class="btn primary sm" id="btn-verify" data-tip="Sends a confirmation link to ${esc(u.email)}">Send me the link</button>
        <div id="verify-msg" aria-live="polite"></div></div>`
    : "";
  el.innerHTML = `${c.head(`Account <span class="grad">· ${esc(u.name)}</span>`, `${esc(u.role)} · ${esc(u.institution || "no institution")}`)}${demoBanner(c)}${verifyBanner}
  <div class="grid g2"><div class="card"><h3>Your details</h3><table><tr><td>Name</td><td><b>${esc(u.name)}</b></td></tr><tr><td>Email</td><td>${esc(u.email)}</td></tr><tr><td>Role</td><td><span class="badge brand">${esc(u.role)}</span></td></tr>
      <tr><td>Institution</td><td>${esc(u.institution || "—")}</td></tr><tr><td>${u.role === "faculty" ? "Department" : "Course"}</td><td>${esc(u.department || "—")}</td></tr><tr><td>Location</td><td>${esc([u.city, u.district, u.state].filter(Boolean).join(", ") || "—")}</td></tr></table>
      <div class="row" style="margin-top:14px">${u.role === "student" ? `<a class="btn primary sm" href="app.html">My dashboard</a>` : `<a class="btn primary sm" href="portal.html">My students</a>`}<button class="btn ghost sm" id="btn-logout" data-tip="Sign out of this device">Sign out</button></div></div>
    <form class="card" id="f-pw"><h3>Change password</h3><div class="field"><label class="lbl" for="cp-cur">Current password</label><input id="cp-cur" type="password" autocomplete="current-password" maxlength="200"></div>
      <div class="field"><label class="lbl" for="cp-new">New password</label><input id="cp-new" type="password" autocomplete="new-password" maxlength="200"></div><button class="btn sm" type="submit" data-tip="You will be signed out everywhere and asked to sign in again">Update password</button><div id="cp-msg" aria-live="assertive"></div></form></div>${inbox}`;
  const vb = el.querySelector("#btn-verify");
  if (vb) vb.onclick = async () => {
    const msg = el.querySelector("#verify-msg");
    vb.disabled = true; msg.innerHTML = `<div class="form-msg">Sending…</div>`;
    try {
      const r = await c.api("api/auth/verify/send", {});
      msg.innerHTML = `<div class="form-msg ok">${esc(r.message)}</div>`;
    } catch (x) { msg.innerHTML = `<div class="form-msg bad">${esc(x.message)}</div>`; vb.disabled = false; }
  };
  el.querySelector("#btn-logout").onclick = async () => { await c.api("api/auth/logout", {}); c.S.user = null; c.toast("Signed out"); c.go("index.html", "Signed out"); };
  el.querySelector("#f-pw").onsubmit = async (e) => { e.preventDefault(); const m = el.querySelector("#cp-msg");
    try { const r = await c.api("api/auth/password", { current: el.querySelector("#cp-cur").value, new: el.querySelector("#cp-new").value }); c.S.user = null; m.innerHTML = `<div class="form-msg ok">${esc(r.message)}</div>`; setTimeout(() => c.go("login.html", "Sign in"), 1200); }
    catch (x) { m.innerHTML = `<div class="form-msg bad">${esc(x.message)}</div>`; } };
}

/* ============================ directories ============================ */
export async function pColleges(el, c) {
  const { esc } = c, q = new URLSearchParams(location.search), pre = q.get("id") || "";
  el.innerHTML = `${c.head("Students by college & university", "Pick an institution to see its students")}${c.note("colleges")}
  <div class="filter-bar"><input id="col-q" placeholder="Search a college or university…" aria-label="Search institutions" data-tip="Type part of a name, city or district">
    <select id="col-kind" aria-label="Type of institution" data-tip="Filter by type">${opt("", "All types", true)}${Object.entries(c.S.meta.kind_labels).map(([k, v]) => opt(k, esc(v))).join("")}</select>
    <label class="small" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="col-has" style="width:auto"> only with students</label></div>
  <div class="grid g2"><div class="card"><h3>Institutions <span class="count-pill" id="col-count"></span></h3><div id="col-list" style="max-height:62vh;overflow-y:auto;padding-right:4px"></div><p class="small muted" style="margin-top:10px">ⓘ ${esc(c.S.meta.institution_note)}</p></div>
    <div class="card" id="col-students"><h3>Students</h3><p class="muted">Select an institution on the left.</p></div></div>`;
  let selected = pre;
  async function list() {
    const r = await c.api(`api/institutions?q=${encodeURIComponent(el.querySelector("#col-q").value)}&kind=${encodeURIComponent(el.querySelector("#col-kind").value)}`);
    let rows = r.institutions; if (el.querySelector("#col-has").checked) rows = rows.filter((i) => i.students);
    rows.sort((a, b) => b.students - a.students || a.name.localeCompare(b.name));
    el.querySelector("#col-count").textContent = rows.length;
    el.querySelector("#col-list").innerHTML = rows.map((i) => `<button class="inst-row ${i.id === selected ? "on" : ""}" data-inst="${esc(i.id)}" data-tip="${esc(i.label)}${i.affiliation ? " · affiliated to " + esc(i.affiliation) : ""}"><span><b>${esc(i.name)}</b><span class="small muted" style="display:block">${esc(i.label)} · ${esc([i.city, i.district].filter(Boolean).join(", ") || "Tamil Nadu")}</span></span><span class="count-pill">${i.students} student${i.students === 1 ? "" : "s"}</span><span aria-hidden="true">›</span></button>`).join("") || '<p class="muted">No institution matches.</p>';
    el.querySelectorAll("[data-inst]").forEach((b) => (b.onclick = () => { selected = b.dataset.inst; el.querySelectorAll(".inst-row").forEach((x) => x.classList.toggle("on", x === b)); students(); }));
  }
  async function students() {
    const box = el.querySelector("#col-students"), inst = c.S.meta.institutions.find((i) => i.id === selected); if (!inst) return;
    const r = await c.api(`api/directory?institution_id=${encodeURIComponent(selected)}`), f = await c.api(`api/faculty?institution_id=${encodeURIComponent(selected)}`);
    const avg = r.total ? Math.round(r.students.reduce((a, s) => a + s.readiness, 0) / r.total) : 0;
    box.innerHTML = `<h3>${esc(inst.name)}</h3><p class="small muted">${esc(c.S.meta.kind_labels[inst.kind] || "")} · ${esc([inst.city, inst.district, inst.state].filter(Boolean).join(", "))}</p>
      <div class="row" style="margin:10px 0"><span class="count-pill">${r.total} students</span><span class="count-pill">avg readiness ${avg}%</span><span class="count-pill">${f.total} faculty</span></div>
      <div class="people-grid">${r.students.map((p) => personCard(c, p, openBtn(c, p))).join("") || '<p class="muted">No students from this institution have joined yet.</p>'}</div>
      ${f.total ? `<h4 style="margin-top:16px">Faculty</h4><p>${f.faculty.map((x) => `<span class="badge brand">${esc(x.name)} · ${esc(x.department || "")}</span>`).join("")} <a href="faculty.html?id=${encodeURIComponent(selected)}" class="small">contact →</a></p>` : ""}`;
    bindOpen(c, box); c.animate(box);
  }
  el.querySelector("#col-q").oninput = list; el.querySelector("#col-kind").onchange = list; el.querySelector("#col-has").onchange = list;
  await list(); if (selected) students();
}

export async function pPlaces(el, c) {
  const { esc } = c, all = (await c.api("api/directory")).students, geo = c.S.meta.geography;
  const count = (f) => all.filter(f).length;
  el.innerHTML = `${c.head("Students by state, district & city", "Open a place to see who is learning there")}${c.note("places")}
  <div class="grid g2"><div class="card tree"><h3>Places</h3>${Object.entries(geo).map(([state, districts]) => `<details open><summary><span>📍 ${esc(state)}</span><span class="count-pill">${count((s) => s.state === state)} students</span></summary>
      ${Object.entries(districts).map(([d, cities]) => { const n = count((s) => s.state === state && (s.district || "Not specified") === d); return `<details><summary><span>${esc(d)} <span class="small muted">district</span></span><button class="count-pill" data-place="${esc(state)}|${esc(d)}|" data-tip="Show every student in ${esc(d)} district">${n} student${n === 1 ? "" : "s"}</button></summary>
        ${cities.map((ct) => { const k = count((s) => s.state === state && (s.district || "Not specified") === d && (s.city || "Not specified") === ct); return `<button class="inst-row" data-place="${esc(state)}|${esc(d)}|${esc(ct)}"><span>${esc(ct)}</span><span class="count-pill">${k}</span><span aria-hidden="true">›</span></button>`; }).join("")}</details>`; }).join("")}</details>`).join("")}</div>
    <div class="card" id="pl-out"><h3>Students</h3><p class="muted">Choose a state, district or city.</p><div class="people-grid" style="margin-top:12px">${all.slice(0, 6).map((p) => personCard(c, p)).join("")}</div></div></div>`;
  el.querySelectorAll("[data-place]").forEach((b) => (b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation(); const [state, d, city] = b.dataset.place.split("|");
    const rows = all.filter((s) => s.state === state && (!d || (s.district || "Not specified") === d) && (!city || (s.city || "Not specified") === city));
    el.querySelectorAll(".inst-row").forEach((x) => x.classList.toggle("on", x === b));
    const out = el.querySelector("#pl-out");
    out.innerHTML = `<h3>${esc(city || d || state)}</h3><p class="small muted">${esc([city && d, state].filter(Boolean).join(", "))} · ${rows.length} student${rows.length === 1 ? "" : "s"}</p><div class="people-grid">${rows.map((p) => personCard(c, p, openBtn(c, p))).join("") || '<p class="muted">No students here yet.</p>'}</div>`;
    bindOpen(c, out); c.animate(out);
  }));
  c.animate(el);
}

export async function pBrowse(el, c) {
  const { esc } = c, geo = c.S.meta.geography, insts = c.S.meta.institutions;
  el.innerHTML = `${c.head("Find students", "Use the dropdowns: state → district → city → institution")}${c.note("browse")}
  <div class="card"><div class="filter-bar">
      <div><label class="lbl" for="br-state">State</label><select id="br-state">${Object.keys(geo).map((s) => opt(esc(s), esc(s))).join("")}</select></div>
      <div><label class="lbl" for="br-district">District</label><select id="br-district"></select></div>
      <div><label class="lbl" for="br-city">City</label><select id="br-city"></select></div>
      <div><label class="lbl" for="br-inst">University / college</label><select id="br-inst"></select></div>
      <div><label class="lbl" for="br-role">Career goal</label><select id="br-role">${opt("", "Any goal", true)}${c.S.meta.roles.map((r) => opt(esc(r.name), esc(r.name))).join("")}</select></div>
      <div><label class="lbl" for="br-q">Name</label><input id="br-q" placeholder="Search by name"></div></div>
    <div class="row"><span class="count-pill" id="br-count">0</span><button class="btn ghost sm" id="br-clear" data-tip="Clear every filter">Clear filters</button></div></div>
  <div class="people-grid" id="br-out" style="margin-top:16px"></div>`;
  const $ = (id) => el.querySelector(id);
  function fill() {
    const st = $("#br-state").value, d = $("#br-district").value, ct = $("#br-city").value;
    const districts = Object.keys(geo[st] || {});
    $("#br-district").innerHTML = opt("", "All districts", !d) + districts.map((x) => opt(esc(x), esc(x), x === d)).join("");
    const cities = d ? geo[st][d] || [] : [...new Set(districts.flatMap((x) => geo[st][x]))].sort();
    $("#br-city").innerHTML = opt("", "All cities", !ct) + cities.map((x) => opt(esc(x), esc(x), x === ct)).join("");
    const cur = $("#br-inst").value;
    const list = insts.filter((i) => i.state === st && (!d || (i.district || "Not specified") === d) && (!ct || (i.city || "Not specified") === ct));
    $("#br-inst").innerHTML = opt("", `All institutions (${list.length})`, !cur) + list.map((i) => opt(esc(i.id), esc(i.name), i.id === cur)).join("");
  }
  async function run() {
    const p = new URLSearchParams({ state: $("#br-state").value, district: $("#br-district").value === "Not specified" ? "" : $("#br-district").value, city: $("#br-city").value === "Not specified" ? "" : $("#br-city").value, institution_id: $("#br-inst").value, role: $("#br-role").value, q: $("#br-q").value });
    const r = await c.api(`api/directory?${p}`);
    $("#br-count").textContent = `${r.total} student${r.total === 1 ? "" : "s"} found`;
    $("#br-out").innerHTML = r.students.map((x) => personCard(c, x, openBtn(c, x))).join("") || `<div class="card"><p class="muted">No students match these filters yet. Try a wider area.</p></div>`;
    bindOpen(c, $("#br-out")); c.animate($("#br-out"));
  }
  $("#br-state").onchange = () => { $("#br-district").value = ""; $("#br-city").value = ""; fill(); run(); };
  $("#br-district").onchange = () => { $("#br-city").value = ""; $("#br-inst").value = ""; fill(); run(); };
  $("#br-city").onchange = () => { $("#br-inst").value = ""; fill(); run(); };
  ["#br-inst", "#br-role"].forEach((s) => ($(s).onchange = run)); $("#br-q").oninput = run;
  $("#br-clear").onclick = () => { ["#br-district", "#br-city", "#br-inst", "#br-role", "#br-q"].forEach((s) => ($(s).value = "")); fill(); run(); };
  fill(); run();
}

/* ============================ faculty ============================ */
export async function pFaculty(el, c) {
  const { esc } = c, pre = new URLSearchParams(location.search).get("id") || "";
  el.innerHTML = `${c.head("Faculty members", "Find a faculty member, ask a question and learn from them")}${c.note("faculty")}${demoBanner(c)}
  <div class="filter-bar"><div>${instSelect(c, "fa-inst", pre, "All institutions")}</div></div><div class="people-grid" id="fa-out"></div><div id="fa-mine"></div>`;
  async function run() {
    const r = await c.api(`api/faculty?institution_id=${encodeURIComponent(el.querySelector("#fa-inst").value)}`);
    el.querySelector("#fa-out").innerHTML = r.faculty.map((f) => `<div class="glass person"><div class="p-top"><div class="pa">${esc(initials(f.name))}</div><div><b>${esc(f.name)}</b><div class="small muted">${esc(f.department || "Faculty")}</div></div><span></span></div>
        <div class="small muted">🏫 ${esc(f.institution || "")}${f.city ? ` · ${esc(f.city)}` : ""}</div>
        <button class="btn sm" data-ask="${esc(f.id)}" data-name="${esc(f.name)}" data-tip="Send this faculty member a question — they answer here">✉ Ask a question</button>${f.demo ? ' <span class="badge" data-tip="A fictional faculty member for the demo">sample</span>' : ""}</div>`).join("")
      || `<div class="card"><p class="muted">No faculty members have joined from this institution yet.</p><a class="btn sm" href="signup.html">Are you faculty? Sign up</a></div>`;
    el.querySelectorAll("[data-ask]").forEach((b) => (b.onclick = () => ask(b.dataset.ask, b.dataset.name)));
  }
  function ask(id, name) {
    if (!c.S.user) { c.modal(`Ask ${esc(name)}`, `<p>Please sign in first, so ${esc(name)} knows who is asking and can reply to you here.</p><div class="row"><a class="btn primary" href="login.html">Sign in</a><a class="btn ghost" href="signup.html">Create a free account</a></div>`); return; }
    c.modal(`Ask ${esc(name)}`, `<form id="f-ask"><p class="small muted">Your question is saved and shown only to ${esc(name)}. Their answer appears under “My questions” on this page. Email addresses are never shared.</p>
      <div class="field"><label class="lbl" for="ak-msg">Your question</label><textarea id="ak-msg" rows="5" maxlength="2000" placeholder="e.g. I am stuck on SQL joins. Could you suggest how to practise?"></textarea></div>
      <button class="btn primary" type="submit">Send question</button><div id="ak-out" aria-live="assertive"></div></form>`);
    c.onSubmit(document.querySelector("#f-ask"), async () => { const o = document.querySelector("#ak-out");
      try { const r = await c.api(`api/faculty/${encodeURIComponent(id)}/ask`, { message: document.querySelector("#ak-msg").value });
        o.innerHTML = `<div class="form-msg ok">${esc(r.message)}</div>`; c.sound.play("good"); mine(); }
      catch (x) { o.innerHTML = `<div class="form-msg bad">${esc(x.message)}</div>`; } });
  }
  async function mine() {
    const box = el.querySelector("#fa-mine"); if (!c.S.user) { box.innerHTML = ""; return; }
    try { const r = await c.api("api/messages"); const sent = r.messages.filter((m) => m.direction === "sent");
      box.innerHTML = `<h2 class="section-title">💬 My questions <span class="count-pill">${sent.length}</span></h2>` + (sent.map((m) => `<div class="thread glass"><b>To ${esc(m.to_name)}</b> <span class="small muted">· ${esc(String(m.created).slice(0, 16).replace("T", " "))}</span><div class="q">${esc(m.body)}</div>${m.reply ? `<div class="a"><b>${esc(m.to_name)} replied:</b>\n${esc(m.reply)}</div>` : `<span class="badge warn">waiting for a reply</span>`}</div>`).join("") || `<p class="muted">You have not asked anything yet. Pick a faculty member above.</p>`);
    } catch (_) { box.innerHTML = ""; }
  }
  el.querySelector("#fa-inst").onchange = run; run(); mine();
}

export async function pPortal(el, c) {
  const { esc } = c, u = c.S.user;
  if (!u || !["faculty", "admin"].includes(u.role)) {
    el.innerHTML = `${c.head("Faculty portal", "View your students' profiles and progress")}${c.note("portal")}${demoBanner(c)}<div class="card" style="text-align:center;padding:30px">${dollHtml("assessor", 130)}<h3 style="justify-content:center;margin-top:10px">This page is for faculty members</h3>
      <p class="muted">${u ? "Your account is a student account." : "Sign in with a faculty account to see the students of your college."}</p><div class="row" style="justify-content:center"><a class="btn primary" href="login.html">Sign in</a><a class="btn ghost" href="signup.html">Sign up as faculty</a></div></div>`;
    mountAll(el, { mood: "think" }); return;
  }
  const pick = u.role === "admin" ? `<div class="filter-bar"><div><label class="lbl" for="po-inst">Institution (admin)</label>${instSelect(c, "po-inst", "", "All institutions")}</div></div>` : "";
  el.innerHTML = `${c.head(`Faculty portal <span class="grad">· ${esc(u.name)}</span>`, esc(u.institution || ""))}${c.note("portal")}${u.demo ? `<div class="demo-banner" role="note">🧪 <b>Demo faculty session.</b> You only see the fictional sample learners of this college — never real students.</div>` : ""}${pick}<div id="po-inbox"></div><div id="po-out"></div>`;
  async function inbox() {
    const box = el.querySelector("#po-inbox");
    try {
      const r = await c.api("api/messages"), got = r.messages.filter((m) => m.direction === "received");
      box.innerHTML = `<div class="card" style="margin-bottom:16px"><h3>💬 Questions from students <span class="count-pill">${r.unanswered} to answer</span></h3>${got.map((m) => `<div class="thread"><b>${esc(m.from_name)}</b> <span class="small muted">· ${esc(String(m.created).slice(0, 16).replace("T", " "))}</span><div class="q">${esc(m.body)}</div>${m.reply ? `<div class="a"><b>Your reply:</b>\n${esc(m.reply)}</div>` : `<form data-reply="${m.id}"><textarea rows="2" maxlength="2000" placeholder="Write your answer..." aria-label="Reply to ${esc(m.from_name)}"></textarea><button class="btn sm" type="submit" data-tip="The student sees your answer on the Faculty page">Send reply</button></form>`}</div>`).join("") || '<p class="muted">No questions yet. Students can write to you from the Faculty members page.</p>'}</div>`;
      box.querySelectorAll("[data-reply]").forEach((f) => (f.onsubmit = async (e) => { e.preventDefault();
        try { await c.api(`api/messages/${f.dataset.reply}/reply`, { reply: f.querySelector("textarea").value }); c.toast("Reply sent"); c.sound.play("good"); inbox(); } catch (x) { c.toast(x.message); } }));
    } catch (_) { box.innerHTML = ""; }
  }
  inbox();
  async function run() {
    const inst = el.querySelector("#po-inst")?.value || "", r = await c.api(`api/faculty/students?institution_id=${encodeURIComponent(inst)}`), out = el.querySelector("#po-out");
    out.innerHTML = `<div class="grid g4"><div class="card stat"><div class="label">Students</div><div class="value"><span data-count="${r.students.length}">0</span></div><div class="small muted">${esc(r.institution || "")}</div></div>
        <div class="card stat"><div class="label">Average readiness</div><div class="value"><span data-count="${r.avg_readiness}" data-suffix="%">0</span></div>${c.meter(r.avg_readiness)}</div>
        <div class="card stat"><div class="label">Need help</div><div class="value" style="color:var(--amber)"><span data-count="${r.needs_help.length}">0</span></div></div>
        <div class="card stat"><div class="label">Most common gap</div><div class="value sm">${esc(r.common_gaps[0]?.skill || "—")}</div><div class="small muted">${r.common_gaps[0] ? r.common_gaps[0].students + " students" : ""}</div></div></div>
      <div class="grid g2" style="margin-top:16px"><div class="card"><h3>⚠ Students who need help</h3><ol class="next-list">${r.needs_help.map((s) => `<li><div><button class="chip" data-open-student="${esc(s.id)}">${esc(s.name)}</button> <span class="small muted">${esc(s.target_role)} · ${s.readiness}%</span><div>${s.reasons.map((x) => `<span class="badge warn">${esc(x)}</span>`).join("")}</div></div></li>`).join("") || "<li>Everyone is on track 🎉</li>"}</ol></div>
        <div class="card"><h3>📚 Skills to teach next</h3><p class="small muted">Skills the most students are missing — good workshop topics.</p>${r.common_gaps.map((g) => `<div class="skill-line"><b>${esc(g.skill)}</b>${c.meter((g.students / Math.max(1, r.students.length)) * 100)}<span class="small">${g.students} students</span></div>`).join("") || '<p class="muted">No shared gaps.</p>'}</div></div>
      <div class="card" style="margin-top:16px"><h3>All students</h3><div style="overflow-x:auto"><table><tr><th>Name</th><th>Course</th><th>Goal</th><th>Readiness</th><th>Now learning</th><th>Tests</th><th>Avg</th><th>Hours</th><th></th></tr>
        ${r.students.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td class="small">${esc(s.education || "")}</td><td>${esc(s.target_role)}</td><td style="min-width:120px">${c.meter(s.readiness)}<span class="small">${s.readiness}%</span></td><td>${esc(s.active || "—")}${s.remedial.length ? ' <span class="badge bad">remedial</span>' : ""}</td><td>${s.assessments}</td><td>${s.avg_score ?? "—"}</td><td>${s.hours}</td><td><button class="btn sm" data-open-student="${esc(s.id)}" data-tip="Open the full profile">View</button></td></tr>`).join("") || '<tr><td colspan="9" class="muted">No students from your institution have joined yet.</td></tr>'}</table></div></div>`;
    bindOpen(c, out); c.animate(out);
  }
  if (el.querySelector("#po-inst")) el.querySelector("#po-inst").onchange = run; run();
}

/* ============================ compete ============================ */
export async function pCompete(el, c) {
  const { esc } = c, L = c.S.learner;
  el.innerHTML = `${c.head("Compete", "Climb the leaderboard and challenge a classmate")}${c.note("compete")}
  <div class="seg" id="cp-scope" role="tablist"><button class="active" data-v="all" data-tip="Every learner">🌍 Everyone</button><button data-v="institution" data-tip="Only learners from your college">🏫 My college</button></div>
  <div id="cp-board"></div>
  <div class="card" style="margin-top:16px"><h3>⚔ Head-to-head duel</h3><p class="small muted">Race a classmate on quiz questions. Your opponent is played by the computer using <b>their real readiness score</b> — live two-player matches need a real-time server, which is on the roadmap.</p>
    <div class="row"><select id="du-vs" style="max-width:280px" aria-label="Choose an opponent"></select><button class="btn primary sm" id="du-go" data-tip="Five questions, fastest correct answers win">Start duel</button></div><div id="du-out" style="margin-top:14px"></div></div>`;
  let rows = [];
  async function board(scope) {
    const r = await c.api(`api/leaderboard?scope=${scope}&institution_id=${encodeURIComponent(L?.institution_id || "")}`); rows = r.rows;
    const top = rows.slice(0, 3), medals = ["🥇", "🥈", "🥉"];
    el.querySelector("#cp-board").innerHTML = `<div class="podium" style="margin-top:14px">${top.map((p, i) => `<div class="glass pod p${i + 1}"><div class="medal">${medals[i]}</div><b>${esc(p.name)}</b><div class="small muted">${esc(p.institution || "")}</div><div class="count-pill" style="margin-top:6px">${p.points} pts</div></div>`).join("")}</div>
      <div class="card"><div class="rank-row small muted"><span>#</span><span>Learner</span><span>Readiness</span><span>Points</span></div>${rows.map((p) => `<div class="rank-row ${L && p.id === L.id ? "me" : ""}"><span class="rk">${p.rank}</span><span><b>${esc(p.name)}</b>${L && p.id === L.id ? ' <span class="badge brand">you</span>' : ""}<span class="small muted" style="display:block">${esc(p.role || "")} · ${p.passed} passed · ${p.verified} verified · ${p.hours}h</span></span><span>${c.meter(p.readiness)}</span><b>${p.points}</b></div>`).join("") || '<p class="muted">No learners in this group yet.</p>'}
        <p class="small muted" style="margin-top:10px" data-tip="Points reward proven progress, not time spent clicking">Points = 100 × passed assessments + 60 × verified skills + 10 × study hours + 2 × readiness</p></div>`;
    el.querySelector("#du-vs").innerHTML = rows.filter((p) => !L || p.id !== L.id).map((p) => opt(esc(p.id), `${esc(p.name)} · ${p.readiness}% ready`)).join("");
    c.animate(el);
  }
  el.querySelectorAll("#cp-scope button").forEach((b) => (b.onclick = () => { el.querySelectorAll("#cp-scope button").forEach((x) => x.classList.toggle("active", x === b)); board(b.dataset.v); }));
  el.querySelector("#du-go").onclick = () => duel();
  async function duel() {
    const out = el.querySelector("#du-out"), opp = rows.find((p) => p.id === el.querySelector("#du-vs").value); if (!opp || !L) return;
    const skills = (L.roadmap?.nodes || []).filter((n) => !n.is_remedial).map((n) => n.skill), qs = [];
    for (const sk of skills.sort(() => Math.random() - .5).slice(0, 5)) { const q = await c.api(`api/quiz?skill=${encodeURIComponent(sk)}`), i = (Math.random() * q.questions.length) | 0; qs.push({ skill: sk, i, ...q.questions[i] }); }
    let k = 0, me = 0, them = 0, timer = null, locked = false;
    const pOpp = Math.min(.92, .35 + opp.readiness / 160);
    const draw = () => { const q = qs[k]; locked = false;
      out.innerHTML = `<div class="duel"><div><b>${esc(L.name)}</b><div class="duel-bar"><i style="width:${me * 20}%"></i></div><span class="small">${me} / 5</span></div><div class="vs">VS</div><div style="text-align:right"><b>${esc(opp.name)}</b><div class="duel-bar"><i style="width:${them * 20}%"></i></div><span class="small">${them} / 5</span></div></div>
        <div class="guide-strip" style="--ac:${DOLLS[guideForSkill(q.skill)].color};margin-top:14px">${dollHtml(guideForSkill(q.skill), 70)}<div><span class="badge brand">${esc(q.skill)}</span> question ${k + 1} of 5<h3 style="margin-top:6px">${esc(q.q)}</h3></div></div>
        <div class="asteroids">${q.options.map((o, j) => `<button class="asteroid" data-j="${j}"><span class="key">${j + 1}</span>${esc(o)}</button>`).join("")}</div><p class="small muted" id="du-st" aria-live="polite">${esc(opp.name)} is thinking…</p>`;
      const dolls = mountAll(out); out.querySelectorAll(".asteroid").forEach((b) => (b.onclick = () => answer(+b.dataset.j, dolls)));
      timer = setTimeout(() => { if (locked) return; if (Math.random() < pOpp) { them++; out.querySelector("#du-st").textContent = `${opp.name} answered first!`; locked = true; c.sound.play("bad"); setTimeout(next, 1100); } }, 3500 + Math.random() * 4500);
    };
    async function answer(j, dolls) { if (locked) return; locked = true; clearTimeout(timer); const q = qs[k], r = await c.api("api/quiz/check", { skill: q.skill, index: q.i, answer: j }), bs = out.querySelectorAll(".asteroid");
      bs[r.correct_index].classList.add("right"); const d = Object.values(dolls)[0];
      if (r.correct) { me++; c.sound.play("good"); d?.play("cheer"); } else { bs[j].classList.add("wrong"); c.sound.play("bad"); d?.play("sad"); if (Math.random() < pOpp) them++; }
      setTimeout(next, 1100); }
    function next() { k++; if (k < qs.length) return draw(); clearTimeout(timer);
      const win = me > them, tie = me === them, xp = win ? 60 : tie ? 30 : 15, st = c.store(); st.xp = (st.xp || 0) + xp; st.duels = (st.duels || 0) + (win ? 1 : 0); c.saveStore(st); if (win) { c.confetti(); c.sound.play("level"); }
      out.innerHTML = `<div class="result ${win || tie ? "ok" : "bad"}" style="text-align:center"><h3 style="justify-content:center;font-size:26px">${win ? "🏆 You won the duel!" : tie ? "🤝 It's a draw" : "😤 " + esc(opp.name) + " wins this time"}</h3><p>${me} – ${them} · +${xp} XP</p><button class="btn primary sm" id="du-again">Rematch</button></div>`;
      out.querySelector("#du-again").onclick = duel; }
    draw();
  }
  await board("all");
}

/* ============================ agents (dolls) ============================ */
export function pAgents(el, c) {
  const { esc } = c, L = c.S.learner, mine = L ? [...new Set((L.roadmap?.nodes || []).filter((n) => !n.is_remedial).map((n) => guideForSkill(n.skill)))] : [];
  const cardFor = (id, tag) => { const d = DOLLS[id]; return `<div class="glass doll-card tilt" style="--ac:${d.color}" data-doll-card="${id}" tabindex="0" data-tip="Click ${esc(d.name)} to hear what they do" data-cursor="Hello">${dollHtml(id, 150)}<h3>${esc(d.name)}</h3><span class="badge" style="color:${d.color}">${esc(d.role)}</span>${tag || ""}<div class="says">${esc(d.line)}</div></div>`; };
  const skillsOf = (g) => Object.keys(c.S.meta.skills ? Object.fromEntries(c.S.meta.skills.map((s) => [s.name, 1])) : {}).filter((s) => guideForSkill(s) === g);
  el.innerHTML = `${c.head("Meet the agents", "8 AI agents run the platform · 9 skill guides teach each industry")}${c.note("agents")}
  <h2 class="section-title">🤖 The 8 AI agents <span class="muted small">— they work together after every action you take</span></h2><div class="doll-grid">${AGENT_IDS.map((id) => cardFor(id)).join("")}</div>
  <h2 class="section-title">🎓 The 9 skill guides <span class="muted small">— each skill you learn has a guide, so you always know what kind of skill it is</span></h2>
  <div class="doll-grid">${GUIDE_IDS.map((id) => cardFor(id, `${mine.includes(id) ? ' <span class="badge ok">on your path</span>' : ""}<p>${skillsOf(id).slice(0, 6).map(esc).join(" · ")}</p>`)).join("")}</div>`;
  const dolls = mountAll(el);
  el.querySelectorAll("[data-doll-card]").forEach((card) => { const id = card.dataset.dollCard, hello = () => { dolls[id]?.play("wave", 2200); c.sound.play("click"); c.speak?.(`${DOLLS[id].name}. ${DOLLS[id].line}`); };
    card.onclick = hello; card.onkeydown = (e) => e.key === "Enter" && hello(); card.onpointerenter = () => dolls[id]?.play("wave", 1400); });
}

export function pGames(el, c) {
  el.innerHTML = `${c.head("Games", "Learn by playing — hosted by your 3D skill guides")}${c.note("games")}<div id="games-host"></div>`;
  renderGames(el.querySelector("#games-host"), { ...c, learner: c.S.learner });
}

/* ============================ about / contact ============================ */
export function pAbout(el, c) {
  const { esc } = c, m = c.S.meta;
  el.innerHTML = `${c.head("About SkillForge AI", "Why it exists, how it works, and what it protects")}
  <div class="glass about-hero"><div class="row" style="gap:22px;align-items:center"><div>${dollHtml("mentor", 150)}</div><div style="flex:1;min-width:260px"><h2>Every learner deserves their own path.</h2>
    <p>Universities and companies often cannot see which skills each student or employee is missing, and most learning platforms give everyone the same course. SkillForge AI uses a team of eight cooperating AI agents to understand one person's skills, compare them with a real job role and real employers, and build a path that changes as that person learns.</p></div></div></div>
  <div class="grid g4"><div class="card stat"><div class="label">AI agents</div><div class="value"><span data-count="8">0</span></div></div><div class="card stat"><div class="label">Industries</div><div class="value"><span data-count="${Object.keys(m.industries).length}">0</span></div></div>
    <div class="card stat"><div class="label">Job roles</div><div class="value"><span data-count="${m.roles.length}">0</span></div></div><div class="card stat"><div class="label">TN institutions</div><div class="value"><span data-count="${m.institutions.length}">0</span></div></div></div>
  <div class="grid g2" style="margin-top:16px"><div class="card"><h3>What it does</h3><ul class="check-list"><li><b>User profile</b> — details, skills, certifications, projects and career goals.</li><li><b>Skill analysis</b> — strengths and weaknesses from skills and assessments.</li><li><b>Career matching</b> — your skills against a chosen role and the companies hiring for it.</li><li><b>Learning recommendations</b> — courses, tutorials and practical exercises in the right order.</li><li><b>Progress tracking</b> — learning hours, scores and achievements.</li><li><b>AI mentor</b> — guidance that updates after every success or struggle.</li></ul></div>
    <div class="card"><h3>How your data is protected</h3><ul class="check-list"><li>Passwords are hashed with PBKDF2-SHA256 and a unique salt — never stored or shown.</li><li>Sign-in sessions use HttpOnly cookies that scripts cannot read.</li><li>Full profiles open only for the student, faculty of the same college, or an admin.</li><li>Every form is cleaned on the server; pages escape everything a person typed.</li><li>Sign-in, sign-up and contact forms are rate-limited against abuse.</li><li>No API keys or secrets live in the code or the repository.</li></ul></div></div>
  <div class="grid g2" style="margin-top:16px"><div class="card"><h3>Built for everyone</h3><ul class="check-list"><li>Bright and dark modes, plus a calm minimalist style.</li><li>Text size up to 150%, high-contrast mode and wide letter spacing.</li><li>Reduce-motion switch; the whole site works by keyboard.</li><li>A voice agent that reads pages aloud and follows spoken commands.</li><li>Hover notes that explain every control.</li></ul><p class="small muted">Open ⚙ in the top bar to change these.</p></div>
    <div class="card"><h3>Honest limits</h3><ul class="check-list"><li>Company hiring details are indicative — always confirm on the official careers page.</li><li>${esc(m.institution_note)}</li><li>Quizzes are short checks, not certifications.</li><li>The hosted web demo keeps data in your browser; the server version uses a database.</li></ul><div class="row" style="margin-top:12px"><a class="btn primary sm" href="contact.html">Contact us</a><a class="btn ghost sm" href="https://github.com/G-Jayakiruthika/skillforge-ai" target="_blank" rel="noopener">Source on GitHub ↗</a></div></div></div>`;
  mountAll(el, { mood: "wave" });
}

export function pContact(el, c) {
  const { esc } = c, u = c.S.user || {};
  el.innerHTML = `${c.head("Contact us", "Questions, feedback, or want your college added?")}${c.note("contact")}${demoBanner(c)}
  <div class="auth-wrap"><form class="card" id="f-contact" novalidate>
      <div class="row"><div class="field grow"><label class="lbl" for="ct-name">Your name</label><input id="ct-name" autocomplete="name" maxlength="80" value="${esc(u.name || "")}" required></div><div class="field grow"><label class="lbl" for="ct-email">Email</label><input id="ct-email" type="email" autocomplete="email" maxlength="254" value="${esc(u.email || "")}" required></div></div>
      <div class="field"><label class="lbl" for="ct-inst">College / university (optional)</label>${instSelect(c, "ct-inst", u.institution_id || "", "— not applicable —")}</div>
      <div class="field"><label class="lbl" for="ct-subject">Subject</label><select id="ct-subject"><option>General question</option><option>Add my college or university</option><option>Report a problem</option><option>Feedback or idea</option><option>Faculty / institution partnership</option></select></div>
      <div class="field"><label class="lbl" for="ct-msg">Message</label><textarea id="ct-msg" rows="6" maxlength="4000" required placeholder="Write your message (at least 10 characters)"></textarea><div class="small muted"><span id="ct-len">0</span> / 4000</div></div>
      <input class="hp" tabindex="-1" autocomplete="off" id="ct-hp" aria-hidden="true">
      <button class="btn primary" type="submit" data-tip="Your message is saved to the database">Send message</button><div id="ct-out" aria-live="assertive"></div></form>
    <div class="card auth-side">${dollHtml("supervisor", 150)}<h3 style="justify-content:center;margin-top:10px">${esc(DOLLS.supervisor.name)} routes your message</h3>
      <ul class="check-list" style="text-align:left;margin-top:12px"><li>Saved in the database; only an admin can read it.</li><li>Your email is used only to reply.</li><li>Up to 5 messages per hour, to stop spam.</li></ul></div></div>`;
  mountAll(el, { mood: "wave" });
  const msg = el.querySelector("#ct-msg"); msg.oninput = () => (el.querySelector("#ct-len").textContent = msg.value.length);
  el.querySelector("#f-contact").onsubmit = async (e) => {
    e.preventDefault(); const out = el.querySelector("#ct-out"), sel = el.querySelector("#ct-inst");
    try {
      const r = await c.api("api/contact", { name: el.querySelector("#ct-name").value, email: el.querySelector("#ct-email").value, subject: el.querySelector("#ct-subject").value, message: msg.value,
        institution: sel.value ? sel.options[sel.selectedIndex].text : "", website: el.querySelector("#ct-hp").value });
      out.innerHTML = `<div class="form-msg ok">${esc(r.message || "Thank you — your message has been saved.")} Reference #${Number(r.id) || 0}.</div>`; msg.value = ""; el.querySelector("#ct-len").textContent = "0"; c.sound.play("good"); c.confetti();
    } catch (x) { out.innerHTML = `<div class="form-msg bad">${esc(x.message)}</div>`; c.sound.play("bad"); }
  };
}

/* ---------- password reset and email verification ----------
   The server never says whether an address has an account, so neither do these
   pages: the "check your inbox" message is shown either way. */
export function pForgot(el, c) {
  const { esc } = c;
  el.innerHTML = `${c.head("Forgot your password?", "We'll email you a link to set a new one")}${c.note("forgot")}
  <div class="auth-wrap"><form class="card" id="f-forgot" novalidate>
      <div class="field"><label class="lbl" for="fg-email">The email you signed up with</label>
        <input id="fg-email" type="email" autocomplete="email" required maxlength="254"></div>
      <button class="btn primary" type="submit" data-tip="Sends a single-use link that expires in an hour">Email me a reset link</button>
      <a href="login.html" class="small" style="margin-left:10px">Back to sign in</a>
      <div id="fg-msg" aria-live="assertive"></div></form>
    <div class="card auth-side">${dollHtml("supervisor", 140)}
      <h3 style="justify-content:center;margin-top:10px">How it works</h3>
      <ul class="check-list" style="text-align:left;margin-top:12px">
        <li>The link works once and expires after an hour.</li>
        <li>Asking again cancels any earlier link.</li>
        <li>Setting a new password signs you out everywhere else.</li>
        <li>We never say whether an address has an account — that would let anyone test who has registered.</li>
      </ul></div></div>`;
  mountAll(el, { mood: "think" });
  c.onSubmit(el.querySelector("#f-forgot"), async () => {
    const msg = el.querySelector("#fg-msg");
    msg.innerHTML = `<div class="form-msg">Sending…</div>`;
    try {
      const r = await c.api("api/auth/forgot", { email: el.querySelector("#fg-email").value });
      msg.innerHTML = `<div class="form-msg ok">${esc(r.message)}</div>`;
    } catch (x) { msg.innerHTML = `<div class="form-msg bad">${esc(x.message)}</div>`; }
  });
}

export function pReset(el, c) {
  const { esc } = c;
  const token = new URLSearchParams(location.search).get("token") || "";
  el.innerHTML = `${c.head("Choose a new password", "")}
  <div class="auth-wrap"><form class="card" id="f-reset" novalidate>
      ${token ? "" : `<div class="form-msg bad">This link is missing its token. Open the link from your email exactly as it was sent, or <a href="forgot.html">ask for a new one</a>.</div>`}
      <div class="field"><label class="lbl" for="rs-pw">New password</label>
        <input id="rs-pw" type="password" autocomplete="new-password" required minlength="8" maxlength="200" data-tip="At least 8 characters with a letter and a number">
        <div class="pw-meter"><i id="rs-meter"></i></div><div class="field-err" id="rs-err" aria-live="polite"></div></div>
      <div class="field"><label class="lbl" for="rs-pw2">Confirm new password</label>
        <input id="rs-pw2" type="password" autocomplete="new-password" required maxlength="200"></div>
      <button class="btn primary" type="submit" ${token ? "" : "disabled"}>Set my new password</button>
      <div id="rs-msg" aria-live="assertive"></div></form>
    <div class="card auth-side">${dollHtml("assessor", 140)}
      <h3 style="justify-content:center;margin-top:10px">After this</h3>
      <ul class="check-list" style="text-align:left;margin-top:12px">
        <li>Every device signed in to your account is signed out.</li>
        <li>This link stops working, even for you.</li>
        <li>Your email address counts as confirmed, because you opened the link.</li>
      </ul></div></div>`;
  mountAll(el, { mood: "idle" });
  const pw = el.querySelector("#rs-pw"), meter = el.querySelector("#rs-meter"), err = el.querySelector("#rs-err");
  pw.oninput = () => {
    const p = pw.value, prob = passwordProblem(p);
    const score = Math.min(4, (p.length >= 8) + (p.length >= 12) + (/[A-Z]/.test(p) && /[a-z]/.test(p)) + (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)));
    meter.style.width = `${(prob ? Math.min(1, score) : Math.max(2, score)) * 25}%`;
    meter.style.background = prob ? "var(--red)" : score >= 3 ? "var(--lime)" : "var(--amber)";
    err.textContent = p && prob ? prob : "";
  };
  c.onSubmit(el.querySelector("#f-reset"), async () => {
    const msg = el.querySelector("#rs-msg");
    try {
      const r = await c.api("api/auth/reset", { token, password: pw.value, confirm: el.querySelector("#rs-pw2").value });
      pw.value = el.querySelector("#rs-pw2").value = "";
      c.sound.play("level");
      msg.innerHTML = `<div class="form-msg ok">${esc(r.message)} <a href="login.html">Sign in</a></div>`;
    } catch (x) { msg.innerHTML = `<div class="form-msg bad">${esc(x.message)}</div>`; c.sound.play("bad"); }
  });
}

export async function pVerify(el, c) {
  const { esc } = c;
  const token = new URLSearchParams(location.search).get("token") || "";
  el.innerHTML = `${c.head("Confirming your email", "")}<div class="card loading-card"><span class="spinner" aria-hidden="true"></span> Checking the link…</div>`;
  if (!token) {
    el.innerHTML = `${c.head("Confirming your email", "")}<div class="card error-card"><h3>That link is incomplete</h3>
      <p class="small muted">Open the link from your email exactly as it was sent. If it still fails, sign in and ask for a new one from your Account page.</p>
      <a class="btn ghost sm" href="login.html">Sign in</a></div>`;
    return;
  }
  try {
    const r = await c.api("api/auth/verify", { token });
    c.confetti();
    el.innerHTML = `${c.head("Email confirmed", "")}<div class="card"><h3>✓ ${esc(r.message)}</h3>
      <p class="small muted">You can now recover your account by email if you ever forget your password.</p>
      <a class="btn primary sm" href="app.html">Open my dashboard</a></div>`;
  } catch (x) {
    el.innerHTML = `${c.head("Confirming your email", "")}<div class="card error-card"><h3>That link did not work</h3>
      <p class="small muted">${esc(x.message)}</p>
      <a class="btn ghost sm" href="login.html">Sign in</a></div>`;
  }
}
