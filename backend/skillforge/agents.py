"""
agents.py - the specialised agents of SkillForge AI.

Every agent is a plain function  state -> partial state update  so it can run
inside LangGraph (graph.py) or the built-in fallback runner. The shared state
is:

    {"learner": {...profile, history and derived results...},
     "event":   {"type": "profile" | "assess" | "pivot" | "progress", ...},
     "trace":   [ {ts, agent, to, msg}, ... ]}   # agent-to-agent message log

Agents:
  Supervisor        routes each event to the right agent chain
  Profiler          normalises skills, certifications, projects -> proficiency
  Skill Analyst     strengths, weaknesses, weak concepts
  Career Matcher    gap vs target role + readiness for every role
  Path Architect    prerequisite DAG, active milestone, weekly schedule + ETA
  Resource Curator  courses / tutorials / practice / project per milestone
  Assessor          grades quizzes and spoken/written explanations
  Mentor            guidance message + next actions, adapts after each event
"""
from __future__ import annotations

import math
import re
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from . import llm
from .knowledge import (
    ESCO_CODES, LEVEL_SCORES, MASTERY_PASS, PREREQUISITES, ROLE_BENCHMARKS,
    ROLE_DESCRIPTIONS, SKILLS, SYNONYMS, WORKING_LEVEL, skill_hours,
)

State = Dict[str, Any]


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _say(state: State, agent: str, msg: str, to: str = "") -> List[Dict[str, str]]:
    trace = list(state.get("trace", []))
    trace.append({"ts": now_iso(), "agent": agent, "to": to, "msg": msg})
    return trace


def normalize_skill(raw: str) -> Tuple[Optional[str], Optional[str]]:
    """'basic HTML' -> ('HTML/CSS', 'beginner');  'py' -> ('Python', None)."""
    text = re.sub(r"\s+", " ", (raw or "").strip().lower())
    if not text:
        return None, None
    level = None
    for word, lvl in (("basic", "beginner"), ("beginner", "beginner"), ("intermediate", "intermediate"),
                      ("advanced", "advanced"), ("expert", "expert")):
        if re.search(rf"\b{word}\b", text):
            level = lvl
            text = re.sub(rf"\b{word}\b", "", text).strip()
    if text in SYNONYMS:
        return SYNONYMS[text], level
    for canon in SKILLS:
        if canon.lower() == text:
            return canon, level
    return None, level


_SYN_PATTERNS = sorted(SYNONYMS.items(), key=lambda kv: -len(kv[0]))


def extract_skills(text: str) -> List[str]:
    """Find taxonomy skills mentioned anywhere in free text (resume, project...)."""
    low = " " + (text or "").lower() + " "
    found: List[str] = []
    for syn, canon in _SYN_PATTERNS:
        if len(syn) <= 2 and syn not in ("js", "ts", "py"):
            continue
        if re.search(rf"(?<![a-z0-9.]){re.escape(syn)}(?![a-z0-9])", low) and canon not in found:
            found.append(canon)
    return found


def prereq_options(skill: str) -> List[List[str]]:
    """Each entry is a group; one skill of the group satisfies it ('A|B')."""
    return [p.split("|") for p in PREREQUISITES.get(skill, [])]


def prereqs_met(skill: str, prof: Dict[str, int]) -> bool:
    return all(any(prof.get(p, 0) >= WORKING_LEVEL for p in grp) for grp in prereq_options(skill))


def topological(skills: Iterable[str]) -> List[Tuple[str, int]]:
    """Kahn's algorithm. Returns (skill, depth) with prerequisites first."""
    skills = list(dict.fromkeys(skills))
    sset = set(skills)
    indeg = {s: 0 for s in skills}
    adj: Dict[str, List[str]] = defaultdict(list)
    for s in skills:
        for grp in prereq_options(s):
            for p in grp:
                if p in sset:
                    adj[p].append(s)
                    indeg[s] += 1
    depth = {s: 0 for s in skills}
    q = deque(s for s in skills if indeg[s] == 0)
    out: List[Tuple[str, int]] = []
    while q:
        n = q.popleft()
        out.append((n, depth[n]))
        for m in adj[n]:
            depth[m] = max(depth[m], depth[n] + 1)
            indeg[m] -= 1
            if indeg[m] == 0:
                q.append(m)
    for s in skills:  # cycles (shouldn't happen) - append anyway
        if s not in dict(out):
            out.append((s, 0))
    return out


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ---------------------------------------------------------------------------
# Supervisor
# ---------------------------------------------------------------------------
ROUTES = {
    "profile": "profiler",
    "assess": "assessor",
    "pivot": "skill_analyst",
    "progress": "path_architect",
}


