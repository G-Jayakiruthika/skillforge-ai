/*
 * games.js - three more games, each hosted by a 3D doll.
 *
 *  Doll Dash       3D lane runner. Your skill guide runs toward answer gates; steer into the
 *                  lane with the right answer (← → keys, A/D, or tap a lane). Recorded as a
 *                  real assessment, so the agents re-plan afterwards.
 *  Bridge Builder  3D. Lay skill planks in an order that respects prerequisites so the doll
 *                  can cross. Teaches WHY the roadmap is ordered the way it is.
 *  Memory Match    Flip cards to pair each skill concept with its meaning. The doll reacts.
 */
import { THREE, makeDoll, guideForSkill, DOLLS, dollHtml, mountAll } from "./avatars.js";
import K from "./knowledge.js";

const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
let active = null;                                   // current game's cleanup
export function stopGame() { if (active) { try { active(); } catch (_) {} active = null; } }

function stage3d(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070916); scene.fog = new THREE.Fog(0x070916, 14, 46);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223355, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(3, 8, 5); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(55, 2, .1, 100);
  const resize = () => { const w = canvas.clientWidth || 800, h = canvas.clientHeight || 480; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  resize(); addEventListener("resize", resize);
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(Float32Array.from({ length: 900 }, () => (Math.random() - .5) * 90), 3)), new THREE.PointsMaterial({ color: 0xffffff, size: .08 }));
  scene.add(stars);
  return { renderer, scene, camera, dispose() { removeEventListener("resize", resize); renderer.dispose(); } };
}

/* =============================== Hub =============================== */
export function renderGames(el, ctx) {
  stopGame();
  const { esc, learner: L } = ctx;
  const nodes = (L.roadmap?.nodes || []).filter((n) => !n.is_remedial), open = nodes.filter((n) => n.status !== "locked");
  const pick = open.find((n) => n.skill === L.roadmap?.active) || open[0] || nodes[0];
  el.innerHTML = `
  <div class="game-grid">
    <button class="game-card" data-game="dash" style="--ac:#fb923c" data-tip="A 3D running game. Recorded as a real assessment." data-cursor="Play"><span class="gi">🏃</span><span class="badge brand">recorded</span><h3>Doll Dash</h3><p>Your skill guide runs down a 3-lane track. Steer into the lane with the right answer before the gate.</p></button>
    <button class="game-card" data-game="bridge" style="--ac:#4ade80" data-tip="Put skills in prerequisite order to build a bridge." data-cursor="Play"><span class="gi">🌉</span><span class="badge warn">practice</span><h3>Bridge Builder</h3><p>Lay skill planks in the right order so the doll can cross. Learn why prerequisites come first.</p></button>
    <button class="game-card" data-game="memory" style="--ac:#a78bfa" data-tip="Match each concept with its meaning." data-cursor="Play"><span class="gi">🃏</span><span class="badge warn">practice</span><h3>Memory Match</h3><p>Flip cards and pair each skill concept with its meaning. Fewer flips, more XP.</p></button>
    <a class="game-card" href="arena.html" style="--ac:#f43f5e" data-tip="The original quiz missions with planets, lives and combos." data-cursor="Play"><span class="gi">🚀</span><span class="badge brand">recorded</span><h3>Skill Arena</h3><p>Planet missions with 3 lives, timers and combos — plus 60-second Blitz.</p></a>
  </div>
  <div class="card" style="margin-top:16px"><div class="row"><label class="lbl" style="margin:0">Skill for Doll Dash</label><select id="game-skill" style="max-width:280px" data-tip="Locked skills become available once their prerequisites are met">${nodes.map((n) => `<option ${n === pick ? "selected" : ""} ${n.status === "locked" ? "disabled" : ""}>${esc(n.skill)}</option>`).join("")}</select>
    <span class="small muted">Guide: <b id="game-guide"></b></span></div></div>
  <div id="game-host" style="margin-top:16px"></div>`;
  const sel = el.querySelector("#game-skill"), gl = el.querySelector("#game-guide");
  const upd = () => (gl.textContent = DOLLS[guideForSkill(sel.value)].name); sel.onchange = upd; upd();
  const host = el.querySelector("#game-host");
  el.querySelectorAll("button[data-game]").forEach((b) => (b.onclick = () => {
    ctx.sound.play("whoosh"); host.scrollIntoView({ behavior: "smooth", block: "start" });
    ({ dash: () => playDash(host, ctx, sel.value), bridge: () => playBridge(host, ctx, nodes), memory: () => playMemory(host, ctx, nodes) })[b.dataset.game]();
  }));
}

