"""Run:  python -m pytest -q   (from the backend folder)"""
import os
import sys
import tempfile
from pathlib import Path

os.environ["SKILLFORGE_DB"] = str(Path(tempfile.mkdtemp()) / "test.db")
os.environ.pop("GEMINI_API_KEY", None)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from skillforge import agents, routes, service  # noqa: E402
from skillforge.knowledge import SKILLS  # noqa: E402


@pytest.fixture(autouse=True)
def fresh():
    service.seed_demo(reset=True)


def jane():
    return service.get_learner("jane-doe")["learner"]


def test_normalization_and_sample_scenario():
    assert agents.normalize_skill("basic HTML") == ("HTML/CSS", "beginner")
    assert agents.normalize_skill("py")[0] == "Python"
    m = jane()["match"]
    assert m["role"] == "Full Stack Developer"
    for s in ("JavaScript", "React", "Node.js"):
        assert s in m["missing"]
    assert "HTML/CSS" in m["partial"]          # basic HTML is below role level


def test_roadmap_respects_prerequisites():
    nodes = {n["skill"]: n for n in jane()["roadmap"]["nodes"]}
    assert nodes["JavaScript"]["status"] == "locked"   # HTML/CSS not at working level yet
    assert nodes["React"]["status"] == "locked"
    order = [n["skill"] for n in jane()["roadmap"]["nodes"]]
    assert order.index("HTML/CSS") < order.index("JavaScript") < order.index("React")


def test_fail_injects_remedial_then_pass_clears_it():
    r = service.assess("jane-doe", "HTML/CSS", answers=[0, 0, 1])  # all wrong
    L = r["learner"]
    assert "HTML/CSS" in L["remedial"]
    assert L["roadmap"]["nodes"][0]["is_remedial"]
    assert L["roadmap"]["active"] == "HTML/CSS"
    assert {t["agent"] for t in r["trace"]} >= {"Supervisor", "Assessor", "Path Architect", "Mentor"}
    r = service.assess("jane-doe", "HTML/CSS", answers=[q["answer"] for q in SKILLS["HTML/CSS"]["quiz"]])
    L = r["learner"]
    assert "HTML/CSS" not in L["remedial"]
    nodes = {n["skill"]: n for n in L["roadmap"]["nodes"] if not n["is_remedial"]}
    assert nodes["JavaScript"]["status"] in ("active", "available")   # unlocked


def test_second_failure_adapts_format():
    service.assess("jane-doe", "HTML/CSS", mode="simulate", score=40)
    L = service.assess("jane-doe", "HTML/CSS", mode="simulate", score=40)["learner"]
    assert L["remedial"]["HTML/CSS"]["attempts"] == 2
    node = next(n for n in L["roadmap"]["nodes"] if n["skill"] == "HTML/CSS" and not n["is_remedial"])
    assert node["resources"][0]["type"] == "video"


def test_explanation_rubric():
    good = ("Flexbox is one-dimensional for a row or a column, CSS grid is two-dimensional. "
            "Use semantic tags like nav and a media query for responsive mobile layouts.")
    score, missed, _, grader = agents.grade_explanation("HTML/CSS", good)
    assert score >= 90 and not missed and grader == "concept rubric"
    assert agents.grade_explanation("HTML/CSS", "it is css")[0] < 60


def test_pivot_keeps_mastered_skills():
    before = jane()["proficiency"]["SQL"]["score"]
    L = service.pivot("jane-doe", "Data Engineer")["learner"]
    assert L["target_role"] == "Data Engineer"
    assert L["proficiency"]["SQL"]["score"] == before
    assert {n["skill"] for n in L["roadmap"]["nodes"]} >= {"Apache Spark", "Airflow"}


def test_progress_and_cohort_and_routes():
    L = service.log_progress("jane-doe", "HTML/CSS", 3)["learner"]
    assert sum(e["hours"] for e in L["study_log"]) == 3
    c = service.cohort()
    assert c["learners"] == 9 and c["skill_gaps"]
    assert routes.dispatch("GET", "/api/health", {}, {})[0] == 200
    assert routes.dispatch("GET", "/api/learners/nope", {}, {})[0] == 404
    assert routes.dispatch("POST", "/api/learners/jane-doe/pivot", {}, {"target_role": "Astronaut"})[0] == 400
    code, quiz, _ = routes.dispatch("GET", "/api/quiz", {"skill": "HTML/CSS"}, {})
    assert code == 200 and "answer" not in quiz["questions"][0]   # answers never sent to browser


def test_resume_extraction():
    r = service.extract_resume("Built REST APIs with Express and React.js; comfortable with PostgreSQL and Git")
    names = {s["name"] for s in r["skills"]}
    assert {"React", "Node.js", "SQL", "Git", "REST APIs"} <= names


def test_company_matching_and_industries():
    m = jane()["match"]
    assert m["dream"]["company"] == "Zoho" and 0 <= m["dream"]["readiness"] <= 100
    assert len(m["industry_ranking"]) == 9
    assert all("Full Stack Developer" in c["role"] for c in m["companies_for_role"])
    karthik = service.get_learner("karthik-r")["learner"]["match"]
    assert karthik["industry"] == "Mechanical & Manufacturing"
    assert service.get_learner("priya-m")["learner"]["proficiency"]["Advanced Excel"]["score"] > 0  # 'excel' -> Advanced Excel
