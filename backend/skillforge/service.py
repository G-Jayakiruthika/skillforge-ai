"""
service.py - application operations shared by the FastAPI app (api.py) and the
zero-install dev server (devserver.py). Every function takes/returns plain
dicts, so it is easy to test.
"""
from __future__ import annotations

import json
import re
import uuid
from collections import defaultdict
from typing import Any, Dict, List, Optional

from . import agents, auth, graph, institutions, llm, security, store
from .knowledge import (COMPANIES, COMPANY_NOTE, ESCO_CODES, INDUSTRIES, LEVEL_SCORES, MASTERY_PASS, PREREQUISITES,
                        ROLE_BENCHMARKS, ROLE_DESCRIPTIONS, ROLE_INDUSTRY, SKILLS)


class NotFound(Exception):
    pass


class BadRequest(Exception):
    pass


PROFILE_FIELDS = ("name", "email", "organization", "target_role", "hours_per_week", "skills",
                  "certifications", "projects", "interests", "dream_company", "education",
                  "institution_id", "institution", "city", "district", "state", "listed")
TRUSTED = auth.TRUSTED            # default caller for server-side code (seeding, tests); routes pass the real user


def _result(state: Dict[str, Any]) -> Dict[str, Any]:
    learner = state["learner"]
    store.save(learner)
    return {"learner": learner, "trace": state.get("trace", [])}


def _load(learner_id: str, user: Optional[Dict[str, Any]] = TRUSTED, write: bool = False) -> Dict[str, Any]:
    """Load a learner and enforce access. Unknown and forbidden look the same (404), so ids cannot be probed."""
    learner = store.get(learner_id)
    allowed = bool(learner) and (auth.can_edit_learner(user, learner) if write else auth.can_view_learner(user, learner))
    if not learner or not allowed:
        if learner and user and not write:
            raise auth.Forbidden("You do not have access to this profile.")
        if learner and write and auth.can_view_learner(user, learner):
            raise auth.Forbidden("You can view this profile but not change it.")
        raise NotFound(f"Learner '{learner_id}' not found")
    return learner


# ---------------------------------------------------------------------------
def apply_consent(user: Optional[Dict[str, Any]]) -> None:
    """Called once per request: outside AI processing happens only with explicit opt-in."""
    llm.set_allowed(bool(auth.get_consent(user).get("ai_processing")))


def health() -> Dict[str, Any]:
    return {"status": "ok", "agent_engine": graph.ENGINE, "gemini": llm.status(),
            "accounts": store.count_users(), "auth": True, "debug": security.Env.debug,
            "agents": ["Supervisor", "Profiler", "Skill Analyst", "Career Matcher", "Path Architect",
                       "Resource Curator", "Assessor", "Mentor"],
            "roles": list(ROLE_BENCHMARKS)}


def meta() -> Dict[str, Any]:
    return {
        "roles": [{"name": r, "description": ROLE_DESCRIPTIONS.get(r, ""), "skills": b, "industry": ROLE_INDUSTRY.get(r)}
                  for r, b in ROLE_BENCHMARKS.items()],
        "industries": INDUSTRIES,
        "companies": COMPANIES, "company_note": COMPANY_NOTE,
        "skills": [{"name": s, "esco": ESCO_CODES.get(s), "prerequisites": PREREQUISITES.get(s, []),
                    "hours": SKILLS[s]["hours"]} for s in SKILLS],
        "levels": list(LEVEL_SCORES),
        "pass_mark": MASTERY_PASS,
        "graph": graph.describe(),
        "institutions": institutions.all_institutions(),
        "geography": institutions.geography(),
        "institution_note": institutions.SOURCE_NOTE,
        "kind_labels": institutions.KIND_LABELS,
    }


def list_learners(user: Optional[Dict[str, Any]] = TRUSTED) -> List[Dict[str, Any]]:
    """Only the learners this caller may open: the demo sandbox, their own, their students, or all (admin)."""
    mine = (user or {}).get("learner_id")
    rows = [{"id": l["id"], "name": l.get("name"), "target_role": l.get("target_role"),
             "readiness": l.get("match", {}).get("readiness"), "organization": l.get("organization"),
             "demo": bool(l.get("demo")), "mine": l["id"] == mine, "can_edit": auth.can_edit_learner(user, l)}
            for l in store.all_learners() if auth.can_view_learner(user, l)]
    return sorted(rows, key=lambda r: (not r["mine"], r["demo"], r["name"] or ""))


