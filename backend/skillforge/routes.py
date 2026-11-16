"""
routes.py - one route table used by BOTH servers (FastAPI and the stdlib dev server),
so they can never drift apart - and so every security rule is applied in one place.

Each handler receives a Ctx: path params, query, body, the signed-in user and the client IP.
Routes declare the roles they need; `dispatch` enforces them before the handler runs
(fail closed), applies rate limits, and converts exceptions into safe error messages.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from . import auth, security
from . import service as s


@dataclass
class Ctx:
    params: Dict[str, str] = field(default_factory=dict)
    query: Dict[str, str] = field(default_factory=dict)
    body: Dict[str, Any] = field(default_factory=dict)
    user: Optional[Dict[str, Any]] = None
    ip: str = ""
    token: Optional[str] = None
    set_cookie: Optional[str] = None          # handler writes a token here to start a session
    clear_cookie: bool = False


Handler = Callable[[Ctx], Any]
# (method, pattern, handler, required_roles)  - empty roles = public
Route = Tuple[str, str, Handler, Tuple[str, ...]]


def _signup(c: Ctx) -> Any:
    out = s.signup(c.body, ip=c.ip)
    c.set_cookie = out.pop("token")
    return out


def _login(c: Ctx) -> Any:
    out = s.login(c.body, ip=c.ip)
    c.set_cookie = out.pop("token")
    return out


def _demo(c: Ctx) -> Any:
    out = s.demo_login(c.body)
    c.set_cookie = out.pop("token")
    return out


def _delete_me(c: Ctx) -> Any:
    out = s.delete_my_account(c.user, c.body)
    c.clear_cookie = True                      # the session is gone with the account
    return out


def _logout(c: Ctx) -> Any:
    auth.logout(c.token)
    c.clear_cookie = True
    return {"ok": True}


ROUTES: List[Route] = [
    # --- public ---------------------------------------------------------
    ("GET", r"/api/health", lambda c: s.health(), ()),
    ("GET", r"/api/meta", lambda c: s.meta(), ()),
    ("GET", r"/api/institutions", lambda c: s.institution_list(c.query), ()),
    ("GET", r"/api/directory", lambda c: s.directory(c.query, c.user), ()),
    ("GET", r"/api/faculty", lambda c: s.faculty_list(c.query), ()),
    ("GET", r"/api/leaderboard", lambda c: s.leaderboard(c.query), ()),
    ("POST", r"/api/contact", lambda c: s.contact(c.body), ()),
    ("POST", r"/api/auth/signup", _signup, ()),
    ("POST", r"/api/auth/login", _login, ()),
    ("POST", r"/api/auth/demo", _demo, ()),
    ("POST", r"/api/auth/logout", _logout, ()),
    ("GET", r"/api/auth/me", lambda c: s.me(c.user), ()),
    ("POST", r"/api/auth/password", lambda c: s.change_password(c.user, c.body), ("student", "faculty", "admin")),
    # Reset and verification: the token in the body is the only credential needed,
    # so these three stay public. See auth.py for the no-enumeration rule.
    ("POST", r"/api/auth/forgot", lambda c: s.forgot_password(c.body, c.ip), ()),
    ("POST", r"/api/auth/reset", lambda c: s.reset_password(c.body), ()),
    ("POST", r"/api/auth/verify", lambda c: s.verify_email(c.body), ()),
    ("POST", r"/api/auth/verify/send", lambda c: s.send_verification(c.user), ("student", "faculty", "admin")),
    # --- data consent & privacy (GDPR / DPDP) ----------------------------
    ("GET", r"/api/privacy/consent", lambda c: s.get_consent(c.user), ()),
    ("POST", r"/api/privacy/consent", lambda c: s.save_consent(c.user, c.body), ("student", "faculty", "admin")),
    ("GET", r"/api/privacy/export", lambda c: s.export_my_data(c.user), ("student", "faculty", "admin")),
    ("POST", r"/api/privacy/delete", _delete_me, ("student", "faculty", "admin")),
    # --- learner workspace: every handler receives the caller; service._load enforces
    #     "demo sandbox = open, real profile = owner / own faculty (read) / admin" ----------
    ("GET", r"/api/learners", lambda c: s.list_learners(c.user), ()),
    ("POST", r"/api/learners", lambda c: s.save_profile(c.body, c.user), ()),
    ("GET", r"/api/learners/(?P<lid>[\w-]+)", lambda c: s.get_learner(c.params["lid"], c.user), ()),
    ("POST", r"/api/learners/(?P<lid>[\w-]+)/assess",
     lambda c: s.assess(c.params["lid"], c.body.get("skill", ""), c.body.get("mode", "quiz"),
                        c.body.get("answers"), c.body.get("text", ""), c.body.get("score"), user=c.user), ()),
    ("POST", r"/api/learners/(?P<lid>[\w-]+)/pivot",
     lambda c: s.pivot(c.params["lid"], c.body.get("target_role", ""), user=c.user), ()),
    ("POST", r"/api/learners/(?P<lid>[\w-]+)/progress",
     lambda c: s.log_progress(c.params["lid"], c.body.get("skill", ""), float(c.body.get("hours") or 0),
                              c.body.get("note", ""), user=c.user), ()),
    ("POST", r"/api/learners/(?P<lid>[\w-]+)/chat",
     lambda c: s.mentor_chat(c.params["lid"], c.body.get("question", ""), user=c.user), ()),
    ("POST", r"/api/learners/(?P<lid>[\w-]+)/game",
     lambda c: s.game_result(c.params["lid"], c.body, user=c.user), ()),
    ("POST", r"/api/resume/extract", lambda c: s.extract_resume(c.body.get("text", "")), ()),
    ("GET", r"/api/quiz", lambda c: s.quiz(c.query.get("skill", "")), ()),
    ("POST", r"/api/quiz/check",
     lambda c: s.quiz_check(c.body.get("skill", ""), c.body.get("index"), c.body.get("answer")), ()),
    ("GET", r"/api/cohort", lambda c: s.cohort(c.query.get("organization") or None, user=c.user), ()),
    ("POST", r"/api/demo/reset", lambda c: s.seed_demo(reset=True, user=c.user), ()),
    # --- signed in, role restricted --------------------------------------
    ("GET", r"/api/students/(?P<lid>[\w-]+)",
     lambda c: s.student_detail(c.user, c.params["lid"]), ("student", "faculty", "admin")),
    ("GET", r"/api/faculty/students", lambda c: s.faculty_students(c.user, c.query), ("faculty", "admin")),
    ("POST", r"/api/faculty/(?P<fid>[\w-]+)/ask",
     lambda c: s.ask_faculty(c.user, c.params["fid"], c.body), ("student", "faculty", "admin")),
    ("GET", r"/api/messages", lambda c: s.my_messages(c.user), ("student", "faculty", "admin")),
    ("POST", r"/api/messages/(?P<mid>\d+)/reply",
     lambda c: s.reply_message(c.user, c.params["mid"], c.body), ("faculty", "admin")),
    # --- admin only -------------------------------------------------------
    ("GET", r"/api/admin/contacts", lambda c: s.contact_inbox(c.user), ("admin",)),
    ("GET", r"/api/admin/users", lambda c: s.admin_users(c.user), ("admin",)),
    ("GET", r"/api/admin/config",
     lambda c: {**security.Env.report(), "warnings": security.Env.warnings()}, ("admin",)),
]

_COMPILED = [(m, re.compile(f"^{pat}$"), h, roles) for m, pat, h, roles in ROUTES]


def dispatch(method: str, path: str, query: Dict[str, str], body: Dict[str, Any],
             *, user: Optional[Dict[str, Any]] = None, ip: str = "", token: Optional[str] = None,
             rate_limit: bool = True, origin: Optional[str] = None, host: Optional[str] = None) -> Tuple[int, Any, Ctx]:
    """Returns (status, payload, ctx). ctx carries any cookie the handler wants set."""
    c = Ctx(query=query or {}, body=body or {}, user=user, ip=ip, token=token)

    # CSRF: a state-changing request that a browser sent from another site is refused.
    if method != "GET" and not security.same_origin(origin, host):
        return 403, {"detail": "Cross-site request blocked."}, c

    if rate_limit and path.startswith("/api/"):
        limit, window, block = security.rate_rule_for(path)
        ok, retry = security.limiter.check(security.client_key(ip or "local", path), limit, window, block=block)
        if not ok:
            return 429, {"detail": f"Too many requests. Please wait {retry} second(s) and try again."}, c

    s.apply_consent(user)          # outside AI processing only with this user's opt-in
    allowed = False
    for m, rx, h, roles in _COMPILED:
        match = rx.match(path)
        if not match:
            continue
        allowed = True
        if m != method:
            continue
        c.params = match.groupdict()
        try:
            if roles:
                auth.require(user, *roles)
            return 200, h(c), c
        except auth.AuthError as e:
            return 401, {"detail": str(e)}, c
        except auth.Forbidden as e:
            return 403, {"detail": str(e)}, c
        except s.NotFound as e:
            return 404, {"detail": str(e)}, c
        except (s.BadRequest, auth.BadRequest, ValueError, TypeError) as e:
            return 400, {"detail": str(e)}, c
        except KeyError:
            return 400, {"detail": "A required field is missing."}, c
        except Exception as e:                                   # never leak internals
            import logging
            logging.getLogger("skillforge").exception("Unhandled error on %s %s", method, path)
            return 500, {"detail": security.safe_error(e)}, c
    return (405, {"detail": "Method not allowed"}, c) if allowed else (404, {"detail": "Not found"}, c)
