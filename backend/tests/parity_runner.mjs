// Runs a fixed scenario through the browser engine (used by test_parity.py).
import { createEngine } from "../../frontend/js/engine.js";
let mem = null;
const e = createEngine({ load: () => mem, save: (d) => (mem = JSON.parse(JSON.stringify(d))) });
const call = (m, p, b = {}, q = {}) => { const [s, r] = e.dispatch(m, p, q, b); if (s !== 200) throw new Error(p + " " + s + " " + JSON.stringify(r)); return r; };
const out = {};
const snap = (L) => ({ readiness: L.match.readiness, matched: L.match.matched, partial: L.match.partial, missing: L.match.missing,
  prof: Object.fromEntries(Object.entries(L.proficiency).map(([k, v]) => [k, [v.score, v.confidence]])),
  nodes: L.roadmap.nodes.map((n) => [n.title || n.skill, n.status, n.est_hours]), active: L.roadmap.active,
  hours: L.roadmap.hours_remaining, weeks: L.roadmap.eta_weeks, remedial: Object.keys(L.remedial || {}),
  resources0: L.roadmap.nodes.map((n) => (n.resources[0] || {}).type), mentor: L.mentor.message,
  industries: L.match.industry_ranking.map((x) => [x.industry, x.role, x.readiness]).sort(),
  companies: L.match.companies_for_role.map((c) => [c.company, c.readiness, c.gaps]).sort(), dream: L.match.dream });
out.seed = snap(call("GET", "/api/learners/jane-doe").learner);
out.fail1 = snap(call("POST", "/api/learners/jane-doe/assess", { skill: "HTML/CSS", mode: "simulate", score: 40 }).learner);
out.fail2 = snap(call("POST", "/api/learners/jane-doe/assess", { skill: "HTML/CSS", mode: "explain", text: "css grid" }).learner);
out.pass = snap(call("POST", "/api/learners/jane-doe/assess", { skill: "HTML/CSS", mode: "quiz", answers: [1, 1, 0] }).learner);
out.progress = snap(call("POST", "/api/learners/jane-doe/progress", { skill: "JavaScript", hours: 3 }).learner);
out.pivot = snap(call("POST", "/api/learners/jane-doe/pivot", { target_role: "Data Engineer" }).learner);
const c = call("GET", "/api/cohort");
out.cohort = { avg: c.avg_readiness, gaps: c.skill_gaps.map((g) => [g.skill, g.pct_lacking, g.avg_gap]), risk: c.at_risk.map((a) => a.id).sort() };
out.resume = call("POST", "/api/resume/extract", { text: "Built REST APIs with Express and React.js; PostgreSQL, Git, pandas" }).skills.map((s) => s.name).sort();
out.chat = call("POST", "/api/learners/jane-doe/chat", { question: "why this order?" }).answer;
console.log(JSON.stringify(out));