def get_learner(learner_id: str, user: Optional[Dict[str, Any]] = TRUSTED) -> Dict[str, Any]:
    learner = _load(learner_id, user)
    return {"learner": learner, "trace": [], "can_edit": auth.can_edit_learner(user, learner)}


def _sanitise_profile(p: Dict[str, Any]) -> Dict[str, Any]:
    """Strip tags/control characters from everything a form can submit (anti-XSS, defence in depth)."""
    out = dict(p)
    for f in ("name", "organization", "institution", "interests", "education", "city", "district", "state",
              "dream_company", "target_role", "institution_id"):
        if f in out:
            out[f] = security.clean_text(out[f], max_len=120)
    if "email" in out:
        out["email"] = security.clean_email(out["email"]) or ""
    if "listed" in out:
        out["listed"] = bool(out["listed"])
    if "hours_per_week" in out:
        out["hours_per_week"] = security.clean_int(out["hours_per_week"], 1, 60, 8)
    for key, fields, cap in (("skills", ("name", "level"), 60), ("certifications", ("name", "issuer"), 120),
                             ("projects", ("name", "description"), 240)):
        if isinstance(out.get(key), list):
            out[key] = [{f: security.clean_text(item.get(f), max_len=cap) for f in fields if f in item}
                        for item in out[key][:40] if isinstance(item, dict)]
    return out


def save_profile(payload: Dict[str, Any], user: Optional[Dict[str, Any]] = TRUSTED, demo: bool = False) -> Dict[str, Any]:
    payload = _sanitise_profile(payload)
    if not (payload.get("name") or "").strip():
        raise BadRequest("name is required")
    lid = security.clean_text(payload.get("id"), max_len=40)
    if lid and not re.fullmatch(r"[\w-]+", lid):
        raise BadRequest("Invalid profile id.")
    privileged = bool(user) and user.get("role") == "admin" and not auth.is_demo_user(user)
    existing = store.get(lid) if lid else None
    if existing:
        _load(lid, user, write=True)                       # owner, admin, or the demo sandbox
    elif privileged:
        lid = lid or (re.sub(r"[^a-z0-9]+", "-", payload["name"].lower()).strip("-")[:20] + "-" + uuid.uuid4().hex[:4])
    elif user and user.get("learner_id"):                  # a student may only ever have their own profile
        lid = user["learner_id"]
        existing = _load(lid, user, write=True)
    else:
        raise auth.AuthError("Please create a free account to save your own profile.")
    learner = existing or {"id": lid, "created": agents.now_iso()}
    if demo:
        learner["demo"] = True
    old_role = learner.get("target_role")
    for f in PROFILE_FIELDS:
        if f in payload:
            learner[f] = payload[f]
    inst = institutions.find(str(payload.get("institution_id") or payload.get("institution") or ""))
    if inst:
        learner.update({"institution_id": inst["id"], "institution": inst["name"], "city": inst["city"],
                        "district": inst["district"], "state": inst["state"], "organization": inst["name"]})
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


def quiz_check(skill: str, index: int, answer: Optional[int]) -> Dict[str, Any]:
    """Instant feedback for one question (used by the Skill Arena game)."""
    info = SKILLS.get(skill)
    if not info:
        raise NotFound(f"Unknown skill '{skill}'")
    if not isinstance(index, int) or not 0 <= index < len(info["quiz"]):
        raise BadRequest("index out of range")
    q = info["quiz"][index]
    return {"correct": answer == q["answer"], "correct_index": q["answer"], "concept": q["concept"]}


def assess(learner_id: str, skill: str, mode: str = "quiz", answers: Optional[List[Optional[int]]] = None,
           text: str = "", score: Optional[float] = None, user: Optional[Dict[str, Any]] = TRUSTED) -> Dict[str, Any]:
    if skill not in SKILLS:
        raise BadRequest(f"Unknown skill '{skill}'")
    if mode not in ("quiz", "explain", "simulate"):
        raise BadRequest("mode must be quiz, explain or simulate")
    learner = _load(learner_id, user, write=True)
    if mode == "simulate" and not learner.get("demo") and not (user or {}).get("trusted"):
        raise BadRequest("Simulated scores are only available on demo learners.")
    event = {"type": "assess", "skill": skill, "mode": mode, "answers": answers or [], "text": text,
             "score": 45 if score is None else score}
    return _result(graph.run(learner, event))


