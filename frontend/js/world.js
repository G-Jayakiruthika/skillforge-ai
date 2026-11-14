/*
 * world.js - "Skill World": a game map that shows WHERE you are on your journey.
 * Every skill on your roadmap is an island along a winding sea route.
 *   mastered  -> green island with a planted flag
 *   active    -> glowing island with your avatar ("YOU ARE HERE")
 *   unlocked  -> island you can sail to next
 *   locked    -> hidden under drifting fog
 *   remedial  -> an erupting volcano island next to the skill
 * The route ends at a castle: your dream company (or your target role).
 */
const COL = { mastered: "#9dff6a", active: "#3cf0ff", available: "#8b5cff", locked: "#3a4170", paused: "#ffb547", remedial: "#ff4d5e" };

function blob(cx, cy, r, seed) {
  // organic island outline from a few sine harmonics
  const pts = [];
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const rr = r * (1 + .12 * Math.sin(a * 3 + seed) + .08 * Math.sin(a * 5 + seed * 2) + .05 * Math.cos(a * 7 + seed));
    pts.push([cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr * .8]);
  }
  return "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(" ")).join(" L") + " Z";
}

export function renderWorld(host, ctx) {
  const { learner: L, esc } = ctx;
  const rm = L.roadmap || {}, nodes = (rm.nodes || []).filter((n) => !n.is_remedial), remedial = (rm.nodes || []).filter((n) => n.is_remedial);
  const W = 1400, H = 720, n = nodes.length;
  const pos = nodes.map((nd, i) => {
    const t = n > 1 ? i / (n - 1) : .5;
    return [140 + t * (W - 420), 360 + Math.sin(t * Math.PI * 2.2 + .6) * 190];
  });
  const castle = [W - 150, 300];
  const dream = L.match?.dream, goalName = dream ? dream.company : L.target_role, goalPct = dream ? dream.readiness : L.match?.readiness || 0;
  const doneUpTo = nodes.reduce((acc, nd, i) => (nd.status === "mastered" ? i : acc), -1);
  const activeIdx = Math.max(0, nodes.findIndex((nd) => ["active", "paused"].includes(nd.status) || nd.skill === rm.active));

  // sea route
  const route = [...pos, castle];
  let d = `M${route[0][0]} ${route[0][1]}`;
  for (let i = 1; i < route.length; i++) { const [x0, y0] = route[i - 1], [x1, y1] = route[i]; d += ` C ${x0 + 90} ${y0}, ${x1 - 90} ${y1}, ${x1} ${y1}`; }
  let dDone = `M${route[0][0]} ${route[0][1]}`;
  for (let i = 1; i <= Math.min(activeIdx, route.length - 1); i++) { const [x0, y0] = route[i - 1], [x1, y1] = route[i]; dDone += ` C ${x0 + 90} ${y0}, ${x1 - 90} ${y1}, ${x1} ${y1}`; }

  const islands = nodes.map((nd, i) => {
    const [x, y] = pos[i], st = nd.status, c = COL[st] || COL.locked, r = 52 + (nd.in_role ? 6 : 0), seed = i * 1.7 + 1;
    const pct = nd.required ? Math.min(100, Math.round((nd.current / nd.required) * 100)) : 0;
    const fog = st === "locked";
    const flag = st === "mastered" ? `<g transform="translate(${x + 8} ${y - 58})"><line x1="0" y1="0" x2="0" y2="42" stroke="#eef1ff" stroke-width="3"/><path d="M0 0 L30 8 L0 18 Z" fill="${c}"><animate attributeName="d" dur="1.6s" repeatCount="indefinite" values="M0 0 L30 8 L0 18 Z;M0 0 L28 12 L0 18 Z;M0 0 L30 8 L0 18 Z"/></path></g>` : "";
    const trees = [0, 1, 2].map((k) => `<path d="M${x - 30 + k * 26} ${y - 6 - (k % 2) * 8} l9 -22 l9 22 z" fill="${fog ? "#2a2f55" : "#0f5f4a"}" opacity=".9"/>`).join("");
    return `<g class="isle ${st}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(nd.skill)} — ${st}" data-cursor="${fog ? "Locked" : "Visit"}">
      <ellipse cx="${x}" cy="${y + 26}" rx="${r * 1.45}" ry="${r * .5}" fill="rgba(60,240,255,.08)"><animate attributeName="rx" dur="3s" repeatCount="indefinite" values="${r * 1.4};${r * 1.6};${r * 1.4}"/></ellipse>
      <path d="${blob(x, y + 10, r * .98, seed)}" fill="#c9a56b" opacity=".9"/>
      <path d="${blob(x, y, r * .86, seed)}" fill="${fog ? "#232849" : st === "mastered" ? "#1f7a4d" : st === "remedial" || st === "paused" ? "#5a2a2f" : "#255f73"}" stroke="${c}" stroke-width="${st === "active" ? 4 : 2}"/>
      ${trees}${flag}
      <text x="${x}" y="${y + r * .95 + 22}" text-anchor="middle" font-size="17" font-weight="700" fill="#eef1ff">${esc(nd.skill)}</text>
      <text x="${x}" y="${y + r * .95 + 42}" text-anchor="middle" font-size="12" fill="${c}" font-family="JetBrains Mono, monospace">${st === "mastered" ? "CONQUERED ✓" : fog ? "UNDISCOVERED" : `${pct}% · ~${nd.est_hours}h`}</text>
      ${fog ? `<g class="fog">${[0, 1, 2].map((k) => `<ellipse cx="${x - 30 + k * 30}" cy="${y - 4 + (k % 2) * 10}" rx="46" ry="24" fill="rgba(200,210,255,.18)"><animate attributeName="cx" dur="${6 + k}s" repeatCount="indefinite" values="${x - 34 + k * 30};${x - 20 + k * 30};${x - 34 + k * 30}"/></ellipse>`).join("")}</g>` : ""}
    </g>`;
  }).join("");

  const volcanoes = remedial.map((rn) => {
    const i = nodes.findIndex((nd) => nd.skill === rn.skill); if (i < 0) return "";
    const [x, y] = pos[i], vx = x - 60, vy = y - 110;
    return `<g class="volcano" data-skill="${esc(rn.skill)}" data-cursor="Remedial"><path d="M${vx - 40} ${vy + 40} L${vx - 10} ${vy} L${vx + 10} ${vy} L${vx + 40} ${vy + 40} Z" fill="#5a2a2f" stroke="#ff4d5e" stroke-width="2"/>
      ${[0, 1, 2].map((k) => `<circle cx="${vx}" cy="${vy}" r="${6 + k * 3}" fill="rgba(255,77,94,.5)"><animate attributeName="cy" dur="${1.5 + k * .4}s" repeatCount="indefinite" values="${vy};${vy - 50};${vy}"/><animate attributeName="opacity" dur="${1.5 + k * .4}s" repeatCount="indefinite" values="1;0;1"/></circle>`).join("")}
      <text x="${vx}" y="${vy - 14}" text-anchor="middle" font-size="11" fill="#ff4d5e" font-family="JetBrains Mono, monospace">REMEDIAL LAB</text></g>`;
  }).join("");

  const [ax, ay] = pos[activeIdx] || pos[0] || [200, 360];
  const avatar = `<g class="avatar-me" transform="translate(${ax} ${ay - 66})"><g><animateTransform attributeName="transform" type="translate" dur="1.4s" repeatCount="indefinite" values="0 0;0 -8;0 0"/>
      <circle r="18" fill="url(#avg)" stroke="#fff" stroke-width="2"/><text y="6" text-anchor="middle" font-size="17" font-weight="700" fill="#05060f">${esc((L.name || "?")[0])}</text>
      <path d="M-8 18 L0 30 L8 18 Z" fill="#fff"/></g>
      <g transform="translate(0 -40)"><rect x="-56" y="-14" width="112" height="22" rx="11" fill="#eef1ff"/><text y="2" text-anchor="middle" font-size="11" font-weight="700" fill="#05060f" font-family="JetBrains Mono, monospace">YOU ARE HERE</text></g></g>`;

  host.innerHTML = `
  <div class="world-hud">
    <div class="hud-card"><span class="small muted">EXPLORER</span><b>${esc(L.name)}</b><span class="small">${esc(L.target_role)}</span></div>
    <div class="hud-card"><span class="small muted">ISLANDS CONQUERED</span><b>${nodes.filter((x) => x.status === "mastered").length} / ${n}</b><div class="meter"><span style="width:${rm.milestones_done_pct || 0}%"></span></div></div>
    <div class="hud-card"><span class="small muted">VOYAGE LEFT</span><b>${rm.hours_remaining || 0}h · ${rm.eta_weeks || 0} wks</b></div>
    <div class="hud-card goal"><span class="small muted">DESTINATION 🏰</span><b>${esc(goalName)}</b><div class="meter"><span style="width:${goalPct}%;background:linear-gradient(90deg,#ffb547,#ff3ea5)"></span></div><span class="small">${goalPct}% ready</span></div>
  </div>
  <div class="world-wrap"><svg class="world" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Skill World map">
    <defs>
      <radialGradient id="sea" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="#10204a"/><stop offset="1" stop-color="#05060f"/></radialGradient>
      <linearGradient id="avg"><stop offset="0" stop-color="#3cf0ff"/><stop offset="1" stop-color="#ff3ea5"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sea)"/>
    ${Array.from({ length: 12 }, (_, k) => `<path d="M0 ${60 + k * 56} q 40 -10 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0" fill="none" stroke="rgba(60,240,255,.06)" stroke-width="2"><animateTransform attributeName="transform" type="translate" dur="${8 + (k % 4) * 2}s" repeatCount="indefinite" values="0 0;-80 0"/></path>`).join("")}
    ${Array.from({ length: 40 }, (_, k) => `<circle cx="${(k * 97) % W}" cy="${(k * 53) % H}" r="${1 + (k % 3) * .6}" fill="#fff" opacity=".35"><animate attributeName="opacity" dur="${2 + (k % 5)}s" repeatCount="indefinite" values=".1;.6;.1"/></circle>`).join("")}
    <path d="${d}" fill="none" stroke="rgba(238,241,255,.25)" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>
    <path d="${dDone}" fill="none" stroke="#ffb547" stroke-width="4" stroke-linecap="round" filter="url(#glow)" pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:1;animation:drawLine 2.4s .3s cubic-bezier(.22,1,.36,1) forwards"/>
    <g><path d="M-14 0 L14 0 L9 9 L-9 9 Z" fill="#c9a56b"/><path d="M0 -22 L0 0 M0 -22 L13 -6 L0 -6" stroke="#eef1ff" stroke-width="2" fill="#eef1ff"/>
      <animateMotion dur="26s" repeatCount="indefinite" rotate="0" path="${d}"/></g>
    ${islands}${volcanoes}
    <g class="castle" transform="translate(${castle[0]} ${castle[1]})" data-cursor="Goal">
      <ellipse cx="0" cy="70" rx="110" ry="34" fill="#1f3f5e"/>
      <rect x="-60" y="-10" width="120" height="80" fill="#2b2f5c" stroke="#ffb547" stroke-width="2"/>
      ${[-60, -20, 20, 60].map((x) => `<rect x="${x - 12}" y="-40" width="24" height="34" fill="#353a73" stroke="#ffb547" stroke-width="1.5"/><path d="M${x - 14} -40 L${x} -62 L${x + 14} -40 Z" fill="#ff3ea5"/>`).join("")}
      <rect x="-14" y="30" width="28" height="40" rx="14" fill="#05060f"/>
      <line x1="0" y1="-62" x2="0" y2="-100" stroke="#eef1ff" stroke-width="2"/><path d="M0 -100 L30 -92 L0 -84 Z" fill="#ffb547"><animate attributeName="d" dur="1.4s" repeatCount="indefinite" values="M0 -100 L30 -92 L0 -84 Z;M0 -100 L26 -88 L0 -84 Z;M0 -100 L30 -92 L0 -84 Z"/></path>
      <text y="104" text-anchor="middle" font-size="18" font-weight="700" fill="#eef1ff">${esc(goalName)}</text>
      <text y="124" text-anchor="middle" font-size="12" fill="#ffb547" font-family="JetBrains Mono, monospace">${goalPct}% READY</text></g>
    ${avatar}
  </svg>
  <div class="world-panel glass" id="world-panel" hidden></div></div>`;

  const panel = host.querySelector("#world-panel");
  const open = (i) => {
    const nd = nodes[i]; if (!nd) return;
    ctx.sound.play("click");
    const fog = nd.status === "locked";
    panel.hidden = false;
    panel.innerHTML = `<button class="icon-btn close" data-cursor="Close">✕</button>
      <span class="badge" style="color:${COL[nd.status]}">${nd.status.toUpperCase()}</span>
      <h3 style="font-size:22px;margin:6px 0">${esc(nd.skill)}</h3>
      <p class="small muted">${fog ? `Undiscovered — first conquer: ${(nd.prerequisites || []).map((p) => esc(p.replace("|", " or "))).join(", ")}` : `Your level ${nd.current} / ${nd.required} needed · ~${nd.est_hours}h of study`}</p>
      ${(nd.resources || []).slice(0, 2).map((r) => `<div class="res"><span class="rt">${esc(r.type)}</span><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)} ↗</a></div>`).join("")}
      <div class="row" style="margin-top:12px"><a class="btn primary sm" href="arena.html" data-cursor="Battle" ${fog ? 'style="pointer-events:none;opacity:.4"' : ""}>⚔ Battle in Arena</a><a class="btn ghost sm" href="learn.html" data-cursor="Train">📚 Train</a></div>`;
    panel.querySelector(".close").onclick = () => (panel.hidden = true);
  };
  host.querySelectorAll(".isle").forEach((g) => { g.onclick = () => open(+g.dataset.i); g.onkeydown = (e) => e.key === "Enter" && open(+g.dataset.i); });
  host.querySelectorAll(".volcano").forEach((g) => (g.onclick = () => open(nodes.findIndex((nd) => nd.skill === g.dataset.skill))));
  host.querySelector(".castle").onclick = () => { location.href = "career.html"; };
}
