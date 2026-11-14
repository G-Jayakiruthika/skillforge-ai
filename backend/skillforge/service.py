"""
service.py - application operations shared by the FastAPI app (api.py) and the
zero-install dev server (devserver.py). Every function takes/returns plain
dicts, so it is easy to test.
"""
from __future__ import annotations

import re
import uuid
from collections import defaultdict
from typing import Any, Dict, List, Optional

from . import agents, graph, llm, store
from .knowledge import (ESCO_CODES, LEVEL_SCORES, MASTERY_PASS, PREREQUISITES, ROLE_BENCHMARKS,
                        ROLE_DESCRIPTIONS, SKILLS)


class NotFound(Exception):
    pass


class BadRequest(Exception):
    pass


PROFILE_FIELDS = ("name", "email", "organization", "target_role", "hours_per_week", "skills",
                  "certifications", "projects", "interests")


def _result(state: Dict[str, Any]) -> Dict[str, Any]:
    learner = state["learner"]
    store.save(learner)
    return {"learner": learner, "trace": state.get("trace", [])}


def _load(learner_id: str) -> Dict[str, Any]:
    learner = store.get(learner_id)
    if not learner:
        raise NotFound(f"Learner '{learner_id}' not found")
    return learner


# ---------------------------------------------------------------------------
def health() -> Dict[str, Any]:
    return {"status": "ok", "agent_engine": graph.ENGINE, "gemini": llm.status(),
            "agents": ["Supervisor", "Profiler", "Skill Analyst", "Career Matcher", "Path Architect",
                       "Resource Curator", "Assessor", "Mentor"],
            "roles": list(ROLE_BENCHMARKS)}


def meta() -> Dict[str, Any]:
    return {
        "roles": [{"name": r, "description": ROLE_DESCRIPTIONS.get(r, ""), "skills": b}
                  for r, b in ROLE_BENCHMARKS.items()],
        "skills": [{"name": s, "esco": ESCO_CODES.get(s), "prerequisites": PREREQUISITES.get(s, []),
                    "hours": SKILLS[s]["hours"]} for s in SKILLS],
        "levels": list(LEVEL_SCORES),
        "pass_mark": MASTERY_PASS,
        "graph": graph.describe(),
    }


def list_learners() -> List[Dict[str, Any]]:
    return [{"id": l["id"], "name": l.get("name"), "target_role": l.get("target_role"),
             "readiness": l.get("match", {}).get("readiness"), "organization": l.get("organization")}
            for l in store.all_learners()]


def get_learner(learner_id: str) -> Dict[str, Any]:
    return {"learner": _load(learner_id), "trace": []}


