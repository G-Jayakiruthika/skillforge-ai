/*
 * engine.js - SkillForge AI agent engine running entirely in the browser.
 *
 * A faithful JavaScript port of backend/skillforge (agents.py, graph.py,
 * service.py, routes.py). It powers the GitHub Pages web version, where there
 * is no Python server. Data is kept in localStorage. The knowledge base comes
 * from knowledge.js, which is generated from the Python source of truth.
 * backend/tests/test_parity.py checks that both engines give the same results.
 */
import K from "./knowledge.js";

const { SYNONYMS, ESCO_CODES, PREREQUISITES, ROLE_BENCHMARKS, ROLE_DESCRIPTIONS, LEVEL_SCORES,
  MASTERY_PASS, WORKING_LEVEL, SKILLS, INDUSTRIES, COMPANIES, COMPANY_NOTE, ROLE_INDUSTRY } = K;

/* ---------------- helpers ---------------- */
// Python's round(): half-to-even, so both engines agree exactly.
export function pyRound(x, nd = 0) {
  const m = 10 ** nd, v = x * m, f = Math.floor(v), d = v - f;
  let r;
  if (Math.abs(d - 0.5) < 1e-9) r = f % 2 === 0 ? f : f + 1;
  else r = Math.round(v);
  return r / m;
}
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
const clone = (o) => JSON.parse(JSON.stringify(o));
const skillHours = (s) => (SKILLS[s] ? SKILLS[s].hours : 8);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(n));

function say(state, agent, msg, to = "") {
  return [...(state.trace || []), { ts: nowIso(), agent, to, msg }];
}

export function normalizeSkill(raw) {
  let text = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return [null, null];
  let level = null;
  for (const [word, lvl] of [["basic", "beginner"], ["beginner", "beginner"], ["intermediate", "intermediate"], ["advanced", "advanced"], ["expert", "expert"]]) {
    const rx = new RegExp(`\\b${word}\\b`);
    if (rx.test(text)) { level = lvl; text = text.replace(new RegExp(`\\b${word}\\b`, "g"), "").trim(); }
  }
  if (SYNONYMS[text]) return [SYNONYMS[text], level];
  for (const canon of Object.keys(SKILLS)) if (canon.toLowerCase() === text) return [canon, level];
  return [null, level];
}

const SYN_PATTERNS = Object.entries(SYNONYMS).sort((a, b) => b[0].length - a[0].length);
export function extractSkills(text) {
  const low = " " + String(text || "").toLowerCase() + " ";
  const found = [];
  for (const [syn, canon] of SYN_PATTERNS) {
    if (syn.length <= 2 && !["js", "ts", "py"].includes(syn)) continue;
    const rx = new RegExp(`(?<![a-z0-9.])${reEsc(syn)}(?![a-z0-9])`);
    if (rx.test(low) && !found.includes(canon)) found.push(canon);
  }
  return found;
}

const prereqOptions = (skill) => (PREREQUISITES[skill] || []).map((p) => p.split("|"));
const prereqsMet = (skill, prof) => prereqOptions(skill).every((grp) => grp.some((p) => (prof[p] || 0) >= WORKING_LEVEL));

export function topological(skillsIn) {
  const skills = [...new Set(skillsIn)], sset = new Set(skills);
  const indeg = Object.fromEntries(skills.map((s) => [s, 0])), adj = {}, depth = Object.fromEntries(skills.map((s) => [s, 0]));
  for (const s of skills) for (const grp of prereqOptions(s)) for (const p of grp) if (sset.has(p)) { (adj[p] = adj[p] || []).push(s); indeg[s]++; }
  const q = skills.filter((s) => indeg[s] === 0), out = [];
  while (q.length) {
    const n = q.shift(); out.push([n, depth[n]]);
    for (const m of adj[n] || []) { depth[m] = Math.max(depth[m], depth[n] + 1); if (--indeg[m] === 0) q.push(m); }
  }
  for (const s of skills) if (!out.some(([x]) => x === s)) out.push([s, 0]);
  return out;
}

/* ---------------- agents ---------------- */
export const ROUTES = { profile: "profiler", assess: "assessor", pivot: "skill_analyst", progress: "path_architect" };
const title = (t) => t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function supervisor(state) {
  const learner = { ...state.learner }, ev = state.event || {}, et = ev.type || "profile";
  let note;
  if (et === "pivot") {
    const old = learner.target_role, nw = ev.target_role || old;
    learner.previous_role = old; learner.target_role = nw;
    learner.role_history = [...(learner.role_history || []), { ts: nowIso(), role: nw }];
    note = `Career goal changed '${old}' -> '${nw}'. Mastered skills are kept.`;
  } else if (et === "progress") {
    const entry = { ts: nowIso(), skill: ev.skill, hours: Number(ev.hours || 0), note: ev.note || "" };
    learner.study_log = [...(learner.study_log || []), entry];
    note = `Logged ${fmt(entry.hours)}h on ${entry.skill}.`;
  } else if (et === "assess") note = `Assessment received for '${ev.skill}' (${ev.mode || "quiz"}).`;
  else note = "Profile received - running full diagnosis.";
  const target = ROUTES[et] || "profiler";
  return { learner, trace: say(state, "Supervisor", `${note} Routing to ${title(target)}.`, target) };
}

