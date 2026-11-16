"""
auth.py - accounts, sessions and access control.

Roles
  student  - owns one learner profile; may read only their own full profile
  faculty  - may read full profiles of students at their own institution
  admin    - may read everything and the contact inbox

Every protected endpoint goes through require() / can_view_learner(), so a missing
check fails closed rather than open.
"""
from __future__ import annotations

import re
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from . import mail, store
from .institutions import find as find_institution
from .security import (Env, clean_choice, clean_email, clean_int, clean_text, hash_password,
                       limiter, make_token, password_problem, token_fingerprint, verify_password)

ROLES = ("student", "faculty", "admin")
DEMO_DOMAIN = "@demo.skillforge.test"       # reserved: demo accounts only, cannot be registered
TRUSTED = {"id": "__internal__", "role": "admin", "trusted": True}   # server-side callers (seed, tests)
MIN_SIGNUP_AGE = 18                         # see the age gate in signup() and legal/README.md
TERMS_VERSION = "2026-11-16"                # bump when the published terms change materially
RESET_TTL_MINUTES = 60
VERIFY_TTL_HOURS = 24


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def _truthy(v: Any) -> bool:
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def is_demo_user(user: Optional[Dict[str, Any]]) -> bool:
    return bool(user) and str(user.get("email") or "").endswith(DEMO_DOMAIN)
SESSION_COOKIE = "sf_session"


class AuthError(Exception):
    """401 - not signed in, or credentials rejected."""


class Forbidden(Exception):
    """403 - signed in, but not allowed."""


class BadRequest(Exception):
    """400 - the submitted data is not acceptable."""


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:24] or "user"


# ---------------------------------------------------------------------------
def signup(data: Dict[str, Any], *, ip: str = "") -> Tuple[Dict[str, Any], str]:
    """Create an account. Returns (safe user, session token)."""
    name = clean_text(data.get("name"), max_len=80)
    email = clean_email(data.get("email"))
    password = str(data.get("password") or "")
    role = clean_choice(data.get("role"), ("student", "faculty"), "student")

    if len(name) < 2:
        raise BadRequest("Please enter your full name.")
    if not email:
        raise BadRequest("Please enter a valid email address.")
    problem = password_problem(password, email=email, name=name)
    if problem:
        raise BadRequest(problem)
    if data.get("confirm") is not None and str(data.get("confirm")) != password:
        raise BadRequest("The two passwords do not match.")
    if email.endswith(DEMO_DOMAIN) and not data.get("_demo"):
        raise BadRequest("That email domain is reserved. Please use your own email address.")
    # Age assurance. India's DPDP Act 2023 treats anyone under 18 as a child whose
    # personal data needs verifiable parental consent, which this product does not
    # implement, so self sign-up is 18+. Under-18s are meant to be enrolled by their
    # institution instead - see legal/README.md. We record only that the declaration
    # was made and when; a date of birth would be more personal data for no gain.
    if not data.get("_demo"):
        if not _truthy(data.get("age_confirmed")):
            raise BadRequest(
                f"You must confirm you are {MIN_SIGNUP_AGE} or over to create an account. "
                "If you are younger, ask your college to enrol you.")
        if not _truthy(data.get("terms_accepted")):
            raise BadRequest("Please accept the Terms of Service and the Privacy Policy.")
    if store.get_user_by_email(email):
        raise BadRequest("An account with that email already exists. Try signing in instead.")

    inst = find_institution(str(data.get("institution_id") or data.get("institution") or ""))
    user = {
        "id": f"{_slug(name)}-{uuid.uuid4().hex[:6]}",
        "email": email,
        "password_hash": hash_password(password),
        "name": name,
        "role": role,
        "learner_id": None,
        "institution_id": inst["id"] if inst else None,
        "institution": inst["name"] if inst else clean_text(data.get("institution"), max_len=120),
        "department": clean_text(data.get("department"), max_len=80),
        "city": inst["city"] if inst else clean_text(data.get("city"), max_len=60),
        "district": inst["district"] if inst else clean_text(data.get("district"), max_len=60),
        "state": inst["state"] if inst else clean_text(data.get("state"), max_len=60) or "Tamil Nadu",
        "age_confirmed": _now() if not data.get("_demo") else None,
        "terms_accepted": _now() if not data.get("_demo") else None,
        "terms_version": TERMS_VERSION if not data.get("_demo") else None,
    }
    # Who becomes admin?  Never chosen by the form.
    #  - SKILLFORGE_ADMIN_EMAIL set  -> only that email address
    #  - otherwise, on a private (non-public) install -> the first real account, so it is never ownerless
    #  - on a public server without SKILLFORGE_ADMIN_EMAIL -> nobody (fail closed)
    if not data.get("_demo"):
        if Env.admin_email:
            if email == Env.admin_email:
                user["role"] = "admin"
        elif not Env.public and not any(not is_demo_user(u) for u in store.list_users()):
            user["role"] = "admin"
    saved = store.create_user(user)
    token = _start_session(saved["id"])
    return saved, token