def supervisor_agent(state: State) -> State:
    learner = dict(state["learner"])
    event = state.get("event", {}) or {}
    etype = event.get("type", "profile")
    note = ""
    if etype == "pivot":
        old = learner.get("target_role")
        new = event.get("target_role") or old
        learner["previous_role"] = old
        learner["target_role"] = new
        learner.setdefault("role_history", []).append({"ts": now_iso(), "role": new})
        note = f"Career goal changed '{old}' -> '{new}'. Mastered skills are kept."
    elif etype == "progress":
        entry = {"ts": now_iso(), "skill": event.get("skill"), "hours": float(event.get("hours") or 0),
                 "note": event.get("note", "")}
        learner.setdefault("study_log", []).append(entry)
        note = f"Logged {entry['hours']:g}h on {entry['skill']}."
    elif etype == "assess":
        note = f"Assessment received for '{event.get('skill')}' ({event.get('mode', 'quiz')})."
    else:
        note = "Profile received - running full diagnosis."
    target = ROUTES.get(etype, "profiler")
    trace = _say(state, "Supervisor", f"{note} Routing to {target.replace('_', ' ').title()}.", to=target)
    return {"learner": learner, "trace": trace}


def route_from_supervisor(state: State) -> str:
    return ROUTES.get((state.get("event") or {}).get("type", "profile"), "profiler")


# ---------------------------------------------------------------------------
# Profiler
# ---------------------------------------------------------------------------
def profiler_agent(state: State) -> State:
    learner = dict(state["learner"])
    evidence: Dict[str, Dict[str, Any]] = {}
    unknown: List[str] = []
    mappings: List[str] = []

    def bump(skill: str, base: int, src: str) -> None:
        e = evidence.setdefault(skill, {"base": 0, "certs": 0, "projects": 0, "sources": []})
        e["base"] = max(e["base"], base)
        e["sources"].append(src)

    for item in learner.get("skills", []):
        raw = item.get("name", "") if isinstance(item, dict) else str(item)
        lvl_in = (item.get("level") if isinstance(item, dict) else None) or ""
        canon, lvl_txt = normalize_skill(raw)
        if not canon:
            if raw.strip():
                unknown.append(raw.strip())
            continue
        lvl = (lvl_txt or lvl_in or "intermediate").lower()
        bump(canon, LEVEL_SCORES.get(lvl, 45), f"self-rated {lvl}")
        if raw.strip().lower() != canon.lower():
            mappings.append(f"'{raw.strip()}' -> {canon}")

    for cert in learner.get("certifications", []):
        text = f"{cert.get('name', '')} {' '.join(cert.get('skills', []))}"
        for s in extract_skills(text):
            e = evidence.setdefault(s, {"base": 35, "certs": 0, "projects": 0, "sources": []})
            e["base"] = max(e["base"], 35)
            e["certs"] += 1
            e["sources"].append(f"certification: {cert.get('name')}")

    for proj in learner.get("projects", []):
        text = f"{proj.get('name', '')} {proj.get('description', '')} {' '.join(proj.get('skills', []))}"
        for s in extract_skills(text):
            e = evidence.setdefault(s, {"base": 35, "certs": 0, "projects": 0, "sources": []})
            e["base"] = max(e["base"], 35)
            e["projects"] += 1
            e["sources"].append(f"project: {proj.get('name')}")

    verified: Dict[str, float] = learner.get("verified", {})
    proficiency: Dict[str, Dict[str, Any]] = {}
    for skill in set(evidence) | set(verified):
        e = evidence.get(skill, {"base": 0, "certs": 0, "projects": 0, "sources": []})
        claimed = min(85, e["base"] + min(15, 10 * e["certs"]) + min(16, 8 * e["projects"]))
        if skill in verified:
            score, confidence = round(verified[skill]), "verified"
        else:
            score = claimed
            confidence = "evidence" if (e["certs"] or e["projects"]) else "self-reported"
        proficiency[skill] = {"score": int(score), "claimed": int(claimed), "confidence": confidence,
                              "sources": e["sources"], "esco": ESCO_CODES.get(skill, "ESCO:custom")}

    learner["proficiency"] = proficiency
    learner["unmapped_skills"] = unknown
    msg = f"Normalised {len(proficiency)} skills to the ESCO taxonomy"
    if mappings:
        msg += f" ({', '.join(mappings[:6])})"
    if unknown:
        msg += f". Not in taxonomy yet: {', '.join(unknown)}"
    trace = _say(state, "Profiler", msg + ".", to="skill_analyst")
    return {"learner": learner, "trace": trace}


