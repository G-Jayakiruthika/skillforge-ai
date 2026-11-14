/*
 * arena.js - Skill Arena: a game-style way to test skills.
 *  Mission mode : pick a skill planet, answer its questions with 3 lives and a timer.
 *                 The result is saved as a real assessment -> the agents re-plan.
 *  Blitz mode   : 60-second practice across all skills of your goal. Pure XP, nothing recorded.
 */
const TIME_PER_Q = 20;
const PLANET_COLORS = ["#3cf0ff", "#ff3ea5", "#ffb547", "#9dff6a", "#8b5cff", "#4dd5a6", "#ff7a59", "#5b8cff"];

export function renderArena(el, ctx) {
  const { learner: L, esc } = ctx;
  const nodes = (L.roadmap?.nodes || []).filter((n) => !n.is_remedial);
  const store = ctx.store(), stars = store.stars || {};
  let mode = el.dataset.mode || "mission";
  el.innerHTML = `
  ${ctx.noteHtml || ""}
  <div class="arena" id="arena-box"><div class="arena-stars"></div>
    <div class="mode-cards">
      <button class="mode-card ${mode === "mission" ? "on" : ""}" data-m="mission" data-cursor="Pick"><span class="badge brand">recorded</span><h3>🚀 Mission mode</h3><p>Choose a skill planet. 3 lives, ${TIME_PER_Q}s per question, combos for streaks. Your score becomes a real assessment and your roadmap adapts.</p></button>
      <button class="mode-card ${mode === "blitz" ? "on" : ""}" data-m="blitz" data-cursor="Pick"><span class="badge warn">practice</span><h3>⚡ Blitz mode</h3><p>60 seconds, questions from every skill of your goal. Pure practice for XP and a personal best (${store.best || 0}).</p></button>
    </div>
    <div id="arena-main"></div>
  </div>`;
  el.querySelectorAll(".mode-card").forEach((b) => (b.onclick = () => { el.dataset.mode = b.dataset.m; ctx.sound.play("click"); renderArena(el, ctx); }));
  const main = el.querySelector("#arena-main");
  if (mode === "blitz") return blitzIntro(main, ctx, nodes);
  main.innerHTML = `<div class="planets">${nodes.map((n, i) => {
    const locked = n.status === "locked", st = stars[n.skill] || 0;
    return `<button class="planet ${locked ? "locked" : ""} ${n.status === "mastered" ? "done" : ""}" style="--pc:${PLANET_COLORS[i % PLANET_COLORS.length]}" data-skill="${esc(n.skill)}" ${locked ? "disabled" : ""} data-cursor="${locked ? "Locked" : "Launch"}">
      <div class="ball"></div><h4>${esc(n.skill)}</h4><div class="stars">${"★".repeat(st)}${"☆".repeat(3 - st)}</div>
      <div class="small muted">${locked ? "🔒 finish prerequisites" : n.status === "mastered" ? "mastered — replay for stars" : n.status === "remedial" || n.status === "paused" ? "⚠ remedial — retry!" : "ready for launch"}</div></button>`;
  }).join("")}</div>`;
  main.querySelectorAll(".planet:not(.locked)").forEach((p) => (p.onclick = () => startMission(main, ctx, p.dataset.skill)));
}