def login(data: Dict[str, Any], *, ip: str = "") -> Tuple[Dict[str, Any], str]:
    email = clean_email(data.get("email"))
    password = str(data.get("password") or "")
    # Per-account limiter as well as the per-IP one in the request layer.
    key = f"login|{email or ip}"
    ok, retry = limiter.check(key, 8, 300, block=900)
    if not ok:
        raise AuthError(f"Too many sign-in attempts. Try again in about {max(1, retry // 60)} minute(s).")

    row = store.get_user_by_email(email) if email else None
    # Always run a hash comparison so timing does not reveal whether the email exists.
    stored = row["password_hash"] if row else "pbkdf2_sha256$1000$00$00"
    if not verify_password(password, stored) or not row:
        raise AuthError("Email or password is incorrect.")

    limiter.reset(key)
    store.update_user(row["id"], {"last_login": time.strftime("%Y-%m-%d %H:%M:%S")})
    return store.get_user(row["id"]), _start_session(row["id"])  # type: ignore[return-value]


def _start_session(user_id: str) -> str:
    token = make_token()
    store.create_session(token_fingerprint(token), user_id, Env.session_hours * 3600)
    return token


def logout(token: Optional[str]) -> None:
    if token:
        store.end_session(token_fingerprint(token))


def user_for_token(token: Optional[str]) -> Optional[Dict[str, Any]]:
    return store.session_user(token_fingerprint(token)) if token else None


def change_password(user_id: str, current: str, new: str) -> None:
    row = store.get_user(user_id)
    full = store.get_user_by_email(row["email"]) if row else None
    if not full or not verify_password(current, full["password_hash"]):
        raise AuthError("Your current password is incorrect.")
    problem = password_problem(new, email=full["email"], name=full["name"])
    if problem:
        raise BadRequest(problem)
    store.update_user(user_id, {"password_hash": hash_password(new)})
    store.end_all_sessions(user_id)          # sign out everywhere after a password change


# ---------------------------------------------------------------------------
# Password reset and email verification.
#
# Two rules shape all of this:
#   * No user enumeration. Every response is the same whether or not the email
#     belongs to an account, so the endpoint cannot be used to discover who has
#     registered.
#   * The token is a secret the user holds; the database keeps only its HMAC
#     fingerprint, it works once, and it expires.
def _link(page: str, token: str) -> str:
    return f"{mail.base_url()}/{page}?token={token}"


def request_password_reset(data: Dict[str, Any], *, ip: str = "") -> Dict[str, Any]:
    """Send a reset link if the address belongs to an account. Says nothing either way."""
    email = clean_email(data.get("email"))
    generic = {"ok": True, "message": "If that email has an account, a reset link is on its way. "
                                      "Check your inbox, and your spam folder."}
    ok, _ = limiter.check(f"reset|{email or ip}", 5, 3600, block=0)
    if not ok or not email:
        return generic

    row = store.get_user_by_email(email)
    if not row or is_demo_user(row):
        return generic                      # same answer, same timing shape

    token = make_token()
    store.create_token(token_fingerprint(token), row["id"], "reset", RESET_TTL_MINUTES * 60)
    link = _link("reset.html", token)
    subject, body = mail.reset_email(row["name"], link, RESET_TTL_MINUTES)
    mail.send(row["email"], subject, body, link=link)   # a failure is not reported back, by design
    return generic


