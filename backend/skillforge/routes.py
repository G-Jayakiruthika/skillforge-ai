"""
routes.py - one route table used by BOTH servers (FastAPI and the stdlib
dev server), so they can never drift apart.
Each handler gets (path_params, query, body) and returns a JSON-able dict.
"""
from __future__ import annotations

import re
from typing import Any, Callable, Dict, List, Tuple

from . import service as s

Handler = Callable[[Dict[str, str], Dict[str, str], Dict[str, Any]], Any]

ROUTES: List[Tuple[str, str, Handler]] = [
    ("GET", r"/api/health", lambda p, q, b: s.health()),
    ("GET", r"/api/meta", lambda p, q, b: s.meta()),
    ("GET", r"/api/learners", lambda p, q, b: s.list_learners()),
    ("POST", r"/api/learners", lambda p, q, b: s.save_profile(b)),
    ("GET", r"/api/learners/(?P<lid>[\w-]+)", lambda p, q, b: s.get_learner(p["lid"])),
    ("POST", r"/api/learners/(?P<lid>[\w-]+)/assess",
     lambda p, q, b: s.assess(p["lid"], b.get("skill", ""), b.get("mode", "quiz"), b.get("answers"),
                              b.get("text", ""), b.get("score"))),
    ("POST", r"/api/learners/(?P<lid>[\w-]+)/pivot", lambda p, q, b: s.pivot(p["lid"], b.get("target_role", ""))),
    ("POST", r"/api/learners/(?P<lid>[\w-]+)/progress",
     lambda p, q, b: s.log_progress(p["lid"], b.get("skill", ""), float(b.get("hours") or 0), b.get("note", ""))),
    ("POST", r"/api/learners/(?P<lid>[\w-]+)/chat", lambda p, q, b: s.mentor_chat(p["lid"], b.get("question", ""))),
    ("POST", r"/api/resume/extract", lambda p, q, b: s.extract_resume(b.get("text", ""))),
    ("GET", r"/api/quiz", lambda p, q, b: s.quiz(q.get("skill", ""))),
    ("POST", r"/api/quiz/check",
     lambda p, q, b: s.quiz_check(b.get("skill", ""), b.get("index"), b.get("answer"))),
    ("GET", r"/api/cohort", lambda p, q, b: s.cohort(q.get("organization") or None)),
    ("POST", r"/api/demo/reset", lambda p, q, b: s.seed_demo(reset=True)),
]

_COMPILED = [(m, re.compile(f"^{pat}$"), h) for m, pat, h in ROUTES]


def dispatch(method: str, path: str, query: Dict[str, str], body: Dict[str, Any]) -> Tuple[int, Any]:
    """Returns (status_code, payload)."""
    allowed = False
    for m, rx, h in _COMPILED:
        match = rx.match(path)
        if not match:
            continue
        allowed = True
        if m != method:
            continue
        try:
            return 200, h(match.groupdict(), query, body or {})
        except s.NotFound as e:
            return 404, {"detail": str(e)}
        except (s.BadRequest, ValueError, TypeError) as e:
            return 400, {"detail": str(e)}
    return (405, {"detail": "Method not allowed"}) if allowed else (404, {"detail": "Not found"})