def save_profile(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not (payload.get("name") or "").strip():
        raise BadRequest("name is required")
    lid = payload.get("id") or (re.sub(r"[^a-z0-9]+", "-", payload["name"].lower()).strip("-")[:20]
                                + "-" + uuid.uuid4().hex[:4])
    learner = store.get(lid) or {"id": lid, "created": agents.now_iso()}
    old_role = learner.get("target_role")
    for f in PROFILE_FIELDS:
        if f in payload:
            learner[f] = payload[f]
    learner["target_role"] = learner.get("target_role") or "Full Stack Developer"
    if old_role and old_role != learner["target_role"]:
        learner["previous_role"] = old_role
    if old_role != learner["target_role"]:
        learner.setdefault("role_history", []).append({"ts": agents.now_iso(), "role": learner["target_role"]})
    return _result(graph.run(learner, {"type": "profile"}))


def extract_resume(text: str) -> Dict[str, Any]:
    if not (text or "").strip():
        raise BadRequest("text is required")
    return agents.extract_profile_from_resume(text)


def quiz(skill: str) -> Dict[str, Any]:
    info = SKILLS.get(skill)
    if not info:
        raise NotFound(f"Unknown skill '{skill}'")
    return {"skill": skill, "pass_mark": MASTERY_PASS, "explain_prompt": info["explain_prompt"],
            "questions": [{"q": q["q"], "options": q["options"]} for q in info["quiz"]]}


def assess(learner_id: str, skill: str, mode: str = "quiz", answers: Optional[List[Optional[int]]] = None,
           text: str = "", score: Optional[float] = None) -> Dict[str, Any]:
    if skill not in SKILLS:
        raise BadRequest(f"Unknown skill '{skill}'")
    if mode not in ("quiz", "explain", "simulate"):
        raise BadRequest("mode must be quiz, explain or simulate")
    learner = _load(learner_id)
    event = {"type": "assess", "skill": skill, "mode": mode, "answers": answers or [], "text": text,
             "score": 45 if score is None else score}
    return _result(graph.run(learner, event))


def pivot(learner_id: str, target_role: str) -> Dict[str, Any]:
    if target_role not in ROLE_BENCHMARKS:
        raise BadRequest(f"Unknown role '{target_role}'")
    return _result(graph.run(_load(learner_id), {"type": "pivot", "target_role": target_role}))


def log_progress(learner_id: str, skill: str, hours: float, note: str = "") -> Dict[str, Any]:
    if not hours or hours <= 0 or hours > 24:
        raise BadRequest("hours must be between 0 and 24")
    return _result(graph.run(_load(learner_id), {"type": "progress", "skill": skill, "hours": hours, "note": note}))


def mentor_chat(learner_id: str, question: str) -> Dict[str, Any]:
    if not (question or "").strip():
        raise BadRequest("question is required")
    learner = _load(learner_id)
    answer, source = agents.mentor_chat(learner, question)
    chat = learner.setdefault("chat", [])
    chat.append({"ts": agents.now_iso(), "q": question, "a": answer, "source": source})
    learner["chat"] = chat[-40:]
    store.save(learner)
    return {"answer": answer, "source": source}


# ---------------------------------------------------------------------------
# Organisation / university view
# ---------------------------------------------------------------------------
def cohort(organization: Optional[str] = None) -> Dict[str, Any]:
    learners = [l for l in store.all_learners()
                if not organization or (l.get("organization") or "") == organization]
    skill_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"needed_by": 0, "met": 0, "gap_sum": 0})
    roles: Dict[str, int] = defaultdict(int)
    at_risk, rows = [], []
    for l in learners:
        m = l.get("match", {})
        roles[l.get("target_role")] += 1
        for s in m.get("skills", []):
            st = skill_stats[s["skill"]]
            st["needed_by"] += 1
            st["met"] += s["status"] == "met"
            st["gap_sum"] += s["gap"]
        fails = max(l.get("fail_streak", {}).values(), default=0)
        scores = [a["score"] for a in l.get("assessments", [])]
        hours = sum(e.get("hours", 0) for e in l.get("study_log", []))
        row = {"id": l["id"], "name": l.get("name"), "role": l.get("target_role"),
               "readiness": m.get("readiness", 0), "active": l.get("roadmap", {}).get("active"),
               "assessments": len(scores), "avg_score": round(sum(scores) / len(scores)) if scores else None,
               "hours": round(hours, 1), "remedial": list(l.get("remedial", {}).keys())}
        rows.append(row)
        reasons = []
        if row["readiness"] < 35:
            reasons.append("low readiness")
        if fails >= 2:
            reasons.append("repeated failed assessments")
        if row["remedial"]:
            reasons.append("in remedial lab: " + ", ".join(row["remedial"]))
        if reasons:
            at_risk.append({**row, "reasons": reasons})
    gaps = sorted(({"skill": s, "needed_by": v["needed_by"], "met": v["met"],
                    "pct_lacking": round(100 * (v["needed_by"] - v["met"]) / v["needed_by"]),
                    "avg_gap": round(v["gap_sum"] / v["needed_by"])}
                   for s, v in skill_stats.items()), key=lambda x: (-(x["needed_by"] - x["met"]), -x["pct_lacking"], -x["avg_gap"]))
    recs = [f"Run a cohort workshop on {g['skill']} - {g['pct_lacking']}% of learners who need it are below level."
            for g in gaps[:3] if g["pct_lacking"] >= 50]
    return {
        "learners": len(learners),
        "avg_readiness": round(sum(r["readiness"] for r in rows) / len(rows)) if rows else 0,
        "roles": dict(roles), "skill_gaps": gaps, "at_risk": at_risk,
        "table": sorted(rows, key=lambda r: r["readiness"]), "recommendations": recs,
        "organizations": sorted({l.get("organization") for l in store.all_learners() if l.get("organization")}),
    }


