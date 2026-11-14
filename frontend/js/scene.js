/*
 * scene.js - the WebGL world behind every page (Three.js r170, vendored).
 * An iridescent noise-displaced "forge core" floats in a particle galaxy.
 * As you scroll the landing page, the core morphs through 6 shapes
 * (calm sphere -> spiky crystal -> liquid -> rings -> galaxy -> supernova),
 * and it reacts to the pointer and to app events (pass = green pulse,
 * fail = red glitch).
 */
import * as THREE from "../vendor/three.module.min.js";

const NOISE = /* glsl */ `
// 3D simplex noise - Ian McEwan, Ashima Arts (MIT License)
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// shape keyframes per scroll stage
const STAGES = [
  { amp: .22, freq: 1.1, spike: 0.0, twist: 0.0, speed: .25, x: 1.6, y: 0.0, scale: 1.0, ca: [0.24, 0.94, 1.0], cb: [1.0, 0.24, 0.65], spin: .15 },
  { amp: .55, freq: 2.6, spike: .85, twist: 0.0, speed: .4, x: -1.7, y: 0.1, scale: .85, ca: [1.0, 0.3, 0.37], cb: [1.0, 0.71, 0.28], spin: .4 },
  { amp: .38, freq: 1.6, spike: 0.1, twist: 1.2, speed: .35, x: 0.0, y: 0.0, scale: .7, ca: [0.55, 0.36, 1.0], cb: [0.24, 0.94, 1.0], spin: .2 },
  { amp: .3, freq: 3.8, spike: .3, twist: 2.5, speed: .5, x: 1.9, y: -0.2, scale: .8, ca: [0.62, 1.0, 0.42], cb: [0.24, 0.94, 1.0], spin: .6 },
  { amp: .7, freq: 1.0, spike: 0.0, twist: .4, speed: .6, x: -1.8, y: 0.0, scale: .95, ca: [1.0, 0.24, 0.65], cb: [0.55, 0.36, 1.0], spin: .3 },
  { amp: .9, freq: 2.2, spike: .6, twist: 1.6, speed: .9, x: 0.0, y: 0.0, scale: 1.25, ca: [1.0, 0.71, 0.28], cb: [1.0, 0.24, 0.65], spin: .9 },
];
const APP_STAGE = { amp: .25, freq: 1.4, spike: .1, twist: .3, speed: .2, x: 3.3, y: -1.5, scale: .5, ca: [0.24, 0.94, 1.0], cb: [0.55, 0.36, 1.0], spin: .1 };

export function createScene(canvas, { reduced = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x05060f, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060f, 0.045);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 7);

  // ---- forge core (displaced icosphere) ----
  const uniforms = {
    uTime: { value: 0 }, uAmp: { value: .22 }, uFreq: { value: 1.1 }, uSpike: { value: 0 }, uTwist: { value: 0 },
    uColorA: { value: new THREE.Color(0.24, 0.94, 1.0) }, uColorB: { value: new THREE.Color(1.0, 0.24, 0.65) },
    uPulse: { value: 0 }, uPulseColor: { value: new THREE.Color(0.6, 1, 0.4) }, uMouse: { value: new THREE.Vector2() },
  };
  const coreMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: NOISE + /* glsl */ `
      uniform float uTime, uAmp, uFreq, uSpike, uTwist, uPulse; uniform vec2 uMouse;
      varying vec3 vN; varying vec3 vView; varying float vD;
      vec3 twist(vec3 p, float k){ float c=cos(k*p.y), s=sin(k*p.y); return vec3(c*p.x - s*p.z, p.y, s*p.x + c*p.z); }
      float disp(vec3 p){
        float n = snoise(p*uFreq + uTime*.35);
        float n2 = snoise(p*uFreq*2.3 - uTime*.2)*.5;
        float sp = pow(abs(snoise(p*uFreq*1.7 + 3.0 + uTime*.15)), 3.0) * uSpike * 2.5;
        return (n + n2) * uAmp + sp + uPulse*.25*sin(uTime*20.0 + p.y*10.0);
      }
      void main(){
        vec3 p = twist(position, uTwist*.6*sin(uTime*.3));
        p += normal * disp(position + vec3(uMouse*.4, 0.0));
        float e=.01;
        vec3 t = normalize(cross(normal, vec3(0.0,1.0,.1)));
        vec3 b = normalize(cross(normal, t));
        vec3 pa = twist(position + t*e, uTwist*.6*sin(uTime*.3)); pa += normal*disp(position+t*e + vec3(uMouse*.4,0.0));
        vec3 pb = twist(position + b*e, uTwist*.6*sin(uTime*.3)); pb += normal*disp(position+b*e + vec3(uMouse*.4,0.0));
        vec3 n = normalize(cross(pa - p, pb - p));
        vD = disp(position);
        vN = normalize(normalMatrix * n);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA, uColorB, uPulseColor; uniform float uTime, uPulse;
      varying vec3 vN; varying vec3 vView; varying float vD;
      void main(){
        float fres = pow(1.0 - max(dot(vN, vView), 0.0), 2.2);
        float band = .5 + .5*sin(vD*9.0 + uTime*.8);
        vec3 col = mix(uColorA, uColorB, band);
        col = mix(col*.18, col, fres) + fres*.55;
        col += vec3(1.0)*pow(fres, 6.0)*.6;
        col = mix(col, uPulseColor, uPulse*.7);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, reduced ? 32 : 96), coreMat);
  scene.add(core);
  const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(2.05, 2), new THREE.MeshBasicMaterial({ color: 0x3cf0ff, wireframe: true, transparent: true, opacity: .07 }));
  core.add(wire);

  // ---- orbit rings ----
  const rings = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(2.3 + i * .35, .006, 8, 160), new THREE.MeshBasicMaterial({ color: i === 1 ? 0xff3ea5 : 0x3cf0ff, transparent: true, opacity: .35 }));
    r.rotation.set(Math.PI / 2 + i * .35, i * .5, 0);
    rings.add(r);
  }
  core.add(rings);

  // ---- particle galaxy ----
  const COUNT = reduced ? 2500 : (innerWidth < 800 ? 4000 : 9000);
  const pos = new Float32Array(COUNT * 3), seed = new Float32Array(COUNT), galaxy = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const r = 6 + Math.random() * 22, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th) * .6, r * Math.cos(ph) - 6], i * 3);
    const arm = i % 3, gr = Math.pow(Math.random(), .6) * 9 + .5, ang = gr * .9 + arm * (Math.PI * 2 / 3) + (Math.random() - .5) * .5;
    galaxy.set([Math.cos(ang) * gr, (Math.random() - .5) * .5 * (1 - gr / 10), Math.sin(ang) * gr - 2], i * 3);
    seed[i] = Math.random();
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute("aGalaxy", new THREE.BufferAttribute(galaxy, 3));
  pGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const pUni = { uTime: { value: 0 }, uMix: { value: 0 }, uPx: { value: renderer.getPixelRatio() }, uMouse: { value: new THREE.Vector3() }, uWarp: { value: 0 } };
  const pMat = new THREE.ShaderMaterial({
    uniforms: pUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime, uMix, uPx, uWarp; uniform vec3 uMouse;
      attribute vec3 aGalaxy; attribute float aSeed; varying float vSeed; varying float vGlow;
      void main(){
        vec3 p = mix(position, aGalaxy, uMix);
        float a = uTime*(.02 + aSeed*.04) * (1.0 + uMix*3.0);
        p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
        p.z += uWarp * (aSeed*12.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec3 toM = mv.xyz - uMouse; float d = length(toM.xy);
        mv.xy += normalize(toM.xy + 1e-4) * smoothstep(2.2, 0.0, d) * .9;
        vGlow = smoothstep(2.5, 0.0, d);
        vSeed = aSeed;
        gl_PointSize = (1.2 + aSeed*2.6 + vGlow*3.0) * uPx * (12.0 / -mv.z) * (1.0 + uWarp*2.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying float vSeed; varying float vGlow;
      void main(){
        float d = length(gl_PointCoord - .5); if (d > .5) discard;
        float tw = .55 + .45*sin(uTime*2.0 + vSeed*40.0);
        vec3 c = mix(vec3(.24,.94,1.0), vec3(1.0,.24,.65), vSeed);
        c = mix(c, vec3(1.0,.71,.28), step(.93, vSeed));
        gl_FragColor = vec4(c + vGlow*.6, (1.0 - d*2.0) * tw * (.6 + vGlow));
      }`,
  });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  // ---- state ----
  const target = { ...STAGES[0] }, cur = { ...STAGES[0] }, colA = new THREE.Color(), colB = new THREE.Color();
  let progress = 0, mode = "home", pulse = 0, warp = 0, warpT = 0, galaxyMix = 0;
  const mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
  addEventListener("pointermove", (e) => { mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1)); });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    camera.position.z = w < 800 ? 9 : 7;
  }
  addEventListener("resize", resize); resize();

  function lerpStage(p) {
    const n = STAGES.length - 1, f = Math.min(n, Math.max(0, p * n)), i = Math.min(n - 1, Math.floor(f)), t = f - i;
    const a = STAGES[i], b = STAGES[i + 1], s = t * t * (3 - 2 * t);
    for (const k of ["amp", "freq", "spike", "twist", "speed", "x", "y", "scale", "spin"]) target[k] = a[k] + (b[k] - a[k]) * s;
    target.ca = a.ca.map((v, j) => v + (b.ca[j] - v) * s); target.cb = a.cb.map((v, j) => v + (b.cb[j] - v) * s);
    galaxyMix = Math.max(0, Math.min(1, (p - .62) / .2)) * (p > .9 ? 1 - (p - .9) * 6 : 1);
  }
  lerpStage(0);

  const clock = new THREE.Clock();
  let running = true, rotY = 0;
  document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) { clock.getDelta(); loop(); } });
  function loop() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    const k = 1 - Math.pow(.02, dt);
    for (const key of ["amp", "freq", "spike", "twist", "speed", "x", "y", "scale", "spin"]) cur[key] += (target[key] - cur[key]) * k;
    cur.ca = cur.ca.map((v, j) => v + (target.ca[j] - v) * k); cur.cb = cur.cb.map((v, j) => v + (target.cb[j] - v) * k);
    mouseS.lerp(mouse, k * .8);
    uniforms.uTime.value += dt * (reduced ? .3 : 1) * (.6 + cur.speed);
    uniforms.uAmp.value = cur.amp; uniforms.uFreq.value = cur.freq; uniforms.uSpike.value = cur.spike; uniforms.uTwist.value = cur.twist;
    colA.setRGB(...cur.ca); colB.setRGB(...cur.cb); uniforms.uColorA.value.copy(colA); uniforms.uColorB.value.copy(colB);
    uniforms.uMouse.value.copy(mouseS);
    pulse = Math.max(0, pulse - dt * .8); uniforms.uPulse.value = pulse;
    const xs = innerWidth < 800 ? 0 : cur.x;
    core.position.x += (xs - core.position.x) * k; core.position.y += (cur.y - core.position.y) * k;
    core.scale.setScalar(cur.scale * (1 + pulse * .15));
    rotY += dt * cur.spin;
    core.rotation.y = rotY + mouseS.x * .4; core.rotation.x = mouseS.y * .3 + Math.sin(t * .2) * .1;
    rings.rotation.z += dt * (.1 + cur.spin * .3);
    wire.rotation.y -= dt * .05;
    if (warpT > 0) { warpT -= dt; warp = Math.sin(Math.min(1, 1 - warpT / 1.2) * Math.PI); } else warp = 0;
    pUni.uTime.value = t; pUni.uMix.value += (galaxyMix - pUni.uMix.value) * k * .6; pUni.uWarp.value = warp;
    const mw = new THREE.Vector3(mouseS.x, mouseS.y, .5).unproject(camera).sub(camera.position).normalize();
    pUni.uMouse.value.copy(mw.multiplyScalar(camera.position.z));
    pUni.uMouse.value.applyMatrix4(camera.matrixWorldInverse);
    camera.position.x += (mouseS.x * .35 - camera.position.x) * k * .5;
    camera.position.y += (mouseS.y * .25 - camera.position.y) * k * .5;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();

  return {
    setProgress(p) { progress = p; if (mode === "home") lerpStage(p); },
    setMode(m) {
      mode = m;
      if (m === "app") { Object.assign(target, APP_STAGE); galaxyMix = 0; } else lerpStage(progress);
    },
    pulse(kind = "good") {
      pulse = 1;
      uniforms.uPulseColor.value.set(kind === "bad" ? 0xff4d5e : kind === "warp" ? 0x8b5cff : 0x9dff6a);
      if (kind === "bad") { target.spike = 1.2; setTimeout(() => (mode === "app" ? Object.assign(target, APP_STAGE) : lerpStage(progress)), 900); }
    },
    warp() { warpT = 1.2; },
  };
}

/* Fallback when WebGL is not available: a light 2D starfield. */
export function createFallback(canvas) {
  const ctx = canvas.getContext("2d"); const stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() }));
  function frame(t) {
    canvas.width = innerWidth; canvas.height = innerHeight;
    ctx.fillStyle = "#05060f"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const g = ctx.createRadialGradient(canvas.width * .7, canvas.height * .45, 10, canvas.width * .7, canvas.height * .45, 300);
    g.addColorStop(0, "rgba(60,240,255,.35)"); g.addColorStop(.5, "rgba(255,62,165,.15)"); g.addColorStop(1, "transparent");
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const s of stars) { ctx.fillStyle = `rgba(255,255,255,${.3 + .7 * Math.abs(Math.sin(t / 900 + s.z * 9))})`; ctx.fillRect(s.x * canvas.width, s.y * canvas.height, 1 + s.z * 1.5, 1 + s.z * 1.5); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { setProgress() {}, setMode() {}, pulse() {}, warp() {} };
}
