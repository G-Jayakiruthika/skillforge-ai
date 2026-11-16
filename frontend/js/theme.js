/*
 * theme.js - appearance + accessibility settings, and hover notes (tooltips).
 *
 * Settings (saved per browser):
 *   mode      dark | light | auto          bright / dark switch
 *   accent    page | <colour name>         each page has its own colour, or one colour everywhere
 *   style     immersive | minimal          full 3D/animated look, or a calm flat one
 *   text      1 | 1.15 | 1.3 | 1.5         text size
 *   contrast  normal | high                stronger borders + pure black/white text
 *   motion    full | reduced               stops animation and the 3D background
 *   spacing   normal | wide                wider letter/line spacing (easier for dyslexia / low vision)
 *   notes     on | off                     hover notes
 */
export const PAGE_COLORS = {
  home: ["#3cf0ff", "#ff3ea5"], app: ["#3cf0ff", "#8b5cff"], profile: ["#38bdf8", "#22d3ee"], analysis: ["#a78bfa", "#f472b6"],
  career: ["#fbbf24", "#fb7185"], learn: ["#4ade80", "#22d3ee"], world: ["#2dd4bf", "#60a5fa"], arena: ["#fb923c", "#f43f5e"],
  games: ["#f472b6", "#a78bfa"], compete: ["#facc15", "#fb923c"], progress: ["#f472b6", "#fb7185"], mentor: ["#60a5fa", "#a78bfa"],
  agents: ["#c084fc", "#22d3ee"], org: ["#34d399", "#a3e635"], colleges: ["#22d3ee", "#34d399"], places: ["#a3e635", "#facc15"],
  browse: ["#38bdf8", "#c084fc"], faculty: ["#f59e0b", "#84cc16"], portal: ["#fb7185", "#f59e0b"], signup: ["#34d399", "#38bdf8"],
  login: ["#60a5fa", "#34d399"], account: ["#94a3b8", "#60a5fa"], about: ["#e879f9", "#60a5fa"], contact: ["#2dd4bf", "#e879f9"], guide: ["#cbd5e1", "#60a5fa"],
};
export const ACCENTS = { Ocean: ["#38bdf8", "#22d3ee"], Violet: ["#a78bfa", "#f472b6"], Sunset: ["#fb923c", "#f43f5e"], Forest: ["#4ade80", "#2dd4bf"], Gold: ["#fbbf24", "#fb923c"], Rose: ["#fb7185", "#e879f9"], Slate: ["#94a3b8", "#cbd5e1"] };
const DEFAULTS = { mode: "dark", accent: "page", style: "immersive", text: "1", contrast: "normal", motion: "full", spacing: "normal", notes: "on" };
const KEY = "sf-settings";
let S = { ...DEFAULTS }, listeners = [];

export const settings = () => ({ ...S });
export function onChange(fn) { listeners.push(fn); }
/* ?reset=look throws away the saved display settings and brings back the full
   3D look. It exists so a link can rescue anyone whose browser is stuck on an
   accessibility setting they cannot find, with no need to open the panel. */
function load() {
  try { S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (_) { S = { ...DEFAULTS }; }
  try {
    if (new URLSearchParams(location.search).get("reset") === "look") {
      S = { ...DEFAULTS };
      localStorage.removeItem(KEY);
    }
  } catch (_) {}
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} }
export function set(key, value) { S[key] = value; save(); apply(); listeners.forEach((f) => f(S)); }
export function reset() { S = { ...DEFAULTS }; save(); apply(); listeners.forEach((f) => f(S)); }

// darken a hex colour so it stays readable on a light background
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))); return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, "0")).join(""); }
export function accentPair() {
  const page = document.body.dataset.page || "home";
  return S.accent === "page" ? PAGE_COLORS[page] || PAGE_COLORS.app : ACCENTS[S.accent] || PAGE_COLORS.app;
}
export const isLight = () => S.mode === "light" || (S.mode === "auto" && matchMedia("(prefers-color-scheme: light)").matches);
/* Which of the accessibility settings are currently hiding the 3D background and the
   animations. People turn one of these on, forget, and think the site is broken, so the
   gear button and the settings panel both say it plainly. */