# ---------------------------------------------------------------------------
# Skill Analyst
# ---------------------------------------------------------------------------
def skill_analyst_agent(state: State) -> State:
    learner = dict(state["learner"])
    prof = learner.get("proficiency", {})
    bench = ROLE_BENCHMARKS.get(learner.get("target_role"), {})
    last_missed: Dict[str, List[str]] = {}
    for a in learner.get("assessments", []):
        last_missed[a["skill"]] = a.get("missed_concepts", [])

    strengths, weaknesses, unverified = [], [], []
    for skill, p in sorted(prof.items(), key=lambda kv: -kv[1]["score"]):
        req = bench.get(skill)
        if p["score"] >= 70 or (req and p["score"] >= req):
            strengths.append({"skill": skill, "score": p["score"], "confidence": p["confidence"]})
        elif req:
            weaknesses.append({"skill": skill, "score": p["score"], "required": req, "gap": req - p["score"],
                               "missed_concepts": last_missed.get(skill, [])})
        if p["confidence"] != "verified" and skill in bench:
            unverified.append(skill)
    # weak concepts across all assessments that are still below pass
    weak_concepts = [{"skill": s, "concepts": c} for s, c in last_missed.items()
                     if c and prof.get(s, {}).get("score", 0) < bench.get(s, MASTERY_PASS)]

    learner["analysis"] = {"strengths": strengths, "weaknesses": weaknesses,
                           "unverified": unverified, "weak_concepts": weak_concepts}
    msg = (f"Strengths: {', '.join(s['skill'] for s in strengths) or 'none yet'}. "
           f"Below role level: {', '.join(w['skill'] for w in weaknesses) or 'none'}.")
    if unverified:
        msg += f" Self-reported, needs verification: {', '.join(unverified)}."
    return {"learner": learner, "trace": _say(state, "Skill Analyst", msg, to="career_matcher")}


# ---------------------------------------------------------------------------
# Career Matcher
# ---------------------------------------------------------------------------
def _readiness(bench: Dict[str, int], prof: Dict[str, Dict[str, Any]]) -> int:
    total = sum(bench.values()) or 1
    have = sum(min(prof.get(s, {}).get("score", 0), req) for s, req in bench.items())
    return round(100 * have / total)


def career_matcher_agent(state: State) -> State:
    learner = dict(state["learner"])
    role = learner.get("target_role") or "Full Stack Developer"
    if role not in ROLE_BENCHMARKS:
        role = "Full Stack Developer"
        learner["target_role"] = role
    bench = ROLE_BENCHMARKS[role]
    prof = learner.get("proficiency", {})

    rows = []
    for skill, req in bench.items():
        cur = prof.get(skill, {}).get("score", 0)
        status = "met" if cur >= req else ("partial" if cur > 0 else "missing")
        rows.append({"skill": skill, "required": req, "current": cur, "gap": max(0, req - cur), "status": status,
                     "confidence": prof.get(skill, {}).get("confidence", "none")})
    ranking = sorted(({"role": r, "readiness": _readiness(b, prof), "description": ROLE_DESCRIPTIONS.get(r, "")}
                      for r, b in ROLE_BENCHMARKS.items()), key=lambda x: -x["readiness"])
    transferable = []
    prev = learner.get("previous_role")
    if prev and prev != role:
        transferable = [r["skill"] for r in rows if r["status"] == "met"]

    learner["match"] = {
        "role": role,
        "description": ROLE_DESCRIPTIONS.get(role, ""),
        "readiness": _readiness(bench, prof),
        "skills": rows,
        "matched": [r["skill"] for r in rows if r["status"] == "met"],
        "partial": [r["skill"] for r in rows if r["status"] == "partial"],
        "missing": [r["skill"] for r in rows if r["status"] == "missing"],
        "role_ranking": ranking,
        "transferable": transferable,
    }
    m = learner["match"]
    msg = (f"{role}: readiness {m['readiness']}%. Met [{', '.join(m['matched'])}] | "
           f"Partial [{', '.join(m['partial'])}] | Missing [{', '.join(m['missing'])}]. "
           f"Closest role overall: {ranking[0]['role']} ({ranking[0]['readiness']}%).")
    return {"learner": learner, "trace": _say(state, "Career Matcher", msg, to="path_architect")}


