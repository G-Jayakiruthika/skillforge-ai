/*
 * avatars.js - animated 3D "doll" characters, built from Three.js primitives (no model files).
 *
 * Two families:
 *   AGENT dolls  - the 8 AI agents (Supervisor, Profiler, ...)
 *   GUIDE dolls  - one per industry; every skill is taught by its industry's guide, so a
 *                  learner can tell at a glance which kind of skill they are learning.
 *
 * mountDoll(canvas, id)  draws a doll into a normal 2D canvas. All dolls share ONE WebGL
 *                        renderer (browsers allow only a few WebGL contexts per page).
 * makeDoll(id)           returns a THREE.Group with .animate(t, dt, mood) for use inside games.
 */
import * as THREE from "../vendor/three.module.min.js";
import K from "./knowledge.js";

export const DOLLS = {
  // --- the 8 agents ---
  supervisor: { name: "Captain Relay", role: "Supervisor agent", color: "#3cf0ff", skin: "#ffd9b8", hat: "antenna", item: "orb", line: "I receive every event and send it to the right teammate." },
  profiler: { name: "Dr. Helix", role: "Profiler agent", color: "#8b5cff", skin: "#f2c6a0", hat: "glasses", item: "book", line: "I read your skills, certificates and projects, and score them fairly." },
  analyst: { name: "Lens", role: "Skill Analyst agent", color: "#ff3ea5", skin: "#e8b48a", hat: "visor", item: "lens", line: "I find your strengths, your weak spots, and the exact concepts you missed." },
  matcher: { name: "Bullseye", role: "Career Matcher agent", color: "#ffb547", skin: "#c98e63", hat: "cap", item: "target", line: "I compare you with roles, industries and companies — and your dream company." },
  architect: { name: "Atlas", role: "Path Architect agent", color: "#9dff6a", skin: "#ffd9b8", hat: "hardhat", item: "scroll", line: "I put your skills in the right order and plan your weeks." },
  curator: { name: "Paige", role: "Resource Curator agent", color: "#4dd5a6", skin: "#f2c6a0", hat: "beret", item: "book", line: "I pick the course, practice, video and project for every step." },
  assessor: { name: "Quizzo", role: "Assessor agent", color: "#ff7a59", skin: "#e8b48a", hat: "gradcap", item: "flask", line: "I test you. Below 60%? I call for a remedial lab right away." },
  mentor: { name: "Sage", role: "Mentor agent", color: "#5b8cff", skin: "#c98e63", hat: "halo", item: "star", line: "I explain what changed, and I'm here whenever you want to talk." },
  // --- industry skill guides ---
  byte: { name: "Byte", role: "Software & IT guide", color: "#3cf0ff", skin: "#ffd9b8", hat: "headset", item: "laptop", line: "Code is just clear thinking. Let's build something!" },
  nova: { name: "Nova", role: "Data & AI guide", color: "#8b5cff", skin: "#e8b48a", hat: "halo", item: "orb", line: "Data tells stories. I'll show you how to read them." },
  torque: { name: "Torque", role: "Mechanical guide", color: "#ffb547", skin: "#c98e63", hat: "hardhat", item: "gear", line: "Good design can be built. Let's make it real." },
  volt: { name: "Volt", role: "Electronics guide", color: "#9dff6a", skin: "#f2c6a0", hat: "antenna", item: "bolt", line: "Every device has a tiny brain. Let's program it." },
  brick: { name: "Brick", role: "Civil guide", color: "#ff7a59", skin: "#ffd9b8", hat: "hardhat", item: "scroll", line: "Strong structures start with careful numbers." },
  penny: { name: "Penny", role: "Finance guide", color: "#4dd5a6", skin: "#e8b48a", hat: "glasses", item: "coin", line: "Numbers explain a business. Let's balance the books." },
  quest: { name: "Quest", role: "Business guide", color: "#5b8cff", skin: "#c98e63", hat: "cap", item: "scroll", line: "Ask the right question and the answer gets easier." },
  pixel: { name: "Pixel", role: "Marketing & Design guide", color: "#ff3ea5", skin: "#f2c6a0", hat: "beret", item: "brush", line: "Make it clear, make it kind, make it beautiful." },
  remedy: { name: "Remedy", role: "Healthcare guide", color: "#ff4d5e", skin: "#ffd9b8", hat: "nursecap", item: "flask", line: "Care and accuracy go together. Let's learn safely." },
};
const INDUSTRY_GUIDE = { "Software & IT": "byte", "Data & AI": "nova", "Mechanical & Manufacturing": "torque", "Electronics & Embedded": "volt", "Civil & Construction": "brick", "Finance & Commerce": "penny", "Business & Management": "quest", "Marketing & Design": "pixel", "Healthcare & Life Sciences": "remedy" };
export const AGENT_IDS = ["supervisor", "profiler", "analyst", "matcher", "architect", "curator", "assessor", "mentor"];
export const GUIDE_IDS = Object.values(INDUSTRY_GUIDE);