def reset_password(data: Dict[str, Any]) -> Dict[str, Any]:
    """Finish a reset. The token proves the user controls the mailbox."""
    token = str(data.get("token") or "").strip()
    password = str(data.get("password") or "")
    if not token:
        raise BadRequest("That reset link is incomplete. Please request a new one.")
    if data.get("confirm") is not None and str(data.get("confirm")) != password:
        raise BadRequest("The two passwords do not match.")

    user_id = store.consume_token(token_fingerprint(token), "reset")
    if not user_id:
        raise BadRequest("That reset link has expired or has already been used. "
                         "Please request a new one.")
    row = store.get_user(user_id)
    if not row:
        raise BadRequest("That account no longer exists.")

    problem = password_problem(password, email=row["email"], name=row["name"])
    if problem:
        # The token was consumed, so say so plainly rather than let them retry blindly.
        raise BadRequest(f"{problem} Please request a new reset link and try again.")

    store.update_user(user_id, {"password_hash": hash_password(password),
                                # Controlling the mailbox proves the address is theirs.
                                "email_verified": _now()})
    store.end_all_sessions(user_id)          # anyone already signed in is signed out
    return {"ok": True, "message": "Your password has been changed. You can sign in with it now."}


def request_verification(user: Dict[str, Any]) -> Dict[str, Any]:
    """Send a confirm-your-address link to the signed-in user."""
    if is_demo_user(user):
        raise BadRequest("The demo account has no email address to confirm.")
    if user.get("email_verified"):
        return {"ok": True, "message": "Your email address is already confirmed."}
    ok, retry = limiter.check(f"verify|{user['id']}", 4, 3600, block=0)
    if not ok:
        raise BadRequest(f"Too many emails requested. Try again in about {max(1, retry // 60)} minute(s).")

    token = make_token()
    store.create_token(token_fingerprint(token), user["id"], "verify", VERIFY_TTL_HOURS * 3600)
    link = _link("verify.html", token)
    subject, body = mail.verify_email(user["name"], link, VERIFY_TTL_HOURS)
    sent, error = mail.send(user["email"], subject, body, link=link)
    if not sent:
        raise BadRequest(error or "The email could not be sent.")
    return {"ok": True, "message": "Check your inbox for the confirmation link."}


def verify_email(data: Dict[str, Any]) -> Dict[str, Any]:
    token = str(data.get("token") or "").strip()
    user_id = store.consume_token(token_fingerprint(token), "verify") if token else None
    if not user_id:
        raise BadRequest("That confirmation link has expired or has already been used. "
                         "Sign in and ask for a new one.")
    store.update_user(user_id, {"email_verified": _now()})
    return {"ok": True, "message": "Thank you — your email address is confirmed."}


CONSENT_KEYS = ("essential", "analytics", "marketing", "ai_processing")
DEFAULT_CONSENT = {"essential": True, "analytics": False, "marketing": False, "ai_processing": False}