# ---------------------------------------------------------------------------
# Path Architect
# ---------------------------------------------------------------------------
def _logged_hours(learner: Dict[str, Any]) -> Dict[str, float]:
    out: Dict[str, float] = defaultdict(float)
    for e in learner.get("study_log", []):
        out[e.get("skill")] += float(e.get("hours") or 0)
    return out


def path_architect_agent(state: State) -> State:
    learner = dict(state["learner"])
    role = learner.get("target_role")
    bench = dict(ROLE_BENCHMARKS.get(role, {}))
    prof_scores = {s: p["score"] for s, p in learner.get("proficiency", {}).items()}
    remedial = learner.get("remedial", {})
    logged = _logged_hours(learner)

    # pull in prerequisites that are outside the role but not yet met
    needed = dict(bench)
    for skill in list(bench):
        for grp in prereq_options(skill):
            if not any(p in needed for p in grp) and not any(prof_scores.get(p, 0) >= WORKING_LEVEL for p in grp):
                needed[grp[0]] = WORKING_LEVEL

    order = topological(needed)
    nodes: List[Dict[str, Any]] = []
    active: Optional[str] = None
    remedial_skills = [s for s in remedial if s in needed]
    for skill, depth in order:
        req = needed[skill]
        cur = prof_scores.get(skill, 0)
        gap_frac = max(0.0, (req - cur) / req) if req else 0
        est = max(2, math.ceil(skill_hours(skill) * gap_frac)) if cur < req else 0
        node = {
            "id": _slug(skill), "skill": skill, "depth": depth, "required": req, "current": cur,
            "prerequisites": PREREQUISITES.get(skill, []), "esco": ESCO_CODES.get(skill, "ESCO:custom"),
            "est_hours": est, "logged_hours": round(logged.get(skill, 0), 1), "in_role": skill in bench,
            "is_remedial": False,
        }
        if skill in remedial:
            node["status"] = "paused"
        elif cur >= req:
            node["status"] = "mastered"
        elif not prereqs_met(skill, prof_scores):
            node["status"] = "locked"
        else:
            node["status"] = "available"
        if skill in remedial:
            r = remedial[skill]
            nodes.append({
                "id": f"remedy-{_slug(skill)}", "skill": skill, "title": f"Remedial lab: {skill}",
                "depth": depth, "status": "remedial", "is_remedial": True, "required": req, "current": cur,
                "prerequisites": [], "esco": "ESCO:REMEDIAL", "est_hours": 3 + 2 * max(0, r.get("attempts", 1) - 1),
                "logged_hours": 0, "missed_concepts": r.get("missed_concepts", []),
                "review_prereqs": r.get("review_prereqs", []), "attempts": r.get("attempts", 1), "in_role": True,
            })
        nodes.append(node)

    if remedial_skills:
        active = remedial_skills[0]
    else:
        for n in nodes:
            if n["status"] == "available":
                n["status"] = "active"
                active = n["skill"]
                break

    # weekly schedule
    hpw = max(1.0, float(learner.get("hours_per_week") or 8))
    queue = [(n.get("title") or n["skill"], max(0.0, n["est_hours"] - n.get("logged_hours", 0)))
             for n in nodes if n["status"] in ("remedial", "active", "available", "locked", "paused")]
    weeks: List[Dict[str, Any]] = []
    cur_week: List[Dict[str, Any]] = []
    room = hpw
    for name, hrs in queue:
        while hrs > 0.01:
            take = min(hrs, room)
            cur_week.append({"item": name, "hours": round(take, 1)})
            hrs -= take
            room -= take
            if room <= 0.01:
                weeks.append({"week": len(weeks) + 1, "items": cur_week})
                cur_week, room = [], hpw
    if cur_week:
        weeks.append({"week": len(weeks) + 1, "items": cur_week})
    total_left = round(sum(h for _, h in queue), 1)
    eta = (datetime.now(timezone.utc) + timedelta(weeks=len(weeks))).date().isoformat() if weeks else None

    total_est = sum(n["est_hours"] for n in nodes) or 1
    done_pct = round(100 * sum(1 for n in nodes if n["status"] == "mastered") / max(1, len([n for n in nodes if not n["is_remedial"]])))
    learner["roadmap"] = {
        "nodes": nodes, "active": active, "hours_remaining": total_left, "hours_per_week": hpw,
        "weeks": weeks, "eta_weeks": len(weeks), "eta_date": eta, "milestones_done_pct": done_pct,
        "total_est_hours": total_est,
    }
    msg = (f"Built prerequisite DAG with {len([n for n in nodes if not n['is_remedial']])} milestones"
           f"{' + remedial lab' if remedial_skills else ''}. Active: '{active or 'all mastered'}'. "
           f"{total_left}h left at {hpw:g}h/week -> ~{len(weeks)} weeks.")
    return {"learner": learner, "trace": _say(state, "Path Architect", msg, to="resource_curator")}