// Which guide teaches a skill: the industry whose roles need it most (first match wins for shared skills).
const _skillGuide = {};
for (const [ind, info] of Object.entries(K.INDUSTRIES || {})) for (const role of info.roles) for (const sk of Object.keys(K.ROLE_BENCHMARKS[role] || {})) if (!_skillGuide[sk]) _skillGuide[sk] = INDUSTRY_GUIDE[ind];
Object.assign(_skillGuide, { Communication: "quest", "Advanced Excel": "penny", Statistics: "nova", "CAD Design": "torque", "HTML/CSS": "byte", SQL: "nova", Python: "byte", Git: "byte" });
export const guideForSkill = (skill) => _skillGuide[skill] || "byte";
export const guideForIndustry = (ind) => INDUSTRY_GUIDE[ind] || "byte";

/* ---------------- building a doll ---------------- */
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .08, ...o });
function part(geo, material, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); return m; }

export function makeDoll(id) {
  const spec = DOLLS[id] || DOLLS.byte, g = new THREE.Group();
  const body = mat(spec.color), skin = mat(spec.skin), dark = mat("#1b1f3a"), white = mat("#ffffff"), accent = mat("#ffffff", { emissive: spec.color, emissiveIntensity: .7 });
  const hips = new THREE.Group(); g.add(hips);
  // torso
  const torso = part(new THREE.CapsuleGeometry(.36, .42, 6, 16), body, 0, .95, 0); hips.add(torso);
  const badge = part(new THREE.CircleGeometry(.11, 20), accent, 0, 1.02, .355); hips.add(badge);
  // head
  const head = new THREE.Group(); head.position.set(0, 1.62, 0); hips.add(head);
  head.add(part(new THREE.SphereGeometry(.34, 28, 20), skin));
  const eyeL = part(new THREE.SphereGeometry(.05, 12, 10), dark, -.12, .04, .3), eyeR = part(new THREE.SphereGeometry(.05, 12, 10), dark, .12, .04, .3);
  head.add(eyeL, eyeR);
  const mouth = part(new THREE.TorusGeometry(.07, .016, 8, 16, Math.PI), dark, 0, -.09, .305); mouth.rotation.z = Math.PI; head.add(mouth);
  head.add(part(new THREE.SphereGeometry(.045, 10, 8), mat("#ff9aa8", { transparent: true, opacity: .7 }), -.21, -.05, .245), part(new THREE.SphereGeometry(.045, 10, 8), mat("#ff9aa8", { transparent: true, opacity: .7 }), .21, -.05, .245));
  // hair
  const hair = part(new THREE.SphereGeometry(.355, 24, 14, 0, Math.PI * 2, 0, Math.PI * .5), dark, 0, .03, -.02); head.add(hair);
  // arms (pivot at shoulder)
  const arm = (side) => { const p = new THREE.Group(); p.position.set(.43 * side, 1.2, 0); p.add(part(new THREE.CapsuleGeometry(.085, .34, 4, 10), body, 0, -.22, 0)); p.add(part(new THREE.SphereGeometry(.1, 12, 10), skin, 0, -.47, 0)); hips.add(p); return p; };
  const armL = arm(-1), armR = arm(1);
  // legs (pivot at hip)
  const leg = (side) => { const p = new THREE.Group(); p.position.set(.16 * side, .62, 0); p.add(part(new THREE.CapsuleGeometry(.1, .3, 4, 10), dark, 0, -.24, 0)); p.add(part(new THREE.BoxGeometry(.2, .1, .3), white, 0, -.5, .05)); g.add(p); return p; };
  const legL = leg(-1), legR = leg(1);
  // hat
  const H = { antenna: () => { const a = new THREE.Group(); a.add(part(new THREE.CylinderGeometry(.015, .015, .26), dark, 0, .47, 0), part(new THREE.SphereGeometry(.06, 12, 10), accent, 0, .62, 0)); return a; },
    glasses: () => { const a = new THREE.Group(); for (const s of [-1, 1]) a.add(part(new THREE.TorusGeometry(.085, .014, 8, 20), dark, .12 * s, .04, .31)); a.add(part(new THREE.BoxGeometry(.07, .014, .014), dark, 0, .04, .32)); return a; },
    visor: () => part(new THREE.BoxGeometry(.5, .1, .1), accent, 0, .06, .3),
    cap: () => { const a = new THREE.Group(); a.add(part(new THREE.SphereGeometry(.36, 20, 12, 0, Math.PI * 2, 0, Math.PI * .45), body, 0, .04, 0), part(new THREE.BoxGeometry(.3, .03, .22), body, 0, .16, .32)); return a; },
    hardhat: () => { const a = new THREE.Group(); a.add(part(new THREE.SphereGeometry(.38, 20, 12, 0, Math.PI * 2, 0, Math.PI * .5), mat("#ffd23f"), 0, .06, 0), part(new THREE.CylinderGeometry(.42, .42, .03, 24), mat("#ffd23f"), 0, .08, 0)); return a; },
    beret: () => { const m = part(new THREE.SphereGeometry(.33, 20, 12), body, .05, .3, 0); m.scale.set(1.1, .32, 1.1); return m; },
    gradcap: () => { const a = new THREE.Group(); a.add(part(new THREE.CylinderGeometry(.2, .24, .12, 16), dark, 0, .33, 0), part(new THREE.BoxGeometry(.62, .03, .62), dark, 0, .41, 0), part(new THREE.SphereGeometry(.04, 8, 8), accent, .3, .36, .3)); return a; },
    halo: () => { const m = part(new THREE.TorusGeometry(.24, .03, 10, 30), accent, 0, .52, 0); m.rotation.x = Math.PI / 2; return m; },
    headset: () => { const a = new THREE.Group(); const band = part(new THREE.TorusGeometry(.36, .025, 8, 24, Math.PI), dark, 0, .02, 0); a.add(band); for (const s of [-1, 1]) a.add(part(new THREE.SphereGeometry(.09, 12, 10), accent, .36 * s, .02, 0)); return a; },
    nursecap: () => { const a = new THREE.Group(); a.add(part(new THREE.BoxGeometry(.4, .16, .2), white, 0, .36, .08), part(new THREE.BoxGeometry(.12, .035, .02), mat("#ff4d5e"), 0, .36, .19), part(new THREE.BoxGeometry(.035, .12, .02), mat("#ff4d5e"), 0, .36, .19)); return a; } };
  const hat = (H[spec.hat] || H.cap)(); head.add(hat);
  // hand item (in right hand)
  const I = { orb: () => part(new THREE.SphereGeometry(.12, 16, 12), accent), book: () => part(new THREE.BoxGeometry(.2, .26, .06), accent), lens: () => { const a = new THREE.Group(); a.add(part(new THREE.TorusGeometry(.1, .02, 8, 20), dark), part(new THREE.CylinderGeometry(.018, .018, .16), dark, 0, -.17, 0)); return a; },
    target: () => { const a = new THREE.Group(); a.add(part(new THREE.CircleGeometry(.14, 20), white), part(new THREE.CircleGeometry(.09, 20), mat("#ff4d5e"), 0, 0, .005), part(new THREE.CircleGeometry(.04, 16), white, 0, 0, .01)); return a; },
    scroll: () => { const m = part(new THREE.CylinderGeometry(.045, .045, .3, 12), white); m.rotation.z = Math.PI / 2; return m; }, flask: () => { const a = new THREE.Group(); a.add(part(new THREE.ConeGeometry(.1, .18, 14), accent, 0, 0, 0), part(new THREE.CylinderGeometry(.03, .03, .1, 10), white, 0, .13, 0)); return a; },
    star: () => part(new THREE.OctahedronGeometry(.12), accent), laptop: () => { const a = new THREE.Group(); a.add(part(new THREE.BoxGeometry(.28, .02, .2), dark), part(new THREE.BoxGeometry(.28, .2, .02), accent, 0, .1, -.1)); return a; },
    gear: () => part(new THREE.TorusGeometry(.1, .04, 6, 8), mat("#c9d1e6", { metalness: .7 })), bolt: () => part(new THREE.ConeGeometry(.07, .26, 4), accent), coin: () => { const m = part(new THREE.CylinderGeometry(.11, .11, .03, 22), mat("#ffd23f", { metalness: .6 })); m.rotation.x = Math.PI / 2; return m; },
    brush: () => { const a = new THREE.Group(); a.add(part(new THREE.CylinderGeometry(.015, .02, .26), mat("#b98a5a")), part(new THREE.ConeGeometry(.04, .09, 10), accent, 0, .17, 0)); return a; } };
  const item = (I[spec.item] || I.orb)(); item.position.set(0, -.56, .1); armR.add(item);
  // soft shadow disc
  const shadow = part(new THREE.CircleGeometry(.5, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .25 }), 0, .01, 0); shadow.rotation.x = -Math.PI / 2; g.add(shadow);

  let blink = 2 + Math.random() * 3;
  g.userData = { spec, id };
  /** mood: idle | wave | cheer | sad | talk | walk | run | think */
  g.animate = (t, dt, mood = "idle") => {
    const s = Math.sin, w = mood === "run" ? 13 : 8;
    blink -= dt; const eyeY = blink < .12 ? .1 : 1; if (blink < 0) blink = 2 + Math.random() * 4; eyeL.scale.y = eyeR.scale.y = eyeY;
    hips.position.y = s(t * 2.2) * .025; hips.rotation.set(0, 0, 0); head.rotation.set(0, s(t * .8) * .18, 0);
    armL.rotation.set(0, 0, .12 + s(t * 2) * .05); armR.rotation.set(0, 0, -.12 - s(t * 2) * .05); legL.rotation.x = legR.rotation.x = 0; g.position.y = g.userData.baseY || 0;
    mouth.scale.set(1, 1, 1); item.rotation.y = t * 1.5;
    if (mood === "wave") { armR.rotation.z = -2.5 + s(t * 9) * .35; head.rotation.z = .12; }
    else if (mood === "cheer") { const j = Math.abs(s(t * 7)); g.position.y += j * .28; armL.rotation.z = 2.6; armR.rotation.z = -2.6; legL.rotation.x = -j * .4; legR.rotation.x = j * .4; mouth.scale.set(1.5, 1.9, 1); }
    else if (mood === "sad") { head.rotation.x = .42; hips.rotation.x = .12; armL.rotation.z = .02; armR.rotation.z = -.02; mouth.scale.set(1, -1, 1); hips.position.y = -.04; }
    else if (mood === "talk") { mouth.scale.y = 1 + Math.abs(s(t * 16)) * 1.6; armR.rotation.z = -1.1 + s(t * 4) * .25; head.rotation.x = s(t * 5) * .05; }
    else if (mood === "think") { armR.rotation.set(-1.9, 0, -.5); head.rotation.z = -.16; head.rotation.x = -.1; }
    else if (mood === "walk" || mood === "run") { const k = mood === "run" ? 1.05 : .6; legL.rotation.x = s(t * w) * k; legR.rotation.x = -s(t * w) * k; armL.rotation.x = -s(t * w) * k; armR.rotation.x = s(t * w) * k; hips.position.y = Math.abs(s(t * w)) * .06; hips.rotation.x = mood === "run" ? .18 : .05; }
  };
  return g;
}