/* =============================== 1. Doll Dash =============================== */
async function playDash(host, ctx, skill) {
  stopGame();
  const { esc, sound } = ctx, quiz = await ctx.api(`api/quiz?skill=${encodeURIComponent(skill)}`), guide = guideForSkill(skill);
  host.innerHTML = `<div class="game-stage"><canvas class="g3d" aria-label="Doll Dash 3D game"></canvas>
    <div class="game-hud"><span>🏃 DOLL DASH · ${esc(skill)}</span><span id="d-lives">❤️❤️❤️</span><span id="d-score">0 pts</span></div>
    <div class="game-q" id="d-q" aria-live="polite"></div><div class="lane-labels" id="d-lanes"></div></div>
    <p class="small muted">Move with ← → (or A / D), or tap a lane. Be in the correct lane when the gate arrives.</p>`;
  const canvas = host.querySelector("canvas"), st = stage3d(canvas), { scene, camera, renderer } = st;
  camera.position.set(0, 4.2, 7.5); camera.lookAt(0, 1, -6);
  const LANES = [-2.4, 0, 2.4];
  const track = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 120), new THREE.MeshStandardMaterial({ color: 0x141a3a })); track.rotation.x = -Math.PI / 2; track.position.z = -50; scene.add(track);
  const stripes = []; for (let i = 0; i < 40; i++) for (const x of [-1.2, 1.2]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(.08, 1.4), new THREE.MeshBasicMaterial({ color: 0x3cf0ff, transparent: true, opacity: .5 })); s.rotation.x = -Math.PI / 2; s.position.set(x, .01, -i * 3); scene.add(s); stripes.push(s); }
  const doll = makeDoll(guide); doll.rotation.y = Math.PI; scene.add(doll);
  const gateMat = [0xfb923c, 0x3cf0ff, 0xa78bfa].map((c) => new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: .55, emissive: c, emissiveIntensity: .35 }));
  const gates = LANES.map((x, i) => { const g = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.6, .25), gateMat[i]); g.position.set(x, 1.3, -60); scene.add(g); return g; });

  let lane = 1, qi = 0, lives = 3, score = 0, gateZ = -60, mood = "run", phase = "run", answers = [], opts = [], correctLane = 0, raf = 0, last = performance.now(), speed = 15, done = false;
  const qEl = host.querySelector("#d-q"), lanesEl = host.querySelector("#d-lanes");
  function setQuestion() {
    const q = quiz.questions[qi];
    // three lanes: the correct answer + two wrong ones, shuffled. Lane -> original option index.
    opts = null;
    qEl.textContent = `${qi + 1}/${quiz.questions.length} · ${q.q}`;
    gateZ = -60; phase = "run"; mood = "run";
    return q;
  }
  async function prepare() {
    const q = setQuestion();
    // find the correct option without revealing it to the page until the gate resolves
    const probe = await ctx.api("api/quiz/check", { skill, index: qi, answer: -1 });
    const wrong = shuffle(q.options.map((_, i) => i).filter((i) => i !== probe.correct_index)).slice(0, 2);
    opts = shuffle([probe.correct_index, ...wrong]); correctLane = opts.indexOf(probe.correct_index);
    lanesEl.innerHTML = opts.map((oi, i) => `<button data-lane="${i}" class="${i === lane ? "on" : ""}">${esc(q.options[oi])}</button>`).join("");
    lanesEl.querySelectorAll("button").forEach((b) => (b.onclick = () => move(+b.dataset.lane)));
  }
  function move(l) { if (phase !== "run") return; lane = Math.max(0, Math.min(2, l)); lanesEl.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i === lane)); sound.play("tick"); }
  const key = (e) => { if (["ArrowLeft", "a", "A"].includes(e.key)) { e.preventDefault(); move(lane - 1); } if (["ArrowRight", "d", "D"].includes(e.key)) { e.preventDefault(); move(lane + 1); } };
  document.addEventListener("keydown", key);

  function resolve() {
    phase = "result"; const ok = lane === correctLane; answers[qi] = opts[lane];
    lanesEl.querySelectorAll("button").forEach((b, i) => { if (i === correctLane) b.classList.add("right"); else if (i === lane) b.classList.add("wrong"); });
    if (ok) { score += 100 + Math.round(speed * 4); mood = "cheer"; sound.play("good"); speed = Math.min(24, speed + 2); }
    else { lives -= 1; mood = "sad"; sound.play("bad"); host.querySelector("#d-lives").textContent = "❤️".repeat(Math.max(0, lives)) + "🖤".repeat(3 - Math.max(0, lives)); }
    host.querySelector("#d-score").textContent = `${score} pts`;
    setTimeout(async () => { qi += 1; if (qi < quiz.questions.length && lives > 0) await prepare(); else finish(); }, 1300);
  }
  async function finish() {
    if (done) return; done = true; phase = "over";
    for (let i = 0; i < quiz.questions.length; i++) if (answers[i] === undefined) answers[i] = null;
    const r = await ctx.runAssess({ skill, mode: "quiz", answers }, { quiet: true }), la = r.learner.last_assessment;
    const store = ctx.store(); store.xp = (store.xp || 0) + Math.round(score / 20); store.dash = Math.max(store.dash || 0, score); ctx.saveStore(store, "dash");
    mood = la.passed ? "cheer" : "sad";
    const over = document.createElement("div"); over.className = "game-over";
    over.innerHTML = `<h2 style="font-size:36px">${la.passed ? "🏁 Finish line!" : "💥 Tripped — try again"}</h2><p><b>${la.score.toFixed(0)}%</b> recorded as an assessment · ${score} pts · +${Math.round(score / 20)} XP</p>
      <p style="max-width:560px">${esc(r.learner.mentor.message)}</p><div class="row" style="justify-content:center"><button class="btn primary" id="d-again">Run again</button><a class="btn ghost" href="learn.html">Learning path →</a></div>`;
    host.querySelector(".game-stage").appendChild(over); over.querySelector("#d-again").onclick = () => playDash(host, ctx, skill);
  }
  function loop(now) {
    const dt = Math.min(.05, (now - last) / 1000), t = now / 1000; last = now;
    doll.position.x += (LANES[lane] - doll.position.x) * Math.min(1, dt * 10);
    doll.animate(t, dt, mood);
    if (phase === "run" && opts) { gateZ += speed * dt; if (gateZ >= -.6) resolve(); }
    else if (phase === "result") gateZ += speed * dt * .6;
    gates.forEach((g, i) => { g.position.z = gateZ; g.visible = !!opts && gateZ < 3; g.material.opacity = phase === "result" ? (i === correctLane ? .9 : .15) : .55; });
    if (phase !== "over") stripes.forEach((s) => { s.position.z += speed * dt; if (s.position.z > 8) s.position.z -= 120; });
    renderer.render(scene, camera); raf = requestAnimationFrame(loop);
  }
  await prepare(); raf = requestAnimationFrame(loop);
  active = () => { cancelAnimationFrame(raf); document.removeEventListener("keydown", key); st.dispose(); };
}