/* ------------------------------ mission ------------------------------ */
async function startMission(main, ctx, skill) {
  const { esc, sound } = ctx;
  const quiz = await ctx.api(`api/quiz?skill=${encodeURIComponent(skill)}`);
  const qs = quiz.questions, answers = new Array(qs.length).fill(null);
  let i = 0, lives = 3, score = 0, combo = 0, timer = null, left = TIME_PER_Q, locked = false;
  sound.play("whoosh"); ctx.scene?.warp();

  function hud() {
    return `<div class="hud"><span class="lives">${[0, 1, 2].map((k) => `<span class="${k < lives ? "" : "lost"}">❤️</span>`).join("")}</span>
      <span>MISSION · ${esc(skill)}</span><span class="combo">${combo > 1 ? `COMBO ×${combo}` : ""}</span><span class="score">${score} pts</span>
      <div class="timer"><svg width="64" height="64"><circle cx="32" cy="32" r="27" stroke="rgba(255,255,255,.1)" stroke-width="6" fill="none"/><circle id="tring" cx="32" cy="32" r="27" stroke="#3cf0ff" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="170" stroke-dashoffset="0"/></svg><b id="tnum">${left}</b></div></div>`;
  }
  function show() {
    left = TIME_PER_Q; locked = false;
    const q = qs[i];
    main.innerHTML = hud() + `<div class="transmission"><div class="qno">INCOMING TRANSMISSION ${i + 1}/${qs.length}</div><h2 data-scramble>${esc(q.q)}</h2></div>
      <div class="asteroids">${q.options.map((o, j) => `<button class="asteroid" data-j="${j}" data-cursor="Fire"><span class="key">${j + 1}</span>${esc(o)}</button>`).join("")}</div>
      <p class="small muted" style="text-align:center;margin-top:16px;position:relative">Click an asteroid or press 1–4</p>`;
    main.querySelectorAll(".asteroid").forEach((b) => (b.onclick = (e) => pick(+b.dataset.j, e)));
    clearInterval(timer);
    timer = setInterval(() => {
      left -= 1; const t = main.querySelector("#tnum"), r = main.querySelector("#tring");
      if (t) t.textContent = left;
      if (r) { r.style.strokeDashoffset = String(170 * (1 - left / TIME_PER_Q)); r.style.stroke = left <= 5 ? "#ff4d5e" : "#3cf0ff"; }
      if (left <= 5 && left > 0) sound.play("tick");
      if (left <= 0) pick(null);
    }, 1000);
  }
  async function pick(j, ev) {
    if (locked) return; locked = true; clearInterval(timer);
    answers[i] = j;
    const res = await ctx.api("api/quiz/check", { skill, index: i, answer: j });
    const btns = main.querySelectorAll(".asteroid");
    btns[res.correct_index]?.classList.add("right");
    if (res.correct) {
      combo += 1; const gain = 100 * combo + left * 5; score += gain; sound.play("good");
      floatText(main, `+${gain}`, ev, "#9dff6a"); burst(btns[j]);
    } else {
      combo = 0; lives -= 1; sound.play("bad");
      if (j != null) btns[j]?.classList.add("wrong");
      const box = document.getElementById("arena-box"); box.classList.remove("hit"); void box.offsetWidth; box.classList.add("hit");
      floatText(main, j == null ? "TIME!" : "−❤", ev, "#ff4d5e");
    }
    setTimeout(() => { i += 1; if (i < qs.length && lives > 0) show(); else finish(); }, 1100);
  }
  function key(e) { if (main.querySelector(".asteroid") && /^[1-4]$/.test(e.key)) pick(+e.key - 1); }
  document.addEventListener("keydown", key);

  async function finish() {
    clearInterval(timer); document.removeEventListener("keydown", key);
    main.innerHTML = `<div class="end-screen"><div class="transmission"><div class="qno">MISSION COMPLETE — SENDING RESULTS TO THE ASSESSOR AGENT…</div></div><div class="typing"><i></i><i></i><i></i></div></div>`;
    const r = await ctx.runAssess({ skill, mode: "quiz", answers }, { quiet: true });
    const la = r.learner.last_assessment, st = la.score >= 100 ? 3 : la.score >= 60 ? 2 : la.score > 0 ? 1 : 0;
    const store = ctx.store(); store.stars = store.stars || {}; store.stars[skill] = Math.max(store.stars[skill] || 0, st);
    store.xp = (store.xp || 0) + Math.round(score / 20); ctx.saveStore(store);
    main.innerHTML = `<div class="end-screen">
      <div class="big-stars">${[0, 1, 2].map((k) => `<span class="${k < st ? "" : "off"}" style="animation-delay:${k * 200}ms">★</span>`).join("")}</div>
      <h2 style="font-size:40px;margin:8px 0">${la.passed ? "Mission accomplished!" : "Mission failed — regroup!"}</h2>
      <p><b>${la.score.toFixed(0)}%</b> recorded as an assessment · ${score} pts · +${Math.round(score / 20)} arena XP</p>
      ${la.passed ? "" : `<p>Missed concepts: ${la.missed_concepts.map((c) => `<span class="badge bad">${esc(c.replace(/_/g, " "))}</span>`).join("")}</p>`}
      <p class="muted" style="max-width:640px;margin:10px auto">${esc(r.learner.mentor.message)}</p>
      <div class="row" style="justify-content:center;margin-top:16px"><button class="btn primary" id="again" data-cursor="Again">${la.passed ? "Next planet" : "Retry"}</button><a class="btn ghost" href="learn.html" data-cursor="Open">See roadmap →</a><a class="btn ghost" href="world.html" data-cursor="Open">🗺 Skill World</a></div></div>`;
    main.querySelector("#again").onclick = () => ctx.rerender();
  }
  show();
}