/* ---------------- shared renderer for small doll canvases ---------------- */
let renderer = null, scene = null, camera = null, failed = false;
const mounted = new Set();
function ensure() {
  if (renderer || failed) return !failed;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(256, 256, false); renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 1.25));
    const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(2, 4, 3); scene.add(d);
    camera = new THREE.PerspectiveCamera(32, 1, .1, 50); camera.position.set(0, 1.25, 4.6); camera.lookAt(0, 1.05, 0);
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
      const still = document.body.classList.contains("no-motion");
      for (const m of [...mounted]) {
        if (!m.canvas.isConnected) { mounted.delete(m); continue; }
        if (m.canvas.offsetParent === null) continue;                    // hidden
        const r = m.canvas.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue;
        if (still && m.drawn) continue;
        scene.add(m.doll); m.doll.rotation.y = m.turn + (still ? 0 : Math.sin(t * .6 + m.seed) * .25);
        m.doll.animate(still ? 1 : t + m.seed, dt, m.mood); renderer.render(scene, camera); scene.remove(m.doll);
        m.ctx.clearRect(0, 0, m.canvas.width, m.canvas.height); m.ctx.drawImage(renderer.domElement, 0, 0, m.canvas.width, m.canvas.height); m.drawn = true;
        if (m.until && now > m.until) { m.mood = m.rest; m.until = 0; }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  } catch (e) { failed = true; }
  return !failed;
}