# ---------------------------------------------------------------------------
# Demo data
# ---------------------------------------------------------------------------
DEMO_ORG = "Demo University - MCA 2026"


def _quiz_answers(skill: str, correct: int) -> List[int]:
    qs = SKILLS[skill]["quiz"]
    return [q["answer"] if i < correct else (q["answer"] + 1) % len(q["options"]) for i, q in enumerate(qs)]


def seed_demo(reset: bool = False) -> Dict[str, Any]:
    if reset:
        store.delete_all()
    if store.all_learners():
        return {"seeded": False, "learners": len(store.all_learners())}
    people = [
        {"id": "jane-doe", "name": "Jane Doe", "target_role": "Full Stack Developer", "hours_per_week": 8,
         "skills": [{"name": "Python", "level": "intermediate"}, {"name": "SQL", "level": "intermediate"},
                    {"name": "basic HTML", "level": "beginner"}],
         "certifications": [{"name": "HackerRank SQL (Basic)"}],
         "projects": [{"name": "Student marks analyser", "description": "Python script that loads marks from a MySQL database and prints reports"}],
         "interests": "web apps, startups"},
        {"id": "arjun-k", "name": "Arjun K", "target_role": "Data Engineer", "hours_per_week": 10,
         "skills": [{"name": "py", "level": "intermediate"}, {"name": "postgres", "level": "advanced"},
                    {"name": "excel", "level": "intermediate"}],
         "certifications": [], "projects": [{"name": "Sales ETL", "description": "Python + SQL ETL into a star schema"}]},
        {"id": "meera-s", "name": "Meera S", "target_role": "Frontend Developer", "hours_per_week": 6,
         "skills": [{"name": "HTML", "level": "advanced"}, {"name": "CSS", "level": "advanced"},
                    {"name": "vanilla js", "level": "beginner"}, {"name": "github", "level": "intermediate"}],
         "certifications": [{"name": "freeCodeCamp Responsive Web Design"}], "projects": []},
        {"id": "rahul-p", "name": "Rahul P", "target_role": "Data Analyst", "hours_per_week": 5,
         "skills": [{"name": "excel", "level": "advanced"}, {"name": "sql", "level": "beginner"}],
         "certifications": [], "projects": []},
        {"id": "fatima-n", "name": "Fatima N", "target_role": "Backend Developer (Python)", "hours_per_week": 12,
         "skills": [{"name": "python3", "level": "advanced"}, {"name": "flask", "level": "intermediate"},
                    {"name": "mysql", "level": "intermediate"}, {"name": "git", "level": "intermediate"}],
         "certifications": [{"name": "AWS Cloud Practitioner"}], "projects": [{"name": "Library REST API", "description": "Flask REST API with MySQL and Docker"}]},
    ]
    for p in people:
        save_profile({**p, "organization": DEMO_ORG})
    # some history so progress + cohort views have data
    assess("arjun-k", "SQL", answers=_quiz_answers("SQL", 3))
    log_progress("arjun-k", "Data Modeling", 4, "Kimball chapter 1-2")
    assess("meera-s", "JavaScript", answers=_quiz_answers("JavaScript", 1))
    assess("meera-s", "JavaScript", mode="explain", text="promises are async")
    assess("rahul-p", "SQL", answers=_quiz_answers("SQL", 1))
    assess("fatima-n", "Python", answers=_quiz_answers("Python", 3))
    log_progress("fatima-n", "REST APIs", 3, "FastAPI tutorial")
    return {"seeded": True, "learners": len(store.all_learners())}