function profiler(state) {
  const learner = { ...state.learner }, evidence = {}, unknown = [], mappings = [];
  const ev = (s, base) => (evidence[s] = evidence[s] || { base, certs: 0, projects: 0, sources: [] });
  for (const item of learner.skills || []) {
    const raw = typeof item === "object" ? item.name || "" : String(item);
    const lvlIn = (typeof item === "object" ? item.level : "") || "";
    const [canon, lvlTxt] = normalizeSkill(raw);
    if (!canon) { if (raw.trim()) unknown.push(raw.trim()); continue; }
    const lvl = (lvlTxt || lvlIn || "intermediate").toLowerCase();
    const e = ev(canon, 0); e.base = Math.max(e.base, LEVEL_SCORES[lvl] ?? 45); e.sources.push(`self-rated ${lvl}`);
    if (raw.trim().toLowerCase() !== canon.toLowerCase()) mappings.push(`'${raw.trim()}' -> ${canon}`);
  }
  for (const c of learner.certifications || []) {
    for (const s of extractSkills(`${c.name || ""} ${(c.skills || []).join(" ")}`)) {
      const e = ev(s, 35); e.base = Math.max(e.base, 35); e.certs++; e.sources.push(`certification: ${c.name}`);
    }
  }
  for (const p of learner.projects || []) {
    for (const s of extractSkills(`${p.name || ""} ${p.description || ""} ${(p.skills || []).join(" ")}`)) {
      const e = ev(s, 35); e.base = Math.max(e.base, 35); e.projects++; e.sources.push(`project: ${p.name}`);
    }
  }
  const verified = learner.verified || {}, proficiency = {};
  for (const skill of new Set([...Object.keys(evidence), ...Object.keys(verified)])) {
    const e = evidence[skill] || { base: 0, certs: 0, projects: 0, sources: [] };
    const claimed = Math.min(85, e.base + Math.min(15, 10 * e.certs) + Math.min(16, 8 * e.projects));
    let score, confidence;
    if (skill in verified) { score = pyRound(verified[skill]); confidence = "verified"; }
    else { score = claimed; confidence = e.certs || e.projects ? "evidence" : "self-reported"; }
    proficiency[skill] = { score: Math.trunc(score), claimed: Math.trunc(claimed), confidence, sources: e.sources, esco: ESCO_CODES[skill] || "ESCO:custom" };
  }
  learner.proficiency = proficiency; learner.unmapped_skills = unknown;
  let msg = `Normalised ${Object.keys(proficiency).length} skills to the ESCO taxonomy`;
  if (mappings.length) msg += ` (${mappings.slice(0, 6).join(", ")})`;
  if (unknown.length) msg += `. Not in taxonomy yet: ${unknown.join(", ")}`;
  return { learner, trace: say(state, "Profiler", msg + ".", "skill_analyst") };
}

function skillAnalyst(state) {
  const learner = { ...state.learner }, prof = learner.proficiency || {}, bench = ROLE_BENCHMARKS[learner.target_role] || {};
  const lastMissed = {};
  for (const a of learner.assessments || []) lastMissed[a.skill] = a.missed_concepts || [];
  const strengths = [], weaknesses = [], unverified = [];
  for (const [skill, p] of Object.entries(prof).sort((a, b) => b[1].score - a[1].score)) {
    const req = bench[skill];
    if (p.score >= 70 || (req && p.score >= req)) strengths.push({ skill, score: p.score, confidence: p.confidence });
    else if (req) weaknesses.push({ skill, score: p.score, required: req, gap: req - p.score, missed_concepts: lastMissed[skill] || [] });
    if (p.confidence !== "verified" && skill in bench) unverified.push(skill);
  }
  const weak_concepts = Object.entries(lastMissed).filter(([s, c]) => c.length && (prof[s]?.score || 0) < (bench[s] ?? MASTERY_PASS)).map(([skill, concepts]) => ({ skill, concepts }));
  learner.analysis = { strengths, weaknesses, unverified, weak_concepts };
  let msg = `Strengths: ${strengths.map((s) => s.skill).join(", ") || "none yet"}. Below role level: ${weaknesses.map((w) => w.skill).join(", ") || "none"}.`;
  if (unverified.length) msg += ` Self-reported, needs verification: ${unverified.join(", ")}.`;
  return { learner, trace: say(state, "Skill Analyst", msg, "career_matcher") };
}

function readiness(bench, prof) {
  const total = Object.values(bench).reduce((a, b) => a + b, 0) || 1;
  const have = Object.entries(bench).reduce((a, [s, req]) => a + Math.min(prof[s]?.score || 0, req), 0);
  return pyRound(100 * have / total);
}

function companyBench(c, role) {
  const bench = { ...ROLE_BENCHMARKS[role] };
  for (const f of c.focus) bench[f] = f in bench ? bench[f] + 5 : 50;
  return bench;
}
function companyFit(c, role, prof) {
  const bench = companyBench(c, role);
  const gaps = Object.entries(bench).filter(([s, req]) => (prof[s]?.score || 0) < req).map(([s, req]) => [s, req - (prof[s]?.score || 0)]);
  gaps.sort((a, b) => b[1] - a[1]);
  return { company: c.name, sector: c.sector, type: c.type, role, readiness: readiness(bench, prof), gaps: gaps.slice(0, 3).map((g) => g[0]), focus: c.focus, process: c.process };
}
const stableSortDesc = (arr, key) => arr.map((v, i) => [v, i]).sort((a, b) => key(b[0]) - key(a[0]) || a[1] - b[1]).map((x) => x[0]);

function careerMatcher(state) {
  const learner = { ...state.learner };
  let role = learner.target_role || "Full Stack Developer";
  if (!ROLE_BENCHMARKS[role]) { role = "Full Stack Developer"; learner.target_role = role; }
  const bench = ROLE_BENCHMARKS[role], prof = learner.proficiency || {};
  const rows = Object.entries(bench).map(([skill, req]) => {
    const cur = prof[skill]?.score || 0;
    return { skill, required: req, current: cur, gap: Math.max(0, req - cur), status: cur >= req ? "met" : cur > 0 ? "partial" : "missing", confidence: prof[skill]?.confidence || "none" };
  });
  const ranking = stableSortDesc(Object.entries(ROLE_BENCHMARKS).map(([r, b]) => ({ role: r, readiness: readiness(b, prof), description: ROLE_DESCRIPTIONS[r] || "" })), (x) => x.readiness);
  const industry_ranking = stableSortDesc(Object.entries(INDUSTRIES).map(([ind, info]) => {
    let best = null;
    for (const r of info.roles) { const v = { role: r, readiness: readiness(ROLE_BENCHMARKS[r], prof) }; if (!best || v.readiness > best.readiness) best = v; }
    return { industry: ind, icon: info.icon, color: info.color, ...best };
  }), (x) => x.readiness);
  const for_role = stableSortDesc(COMPANIES.filter((c) => c.roles.includes(role)).map((c) => companyFit(c, role, prof)), (x) => x.readiness);
  const overall = stableSortDesc(COMPANIES.flatMap((c) => c.roles.map((r) => companyFit(c, r, prof))), (x) => x.readiness);
  const seen = new Set(), top = [];
  for (const f of overall) if (!seen.has(f.company)) { seen.add(f.company); top.push(f); }
  let dream = null;
  const dc = COMPANIES.find((c) => c.name === learner.dream_company);
  if (dc) {
    let dr = role;
    if (!dc.roles.includes(role)) { dr = dc.roles[0]; for (const r of dc.roles) if (readiness(companyBench(dc, r), prof) > readiness(companyBench(dc, dr), prof)) dr = r; }
    dream = { ...companyFit(dc, dr, prof), role_matches_goal: dr === role };
  }
  const prev = learner.previous_role;
  const transferable = prev && prev !== role ? rows.filter((r) => r.status === "met").map((r) => r.skill) : [];
  const m = learner.match = {
    industry: ROLE_INDUSTRY[role] || null, industry_ranking, companies_for_role: for_role, company_top: top.slice(0, 8), dream,
    role, description: ROLE_DESCRIPTIONS[role] || "", readiness: readiness(bench, prof), skills: rows,
    matched: rows.filter((r) => r.status === "met").map((r) => r.skill), partial: rows.filter((r) => r.status === "partial").map((r) => r.skill),
    missing: rows.filter((r) => r.status === "missing").map((r) => r.skill), role_ranking: ranking, transferable,
  };
  const msg = `${role}: readiness ${m.readiness}%. Met [${m.matched.join(", ")}] | Partial [${m.partial.join(", ")}] | Missing [${m.missing.join(", ")}]. Closest role overall: ${ranking[0].role} (${ranking[0].readiness}%). Matched against ${COMPANIES.length} employers in ${Object.keys(INDUSTRIES).length} industries${dream ? `; dream company ${dream.company}: ${dream.readiness}%` : ""}.`;
  return { learner, trace: say(state, "Career Matcher", msg, "path_architect") };
}