/* ------------------------------ blitz ------------------------------ */
function blitzIntro(main, ctx, nodes) {
  main.innerHTML = `<div class="end-screen"><h2 style="font-size:42px">⚡ 60-second Blitz</h2><p class="muted">Questions from: ${nodes.map((n) => ctx.esc(n.skill)).join(", ")}</p>
    <button class="btn primary" id="go" data-cursor="Go">Start blitz</button></div>`;
  main.querySelector("#go").onclick = () => runBlitz(main, ctx, nodes.map((n) => n.skill));
}
async function runBlitz(main, ctx, skills) {
  const { esc, sound } = ctx;
  const pool = [];
  for (const s of skills) { const q = await ctx.api(`api/quiz?skill=${encodeURIComponent(s)}`); q.questions.forEach((x, i) => pool.push({ skill: s, i, ...x })); }
  pool.sort(() => Math.random() - .5);
  let k = 0, score = 0, combo = 0, left = 60, busy = false;
  const tick = setInterval(() => { left -= 1; const t = main.querySelector("#bt"); if (t) t.textContent = left; if (left <= 0) end(); }, 1000);
  function show() {
    if (k >= pool.length) { pool.sort(() => Math.random() - .5); k = 0; }
    const q = pool[k];
    main.innerHTML = `<div class="hud"><span>⚡ BLITZ</span><span class="badge brand">${esc(q.skill)}</span><span class="combo">${combo > 1 ? `×${combo}` : ""}</span><span class="score">${score} pts</span><span class="score" style="color:var(--amber)">⏱ <span id="bt">${left}</span>s</span></div>
      <div class="transmission"><h2>${esc(q.q)}</h2></div><div class="asteroids">${q.options.map((o, j) => `<button class="asteroid" data-j="${j}"><span class="key">${j + 1}</span>${esc(o)}</button>`).join("")}</div>`;
    main.querySelectorAll(".asteroid").forEach((b) => (b.onclick = (e) => pick(+b.dataset.j, e)));
  }
  async function pick(j, ev) {
    if (busy || left <= 0) return; busy = true;
    const q = pool[k], r = await ctx.api("api/quiz/check", { skill: q.skill, index: q.i, answer: j });
    const btns = main.querySelectorAll(".asteroid"); btns[r.correct_index]?.classList.add("right");
    if (r.correct) { combo++; score += 50 * combo; sound.play("good"); floatText(main, `+${50 * combo}`, ev, "#9dff6a"); }
    else { combo = 0; btns[j]?.classList.add("wrong"); sound.play("bad"); }
    setTimeout(() => { busy = false; k++; if (left > 0) show(); }, 550);
  }
  const key = (e) => { if (/^[1-4]$/.test(e.key)) pick(+e.key - 1); };
  document.addEventListener("keydown", key);
  function end() {
    clearInterval(tick); document.removeEventListener("keydown", key);
    const store = ctx.store(), best = Math.max(store.best || 0, score), isBest = score > (store.best || 0);
    store.best = best; store.xp = (store.xp || 0) + Math.round(score / 25); ctx.saveStore(store);
    if (isBest && score > 0) { ctx.confetti(); sound.play("level"); }
    main.innerHTML = `<div class="end-screen"><h2 style="font-size:44px">${score} pts</h2><p>${isBest ? "🏆 New personal best!" : `Best: ${best}`} · +${Math.round(score / 25)} XP</p><button class="btn primary" id="again">Play again</button></div>`;
    main.querySelector("#again").onclick = () => runBlitz(main, ctx, skills);
  }
  show();
}

/* ------------------------------ juice ------------------------------ */
function floatText(host, txt, ev, color) {
  const r = host.getBoundingClientRect(), d = document.createElement("div");
  d.className = "float-text"; d.textContent = txt; d.style.color = color;
  d.style.left = (ev ? ev.clientX - r.left : r.width / 2) + "px"; d.style.top = (ev ? ev.clientY - r.top - 20 : r.height / 2) + "px";
  host.style.position = "relative"; host.appendChild(d); setTimeout(() => d.remove(), 1000);
}
function burst(btn) {
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  for (let i = 0; i < 14; i++) {
    const p = document.createElement("span"), a = (i / 14) * Math.PI * 2;
    p.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;width:7px;height:7px;border-radius:50%;background:${PLANET_COLORS[i % 8]};pointer-events:none;z-index:999`;
    document.body.appendChild(p);
    p.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${Math.cos(a) * 90}px,${Math.sin(a) * 90}px) scale(0)`, opacity: 0 }], { duration: 700, easing: "cubic-bezier(.22,1,.36,1)" }).onfinish = () => p.remove();
  }
}
