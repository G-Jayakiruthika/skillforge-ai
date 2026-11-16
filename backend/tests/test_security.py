"""Auth, access control and hardening tests.  Run: python -m pytest -q"""
import json
import os
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("SKILLFORGE_DB", str(Path(tempfile.mkdtemp()) / "sec.db"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from skillforge import auth, routes, security, service, store  # noqa: E402


@pytest.fixture(autouse=True)
def fresh(monkeypatch, tmp_path):
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "t.db")
    monkeypatch.setattr(security, "limiter", security.RateLimiter())
    monkeypatch.setattr(auth, "limiter", security.limiter)
    service.seed_demo(reset=True)


def call(method, path, body=None, user=None, token=None, query=None, ip="1.2.3.4"):
    status, payload, ctx = routes.dispatch(method, path, query or {}, body or {}, user=user, ip=ip, token=token)
    return status, payload, ctx


def new_user(email="stu@example.com", role="student", inst="loyola-college", pw="Str0ng-Pass9"):
    st, out, ctx = call("POST", "/api/auth/signup", {"age_confirmed": True, "terms_accepted": True, "name": "Test Person", "email": email, "password": pw,
                                                     "confirm": pw, "role": role, "institution_id": inst})
    assert st == 200, out
    return out["user"], ctx.set_cookie


def test_password_never_stored_or_returned():
    user, token = new_user()
    assert "password" not in str(user) and "password_hash" not in user
    row = store.get_user_by_email("stu@example.com")
    assert row["password_hash"].startswith("pbkdf2_sha256$600000$") and "Str0ng-Pass9" not in row["password_hash"]
    assert token and len(token) > 30


def test_weak_and_duplicate_signups_rejected():
    for pw in ("short1", "password", "allletters", "12345678"):
        st, out, _ = call("POST", "/api/auth/signup", {"age_confirmed": True, "terms_accepted": True, "name": "A B", "email": "x@example.com", "password": pw}, ip="5.5.5.1")
        assert st == 400, pw
    new_user()
    st, out, _ = call("POST", "/api/auth/signup", {"age_confirmed": True, "terms_accepted": True, "name": "A B", "email": "STU@example.com", "password": "Str0ng-Pass9"}, ip="5.5.5.2")
    assert st == 400 and "already exists" in out["detail"]
    assert call("POST", "/api/auth/signup", {"age_confirmed": True, "terms_accepted": True, "name": "A B", "email": "nope", "password": "Str0ng-Pass9"}, ip="5.5.5.2")[0] == 400
    # and the limit itself: a sixth signup attempt from one address inside an hour is refused
    codes = [call("POST", "/api/auth/signup", {"age_confirmed": True, "terms_accepted": True, "name": "A B", "email": f"u{i}@example.com", "password": "Str0ng-Pass9"}, ip="5.5.5.3")[0]
             for i in range(7)]
    assert codes[:5] == [200] * 5 and codes[5] == 429


def test_login_logout_session():
    new_user()
    st, out, ctx = call("POST", "/api/auth/login", {"email": "stu@example.com", "password": "Str0ng-Pass9"})
    assert st == 200
    token = ctx.set_cookie
    assert auth.user_for_token(token)["email"] == "stu@example.com"
    assert call("POST", "/api/auth/login", {"email": "stu@example.com", "password": "wrong-Pass1"})[0] == 401
    # same message for unknown email -> no account enumeration
    a = call("POST", "/api/auth/login", {"email": "ghost@example.com", "password": "whatever-1"})[1]["detail"]
    b = call("POST", "/api/auth/login", {"email": "stu@example.com", "password": "whatever-1"})[1]["detail"]
    assert a == b
    call("POST", "/api/auth/logout", token=token)
    assert auth.user_for_token(token) is None
    assert auth.user_for_token("forged-token") is None


def test_login_lockout_after_repeated_failures():
    new_user()
    codes = [call("POST", "/api/auth/login", {"email": "stu@example.com", "password": f"bad-pass{i}"})[0] for i in range(12)]
    assert 429 in codes or codes[-1] == 401 and "Too many" in call(
        "POST", "/api/auth/login", {"email": "stu@example.com", "password": "bad-pass99"})[1]["detail"]
    # even the right password is refused during the lockout
    assert call("POST", "/api/auth/login", {"email": "stu@example.com", "password": "Str0ng-Pass9"})[0] in (401, 429)


def test_admin_routes_need_admin():
    admin, _ = new_user("owner@example.com")                 # first real account on a private install -> admin
    assert admin["role"] == "admin"
    student, _ = new_user()
    faculty, _ = new_user("fac@example.com", "faculty")
    assert student["role"] == "student" and faculty["role"] == "faculty"
    for path in ("/api/admin/contacts", "/api/admin/config", "/api/admin/users"):
        assert call("GET", path)[0] == 401
        assert call("GET", path, user=student)[0] == 403
        assert call("GET", path, user=faculty)[0] == 403
        assert call("GET", path, user=admin)[0] == 200
    cfg = call("GET", "/api/admin/config", user=admin)[1]
    assert "gemini_key_preview" in cfg and "password" not in str(cfg).lower()
    assert all("password_hash" not in u for u in call("GET", "/api/admin/users", user=admin)[1]["users"])


def test_signup_cannot_grant_admin():
    new_user("owner@example.com")
    st, out, _ = call("POST", "/api/auth/signup", {"age_confirmed": True, "terms_accepted": True, "name": "Sneaky One", "email": "s@example.com",
                                                   "password": "Str0ng-Pass9", "role": "admin"})
    assert st == 200 and out["user"]["role"] == "student"


def test_admin_email_env_and_public_mode(monkeypatch):
    monkeypatch.setattr(security.Env, "admin_email", "boss@example.com")
    first, _ = new_user("first@example.com")
    boss, _ = new_user("boss@example.com")
    assert first["role"] == "student" and boss["role"] == "admin"      # only the configured email
    monkeypatch.setattr(security.Env, "admin_email", "")
    monkeypatch.setattr(security.Env, "public", True)
    assert call("POST", "/api/auth/demo", {})[0] == 403                # no demo logins on a public server
    assert call("POST", "/api/demo/reset", {})[0] == 403               # guests cannot reset
    assert call("POST", "/api/demo/reset", {}, user=boss)[0] == 200


def test_no_shared_demo_password_and_reserved_domain():
    src = (Path(__file__).resolve().parents[1] / "skillforge" / "service.py").read_text()
    assert "DEMO_PASSWORD" not in src
    st, out, _ = call("POST", "/api/auth/signup", {"age_confirmed": True, "terms_accepted": True, "name": "Fake Demo", "email": "x@demo.skillforge.test",
                                                   "password": "Str0ng-Pass9"})
    assert st == 400
    for guess in ("Demo#Faculty1", "password", "demo"):
        assert call("POST", "/api/auth/login", {"email": "anitha.rajan@demo.skillforge.test", "password": guess})[0] == 401


def test_faculty_sees_only_own_institution():
    new_user("owner@example.com")
    fac, _ = new_user("fac@example.com", "faculty", inst="loyola-college")
    other, _ = new_user("fac2@example.com", "faculty", inst="psg-college-of-technology")
    stu, _ = new_user("s3@example.com", inst="loyola-college")
    lid = stu["learner_id"]
    ids = {s["id"] for s in call("GET", "/api/faculty/students", user=fac)[1]["students"]}
    assert lid in ids
    assert lid not in {s["id"] for s in call("GET", "/api/faculty/students", user=other)[1]["students"]}
    assert call("GET", f"/api/students/{lid}", user=fac)[0] == 200
    assert call("GET", f"/api/students/{lid}", user=other)[0] == 403
    assert call("GET", f"/api/students/{lid}")[0] == 401
    assert call("GET", "/api/faculty/students", user=stu)[0] == 403
    assert call("GET", f"/api/students/{lid}", user=stu)[0] == 200


def test_real_learner_is_private_demo_is_sandbox():
    new_user("owner@example.com")
    stu, _ = new_user("s1@example.com", inst="loyola-college")
    stranger, _ = new_user("s2@example.com", inst="loyola-college")
    fac, _ = new_user("fac@example.com", "faculty", inst="loyola-college")
    lid = stu["learner_id"]
    # guests and other students cannot read, list or change a real profile
    assert call("GET", f"/api/learners/{lid}")[0] == 404
    assert call("GET", f"/api/learners/{lid}", user=stranger)[0] == 403
    assert lid not in {l["id"] for l in call("GET", "/api/learners")[1]}
    assert lid not in {l["id"] for l in call("GET", "/api/learners", user=stranger)[1]}
    for path, body in ((f"/api/learners/{lid}/pivot", {"target_role": "Data Analyst"}),
                       (f"/api/learners/{lid}/assess", {"skill": "SQL", "answers": [0, 0, 0]}),
                       (f"/api/learners/{lid}/progress", {"skill": "SQL", "hours": 1}),
                       (f"/api/learners/{lid}/chat", {"question": "hello there"}),
                       (f"/api/learners/{lid}/game", {"game": "dash", "points": 50}),
                       ("/api/learners", {"id": lid, "name": "Hacked"})):
        assert call("POST", path, body)[0] in (401, 404), path
        assert call("POST", path, body, user=stranger)[0] in (403, 404), path
        assert call("POST", path, body, user=fac)[0] == 403, path          # faculty: read-only
    assert store.get(lid)["name"] == "Test Person"
    # faculty of the same college may read; the owner may edit
    assert call("GET", f"/api/learners/{lid}", user=fac)[0] == 200
    assert call("POST", f"/api/learners/{lid}/pivot", {"target_role": "Data Analyst"}, user=stu)[0] == 200
    assert call("POST", f"/api/learners/{lid}/assess", {"skill": "SQL", "mode": "simulate", "score": 99}, user=stu)[0] == 400
    # the fictional demo learners stay open to everyone, and guests cannot create profiles
    assert call("GET", "/api/learners/jane-doe")[0] == 200
    assert call("POST", "/api/learners/jane-doe/pivot", {"target_role": "Data Analyst"})[0] == 200
    assert call("POST", "/api/learners", {"name": "Guest Person"})[0] == 401
    # a student cannot create a second profile or pick an id
    st, out, _ = call("POST", "/api/learners", {"id": "brand-new", "name": "Renamed"}, user=stu)
    assert st == 200 and out["learner"]["id"] == lid
    # cohort for guests = demo cohort only
    assert call("GET", "/api/cohort")[1]["learners"] == 9
    # reset removes demo learners only
    assert call("POST", "/api/demo/reset", {})[0] == 200 and store.get(lid) is not None


def test_demo_faculty_cannot_see_real_students():
    new_user("owner@example.com")
    stu, _ = new_user("s1@example.com", inst="rathinam-technical-campus")
    st, out, ctx = call("POST", "/api/auth/demo", {})
    assert st == 200 and ctx.set_cookie and out["user"]["demo"] is True
    demo = auth.user_for_token(ctx.set_cookie)
    ids = {s["id"] for s in call("GET", "/api/faculty/students", user=demo)[1]["students"]}
    assert ids == {"jane-doe", "divya-s"}                                  # demo learners at that college only
    assert call("GET", f"/api/students/{stu['learner_id']}", user=demo)[0] == 403
    assert call("GET", "/api/admin/users", user=demo)[0] == 403


def test_directory_hides_private_fields_and_unlisted():
    st, out, _ = call("GET", "/api/directory", query={"institution_id": "rathinam-technical-campus"})
    assert st == 200 and out["total"] == 2
    card = out["students"][0]
    assert "email" not in card and "assessments" not in card and card["demo"] is True
    assert call("GET", "/api/directory", query={"district": "Coimbatore"})[1]["total"] >= 3
    assert call("GET", "/api/institutions", query={"state": "Tamil Nadu"})[1]["total"] > 200
    new_user("owner@example.com")
    stu, _ = new_user("s1@example.com", inst="loyola-college")
    q = {"institution_id": "loyola-college"}
    before = call("GET", "/api/directory", query=q)[1]
    mine = [c for c in before["students"] if c["id"] == stu["learner_id"]][0]
    assert mine["can_open"] is False
    call("POST", "/api/learners", {"id": stu["learner_id"], "name": "Test Person", "listed": False}, user=stu)
    assert call("GET", "/api/directory", query=q)[1]["total"] == before["total"] - 1
    assert stu["learner_id"] not in {r["id"] for r in call("GET", "/api/leaderboard")[1]["rows"]}


def test_messages_to_faculty():
    new_user("owner@example.com")
    stu, _ = new_user("s1@example.com")
    other, _ = new_user("s2@example.com")
    fac, _ = new_user("fac@example.com", "faculty")
    fac2, _ = new_user("fac2@example.com", "faculty")
    path = f"/api/faculty/{fac['id']}/ask"
    assert call("POST", path, {"message": "How do I practise SQL joins?"})[0] == 401
    assert call("POST", path, {"message": "short"}, user=stu)[0] == 400
    assert call("POST", f"/api/faculty/{stu['id']}/ask", {"message": "this is not a faculty member"}, user=other)[0] == 404
    st, out, _ = call("POST", path, {"message": "<b>How</b> do I practise SQL joins?"}, user=stu)
    assert st == 200
    inbox = call("GET", "/api/messages", user=fac)[1]
    assert inbox["unanswered"] == 1 and "<" not in inbox["messages"][0]["body"]
    mid = inbox["messages"][0]["id"]
    assert call("GET", "/api/messages", user=other)[1]["messages"] == []      # nobody else sees it
    assert call("POST", f"/api/messages/{mid}/reply", {"reply": "Try SQLBolt lesson 6."}, user=fac2)[0] == 404
    assert call("POST", f"/api/messages/{mid}/reply", {"reply": "Try SQLBolt lesson 6."}, user=stu)[0] == 403
    assert call("POST", f"/api/messages/{mid}/reply", {"reply": "Try SQLBolt lesson 6."}, user=fac)[0] == 200
    mine = call("GET", "/api/messages", user=stu)[1]["messages"][0]
    assert mine["reply"] == "Try SQLBolt lesson 6." and mine["direction"] == "sent" and "from_user" not in mine


def test_csrf_cross_site_post_blocked():
    def post(origin, host="localhost:8000"):
        return routes.dispatch("POST", "/api/contact", {}, {"name": "Asha", "email": "a@b.co", "message": "hello there friend"},
                               ip="9.9.9.9", origin=origin, host=host)[0]
    assert post("https://evil.example") == 403
    assert post("null") == 403
    assert post("http://localhost:8000") == 200
    assert post(None) == 200                                   # non-browser client
    assert post("https://app.example.org", host="app.example.org") == 200


def test_game_points_capped_and_counted():
    st, out, _ = call("POST", "/api/learners/jane-doe/game", {"game": "dash", "points": 999999})
    assert st == 200 and out["game"]["points"] == 300
    assert call("POST", "/api/learners/jane-doe/game", {"game": "nope", "points": 5})[0] == 400
    row = [r for r in call("GET", "/api/leaderboard")[1]["rows"] if r["id"] == "jane-doe"][0]
    assert row["game_points"] == 300


def test_forms_are_sanitised():
    stu, _ = new_user("s1@example.com")
    st, out, _ = call("POST", "/api/learners", {"name": "<script>alert(1)</script>Ravi", "target_role": "Data Analyst",
                                                "skills": [{"name": "<img src=x onerror=alert(1)>sql", "level": "beginner"}],
                                                "interests": "javascript:alert(1)"}, user=stu)
    assert st == 200
    L = out["learner"]
    assert "<" not in L["name"] and "script" not in L["name"].lower() and "Ravi" in L["name"]
    assert "<" not in L["skills"][0]["name"] and "javascript:" not in L["interests"]


def test_contact_saved_and_validated():
    assert call("POST", "/api/contact", {"name": "A", "email": "a@b.co", "message": "hello there friend"})[0] == 400
    assert call("POST", "/api/contact", {"name": "Asha", "email": "bad", "message": "hello there friend"})[0] == 400
    st, out, _ = call("POST", "/api/contact", {"name": "Asha <b>K</b>", "email": "asha@example.com",
                                               "subject": "Hi", "message": "I would like to <script>x</script> know more."})
    assert st == 200 and out["id"] > 0
    msg = store.list_contacts()[0]
    assert "<" not in msg["name"] and "<script>" not in msg["message"]
    before = store.count_contacts()
    call("POST", "/api/contact", {"name": "Bot", "email": "b@example.com", "message": "spam spam spam spam", "website": "http://x"})
    assert store.count_contacts() == before            # honeypot


def test_rate_limit_and_headers():
    codes = [call("POST", "/api/contact", {"name": "Asha", "email": "a@example.com", "message": "hello hello hello"}, ip="9.9.9.9")[0]
             for _ in range(8)]
    assert codes.count(200) == 5 and 429 in codes
    h = security.response_headers("/api/health")
    assert "script-src 'self'" in h["Content-Security-Policy"] and h["X-Frame-Options"] == "DENY"
    assert "*" not in security.allowed_origins()
    assert "secret" not in security.safe_error(RuntimeError("secret db path"))


def test_password_change_signs_out_everywhere():
    user, token = new_user()
    u = auth.user_for_token(token)
    assert call("POST", "/api/auth/password", {"current": "nope", "new": "An0ther-Pass7"}, user=u)[0] == 401
    assert call("POST", "/api/auth/password", {"current": "Str0ng-Pass9", "new": "An0ther-Pass7"}, user=u)[0] == 200
    assert auth.user_for_token(token) is None
    assert call("POST", "/api/auth/login", {"email": "stu@example.com", "password": "An0ther-Pass7"})[0] == 200


def test_audit_script_passes():
    import security_audit
    report = security_audit.run()
    assert report["counts"]["fail"] == 0, [r for r in report["results"] if r["status"] == "fail"]


# --------------------------------------------------------------------------
# Data consent & privacy (GDPR / India DPDP Act)
# --------------------------------------------------------------------------
def test_consent_defaults_to_off_and_essential_cannot_be_disabled():
    st, out, _ = call("GET", "/api/privacy/consent")
    assert st == 200
    c = out["consent"]
    assert c["essential"] is True
    assert c["analytics"] is False and c["marketing"] is False and c["ai_processing"] is False
    assert c["updated"] is None                                     # nothing chosen yet
    assert len(out["categories"]) == 4 and len(out["collected"]) >= 6
    stu, _ = new_user("c1@example.com")
    st, saved, _ = call("POST", "/api/privacy/consent",
                        {"essential": False, "analytics": True, "marketing": False, "ai_processing": True}, user=stu)
    assert st == 200
    assert saved["consent"]["essential"] is True                    # forced on
    assert saved["consent"]["analytics"] is True and saved["consent"]["marketing"] is False
    assert saved["consent"]["updated"]                              # timestamp recorded
    assert call("POST", "/api/privacy/consent", {"analytics": True})[0] == 401
    # the saved choice comes back on the next request
    again = call("GET", "/api/privacy/consent", user=store.get_user(stu["id"]))[1]["consent"]
    assert again["analytics"] is True and again["ai_processing"] is True


def test_ai_processing_requires_consent(monkeypatch):
    from skillforge import llm
    monkeypatch.setattr(llm, "_client", object())                   # pretend a key is configured
    stu, _ = new_user("c2@example.com")
    call("GET", "/api/health", user=stu)                            # no consent yet
    assert llm.available() is False
    call("POST", "/api/privacy/consent", {"ai_processing": True}, user=stu)
    call("GET", "/api/health", user=store.get_user(stu["id"]))
    assert llm.available() is True
    call("POST", "/api/privacy/consent", {"ai_processing": False}, user=store.get_user(stu["id"]))
    call("GET", "/api/health", user=store.get_user(stu["id"]))
    assert llm.available() is False                                 # withdrawn again


def test_export_my_data_is_complete_and_has_no_password():
    stu, _ = new_user("c3@example.com")
    fac, _ = new_user("fac@example.com", "faculty")
    call("POST", f"/api/faculty/{fac['id']}/ask", {"message": "How should I practise joins?"}, user=stu)
    st, out, _ = call("GET", "/api/privacy/export", user=stu)
    assert st == 200
    assert out["account"]["email"] == "c3@example.com"
    assert out["learner_profile"]["id"] == stu["learner_id"]
    assert len(out["messages"]) == 1 and "from_user" not in out["messages"][0]
    assert "password_hash" not in json.dumps(out) and "Str0ng-Pass9" not in json.dumps(out)
    assert call("GET", "/api/privacy/export")[0] == 401


def test_delete_my_account_erases_everything():
    stu, token = new_user("c4@example.com")
    fac, _ = new_user("fac@example.com", "faculty")
    call("POST", f"/api/faculty/{fac['id']}/ask", {"message": "Please help with CAD basics."}, user=stu)
    call("POST", "/api/contact", {"name": "Test Person", "email": "c4@example.com", "message": "hello there friend"})
    lid = stu["learner_id"]
    assert call("POST", "/api/privacy/delete", {"confirm": "nope"}, user=stu)[0] == 400     # must type DELETE
    assert store.get(lid) is not None
    st, out, ctx = call("POST", "/api/privacy/delete", {"confirm": "DELETE"}, user=stu)
    assert st == 200 and ctx.clear_cookie is True
    assert out["deleted"]["learners"] == 1 and out["deleted"]["messages"] == 1 and out["deleted"]["contacts"] == 1
    assert store.get(lid) is None
    assert store.get_user(stu["id"]) is None
    assert store.get_user_by_email("c4@example.com") is None
    assert auth.user_for_token(token) is None                                               # session gone
    assert call("GET", "/api/messages", user=fac)[1]["messages"] == []                      # their copy too
    assert call("POST", "/api/auth/login", {"email": "c4@example.com", "password": "Str0ng-Pass9"})[0] == 401


def test_demo_account_cannot_be_deleted():
    _, ctx_token = call("POST", "/api/auth/demo", {})[1], None
    st, out, ctx = call("POST", "/api/auth/demo", {})
    demo = auth.user_for_token(ctx.set_cookie)
    assert call("POST", "/api/privacy/delete", {"confirm": "DELETE"}, user=demo)[0] == 403


# ---------------------------------------------------------------- age gate
def test_signup_requires_the_age_and_terms_declaration():
    """Self sign-up is 18+: under India's DPDP Act a child's data needs verifiable
    parental consent, which this product does not implement."""
    base = {"name": "Young Person", "email": "young@example.com", "password": "Str0ng-Pass9",
            "confirm": "Str0ng-Pass9", "institution_id": "loyola-college"}

    st, out, _ = call("POST", "/api/auth/signup", dict(base, terms_accepted=True), ip="7.1.1.1")
    assert st == 400 and "18 or over" in out["detail"]

    st, out, _ = call("POST", "/api/auth/signup", dict(base, age_confirmed=True), ip="7.1.1.2")
    assert st == 400 and "Terms of Service" in out["detail"]

    st, out, _ = call("POST", "/api/auth/signup",
                      dict(base, age_confirmed=True, terms_accepted=True), ip="7.1.1.3")
    assert st == 200, out
    # The declaration is recorded as a timestamp and a terms version - never a date of birth.
    saved = store.get_user(out["user"]["id"])
    assert saved["age_confirmed"] and saved["terms_accepted"]
    assert saved["terms_version"] == auth.TERMS_VERSION
    assert "dob" not in saved and "birth" not in str(saved).lower()


# -------------------------------------------------------- password reset
def test_password_reset_does_not_reveal_who_has_an_account():
    new_user(email="real@example.com")
    known = call("POST", "/api/auth/forgot", {"email": "real@example.com"}, ip="7.2.1.1")
    unknown = call("POST", "/api/auth/forgot", {"email": "nobody@example.com"}, ip="7.2.1.2")
    assert known[0] == unknown[0] == 200
    assert known[1] == unknown[1]          # byte-for-byte the same answer


def test_password_reset_token_is_single_use_and_changes_the_password():
    user, _ = new_user(email="forgot@example.com")
    token = security.make_token()
    store.create_token(security.token_fingerprint(token), user["id"], "reset", 3600)

    st, out, _ = call("POST", "/api/auth/reset", {"token": token, "password": "Rec0vered-Pass7",
                                                  "confirm": "Rec0vered-Pass7"})
    assert st == 200, out
    assert call("POST", "/api/auth/login", {"email": "forgot@example.com", "password": "Rec0vered-Pass7"})[0] == 200
    assert call("POST", "/api/auth/login", {"email": "forgot@example.com", "password": "Str0ng-Pass9"})[0] == 401

    # the same link cannot be replayed
    st, out, _ = call("POST", "/api/auth/reset", {"token": token, "password": "Another-Pass8",
                                                  "confirm": "Another-Pass8"})
    assert st == 400 and "already been used" in out["detail"]


def test_password_reset_rejects_expired_and_forged_tokens():
    user, _ = new_user(email="expired@example.com")
    stale = security.make_token()
    store.create_token(security.token_fingerprint(stale), user["id"], "reset", -1)   # already expired
    for token in (stale, security.make_token(), "", "../../etc/passwd"):
        st, out, _ = call("POST", "/api/auth/reset", {"token": token, "password": "What3ver-Pass9"})
        assert st == 400, token

    # a reset token must not work as a verification token, or the other way round
    cross = security.make_token()
    store.create_token(security.token_fingerprint(cross), user["id"], "verify", 3600)
    assert call("POST", "/api/auth/reset", {"token": cross, "password": "What3ver-Pass9"})[0] == 400


def test_password_reset_signs_out_every_existing_session():
    user, token = new_user(email="sessions@example.com")
    assert call("GET", "/api/auth/me", user=store.session_user(security.token_fingerprint(token)))[0] == 200
    reset = security.make_token()
    store.create_token(security.token_fingerprint(reset), user["id"], "reset", 3600)
    call("POST", "/api/auth/reset", {"token": reset, "password": "Fresh-Pass12"})
    assert store.session_user(security.token_fingerprint(token)) is None


def test_reset_tokens_are_stored_only_as_a_fingerprint():
    user, _ = new_user(email="fp@example.com")
    token = security.make_token()
    store.create_token(security.token_fingerprint(token), user["id"], "reset", 3600)
    with store._conn() as c:                                    # noqa: SLF001 - checking storage itself
        rows = [dict(r) for r in c.execute("SELECT * FROM tokens")]
    assert rows and all(token not in str(r) for r in rows)


# --------------------------------------------------- email verification
def test_email_verification_marks_the_address_and_is_single_use():
    user, _ = new_user(email="verify@example.com")
    assert not store.get_user(user["id"])["email_verified"]
    token = security.make_token()
    store.create_token(security.token_fingerprint(token), user["id"], "verify", 3600)

    st, out, _ = call("POST", "/api/auth/verify", {"token": token})
    assert st == 200 and store.get_user(user["id"])["email_verified"]
    assert call("POST", "/api/auth/verify", {"token": token})[0] == 400      # not twice


def test_completing_a_reset_also_confirms_the_address():
    """Opening the link proves control of the mailbox, so asking again would be theatre."""
    user, _ = new_user(email="both@example.com")
    token = security.make_token()
    store.create_token(security.token_fingerprint(token), user["id"], "reset", 3600)
    call("POST", "/api/auth/reset", {"token": token, "password": "Proven-Pass11"})
    assert store.get_user(user["id"])["email_verified"]


def test_mail_console_mode_never_logs_an_address_or_a_name(capsys):
    from skillforge import mail
    subject, body = mail.reset_email("Jaya Kiruthika", "https://example.com/reset.html?token=abc", 60)
    mail.send("private.person@example.com", subject, body, link="https://example.com/reset.html?token=abc")
    printed = capsys.readouterr().out
    assert "private.person@example.com" not in printed
    assert "Jaya Kiruthika" not in printed
    assert "token=abc" in printed          # the developer still gets the link