function pathArchitect(state) {
  const learner = { ...state.learner }, bench = { ...(ROLE_BENCHMARKS[learner.target_role] || {}) };
  const prof = Object.fromEntries(Object.entries(learner.proficiency || {}).map(([s, p]) => [s, p.score]));
  const remedial = learner.remedial || {}, logged = {};
  for (const e of learner.study_log || []) logged[e.skill] = (logged[e.skill] || 0) + Number(e.hours || 0);
  const needed = { ...bench };
  for (const skill of Object.keys(bench)) for (const grp of prereqOptions(skill))
    if (!grp.some((p) => p in needed) && !grp.some((p) => (prof[p] || 0) >= WORKING_LEVEL)) needed[grp[0]] = WORKING_LEVEL;
  const nodes = [], remedialSkills = Object.keys(remedial).filter((s) => s in needed);
  for (const [skill, depth] of topological(Object.keys(needed))) {
    const req = needed[skill], cur = prof[skill] || 0;
    const gapFrac = req ? Math.max(0, (req - cur) / req) : 0;
    const est = cur < req ? Math.max(2, Math.ceil(skillHours(skill) * gapFrac)) : 0;
    const node = { id: slug(skill), skill, depth, required: req, current: cur, prerequisites: PREREQUISITES[skill] || [], esco: ESCO_CODES[skill] || "ESCO:custom",
      est_hours: est, logged_hours: pyRound(logged[skill] || 0, 1), in_role: skill in bench, is_remedial: false };
    if (skill in remedial) node.status = "paused";
    else if (cur >= req) node.status = "mastered";
    else if (!prereqsMet(skill, prof)) node.status = "locked";
    else node.status = "available";
    if (skill in remedial) {
      const r = remedial[skill];
      nodes.push({ id: `remedy-${slug(skill)}`, skill, title: `Remedial lab: ${skill}`, depth, status: "remedial", is_remedial: true, required: req, current: cur,
        prerequisites: [], esco: "ESCO:REMEDIAL", est_hours: 3 + 2 * Math.max(0, (r.attempts || 1) - 1), logged_hours: 0,
        missed_concepts: r.missed_concepts || [], review_prereqs: r.review_prereqs || [], attempts: r.attempts || 1, in_role: true });
    }
    nodes.push(node);
  }
  let active = null;
  if (remedialSkills.length) active = remedialSkills[0];
  else { const n = nodes.find((x) => x.status === "available"); if (n) { n.status = "active"; active = n.skill; } }
  const hpw = Math.max(1, Number(learner.hours_per_week || 8));
  const queue = nodes.filter((n) => ["remedial", "active", "available", "locked", "paused"].includes(n.status)).map((n) => [n.title || n.skill, Math.max(0, n.est_hours - (n.logged_hours || 0))]);
  const weeks = []; let cw = [], room = hpw;
  for (let [name, hrs] of queue) {
    while (hrs > 0.01) {
      const take = Math.min(hrs, room); cw.push({ item: name, hours: pyRound(take, 1) }); hrs -= take; room -= take;
      if (room <= 0.01) { weeks.push({ week: weeks.length + 1, items: cw }); cw = []; room = hpw; }
    }
  }
  if (cw.length) weeks.push({ week: weeks.length + 1, items: cw });
  const left = pyRound(queue.reduce((a, [, h]) => a + h, 0), 1);
  const eta = weeks.length ? new Date(Date.now() + weeks.length * 7 * 864e5).toISOString().slice(0, 10) : null;
  const real = nodes.filter((n) => !n.is_remedial);
  learner.roadmap = { nodes, active, hours_remaining: left, hours_per_week: hpw, weeks, eta_weeks: weeks.length, eta_date: eta,
    milestones_done_pct: pyRound(100 * real.filter((n) => n.status === "mastered").length / Math.max(1, real.length)),
    total_est_hours: nodes.reduce((a, n) => a + n.est_hours, 0) || 1 };
  const msg = `Built prerequisite DAG with ${real.length} milestones${remedialSkills.length ? " + remedial lab" : ""}. Active: '${active || "all mastered"}'. ${left}h left at ${hpw}h/week -> ~${weeks.length} weeks.`;
  return { learner, trace: say(state, "Path Architect", msg, "resource_curator") };
}

