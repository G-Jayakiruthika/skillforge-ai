/* fx.js - small motion + feedback toolkit (no dependencies). */
export const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const touch = matchMedia("(pointer: coarse)").matches;
const GLYPHS = "!<>-_\\/[]{}—=+*^?#01ABCDEF▲◆●";

/* Scrambles text into place, like a decrypting signal. */
export function scramble(el, finalText = el.dataset.final || el.textContent, dur = 900) {
  el.dataset.final = finalText;
  if (reduced) { el.textContent = finalText; return; }
  const start = performance.now();
  (function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    el.textContent = finalText.split("").map((c, i) => (c === " " ? " " : i / finalText.length < p ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join("");
    if (p < 1) requestAnimationFrame(tick);
  })(start);
}

/* Reveal-on-scroll + scramble + counters, via one IntersectionObserver. */
export function observeReveals(root = document) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target; io.unobserve(el);
      el.classList.add("revealed");
      if (el.hasAttribute("data-scramble")) scramble(el);
      el.querySelectorAll?.("[data-scramble]").forEach((s) => scramble(s));
      if (el.hasAttribute("data-count")) countUp(el, +el.dataset.count);
      el.querySelectorAll?.("[data-count]").forEach((c) => countUp(c, +c.dataset.count));
    }
  }, { threshold: .18 });
  root.querySelectorAll(".reveal, [data-scramble], [data-count]").forEach((el, i) => {
    if (el.classList.contains("reveal")) el.style.transitionDelay = `${(i % 4) * 80}ms`;
    io.observe(el);
  });
}

export function countUp(el, to, dur = 1200, suffix = "") {
  if (reduced) { el.textContent = to + suffix; return; }
  const from = 0, start = performance.now();
  (function tick(now) {
    const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * e) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  })(start);
}

/* Typewriter for mentor messages. */
export function typewrite(el, text, speed = 14, onDone) {
  if (el._tw) cancelAnimationFrame(el._tw);
  if (reduced) { el.textContent = text; onDone?.(); return; }
  let i = 0, last = 0; el.textContent = "";
  const caret = document.createElement("span"); caret.className = "caret";
  const txt = document.createTextNode(""); el.append(txt, caret);
  (function tick(t) {
    if (t - last > speed) { i = Math.min(text.length, i + 2); txt.data = text.slice(0, i); last = t; }
    if (i < text.length) el._tw = requestAnimationFrame(tick); else { caret.remove(); onDone?.(); }
  })(0);
}

/* 3D tilt for cards and magnetic pull for buttons (delegated, works for new elements too). */
export function interactions() {
  if (touch) return;
  document.addEventListener("pointermove", (e) => {
    const tilt = e.target.closest?.(".tilt");
    if (tilt) {
      const r = tilt.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      tilt.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateZ(0)`;
    }
    const mag = e.target.closest?.(".magnetic");
    if (mag) {
      const r = mag.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      mag.style.transform = `translate(${x * .25}px, ${y * .35}px)`;
    }
  });
  document.addEventListener("pointerout", (e) => {
    const tilt = e.target.closest?.(".tilt"); if (tilt && !tilt.contains(e.relatedTarget)) tilt.style.transform = "";
    const mag = e.target.closest?.(".magnetic"); if (mag && !mag.contains(e.relatedTarget)) mag.style.transform = "";
  });
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest?.(".btn, .chip, .asteroid, .mode-card"); if (!b) return;
    const r = b.getBoundingClientRect(), s = document.createElement("span"), d = Math.max(r.width, r.height);
    s.className = "ripple"; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(s); setTimeout(() => s.remove(), 700);
  });
}

/* Confetti burst. */
let cc = null, cx = null, parts = [], raf = 0;
export function confetti(x = innerWidth / 2, y = innerHeight / 3, n = 140) {
  if (reduced) return;
  cc = cc || document.getElementById("confetti"); if (!cc) return; cx = cx || cc.getContext("2d");
  cc.width = innerWidth; cc.height = innerHeight;
  const cols = ["#3cf0ff", "#ff3ea5", "#ffb547", "#9dff6a", "#8b5cff", "#ffffff"];
  for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - .5) * 16, vy: Math.random() * -14 - 4, r: Math.random() * 6 + 3, c: cols[i % cols.length], a: Math.random() * 6, va: (Math.random() - .5) * .4, life: 1 });
  if (!raf) raf = requestAnimationFrame(stepConfetti);
}
function stepConfetti() {
  cx.clearRect(0, 0, cc.width, cc.height);
  parts = parts.filter((p) => p.life > 0);
  for (const p of parts) {
    p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; p.life -= .008;
    cx.save(); cx.globalAlpha = Math.max(0, p.life); cx.translate(p.x, p.y); cx.rotate(p.a); cx.fillStyle = p.c; cx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); cx.restore();
  }
  raf = parts.length ? requestAnimationFrame(stepConfetti) : 0;
}

/* Tiny WebAudio sound kit (off by default; toggle in the top bar). */
let actx = null, soundOn = false;
try { soundOn = localStorage.getItem("sf-sound") === "1"; } catch (_) {}
export const sound = {
  get on() { return soundOn; },
  toggle() { soundOn = !soundOn; try { localStorage.setItem("sf-sound", soundOn ? "1" : "0"); } catch (_) {} if (soundOn) this.play("click"); return soundOn; },
  play(kind) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const seq = { click: [[880, .04]], hover: [[1320, .02]], good: [[660, .08], [880, .08], [1320, .14]], bad: [[220, .18], [160, .22]], level: [[523, .1], [659, .1], [784, .1], [1047, .25]], tick: [[1500, .02]], whoosh: [[200, .3]] }[kind] || [[600, .05]];
      let t = actx.currentTime;
      for (const [f, d] of seq) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = kind === "bad" ? "sawtooth" : kind === "whoosh" ? "triangle" : "sine";
        o.frequency.setValueAtTime(f, t); if (kind === "whoosh") o.frequency.exponentialRampToValueAtTime(1200, t + d);
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.12, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d + .02); t += d * .9;
      }
    } catch (_) {}
  },
};

/* Animate a number property over time. */
export function tween(dur, fn, done) {
  if (reduced) { fn(1); done?.(); return; }
  const s = performance.now();
  (function tick(n) { const p = Math.min(1, (n - s) / dur); fn(1 - Math.pow(1 - p, 3)); if (p < 1) requestAnimationFrame(tick); else done?.(); })(s);
}