/* =============================== 2. Bridge Builder =============================== */
function playBridge(host, ctx, nodes) {
  stopGame();
  const { esc, sound } = ctx, skills = nodes.map((n) => n.skill).slice(0, 7), set = new Set(skills);
  const prereqs = (s) => (K.PREREQUISITES[s] || []).map((p) => p.split("|").filter((x) => set.has(x))).filter((g) => g.length);
  const guide = guideForSkill(skills[skills.length - 1]);
  host.innerHTML = `<div class="game-stage"><canvas class="g3d" aria-label="Bridge Builder 3D game"></canvas>
    <div class="game-hud"><span>🌉 BRIDGE BUILDER</span><span id="b-miss">Mistakes: 0</span><span id="b-prog">0 / ${skills.length} planks</span></div><div class="game-q" id="b-q" aria-live="polite">Lay the first plank: a skill that needs nothing before it.</div></div>
    <div class="card" style="margin-top:12px"><label class="lbl">Bridge so far</label><div class="plank-slots" id="b-slots"></div>
      <label class="lbl" style="margin-top:12px">Skill planks — click one to lay it</label><div class="plank-bank" id="b-bank">${shuffle(skills).map((s) => `<button class="plank" data-skill="${esc(s)}" data-tip="${prereqs(s).length ? "Needs: " + prereqs(s).map((g) => g.join(" or ")).join(", ") : "No prerequisites"}">${esc(s)}</button>`).join("")}</div></div>`;
  const canvas = host.querySelector("canvas"), st = stage3d(canvas), { scene, camera, renderer } = st;
  camera.position.set(0, 4.5, 11); camera.lookAt(0, .8, 0);
  const cliff = (x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), new THREE.MeshStandardMaterial({ color: 0x1f3f5e })); m.position.set(x, -1.5, 0); scene.add(m); };
  const span = 9, x0 = -span / 2, step = span / skills.length; cliff(x0 - 2); cliff(-x0 + 2);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: 0x0b2a4a, transparent: true, opacity: .8 })); water.rotation.x = -Math.PI / 2; water.position.y = -2.6; scene.add(water);
  const flag = new THREE.Mesh(new THREE.ConeGeometry(.3, .8, 4), new THREE.MeshStandardMaterial({ color: 0xffb547, emissive: 0xffb547, emissiveIntensity: .5 })); flag.position.set(-x0 + 2, .6, 0); scene.add(flag);
  const doll = makeDoll(guide); doll.position.set(x0 - 2, 0, 0); doll.rotation.y = Math.PI / 2; scene.add(doll);
  const placed = [], planks = []; let mistakes = 0, mood = "idle", walking = false, raf = 0, last = performance.now();
  const qEl = host.querySelector("#b-q");
  host.querySelectorAll(".plank").forEach((b) => (b.onclick = () => {
    const s = b.dataset.skill, ok = prereqs(s).every((g) => g.some((p) => placed.includes(p)));
    if (!ok) { mistakes++; b.classList.add("bad"); setTimeout(() => b.classList.remove("bad"), 450); mood = "sad"; setTimeout(() => (mood = "idle"), 900); sound.play("bad");
      host.querySelector("#b-miss").textContent = `Mistakes: ${mistakes}`; qEl.textContent = `${s} needs ${prereqs(s).map((g) => g.join(" or ")).join(" and ")} first.`; return; }
    placed.push(s); b.remove(); sound.play("good"); mood = "cheer"; setTimeout(() => !walking && (mood = "idle"), 700);
    host.querySelector("#b-slots").insertAdjacentHTML("beforeend", `<span class="plank good">${placed.length}. ${esc(s)}</span>`);
    const p = new THREE.Mesh(new THREE.BoxGeometry(step * .92, .18, 1.6), new THREE.MeshStandardMaterial({ color: new THREE.Color(DOLLS[guideForSkill(s)].color) }));
    p.position.set(x0 + step * (placed.length - .5), 6, 0); p.userData.y = -.09; scene.add(p); planks.push(p);
    host.querySelector("#b-prog").textContent = `${placed.length} / ${skills.length} planks`;
    qEl.textContent = placed.length < skills.length ? `Good — ${s} is in place. What can be learned next?` : "Bridge complete! Watch your guide cross.";
    if (placed.length === skills.length) { walking = true; mood = "walk"; }
  }));
  function loop(now) {
    const dt = Math.min(.05, (now - last) / 1000), t = now / 1000; last = now;
    planks.forEach((p) => (p.position.y += (p.userData.y - p.position.y) * Math.min(1, dt * 8)));
    if (walking) { doll.position.x += dt * 2.6; if (doll.position.x >= -x0 + 1.6) { walking = false; mood = "cheer"; win(); } }
    doll.animate(t, dt, mood); flag.rotation.y = t; renderer.render(scene, camera); raf = requestAnimationFrame(loop);
  }
  function win() {
    const xp = Math.max(10, 60 - mistakes * 10), store = ctx.store(); store.xp = (store.xp || 0) + xp; ctx.saveStore(store, "bridge"); ctx.confetti(); sound.play("level");
    const over = document.createElement("div"); over.className = "game-over";
    over.innerHTML = `<h2 style="font-size:36px">🌉 Bridge built!</h2><p>${mistakes} mistake${mistakes === 1 ? "" : "s"} · +${xp} XP</p><p style="max-width:560px">This is exactly the order your Learning Path uses: ${placed.map(esc).join(" → ")}.</p>
      <div class="row" style="justify-content:center"><button class="btn primary" id="b-again">Play again</button><a class="btn ghost" href="learn.html">See the roadmap →</a></div>`;
    host.querySelector(".game-stage").appendChild(over); over.querySelector("#b-again").onclick = () => playBridge(host, ctx, nodes);
  }
  raf = requestAnimationFrame(loop);
  active = () => { cancelAnimationFrame(raf); st.dispose(); };
}

