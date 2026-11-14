/*
 * voice.js - "Sage", the voice agent. Press the mic (or Alt+V), speak, and it answers aloud.
 *
 * It can:  open any page ("open career matching", "go to skill world")
 *          answer about your plan ("what should I study", "how ready am I", "what is my next step")
 *          read the page to you ("read this page")  - useful for low vision
 *          change the display ("dark mode", "bigger text", "minimal style")
 *          pass anything else to the AI Mentor
 * Uses the browser's Web Speech API (Chrome / Edge). Where speech input is missing, the same
 * panel works by typing, and replies are still spoken when speech output exists.
 */
import { dollHtml, mountAll } from "./avatars.js";
import * as theme from "./theme.js";

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;
const PAGES = [
  [["dashboard", "home page", "cockpit"], "app.html", "Dashboard"], [["profile", "my details"], "profile.html", "User Profile"],
  [["analysis", "strength", "weakness"], "analysis.html", "Skill Analysis"], [["career", "compan", "job match"], "career.html", "Career Matching"],
  [["learning", "roadmap", "learn path", "resources"], "learn.html", "Learning Path"], [["world", "map"], "world.html", "Skill World"],
  [["arena", "quiz"], "arena.html", "Skill Arena"], [["game"], "games.html", "Games"], [["compete", "leaderboard", "ranking"], "compete.html", "Compete"],
  [["progress", "achievement"], "progress.html", "Progress"], [["mentor", "chat"], "mentor.html", "AI Mentor"], [["agent", "doll", "avatar"], "agents.html", "Meet the agents"],
  [["college", "universit"], "colleges.html", "Colleges"], [["city", "state", "district", "place"], "places.html", "Places"], [["browse", "dropdown", "find student"], "browse.html", "Browse students"],
  [["faculty portal", "my students"], "portal.html", "Faculty portal"], [["faculty", "teacher", "professor"], "faculty.html", "Faculty"],
  [["sign up", "signup", "register", "create account"], "signup.html", "Sign up"], [["sign in", "login", "log in"], "login.html", "Sign in"],
  [["about"], "about.html", "About"], [["contact", "message us"], "contact.html", "Contact"], [["guide", "help", "how to use"], "guide.html", "Guide"],
];

