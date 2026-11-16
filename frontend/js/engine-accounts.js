/*
 * engine-accounts.js - accounts, directories, faculty, contact and leaderboard for the
 * browser-only web version (GitHub Pages has no server and therefore no real database).
 *
 * It mirrors backend/skillforge/auth.py + service.py so every page works identically, but
 * the data lives in THIS browser's localStorage. That makes it a DEMO of the account system:
 *   - passwords are still never stored in plain text (PBKDF2-SHA256 via WebCrypto)
 *   - but anything in a browser can be read by whoever uses that browser
 * The real, multi-user, server-side version is the FastAPI backend.
 */
import K from "./knowledge.js";
import { cleanText, cleanEmail, findInstitution } from "./engine.js";

const ITER = 150000;                      // lower than the server's 600k: phones are slow
const KEY = "sf-accounts", SESSION = "sf-session";
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => new Uint8Array(h.match(/.{2}/g).map((b) => parseInt(b, 16)));

async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations }, key, 256));
}
async function hashPassword(pw) { const salt = crypto.getRandomValues(new Uint8Array(16)); return `pbkdf2_sha256$${ITER}$${hex(salt)}$${await pbkdf2(pw, salt, ITER)}`; }
async function verifyPassword(pw, stored) {
  try { const [algo, it, salt, h] = stored.split("$"); if (algo !== "pbkdf2_sha256") return false; return (await pbkdf2(pw, unhex(salt), +it)) === h; } catch (_) { return false; }
}
const COMMON = new Set(["password", "12345678", "123456789", "qwerty123", "password1", "iloveyou", "admin123", "welcome1", "letmein1", "abc12345", "11111111", "skillforge"]);
export function passwordProblem(p, email = "", name = "") {
  p = p || "";
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (p.length > 200) return "Password must be under 200 characters.";
  if (COMMON.has(p.toLowerCase())) return "That password is too common. Please choose something less guessable.";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Password must contain at least one letter and one number.";
  for (const part of [email.split("@")[0].toLowerCase(), name.toLowerCase()]) if (part && part.length >= 4 && p.toLowerCase().includes(part)) return "Password must not contain your name or email.";
  return null;
}

class Http extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const MIN_SIGNUP_AGE = 18;                 // keep in step with backend/skillforge/auth.py
const TERMS_VERSION = "2026-11-16";
const DEMO_DOMAIN = "@demo.skillforge.test";       // reserved for demo accounts; cannot be registered
const DEMO = [
  ["Demo Admin", "admin@demo.skillforge.test", "rathinam-technical-campus", "Administration", "admin"],   // web demo only: data never leaves this browser
  ["Dr. Anitha Rajan", "anitha.rajan@demo.skillforge.test", "rathinam-technical-campus", "Computer Applications", "faculty"],
  ["Prof. Senthil Kumar", "senthil.kumar@demo.skillforge.test", "kumaraguru-college-of-technology", "Mechanical Engineering", "faculty"],
  ["Dr. Fathima Beevi", "fathima.beevi@demo.skillforge.test", "kongu-engineering-college", "Electronics and Communication", "faculty"],
];