# ---------------------------------------------------------------------------
# Resource Curator
# ---------------------------------------------------------------------------
def _yt(q: str) -> str:
    return "https://www.youtube.com/results?search_query=" + q.replace(" ", "+")


def resource_curator_agent(state: State) -> State:
    learner = dict(state["learner"])
    roadmap = dict(learner.get("roadmap", {}))
    fails = learner.get("fail_streak", {})
    out = []
    for n in roadmap.get("nodes", []):
        n = dict(n)
        info = SKILLS.get(n["skill"], {})
        res = [dict(r) for r in info.get("resources", [])]
        if n["is_remedial"]:
            missed = n.get("missed_concepts") or list(info.get("concepts", {}).keys())[:2]
            targeted = [{"type": "video", "title": f"Focus: {n['skill']} - {c.replace('_', ' ')} (video search)",
                         "url": _yt(f"{n['skill']} {c.replace('_', ' ')} explained simply"), "hours": 1}
                        for c in missed]
            tut = [r for r in res if r["type"] in ("tutorial", "practice")][:1] or res[:1]
            for p in n.get("review_prereqs", []):
                tut += [dict(r, title=f"Refresh prerequisite: {r['title']}") for r in SKILLS.get(p, {}).get("resources", [])[:1]]
            n["resources"] = targeted + tut
            n["project"] = (f"Guided exercise: write 3 small examples that use "
                            f"{', '.join(c.replace('_', ' ') for c in missed)} in {n['skill']}, then retake the check.")
        else:
            # Adaptive format: after 2+ failed attempts lead with video + hands-on practice
            if fails.get(n["skill"], 0) >= 2:
                order = {"video": 0, "practice": 1, "tutorial": 2, "course": 3}
                res.sort(key=lambda r: order.get(r["type"], 9))
                n["format_note"] = "Switched to video + hands-on first after repeated attempts."
            n["resources"] = res
            n["project"] = info.get("project", f"Build a small project using {n['skill']}.")
        n["explain_prompt"] = info.get("explain_prompt", f"Explain the core ideas of {n['skill']}.")
        n["quiz_size"] = len(info.get("quiz", []))
        out.append(n)
    roadmap["nodes"] = out
    learner["roadmap"] = roadmap
    pending = [n for n in out if n["status"] not in ("mastered",)]
    msg = (f"Attached {sum(len(n['resources']) for n in pending)} resources, "
           f"{len(pending)} micro-projects and assessments to open milestones.")
    return {"learner": learner, "trace": _say(state, "Resource Curator", msg, to="mentor")}


# ---------------------------------------------------------------------------
# Assessor
# ---------------------------------------------------------------------------
def grade_quiz(skill: str, answers: List[Optional[int]]) -> Tuple[float, List[str], List[Dict[str, Any]]]:
    quiz = SKILLS.get(skill, {}).get("quiz", [])
    if not quiz:
        return 0.0, [], []
    correct, missed, review = 0, [], []
    for i, q in enumerate(quiz):
        a = answers[i] if i < len(answers) else None
        ok = a == q["answer"]
        correct += ok
        if not ok and q["concept"] not in missed:
            missed.append(q["concept"])
        review.append({"q": q["q"], "your_answer": a, "correct": q["answer"], "ok": ok, "concept": q["concept"]})
    return round(100 * correct / len(quiz), 1), missed, review