export function initVoice(ctx) {
  // ctx: { getLearner, ask(question)->Promise<string>, go(href,label), toast }
  let rec = null, listening = false, speakOn = true, doll = null;
  try { speakOn = localStorage.getItem("sf-voice-speak") !== "0"; } catch (_) {}
  const fab = Object.assign(document.createElement("button"), { id: "voice-fab", innerHTML: "🎙" });
  fab.setAttribute("aria-label", "Voice agent"); fab.dataset.tip = "Voice agent — click (or Alt+V) and speak a question or a command"; fab.dataset.cursor = "Talk";
  const panel = Object.assign(document.createElement("aside"), { id: "voice-panel", className: "glass", hidden: true });
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Voice agent");
  panel.innerHTML = `<div class="v-row" style="align-items:center">${dollHtml("mentor", 64)}<div style="flex:1"><b>Sage · voice agent</b><div class="small muted" id="voice-status">${SR ? "Press the mic and speak" : "Type below — voice input needs Chrome or Edge"}</div></div>
      <button class="icon-btn" id="voice-mute" data-tip="Turn spoken replies on or off" aria-label="Toggle spoken replies">${speakOn ? "🔊" : "🔇"}</button><button class="icon-btn" id="voice-close" aria-label="Close voice agent">✕</button></div>
    <div id="voice-log" aria-live="polite"></div>
    <div class="chips" style="margin:0 0 8px">${["What should I study?", "How ready am I?", "Read this page", "Open Skill World", "Bigger text"].map((q) => `<button class="chip" data-vq="${q}">${q}</button>`).join("")}</div>
    <div class="v-row"><input id="voice-text" placeholder="…or type here" aria-label="Type a question or command"><button class="btn primary sm" id="voice-send">Send</button></div>`;
  document.body.append(fab, panel);
  doll = mountAll(panel).mentor;
  const log = panel.querySelector("#voice-log"), status = panel.querySelector("#voice-status");

  function say(text) {
    const d = document.createElement("div"); d.className = "v-ai"; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight;
    doll?.play("talk", Math.min(9000, 900 + text.length * 55));
    if (speakOn && synth) {
      synth.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = "en-IN"; u.rate = 1; u.pitch = 1.05;
      const v = synth.getVoices().find((x) => /en-IN/i.test(x.lang)) || synth.getVoices().find((x) => /^en/i.test(x.lang)); if (v) u.voice = v;
      synth.speak(u);
    }
  }
  const heard = (text) => { const d = document.createElement("div"); d.className = "v-me"; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; };

  async function handle(raw) {
    const text = String(raw || "").trim(); if (!text) return;
    heard(text); const q = text.toLowerCase(); const L = ctx.getLearner();
    // 1. display commands
    if (/\b(dark|night)\b/.test(q) && /mode|theme|turn|switch|make/.test(q)) { theme.set("mode", "dark"); return say("Dark mode is on."); }
    if (/\b(light|bright|day)\b/.test(q) && /mode|theme|turn|switch|make/.test(q)) { theme.set("mode", "light"); return say("Bright mode is on."); }
    if (/(bigger|larger|increase|zoom in).*(text|font)|text.*(bigger|larger)/.test(q)) { const o = ["1", "1.15", "1.3", "1.5"], i = Math.min(3, o.indexOf(theme.settings().text) + 1); theme.set("text", o[i]); return say("I made the text bigger."); }
    if (/(smaller|decrease|zoom out).*(text|font)|text.*smaller/.test(q)) { const o = ["1", "1.15", "1.3", "1.5"], i = Math.max(0, o.indexOf(theme.settings().text) - 1); theme.set("text", o[i]); return say("I made the text smaller."); }
    if (/high contrast/.test(q)) { theme.set("contrast", /off|normal|disable/.test(q) ? "normal" : "high"); return say("Contrast updated."); }
    if (/minimal|simple (style|design|look)/.test(q)) { theme.set("style", "minimal"); return say("Minimal style is on."); }
    if (/immersive|animated (style|design)|3d (style|look)/.test(q)) { theme.set("style", "immersive"); return say("Immersive style is on."); }
    if (/(stop|reduce|less) (motion|animation)/.test(q)) { theme.set("motion", "reduced"); return say("Motion reduced."); }
    // 2. read the page
    if (/read (this|the) page|read (it )?(out|aloud)|what('s| is) on (this|the) page/.test(q)) {
      const main = document.querySelector("#page") || document.querySelector("main");
      const h = main?.querySelector("h1")?.innerText || document.title;
      const bits = [...(main?.querySelectorAll(".note li, .stat, .mentor-msg, .card h3") || [])].slice(0, 12).map((e) => e.innerText.replace(/\s+/g, " ").trim()).filter(Boolean);
      return say(`${h}. ${bits.join(". ").slice(0, 900)}`);
    }
    // 3. navigation
    if (/\b(open|go to|goto|show|take me to|navigate|visit)\b/.test(q) || /page$/.test(q)) {
      const hit = PAGES.find(([keys]) => keys.some((k) => q.includes(k)));
      if (hit) { say(`Opening ${hit[2]}.`); return setTimeout(() => ctx.go(hit[1], hit[2]), 900); }
    }
    if (/stop|quiet|silence|shut up/.test(q)) { synth?.cancel(); return; }
    // 4. questions about the learner's plan
    if (L) {
      const m = L.match || {}, rm = L.roadmap || {};
      if (/how ready|readiness|my score|where am i|my progress/.test(q)) return say(`You are ${m.readiness} percent ready for ${m.role}. You have met ${(m.matched || []).length} of ${(m.skills || []).length} skills. ${m.dream ? `For ${m.dream.company} you are ${m.dream.readiness} percent ready.` : ""}`);
      if (/next step|what next|what should i (do|study|learn)|study now/.test(q)) return say(rm.active ? `Your next step is ${rm.active}. ${(L.mentor?.next_actions || [])[0] || ""}` : "You have mastered every milestone. Well done!");
      if (/missing|gap|weak/.test(q)) return say(`Missing skills: ${(m.missing || []).join(", ") || "none"}. To strengthen: ${(L.analysis?.weaknesses || []).map((w) => w.skill).join(", ") || "none"}.`);
      if (/dream company|company/.test(q) && m.dream) return say(`For ${m.dream.company} as ${m.dream.role} you are ${m.dream.readiness} percent ready. Work on ${m.dream.gaps.join(", ") || "verifying your skills"}. Their usual process is ${m.dream.process}.`);
      if (/who am i|my name|my goal/.test(q)) return say(`You are ${L.name}, aiming to be a ${m.role}${L.institution ? ` at ${L.institution}` : ""}.`);
    }
    if (/what can you do|help|commands/.test(q)) return say("You can ask: what should I study, how ready am I, read this page, open career matching, dark mode, or bigger text. Anything else goes to the AI Mentor.");
    // 5. everything else -> mentor
    if (!L) return say("Create a learner profile first, then I can answer about your plan.");
    doll?.set("think"); status.textContent = "Thinking…";
    try { say(await ctx.ask(text)); } catch (e) { say("Sorry, I could not answer that."); }
    doll?.set("idle"); status.textContent = SR ? "Press the mic and speak" : "Type below";
  }

  function start() {
    if (!SR) { panel.hidden = false; panel.querySelector("#voice-text").focus(); return; }
    if (listening) { rec?.stop(); return; }
    synth?.cancel();
    rec = new SR(); rec.lang = "en-IN"; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onstart = () => { listening = true; fab.classList.add("listening"); status.textContent = "Listening…"; panel.hidden = false; };
    rec.onresult = (e) => handle(e.results[0][0].transcript);
    rec.onerror = (e) => { status.textContent = e.error === "not-allowed" ? "Microphone is blocked — allow it in the address bar, or type below." : "I didn't catch that. Try again or type below."; };
    rec.onend = () => { listening = false; fab.classList.remove("listening"); if (status.textContent === "Listening…") status.textContent = "Press the mic and speak"; };
    try { rec.start(); } catch (_) {}
  }

  let greeted = false;
  fab.onclick = () => { if (panel.hidden) { panel.hidden = false; if (!greeted) { greeted = true; say("Hi, I'm Sage. Ask me about your plan, or tell me which page to open."); } } start(); };
  panel.querySelector("#voice-close").onclick = () => { panel.hidden = true; rec?.stop(); synth?.cancel(); };
  panel.querySelector("#voice-mute").onclick = (e) => { speakOn = !speakOn; e.currentTarget.textContent = speakOn ? "🔊" : "🔇"; if (!speakOn) synth?.cancel(); try { localStorage.setItem("sf-voice-speak", speakOn ? "1" : "0"); } catch (_) {} };
  const send = () => { const i = panel.querySelector("#voice-text"); handle(i.value); i.value = ""; };
  panel.querySelector("#voice-send").onclick = send;
  panel.querySelector("#voice-text").onkeydown = (e) => e.key === "Enter" && send();
  panel.querySelectorAll("[data-vq]").forEach((b) => (b.onclick = () => handle(b.dataset.vq)));
  document.addEventListener("keydown", (e) => { if (e.altKey && e.key.toLowerCase() === "v") { e.preventDefault(); fab.click(); } });
  return { say, handle };
}