def pivot(learner_id: str, target_role: str, user: Optional[Dict[str, Any]] = TRUSTED) -> Dict[str, Any]:
    if target_role not in ROLE_BENCHMARKS:
        raise BadRequest(f"Unknown role '{target_role}'")
    return _result(graph.run(_load(learner_id, user, write=True), {"type": "pivot", "target_role": target_role}))


def log_progress(learner_id: str, skill: str, hours: float, note: str = "",
                 user: Optional[Dict[str, Any]] = TRUSTED) -> Dict[str, Any]:
    if not hours or hours <= 0 or hours > 24:
        raise BadRequest("hours must be between 0 and 24")
    if skill not in SKILLS:
        raise BadRequest(f"Unknown skill '{skill}'")
    note = security.clean_text(note, max_len=200)
    return _result(graph.run(_load(learner_id, user, write=True),
                             {"type": "progress", "skill": skill, "hours": hours, "note": note}))


def mentor_chat(learner_id: str, question: str, user: Optional[Dict[str, Any]] = TRUSTED) -> Dict[str, Any]:
    if not (question or "").strip():
        raise BadRequest("question is required")
    question = security.clean_text(question, max_len=500)
    learner = _load(learner_id, user, write=True)
    answer, source = agents.mentor_chat(learner, question)
    chat = learner.setdefault("chat", [])
    chat.append({"ts": agents.now_iso(), "q": question, "a": answer, "source": source})
    learner["chat"] = chat[-40:]
    store.save(learner)
    return {"answer": answer, "source": source}


# ---------------------------------------------------------------------------
# Organisation / university view
# ---------------------------------------------------------------------------
def cohort(organization: Optional[str] = None, user: Optional[Dict[str, Any]] = TRUSTED) -> Dict[str, Any]:
    """Cohort analytics over the learners the caller may open (guests: the demo cohort only)."""
    visible = [l for l in store.all_learners() if auth.can_view_learner(user, l)]
    learners = [l for l in visible
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
        "organizations": sorted({l.get("organization") for l in visible if l.get("organization")}),
    }


# ---------------------------------------------------------------------------
# Demo data
# ---------------------------------------------------------------------------
DEMO_ORG = "Demo University - MCA 2026"


def _quiz_answers(skill: str, correct: int) -> List[int]:
    qs = SKILLS[skill]["quiz"]
    return [q["answer"] if i < correct else (q["answer"] + 1) % len(q["options"]) for i, q in enumerate(qs)]