/** Draw doll `id` into a <canvas>. Returns { play(mood, ms), set(mood) }. */
export function mountDoll(canvas, id, { mood = "idle", turn = 0 } = {}) {
  const noop = { play() {}, set() {} };
  if (!canvas || !ensure()) return noop;
  const m = { canvas, ctx: canvas.getContext("2d"), doll: makeDoll(id), mood, rest: mood, turn, seed: Math.random() * 10, until: 0, drawn: false };
  mounted.add(m);
  return { play(mo, ms = 1800) { m.mood = mo; m.until = performance.now() + ms; m.drawn = false; }, set(mo) { m.mood = m.rest = mo; m.drawn = false; } };
}

/** HTML for a doll: a canvas plus an emoji fallback shown in minimalist mode / without WebGL. */
const EMOJI = { supervisor: "🛰", profiler: "🧬", analyst: "🔬", matcher: "🎯", architect: "🗺", curator: "📚", assessor: "🧪", mentor: "✨", byte: "💻", nova: "🧠", torque: "⚙️", volt: "🔌", brick: "🏗️", penny: "📊", quest: "🧩", pixel: "🎨", remedy: "🧬" };
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function dollHtml(id, size = 120, extra = "") {
  const d = DOLLS[id] || DOLLS.byte;
  return `<canvas class="doll" data-doll="${esc(id)}" width="${size * 2}" height="${size * 2}" style="width:${size}px;height:${size}px" role="img" aria-label="${esc(d.name)}, ${esc(d.role)}" ${extra}></canvas><div class="doll-fallback" style="width:${size}px;height:${size}px;--ac:${esc(d.color)}" aria-hidden="true">${EMOJI[id] || "🙂"}</div>`;
}
/** Activate every <canvas data-doll> inside `root`. Returns a map id -> controller. */
export function mountAll(root = document, opts = {}) {
  const out = {};
  root.querySelectorAll("canvas[data-doll]:not([data-mounted])").forEach((c) => { c.dataset.mounted = "1"; out[c.dataset.doll] = mountDoll(c, c.dataset.doll, { mood: c.dataset.mood || opts.mood || "idle" }); });
  return out;
}
export { THREE };