export function createAccounts(engine) {
  const blank = () => ({ v: 2, users: [], contacts: [], messages: [], fails: {} });
  const read = () => { try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); return d && d.v === 2 ? d : blank(); } catch (_) { return blank(); } };
  const write = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (_) {} };
  const safe = (u) => { if (!u) return null; const { password_hash, ...rest } = u; return rest; };
  const current = () => { let id = null; try { id = localStorage.getItem(SESSION); } catch (_) {} return id ? read().users.find((u) => u.id === id) || null : null; };
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "user";
  const hits = {};
  function rate(key, limit, windowMs) {
    const now = Date.now(); const q = (hits[key] = (hits[key] || []).filter((t) => now - t < windowMs));
    if (q.length >= limit) throw new Http(429, `Too many requests. Please wait ${Math.ceil((windowMs - (now - q[0])) / 1000)} second(s) and try again.`);
    q.push(now);
  }
  function need(user, ...roles) {
    if (!user) throw new Http(401, "Please sign in to continue.");
    if (roles.length && !roles.includes(user.role)) throw new Http(403, "Your account does not have access to this area.");
    return user;
  }
  const isDemoUser = (u) => !!u && String(u.email || "").endsWith(DEMO_DOMAIN);
  const CONSENT_KEYS = ["essential", "analytics", "marketing", "ai_processing"];
  const DEFAULT_CONSENT = { essential: true, analytics: false, marketing: false, ai_processing: false, updated: null };
  const cleanConsent = (d) => ({ ...Object.fromEntries(CONSENT_KEYS.map((k) => [k, !!(d || {})[k]])), essential: true, updated: new Date().toISOString() });
  const consentOf = (u) => ({ ...DEFAULT_CONSENT, ...((u || {}).consent || {}) });
  const isListed = (l) => l.listed !== false;
  // Same rules as backend/skillforge/auth.py: demo learners are an open sandbox; a real profile is
  // readable by its owner, faculty of the same college and admins - and editable only by owner/admin.
  function canView(user, learner) {
    if (learner.demo) return true;
    if (!user) return false;
    if (user.role === "admin") return true;                 // (web demo: the admin is the visitor themself)
    if (isDemoUser(user)) return false;
    if (user.learner_id && user.learner_id === learner.id) return true;
    if (user.role === "faculty") return !!user.institution_id && user.institution_id === (learner.institution_id || "");
    return false;
  }
  function canEdit(user, learner) {
    if (learner.demo) return true;
    if (!user) return false;
    if (user.role === "admin") return true;
    if (isDemoUser(user)) return false;
    return !!user.learner_id && user.learner_id === learner.id;
  }
  function card(l) {
    const m = l.match || {};
    return { id: l.id, name: l.name, education: l.education, institution: l.institution || l.organization, institution_id: l.institution_id,
      city: l.city, district: l.district, state: l.state, target_role: l.target_role, industry: m.industry, readiness: m.readiness || 0,
      top_skills: (l.analysis?.strengths || []).slice(0, 4).map((s) => s.skill), dream_company: l.dream_company, demo: !!l.demo };
  }

  async function seed() {
    const d = read(); if (d.users.length) return;
    for (const [name, email, inst_id, dept, role] of DEMO) {
      const inst = findInstitution(inst_id);
      // No shared demo password: "!" can never match a hash, so these accounts open only through the demo button.
      d.users.push({ id: `${slug(name)}-demo`, email, password_hash: "!", name, role, learner_id: null,
        institution_id: inst.id, institution: inst.name, department: dept, city: inst.city, district: inst.district, state: inst.state, created: new Date().toISOString() });
    }
    write(d);
  }

  const R = {
    async "POST /api/auth/signup"(q, b) {
      rate("signup", 5, 3600e3);
      const name = cleanText(b.name, 80), email = cleanEmail(b.email), password = String(b.password || "");
      const role = ["student", "faculty"].includes(b.role) ? b.role : "student";      // nobody can sign up as admin
      if (name.length < 2) throw new Http(400, "Please enter your full name.");
      if (!email) throw new Http(400, "Please enter a valid email address.");
      const prob = passwordProblem(password, email, name); if (prob) throw new Http(400, prob);
      if (b.confirm != null && String(b.confirm) !== password) throw new Http(400, "The two passwords do not match.");
      // Same age gate as the server: self sign-up is 18+, because under India's DPDP
      // Act a child's data needs verifiable parental consent, which we do not implement.
      const truthy = (v) => ["1", "true", "yes", "on"].includes(String(v).trim().toLowerCase());
      if (!truthy(b.age_confirmed)) throw new Http(400, `You must confirm you are ${MIN_SIGNUP_AGE} or over to create an account. If you are younger, ask your college to enrol you.`);
      if (!truthy(b.terms_accepted)) throw new Http(400, "Please accept the Terms of Service and the Privacy Policy.");
      const d = read();
      if (email.endsWith(DEMO_DOMAIN)) throw new Http(400, "That email domain is reserved. Please use your own email address.");
      if (d.users.some((u) => u.email === email)) throw new Http(400, "An account with that email already exists. Try signing in instead.");
      const inst = findInstitution(b.institution_id || b.institution || "");
      const user = { id: `${slug(name)}-${Math.random().toString(16).slice(2, 8)}`, email, password_hash: await hashPassword(password), name, role, learner_id: null,
        institution_id: inst?.id || null, institution: inst?.name || cleanText(b.institution, 120), department: cleanText(b.department, 80),
        city: inst?.city || cleanText(b.city, 60), district: inst?.district || cleanText(b.district, 60), state: inst?.state || "Tamil Nadu", created: new Date().toISOString(),
        age_confirmed: new Date().toISOString(), terms_accepted: new Date().toISOString(), terms_version: TERMS_VERSION };
      if (role !== "faculty") {                       // students and the first (admin) account get a profile
        const res = engine.svc.saveProfile({ id: "u-" + user.id, name, email, institution_id: user.institution_id, institution: user.institution, education: user.department, target_role: "Full Stack Developer", hours_per_week: 8, skills: [], listed: true }, { owner: user.id });
        user.learner_id = res.learner.id;
      }
      d.users.push(user); write(d);
      try { localStorage.setItem(SESSION, user.id); } catch (_) {}
      return { user: safe(user) };
    },
    // No server, no mailbox: a reset link cannot be sent from a page that only has
    // this browser's own storage. Say so plainly instead of pretending to send one.
    async "POST /api/auth/forgot"() {
      throw new Http(400, "The browser version keeps your account in this browser only, so it cannot email a reset link. "
        + "Sign in on the same browser, or run the full version to use password reset.");
    },
    async "POST /api/auth/reset"() {
      throw new Http(400, "Password reset needs the full version with a server. In the browser version, use Account - change password while signed in.");
    },
    async "POST /api/auth/verify"() {
      throw new Http(400, "Email confirmation needs the full version with a server.");
    },
    async "POST /api/auth/login"(q, b) {
      const email = cleanEmail(b.email), d = read(), now = Date.now();
      const f = (d.fails[email || "?"] = (d.fails[email || "?"] || []).filter((t) => now - t < 300e3));
      if (f.length >= 8) throw new Http(401, "Too many sign-in attempts. Try again in about 15 minute(s).");
      const row = d.users.find((u) => u.email === email);
      const ok = await verifyPassword(String(b.password || ""), row ? row.password_hash : "pbkdf2_sha256$1000$00$00");
      if (!ok || !row) { f.push(now); write(d); throw new Http(401, "Email or password is incorrect."); }
      d.fails[email] = []; row.last_login = new Date().toISOString(); write(d);
      try { localStorage.setItem(SESSION, row.id); } catch (_) {}
      return { user: safe(row) };
    },
    async "POST /api/auth/logout"() { try { localStorage.removeItem(SESSION); } catch (_) {} return { ok: true }; },
    async "POST /api/auth/demo"(q, b) {
      const role = b.role === "admin" ? "admin" : "faculty";
      const row = read().users.find((u) => isDemoUser(u) && u.role === role);
      if (!row) throw new Http(400, "No demo account is available.");
      try { localStorage.setItem(SESSION, row.id); } catch (_) {}
      return { user: { ...safe(row), demo: true } };
    },
    async "GET /api/auth/me"() { const u = current(); return { user: u ? { ...safe(u), demo: isDemoUser(u) } : null, signed_in: !!u, demo_logins: true, demo_admin: true }; },
    async "POST /api/auth/password"(q, b) {
      const u = need(current()), d = read(), row = d.users.find((x) => x.id === u.id);
      if (!(await verifyPassword(String(b.current || ""), row.password_hash))) throw new Http(401, "Your current password is incorrect.");
      const prob = passwordProblem(String(b.new || ""), row.email, row.name); if (prob) throw new Http(400, prob);
      row.password_hash = await hashPassword(String(b.new)); write(d);
      try { localStorage.removeItem(SESSION); } catch (_) {}
      return { ok: true, message: "Password changed. Please sign in again." };
    },
    async "GET /api/institutions"(q) {
      const counts = {}; for (const l of engine.all()) if (l.institution_id && isListed(l)) counts[l.institution_id] = (counts[l.institution_id] || 0) + 1;
      const term = cleanText(q.q, 60).toLowerCase();
      const rows = K.INSTITUTIONS.filter((i) => (!q.state || i.state === q.state) && (!q.district || i.district === q.district) && (!q.city || i.city === q.city) && (!q.kind || i.kind === q.kind)
        && (!term || `${i.name} ${i.city} ${i.district}`.toLowerCase().includes(term))).map((i) => ({ ...i, label: K.KIND_LABELS[i.kind] || i.kind, students: counts[i.id] || 0 }));
      return { institutions: rows, total: rows.length, geography: K.GEOGRAPHY, note: K.INSTITUTION_NOTE };
    },
    async "GET /api/directory"(q) {
      const viewer = current(), term = cleanText(q.q, 60).toLowerCase();
      let rows = engine.all().filter((l) => { const c = card(l);
        return (isListed(l) || canView(viewer, l)) && (!q.institution_id || c.institution_id === q.institution_id) && (!q.state || (c.state || "") === q.state) && (!q.district || (c.district || "") === q.district)
          && (!q.city || (c.city || "") === q.city) && (!q.role || c.target_role === q.role) && (!term || `${c.name} ${c.institution} ${c.target_role}`.toLowerCase().includes(term)); })
        .map((l) => ({ ...card(l), can_open: canView(viewer, l) })).sort((a, b) => b.readiness - a.readiness);
      const groups = {};
      for (const r of rows) { const k = r.institution || "Not specified"; const g = (groups[k] = groups[k] || { institution: k, institution_id: r.institution_id, city: r.city, district: r.district, state: r.state, students: 0, sum: 0 }); g.students++; g.sum += r.readiness; }
      return { students: rows.slice(0, 200), total: rows.length, institutions: Object.values(groups).map((g) => ({ ...g, avg_readiness: Math.round(g.sum / g.students) })).sort((a, b) => b.students - a.students), viewer_role: viewer?.role || "guest" };
    },
    async "GET /api/faculty"(q) {
      const rows = read().users.filter((u) => u.role === "faculty" && (!q.institution_id || u.institution_id === q.institution_id))
        .map((f) => ({ id: f.id, name: f.name, demo: isDemoUser(f), department: f.department, institution: f.institution, institution_id: f.institution_id, city: f.city, district: f.district, state: f.state }));
      return { faculty: rows.sort((a, b) => a.name.localeCompare(b.name)), total: rows.length };
    },
    async "GET /api/faculty/students"(q) {
      const u = need(current(), "faculty", "admin");
      const inst = u.role === "admin" ? (q.institution_id || "") : u.institution_id;
      const rows = [], help = [], gaps = {};
      for (const l of engine.all()) {
        if (u.role !== "admin" && (l.institution_id || "") !== (inst || "\0")) continue;
        if (u.role === "admin" && inst && (l.institution_id || "") !== inst) continue;
        if (!canView(u, l)) continue;
        const m = l.match || {}, scores = (l.assessments || []).map((a) => a.score);
        const row = { id: l.id, name: l.name, education: l.education, target_role: l.target_role, industry: m.industry, readiness: m.readiness || 0, active: l.roadmap?.active,
          assessments: scores.length, avg_score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
          hours: Math.round((l.study_log || []).reduce((a, e) => a + Number(e.hours || 0), 0) * 10) / 10, remedial: Object.keys(l.remedial || {}), dream_company: l.dream_company, missing: (m.missing || []).slice(0, 4) };
        rows.push(row); row.missing.forEach((s) => (gaps[s] = (gaps[s] || 0) + 1));
        const reasons = []; if (row.readiness < 35) reasons.push("low readiness"); if (Math.max(0, ...Object.values(l.fail_streak || {})) >= 2) reasons.push("repeated failed assessments"); if (row.remedial.length) reasons.push("in remedial lab");
        if (reasons.length) help.push({ ...row, reasons });
      }
      return { institution: u.role === "admin" ? (inst || "All institutions") : u.institution, students: rows.sort((a, b) => a.readiness - b.readiness), needs_help: help,
        common_gaps: Object.entries(gaps).map(([skill, students]) => ({ skill, students })).sort((a, b) => b.students - a.students).slice(0, 8),
        avg_readiness: rows.length ? Math.round(rows.reduce((a, r) => a + r.readiness, 0) / rows.length) : 0 };
    },
    async "POST /api/contact"(q, b) {
      rate("contact", 5, 3600e3);
      const name = cleanText(b.name, 80), email = cleanEmail(b.email), message = cleanText(b.message, 4000, true);
      if (name.length < 2) throw new Http(400, "Please enter your name.");
      if (!email) throw new Http(400, "Please enter a valid email address.");
      if (message.length < 10) throw new Http(400, "Please write a message of at least 10 characters.");
      if (b.website) return { ok: true, id: 0 };
      const d = read(); const id = d.contacts.length + 1;
      d.contacts.unshift({ id, name, email, subject: cleanText(b.subject, 120) || "(no subject)", message, institution: cleanText(b.institution, 120), created: new Date().toISOString() }); write(d);
      return { ok: true, id, message: "Thank you - your message has been saved." };
    },
    // --- data consent & privacy (same rules as the server) ----------------
    async "GET /api/privacy/consent"() {
      const u = current();
      return { consent: consentOf(u), signed_in: !!u, categories: K.PRIVACY_CATEGORIES, collected: K.DATA_WE_KEEP };
    },
    async "POST /api/privacy/consent"(q, b) {
      const u = need(current()), d = read(), row = d.users.find((x) => x.id === u.id);
      row.consent = cleanConsent(b); write(d);
      return { ok: true, consent: row.consent };
    },
    async "GET /api/privacy/export"() {
      const u = need(current()), row = read().users.find((x) => x.id === u.id);
      const learner = row.learner_id ? engine.db().learners[row.learner_id] || null : null;
      const msgs = read().messages.filter((m) => m.from_user === u.id || m.to_user === u.id)
        .map(({ id, from_name, to_name, body, created, reply, replied }) => ({ id, from_name, to_name, body, created, reply, replied }));
      return { exported: new Date().toISOString(), note: "Everything this browser stores about your account. Your password is never included - only an unreadable hash is kept, and it is not exported.",
        account: safe(row), consent: consentOf(row), learner_profile: learner, messages: msgs };
    },
    async "POST /api/privacy/delete"(q, b) {
      const u = need(current());
      if (String(b.confirm || "").trim().toUpperCase() !== "DELETE") throw new Http(400, "Please type DELETE to confirm.");
      if (isDemoUser(u)) throw new Http(403, "The shared demo account cannot be deleted.");
      const d = read(), counts = { learners: 0, sessions: 1, messages: 0, contacts: 0 };
      if (u.learner_id && engine.db().learners[u.learner_id]) { engine.remove(u.learner_id); counts.learners = 1; }
      counts.messages = d.messages.filter((m) => m.from_user === u.id || m.to_user === u.id).length;
      d.messages = d.messages.filter((m) => m.from_user !== u.id && m.to_user !== u.id);
      counts.contacts = d.contacts.filter((x) => x.email === u.email).length;
      d.contacts = d.contacts.filter((x) => x.email !== u.email);
      d.users = d.users.filter((x) => x.id !== u.id); write(d);
      try { localStorage.removeItem(SESSION); localStorage.removeItem("sf-learner"); localStorage.removeItem("sf-arena-" + u.learner_id); } catch (_) {}
      return { ok: true, deleted: counts, message: "Your account and all data linked to it have been permanently deleted." };
    },
    async "GET /api/admin/users"() { need(current(), "admin"); const rows = read().users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, institution: u.institution, department: u.department, created: u.created, last_login: u.last_login, demo: isDemoUser(u) })); return { users: rows, total: rows.length }; },
    async "GET /api/messages"() {
      const u = need(current());
      const rows = read().messages.filter((m) => m.to_user === u.id || m.from_user === u.id).map((m) => ({ id: m.id, from_name: m.from_name, to_name: m.to_name, body: m.body, created: m.created, reply: m.reply, replied: m.replied, direction: m.to_user === u.id ? "received" : "sent" }));
      return { messages: rows, unanswered: rows.filter((m) => m.direction === "received" && !m.reply).length };
    },
    async "GET /api/admin/contacts"() { need(current(), "admin"); const d = read(); return { messages: d.contacts, total: d.contacts.length }; },
    async "GET /api/admin/config"() { need(current(), "admin"); return { debug: false, public: true, gemini_configured: false, cors_origins: ["same-origin (static site)"], secret_source: "none - browser demo", warnings: ["Web demo: accounts live in this browser only."] }; },
    async "GET /api/leaderboard"(q) {
      const rows = engine.all().filter((l) => isListed(l) && (!(q.scope === "institution" && q.institution_id) || (l.institution_id || "") === q.institution_id)).map((l) => {
        const a = l.assessments || [], passed = a.filter((x) => x.passed).length, hours = (l.study_log || []).reduce((s, e) => s + Number(e.hours || 0), 0);
        const verified = Object.values(l.proficiency || {}).filter((p) => p.confidence === "verified").length;
        return { id: l.id, name: l.name, institution: l.institution, institution_id: l.institution_id, role: l.target_role, readiness: l.match?.readiness || 0, passed, verified, hours: Math.round(hours * 10) / 10,
          game_points: l.game?.points || 0, demo: !!l.demo,
          points: Math.round(passed * 100 + verified * 60 + hours * 10 + (l.match?.readiness || 0) * 2 + (l.game?.points || 0)) };
      }).sort((a, b) => b.points - a.points);
      rows.forEach((r, i) => (r.rank = i + 1));
      return { scope: q.scope || "all", rows: rows.slice(0, 100), total: rows.length };
    },
  };

  // Learner routes: enforce access here, then let the agent engine do the work.
  function learnerRoute(method, path, query, body) {
    const u = current(), svc = engine.svc;
    const gate = (id, write) => {
      const l = engine.db().learners[id];
      const ok = l && (write ? canEdit(u, l) : canView(u, l));
      if (!ok) {
        if (l && u && !write) throw new Http(403, "You do not have access to this profile.");
        if (l && write && canView(u, l)) throw new Http(403, "You can view this profile but not change it.");
        throw new Http(404, `Learner '${id}' not found`);
      }
      return l;
    };
    if (path === "/api/learners" && method === "GET") {
      return engine.all().filter((l) => canView(u, l)).map((l) => ({ id: l.id, name: l.name, target_role: l.target_role, readiness: l.match?.readiness, organization: l.organization,
        demo: !!l.demo, mine: !!u && u.learner_id === l.id, can_edit: canEdit(u, l) })).sort((a, b) => (b.mine - a.mine) || (a.demo - b.demo) || String(a.name).localeCompare(String(b.name)));
    }
    if (path === "/api/learners" && method === "POST") {
      let id = cleanText(body.id, 40);
      if (id && !/^[\w-]+$/.test(id)) throw new Http(400, "Invalid profile id.");
      const existing = id ? engine.db().learners[id] : null;
      if (existing) gate(id, true);
      else if (u && u.role === "admin") id = id || undefined;
      else if (u && u.learner_id) { id = u.learner_id; gate(id, true); }
      else throw new Http(401, "Please create a free account to save your own profile.");
      return svc.saveProfile({ ...body, id });
    }
    if (path === "/api/cohort" && method === "GET") return svc.cohort(query.organization || null, (l) => canView(u, l));
    if (path === "/api/demo/reset" && method === "POST") return svc.seedDemo(true);
    const m = path.match(/^\/api\/learners\/([\w-]+)(?:\/(assess|pivot|progress|chat|game))?$/);
    if (!m) return undefined;
    const [, id, action] = m;
    if (!action && method === "GET") { const l = gate(id, false); return { learner: JSON.parse(JSON.stringify(l)), trace: [], can_edit: canEdit(u, l) }; }
    if (method !== "POST") return undefined;
    const l = gate(id, true);
    if (action === "assess" && body.mode === "simulate" && !l.demo) throw new Http(400, "Simulated scores are only available on demo learners.");
    if (action === "game") return svc.gameResult(id, body);
    return undefined;                                       // allowed: fall through to the agent engine
  }

  async function handle(method, path, query = {}, body = {}) {
    await seed();
    try {
      let m = path.match(/^\/api\/students\/([\w-]+)$/);
      if (m && method === "GET") {
        const u = need(current()), l = engine.db().learners[m[1]];
        if (!l) throw new Http(404, "Student not found");
        if (!canView(u, l)) throw new Http(403, "You can only open profiles of students at your own institution.");
        return [200, { learner: JSON.parse(JSON.stringify(l)), trace: [], can_edit: canEdit(u, l) }];
      }
      m = path.match(/^\/api\/faculty\/([\w-]+)\/ask$/);
      if (m && method === "POST") {
        const u = need(current()); rate("ask", 30, 3600e3);
        const d = read(), target = d.users.find((x) => x.id === m[1] && x.role === "faculty");
        if (!target) throw new Http(404, "Faculty member not found");
        const text = cleanText(body.message, 2000, true);
        if (text.length < 10) throw new Http(400, "Please write a question of at least 10 characters.");
        const id = (d.messages.reduce((a, x) => Math.max(a, x.id), 0) || 0) + 1;
        d.messages.unshift({ id, from_user: u.id, from_name: u.name, to_user: target.id, to_name: target.name, body: text, created: new Date().toISOString(), reply: null, replied: null }); write(d);
        return [200, { ok: true, id, message: `Sent to ${target.name}. Their answer will appear on this page.` }];
      }
      m = path.match(/^\/api\/messages\/(\d+)\/reply$/);
      if (m && method === "POST") {
        const u = need(current(), "faculty", "admin"), d = read(), msg = d.messages.find((x) => x.id === +m[1]);
        if (!msg || msg.to_user !== u.id) throw new Http(404, "Message not found");
        const reply = cleanText(body.reply, 2000, true);
        if (reply.length < 2) throw new Http(400, "Please write a reply.");
        msg.reply = reply; msg.replied = new Date().toISOString(); write(d);
        return [200, { ok: true }];
      }
      const h = R[`${method} ${path}`];
      if (h) return [200, await h(query, body)];
      const out = learnerRoute(method, path, query, body);
      if (out !== undefined) return [200, JSON.parse(JSON.stringify(out))];
    } catch (e) { return [e.status || 400, { detail: e.message || "Error" }]; }
    return engine.dispatch(method, path, query, body);
  }
  return { handle, canView, canEdit };
}