def seed_demo(reset: bool = False, user: Optional[Dict[str, Any]] = TRUSTED) -> Dict[str, Any]:
    """(Re)create the fictional demo learners. Real students' profiles are never deleted.
    On a public server only an admin may reset."""
    if reset:
        if security.Env.public and not (user and user.get("role") == "admin" and not auth.is_demo_user(user)):
            raise auth.Forbidden("Only an admin can reset the demo data on this server.")
        store.delete_demo_learners()
    if any(l.get("demo") for l in store.all_learners()):
        return {"seeded": False, "learners": len(store.all_learners())}
    people = [
        {"id": "jane-doe", "name": "Jane Doe", "target_role": "Full Stack Developer", "hours_per_week": 8,
         "skills": [{"name": "Python", "level": "intermediate"}, {"name": "SQL", "level": "intermediate"},
                    {"name": "basic HTML", "level": "beginner"}],
         "certifications": [{"name": "HackerRank SQL (Basic)"}],
         "projects": [{"name": "Student marks analyser", "description": "Python script that loads marks from a MySQL database and prints reports"}],
         "interests": "web apps, startups", "dream_company": "Zoho", "education": "MCA",
         "institution_id": "rathinam-technical-campus"},
        {"id": "arjun-k", "name": "Arjun K", "target_role": "Data Engineer", "hours_per_week": 10,
         "skills": [{"name": "py", "level": "intermediate"}, {"name": "postgres", "level": "advanced"},
                    {"name": "excel", "level": "intermediate"}],
         "certifications": [], "projects": [{"name": "Sales ETL", "description": "Python + SQL ETL into a star schema"}],
         "dream_company": "Amazon", "education": "B.Tech IT", "institution_id": "psg-college-of-technology"},
        {"id": "meera-s", "name": "Meera S", "target_role": "Frontend Developer", "hours_per_week": 6,
         "skills": [{"name": "HTML", "level": "advanced"}, {"name": "CSS", "level": "advanced"},
                    {"name": "vanilla js", "level": "beginner"}, {"name": "github", "level": "intermediate"}],
         "certifications": [{"name": "freeCodeCamp Responsive Web Design"}], "projects": [],
         "education": "B.Sc CS", "institution_id": "loyola-college"},
        {"id": "rahul-p", "name": "Rahul P", "target_role": "Data Analyst", "hours_per_week": 5,
         "skills": [{"name": "excel", "level": "advanced"}, {"name": "sql", "level": "beginner"}],
         "certifications": [], "projects": [], "education": "BBA", "institution_id": "bishop-heber-college"},
        {"id": "fatima-n", "name": "Fatima N", "target_role": "Backend Developer (Python)", "hours_per_week": 12,
         "skills": [{"name": "python3", "level": "advanced"}, {"name": "flask", "level": "intermediate"},
                    {"name": "mysql", "level": "intermediate"}, {"name": "git", "level": "intermediate"}],
         "certifications": [{"name": "AWS Cloud Practitioner"}], "projects": [{"name": "Library REST API", "description": "Flask REST API with MySQL and Docker"}],
         "dream_company": "Google", "education": "BCA",
         "institution_id": "jamal-mohamed-college"},
        {"id": "karthik-r", "name": "Karthik R", "target_role": "Mechanical Design Engineer", "hours_per_week": 7,
         "skills": [{"name": "autocad", "level": "intermediate"}, {"name": "cnc", "level": "beginner"}],
         "certifications": [{"name": "SolidWorks CSWA"}], "projects": [{"name": "Go-kart chassis", "description": "Designed the frame in SolidWorks and checked machining"}],
         "dream_company": "Tata Motors", "education": "B.E. Mechanical", "institution_id": "kumaraguru-college-of-technology"},
        {"id": "priya-m", "name": "Priya M", "target_role": "Financial Analyst", "hours_per_week": 6,
         "skills": [{"name": "tally", "level": "intermediate"}, {"name": "excel", "level": "intermediate"}, {"name": "gst", "level": "beginner"}],
         "certifications": [], "projects": [], "dream_company": "Deloitte", "education": "B.Com",
         "institution_id": "psg-college-of-arts-and-science"},
        {"id": "sanjay-v", "name": "Sanjay V", "target_role": "Embedded Systems Engineer", "hours_per_week": 9,
         "skills": [{"name": "c", "level": "intermediate"}, {"name": "arduino", "level": "intermediate"}, {"name": "digital electronics", "level": "beginner"}],
         "certifications": [], "projects": [{"name": "Smart irrigation", "description": "Arduino soil sensor with IoT alerts over MQTT"}],
         "dream_company": "Bosch", "education": "B.E. ECE", "institution_id": "kongu-engineering-college"},
        {"id": "divya-s", "name": "Divya S", "target_role": "Clinical Research Associate", "hours_per_week": 5,
         "skills": [{"name": "medical terminology", "level": "intermediate"}, {"name": "communication", "level": "intermediate"}],
         "certifications": [{"name": "GCP training certificate (clinical research)"}], "projects": [],
         "dream_company": "IQVIA", "education": "B.Pharm", "institution_id": "rathinam-technical-campus"},
    ]
    for p in people:
        save_profile({**p, "organization": DEMO_ORG}, demo=True)
    # some history so progress + cohort views have data
    assess("arjun-k", "SQL", answers=_quiz_answers("SQL", 3))
    log_progress("arjun-k", "Data Modeling", 4, "Kimball chapter 1-2")
    assess("meera-s", "JavaScript", answers=_quiz_answers("JavaScript", 1))
    assess("meera-s", "JavaScript", mode="explain", text="promises are async")
    assess("rahul-p", "SQL", answers=_quiz_answers("SQL", 1))
    assess("fatima-n", "Python", answers=_quiz_answers("Python", 3))
    log_progress("fatima-n", "REST APIs", 3, "FastAPI tutorial")
    assess("karthik-r", "CAD Design", answers=_quiz_answers("CAD Design", 3))
    assess("priya-m", "Financial Accounting", answers=_quiz_answers("Financial Accounting", 1))
    assess("sanjay-v", "C Programming", answers=_quiz_answers("C Programming", 2))
    _seed_faculty()
    return {"seeded": True, "learners": len(store.all_learners()), "accounts": store.count_users()}