const yt = (q) => "https://www.youtube.com/results?search_query=" + q.replace(/ /g, "+");
function resourceCurator(state) {
  const learner = { ...state.learner }, roadmap = { ...(learner.roadmap || {}) }, fails = learner.fail_streak || {};
  const out = (roadmap.nodes || []).map((n0) => {
    const n = { ...n0 }, info = SKILLS[n.skill] || {}, res = (info.resources || []).map((r) => ({ ...r }));
    if (n.is_remedial) {
      const missed = n.missed_concepts?.length ? n.missed_concepts : Object.keys(info.concepts || {}).slice(0, 2);
      const targeted = missed.map((c) => ({ type: "video", title: `Focus: ${n.skill} - ${c.replace(/_/g, " ")} (video search)`, url: yt(`${n.skill} ${c.replace(/_/g, " ")} explained simply`), hours: 1 }));
      let tut = res.filter((r) => ["tutorial", "practice"].includes(r.type)).slice(0, 1);
      if (!tut.length) tut = res.slice(0, 1);
      for (const p of n.review_prereqs || []) tut = tut.concat((SKILLS[p]?.resources || []).slice(0, 1).map((r) => ({ ...r, title: `Refresh prerequisite: ${r.title}` })));
      n.resources = targeted.concat(tut);
      n.project = `Guided exercise: write 3 small examples that use ${missed.map((c) => c.replace(/_/g, " ")).join(", ")} in ${n.skill}, then retake the check.`;
    } else {
      if ((fails[n.skill] || 0) >= 2) {
        const order = { video: 0, practice: 1, tutorial: 2, course: 3 };
        res.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));
        n.format_note = "Switched to video + hands-on first after repeated attempts.";
      }
      n.resources = res; n.project = info.project || `Build a small project using ${n.skill}.`;
    }
    n.explain_prompt = info.explain_prompt || `Explain the core ideas of ${n.skill}.`;
    n.quiz_size = (info.quiz || []).length;
    return n;
  });
  roadmap.nodes = out; learner.roadmap = roadmap;
  const pending = out.filter((n) => n.status !== "mastered");
  const msg = `Attached ${pending.reduce((a, n) => a + n.resources.length, 0)} resources, ${pending.length} micro-projects and assessments to open milestones.`;
  return { learner, trace: say(state, "Resource Curator", msg, "mentor") };
}

export function gradeQuiz(skill, answers) {
  const quiz = SKILLS[skill]?.quiz || [];
  if (!quiz.length) return [0, [], []];
  let correct = 0; const missed = [], review = [];
  quiz.forEach((q, i) => {
    const a = i < answers.length ? answers[i] : null, ok = a === q.answer;
    correct += ok ? 1 : 0;
    if (!ok && !missed.includes(q.concept)) missed.push(q.concept);
    review.push({ q: q.q, your_answer: a, correct: q.answer, ok, concept: q.concept });
  });
  return [pyRound(100 * correct / quiz.length, 1), missed, review];
}

export function gradeExplanation(skill, text) {
  const concepts = SKILLS[skill]?.concepts || {}, low = String(text || "").trim().toLowerCase();
  const covered = Object.entries(concepts).filter(([, kws]) => kws.some((k) => low.includes(k))).map(([c]) => c);
  const missed = Object.keys(concepts).filter((c) => !covered.includes(c));
  const words = (low.match(/\w+/g) || []).length;
  let score = 25 + 75 * (covered.length / Math.max(1, Object.keys(concepts).length));
  if (words < 12) score -= 15;
  score = Math.max(0, Math.min(100, score));
  const fb = `You covered ${covered.map((c) => c.replace(/_/g, " ")).join(", ") || "none of the key ideas"}` +
    (missed.length ? `; next time also explain ${missed.map((c) => c.replace(/_/g, " ")).join(", ")}.` : ". Great coverage!");
  return [pyRound(score, 1), missed, fb, "concept rubric"];
}

function assessor(state) {
  const learner = { ...state.learner }, ev = state.event || {}, skill = ev.skill, mode = ev.mode || "quiz";
  let score, missed, feedback = "", grader = "answer key", review = [];
  if (mode === "simulate") { score = Number(ev.score ?? 45); missed = Object.keys(SKILLS[skill]?.concepts || {}).slice(0, 2); grader = "demo simulation"; }
  else if (mode === "explain") [score, missed, feedback, grader] = gradeExplanation(skill, ev.text || "");
  else [score, missed, review] = gradeQuiz(skill, ev.answers || []);
  const verified = { ...(learner.verified || {}) }, old = verified[skill];
  verified[skill] = pyRound(old == null ? score : 0.4 * old + 0.6 * score, 1);
  learner.verified = verified;
  const passed = score >= MASTERY_PASS, fails = { ...(learner.fail_streak || {}) }, remedial = { ...(learner.remedial || {}) }, prof = learner.proficiency || {};
  let cleared = false;
  if (passed) { fails[skill] = 0; cleared = skill in remedial; delete remedial[skill]; }
  else {
    fails[skill] = (fails[skill] || 0) + 1;
    const review_prereqs = fails[skill] >= 2 ? prereqOptions(skill).flat().filter((p) => p in prof && prof[p].score < 65) : [];
    remedial[skill] = { missed_concepts: missed, attempts: fails[skill], created: nowIso(), review_prereqs };
  }
  learner.fail_streak = fails; learner.remedial = remedial;
  const record = { ts: nowIso(), skill, mode, score, passed, missed_concepts: missed, grader, feedback };
  learner.assessments = [...(learner.assessments || []), record];
  learner.last_assessment = { ...record, review, remedial_cleared: cleared };
  const msg = passed
    ? `PASS ${score.toFixed(0)}% on ${skill} (graded by ${grader}). Verified proficiency now ${verified[skill].toFixed(0)}.${cleared ? " Remedial lab cleared." : ""}`
    : `BELOW THRESHOLD ${score.toFixed(0)}% (< ${MASTERY_PASS}%) on ${skill}. Missed concepts: ${missed.join(", ") || "n/a"}. Requesting remedial lab, attempt #${fails[skill]}.`;
  return { learner, trace: say(state, "Assessor", msg, "profiler") };
}