/* =============================== 3. Memory Match =============================== */
async function playMemory(host, ctx, nodes) {
  stopGame();
  const { esc, sound } = ctx, picks = shuffle(nodes.map((n) => n.skill)).slice(0, 6), pairs = [];
  for (const skill of picks) {
    const quiz = await ctx.api(`api/quiz?skill=${encodeURIComponent(skill)}`), i = (Math.random() * quiz.questions.length) | 0;
    const chk = await ctx.api("api/quiz/check", { skill, index: i, answer: -1 });
    pairs.push({ skill, a: `${skill} · ${chk.concept.replace(/_/g, " ")}`, b: quiz.questions[i].options[chk.correct_index] });
  }
  const cards = shuffle(pairs.flatMap((p, k) => [{ k, text: p.a, kind: "concept" }, { k, text: p.b, kind: "meaning" }]));
  const guide = guideForSkill(picks[0]);
  host.innerHTML = `<div class="card"><div class="guide-strip" style="--ac:${ctx.esc(DOLLS[guide].color)}">${dollHtml(guide, 84)}<div><b>${ctx.esc(DOLLS[guide].name)}</b> hosts Memory Match<div class="small muted" id="m-say" aria-live="polite">Flip two cards. Pair each skill concept with its meaning.</div></div>
      <div style="margin-left:auto;text-align:right" class="mono"><div id="m-flips">Flips: 0</div><div id="m-pairs">Pairs: 0 / ${pairs.length}</div></div></div>
    <div class="mem-grid">${cards.map((c, i) => `<button class="mem-card down" data-i="${i}" aria-label="Hidden card ${i + 1}"><span>${esc(c.text)}</span></button>`).join("")}</div></div>`;
  const d = mountAll(host)[guide], say = host.querySelector("#m-say");
  let open = [], flips = 0, found = 0, lock = false;
  host.querySelectorAll(".mem-card").forEach((b) => (b.onclick = () => {
    const i = +b.dataset.i; if (lock || !b.classList.contains("down")) return;
    b.classList.remove("down"); b.classList.add("up"); b.setAttribute("aria-label", cards[i].text); open.push(i); sound.play("tick");
    if (open.length < 2) return;
    flips++; host.querySelector("#m-flips").textContent = `Flips: ${flips}`; lock = true;
    const [x, y] = open, els = [x, y].map((n) => host.querySelector(`.mem-card[data-i="${n}"]`));
    if (cards[x].k === cards[y].k) {
      found++; els.forEach((e) => e.classList.add("done")); d?.play("cheer", 1100); sound.play("good"); say.textContent = `Yes! ${pairs[cards[x].k].a} → ${pairs[cards[x].k].b}`;
      host.querySelector("#m-pairs").textContent = `Pairs: ${found} / ${pairs.length}`; open = []; lock = false;
      if (found === pairs.length) {
        const xp = Math.max(15, 80 - Math.max(0, flips - pairs.length) * 5), store = ctx.store(); store.xp = (store.xp || 0) + xp; ctx.saveStore(store, "memory"); ctx.confetti(); sound.play("level");
        say.innerHTML = `All pairs found in ${flips} flips · +${xp} XP · <button class="btn sm" id="m-again">Play again</button>`; host.querySelector("#m-again").onclick = () => playMemory(host, ctx, nodes);
      }
    } else { d?.play("sad", 800); sound.play("bad"); say.textContent = "Not a pair — remember where they were."; setTimeout(() => { els.forEach((e) => { e.classList.add("down"); e.classList.remove("up"); }); open = []; lock = false; }, 1100); }
  }));
}