def grade_explanation(skill: str, text: str) -> Tuple[float, List[str], str, str]:
    """Returns (score, missed_concepts, feedback, grader)."""
    info = SKILLS.get(skill, {})
    concepts: Dict[str, List[str]] = info.get("concepts", {})
    text = (text or "").strip()
    if llm.available() and text:
        data = llm.generate_json(
            "You are a friendly technical examiner. Grade a student's spoken answer.\n"
            f"Skill: {skill}\nQuestion: {info.get('explain_prompt', '')}\n"
            f"Key concepts expected: {', '.join(concepts)}\n"
            f"Student answer: \"{text}\"\n"
            'Return JSON: {"score": <0-100>, "missed_concepts": [<names from the key concepts list>], '
            '"feedback": "<one short encouraging sentence with the most important correction>"}'
        )
        if data and isinstance(data.get("score"), (int, float)):
            missed = [c for c in data.get("missed_concepts", []) if c in concepts]
            return float(max(0, min(100, data["score"]))), missed, str(data.get("feedback", "")), "Gemini"
    low = text.lower()
    covered = [c for c, kws in concepts.items() if any(k in low for k in kws)]
    missed = [c for c in concepts if c not in covered]
    words = len(re.findall(r"\w+", low))
    score = 25 + 75 * (len(covered) / max(1, len(concepts)))
    if words < 12:
        score -= 15
    score = max(0.0, min(100.0, score))
    fb = (f"You covered {', '.join(c.replace('_', ' ') for c in covered) or 'none of the key ideas'}"
          + (f"; next time also explain {', '.join(c.replace('_', ' ') for c in missed)}." if missed else ". Great coverage!"))
    return round(score, 1), missed, fb, "concept rubric"


def assessor_agent(state: State) -> State:
    learner = dict(state["learner"])
    ev = state.get("event", {})
    skill = ev.get("skill")
    mode = ev.get("mode", "quiz")
    feedback, grader, review = "", "answer key", []
    if mode == "simulate":
        score, missed = float(ev.get("score", 45)), list(SKILLS.get(skill, {}).get("concepts", {}))[:2]
        grader = "demo simulation"
    elif mode == "explain":
        score, missed, feedback, grader = grade_explanation(skill, ev.get("text", ""))
    else:
        score, missed, review = grade_quiz(skill, ev.get("answers", []))

    verified = dict(learner.get("verified", {}))
    old = verified.get(skill)
    verified[skill] = round(score if old is None else 0.4 * old + 0.6 * score, 1)
    learner["verified"] = verified

    passed = score >= MASTERY_PASS
    fails = dict(learner.get("fail_streak", {}))
    remedial = dict(learner.get("remedial", {}))
    prof = learner.get("proficiency", {})
    if passed:
        fails[skill] = 0
        cleared = remedial.pop(skill, None) is not None
    else:
        fails[skill] = fails.get(skill, 0) + 1
        cleared = False
        review_prereqs = []
        if fails[skill] >= 2:
            review_prereqs = [p for grp in prereq_options(skill) for p in grp
                              if p in prof and prof[p]["score"] < 65]
        remedial[skill] = {"missed_concepts": missed, "attempts": fails[skill], "created": now_iso(),
                           "review_prereqs": review_prereqs}
    learner["fail_streak"] = fails
    learner["remedial"] = remedial
    record = {"ts": now_iso(), "skill": skill, "mode": mode, "score": score, "passed": passed,
              "missed_concepts": missed, "grader": grader, "feedback": feedback}
    learner.setdefault("assessments", []).append(record)
    learner["last_assessment"] = dict(record, review=review, remedial_cleared=cleared)

    if passed:
        msg = f"PASS {score:.0f}% on {skill} (graded by {grader}). Verified proficiency now {verified[skill]:.0f}."
        if cleared:
            msg += " Remedial lab cleared."
    else:
        msg = (f"BELOW THRESHOLD {score:.0f}% (< {MASTERY_PASS}%) on {skill}. Missed concepts: "
               f"{', '.join(missed) or 'n/a'}. Requesting remedial lab, attempt #{fails[skill]}.")
    return {"learner": learner, "trace": _say(state, "Assessor", msg, to="profiler")}