function fallbackMessage(L, et) {
  const m = L.match || {}, rm = L.roadmap || {}, active = rm.active, la = L.last_assessment, name = (L.name || "there").split(" ")[0];
  if (et === "assess" && la) {
    if (la.passed) return `Well done, ${name}! ${la.score.toFixed(0)}% on ${la.skill} - it now counts as verified. Your readiness for ${m.role} is ${m.readiness}%. Next up: ${active || "you have covered every milestone"}.`;
    const concepts = (la.missed_concepts || []).map((c) => c.replace(/_/g, " ")).join(", ") || "the core ideas";
    const rem = (L.remedial || {})[la.skill] || {};
    let extra = "";
    if ((rem.review_prereqs || []).length) extra = ` Because this is attempt #${rem.attempts}, I've also added a quick refresh of ${rem.review_prereqs.join(", ")}.`;
    else if ((rem.attempts || 1) >= 2) extra = " I've switched your materials to video + hands-on practice first - a different format often helps.";
    return `${la.score.toFixed(0)}% on ${la.skill} is below the ${MASTERY_PASS}% bar, and that's okay - it tells us exactly what to fix. I paused the next steps and added a short remedial lab on ${concepts}.${extra} Finish it, then retake the check.`;
  }
  if (et === "pivot") {
    const t = m.transferable || [];
    return `New goal: ${m.role}. You keep everything you've mastered${t.length ? " - " + t.join(", ") + " already count" : ""}. Readiness starts at ${m.readiness}%; your new first milestone is ${active}. Estimated ${rm.eta_weeks} weeks at ${rm.hours_per_week}h/week.`;
  }
  if (et === "progress") return `Logged - nice consistency. ${rm.hours_remaining}h left on your path (about ${rm.eta_weeks} weeks). Keep going with ${active}, then take its assessment.`;
  const missing = (m.missing || []).join(", ") || "none", weak = (L.analysis?.weaknesses || []).map((w) => w.skill).join(", ") || "none";
  const d = m.dream;
  const dream = d ? ` For your dream company ${d.company} (${d.role}) you're ${d.readiness}% ready` + (d.focus?.length ? ` - they usually value ${d.focus.join(", ")}.` : ".") : "";
  return `Hi ${name}! For ${m.role} you're ${m.readiness}% ready. Missing skills: ${missing}. Skills to strengthen: ${weak}. Start with ${active} - prerequisites come first so each step builds on the last. At ${rm.hours_per_week}h/week you can be job-ready in about ${rm.eta_weeks} weeks.${dream}`;
}

function nextActions(L) {
  const nodes = L.roadmap?.nodes || [], acts = [], first = nodes.find((n) => ["remedial", "active"].includes(n.status));
  if (first) {
    const r = (first.resources || [{}])[0] || {};
    acts.push(`Study: ${r.title || first.skill} (~${r.hours || 1}h)`, `Build: ${first.project || ""}`, `Prove it: take the ${first.skill} assessment (quiz or voice explanation)`);
  }
  const unv = L.analysis?.unverified || [];
  if (unv.length) acts.push(`Verify self-reported skills with a quick quiz: ${unv.slice(0, 3).join(", ")}`);
  return acts.slice(0, 4);
}

function mentor(state) {
  const learner = { ...state.learner }, et = state.event?.type || "profile", msg = fallbackMessage(learner, et);
  learner.mentor = { message: msg, next_actions: nextActions(learner), source: "rule-based mentor", ts: nowIso() };
  learner.timeline = [...(learner.timeline || []), { ts: nowIso(), event: et, message: msg, readiness: learner.match?.readiness }].slice(-60);
  return { learner, trace: say(state, "Mentor", `[rule-based mentor] ${msg}`, "learner") };
}

export function mentorChat(L, question) {
  const m = L.match || {}, rm = L.roadmap || {}, an = L.analysis || {}, q = question.toLowerCase(), active = rm.active;
  const ctx = `Goal: ${m.role} (${m.readiness}% ready). Active milestone: ${rm.active}. Missing: ${(m.missing || []).join(", ")}. Weak: ${(an.weaknesses || []).map((w) => w.skill).join(", ")}. Hours/week: ${rm.hours_per_week}. ETA weeks: ${rm.eta_weeks}.`;
  const node = (rm.nodes || []).find((n) => n.skill === active);
  const has = (...ks) => ks.some((k) => q.includes(k));
  if (has("why", "order", "first")) {
    const pre = node ? (node.prerequisites || []).join(", ") : "";
    return `${active} comes first because the roadmap follows prerequisites${pre ? " (it builds on " + pre + ")" : ""}. Learning in this order means each new skill reuses what you already know, so it feels easier and sticks better.`;
  }
  if (has("how long", "when", "time", "weeks")) return `About ${rm.hours_remaining} hours of focused study remain. At ${rm.hours_per_week}h/week that's roughly ${rm.eta_weeks} weeks (target ${rm.eta_date}). Raising your weekly hours on the Profile tab recalculates this instantly.`;
  if (has("resource", "learn", "study", "course", "video") && node) return `For ${active}, start with: ${(node.resources || []).slice(0, 3).map((x) => `${x.title} (${x.type}, ~${x.hours}h)`).join("; ")}. Then do the micro-project and take the assessment.`;
  if (has("interview", "job", "ready", "placement")) return `You're ${m.readiness}% ready for ${m.role}. Recruiters look for proof, so finish the micro-projects, push them to GitHub, and verify each skill here with an assessment. Practise explaining concepts out loud with the voice check - it's good interview practice.`;
  if (has("fail", "hard", "difficult", "stuck")) return "Getting stuck is normal. Take the remedial lab - it targets only the concepts you missed - and try the video resources first. Short daily sessions beat one long one. Then retake the check.";
  return `Your focus right now is ${active}. ${ctx} Ask me 'why this order?', 'how long will it take?', 'what should I study?' or 'am I ready for interviews?'.`;
}

const NODES = { supervisor, assessor, profiler, skill_analyst: skillAnalyst, career_matcher: careerMatcher, path_architect: pathArchitect, resource_curator: resourceCurator, mentor };
const EDGES = { assessor: "profiler", profiler: "skill_analyst", skill_analyst: "career_matcher", career_matcher: "path_architect", path_architect: "resource_curator", resource_curator: "mentor" };

export function runGraph(learner, event) {
  let state = { learner: clone(learner), event, trace: [] }, node = "supervisor";
  while (node) { state = { ...state, ...NODES[node](state) }; node = node === "supervisor" ? ROUTES[event.type] || "profiler" : EDGES[node]; }
  return state;
}

