/* SkillForge AI - dashboard (vanilla JS, no build step) */
const S = { meta: null, learner: null, learners: [], selected: null, quiz: null, quizSkill: null, mode: "quiz" };
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

async function api(path, body) {
  const opts = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || res.statusText);
  return data;
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
}

/* ---------- boot ---------- */
async function boot() {
  try {
    const [health, meta] = await Promise.all([api("/api/health"), api("/api/meta")]);
    S.meta = meta;
    $("#engine-pill").textContent = `${health.agents.length} agents · ${health.agent_engine} · Gemini: ${health.gemini.split(" ")[0]}`;
    $("#engine-pill").title = `Gemini: ${health.gemini}`;
  } catch (e) { $("#engine-pill").textContent = "backend offline"; return; }
  await loadLearners();
  const first = localStorage.getItem("sf-learner") || (S.learners[0] && S.learners[0].id);
  if (first) await selectLearner(first); else renderAll();
}
async function loadLearners() {
  S.learners = await api("/api/learners");
  $("#learner-select").innerHTML = S.learners.map((l) => `<option value="${esc(l.id)}">${esc(l.name)} - ${esc(l.target_role)}</option>`).join("");
}
async function selectLearner(id) {
  try {
    const r = await api(`/api/learners/${encodeURIComponent(id)}`);
    S.learner = r.learner; S.selected = null;
    try { localStorage.setItem("sf-learner", id); } catch (_) {}
    $("#learner-select").value = id;
    renderAll();
  } catch (e) { if (S.learners[0] && id !== S.learners[0].id) selectLearner(S.learners[0].id); }
}
function applyResult(r) {
  S.learner = r.learner;
  renderAll();
  showTrace(r.trace || []);
  const l = S.learners.find((x) => x.id === r.learner.id);
  if (!l) loadLearners().then(() => ($("#learner-select").value = r.learner.id));
}