export function visualsOff() {
  const why = [];
  if (S.contrast === "high") why.push("High contrast");
  if (S.style === "minimal") why.push("Minimal style");
  if (S.motion === "reduced") why.push("Reduce motion");
  return why;
}
export const isMinimal = () => S.style === "minimal";
export const motionOff = () => S.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;

export function apply() {
  const b = document.body, root = document.documentElement, light = isLight();
  let [a, a2] = accentPair();
  if (light) { a = shade(a, .62); a2 = shade(a2, .62); }
  root.style.setProperty("--accent", a); root.style.setProperty("--accent2", a2);
  root.style.setProperty("--text-scale", S.text);
  b.classList.toggle("light", light); b.classList.toggle("minimal", isMinimal());
  b.classList.toggle("hc", S.contrast === "high"); b.classList.toggle("no-motion", motionOff());
  b.classList.toggle("wide", S.spacing === "wide"); b.classList.toggle("notes-off", S.notes === "off");
  root.style.colorScheme = light ? "light" : "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#f6f7fb" : "#05060f");
  const btn = document.getElementById("btn-mode"); if (btn) { btn.textContent = light ? "🌙" : "☀️"; btn.dataset.tip = light ? "Switch to dark mode" : "Switch to bright mode"; }
  const gear = document.getElementById("btn-settings"), off = visualsOff();
  if (gear) {
    gear.classList.toggle("flagged", off.length > 0);
    gear.dataset.tip = off.length
      ? off.join(" + ") + " is on, so the 3D background and animations are hidden - click to change it"
      : "Colours, text size, contrast, minimalist style and more";
  }
}

/* Fonts are added from script (not an inline onload attribute) so the strict CSP holds. */
function loadFonts() {
  const l = document.createElement("link"); l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@400;500;600;700&display=swap";
  document.head.appendChild(l);
}