DEMO_FACULTY = [
    ("Dr. Anitha Rajan", "anitha.rajan" + auth.DEMO_DOMAIN, "rathinam-technical-campus", "Computer Applications"),
    ("Prof. Senthil Kumar", "senthil.kumar" + auth.DEMO_DOMAIN, "kumaraguru-college-of-technology", "Mechanical Engineering"),
    ("Dr. Fathima Beevi", "fathima.beevi" + auth.DEMO_DOMAIN, "kongu-engineering-college", "Electronics and Communication"),
]


def _seed_faculty() -> None:
    """Fictional faculty so the directory and the faculty portal have something to show.

    There is NO shared demo password: each demo account gets a random password nobody knows.
    The portal demo uses a passwordless session (auth.demo_login) that is switched off on public
    servers and can only ever open the fictional demo learners.
    """
    import secrets as _secrets
    for name, email, inst_id, dept in DEMO_FACULTY:
        if store.get_user_by_email(email):
            continue
        try:
            auth.signup({"name": name, "email": email, "password": "Dm9!" + _secrets.token_urlsafe(24),
                         "role": "faculty", "institution_id": inst_id, "department": dept, "_demo": True})
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Accounts, directory, faculty and contact
# ---------------------------------------------------------------------------
def _attach_learner(user: Dict[str, Any]) -> Dict[str, Any]:
    """Give a new student account its own learner profile."""
    # Faculty do not have a learner profile; everyone else does - including the first account,
    # which is promoted to admin but is still usually a real learner.
    if user.get("role") == "faculty" or user.get("learner_id"):
        return user
    lid = "u-" + user["id"]
    res = save_profile({"id": lid, "name": user["name"], "email": user["email"],
                        "institution_id": user.get("institution_id"), "institution": user.get("institution"),
                        "city": user.get("city"), "district": user.get("district"), "state": user.get("state"),
                        "education": user.get("department"), "target_role": "Full Stack Developer",
                        "hours_per_week": 8, "skills": [], "listed": True})
    owned = res["learner"]
    owned["owner"] = user["id"]
    store.save(owned)
    store.update_user(user["id"], {"learner_id": res["learner"]["id"]})
    return store.get_user(user["id"])


def signup(data: Dict[str, Any], ip: str = "") -> Dict[str, Any]:
    user, token = auth.signup(data, ip=ip)
    user = _attach_learner(user)
    return {"user": auth.safe_user(user), "token": token}


def login(data: Dict[str, Any], ip: str = "") -> Dict[str, Any]:
    user, token = auth.login(data, ip=ip)
    return {"user": auth.safe_user(user), "token": token}


def demo_login(data: Dict[str, Any]) -> Dict[str, Any]:
    user, token = auth.demo_login(str(data.get("role") or "faculty"))
    return {"user": {**auth.safe_user(user), "demo": True}, "token": token}