/* ---------------- sanitising (mirrors backend/skillforge/security.py) ---------------- */
export function cleanText(v, max = 300, newlines = false) {
  let s = v == null ? "" : String(v);
  s = s.normalize("NFKC").replace(/<[^>]*>/g, " ").replace(/(?:javascript|data|vbscript)\s*:/gi, "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  s = newlines ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  return s.trim().slice(0, max);
}
export const cleanEmail = (v) => { const e = cleanText(v, 254).toLowerCase().replace(/ /g, ""); return /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(e) ? e : ""; };
function sanitiseProfile(p) {
  const out = { ...p };
  for (const f of ["name", "organization", "institution", "interests", "education", "city", "district", "state", "dream_company", "target_role", "institution_id"]) if (f in out) out[f] = cleanText(out[f], 120);
  if ("email" in out) out.email = cleanEmail(out.email);
  if ("hours_per_week" in out) out.hours_per_week = Math.max(1, Math.min(60, parseInt(out.hours_per_week, 10) || 8));
  for (const [key, fields, cap] of [["skills", ["name", "level"], 60], ["certifications", ["name", "issuer"], 120], ["projects", ["name", "description"], 240]])
    if (Array.isArray(out[key])) out[key] = out[key].slice(0, 40).filter((i) => i && typeof i === "object").map((i) => Object.fromEntries(fields.filter((f) => f in i).map((f) => [f, cleanText(i[f], cap)])));
  return out;
}
export const findInstitution = (key) => { const k = String(key || "").trim().toLowerCase(); return (K.INSTITUTIONS || []).find((i) => i.id === k || i.name.toLowerCase() === k) || null; };

/* ---------------- service + storage ---------------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

export function createEngine(storage) {
  // storage: {load(): object|null, save(obj)}  - defaults to localStorage
  storage = storage || {
    load: () => { try { return JSON.parse(localStorage.getItem("sf-db") || "null"); } catch (_) { return null; } },
    save: (db) => { try { localStorage.setItem("sf-db", JSON.stringify(db)); } catch (_) {} },
  };
  let db = storage.load() || { learners: {}, order: [] };
  if ((db.v || 1) < 2) db = { learners: {}, order: [], v: 2 };   // v2: demo flags + account ownership
  const persist = () => storage.save(db);
  const put = (L) => { db.learners[L.id] = L; db.order = [L.id, ...db.order.filter((x) => x !== L.id)]; persist(); };
  const all = () => db.order.map((id) => db.learners[id]).filter(Boolean);
  const load = (id) => { const L = db.learners[id]; if (!L) throw new HttpError(404, `Learner '${id}' not found`); return clone(L); };
  const result = (st) => { put(st.learner); return { learner: st.learner, trace: st.trace }; };

  const svc = {
    health: () => ({ status: "ok", agent_engine: "in-browser JS state machine", gemini: "disabled (web version)",
      agents: ["Supervisor", "Profiler", "Skill Analyst", "Career Matcher", "Path Architect", "Resource Curator", "Assessor", "Mentor"], roles: Object.keys(ROLE_BENCHMARKS) }),
    meta: () => ({ roles: Object.entries(ROLE_BENCHMARKS).map(([name, skills]) => ({ name, description: ROLE_DESCRIPTIONS[name] || "", skills, industry: ROLE_INDUSTRY[name] || null })),
      industries: INDUSTRIES, companies: COMPANIES, company_note: COMPANY_NOTE,
      skills: Object.keys(SKILLS).map((s) => ({ name: s, esco: ESCO_CODES[s], prerequisites: PREREQUISITES[s] || [], hours: SKILLS[s].hours })),
      levels: Object.keys(LEVEL_SCORES), pass_mark: MASTERY_PASS, graph: { engine: "in-browser", routes: ROUTES },
      institutions: K.INSTITUTIONS, geography: K.GEOGRAPHY, institution_note: K.INSTITUTION_NOTE, kind_labels: K.KIND_LABELS }),
    listLearners: () => all().map((l) => ({ id: l.id, name: l.name, target_role: l.target_role, readiness: l.match?.readiness, organization: l.organization })),
    getLearner: (id) => ({ learner: load(id), trace: [] }),
    saveProfile(p, opts = {}) {
      if (!String(p.name || "").trim()) throw new HttpError(400, "name is required");
      const id = p.id || slug(p.name).slice(0, 20) + "-" + Math.random().toString(16).slice(2, 6);
      const L = db.learners[id] ? clone(db.learners[id]) : { id, created: nowIso() }, oldRole = L.target_role;
      p = sanitiseProfile(p);
      for (const f of ["name", "email", "organization", "target_role", "hours_per_week", "skills", "certifications", "projects", "interests", "dream_company", "education", "institution_id", "institution", "city", "district", "state"]) if (f in p) L[f] = p[f];
      if ("listed" in p) L.listed = !!p.listed;
      if (opts.demo) L.demo = true;
      if (opts.owner) L.owner = opts.owner;
      const inst = findInstitution(p.institution_id || p.institution || "");
      if (inst) Object.assign(L, { institution_id: inst.id, institution: inst.name, city: inst.city, district: inst.district, state: inst.state, organization: inst.name });
      L.target_role = L.target_role || "Full Stack Developer";
      if (oldRole && oldRole !== L.target_role) L.previous_role = oldRole;
      if (oldRole !== L.target_role) L.role_history = [...(L.role_history || []), { ts: nowIso(), role: L.target_role }];
      return result(runGraph(L, { type: "profile" }));
    },
    extractResume(text) {
      if (!String(text || "").trim()) throw new HttpError(400, "text is required");
      return { skills: extractSkills(text).map((s) => ({ name: s, level: "intermediate" })), certifications: [], projects: [], extractor: "taxonomy scan" };
    },
    quiz(skill) {
      const info = SKILLS[skill]; if (!info) throw new HttpError(404, `Unknown skill '${skill}'`);
      return { skill, pass_mark: MASTERY_PASS, explain_prompt: info.explain_prompt, questions: info.quiz.map((q) => ({ q: q.q, options: q.options })) };
    },
    quizCheck(skill, index, answer) {
      const info = SKILLS[skill]; if (!info) throw new HttpError(404, `Unknown skill '${skill}'`);
      if (!Number.isInteger(index) || index < 0 || index >= info.quiz.length) throw new HttpError(400, "index out of range");
      const q = info.quiz[index]; return { correct: answer === q.answer, correct_index: q.answer, concept: q.concept };
    },
    assess(id, skill, mode = "quiz", answers = [], text = "", score = null) {
      if (!SKILLS[skill]) throw new HttpError(400, `Unknown skill '${skill}'`);
      if (!["quiz", "explain", "simulate"].includes(mode)) throw new HttpError(400, "mode must be quiz, explain or simulate");
      return result(runGraph(load(id), { type: "assess", skill, mode, answers: answers || [], text, score: score == null ? 45 : score }));
    },
    pivot(id, role) { if (!ROLE_BENCHMARKS[role]) throw new HttpError(400, `Unknown role '${role}'`); return result(runGraph(load(id), { type: "pivot", target_role: role })); },
    logProgress(id, skill, hours, note = "") {
      if (!hours || hours <= 0 || hours > 24) throw new HttpError(400, "hours must be between 0 and 24");
      return result(runGraph(load(id), { type: "progress", skill, hours, note }));
    },
    chat(id, question) {
      if (!String(question || "").trim()) throw new HttpError(400, "question is required");
      const L = load(id), answer = mentorChat(L, question);
      L.chat = [...(L.chat || []), { ts: nowIso(), q: question, a: answer, source: "rule-based mentor" }].slice(-40);
      put(L); return { answer, source: "rule-based mentor" };
    },
    cohort(org = null, pred = null) {
      const visible = all().filter((l) => !pred || pred(l));
      const ls = visible.filter((l) => !org || (l.organization || "") === org), stats = {}, roles = {}, atRisk = [], rows = [];
      for (const l of ls) {
        const m = l.match || {}; roles[l.target_role] = (roles[l.target_role] || 0) + 1;
        for (const s of m.skills || []) { const st = (stats[s.skill] = stats[s.skill] || { needed_by: 0, met: 0, gap_sum: 0 }); st.needed_by++; st.met += s.status === "met" ? 1 : 0; st.gap_sum += s.gap; }
        const fails = Math.max(0, ...Object.values(l.fail_streak || {})), scores = (l.assessments || []).map((a) => a.score);
        const hours = (l.study_log || []).reduce((a, e) => a + Number(e.hours || 0), 0);
        const row = { id: l.id, name: l.name, role: l.target_role, readiness: m.readiness || 0, active: l.roadmap?.active, assessments: scores.length,
          avg_score: scores.length ? pyRound(scores.reduce((a, b) => a + b, 0) / scores.length) : null, hours: pyRound(hours, 1), remedial: Object.keys(l.remedial || {}) };
        rows.push(row);
        const reasons = [];
        if (row.readiness < 35) reasons.push("low readiness");
        if (fails >= 2) reasons.push("repeated failed assessments");
        if (row.remedial.length) reasons.push("in remedial lab: " + row.remedial.join(", "));
        if (reasons.length) atRisk.push({ ...row, reasons });
      }
      const gaps = Object.entries(stats).map(([skill, v]) => ({ skill, needed_by: v.needed_by, met: v.met, pct_lacking: pyRound(100 * (v.needed_by - v.met) / v.needed_by), avg_gap: pyRound(v.gap_sum / v.needed_by) }))
        .sort((a, b) => (b.needed_by - b.met) - (a.needed_by - a.met) || b.pct_lacking - a.pct_lacking || b.avg_gap - a.avg_gap);
      return { learners: ls.length, avg_readiness: rows.length ? pyRound(rows.reduce((a, r) => a + r.readiness, 0) / rows.length) : 0, roles, skill_gaps: gaps, at_risk: atRisk,
        table: rows.sort((a, b) => a.readiness - b.readiness),
        recommendations: gaps.slice(0, 3).filter((g) => g.pct_lacking >= 50).map((g) => `Run a cohort workshop on ${g.skill} - ${g.pct_lacking}% of learners who need it are below level.`),
        organizations: [...new Set(visible.map((l) => l.organization).filter(Boolean))].sort() };
    },
    gameResult(id, data) {
      const L = load(id), GAMES = ["arena", "blitz", "dash", "bridge", "memory", "duel"];
      if (!GAMES.includes(data.game)) throw new HttpError(400, "Unknown game.");
      const points = Math.max(0, Math.min(300, Math.trunc(Number(data.points) || 0)));
      const g = (L.game = L.game || { points: 0, plays: 0, best: {} });
      g.points = (g.points || 0) + points; g.plays = (g.plays || 0) + 1; g.best[data.game] = Math.max(g.best[data.game] || 0, points);
      put(L); return { ok: true, game: g };
    },
    seedDemo(reset = false) {
      // Only the fictional demo learners are ever removed - profiles created by signed-up users stay.
      if (reset) { for (const l of all()) if (l.demo) { delete db.learners[l.id]; db.order = db.order.filter((x) => x !== l.id); } persist(); }
      if (all().some((l) => l.demo)) return { seeded: false, learners: all().length };
      const ORG = "Demo University - MCA 2026";
      const qa = (skill, n) => SKILLS[skill].quiz.map((q, i) => (i < n ? q.answer : (q.answer + 1) % q.options.length));
      const people = [
        { id: "jane-doe", name: "Jane Doe", target_role: "Full Stack Developer", hours_per_week: 8, skills: [{ name: "Python", level: "intermediate" }, { name: "SQL", level: "intermediate" }, { name: "basic HTML", level: "beginner" }],
          certifications: [{ name: "HackerRank SQL (Basic)" }], projects: [{ name: "Student marks analyser", description: "Python script that loads marks from a MySQL database and prints reports" }], interests: "web apps, startups", dream_company: "Zoho", education: "MCA", institution_id: "rathinam-technical-campus" },
        { id: "arjun-k", name: "Arjun K", target_role: "Data Engineer", hours_per_week: 10, skills: [{ name: "py", level: "intermediate" }, { name: "postgres", level: "advanced" }, { name: "excel", level: "intermediate" }],
          certifications: [], projects: [{ name: "Sales ETL", description: "Python + SQL ETL into a star schema" }], dream_company: "Amazon", education: "B.Tech IT", institution_id: "psg-college-of-technology" },
        { id: "meera-s", name: "Meera S", target_role: "Frontend Developer", hours_per_week: 6, skills: [{ name: "HTML", level: "advanced" }, { name: "CSS", level: "advanced" }, { name: "vanilla js", level: "beginner" }, { name: "github", level: "intermediate" }],
          certifications: [{ name: "freeCodeCamp Responsive Web Design" }], projects: [], education: "B.Sc CS", institution_id: "loyola-college" },
        { id: "rahul-p", name: "Rahul P", target_role: "Data Analyst", hours_per_week: 5, skills: [{ name: "excel", level: "advanced" }, { name: "sql", level: "beginner" }], certifications: [], projects: [], education: "BBA", institution_id: "bishop-heber-college" },
        { id: "fatima-n", name: "Fatima N", target_role: "Backend Developer (Python)", hours_per_week: 12, skills: [{ name: "python3", level: "advanced" }, { name: "flask", level: "intermediate" }, { name: "mysql", level: "intermediate" }, { name: "git", level: "intermediate" }],
          certifications: [{ name: "AWS Cloud Practitioner" }], projects: [{ name: "Library REST API", description: "Flask REST API with MySQL and Docker" }], dream_company: "Google", education: "BCA", institution_id: "jamal-mohamed-college" },
        { id: "karthik-r", name: "Karthik R", target_role: "Mechanical Design Engineer", hours_per_week: 7, skills: [{ name: "autocad", level: "intermediate" }, { name: "cnc", level: "beginner" }],
          certifications: [{ name: "SolidWorks CSWA" }], projects: [{ name: "Go-kart chassis", description: "Designed the frame in SolidWorks and checked machining" }], dream_company: "Tata Motors", education: "B.E. Mechanical", institution_id: "kumaraguru-college-of-technology" },
        { id: "priya-m", name: "Priya M", target_role: "Financial Analyst", hours_per_week: 6, skills: [{ name: "tally", level: "intermediate" }, { name: "excel", level: "intermediate" }, { name: "gst", level: "beginner" }],
          certifications: [], projects: [], dream_company: "Deloitte", education: "B.Com", institution_id: "psg-college-of-arts-and-science" },
        { id: "sanjay-v", name: "Sanjay V", target_role: "Embedded Systems Engineer", hours_per_week: 9, skills: [{ name: "c", level: "intermediate" }, { name: "arduino", level: "intermediate" }, { name: "digital electronics", level: "beginner" }],
          certifications: [], projects: [{ name: "Smart irrigation", description: "Arduino soil sensor with IoT alerts over MQTT" }], dream_company: "Bosch", education: "B.E. ECE", institution_id: "kongu-engineering-college" },
        { id: "divya-s", name: "Divya S", target_role: "Clinical Research Associate", hours_per_week: 5, skills: [{ name: "medical terminology", level: "intermediate" }, { name: "communication", level: "intermediate" }],
          certifications: [{ name: "GCP training certificate (clinical research)" }], projects: [], dream_company: "IQVIA", education: "B.Pharm", institution_id: "rathinam-technical-campus" },
      ];
      for (const p of people) svc.saveProfile({ ...p, organization: ORG }, { demo: true });
      svc.assess("arjun-k", "SQL", "quiz", qa("SQL", 3));
      svc.logProgress("arjun-k", "Data Modeling", 4, "Kimball chapter 1-2");
      svc.assess("meera-s", "JavaScript", "quiz", qa("JavaScript", 1));
      svc.assess("meera-s", "JavaScript", "explain", [], "promises are async");
      svc.assess("rahul-p", "SQL", "quiz", qa("SQL", 1));
      svc.assess("fatima-n", "Python", "quiz", qa("Python", 3));
      svc.logProgress("fatima-n", "REST APIs", 3, "FastAPI tutorial");
      svc.assess("karthik-r", "CAD Design", "quiz", qa("CAD Design", 3));
      svc.assess("priya-m", "Financial Accounting", "quiz", qa("Financial Accounting", 1));
      svc.assess("sanjay-v", "C Programming", "quiz", qa("C Programming", 2));
      // keep Jane (the sample scenario) first in the list
      db.order = ["jane-doe", ...db.order.filter((x) => x !== "jane-doe")]; persist();
      return { seeded: true, learners: all().length };
    },
  };

  const routes = [
    ["GET", /^\/api\/health$/, () => svc.health()],
    ["GET", /^\/api\/meta$/, () => svc.meta()],
    ["GET", /^\/api\/learners$/, () => svc.listLearners()],
    ["POST", /^\/api\/learners$/, (m, q, b) => svc.saveProfile(b)],
    ["GET", /^\/api\/learners\/([\w-]+)$/, (m) => svc.getLearner(m[1])],
    ["POST", /^\/api\/learners\/([\w-]+)\/assess$/, (m, q, b) => svc.assess(m[1], b.skill || "", b.mode || "quiz", b.answers, b.text || "", b.score)],
    ["POST", /^\/api\/learners\/([\w-]+)\/pivot$/, (m, q, b) => svc.pivot(m[1], b.target_role || "")],
    ["POST", /^\/api\/learners\/([\w-]+)\/progress$/, (m, q, b) => svc.logProgress(m[1], b.skill || "", Number(b.hours || 0), b.note || "")],
    ["POST", /^\/api\/learners\/([\w-]+)\/chat$/, (m, q, b) => svc.chat(m[1], b.question || "")],
    ["POST", /^\/api\/resume\/extract$/, (m, q, b) => svc.extractResume(b.text || "")],
    ["GET", /^\/api\/quiz$/, (m, q) => svc.quiz(q.skill || "")],
    ["POST", /^\/api\/quiz\/check$/, (m, q, b) => svc.quizCheck(b.skill || "", b.index, b.answer)],
    ["GET", /^\/api\/cohort$/, (m, q) => svc.cohort(q.organization || null)],
    ["POST", /^\/api\/demo\/reset$/, () => svc.seedDemo(true)],
  ];

  function dispatch(method, path, query = {}, body = {}) {
    let allowed = false;
    for (const [m, rx, h] of routes) {
      const match = path.match(rx); if (!match) continue; allowed = true; if (m !== method) continue;
      try { return [200, h(match, query, body || {})]; }
      catch (e) { if (e instanceof HttpError) return [e.status, { detail: e.message }]; return [400, { detail: String(e.message || e) }]; }
    }
    return allowed ? [405, { detail: "Method not allowed" }] : [404, { detail: "Not found" }];
  }

  svc.seedDemo();
  const remove = (id) => { delete db.learners[id]; db.order = db.order.filter((x) => x !== id); persist(); };
  return { dispatch, svc, all, load, put, remove, routes, HttpError, db: () => db, persist };
}
