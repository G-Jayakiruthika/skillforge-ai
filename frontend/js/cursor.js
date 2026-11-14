/*
 * cursor.js - five cursor styles, chosen from the ✦ menu in the top bar.
 *   orb    : glowing dot + lagging ring that grows and shows a label on hover
 *   comet  : particle tail that streams behind the pointer
 *   neon   : smooth glowing ribbon following the pointer
 *   spark  : dot + bursts of sparks when moving fast or clicking
 *   system : the normal operating-system cursor
 * Touch devices always use the system cursor.
 */
import { touch, reduced } from "./fx.js";

let dot, ring, label, cv, ctx;
let mode = "orb", x = -100, y = -100, rx = -100, ry = -100, px = 0, py = 0, parts = [], trail = [], visible = false;
const HOVER = "a, button, select, input, textarea, label, .node, .tilt, .planet, .asteroid, [data-cursor]";

export function initCursor() {
  dot = document.getElementById("cursor-dot"); ring = document.getElementById("cursor-ring"); label = document.getElementById("cursor-label");
  cv = document.getElementById("cursor-canvas"); ctx = cv.getContext("2d");
  try { mode = localStorage.getItem("sf-cursor") || "orb"; } catch (_) {}
  if (touch) mode = "system";
  apply();
  const resize = () => { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); };
  addEventListener("resize", resize); resize();
  addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    x = e.clientX; y = e.clientY; if (!visible) { rx = x; ry = y; visible = true; document.body.classList.add("cursor-on"); }
    const sp = Math.hypot(x - px, y - py);
    if (mode === "comet") for (let i = 0; i < Math.min(4, 1 + sp / 8); i++) parts.push({ x, y, vx: (Math.random() - .5) * 1.2, vy: (Math.random() - .5) * 1.2, life: 1, r: 2 + Math.random() * 3, h: 180 + Math.random() * 150 });
    if (mode === "spark" && sp > 22) burst(x, y, 4);
    px = x; py = y;
  });
  addEventListener("pointerdown", () => { ring.classList.add("down"); if (mode === "spark" || mode === "comet") burst(x, y, 18); });
  addEventListener("pointerup", () => ring.classList.remove("down"));
  document.addEventListener("pointerleave", () => { visible = false; document.body.classList.remove("cursor-on"); });
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest?.(HOVER);
    ring.classList.toggle("hover", !!t && mode === "orb");
    label.textContent = t?.dataset?.cursor || "";
  });
  requestAnimationFrame(loop);
}

function burst(bx, by, n) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4; parts.push({ x: bx, y: by, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, r: 1.5 + Math.random() * 2, h: Math.random() < .5 ? 186 : 326 }); } }

export function setCursor(m) { mode = touch ? "system" : m; try { localStorage.setItem("sf-cursor", m); } catch (_) {} apply(); }
export function getCursor() { return mode; }

function apply() {
  if (!dot) return;
  const custom = mode !== "system";
  document.body.classList.toggle("custom-cursor", custom);
  document.body.classList.toggle("cursor-trail", mode === "comet" || mode === "neon");
  dot.style.display = custom ? "" : "none"; ring.style.display = custom ? "" : "none";
  parts = []; trail = [];
  document.querySelectorAll("#cursor-menu button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
}

function loop() {
  const k = reduced ? 1 : .18;
  rx += (x - rx) * k; ry += (y - ry) * k;
  dot.style.transform = `translate(${x}px, ${y}px)`;
  ring.style.transform = `translate(${rx}px, ${ry}px)`;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (mode === "neon") {
    trail.push({ x, y }); if (trail.length > 26) trail.shift();
    if (trail.length > 2) {
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath(); ctx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length - 1; i++) { const mx = (trail[i].x + trail[i + 1].x) / 2, my = (trail[i].y + trail[i + 1].y) / 2; ctx.quadraticCurveTo(trail[i].x, trail[i].y, mx, my); }
        const g = ctx.createLinearGradient(trail[0].x, trail[0].y, x, y); g.addColorStop(0, "rgba(255,62,165,0)"); g.addColorStop(1, pass ? "#ffffff" : "#3cf0ff");
        ctx.strokeStyle = g; ctx.lineWidth = pass ? 2 : 8; ctx.shadowColor = "#3cf0ff"; ctx.shadowBlur = pass ? 0 : 18; ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
  }
  if (parts.length) {
    for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vx *= .96; p.vy *= .96; p.life -= mode === "comet" ? .03 : .025; }
    parts = parts.filter((p) => p.life > 0);
    for (const p of parts) { ctx.fillStyle = `hsla(${p.h},100%,65%,${p.life})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, 7); ctx.fill(); }
  }
  requestAnimationFrame(loop);
}
