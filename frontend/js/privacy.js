/*
 * privacy.js - Data Consent and Data Privacy tabs, plus the consent gate.
 *
 * Consent model (GDPR Art. 6/7, India DPDP Act s.6):
 *   essential      always on - session, saved display settings, abuse counters
 *   analytics      off until opted in - page/feature counts, no personal data
 *   marketing      off until opted in
 *   ai_processing  off until opted in - only then may text go to Google Gemini
 *
 * Nothing non-essential runs before a choice is saved: consentAllows() is the single
 * gate used by the rest of the app, and it answers false until the user opts in.
 */
import { dollHtml, mountAll } from "./avatars.js";

const LOCAL = "sf-consent";                       // mirror, so guests keep their choice too
const DEFAULTS = { essential: true, analytics: false, marketing: false, ai_processing: false, updated: null };
let state = { ...DEFAULTS };
let cached = null;                                // the one /api/privacy/consent response, reused by both tabs
const listeners = new Set();

export function consentState() { return { ...state }; }
export function consentAllows(key) { return key === "essential" ? true : state[key] === true; }
export function consentDecided() { return !!state.updated; }
export function onConsentChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function setState(next) {
  state = { ...DEFAULTS, ...(next || {}) };
  state.essential = true;
  try { localStorage.setItem(LOCAL, JSON.stringify(state)); } catch (_) {}
  document.body.dataset.analytics = state.analytics ? "on" : "off";
  listeners.forEach((fn) => { try { fn(consentState()); } catch (_) {} });
}

/** Load the saved choice at start-up: the server's copy when signed in, otherwise this device's. */
export async function initConsent(api) {
  let local = null;
  try { local = JSON.parse(localStorage.getItem(LOCAL) || "null"); } catch (_) {}
  setState(local);
  try {
    const r = await api("api/privacy/consent");
    cached = r;
    if (r && r.consent && (r.consent.updated || !local)) setState(r.consent);
    return r;
  } catch (_) { return null; }
}

/* ------------------------------------------------------------------ */
/* Analytics: counts only, in this browser, and only after opt-in.      */
/* No cookies, no third party, no identifiers, nothing leaves the device.*/
const AKEY = "sf-analytics";
export function track(event) {
  if (!consentAllows("analytics")) return;        // the gate: nothing is recorded without consent
  try {
    const d = JSON.parse(localStorage.getItem(AKEY) || "{}");
    d[event] = (d[event] || 0) + 1;
    d._since = d._since || new Date().toISOString().slice(0, 10);
    localStorage.setItem(AKEY, JSON.stringify(d));
  } catch (_) {}
}
export function analyticsSummary() {
  try { return JSON.parse(localStorage.getItem(AKEY) || "{}"); } catch (_) { return {}; }
}
function clearAnalytics() { try { localStorage.removeItem(AKEY); } catch (_) {} }

/* ------------------------------------------------------------------ */
/* The banner shown until a choice is made                              */
/* ------------------------------------------------------------------ */
export function consentBanner(c) {
  if (consentDecided() || document.getElementById("consent-bar")) return;
  const bar = document.createElement("div");
  bar.id = "consent-bar";
  bar.setAttribute("role", "dialog");
  bar.setAttribute("aria-label", "Cookie and data choices");
  bar.innerHTML = `<div class="cb-text"><b>Your data, your choice.</b> Only the essentials are on right now — your sign-in and the display settings you pick.
      Analytics, marketing and sending text to an outside AI stay <b>off</b> until you turn them on.
      <a href="privacy.html">Read what we collect</a>.</div>
    <div class="cb-btns"><button class="btn sm" id="cb-all" data-tip="Turn on analytics, marketing and AI processing">Accept all</button>
      <button class="btn ghost sm" id="cb-ess" data-tip="Keep only what the site needs to work">Reject non-essential</button>
      <a class="btn ghost sm" href="consent.html" data-tip="Choose each one separately">Choose…</a></div>`;
  document.body.appendChild(bar);
  const close = () => bar.remove();
  bar.querySelector("#cb-all").onclick = async () => { await saveConsent(c, { analytics: true, marketing: true, ai_processing: true }); close(); c.toast?.("Thanks — all optional data uses are on"); };
  bar.querySelector("#cb-ess").onclick = async () => { await saveConsent(c, {}); clearAnalytics(); close(); c.toast?.("Only essential data will be used"); };
}