/* ---------- agent bus ---------- */
function showTrace(trace) {
  if (!trace.length) return;
  const list = $("#bus-list"); list.innerHTML = "";
  $("#bus").classList.remove("collapsed");
  trace.forEach((t, i) => setTimeout(() => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="who">${esc(t.agent)}</span>${t.to ? ` <span class="to">→ ${esc(t.to.replace(/_/g, " "))}</span>` : ""}<br>${esc(t.msg)}`;
    list.appendChild(li); list.scrollTop = list.scrollHeight;
  }, i * 260));
}

/* ---------- render ---------- */
function renderAll() {
  renderDashboard(); renderProfile(); renderRoadmap(); renderProgress(); renderMentor(); renderOrg();
}
const statusBadge = (s) => ({ met: "ok", partial: "warn", missing: "bad" }[s] || "");
const confBadge = (c) => ({ verified: "ok", evidence: "brand", "self-reported": "" }[c] || "");

function renderDashboard() {
  const L = S.learner, el = $("#tab-dashboard");
  if (!L) { el.innerHTML = `<div class="card"><h2>Welcome to SkillForge AI</h2><p>Create a learner profile to begin.</p><button class="btn" onclick="newLearner()">Create profile</button></div>`; return; }
  const m = L.match || {}, rm = L.roadmap || {}, an = L.analysis || {}, mentor = L.mentor || {};
  el.innerHTML = `
  <div class="grid g4">
    <div class="card stat"><div class="label">Readiness for ${esc(m.role)}</div><div class="value">${m.readiness ?? 0}%</div><div class="bar"><span style="width:${m.readiness || 0}%"></span></div></div>
    <div class="card stat"><div class="label">Skills met / required</div><div class="value">${(m.matched || []).length} / ${(m.skills || []).length}</div><div class="small muted">${(m.partial || []).length} partial · ${(m.missing || []).length} missing</div></div>
    <div class="card stat"><div class="label">Current milestone</div><div class="value" style="font-size:20px">${esc(rm.active || "All done")}</div><div class="small muted">${L.remedial && Object.keys(L.remedial).length ? '<span class="badge bad">remedial lab active</span>' : ""}</div></div>
    <div class="card stat"><div class="label">Estimated time to job-ready</div><div class="value">${rm.eta_weeks ?? 0} wks</div><div class="small muted">${rm.hours_remaining ?? 0}h left at ${rm.hours_per_week ?? 0}h/week</div></div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card mentor-card">
      <h3>AI Mentor <span class="badge brand">${esc(mentor.source || "")}</span></h3>
      <p>${esc(mentor.message || "")}</p>
      <h4>Next actions</h4>
      <ul class="clean">${(mentor.next_actions || []).map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
      <div class="row" style="margin-top:10px"><button class="btn fit" onclick="openAssess('${esc(rm.active || "")}')" ${rm.active ? "" : "disabled"}>Take ${esc(rm.active || "")} assessment</button>
      <button class="btn ghost fit" onclick="go('roadmap')">Open roadmap</button></div>
    </div>
    <div class="card"><h3>Skill gap radar - current vs required</h3>${radar(m.skills || [])}
      <div class="legend small"><span><i style="background:#4f46e5"></i>Current</span><span><i style="background:#f59e0b"></i>Required</span></div></div>
  </div>
  <div class="grid g3" style="margin-top:16px">
    <div class="card"><h3>Strengths</h3>${(an.strengths || []).map((s) => `<div class="skill-row"><b>${esc(s.skill)}</b><div class="bar"><span style="width:${s.score}%;background:var(--ok)"></span></div><span class="badge ${confBadge(s.confidence)}">${s.score} · ${esc(s.confidence)}</span></div>`).join("") || '<p class="muted">None yet - verify a skill with an assessment.</p>'}</div>
    <div class="card"><h3>Weaknesses to strengthen</h3>${(an.weaknesses || []).map((w) => `<div class="skill-row"><b>${esc(w.skill)}</b><div class="bar"><span style="width:${w.score}%;background:var(--warn)"></span><i style="left:${w.required}%"></i></div><span class="badge warn">${w.score}/${w.required}</span></div>${w.missed_concepts.length ? `<div class="small muted" style="margin:-4px 0 6px 130px">weak concepts: ${w.missed_concepts.map(esc).join(", ")}</div>` : ""}`).join("") || '<p class="muted">No partial skills.</p>'}
      ${(an.unverified || []).length ? `<p class="small muted">Self-reported (verify with a quiz): ${an.unverified.map(esc).join(", ")}</p>` : ""}</div>
    <div class="card"><h3>Career match across roles</h3>${(m.role_ranking || []).map((r) => `<div class="skill-row" style="grid-template-columns:1fr 90px 40px"><span>${esc(r.role)}${r.role === m.role ? ' <span class="badge brand">target</span>' : ""}</span><div class="bar"><span style="width:${r.readiness}%"></span></div><b>${r.readiness}%</b></div>`).join("")}
      <div class="row" style="margin-top:10px"><select id="pivot-role">${S.meta.roles.map((r) => `<option ${r.name === m.role ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select><button class="btn fit" onclick="pivot()">Change goal</button></div></div>
  </div>
  <div class="card" style="margin-top:16px"><h3>Role requirements - ${esc(m.role)}</h3><p class="muted small">${esc(m.description)}</p>
    <table><tr><th>Skill</th><th>Required</th><th>Current</th><th>Gap</th><th>Status</th><th>Evidence</th></tr>
    ${(m.skills || []).map((s) => `<tr><td>${esc(s.skill)}</td><td>${s.required}</td><td>${s.current}</td><td>${s.gap}</td><td><span class="badge ${statusBadge(s.status)}">${s.status}</span></td><td><span class="badge ${confBadge(s.confidence)}">${esc(s.confidence)}</span></td></tr>`).join("")}</table></div>`;
}

function radar(rows) {
  if (!rows.length) return "";
  const W = 340, cx = W / 2, cy = 160, R = 120, n = rows.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [cx + Math.cos(a) * R * v / 100, cy + Math.sin(a) * R * v / 100]; };
  const poly = (key) => rows.map((r, i) => pt(i, Math.max(4, r[key])).join(",")).join(" ");
  let g = "";
  [25, 50, 75, 100].forEach((v) => (g += `<polygon points="${rows.map((_, i) => pt(i, v).join(",")).join(" ")}" fill="none" stroke="#e3e6ee"/>`));
  rows.forEach((r, i) => { const [x, y] = pt(i, 100); const [lx, ly] = pt(i, 118); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e3e6ee"/><text x="${lx}" y="${ly}" font-size="11" text-anchor="middle" dominant-baseline="middle" fill="#6b7385">${esc(r.skill)}</text>`; });
  return `<svg viewBox="0 0 ${W} 320" width="100%" role="img" aria-label="Skill radar">${g}
    <polygon points="${poly("required")}" fill="rgba(245,158,11,.12)" stroke="#f59e0b" stroke-dasharray="4 3" stroke-width="2"/>
    <polygon points="${poly("current")}" fill="rgba(79,70,229,.22)" stroke="#4f46e5" stroke-width="2"/></svg>`;
}

/* ---------- profile ---------- */
function renderProfile() {
  const L = S.learner || { skills: [], certifications: [], projects: [] }, el = $("#tab-profile");
  const levels = S.meta ? S.meta.levels.filter((l) => l !== "basic") : ["beginner", "intermediate", "advanced"];
  const skillItem = (s = {}) => `<div class="item"><input placeholder="e.g. Python, basic HTML, js" value="${esc(s.name)}" data-k="name"><select data-k="level">${levels.map((l) => `<option ${l === (s.level || "intermediate") ? "selected" : ""}>${l}</option>`).join("")}</select><button class="icon-btn" onclick="this.parentElement.remove()" title="Remove">&times;</button></div>`;
  const certItem = (c = {}) => `<div class="item two"><input placeholder="Certification name" value="${esc(c.name)}" data-k="name"><input placeholder="Issuer (optional)" value="${esc(c.issuer)}" data-k="issuer"><button class="icon-btn" onclick="this.parentElement.remove()">&times;</button></div>`;
  const projItem = (p = {}) => `<div class="item two"><input placeholder="Project title" value="${esc(p.name)}" data-k="name"><input placeholder="What it does + tech used" value="${esc(p.description)}" data-k="description"><button class="icon-btn" onclick="this.parentElement.remove()">&times;</button></div>`;
  window._tpl = { skillItem, certItem, projItem };
  el.innerHTML = `
  <div class="grid g2">
    <div class="card">
      <h2>${S.learner ? "Edit learner profile" : "New learner profile"}</h2>
      <div class="row"><div class="field"><label>Full name</label><input id="p-name" value="${esc(L.name)}"></div>
        <div class="field"><label>Email</label><input id="p-email" value="${esc(L.email)}"></div></div>
      <div class="row"><div class="field"><label>Organization / college</label><input id="p-org" value="${esc(L.organization)}"></div>
        <div class="field"><label>Study hours per week</label><input id="p-hours" type="number" min="1" max="60" value="${esc(L.hours_per_week || 8)}"></div></div>
      <div class="field"><label>Career goal (target role)</label><select id="p-role">${S.meta.roles.map((r) => `<option ${r.name === L.target_role ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Interests</label><input id="p-int" value="${esc(L.interests)}" placeholder="e.g. web apps, analytics"></div>
      <h3>Existing skills</h3><div class="list-edit" id="p-skills">${(L.skills || []).map(skillItem).join("")}</div>
      <button class="btn ghost sm" onclick="addItem('p-skills','skillItem')">+ Add skill</button>
      <h3 style="margin-top:14px">Certifications</h3><div class="list-edit" id="p-certs">${(L.certifications || []).map(certItem).join("")}</div>
      <button class="btn ghost sm" onclick="addItem('p-certs','certItem')">+ Add certification</button>
      <h3 style="margin-top:14px">Projects</h3><div class="list-edit" id="p-projs">${(L.projects || []).map(projItem).join("")}</div>
      <button class="btn ghost sm" onclick="addItem('p-projs','projItem')">+ Add project</button>
      <div class="row" style="margin-top:16px"><button class="btn fit" onclick="saveProfile()">Save &amp; run diagnosis</button>
        <button class="btn ghost fit" onclick="loadSample()">Fill sample scenario</button></div>
    </div>
    <div>
      <div class="card"><h3>Import from resume / LinkedIn text</h3>
        <p class="small muted">Paste your resume or LinkedIn "About + Skills" text. The Profiler agent extracts skills${S.meta ? "" : ""} and maps them to the standard taxonomy.</p>
        <textarea id="p-resume" rows="7" placeholder="e.g. MCA student. Skills: Python, MySQL, HTML, CSS, basic JavaScript. Built a Flask REST API..."></textarea>
        <button class="btn ghost" style="margin-top:8px" onclick="extractResume()">Extract skills</button><div id="p-extract" class="small" style="margin-top:8px"></div></div>
      ${S.learner ? `<div class="card" style="margin-top:16px"><h3>How the Profiler read your profile</h3>
        <table><tr><th>Skill</th><th>Score</th><th>Confidence</th><th>Evidence</th></tr>
        ${Object.entries(L.proficiency || {}).sort((a, b) => b[1].score - a[1].score).map(([k, p]) => `<tr><td>${esc(k)}<div class="small muted">${esc(p.esco)}</div></td><td>${p.score}</td><td><span class="badge ${confBadge(p.confidence)}">${esc(p.confidence)}</span></td><td class="small">${p.sources.map(esc).join("<br>") || "assessment"}</td></tr>`).join("")}</table>
        ${(L.unmapped_skills || []).length ? `<p class="small muted">Not in taxonomy yet: ${L.unmapped_skills.map(esc).join(", ")}</p>` : ""}</div>` : ""}
    </div>
  </div>`;
  if (!(L.skills || []).length) addItem("p-skills", "skillItem");
}
function addItem(id, tpl, data) { $("#" + id).insertAdjacentHTML("beforeend", window._tpl[tpl](data || {})); }
function readList(id) {
  return [...document.querySelectorAll(`#${id} .item`)].map((row) => {
    const o = {}; row.querySelectorAll("[data-k]").forEach((i) => (o[i.dataset.k] = i.value.trim())); return o;
  }).filter((o) => o.name);
}
async function saveProfile() {
  const body = {
    id: S.learner ? S.learner.id : undefined, name: $("#p-name").value.trim(), email: $("#p-email").value.trim(),
    organization: $("#p-org").value.trim(), hours_per_week: Number($("#p-hours").value) || 8, target_role: $("#p-role").value,
    interests: $("#p-int").value.trim(), skills: readList("p-skills"), certifications: readList("p-certs"), projects: readList("p-projs"),
  };
  if (!body.name) return toast("Please enter a name");
  try { const r = await api("/api/learners", body); applyResult(r); await loadLearners(); $("#learner-select").value = r.learner.id; try { localStorage.setItem("sf-learner", r.learner.id); } catch (_) {} toast("Diagnosis complete"); go("dashboard"); }
  catch (e) { toast(e.message); }
}
function newLearner() { S.learner = null; renderProfile(); go("profile"); }
function loadSample() {
  $("#p-name").value = $("#p-name").value || "Sample Student"; $("#p-role").value = "Full Stack Developer"; $("#p-hours").value = 8;
  $("#p-skills").innerHTML = ""; [{ name: "Python", level: "intermediate" }, { name: "SQL", level: "intermediate" }, { name: "basic HTML", level: "beginner" }].forEach((s) => addItem("p-skills", "skillItem", s));
}
async function extractResume() {
  const text = $("#p-resume").value; if (!text.trim()) return toast("Paste some text first");
  const r = await api("/api/resume/extract", { text });
  const have = new Set(readList("p-skills").map((s) => s.name.toLowerCase()));
  let added = 0;
  (r.skills || []).forEach((s) => { if (!have.has(String(s.name).toLowerCase())) { addItem("p-skills", "skillItem", s); added++; } });
  (r.certifications || []).forEach((c) => addItem("p-certs", "certItem", c));
  (r.projects || []).forEach((p) => addItem("p-projs", "projItem", p));
  $("#p-extract").innerHTML = `Found ${r.skills.length} skills via <b>${esc(r.extractor)}</b>: ${r.skills.map((s) => esc(s.name)).join(", ") || "none"}. ${added} added - review levels, then Save.`;
}

/* ---------- roadmap ---------- */
const STATUS_TEXT = { mastered: "Mastered", active: "Start here", available: "Unlocked", locked: "Locked - finish prerequisites", remedial: "Remedial lab - do this first", paused: "Paused until remedial lab is cleared" };
function renderRoadmap() {
  const L = S.learner, el = $("#tab-roadmap"); if (!L) { el.innerHTML = ""; return; }
  const rm = L.roadmap || {}, nodes = rm.nodes || [];
  const colW = 240, rowH = 92;
  const cols = {}; nodes.forEach((n) => (cols[n.depth] = cols[n.depth] || []).push(n));
  const pos = {}; let maxRows = 0;
  Object.entries(cols).forEach(([d, list]) => { list.forEach((n, i) => (pos[n.id] = { x: Number(d) * colW + 10, y: i * rowH + 10 })); maxRows = Math.max(maxRows, list.length); });
  const width = (Math.max(...Object.keys(cols).map(Number), 0) + 1) * colW + 20, height = maxRows * rowH + 20;
  const bySkill = {}; nodes.forEach((n) => { if (!n.is_remedial) bySkill[n.skill] = n; });
  let lines = "";
  nodes.forEach((n) => (n.prerequisites || []).forEach((grp) => grp.split("|").forEach((p) => {
    const from = bySkill[p]; if (!from) return; const a = pos[from.id], b = pos[n.id];
    lines += `<path d="M${a.x + 200} ${a.y + 32} C ${a.x + 220} ${a.y + 32}, ${b.x - 20} ${b.y + 32}, ${b.x} ${b.y + 32}" fill="none" stroke="#c7cbe0" stroke-width="2" marker-end="url(#arr)"/>`;
  })));
  nodes.filter((n) => n.is_remedial).forEach((n) => { const a = pos[n.id], b = pos[bySkill[n.skill]?.id]; if (a && b) lines += `<path d="M${a.x + 100} ${a.y + 64} L ${b.x + 100} ${b.y}" stroke="#d23c3c" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#arr)"/>`; });
  if (!S.selected || !nodes.find((n) => n.id === S.selected)) S.selected = (nodes.find((n) => ["remedial", "active"].includes(n.status)) || nodes[0] || {}).id;
  const sel = nodes.find((n) => n.id === S.selected);
  el.innerHTML = `
  <div class="card">
    <div class="row"><h2 style="margin:0">Personalised roadmap - ${esc(L.target_role)}</h2>
      <div class="legend fit"><span><i style="background:var(--ok)"></i>Mastered</span><span><i style="background:var(--brand)"></i>Active</span><span><i style="background:#a5b4fc"></i>Unlocked</span><span><i style="background:var(--bad)"></i>Remedial</span><span><i style="background:var(--lock)"></i>Locked</span></div></div>
    <p class="small muted">Ordered by prerequisites (topological sort of the skill graph). Click a milestone for resources, a micro-project and its assessment.</p>
    <div class="dag-wrap"><div class="dag" style="width:${width}px;height:${height}px">
      <svg width="${width}" height="${height}"><defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#9aa1b2"/></marker></defs>${lines}</svg>
      ${nodes.map((n) => `<div class="node ${n.status} ${n.id === S.selected ? "selected" : ""}" style="left:${pos[n.id].x}px;top:${pos[n.id].y}px" onclick="S.selected='${n.id}';renderRoadmap()">
        <div class="t">${esc(n.title || n.skill)}</div><div class="s">${STATUS_TEXT[n.status] || n.status}</div>
        <div class="s">${n.status === "mastered" ? `${n.current}/${n.required}` : `${n.current}/${n.required} · ~${n.est_hours}h`}</div></div>`).join("")}
    </div></div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card">${sel ? nodeDetail(sel) : ""}</div>
    <div class="card"><h3>Weekly study plan (${rm.hours_per_week}h/week)</h3>
      <p class="small muted">${rm.hours_remaining}h remaining · target date ${esc(rm.eta_date || "-")}</p>
      ${(rm.weeks || []).slice(0, 8).map((w) => `<div class="week"><b>Week ${w.week}</b><div class="small">${w.items.map((i) => `${esc(i.item)} (${i.hours}h)`).join(" · ")}</div></div>`).join("") || '<p class="muted">Nothing left - every milestone is mastered!</p>'}
      ${(rm.weeks || []).length > 8 ? `<p class="small muted">+ ${rm.weeks.length - 8} more weeks</p>` : ""}</div>
  </div>`;
}
function nodeDetail(n) {
  const canAssess = !["locked"].includes(n.status);
  return `<h3>${esc(n.title || n.skill)} <span class="badge">${esc(n.esco)}</span></h3>
    <p class="small">${STATUS_TEXT[n.status] || ""}${n.prerequisites && n.prerequisites.length ? ` · Prerequisites: ${n.prerequisites.map((p) => esc(p.replace("|", " or "))).join(", ")}` : ""}</p>
    ${n.is_remedial ? `<p class="small"><b>Targets the concepts you missed:</b> ${(n.missed_concepts || []).map((c) => `<span class="badge bad">${esc(c.replace(/_/g, " "))}</span>`).join("")}${n.attempts > 1 ? ` · attempt #${n.attempts}` : ""}</p>` : ""}
    ${n.format_note ? `<p class="small" style="color:var(--warn)">${esc(n.format_note)}</p>` : ""}
    <h4>Learning resources</h4>
    ${(n.resources || []).map((r) => `<div class="res"><span class="badge brand">${esc(r.type)}</span><div><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a><div class="small muted">~${r.hours}h</div></div></div>`).join("")}
    <h4 style="margin-top:10px">Micro-project</h4><p>${esc(n.project)}</p>
    <div class="row" style="flex-wrap:wrap">
      <button class="btn fit" ${canAssess ? "" : "disabled"} onclick="openAssess('${esc(n.skill)}')">Take assessment</button>
      <input class="fit" style="width:80px" type="number" min="0.5" max="12" step="0.5" value="1" id="log-h">
      <button class="btn ghost fit" onclick="logHours('${esc(n.skill)}')">Log study hours</button>
    </div>
    <p class="small muted">Logged so far: ${n.logged_hours || 0}h of ~${n.est_hours}h</p>`;
}
async function logHours(skill) {
  const h = Number($("#log-h").value); if (!(h > 0)) return toast("Enter hours");
  try { applyResult(await api(`/api/learners/${S.learner.id}/progress`, { skill, hours: h })); toast(`Logged ${h}h on ${skill}`); } catch (e) { toast(e.message); }
}

/* ---------- assessment modal ---------- */
async function openAssess(skill) {
  if (!skill) return;
  S.quizSkill = skill; S.quiz = await api(`/api/quiz?skill=${encodeURIComponent(skill)}`);
  $("#modal-title").textContent = `${skill} - prove your skill (pass mark ${S.quiz.pass_mark}%)`;
  $("#modal").hidden = false; setMode("quiz");
}
function setMode(mode) {
  S.mode = mode;
  document.querySelectorAll("#modal-seg button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  const body = $("#modal-body");
  if (mode === "quiz") {
    body.innerHTML = S.quiz.questions.map((q, i) => `<div class="q"><b>${i + 1}. ${esc(q.q)}</b>${q.options.map((o, j) => `<label class="opt"><input type="radio" name="q${i}" value="${j}"> ${esc(o)}</label>`).join("")}</div>`).join("") +
      `<div class="row"><button class="btn fit" onclick="submitQuiz()">Submit answers</button><button class="btn danger fit" title="Demo: show adaptive remediation" onclick="simulateFail()">Demo: simulate fail (45%)</button></div><div id="assess-result"></div>`;
  } else {
    const hasSpeech = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
    body.innerHTML = `<p><b>Question:</b> ${esc(S.quiz.explain_prompt)}</p>
      <div class="row"><button class="mic fit" id="mic" ${hasSpeech ? "" : "disabled title='Voice needs Chrome or Edge'"} onclick="toggleMic()">🎤</button>
      <span class="small muted">${hasSpeech ? "Tap the mic and explain out loud (great interview practice) - or type below." : "Voice input needs Chrome/Edge. Type your answer below."}</span></div>
      <textarea id="explain-text" rows="5" style="margin-top:10px" placeholder="Your explanation..."></textarea>
      <button class="btn" style="margin-top:8px" onclick="submitExplain()">Evaluate my explanation</button><div id="assess-result"></div>`;
  }
}
let rec = null;
function toggleMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; const btn = $("#mic");
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = true;
  const base = $("#explain-text").value;
  rec.onresult = (e) => { let t = ""; for (const r of e.results) t += r[0].transcript; $("#explain-text").value = (base + " " + t).trim(); };
  rec.onend = () => { rec = null; btn.classList.remove("rec"); };
  rec.onerror = (e) => toast("Mic: " + e.error);
  rec.start(); btn.classList.add("rec");
}
async function submitQuiz() {
  const answers = S.quiz.questions.map((_, i) => { const c = document.querySelector(`input[name=q${i}]:checked`); return c ? Number(c.value) : null; });
  if (answers.includes(null)) return toast("Answer every question");
  await runAssess({ skill: S.quizSkill, mode: "quiz", answers });
}
async function submitExplain() {
  const text = $("#explain-text").value.trim(); if (text.split(/\s+/).length < 4) return toast("Say or type a few sentences first");
  if (rec) rec.stop();
  await runAssess({ skill: S.quizSkill, mode: "explain", text });
}
async function simulateFail() { await runAssess({ skill: S.quizSkill, mode: "simulate", score: 45 }); }
async function runAssess(body) {
  try {
    const r = await api(`/api/learners/${S.learner.id}/assess`, body);
    applyResult(r);
    const la = r.learner.last_assessment;
    if (la.review && la.review.length) la.review.forEach((rv, i) => document.querySelectorAll(`input[name=q${i}]`).forEach((inp) => {
      const v = Number(inp.value); if (v === rv.correct) inp.parentElement.classList.add("right"); else if (v === rv.your_answer) inp.parentElement.classList.add("wrong");
    }));
    $("#assess-result").innerHTML = `<div class="result ${la.passed ? "ok" : "bad"}"><b>${la.score.toFixed(0)}% - ${la.passed ? "Passed" : "Below pass mark"}</b> <span class="small muted">(graded by ${esc(la.grader)})</span>
      ${la.feedback ? `<p>${esc(la.feedback)}</p>` : ""}${la.missed_concepts.length && !la.passed ? `<p class="small">Missed concepts: ${la.missed_concepts.map((c) => esc(c.replace(/_/g, " "))).join(", ")}</p>` : ""}
      <p>${esc(r.learner.mentor.message)}</p><button class="btn sm" onclick="closeModal();go('roadmap')">See updated roadmap</button></div>`;
  } catch (e) { toast(e.message); }
}
function closeModal() { $("#modal").hidden = true; if (rec) rec.stop(); }

/* ---------- progress ---------- */
function renderProgress() {
  const L = S.learner, el = $("#tab-progress"); if (!L) { el.innerHTML = ""; return; }
  const as = L.assessments || [], log = L.study_log || [], tl = L.timeline || [];
  const hours = log.reduce((a, e) => a + Number(e.hours || 0), 0);
  const passed = as.filter((a) => a.passed).length;
  const rm = L.roadmap || {};
  el.innerHTML = `
  <div class="grid g4">
    <div class="card stat"><div class="label">Milestones mastered</div><div class="value">${rm.milestones_done_pct ?? 0}%</div></div>
    <div class="card stat"><div class="label">Assessments taken</div><div class="value">${as.length}</div><div class="small muted">${passed} passed</div></div>
    <div class="card stat"><div class="label">Average score</div><div class="value">${as.length ? Math.round(as.reduce((a, x) => a + x.score, 0) / as.length) : "-"}${as.length ? "%" : ""}</div></div>
    <div class="card stat"><div class="label">Study hours logged</div><div class="value">${hours.toFixed(1)}</div></div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>Readiness over time</h3>${lineChart(tl.map((t) => t.readiness ?? 0))}</div>
    <div class="card"><h3>Assessment scores</h3>${scoreBars(as)}</div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>Assessment history</h3><table><tr><th>When</th><th>Skill</th><th>Type</th><th>Score</th><th></th></tr>
      ${as.slice().reverse().map((a) => `<tr><td class="small">${fmtDate(a.ts)}</td><td>${esc(a.skill)}</td><td class="small">${esc(a.mode)} · ${esc(a.grader)}</td><td>${a.score.toFixed(0)}%</td><td><span class="badge ${a.passed ? "ok" : "bad"}">${a.passed ? "pass" : "remedial"}</span></td></tr>`).join("") || '<tr><td colspan="5" class="muted">No assessments yet.</td></tr>'}</table></div>
    <div class="card"><h3>Activity timeline</h3><ul class="clean">${tl.slice().reverse().slice(0, 12).map((t) => `<li><span class="badge">${esc(t.event)}</span> <span class="small muted">${fmtDate(t.ts)} · readiness ${t.readiness}%</span><div class="small">${esc(t.message)}</div></li>`).join("")}</ul></div>
  </div>`;
}
function lineChart(vals) {
  if (vals.length < 2) return '<p class="muted">Take an assessment or log hours to see your trend.</p>';
  const W = 500, H = 180, p = 28, step = (W - 2 * p) / (vals.length - 1);
  const pts = vals.map((v, i) => [p + i * step, H - p - (v / 100) * (H - 2 * p)]);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${[0, 50, 100].map((v) => `<line x1="${p}" x2="${W - p}" y1="${H - p - v / 100 * (H - 2 * p)}" y2="${H - p - v / 100 * (H - 2 * p)}" stroke="#eef1f6"/><text x="4" y="${H - p - v / 100 * (H - 2 * p) + 4}" font-size="10" fill="#6b7385">${v}</text>`).join("")}
    <polyline points="${pts.map((x) => x.join(",")).join(" ")}" fill="none" stroke="#4f46e5" stroke-width="2.5"/>${pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3.5" fill="#4f46e5"><title>${vals[i]}%</title></circle>`).join("")}</svg>`;
}
function scoreBars(as) {
  if (!as.length) return '<p class="muted">No assessments yet.</p>';
  const last = as.slice(-10), W = 500, H = 180, p = 24, bw = (W - 2 * p) / last.length;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%"><line x1="${p}" x2="${W - p}" y1="${H - p - 0.6 * (H - 2 * p)}" y2="${H - p - 0.6 * (H - 2 * p)}" stroke="#d23c3c" stroke-dasharray="4 3"/>
    ${last.map((a, i) => { const h = (a.score / 100) * (H - 2 * p); return `<rect x="${p + i * bw + 4}" y="${H - p - h}" width="${bw - 8}" height="${h}" rx="4" fill="${a.passed ? "#0f9d6b" : "#d23c3c"}"><title>${esc(a.skill)}: ${a.score}%</title></rect><text x="${p + i * bw + bw / 2}" y="${H - 8}" font-size="9" text-anchor="middle" fill="#6b7385">${esc(a.skill.slice(0, 8))}</text>`; }).join("")}</svg><p class="small muted">Dashed line = ${S.meta.pass_mark}% pass mark</p>`;
}

/* ---------- mentor chat ---------- */
function renderMentor() {
  const L = S.learner, el = $("#tab-mentor"); if (!L) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="grid g2"><div class="card"><h2>Ask your AI Mentor</h2>
    <div class="chat" id="chat">${(L.chat || []).map((c) => `<div class="msg me">${esc(c.q)}</div><div class="msg ai">${esc(c.a)}<div class="small muted">${esc(c.source)}</div></div>`).join("") || `<div class="msg ai">${esc((L.mentor || {}).message || "Hi! Ask me anything about your learning path.")}</div>`}</div>
    <div class="chips" style="margin-top:10px">${["Why should I learn this first?", "How long will it take?", "What should I study now?", "Am I ready for interviews?", "I'm stuck, what do I do?"].map((q) => `<button class="btn ghost sm" onclick="ask('${q}')">${q}</button>`).join("")}</div>
    <div class="row"><input id="chat-q" placeholder="Type a question..." onkeydown="if(event.key==='Enter')ask()"><button class="btn fit" onclick="ask()">Send</button></div></div>
    <div class="card"><h3>How the mentor adapts</h3><ul class="clean">
      <li><b>Score below ${S.meta.pass_mark}%</b> → Assessor alerts Path Architect, downstream milestones pause and a remedial lab targeting only the missed concepts is injected.</li>
      <li><b>Second failed attempt</b> → resources switch to video + hands-on first, and weak prerequisites are added for a quick refresh.</li>
      <li><b>Pass</b> → skill becomes <i>verified</i>, dependants unlock, readiness and ETA are recalculated.</li>
      <li><b>Career goal change</b> → mastered skills are kept, a new roadmap is built from the transferable skills.</li>
      <li><b>Study hours logged</b> → weekly plan and target date update.</li></ul></div></div>`;
  const c = $("#chat"); c.scrollTop = c.scrollHeight;
}
async function ask(q) {
  q = q || $("#chat-q").value.trim(); if (!q) return;
  const c = $("#chat"); c.insertAdjacentHTML("beforeend", `<div class="msg me">${esc(q)}</div><div class="msg ai muted" id="typing">thinking...</div>`); c.scrollTop = c.scrollHeight;
  try { const r = await api(`/api/learners/${S.learner.id}/chat`, { question: q }); S.learner.chat = (S.learner.chat || []).concat([{ q, a: r.answer, source: r.source }]); renderMentor(); }
  catch (e) { toast(e.message); $("#typing")?.remove(); }
}

/* ---------- organization ---------- */
async function renderOrg() {
  const el = $("#tab-org");
  if (!el.classList.contains("active")) { el.dataset.stale = "1"; return; }
  const c = await api("/api/cohort");
  const heat = (p) => `<span class="heat" style="background:hsl(${120 - p * 1.2},65%,42%)">${p}%</span>`;
  el.innerHTML = `
  <div class="grid g4">
    <div class="card stat"><div class="label">Learners</div><div class="value">${c.learners}</div></div>
    <div class="card stat"><div class="label">Average readiness</div><div class="value">${c.avg_readiness}%</div></div>
    <div class="card stat"><div class="label">Learners needing attention</div><div class="value">${c.at_risk.length}</div></div>
    <div class="card stat"><div class="label">Target roles</div><div class="small">${Object.entries(c.roles).map(([r, n]) => `${esc(r)}: <b>${n}</b>`).join("<br>")}</div></div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>Organisation-wide skill gaps</h3><p class="small muted">Share of learners (whose goal needs the skill) still below the required level.</p>
      <table><tr><th>Skill</th><th>Needed by</th><th>Below level</th><th>Avg gap</th></tr>${c.skill_gaps.map((g) => `<tr><td>${esc(g.skill)}</td><td>${g.needed_by}</td><td>${heat(g.pct_lacking)}</td><td>${g.avg_gap}</td></tr>`).join("")}</table></div>
    <div class="card"><h3>Recommendations for trainers</h3><ul class="clean">${c.recommendations.map((r) => `<li>${esc(r)}</li>`).join("") || "<li class='muted'>No cohort-wide gaps.</li>"}</ul>
      <h3 style="margin-top:14px">Needs attention</h3><ul class="clean">${c.at_risk.map((a) => `<li><a href="#" onclick="selectLearner('${esc(a.id)}');go('dashboard');return false">${esc(a.name)}</a> <span class="small muted">${esc(a.role)} · ${a.readiness}%</span><div class="small">${a.reasons.map((r) => `<span class="badge warn">${esc(r)}</span>`).join("")}</div></li>`).join("") || "<li class='muted'>Everyone is on track.</li>"}</ul></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="row"><h3 style="margin:0">All learners</h3><button class="btn ghost sm fit" onclick="resetDemo()">Reset demo data</button></div>
    <table><tr><th>Name</th><th>Goal</th><th>Readiness</th><th>Current milestone</th><th>Assessments</th><th>Avg score</th><th>Hours</th></tr>
    ${c.table.map((r) => `<tr><td><a href="#" onclick="selectLearner('${esc(r.id)}');go('dashboard');return false">${esc(r.name)}</a></td><td>${esc(r.role)}</td><td>${r.readiness}%</td><td>${esc(r.active || "-")}${r.remedial.length ? ' <span class="badge bad">remedial</span>' : ""}</td><td>${r.assessments}</td><td>${r.avg_score ?? "-"}</td><td>${r.hours}</td></tr>`).join("")}</table></div>`;
}
async function resetDemo() {
  if (!confirm("Delete all learners and reload the demo cohort?")) return;
  await api("/api/demo/reset", {}); try { localStorage.removeItem("sf-learner"); } catch (_) {}
  await loadLearners(); await selectLearner("jane-doe"); toast("Demo data reset");
}

/* ---------- actions ---------- */
async function pivot() {
  const role = $("#pivot-role").value; if (role === S.learner.target_role) return toast("That's already your goal");
  try { applyResult(await api(`/api/learners/${S.learner.id}/pivot`, { target_role: role })); toast(`Goal changed to ${role}`); await loadLearners(); $("#learner-select").value = S.learner.id; } catch (e) { toast(e.message); }
}
function go(tab) {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + tab));
  if (tab === "org") renderOrg();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("#tabs").addEventListener("click", (e) => { if (e.target.dataset.tab) go(e.target.dataset.tab); });
$("#learner-select").addEventListener("change", (e) => selectLearner(e.target.value));
$("#new-learner").addEventListener("click", newLearner);
$("#modal-close").addEventListener("click", closeModal);
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
$("#modal-seg").addEventListener("click", (e) => { if (e.target.dataset.mode) setMode(e.target.dataset.mode); });
$("#bus-toggle").addEventListener("click", () => $("#bus").classList.toggle("collapsed"));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
boot();
