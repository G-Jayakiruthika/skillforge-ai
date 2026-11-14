"""The browser engine (frontend/js/engine.js) must make the same decisions as Python."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def test_knowledge_js_in_sync():
    import export_knowledge
    assert (ROOT.parent / "frontend/js/knowledge.js").read_text(encoding="utf-8") == export_knowledge.build(), \
        "Run: python export_knowledge.py"


@pytest.mark.skipif(not shutil.which("node"), reason="node not installed")
def test_js_engine_matches_python(monkeypatch):
    os.environ["SKILLFORGE_DB"] = str(Path(tempfile.mkdtemp()) / "p.db")
    from skillforge import service, store
    monkeypatch.setattr(store, "DB_PATH", Path(os.environ["SKILLFORGE_DB"]))
    service.seed_demo(reset=True)

    py_mentor = {}

    def snap(L, step=None):
        py_mentor[step] = L["mentor"]["message"]
        return {"readiness": L["match"]["readiness"], "matched": L["match"]["matched"], "partial": L["match"]["partial"],
                "missing": L["match"]["missing"],
                "prof": {k: [v["score"], v["confidence"]] for k, v in L["proficiency"].items()},
                "nodes": [[n.get("title") or n["skill"], n["status"], n["est_hours"]] for n in L["roadmap"]["nodes"]],
                "active": L["roadmap"]["active"], "hours": L["roadmap"]["hours_remaining"], "weeks": L["roadmap"]["eta_weeks"],
                "remedial": list(L.get("remedial", {})), "resources0": [(n["resources"][:1] or [{}])[0].get("type") for n in L["roadmap"]["nodes"]],
                "industries": sorted([x["industry"], x["role"], x["readiness"]] for x in L["match"]["industry_ranking"]),
                "companies": sorted([c["company"], c["readiness"], c["gaps"]] for c in L["match"]["companies_for_role"]),
                "dream": L["match"]["dream"]}

    py = {"seed": snap(service.get_learner("jane-doe")["learner"], "seed"),
          "fail1": snap(service.assess("jane-doe", "HTML/CSS", "simulate", score=40)["learner"], "fail1"),
          "fail2": snap(service.assess("jane-doe", "HTML/CSS", "explain", text="css grid")["learner"], "fail2"),
          "pass": snap(service.assess("jane-doe", "HTML/CSS", "quiz", answers=[1, 1, 0])["learner"], "pass"),
          "progress": snap(service.log_progress("jane-doe", "JavaScript", 3)["learner"], "progress"),
          "pivot": snap(service.pivot("jane-doe", "Data Engineer")["learner"], "pivot")}
    c = service.cohort()
    py["cohort"] = {"avg": c["avg_readiness"], "gaps": [[g["skill"], g["pct_lacking"], g["avg_gap"]] for g in c["skill_gaps"]],
                    "risk": sorted(a["id"] for a in c["at_risk"])}
    py["resume"] = sorted(s["name"] for s in service.extract_resume(
        "Built REST APIs with Express and React.js; PostgreSQL, Git, pandas")["skills"])

    js = json.loads(subprocess.run(["node", str(ROOT / "tests/parity_runner.mjs")], capture_output=True, text=True,
                                   check=True).stdout)
    for step in ("seed", "fail1", "fail2", "pass", "progress", "pivot"):
        js_step = {k: v for k, v in js[step].items() if k != "mentor"}
        assert js[step]["mentor"].replace(".0h", "h") == py_mentor[step].replace(".0h", "h"), step
        assert js_step == py[step], step
    assert sorted(js["cohort"].pop("gaps")) == sorted(py["cohort"].pop("gaps"))
    assert js["cohort"] == py["cohort"]
    assert js["resume"] == py["resume"]