async function saveConsent(c, choice) {
  const next = { ...DEFAULTS, ...choice, essential: true, updated: new Date().toISOString() };
  setState(next);
  if (!next.analytics) clearAnalytics();
  if (c?.S?.user) {
    try { const r = await c.api("api/privacy/consent", next); setState(r.consent); if (cached) cached.consent = r.consent; }
    catch (_) { /* kept on this device; the server copy syncs on the next sign-in */ }
  }
  return consentState();
}

/** The consent payload (switch definitions + what we collect). Fetched once per page load. */
async function privacyInfo(c) {
  if (cached) return cached;
  cached = await c.api("api/privacy/consent");
  if (cached?.consent) setState(cached.consent);
  return cached;
}

/* ------------------------------------------------------------------ */
/* Tab 1: Data Consent                                                  */
/* ------------------------------------------------------------------ */
export async function pConsent(el, c) {
  const { esc } = c;
  el.innerHTML = `${c.head("Data Consent", "Choose exactly what SkillForge AI may do with your data")}${c.note("consent")}
    <div id="cs-body"><div class="card loading-card" aria-busy="true"><span class="spinner"></span> Loading your choices…</div></div>`;
  let data;
  try { data = await privacyInfo(c); }
  catch (e) {
    el.querySelector("#cs-body").innerHTML = `<div class="card error-card" role="alert"><h3>Could not load your choices</h3>
      <p class="muted">${esc(e.message)}</p><button class="btn sm" id="cs-retry">Try again</button></div>`;
    el.querySelector("#cs-retry").onclick = () => { cached = null; pConsent(el, c); };
    return;
  }
  const cats = data.categories || [];
  const draw = () => {
    const s = consentState();
    el.querySelector("#cs-body").innerHTML = `
    <div class="grid g2">
      <div class="card">
        <h3>What may we use? <span class="badge ${s.updated ? "ok" : "warn"}">${s.updated ? "saved" : "not chosen yet"}</span></h3>
        <p class="small muted">Everything except “Essential” is <b>off</b> until you switch it on. You can change this at any time, and withdrawing is as easy as giving.</p>
        ${cats.map((k) => `<div class="consent-row">
          <label class="switch" data-tip="${k.required ? "Always on — the site cannot work without it" : "Off unless you switch it on"}">
            <input type="checkbox" data-k="${esc(k.key)}" ${s[k.key] ? "checked" : ""} ${k.required ? "disabled checked" : ""} aria-label="${esc(k.name)}">
            <span class="track" aria-hidden="true"></span></label>
          <div><b>${esc(k.name)}</b>${k.required ? ' <span class="badge">always on</span>' : ""}
            <div class="small">${esc(k.what)}</div>
            <div class="small muted">${esc(k.why)}</div>
            <div class="small muted">⚖ ${esc(k.legal)}</div></div></div>`).join("")}
        <div class="row" style="margin-top:16px">
          <button class="btn primary sm" id="cs-save" data-tip="Save exactly what you picked above">Save preferences</button>
          <button class="btn ghost sm" id="cs-all" data-tip="Turn everything on">Accept all</button>
          <button class="btn ghost sm" id="cs-none" data-tip="Keep only what the site needs to work">Reject non-essential</button>
        </div>
        <p class="small muted" id="cs-stamp" style="margin-top:10px">Last updated: ${s.updated ? esc(new Date(s.updated).toLocaleString()) : "never — nothing optional is running"}</p>
        ${data.signed_in ? "" : `<p class="small muted">You are not signed in, so your choice is kept on this device. <a href="login.html">Sign in</a> to carry it across devices.</p>`}
        <div id="cs-msg" aria-live="polite"></div>
      </div>
      <div>
        <div class="card"><div style="text-align:center">${dollHtml("assessor", 120)}</div>
          <h3 style="justify-content:center">Nothing runs before you say yes</h3>
          <ul class="next-list">
            <li><b>✓</b><span>No advertising cookies and no third-party trackers anywhere on this site.</span></li>
            <li><b>✓</b><span>Analytics are counts kept in <i>this browser only</i> — never uploaded, never tied to your name.</span></li>
            <li><b>✓</b><span>With <b>AI processing</b> off, your text never leaves the server: the built-in rules grade it instead.</span></li>
            <li><b>✓</b><span>Switching something off also deletes what it collected.</span></li>
          </ul></div>
        <div class="card" style="margin-top:16px"><h3>What analytics has recorded</h3>
          <div id="cs-an"></div></div>
      </div></div>`;
    const an = analyticsSummary(), keys = Object.keys(an).filter((k) => k !== "_since");
    el.querySelector("#cs-an").innerHTML = !consentAllows("analytics")
      ? `<p class="muted small">Analytics is off, so nothing is being recorded.</p>`
      : (keys.length ? `<table>${keys.map((k) => `<tr><td>${esc(k)}</td><td><b>${an[k]}</b></td></tr>`).join("")}</table>
          <button class="btn ghost sm" id="cs-clear" style="margin-top:10px">Clear these counts</button>`
        : `<p class="muted small">Nothing recorded yet since ${esc(an._since || "today")}.</p>`);
    const clearBtn = el.querySelector("#cs-clear");
    if (clearBtn) clearBtn.onclick = () => { clearAnalytics(); draw(); c.toast("Analytics counts cleared"); };

    const pick = () => Object.fromEntries([...el.querySelectorAll("[data-k]")].map((i) => [i.dataset.k, i.checked]));
    const save = async (choice, label) => {
      const msg = el.querySelector("#cs-msg");
      msg.innerHTML = `<div class="form-msg">Saving…</div>`;
      try { await saveConsent(c, choice); draw(); c.sound.play("good"); c.toast(label); }
      catch (e) { msg.innerHTML = `<div class="form-msg bad">${esc(e.message)}</div>`; }
    };
    el.querySelector("#cs-save").onclick = () => save(pick(), "Preferences saved");
    el.querySelector("#cs-all").onclick = () => save({ analytics: true, marketing: true, ai_processing: true }, "All optional uses are on");
    el.querySelector("#cs-none").onclick = () => save({}, "Only essential data will be used");
    mountAll(el);
  };
  draw();
}