# ---------------------------------------------------------------------------
# Mentor
# ---------------------------------------------------------------------------
def _fallback_message(learner: Dict[str, Any], etype: str) -> str:
    m, rm = learner.get("match", {}), learner.get("roadmap", {})
    active = rm.get("active")
    la = learner.get("last_assessment") or {}
    name = (learner.get("name") or "there").split(" ")[0]
    if etype == "assess" and la:
        if la["passed"]:
            return (f"Well done, {name}! {la['score']:.0f}% on {la['skill']} - it now counts as verified. "
                    f"Your readiness for {m.get('role')} is {m.get('readiness')}%. Next up: {active or 'you have covered every milestone'}.")
        concepts = ", ".join(c.replace("_", " ") for c in la.get("missed_concepts", [])) or "the core ideas"
        extra = ""
        rem = learner.get("remedial", {}).get(la["skill"], {})
        if rem.get("review_prereqs"):
            extra = f" Because this is attempt #{rem['attempts']}, I've also added a quick refresh of {', '.join(rem['review_prereqs'])}."
        elif rem.get("attempts", 1) >= 2:
            extra = " I've switched your materials to video + hands-on practice first - a different format often helps."
        return (f"{la['score']:.0f}% on {la['skill']} is below the {MASTERY_PASS}% bar, and that's okay - it tells us exactly "
                f"what to fix. I paused the next steps and added a short remedial lab on {concepts}.{extra} "
                f"Finish it, then retake the check.")
    if etype == "pivot":
        t = learner["match"].get("transferable", [])
        return (f"New goal: {m.get('role')}. You keep everything you've mastered"
                f"{' - ' + ', '.join(t) + ' already count' if t else ''}. Readiness starts at {m.get('readiness')}%; "
                f"your new first milestone is {active}. Estimated {rm.get('eta_weeks')} weeks at {rm.get('hours_per_week'):g}h/week.")
    if etype == "progress":
        return (f"Logged - nice consistency. {rm.get('hours_remaining')}h left on your path "
                f"(about {rm.get('eta_weeks')} weeks). Keep going with {active}, then take its assessment.")
    missing = ", ".join(m.get("missing", [])) or "none"
    weak = ", ".join(w["skill"] for w in learner.get("analysis", {}).get("weaknesses", [])) or "none"
    return (f"Hi {name}! For {m.get('role')} you're {m.get('readiness')}% ready. Missing skills: {missing}. "
            f"Skills to strengthen: {weak}. Start with {active} - prerequisites come first so each step builds on the last. "
            f"At {rm.get('hours_per_week'):g}h/week you can be job-ready in about {rm.get('eta_weeks')} weeks.")


def _next_actions(learner: Dict[str, Any]) -> List[str]:
    rm = learner.get("roadmap", {})
    nodes = rm.get("nodes", [])
    acts = []
    first = next((n for n in nodes if n["status"] in ("remedial", "active")), None)
    if first:
        r = (first.get("resources") or [{}])[0]
        acts.append(f"Study: {r.get('title', first['skill'])} (~{r.get('hours', 1)}h)")
        acts.append(f"Build: {first.get('project', '')}")
        acts.append(f"Prove it: take the {first['skill']} assessment (quiz or voice explanation)")
    unv = learner.get("analysis", {}).get("unverified", [])
    if unv:
        acts.append(f"Verify self-reported skills with a quick quiz: {', '.join(unv[:3])}")
    return acts[:4]


def mentor_agent(state: State) -> State:
    learner = dict(state["learner"])
    etype = (state.get("event") or {}).get("type", "profile")
    msg = _fallback_message(learner, etype)
    source = "rule-based mentor"
    if llm.available():
        m = learner.get("match", {})
        prompt = (
            "You are SkillForge AI's warm, practical learning mentor. Rewrite the guidance below for the learner "
            "in at most 3 short sentences of simple English. Keep every fact and number exactly. No markdown.\n"
            f"Learner: {learner.get('name')} | Goal: {m.get('role')} | Readiness: {m.get('readiness')}%\n"
            f"Event: {etype}\nGuidance: {msg}"
        )
        g = llm.generate_text(prompt)
        if g:
            msg, source = g, f"Gemini ({llm.MODEL})"
    learner["mentor"] = {"message": msg, "next_actions": _next_actions(learner), "source": source, "ts": now_iso()}
    learner.setdefault("timeline", []).append({"ts": now_iso(), "event": etype, "message": msg,
                                               "readiness": learner.get("match", {}).get("readiness")})
    learner["timeline"] = learner["timeline"][-60:]
    return {"learner": learner, "trace": _say(state, "Mentor", f"[{source}] {msg}", to="learner")}