/* ---------------- settings panel ---------------- */
const seg = (key, opts) => `<div class="set-seg" role="radiogroup" data-key="${key}">${opts.map(([v, label, tip]) => `<button role="radio" aria-checked="${S[key] === v}" class="${S[key] === v ? "on" : ""}" data-v="${v}" data-tip="${tip || ""}">${label}</button>`).join("")}</div>`;
function panelHtml() {
  const off = visualsOff();
  const banner = off.length
    ? `<div class="set-warn"><b>${off.join(" + ")} is on.</b> The 3D background and the animations are hidden while it is.<button class="btn sm" id="set-restore">Restore the full look</button></div>`
    : "";
  return `<div class="set-head"><h3>Display &amp; accessibility</h3><button class="icon-btn" id="set-close" aria-label="Close settings">✕</button></div>${banner}
  <label class="lbl">Brightness</label>${seg("mode", [["dark", "🌙 Dark", "Dark background, easier in low light"], ["light", "☀️ Bright", "Light background, easier in daylight"], ["auto", "Auto", "Follow your device setting"]])}
  <label class="lbl">Style</label>${seg("style", [["immersive", "✨ Immersive", "3D background, animations and effects"], ["minimal", "▢ Minimal", "Calm, flat design with no effects"]])}
  <label class="lbl">Colour</label><div class="swatches" data-key="accent"><button class="sw rainbow ${S.accent === "page" ? "on" : ""}" data-v="page" data-tip="A different colour on every page" aria-label="Different colour per page"></button>${Object.entries(ACCENTS).map(([n, [c1, c2]]) => `<button class="sw ${S.accent === n ? "on" : ""}" data-v="${n}" style="background:linear-gradient(135deg,${c1},${c2})" data-tip="${n} everywhere" aria-label="${n} colour"></button>`).join("")}</div>
  <label class="lbl">Text size</label>${seg("text", [["1", "A", "Normal text"], ["1.15", "A+", "Larger text"], ["1.3", "A++", "Large text"], ["1.5", "A+++", "Extra large text"]])}
  <label class="lbl">Contrast</label>${seg("contrast", [["normal", "Normal", ""], ["high", "High contrast", "Stronger colours and borders for low vision"]])}
  <label class="lbl">Motion</label>${seg("motion", [["full", "Animated", ""], ["reduced", "Reduce motion", "Stops animation and the moving background"]])}
  <label class="lbl">Reading</label>${seg("spacing", [["normal", "Normal spacing", ""], ["wide", "Wide spacing", "More space between letters and lines - helps with dyslexia and low vision"]])}
  <label class="lbl">Hover notes</label>${seg("notes", [["on", "Show notes", "Explain buttons when you point at them"], ["off", "Hide notes", ""]])}
  <button class="btn ghost sm" id="set-reset" style="margin-top:14px">Reset to defaults</button>`;
}
function openPanel() {
  let p = document.getElementById("settings-panel");
  if (!p) { p = document.createElement("aside"); p.id = "settings-panel"; p.className = "glass"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Display and accessibility settings"); document.body.appendChild(p); }
  p.innerHTML = panelHtml(); p.hidden = false;
  p.querySelector("#set-close").onclick = () => (p.hidden = true);
  p.querySelector("#set-reset").onclick = () => { reset(); openPanel(); };
  const restore = p.querySelector("#set-restore");
  if (restore) restore.onclick = () => { S.contrast = "normal"; S.style = "immersive"; S.motion = "full"; save(); apply(); listeners.forEach((f) => f(S)); openPanel(); };
  p.querySelectorAll("[data-key] [data-v]").forEach((b) => (b.onclick = () => { set(b.parentElement.dataset.key, b.dataset.v); openPanel(); }));
  p.querySelector("button")?.focus();
}
export function toggleMode() { set("mode", isLight() ? "dark" : "light"); }

/* ---------------- hover notes ---------------- */
let tipEl, tipTimer;
function showTip(target) {
  if (S.notes === "off") return;
  const text = target.dataset.tip; if (!text) return;
  tipEl = tipEl || Object.assign(document.createElement("div"), { id: "tip", role: "tooltip" });
  if (!tipEl.isConnected) document.body.appendChild(tipEl);
  tipEl.textContent = text; tipEl.classList.add("show");
  const r = target.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 10;
  if (y < 8) y = r.bottom + 10;
  tipEl.style.left = Math.max(8, Math.min(innerWidth - tw - 8, x)) + "px"; tipEl.style.top = y + "px";
}
const hideTip = () => { clearTimeout(tipTimer); tipEl?.classList.remove("show"); };
function initTips() {
  const find = (e) => {
    const t = e.target.closest?.("[data-tip], [title]"); if (!t) return null;
    if (!t.dataset.tip && t.title && !(t instanceof SVGElement)) { t.dataset.tip = t.title; t.setAttribute("aria-label", t.getAttribute("aria-label") || t.title); t.removeAttribute("title"); }
    return t.dataset.tip ? t : null;
  };
  document.addEventListener("pointerover", (e) => { const t = find(e); if (!t) return; clearTimeout(tipTimer); tipTimer = setTimeout(() => showTip(t), 350); });
  document.addEventListener("pointerout", (e) => { if (find(e)) hideTip(); });
  document.addEventListener("focusin", (e) => { const t = find(e); if (t) showTip(t); });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("scroll", hideTip, { passive: true, capture: true });
  document.addEventListener("keydown", (e) => e.key === "Escape" && hideTip());
}

export function initTheme() {
  load(); loadFonts(); apply(); initTips();
  matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", apply);
  document.addEventListener("click", (e) => {
    if (e.target.closest("#btn-settings")) openPanel();
    else if (e.target.closest("#btn-mode")) toggleMode();
    else { const p = document.getElementById("settings-panel"); if (p && !p.hidden && !e.target.closest("#settings-panel")) p.hidden = true; }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { const p = document.getElementById("settings-panel"); if (p) p.hidden = true; } });
}