/* ------------------------------------------------------------------ */
/* Tab 2: Data Privacy                                                  */
/* ------------------------------------------------------------------ */
export async function pPrivacy(el, c) {
  const { esc } = c;
  el.innerHTML = `${c.head("Data Privacy", "What we keep, why we keep it, and how to take it back")}${c.note("privacy")}
    <div id="pv-body"><div class="card loading-card" aria-busy="true"><span class="spinner"></span> Loading…</div></div>`;
  let data;
  try { data = await privacyInfo(c); }
  catch (e) {
    el.querySelector("#pv-body").innerHTML = `<div class="card error-card" role="alert"><h3>Could not load this page</h3><p class="muted">${esc(e.message)}</p><button class="btn sm" id="pv-retry">Try again</button></div>`;
    el.querySelector("#pv-retry").onclick = () => { cached = null; pPrivacy(el, c); };
    return;
  }
  const u = c.S.user;
  el.querySelector("#pv-body").innerHTML = `
  <div class="card"><h3>📋 In plain words</h3>
    <p>SkillForge AI keeps only what it needs to build your learning path. We do not sell data, we do not
      advertise, and there are no third-party trackers on this site. You can download everything we hold
      or delete it permanently, at any time, from this page.</p>
    <div style="overflow-x:auto"><table><tr><th>What</th><th>Exactly what is stored</th><th>Why</th></tr>
      ${(data.collected || []).map(([what, detail, why]) => `<tr><td><b>${esc(what)}</b></td><td>${esc(detail)}</td><td class="small muted">${esc(why)}</td></tr>`).join("")}</table></div>
    <p class="small muted" style="margin-top:12px">Who can see your profile: you, faculty members of <i>your own</i> college, and an administrator.
      Other students only ever see your name, college, goal and readiness — and only while “show me in college lists” is on in your profile.</p>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>⚖ Your rights</h3><ul class="next-list">
      <li><b>1</b><span><b>Know</b> — this page lists everything we store and why (GDPR Art. 13–15; DPDP s.11).</span></li>
      <li><b>2</b><span><b>Get a copy</b> — download it as a JSON file you can keep or move elsewhere (Art. 20).</span></li>
      <li><b>3</b><span><b>Correct</b> — edit your profile at any time (Art. 16; DPDP s.12).</span></li>
      <li><b>4</b><span><b>Erase</b> — delete your account and everything linked to it (Art. 17; DPDP s.12(3)).</span></li>
      <li><b>5</b><span><b>Withdraw consent</b> — on the <a href="consent.html">Data Consent</a> tab, as easily as it was given (Art. 7(3); DPDP s.6(4)).</span></li>
      <li><b>6</b><span><b>Complain</b> — write to us from the <a href="contact.html">contact page</a>.</span></li>
    </ul></div>
    <div class="card"><h3>🔐 How it is protected</h3><ul class="next-list">
      <li><b>✓</b><span>Passwords are hashed with PBKDF2-SHA256 (600,000 rounds). Nobody can read them, including us.</span></li>
      <li><b>✓</b><span>Session cookies are HttpOnly and SameSite, so other sites cannot read or reuse them.</span></li>
      <li><b>✓</b><span>Every form is cleaned of HTML and scripts; a strict Content-Security-Policy blocks injected code.</span></li>
      <li><b>✓</b><span>Your IP address is used in memory only, for rate limiting — never written to a file or database.</span></li>
      <li><b>✓</b><span>No personal data is ever written to the browser console or server logs.</span></li>
    </ul></div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>⬇ Download my data</h3>
      <p class="small muted">A JSON file with your account, profile, progress and messages. Your password is never included.</p>
      <button class="btn primary sm" id="pv-export" ${u ? "" : "disabled"} data-tip="${u ? "Saves a .json file to your device" : "Sign in first"}">Download my data</button>
      ${u ? "" : `<p class="small muted" style="margin-top:8px">You need to be signed in. <a href="login.html">Sign in</a></p>`}
      <div id="pv-ex-msg" aria-live="polite"></div></div>
    <div class="card danger-card"><h3>🗑 Delete my account &amp; data</h3>
      <p class="small muted">Permanently removes your account, learner profile, progress, messages and contact messages. This cannot be undone.</p>
      <button class="btn danger sm" id="pv-del" ${u ? "" : "disabled"} data-tip="${u ? "Asks you to confirm first" : "Sign in first"}">Delete my account &amp; data</button>
      ${u && u.demo ? `<p class="small muted" style="margin-top:8px">The shared demo account cannot be deleted.</p>` : ""}
      <div id="pv-del-msg" aria-live="polite"></div></div>
  </div>
  <p class="small muted" style="margin-top:14px">ⓘ This is a student project, not legal advice. It follows GDPR and India's DPDP Act 2023 principles: purpose limitation, data minimisation, consent, and the right to access and erase.</p>`;

  const ex = el.querySelector("#pv-export");
  if (ex) ex.onclick = async () => {
    const msg = el.querySelector("#pv-ex-msg");
    ex.disabled = true; msg.innerHTML = `<div class="form-msg">Preparing your file…</div>`;
    try {
      const data2 = await c.api("api/privacy/export");
      const blob = new Blob([JSON.stringify(data2, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `skillforge-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      msg.innerHTML = `<div class="form-msg ok">Downloaded. Check your downloads folder.</div>`;
      c.sound.play("good");
    } catch (e) { msg.innerHTML = `<div class="form-msg bad">${esc(e.message)}</div>`; }
    finally { ex.disabled = false; }
  };

  const del = el.querySelector("#pv-del");
  if (del) del.onclick = () => {
    c.modal("Delete your account?", `<p>This permanently deletes:</p>
      <ul class="next-list"><li><b>·</b><span>your account and sign-in</span></li><li><b>·</b><span>your learner profile, roadmap and progress</span></li>
        <li><b>·</b><span>your questions to faculty and their replies</span></li><li><b>·</b><span>any contact messages you sent</span></li></ul>
      <p class="small muted">It cannot be undone. If you only want to stop appearing in college lists, turn off
        “show me in college lists” on your profile instead.</p>
      <form id="f-del"><div class="field"><label class="lbl" for="del-confirm">Type <b>DELETE</b> to confirm</label>
        <input id="del-confirm" autocomplete="off" maxlength="10" placeholder="DELETE" aria-describedby="del-help"></div>
        <p class="small muted" id="del-help">We ask for this so nothing is deleted by accident.</p>
        <div class="row"><button class="btn danger" type="submit">Delete everything</button>
          <button class="btn ghost" type="button" id="del-cancel">Keep my account</button></div>
        <div id="del-out" aria-live="assertive"></div></form>`);
    document.querySelector("#del-cancel").onclick = () => c.closeModal();
    c.onSubmit(document.querySelector("#f-del"), async () => {
      const out = document.querySelector("#del-out"), btn = document.querySelector("#f-del [type=submit]");
      btn.disabled = true; out.innerHTML = `<div class="form-msg">Deleting…</div>`;
      try {
        const r = await c.api("api/privacy/delete", { confirm: document.querySelector("#del-confirm").value });
        out.innerHTML = `<div class="form-msg ok">${esc(r.message)}</div>`;
        c.S.user = null;
        try { localStorage.removeItem("sf-learner"); localStorage.removeItem(LOCAL); } catch (_) {}
        clearAnalytics();
        setTimeout(() => c.go("index.html", "Goodbye"), 1600);
      } catch (x) { out.innerHTML = `<div class="form-msg bad">${esc(x.message)}</div>`; btn.disabled = false; }
    });
  };
}
