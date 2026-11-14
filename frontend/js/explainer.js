/*
 * explainer.js - a 60-second animated "video" rendered live on a canvas.
 * It tells the sample-scenario story chapter by chapter, with captions,
 * a seekable timeline, fullscreen, and "save as video" (MediaRecorder -> .webm).
 */
const W = 1280, H = 720, DUR = 60;
const C = { bg: "#05060f", ink: "#eef1ff", muted: "#8b93b8", cyan: "#3cf0ff", pink: "#ff3ea5", amber: "#ffb547", lime: "#9dff6a", violet: "#8b5cff", red: "#ff4d5e", line: "rgba(160,170,255,.18)" };
const AGENTS = ["Supervisor", "Profiler", "Skill Analyst", "Career Matcher", "Path Architect", "Resource Curator", "Assessor", "Mentor"];
const CHAPTERS = [
  { t: 0, name: "Meet Jane", cap: "Jane knows Python, SQL and basic HTML. Her goal: Full Stack Developer." },
  { t: 7, name: "Profile", cap: "The Profiler maps her raw skills to a standard taxonomy and scores each one." },
  { t: 15, name: "Gap", cap: "Skill Analyst + Career Matcher compare her with the role: 20% ready, JavaScript, React and Node.js missing." },
  { t: 23, name: "Roadmap", cap: "The Path Architect orders skills by prerequisites — HTML/CSS first, then JavaScript, then React and Node." },
  { t: 32, name: "Resources", cap: "The Resource Curator attaches a course, practice, a video and a micro-project to every milestone." },
  { t: 38, name: "Struggle", cap: "She scores 45% on HTML/CSS. The Assessor raises an alert — a remedial lab is injected, later steps pause." },
  { t: 46, name: "Comeback", cap: "After the lab she passes. Skill verified, JavaScript unlocks, readiness goes up." },
  { t: 53, name: "Pivot", cap: "She switches to Data Engineer — mastered skills are kept and a new path is built instantly." },
];
const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3));
const seg = (t, a, b) => ease((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;

export function createExplainer({ canvas, caption, fill, time, playBtn, bigBtn, track, chaptersEl, recBtn, fsBtn, player, onPlay }) {
  const ctx = canvas.getContext("2d");
  let t = 0, playing = false, last = 0, recorder = null;
  chaptersEl.innerHTML = CHAPTERS.slice(1).map((c) => `<span style="left:${(c.t / DUR) * 100}%" title="${c.name.replace(/[&<>"]/g, "")}"></span>`).join("");

  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function text(s, x, y, size = 20, color = C.ink, weight = 500, align = "left", font = "Space Grotesk") { ctx.font = `${weight} ${size}px "${font}", system-ui, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y); }
  function glow(color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }

  function drawBg(t) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * .78, H * .3, 20, W * .78, H * .3, 520); g.addColorStop(0, "rgba(139,92,255,.28)"); g.addColorStop(1, "transparent"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createRadialGradient(W * .1, H * .95, 20, W * .1, H * .95, 500); g2.addColorStop(0, "rgba(60,240,255,.18)"); g2.addColorStop(1, "transparent"); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) { const sx = (i * 137.5 + t * 6 * (i % 3 + 1)) % W, sy = (i * 71.3) % H; ctx.fillStyle = `rgba(255,255,255,${.15 + (i % 5) / 10})`; ctx.fillRect(sx, sy, 1.6, 1.6); }
  }

  // agent bus strip; which agent is "speaking" depends on the chapter
  function activeAgents(t) {
    if (t < 7) return [0]; if (t < 15) return [0, 1]; if (t < 23) return [2, 3]; if (t < 32) return [4]; if (t < 38) return [5]; if (t < 46) return [6, 1, 4, 7]; if (t < 53) return [6, 7]; return [0, 3, 4];
  }
  function drawBus(t) {
    const act = activeAgents(t), y = 46, x0 = 120, step = (W - 240) / 7;
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + step * 7, y); ctx.stroke();
    // packet
    const ph = (t * .9) % 1, pa = act[0], pb = act[act.length - 1] === pa ? Math.min(7, pa + 1) : act[act.length - 1];
    const px = lerp(x0 + step * pa, x0 + step * pb, ph);
    glow(C.pink, 18); ctx.fillStyle = C.pink; ctx.beginPath(); ctx.arc(px, y, 5, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    AGENTS.forEach((a, i) => {
      const on = act.includes(i), cx = x0 + step * i;
      if (on) { glow(C.cyan, 25); }
      ctx.fillStyle = on ? C.cyan : "#141a3a"; ctx.beginPath(); ctx.arc(cx, y, on ? 11 : 8, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      text(a, cx, y + 30, 13, on ? C.ink : C.muted, on ? 600 : 400, "center");
    });
    text("AGENT BUS", 24, y + 5, 12, C.muted, 600, "left", "JetBrains Mono");
  }

  function chip(label, x, y, color = C.cyan, alpha = 1, w) {
    ctx.globalAlpha = alpha; ctx.font = `600 18px "Space Grotesk", sans-serif`; const tw = w || ctx.measureText(label).width + 32;
    rr(x, y, tw, 40, 20); ctx.fillStyle = "rgba(20,26,58,.9)"; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    text(label, x + tw / 2, y + 26, 18, C.ink, 600, "center"); ctx.globalAlpha = 1; return tw;
  }
  function bar(x, y, w, v, req, color, label) {
    rr(x, y, w, 12, 6); ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fill();
    rr(x, y, Math.max(1, w * v / 100), 12, 6); ctx.fillStyle = color; ctx.fill();
    if (req) { ctx.fillStyle = C.amber; ctx.fillRect(x + w * req / 100 - 1, y - 4, 2, 20); }
    if (label) { text(label, x - 14, y + 11, 16, C.ink, 500, "right"); text(String(Math.round(v)), x + w + 14, y + 12, 15, C.muted, 600, "left", "JetBrains Mono"); }
  }

  const DAG = [ // skill, col, row
    ["HTML/CSS", 0, 0], ["SQL", 0, 1], ["Git", 0, 2], ["JavaScript", 1, 0], ["REST APIs", 1, 2], ["React", 2, 0], ["Node.js", 2, 1],
  ];
  const DAG_EDGES = [[0, 3], [3, 5], [3, 6], [6, 4]];
  function nodePos(c, r, ox = 250, oy = 210) { return [ox + c * 290, oy + r * 120]; }
  function drawDag(t, appear, statusFn, ox, oy, alpha = 1) {
    ctx.globalAlpha = alpha;
    DAG_EDGES.forEach(([a, b], i) => {
      const p = seg(appear, .15 + i * .1, .45 + i * .1); if (p <= 0) return;
      const [x1, y1] = nodePos(DAG[a][1], DAG[a][2], ox, oy), [x2, y2] = nodePos(DAG[b][1], DAG[b][2], ox, oy);
      ctx.strokeStyle = "rgba(139,92,255,.7)"; ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.lineDashOffset = -t * 30;
      ctx.beginPath(); ctx.moveTo(x1 + 200, y1 + 30); ctx.bezierCurveTo(x1 + 240, y1 + 30, lerp(x1 + 200, x2, p) - 40, lerp(y1, y2, p) + 30, lerp(x1 + 200, x2, p), lerp(y1 + 30, y2 + 30, p)); ctx.stroke(); ctx.setLineDash([]);
    });
    DAG.forEach(([s, c, r], i) => {
      const p = seg(appear, i * .08, i * .08 + .35); if (p <= 0) return;
      const [x, y] = nodePos(c, r, ox, oy), st = statusFn(s), col = { mastered: C.lime, active: C.cyan, locked: "#3a4170", remedial: C.red, available: C.violet, paused: C.amber }[st];
      ctx.globalAlpha = alpha * p; const yy = y + (1 - p) * 30;
      if (st === "active" || st === "remedial") glow(col, 24 + Math.sin(t * 6) * 8);
      rr(x, yy, 200, 60, 16); ctx.fillStyle = st === "remedial" ? "rgba(255,77,94,.18)" : "rgba(22,27,58,.95)"; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; if (st === "locked") ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
      text(s, x + 16, yy + 27, 18, C.ink, 600); text(st.toUpperCase(), x + 16, yy + 48, 11, col, 600, "left", "JetBrains Mono");
    });
    ctx.globalAlpha = 1;
  }

  function draw(t) {
    drawBg(t); drawBus(t);
    // chapter title
    const ch = [...CHAPTERS].reverse().find((c) => t >= c.t) || CHAPTERS[0];
    const idx = CHAPTERS.indexOf(ch);
    text(`0${idx + 1} / 0${CHAPTERS.length}  ·  ${ch.name.toUpperCase()}`, 60, 140, 14, C.pink, 600, "left", "JetBrains Mono");

    if (t < 7) { // Meet Jane
      const p = seg(t, 0, 1.2);
      ctx.globalAlpha = p; glow(C.violet, 40);
      ctx.fillStyle = "rgba(22,27,58,.95)"; rr(380, 200 + (1 - p) * 30, 520, 300, 28); ctx.fill(); ctx.shadowBlur = 0;
      const gr = ctx.createLinearGradient(420, 240, 500, 320); gr.addColorStop(0, C.cyan); gr.addColorStop(1, C.pink);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(470, 290, 46, 0, 7); ctx.fill();
      text("J", 470, 306, 44, C.bg, 700, "center");
      text("Jane Doe", 540, 280, 34, C.ink, 700); text("MCA student · 8 h/week", 540, 312, 18, C.muted);
      ctx.globalAlpha = 1;
      ["Python", "SQL", "basic HTML"].forEach((s, i) => { const q = seg(t, 1.5 + i * .5, 2.3 + i * .5); if (q > 0) chip(s, 420 + i * 150, 370 + (1 - q) * 20, C.cyan, q); });
      const g = seg(t, 3.6, 4.6); if (g > 0) { ctx.globalAlpha = g; text("GOAL →", 420, 470, 14, C.amber, 600, "left", "JetBrains Mono"); text("Full Stack Developer", 500, 472, 24, C.amber, 700); ctx.globalAlpha = 1; }
    } else if (t < 15) { // Profile
      const lt = t - 7;
      const rows = [["basic HTML", "HTML/CSS", 30], ["Python", "Python", 63], ["SQL", "SQL", 73]];
      rows.forEach(([raw, canon, v], i) => {
        const p = seg(lt, i * .8, i * .8 + 1.2), y = 230 + i * 120;
        chip(raw, lerp(120, 200, p), y, C.muted, 1 - p * .5);
        ctx.strokeStyle = C.cyan; ctx.globalAlpha = p; ctx.beginPath(); ctx.moveTo(370, y + 20); ctx.lineTo(lerp(370, 520, p), y + 20); ctx.stroke(); ctx.globalAlpha = 1;
        if (p > .6) { chip(canon, 540, y, C.cyan, (p - .6) / .4, 160); bar(800, y + 14, 300, v * seg(lt, i * .8 + 1, i * .8 + 2.6), 0, i === 0 ? C.amber : C.cyan); text(i === 0 ? "self-rated beginner" : i === 1 ? "+ project evidence" : "+ certificate + project", 800, y + 52, 14, C.muted); }
      });
    } else if (t < 23) { // Gap radar
      const lt = t - 15, cx = 420, cy = 400, R = 190, sk = ["HTML/CSS", "JavaScript", "React", "Node.js", "SQL", "REST APIs", "Git"];
      const req = [65, 70, 65, 65, 60, 60, 55], cur = [30, 0, 0, 0, 73, 0, 0], n = sk.length;
      const pt = (i, v) => [cx + Math.cos(-Math.PI / 2 + i * Math.PI * 2 / n) * R * v / 100, cy + Math.sin(-Math.PI / 2 + i * Math.PI * 2 / n) * R * v / 100];
      [25, 50, 75, 100].forEach((v) => { ctx.strokeStyle = C.line; ctx.beginPath(); sk.forEach((_, i) => { const [x, y] = pt(i, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke(); });
      sk.forEach((s, i) => { const [x, y] = pt(i, 122); text(s, x, y + 6, 15, cur[i] ? C.ink : C.red, 600, "center"); });
      const pr = seg(lt, .3, 2), pc = seg(lt, 1.5, 3.5);
      ctx.beginPath(); sk.forEach((_, i) => { const [x, y] = pt(i, req[i] * pr); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fillStyle = "rgba(255,181,71,.12)"; ctx.fill(); ctx.strokeStyle = C.amber; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); sk.forEach((_, i) => { const [x, y] = pt(i, Math.max(4, cur[i]) * pc); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fillStyle = "rgba(60,240,255,.25)"; ctx.fill(); ctx.strokeStyle = C.cyan; ctx.lineWidth = 2.5; ctx.stroke(); ctx.lineWidth = 1;
      const r = Math.round(20 * seg(lt, 2.5, 5));
      text("READINESS", 800, 300, 14, C.muted, 600, "left", "JetBrains Mono"); text(r + "%", 800, 380, 96, C.ink, 700);
      const m = seg(lt, 4.5, 5.5); if (m > 0) { ctx.globalAlpha = m; text("MISSING", 800, 440, 14, C.muted, 600, "left", "JetBrains Mono"); ["JavaScript", "React", "Node.js"].forEach((s, i) => chip(s, 800 + i * 140, 456, C.red, m)); ctx.globalAlpha = 1; }
    } else if (t < 32) { // Roadmap
      drawDag(t, seg(t - 23, 0, 4), (s) => (["SQL"].includes(s) ? "mastered" : s === "HTML/CSS" ? "active" : ["Git", "REST APIs"].includes(s) ? "available" : "locked"), 150, 220);
      const p = seg(t - 23, 4.5, 5.5); if (p > 0) { ctx.globalAlpha = p; text("~10 weeks at 8 h/week  ·  weekly plan generated", 150, 640, 20, C.amber, 600); ctx.globalAlpha = 1; }
    } else if (t < 38) { // Resources
      const lt = t - 32;
      drawDag(t, 1, (s) => (s === "SQL" ? "mastered" : s === "HTML/CSS" ? "active" : "locked"), 150, 220, .35);
      const res = [["COURSE", "MDN: Learn web development", C.cyan], ["PRACTICE", "Flexbox Froggy · Grid Garden", C.lime], ["VIDEO", "HTML & CSS crash course", C.pink], ["PROJECT", "Responsive profile page with CSS Grid", C.amber]];
      res.forEach(([k, v, col], i) => {
        const p = seg(lt, .3 + i * .5, 1.1 + i * .5); if (p <= 0) return;
        ctx.globalAlpha = p; const x = 640 + (1 - p) * 80, y = 200 + i * 92;
        rr(x, y, 520, 74, 16); ctx.fillStyle = "rgba(22,27,58,.95)"; ctx.fill(); ctx.strokeStyle = col; ctx.stroke();
        text(k, x + 22, y + 30, 12, col, 600, "left", "JetBrains Mono"); text(v, x + 22, y + 56, 20, C.ink, 600);
        ctx.strokeStyle = col; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(350, 250); ctx.lineTo(x, y + 37); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      });
    } else if (t < 46) { // Struggle
      const lt = t - 38, shake = lt > 1.4 && lt < 2.2 ? Math.sin(lt * 80) * 8 : 0;
      ctx.save(); ctx.translate(shake, 0);
      const sc = Math.round(45 * seg(lt, .2, 1.4));
      text("HTML/CSS CHECK", 150, 220, 14, C.muted, 600, "left", "JetBrains Mono");
      glow(C.red, lt > 1.4 ? 30 : 0); text(sc + "%", 150, 320, 110, lt > 1.4 ? C.red : C.ink, 700); ctx.shadowBlur = 0;
      if (lt > 1.4) { text("BELOW 60% PASS MARK", 150, 360, 16, C.red, 600, "left", "JetBrains Mono"); text("missed: layout, semantics", 150, 392, 18, C.muted); }
      ctx.restore();
      const p = seg(lt, 2.4, 3.6);
      if (p > 0) {
        drawDag(t, 1, (s) => (s === "SQL" ? "mastered" : s === "HTML/CSS" ? "paused" : "locked"), 520, 260, .9);
        ctx.globalAlpha = p; glow(C.red, 30 + Math.sin(t * 8) * 10); rr(520, 150 + (1 - p) * -40, 200, 60, 16); ctx.fillStyle = "rgba(255,77,94,.22)"; ctx.fill(); ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0;
        text("Remedial lab", 536, 177, 18, C.ink, 600); text("INJECTED · 3h", 536, 198, 11, C.red, 600, "left", "JetBrains Mono"); ctx.globalAlpha = 1;
      }
    } else if (t < 53) { // Comeback
      const lt = t - 46, sc = Math.round(100 * seg(lt, .2, 1.4));
      glow(C.lime, 30); text(sc + "%", 150, 320, 110, C.lime, 700); ctx.shadowBlur = 0;
      text("PASSED · HTML/CSS VERIFIED", 150, 360, 16, C.lime, 600, "left", "JetBrains Mono");
      drawDag(t, 1, (s) => (["SQL", "HTML/CSS"].includes(s) ? "mastered" : s === "JavaScript" && lt > 1.6 ? "active" : ["Git", "REST APIs"].includes(s) ? "available" : "locked"), 520, 220, .95);
      const r = Math.round(lerp(20, 28, seg(lt, 2, 3.5))); text(`readiness ${r}%  ↑`, 150, 420, 24, C.ink, 600);
      for (let i = 0; i < 40; i++) { const a = i * 2.4, d = seg(lt, .3, 2.5) * (120 + (i % 7) * 30); ctx.fillStyle = [C.cyan, C.pink, C.amber, C.lime][i % 4]; ctx.globalAlpha = 1 - seg(lt, 1.5, 3); ctx.fillRect(260 + Math.cos(a) * d, 280 + Math.sin(a) * d, 6, 6); } ctx.globalAlpha = 1;
    } else { // Pivot + end card
      const lt = t - 53;
      if (lt < 4.2) {
        chip("Full Stack Developer", 150, 200, C.muted, 1 - seg(lt, .5, 1.2)); const p = seg(lt, .8, 1.6);
        chip("Data Engineer", 150, 200, C.amber, p);
        const sk = [["SQL", "kept ✓", C.lime], ["HTML/CSS", "kept ✓", C.lime], ["Python", "next", C.cyan], ["Data Modeling", "locked", C.muted], ["Apache Spark", "locked", C.muted], ["Airflow", "locked", C.muted]];
        sk.forEach(([s, st, col], i) => { const q = seg(lt, 1.2 + i * .3, 1.8 + i * .3); if (q > 0) { ctx.globalAlpha = q; rr(150 + (i % 3) * 330, 290 + Math.floor(i / 3) * 110 + (1 - q) * 20, 300, 80, 18); ctx.fillStyle = "rgba(22,27,58,.95)"; ctx.fill(); ctx.strokeStyle = col; ctx.stroke(); text(s, 172 + (i % 3) * 330, 330 + Math.floor(i / 3) * 110, 20, C.ink, 600); text(st.toUpperCase(), 172 + (i % 3) * 330, 355 + Math.floor(i / 3) * 110, 12, col, 600, "left", "JetBrains Mono"); ctx.globalAlpha = 1; } });
      } else {
        const p = seg(lt, 4.2, 5.4);
        ctx.globalAlpha = p; glow(C.cyan, 40);
        const gr = ctx.createLinearGradient(380, 0, 900, 0); gr.addColorStop(0, C.cyan); gr.addColorStop(.5, C.violet); gr.addColorStop(1, C.pink);
        ctx.font = `700 96px "Space Grotesk", sans-serif`; ctx.textAlign = "center"; ctx.fillStyle = gr; ctx.fillText("SkillForge AI", W / 2, 380); ctx.shadowBlur = 0;
        text("8 agents · your skills · your path", W / 2, 440, 24, C.muted, 500, "center"); ctx.globalAlpha = 1;
      }
    }
    // progress hairline
    ctx.fillStyle = C.line; ctx.fillRect(0, H - 3, W, 3); ctx.fillStyle = C.cyan; ctx.fillRect(0, H - 3, W * t / DUR, 3);
    caption.textContent = ch.cap;
    fill.style.width = `${(t / DUR) * 100}%`;
    time.textContent = `${fmt(t)} / ${fmt(DUR)}`;
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  function frame(now) {
    if (!playing) return;
    t += (now - last) / 1000; last = now;
    if (t >= DUR) { t = DUR; pause(); if (recorder) recorder.stop(); }
    draw(t); if (playing) requestAnimationFrame(frame);
  }
  function play() { if (t >= DUR) t = 0; playing = true; last = performance.now(); player.classList.add("playing"); playBtn.textContent = "❚❚"; onPlay?.(); requestAnimationFrame(frame); }
  function pause() { playing = false; player.classList.remove("playing"); playBtn.textContent = "▶"; }
  const toggle = () => (playing ? pause() : play());
  playBtn.onclick = toggle; bigBtn.onclick = play; canvas.onclick = toggle;
  let dragging = false;
  const seek = (e) => { const r = track.getBoundingClientRect(); t = Math.max(0, Math.min(DUR, ((e.clientX - r.left) / r.width) * DUR)); draw(t); };
  track.onpointerdown = (e) => { dragging = true; track.setPointerCapture(e.pointerId); seek(e); };
  track.onpointermove = (e) => dragging && seek(e);
  track.onpointerup = () => (dragging = false);
  fsBtn.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : player.requestFullscreen?.());
  recBtn.onclick = () => {
    if (!canvas.captureStream || !window.MediaRecorder) { alert("Your browser can't record video. Try Chrome or Edge."); return; }
    const chunks = [], stream = canvas.captureStream(30);
    recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(chunks, { type: "video/webm" })); a.download = "skillforge-ai-explainer.webm"; a.click(); recorder = null; recBtn.textContent = "⤓"; };
    recBtn.textContent = "●"; t = 0; recorder.start(); play();
  };
  document.fonts?.ready.then(() => draw(t)); draw(0);
  return { play, pause, get playing() { return playing; } };
}