def me(user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    u = auth.safe_user(user)
    if u:
        u["demo"] = auth.is_demo_user(user)
    return {"user": u, "signed_in": bool(user), "demo_logins": not security.Env.public}


def change_password(user: Optional[Dict[str, Any]], data: Dict[str, Any]) -> Dict[str, Any]:
    u = auth.require(user)
    auth.change_password(u["id"], str(data.get("current") or ""), str(data.get("new") or ""))
    return {"ok": True, "message": "Password changed. Please sign in again."}


def directory(filters: Dict[str, Any], user: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return auth.directory(filters, user)


def institution_list(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Institutions with how many learners each one has, filtered by state/district/city/kind."""
    counts: Dict[str, int] = defaultdict(int)
    for l in store.all_learners():
        if l.get("institution_id") and auth.is_listed(l):
            counts[l["institution_id"]] += 1
    state = security.clean_text(filters.get("state"), max_len=60)
    district = security.clean_text(filters.get("district"), max_len=60)
    city = security.clean_text(filters.get("city"), max_len=60)
    kind = security.clean_text(filters.get("kind"), max_len=30)
    q = security.clean_text(filters.get("q"), max_len=60).lower()
    rows = []
    for i in institutions.all_institutions():
        if state and i["state"] != state:
            continue
        if district and i["district"] != district:
            continue
        if city and i["city"] != city:
            continue
        if kind and i["kind"] != kind:
            continue
        if q and q not in f"{i['name']} {i['city']} {i['district']}".lower():
            continue
        rows.append({**i, "label": institutions.KIND_LABELS.get(i["kind"], i["kind"]), "students": counts.get(i["id"], 0)})
    return {"institutions": rows, "total": len(rows), "geography": institutions.geography(),
            "note": institutions.SOURCE_NOTE}


def faculty_list(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Faculty members students can contact, with their institution."""
    inst = security.clean_text(filters.get("institution_id"), max_len=60)
    rows = []
    for f in store.list_users(role="faculty", institution_id=inst or None):
        rows.append({"id": f["id"], "name": f["name"], "department": f["department"], "demo": auth.is_demo_user(f),
                     "institution": f["institution"], "institution_id": f["institution_id"],
                     "city": f["city"], "district": f["district"], "state": f["state"]})
    return {"faculty": rows, "total": len(rows)}


def faculty_students(user: Optional[Dict[str, Any]], filters: Dict[str, Any]) -> Dict[str, Any]:
    """A faculty member's own students, with the detail they are allowed to see."""
    u = auth.require(user, "faculty", "admin")
    inst = u.get("institution_id")
    if u["role"] == "admin":
        inst = security.clean_text(filters.get("institution_id"), max_len=60) or inst
    rows, needs_help = [], []
    for l in store.all_learners():
        if u["role"] != "admin" and (l.get("institution_id") or "") != (inst or "\x00"):
            continue
        if u["role"] == "admin" and inst and (l.get("institution_id") or "") != inst:
            continue
        if not auth.can_view_learner(u, l):
            continue
        m, rm = l.get("match", {}), l.get("roadmap", {})
        scores = [a["score"] for a in l.get("assessments", [])]
        row = {"id": l["id"], "name": l.get("name"), "education": l.get("education"),
               "target_role": l.get("target_role"), "industry": m.get("industry"),
               "readiness": m.get("readiness", 0), "active": rm.get("active"),
               "assessments": len(scores), "avg_score": round(sum(scores) / len(scores)) if scores else None,
               "hours": round(sum(e.get("hours", 0) for e in l.get("study_log", [])), 1),
               "remedial": list(l.get("remedial", {})), "dream_company": l.get("dream_company"),
               "missing": m.get("missing", [])[:4]}
        rows.append(row)
        reasons = []
        if row["readiness"] < 35:
            reasons.append("low readiness")
        if max(l.get("fail_streak", {}).values(), default=0) >= 2:
            reasons.append("repeated failed assessments")
        if row["remedial"]:
            reasons.append("in remedial lab")
        if reasons:
            needs_help.append({**row, "reasons": reasons})
    gaps: Dict[str, int] = defaultdict(int)
    for r in rows:
        for sk in r["missing"]:
            gaps[sk] += 1
    return {"institution": u.get("institution") if u["role"] != "admin" else (inst or "All institutions"),
            "students": sorted(rows, key=lambda r: r["readiness"]), "needs_help": needs_help,
            "common_gaps": sorted(({"skill": k, "students": v} for k, v in gaps.items()),
                                  key=lambda g: -g["students"])[:8],
            "avg_readiness": round(sum(r["readiness"] for r in rows) / len(rows)) if rows else 0}


def student_detail(user: Optional[Dict[str, Any]], learner_id: str) -> Dict[str, Any]:
    """Full profile - only for the owner, their faculty, or an admin."""
    learner = store.get(learner_id)
    if not learner:
        raise NotFound("Student not found")
    if not auth.can_view_learner(user, learner):
        raise auth.Forbidden("You can only open profiles of students at your own institution.")
    return {"learner": learner, "trace": [], "can_edit": auth.can_edit_learner(user, learner)}


def contact(data: Dict[str, Any]) -> Dict[str, Any]:
    name = security.clean_text(data.get("name"), max_len=80)
    email = security.clean_email(data.get("email"))
    subject = security.clean_text(data.get("subject"), max_len=120)
    message = security.clean_text(data.get("message"), max_len=4000, allow_newlines=True)
    if len(name) < 2:
        raise BadRequest("Please enter your name.")
    if not email:
        raise BadRequest("Please enter a valid email address.")
    if len(message) < 10:
        raise BadRequest("Please write a message of at least 10 characters.")
    if data.get("website"):                       # honeypot field - bots fill it, people do not
        return {"ok": True, "id": 0}
    cid = store.add_contact({"name": name, "email": email, "subject": subject or "(no subject)",
                             "message": message, "institution": security.clean_text(data.get("institution"), max_len=120)})
    return {"ok": True, "id": cid, "message": "Thank you - your message has been saved."}


def contact_inbox(user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    auth.require(user, "admin")
    return {"messages": store.list_contacts(), "total": store.count_contacts()}


def leaderboard(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Friendly competition: ranks learners by verified progress."""
    scope = security.clean_text(filters.get("scope"), max_len=20) or "all"
    inst = security.clean_text(filters.get("institution_id"), max_len=60)
    rows = []
    for l in store.all_learners():
        if not auth.is_listed(l):
            continue
        if scope == "institution" and inst and (l.get("institution_id") or "") != inst:
            continue
        a = l.get("assessments", [])
        passed = sum(1 for x in a if x["passed"])
        hours = sum(e.get("hours", 0) for e in l.get("study_log", []))
        verified = sum(1 for p in (l.get("proficiency") or {}).values() if p.get("confidence") == "verified")
        game = int((l.get("game") or {}).get("points", 0))
        points = round(passed * 100 + verified * 60 + hours * 10 + (l.get("match", {}).get("readiness", 0)) * 2 + game)
        rows.append({"id": l["id"], "name": l.get("name"), "institution": l.get("institution"),
                     "institution_id": l.get("institution_id"), "role": l.get("target_role"),
                     "readiness": l.get("match", {}).get("readiness", 0), "passed": passed,
                     "verified": verified, "hours": round(hours, 1), "points": points, "game_points": game,
                     "demo": bool(l.get("demo"))})
    rows.sort(key=lambda r: -r["points"])
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    return {"scope": scope, "rows": rows[:100], "total": len(rows)}


# ---------------------------------------------------------------------------
# Games, messages to faculty, admin
# ---------------------------------------------------------------------------
GAMES = ("arena", "blitz", "dash", "bridge", "memory", "duel")


def game_result(learner_id: str, data: Dict[str, Any], user: Optional[Dict[str, Any]] = TRUSTED) -> Dict[str, Any]:
    """Record points from a game so they count on the leaderboard. Capped per submission."""
    learner = _load(learner_id, user, write=True)
    game = security.clean_choice(data.get("game"), GAMES, "")
    if not game:
        raise BadRequest("Unknown game.")
    points = security.clean_int(data.get("points"), 0, 300, 0)
    g = learner.setdefault("game", {"points": 0, "plays": 0, "best": {}})
    g["points"] = min(1_000_000, int(g.get("points", 0)) + points)
    g["plays"] = int(g.get("plays", 0)) + 1
    g.setdefault("best", {})[game] = max(int(g["best"].get(game, 0)), points)
    store.save(learner)
    return {"ok": True, "game": g}


def _public_message(m: Dict[str, Any], me_id: str) -> Dict[str, Any]:
    return {"id": m["id"], "from_name": m["from_name"], "to_name": m["to_name"], "body": m["body"],
            "created": m["created"], "reply": m["reply"], "replied": m["replied"],
            "direction": "received" if m["to_user"] == me_id else "sent"}


def ask_faculty(user: Optional[Dict[str, Any]], faculty_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """A signed-in user sends a question to a faculty member. Stored in the database;
    the faculty member reads and answers it in the faculty portal. Emails are never exposed."""
    u = auth.require(user)
    target = store.get_user(security.clean_text(faculty_id, max_len=60))
    if not target or target.get("role") != "faculty":
        raise NotFound("Faculty member not found")
    body = security.clean_text(data.get("message"), max_len=2000, allow_newlines=True)
    if len(body) < 10:
        raise BadRequest("Please write a question of at least 10 characters.")
    mid = store.add_message(u["id"], u["name"], target["id"], target["name"], body)
    return {"ok": True, "id": mid, "message": f"Sent to {target['name']}. Their answer will appear on this page."}


def my_messages(user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    u = auth.require(user)
    rows = [_public_message(m, u["id"]) for m in store.messages_for(u["id"])]
    return {"messages": rows, "unanswered": sum(1 for m in rows if m["direction"] == "received" and not m["reply"])}


def reply_message(user: Optional[Dict[str, Any]], message_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Only the faculty member the question was sent to can answer it."""
    u = auth.require(user, "faculty", "admin")
    m = store.get_message(security.clean_int(message_id, 1, 10**12, 0))
    if not m or m["to_user"] != u["id"]:
        raise NotFound("Message not found")
    reply = security.clean_text(data.get("reply"), max_len=2000, allow_newlines=True)
    if len(reply) < 2:
        raise BadRequest("Please write a reply.")
    store.reply_message(m["id"], reply)
    return {"ok": True}


def admin_users(user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    auth.require(user, "admin")
    rows = [{k: u.get(k) for k in ("id", "name", "email", "role", "institution", "department", "created", "last_login")}
            | {"demo": auth.is_demo_user(u)} for u in store.list_users()]
    return {"users": rows, "total": len(rows)}


# ---------------------------------------------------------------------------
# Data consent & privacy (GDPR / India DPDP Act)
# ---------------------------------------------------------------------------
def get_consent(user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Current consent switches. Guests get the defaults so the UI works before sign-up."""
    return {"consent": auth.get_consent(user), "signed_in": bool(user),
            "categories": PRIVACY_CATEGORIES, "collected": DATA_WE_KEEP}


def save_consent(user: Optional[Dict[str, Any]], data: Dict[str, Any]) -> Dict[str, Any]:
    u = auth.require(user)
    consent = auth.clean_consent(data if isinstance(data, dict) else {})
    store.update_user(u["id"], {"consent": json.dumps(consent)})
    return {"ok": True, "consent": consent}


def export_my_data(user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Download everything we hold about this account (data portability)."""
    u = auth.require(user)
    full = store.get_user(u["id"]) or u
    learner = store.get(full.get("learner_id")) if full.get("learner_id") else None
    msgs = [{k: m[k] for k in ("id", "from_name", "to_name", "body", "created", "reply", "replied")}
            for m in store.messages_for(u["id"])]
    return auth.export_account(full, learner, msgs)


def delete_my_account(user: Optional[Dict[str, Any]], data: Dict[str, Any]) -> Dict[str, Any]:
    """Erase the account, its learner profile, its messages and its contact messages. Cannot be undone."""
    u = auth.require(user)
    if str(data.get("confirm") or "").strip().upper() != "DELETE":
        raise BadRequest('Please type DELETE to confirm.')
    if auth.is_demo_user(u):
        raise auth.Forbidden("The shared demo account cannot be deleted.")
    counts = store.delete_user_fully(u["id"], u.get("learner_id"))
    return {"ok": True, "deleted": counts,
            "message": "Your account and all data linked to it have been permanently deleted."}


PRIVACY_CATEGORIES = [
    {"key": "essential", "name": "Essential", "required": True,
     "what": "Your sign-in session, your saved preferences (theme, text size) and basic security counters.",
     "why": "Without these the site cannot keep you signed in or protect accounts from password guessing.",
     "legal": "Necessary for the service you asked for (GDPR Art. 6(1)(b); DPDP: legitimate use)."},
    {"key": "analytics", "name": "Analytics", "required": False,
     "what": "Anonymous counts of which pages and features are used.",
     "why": "Helps us see which parts of the platform actually help students. Off until you switch it on.",
     "legal": "Consent (GDPR Art. 6(1)(a); DPDP s.6)."},
    {"key": "marketing", "name": "Marketing", "required": False,
     "what": "Emails about new features, and no advertising cookies of any kind.",
     "why": "Only if you want to hear from us. Off by default.",
     "legal": "Consent; you can withdraw it here at any time."},
    {"key": "ai_processing", "name": "AI processing", "required": False,
     "what": "Sending your typed answers or resume text to Google Gemini to grade or extract skills.",
     "why": "Optional. With this off, everything is graded by the built-in rules on this server instead "
            "- you keep the full platform, nothing leaves it.",
     "legal": "Consent; a processor outside this server is involved only when it is on."},
]

DATA_WE_KEEP = [
    ("Account", "Name, email, role, college, department.", "To sign you in and show you to your own faculty."),
    ("Password", "Never stored. Only an unreadable PBKDF2-SHA256 hash is kept.", "So nobody - including us - can read it."),
    ("Learner profile", "Skills, certificates, projects, goal, dream company, study hours.", "To build your roadmap and career match."),
    ("Progress", "Assessment scores, study hours, game points, achievements.", "To track progress and adapt your plan."),
    ("Messages", "Questions you send to faculty and their replies.", "So you can read the answers."),
    ("Contact messages", "Anything you send through the contact form.", "So we can reply."),
    ("Technical", "Your IP address is used in memory for rate limiting and is never written to a file or database.", "To stop abuse."),
]