def mentor_chat(learner: Dict[str, Any], question: str) -> Tuple[str, str]:
    """Free-form Q&A with the mentor, grounded in the learner's current plan."""
    m, rm, an = learner.get("match", {}), learner.get("roadmap", {}), learner.get("analysis", {})
    context = (f"Goal: {m.get('role')} ({m.get('readiness')}% ready). Active milestone: {rm.get('active')}. "
               f"Missing: {', '.join(m.get('missing', []))}. Weak: {', '.join(w['skill'] for w in an.get('weaknesses', []))}. "
               f"Hours/week: {rm.get('hours_per_week') or 0:g}. ETA weeks: {rm.get('eta_weeks')}.")
    if llm.available():
        ans = llm.generate_text(
            "You are SkillForge AI's learning mentor. Answer in simple English, max 5 sentences, practical and kind. "
            f"Use this learner context: {context}\nQuestion: {question}")
        if ans:
            return ans, f"Gemini ({llm.MODEL})"
    q = question.lower()
    active = rm.get("active")
    node = next((n for n in rm.get("nodes", []) if n["skill"] == active), None)
    if any(k in q for k in ("why", "order", "first")):
        pre = ", ".join(node.get("prerequisites", [])) if node else ""
        return (f"{active} comes first because the roadmap follows prerequisites"
                f"{' (it builds on ' + pre + ')' if pre else ''}. Learning in this order means each new skill reuses what "
                "you already know, so it feels easier and sticks better."), "rule-based mentor"
    if any(k in q for k in ("how long", "when", "time", "weeks")):
        return (f"About {rm.get('hours_remaining')} hours of focused study remain. At {rm.get('hours_per_week'):g}h/week "
                f"that's roughly {rm.get('eta_weeks')} weeks (target {rm.get('eta_date')}). Raising your weekly hours "
                "on the Profile tab recalculates this instantly."), "rule-based mentor"
    if any(k in q for k in ("resource", "learn", "study", "course", "video")) and node:
        r = node.get("resources", [])[:3]
        return ("For " + active + ", start with: " + "; ".join(f"{x['title']} ({x['type']}, ~{x['hours']}h)" for x in r)
                + ". Then do the micro-project and take the assessment."), "rule-based mentor"
    if any(k in q for k in ("interview", "job", "ready", "placement")):
        return (f"You're {m.get('readiness')}% ready for {m.get('role')}. Recruiters look for proof, so finish the "
                "micro-projects, push them to GitHub, and verify each skill here with an assessment. Practise explaining "
                "concepts out loud with the voice check - it's good interview practice."), "rule-based mentor"
    if any(k in q for k in ("fail", "hard", "difficult", "stuck")):
        return ("Getting stuck is normal. Take the remedial lab - it targets only the concepts you missed - and try the "
                "video resources first. Short daily sessions beat one long one. Then retake the check."), "rule-based mentor"
    return (f"Your focus right now is {active}. {context} Ask me 'why this order?', 'how long will it take?', "
            "'what should I study?' or 'am I ready for interviews?'."), "rule-based mentor"


def extract_profile_from_resume(text: str) -> Dict[str, Any]:
    """Resume / LinkedIn text -> skills (+ levels). Gemini if available, else taxonomy scan."""
    if llm.available() and text.strip():
        data = llm.generate_json(
            "Extract technical skills from this resume. Return JSON "
            '{"skills": [{"name": "<skill>", "level": "beginner|intermediate|advanced"}], '
            '"certifications": [{"name": "<cert>"}], "projects": [{"name": "<title>", "description": "<one line>"}]}\n\n'
            + text[:6000])
        if data and isinstance(data.get("skills"), list):
            data["extractor"] = f"Gemini ({llm.MODEL})"
            return data
    skills = [{"name": s, "level": "intermediate"} for s in extract_skills(text)]
    return {"skills": skills, "certifications": [], "projects": [], "extractor": "taxonomy scan"}