def clean_consent(data: Dict[str, Any]) -> Dict[str, Any]:
    """Only the four known switches; 'essential' can never be switched off (the site cannot work without it)."""
    out = {k: bool(data.get(k)) for k in CONSENT_KEYS}
    out["essential"] = True
    out["updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return out


def get_consent(user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    raw = (user or {}).get("consent")
    if isinstance(raw, str):
        try:
            import json as _json
            raw = _json.loads(raw)
        except Exception:
            raw = None
    return {**DEFAULT_CONSENT, "updated": None, **(raw or {})}


def export_account(user: Dict[str, Any], learner: Optional[Dict[str, Any]],
                   messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Everything this account's data holds, in plain JSON (GDPR / DPDP data portability)."""
    return {
        "exported": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "note": "This file contains everything SkillForge AI stores about your account. "
                "Your password is never included - only an unreadable hash is kept, and it is not exported.",
        "account": {k: v for k, v in user.items() if k != "password_hash"},
        "consent": get_consent(user),
        "learner_profile": learner,
        "messages": messages,
    }


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------
def require(user: Optional[Dict[str, Any]], *roles: str) -> Dict[str, Any]:
    """Fail closed: raises unless the user is signed in and holds one of the roles."""
    if not user:
        raise AuthError("Please sign in to continue.")
    if roles and user.get("role") not in roles:
        raise Forbidden("Your account does not have access to this area.")
    return user


def can_view_learner(user: Optional[Dict[str, Any]], learner: Dict[str, Any]) -> bool:
    """Full learner profiles.

    Demo learners are fictional sandbox data - anyone may open them.
    Real learners: the owner, faculty of the same institution, or an admin.
    Demo (passwordless) faculty accounts can never open a real student's profile.
    """
    if learner.get("demo"):
        return True
    if not user:
        return False
    if is_demo_user(user):
        return False
    if user.get("role") == "admin":
        return True
    if user.get("learner_id") and user["learner_id"] == learner.get("id"):
        return True
    if user.get("role") == "faculty":
        inst = (user.get("institution_id") or "").strip()
        return bool(inst) and inst == (learner.get("institution_id") or "").strip()
    return False


def can_edit_learner(user: Optional[Dict[str, Any]], learner: Dict[str, Any]) -> bool:
    """Who may change a learner: anyone for the demo sandbox; otherwise only the owner or an admin.
    Faculty can read their students but never edit them."""
    if learner.get("demo"):
        return True
    if not user or is_demo_user(user):
        return False
    if user.get("role") == "admin":
        return True
    return bool(user.get("learner_id")) and user["learner_id"] == learner.get("id")


def is_listed(learner: Dict[str, Any]) -> bool:
    """Shown in public directories / leaderboards? Students can switch this off."""
    return learner.get("listed", True) is not False


def demo_login(role: str = "faculty") -> Tuple[Dict[str, Any], str]:
    """Passwordless session for the demo faculty account. Disabled on public servers.
    The demo account can only ever see the fictional demo learners."""
    if Env.public:
        raise Forbidden("Demo logins are switched off on this server.")
    rows = [u for u in store.list_users(role="faculty") if is_demo_user(u)]
    if not rows:
        raise BadRequest("No demo account is available.")
    return rows[0], _start_session(rows[0]["id"])


def public_learner_card(learner: Dict[str, Any]) -> Dict[str, Any]:
    """What anyone browsing a directory may see - no email, no assessment history."""
    m = learner.get("match") or {}
    return {
        "id": learner.get("id"),
        "name": learner.get("name"),
        "education": learner.get("education"),
        "institution": learner.get("institution") or learner.get("organization"),
        "institution_id": learner.get("institution_id"),
        "city": learner.get("city"), "district": learner.get("district"), "state": learner.get("state"),
        "target_role": learner.get("target_role"),
        "industry": m.get("industry"),
        "readiness": m.get("readiness", 0),
        "top_skills": [s["skill"] for s in (learner.get("analysis", {}) or {}).get("strengths", [])[:4]],
        "dream_company": learner.get("dream_company"),
        "demo": bool(learner.get("demo")),
    }


def safe_user(user: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Strip anything that must never reach the browser."""
    if not user:
        return None
    return {k: v for k, v in user.items() if k not in ("password_hash",)}


def directory(filters: Dict[str, Any], viewer: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Student directory filtered by institution / district / city / state / role."""
    inst = clean_text(filters.get("institution_id"), max_len=60)
    state = clean_text(filters.get("state"), max_len=60)
    district = clean_text(filters.get("district"), max_len=60)
    city = clean_text(filters.get("city"), max_len=60)
    role = clean_text(filters.get("role"), max_len=60)
    q = clean_text(filters.get("q"), max_len=60).lower()
    limit = clean_int(filters.get("limit"), 1, 500, 200)

    rows = []
    for learner in store.all_learners():
        if not is_listed(learner) and not can_view_learner(viewer, learner):
            continue
        card = public_learner_card(learner)
        if inst and card["institution_id"] != inst:
            continue
        if state and (card["state"] or "") != state:
            continue
        if district and (card["district"] or "") != district:
            continue
        if city and (card["city"] or "") != city:
            continue
        if role and card["target_role"] != role:
            continue
        if q and q not in f"{card['name']} {card['institution']} {card['target_role']}".lower():
            continue
        card["can_open"] = can_view_learner(viewer, learner)
        rows.append(card)

    rows.sort(key=lambda r: -r["readiness"])
    by_inst: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        key = r["institution"] or "Not specified"
        g = by_inst.setdefault(key, {"institution": key, "institution_id": r["institution_id"],
                                     "city": r["city"], "district": r["district"], "state": r["state"],
                                     "students": 0, "readiness_sum": 0})
        g["students"] += 1
        g["readiness_sum"] += r["readiness"]
    groups = sorted(({**g, "avg_readiness": round(g["readiness_sum"] / g["students"])} for g in by_inst.values()),
                    key=lambda g: -g["students"])
    return {"students": rows[:limit], "total": len(rows), "institutions": groups,
            "viewer_role": (viewer or {}).get("role", "guest")}
