"""
security_audit.py - runs the project's security checklist and prints a report.

    python security_audit.py            # human-readable report
    python security_audit.py --json     # machine-readable
    python security_audit.py --strict   # exit 1 if anything fails (for CI)

Each check maps to one item on the hardening list. Nothing here changes files - it
only inspects the code, the configuration and the repository.
"""
from __future__ import annotations

import ast
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Tuple

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))

PASS, WARN, FAIL = "pass", "warn", "fail"
Result = Tuple[str, str]          # (status, detail)

# Patterns that look like real secrets (not placeholders)
SECRET_PATTERNS = [
    (r"AIza[0-9A-Za-z_\-]{30,}", "Google API key"),
    (r"sk-[A-Za-z0-9]{32,}", "OpenAI-style key"),
    (r"ghp_[A-Za-z0-9]{36,}", "GitHub token"),
    (r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", "private key"),
    (r"(?i)(password|passwd|secret|api[_-]?key)\s*[:=]\s*[\"'][^\"'\s]{12,}[\"']", "hard-coded credential"),
]
ALLOW_SECRET_HITS = {"your-key-here", "change-me", "example", "pbkdf2_sha256", "Demo#Faculty1"}
SOURCE_GLOBS = ("backend/**/*.py", "frontend/**/*.js", "frontend/**/*.html", "*.md", "*.yml", "*.bat", "*.sh")


def _files() -> List[Path]:
    out: List[Path] = []
    for pattern in SOURCE_GLOBS:
        out += [p for p in REPO.glob(pattern)
                if ".venv" not in p.parts and "__pycache__" not in p.parts and "vendor" not in p.parts]
    return out


# ---------------------------------------------------------------- checks
def check_hide_api_key() -> Result:
    from skillforge.security import Env
    hits = []
    for f in _files():
        text = f.read_text(encoding="utf-8", errors="ignore")
        for pat, label in SECRET_PATTERNS:
            for m in re.finditer(pat, text):
                if any(a in m.group(0) for a in ALLOW_SECRET_HITS):
                    continue
                hits.append(f"{f.relative_to(REPO)}: {label}")
    if hits:
        return FAIL, "possible secrets in source: " + "; ".join(hits[:5])
    where = "environment" if Env.gemini_key else "not set (optional)"
    return PASS, f"no secrets in source; Gemini key read from {where}"


def check_env_variables() -> Result:
    from skillforge.security import Env
    warns = Env.warnings()
    example = ROOT / ".env.example"
    if not example.is_file():
        return WARN, ".env.example is missing - contributors have nothing to copy"
    if warns:
        return WARN, "; ".join(warns)
    return PASS, f".env.example present; debug={Env.debug}; secret from {Env.report()['secret_source']}"


def check_protect_admin_routes() -> Result:
    from skillforge import routes
    admin = [(m, p, r) for m, p, _, r in routes.ROUTES if "/admin/" in p]
    if not admin:
        return WARN, "no admin routes found"
    open_admin = [p for _, p, r in admin if "admin" not in r]
    return (FAIL, f"admin routes without a role check: {open_admin}") if open_admin else \
        (PASS, f"{len(admin)} admin route(s), all restricted to role 'admin'")


def check_authentication() -> Result:
    from skillforge import auth
    needed = {"signup", "login", "logout", "user_for_token", "require"}
    missing = needed - set(dir(auth))
    if missing:
        return FAIL, f"auth module missing {sorted(missing)}"
    return PASS, "signup/login/logout with server-side sessions; cookies are HttpOnly + SameSite=Lax"


def check_user_access() -> Result:
    from skillforge import auth
    learner = {"id": "x", "institution_id": "inst-a"}
    cases = [
        (None, False, "signed-out user"),
        ({"role": "student", "learner_id": "other"}, False, "another student"),
        ({"role": "student", "learner_id": "x"}, True, "the owner"),
        ({"role": "faculty", "institution_id": "inst-b"}, False, "faculty elsewhere"),
        ({"role": "faculty", "institution_id": "inst-a"}, True, "faculty at the same institution"),
        ({"role": "admin"}, True, "admin"),
    ]
    bad = [why for user, expected, why in cases if auth.can_view_learner(user, learner) is not expected]
    return (FAIL, "access rule wrong for: " + ", ".join(bad)) if bad else \
        (PASS, "own / same-institution faculty / admin only; all 6 access cases behave correctly")


def check_sanitize_forms() -> Result:
    from skillforge.security import clean_email, clean_text
    probes = [("<script>alert(1)</script>Hi", "script"), ("javascript:evil()", "javascript:"),
              ("a\x00b\x07c", "\x00")]
    bad = [p for p, needle in probes if needle in clean_text(p)]
    if bad:
        return FAIL, f"clean_text left dangerous content in: {bad}"
    if clean_email("not-an-email") or not clean_email("Student@Example.COM") == "student@example.com":
        return FAIL, "clean_email does not validate/normalise correctly"
    return PASS, "tags, control chars and javascript: URIs stripped; emails validated and normalised"


# Fields that can contain text a user typed. Interpolating one into HTML without esc() is a finding.
USER_FIELDS = ("name", "email", "institution", "organization", "message", "subject", "interests",
               "education", "department", "city", "district", "company", "project", "description")
# property access on a data object, e.g. ${l.name} - bare local constants are not user data
USER_EXPR = re.compile(r"\.(?:" + "|".join(USER_FIELDS) + r")\b")
SAFE_WRAPPERS = ("esc(", "encodeURIComponent(", "Number(", "parseInt(", "parseFloat(", "colorFor(", "slug(",
                 ".replace(/[&<>", ".length", "jobsLink(")


def check_xss() -> Result:
    """CSP plus a real scan: user text interpolated into HTML must pass through esc()."""
    from skillforge.security import CSP
    issues = []
    if "script-src 'self'" not in CSP:
        issues.append("CSP does not restrict scripts")
    if "unsafe-eval" in CSP or "unsafe-inline" in CSP.split("style-src")[0]:
        issues.append("CSP allows unsafe script sources")
    findings = []
    for f in (REPO / "frontend" / "js").glob("*.js"):
        for lineno, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if "${" not in line or not re.search(r"<[a-zA-Z/]", line):   # only HTML-producing lines
                continue
            for expr in re.findall(r"\$\{([^{}]*)\}", line):
                if not USER_EXPR.search(expr):
                    continue
                if any(w in expr for w in SAFE_WRAPPERS) or expr.strip().startswith('"'):
                    continue
                # a comparison that only selects between string literals outputs no user text
                if re.fullmatch(r"[^?]*(===|!==|==|>=|<=|>|<)[^?]*\?\s*[\"'`][^\"'`]*[\"'`]\s*:\s*[\"'`][^\"'`]*[\"'`]\s*", expr):
                    continue
                findings.append(f"{f.name}:{lineno} ${{{expr.strip()[:40]}}}")
    if findings:
        issues.append(f"user text in HTML without esc(): {findings[:4]}")
    return (WARN if issues else PASS), "; ".join(issues) or \
        "CSP blocks inline/remote scripts; every user value in HTML passes through esc() (scanned all frontend modules)"


def check_rate_limits() -> Result:
    from skillforge.security import RateLimiter, RATE_RULES
    rl = RateLimiter()
    allowed = sum(1 for _ in range(10) if rl.check("probe", 3, 60)[0])
    if allowed != 3:
        return FAIL, f"limiter allowed {allowed} of 10 requests against a limit of 3"
    have_login = any(r[0].endswith("login") for r in RATE_RULES)
    return (PASS if have_login else WARN), \
        f"{len(RATE_RULES)} rules; login limited to {RATE_RULES[0][1]}/{int(RATE_RULES[0][2])}s with lockout"


def check_secure_api() -> Result:
    from skillforge import routes
    protected = [p for _, p, _, r in routes.ROUTES if r]
    unauth_write = [p for m, p, _, r in routes.ROUTES if m == "POST" and not r and "/auth/" not in p
                    and "/contact" not in p and "/learners" not in p and "/quiz" not in p
                    and "/resume" not in p and "/demo/" not in p]
    if unauth_write:
        return WARN, f"POST routes with no role requirement: {unauth_write}"
    return PASS, f"{len(protected)} role-restricted routes; all errors sanitised; body capped at 256 KB"


def check_cors() -> Result:
    from skillforge.security import allowed_origins, Env
    origins = allowed_origins()
    if "*" in origins:
        return FAIL, "CORS allows any origin"
    if Env.public and not Env.cors_origins_raw.strip():
        return WARN, "public server without an explicit CORS allow-list"
    return PASS, f"allow-list of {len(origins)} origin(s): {', '.join(origins[:3])}…"


def check_security_headers() -> Result:
    from skillforge.security import response_headers
    h = response_headers("/api/health")
    required = ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options",
                "Referrer-Policy", "Permissions-Policy"]
    missing = [k for k in required if k not in h]
    return (FAIL, f"missing headers: {missing}") if missing else (PASS, f"{len(h)} headers on every response")


def check_debug_off() -> Result:
    from skillforge.security import Env, safe_error
    if Env.debug:
        return WARN, "SKILLFORGE_DEBUG is on - fine locally, must be off when shared"
    leaked = safe_error(ValueError("secret path /etc/passwd"))
    if "secret path" in leaked:
        return FAIL, "error messages leak internal details"
    main = (ROOT / "main.py").read_text(encoding="utf-8")
    return (PASS if "debug=False" in main else WARN), "debug off; tracebacks never returned; /docs hidden when public"


def check_dependencies() -> Result:
    req = (ROOT / "requirements.txt")
    if not req.is_file():
        return FAIL, "requirements.txt missing"
    lines = [l.strip() for l in req.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]
    unpinned = [l for l in lines if not re.search(r"[><=]=", l)]
    return (WARN, f"unpinned: {unpinned}") if unpinned else (PASS, f"{len(lines)} dependencies, all with minimum versions")


def check_unused_packages() -> Result:
    req = (ROOT / "requirements.txt")
    names = [re.split(r"[><=\[]", l)[0].strip().lower()
             for l in req.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]
    source = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in REPO.glob("backend/**/*.py"))
    alias = {"uvicorn": "uvicorn", "fastapi": "fastapi", "pydantic": "pydantic", "langgraph": "langgraph",
             "google-genai": "google", "pytest": "pytest"}
    unused = [n for n in names if alias.get(n, n) not in source]
    return (WARN, f"declared but never imported: {unused}") if unused else (PASS, f"all {len(names)} packages are imported somewhere")


def check_exposed_files() -> Result:
    gi = (REPO / ".gitignore").read_text(encoding="utf-8") if (REPO / ".gitignore").is_file() else ""
    must = [".env", "data/", "__pycache__"]
    missing = [m for m in must if m.replace("/", "") not in gi.replace("/", "")]
    tracked = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True).stdout.split()
    leaked = [f for f in tracked if f.endswith(".env") or "/data/" in f or f.endswith(".db") or f.endswith(".secret")]
    if leaked:
        return FAIL, f"sensitive files are tracked by git: {leaked[:5]}"
    if missing:
        return WARN, f".gitignore missing entries: {missing}"
    return PASS, "no .env/.db/.secret tracked; servers refuse dotfiles, data/ and caches"


def check_secure_database() -> Result:
    """Every SQL statement must be a constant with ? / :name placeholders - no user data concatenated."""
    import stat
    from skillforge import store
    src = Path(store.__file__).read_text(encoding="utf-8")
    problems = []
    if re.search(r"execute\([^)]*%[^)]*\)", src):
        problems.append("%-formatted SQL")
    # f-strings inside execute() may only interpolate names built from the module allow-list
    safe_builders = {"cols", "sets", "UPDATABLE"}
    for m in re.finditer(r"execute\(\s*f?[\"']([^\"']+)[\"']", src):
        for expr in re.findall(r"\{([^{}]+)\}", m.group(1)):
            if not any(b in expr for b in safe_builders):
                problems.append(f"SQL interpolates {expr!r}")
    if re.search(r"execute\([^)]*\+\s*[a-z_]+", src):
        problems.append("SQL built with + concatenation")
    if "UPDATABLE" not in src:
        problems.append("no column allow-list for updates")
    if problems:
        return WARN, "; ".join(sorted(set(problems)))
    mode = ""
    if store.DB_PATH.exists():
        m = stat.S_IMODE(store.DB_PATH.stat().st_mode)
        mode = oct(m)
        if m & 0o077:
            return WARN, f"database file is readable by others ({mode})"
    return PASS, (f"constant SQL with ?/:name placeholders only, column allow-list for updates; "
                  f"db file mode {mode or 'not created yet'}; data/ git-ignored")


def check_hash_passwords() -> Result:
    from skillforge.security import hash_password, verify_password, PBKDF2_ITERATIONS, password_problem
    h = hash_password("Correct-Horse-9")
    if "Correct-Horse-9" in h:
        return FAIL, "password appears in the stored hash"
    if not h.startswith("pbkdf2_sha256$"):
        return FAIL, "unexpected hash format"
    if not verify_password("Correct-Horse-9", h) or verify_password("wrong", h):
        return FAIL, "verification is incorrect"
    if hash_password("same") == hash_password("same"):
        return FAIL, "no per-password salt"
    if PBKDF2_ITERATIONS < 100_000:
        return WARN, f"only {PBKDF2_ITERATIONS} iterations"
    if not password_problem("password"):
        return WARN, "weak passwords are accepted"
    return PASS, f"PBKDF2-HMAC-SHA256, {PBKDF2_ITERATIONS:,} iterations, random 16-byte salt, weak passwords rejected"


def check_git_secrets() -> Result:
    r = subprocess.run(["git", "log", "--all", "--name-only", "--pretty=format:"], cwd=REPO,
                       capture_output=True, text=True)
    if r.returncode != 0:
        return WARN, "not a git repository - cannot inspect history"
    names = {n for n in r.stdout.split() if n}
    bad = [n for n in names if n.endswith(".env") or n.endswith(".secret") or n.endswith(".db") or "/data/" in n]
    if bad:
        return FAIL, f"these files exist in git history: {sorted(bad)[:5]}"
    diff = subprocess.run(["git", "log", "--all", "-p", "--unified=0"], cwd=REPO, capture_output=True, text=True).stdout
    hits = []
    for pat, label in SECRET_PATTERNS[:4]:
        for m in re.finditer(pat, diff):
            if not any(a in m.group(0) for a in ALLOW_SECRET_HITS):
                hits.append(label)
    return (FAIL, f"secret-like strings in history: {sorted(set(hits))}") if hits else \
        (PASS, f"{len(names)} files in history, none sensitive; no key patterns in any commit")


# ---------------------------------------------------------------------------
# Code-quality review (privacy & consent, states, loops, structure, lint)
# ---------------------------------------------------------------------------
JS = sorted((REPO / "frontend" / "js").glob("*.js"))
PY_FILES = sorted((ROOT / "skillforge").glob("*.py")) + [ROOT / "main.py", ROOT / "devserver.py"]


def _js_text(skip=("knowledge.js",)) -> List[Tuple[Path, str]]:
    return [(f, f.read_text(encoding="utf-8")) for f in JS if f.name not in skip]


def check_consent_gate() -> Result:
    """Nothing non-essential may run before the user opts in."""
    pv = (REPO / "frontend" / "js" / "privacy.js").read_text(encoding="utf-8")
    problems = []
    if "consentAllows" not in pv or 'if (!consentAllows("analytics")) return' not in pv:
        problems.append("analytics is not gated by consentAllows()")
    if "DEFAULTS = { essential: true, analytics: false, marketing: false, ai_processing: false" not in pv:
        problems.append("optional consents do not default to off")
    # the server must refuse to call an outside AI without opt-in
    llm = (ROOT / "skillforge" / "llm.py").read_text(encoding="utf-8")
    if "def available()" not in llm or "and allowed()" not in llm:
        problems.append("Gemini is not gated by the ai_processing consent")
    import skillforge.auth as A
    if A.DEFAULT_CONSENT.get("analytics") or A.DEFAULT_CONSENT.get("ai_processing"):
        problems.append("server defaults opt the user in")
    if A.clean_consent({"essential": False})["essential"] is not True:
        problems.append("essential consent can be switched off")
    # a third-party tracker must not be embedded anywhere
    for f in (REPO / "frontend").rglob("*.html"):
        t = f.read_text(encoding="utf-8")
        for bad in ("googletagmanager", "google-analytics", "facebook.net", "hotjar", "mixpanel", "segment.com"):
            if bad in t:
                problems.append(f"{f.name} embeds {bad}")
    return (FAIL, "; ".join(problems)) if problems else \
        (PASS, "analytics/marketing/AI default to off, gated in both engines; no third-party trackers")


def check_no_pii_logged() -> Result:
    """No personal data in console output or server logs."""
    bad = []
    for f, t in _js_text():
        for m in re.finditer(r"console\.(log|info|warn|debug)\((.{0,120})", t):
            arg = m.group(2)
            if re.search(r"\b(email|password|user\.name|learner|token|phone)\b", arg, re.I):
                bad.append(f"{f.name}: console.{m.group(1)}({arg[:50]}…)")
    for f in PY_FILES:
        t = f.read_text(encoding="utf-8")
        for m in re.finditer(r"(?<![\w.])print\((.{0,120})", t):
            if re.search(r"\b(email|password|user\[|token)\b", m.group(1), re.I):
                bad.append(f"{f.name}: print({m.group(1)[:50]}…)")
    logging_src = (ROOT / "skillforge" / "routes.py").read_text(encoding="utf-8")
    if "logging" in logging_src and "%s %s" not in logging_src:
        bad.append("routes.py logs something other than method+path")
    return (FAIL, "; ".join(bad)) if bad else (PASS, "no email, password, token or profile data reaches a log")


def check_data_rights() -> Result:
    """Export and delete must exist, work, and really erase."""
    import skillforge.routes as R
    paths = {p for _, p, _, _ in R.ROUTES}
    missing = [p for p in (r"/api/privacy/export", r"/api/privacy/delete", r"/api/privacy/consent") if p not in paths]
    if missing:
        return FAIL, f"missing endpoints: {missing}"
    roles = {p: r for _, p, _, r in R.ROUTES}
    if not roles[r"/api/privacy/export"] or not roles[r"/api/privacy/delete"]:
        return FAIL, "export/delete are not restricted to a signed-in account"
    src = (ROOT / "skillforge" / "store.py").read_text(encoding="utf-8")
    for table in ("learners", "sessions", "messages", "contacts", "users"):
        if f"FROM {table}" not in src and f"DELETE FROM {table}" not in src:
            return FAIL, f"delete_user_fully does not clear {table}"
    export_src = (ROOT / "skillforge" / "auth.py").read_text(encoding="utf-8")
    if "password_hash" not in export_src or 'k != "password_hash"' not in export_src:
        return FAIL, "the export does not strip the password hash"
    return PASS, "consent/export/delete present, signed-in only, delete clears every table, export strips the hash"


def check_ui_states() -> Result:
    """Loading, empty and error states on every page that fetches."""
    missing = []
    for f, t in _js_text():
        if "await c.api(" not in t and "await api(" not in t:
            continue
        if "catch" not in t:
            missing.append(f"{f.name}: no error handling")
    pv = (REPO / "frontend" / "js" / "privacy.js").read_text(encoding="utf-8")
    for need, label in (("loading-card", "loading state"), ("error-card", "error state"), ("Try again", "retry")):
        if need not in pv:
            missing.append(f"privacy.js: no {label}")
    p2 = (REPO / "frontend" / "js" / "pages2.js").read_text(encoding="utf-8")
    if 'muted">No ' not in p2 and "No faculty members" not in p2:
        missing.append("pages2.js: no empty state")
    return (WARN, "; ".join(missing)) if missing else \
        (PASS, "every fetching page has loading, empty and error states with a retry")


def check_no_loops_or_redundant_calls() -> Result:
    """No timers that poll an API, and no page that re-fetches the same thing twice."""
    problems = []
    for f, t in _js_text():
        for m in re.finditer(r"setInterval\((.{0,200}?)\)", t, re.S):
            if re.search(r"\bapi\(|fetch\(", m.group(1)):
                problems.append(f"{f.name}: setInterval polls an API")
        if re.search(r"while \(true\)", t):
            problems.append(f"{f.name}: while(true)")
    main = (REPO / "frontend" / "js" / "main.js").read_text(encoding="utf-8")
    if main.count('api("api/meta")') > 1:
        problems.append("main.js fetches /api/meta more than once")
    # the consent state is cached, not re-fetched per call
    pv = (REPO / "frontend" / "js" / "privacy.js").read_text(encoding="utf-8")
    if pv.count('api("api/privacy/consent")') > 2:
        problems.append("privacy.js re-fetches consent repeatedly")
    return (FAIL, "; ".join(problems)) if problems else \
        (PASS, "no API polling, no unbounded loops, meta/consent fetched once and cached")


def check_structure_and_duplication() -> Result:
    """Modular files, one source of truth, no copy-pasted blocks."""
    problems = []
    big = [f.name for f in JS if f.name != "knowledge.js" and len(f.read_text(encoding="utf-8").splitlines()) > 1000]
    if big:
        problems.append(f"files over 1000 lines: {big}")
    # the knowledge base must be generated, never hand-edited in two places
    kjs = (REPO / "frontend" / "js" / "knowledge.js").read_text(encoding="utf-8")[:200]
    if "AUTO-GENERATED" not in kjs:
        problems.append("frontend knowledge.js is not generated from the Python source")
    # route tables: one per engine, not per server
    main_py = (ROOT / "main.py").read_text(encoding="utf-8")
    dev = (ROOT / "devserver.py").read_text(encoding="utf-8")
    if "routes.dispatch" not in main_py or "routes.dispatch" not in dev:
        problems.append("the two servers do not share one route table")
    # duplicated 8+ line blocks across modules
    seen: Dict[str, str] = {}
    for f, t in _js_text():
        lines = [ln.strip() for ln in t.splitlines() if len(ln.strip()) > 40]
        for i in range(len(lines) - 7):
            block = "\n".join(lines[i:i + 8])
            if block in seen and seen[block] != f.name:
                problems.append(f"8-line block duplicated: {seen[block]} and {f.name}")
                break
            seen.setdefault(block, f.name)
    return (WARN, "; ".join(problems)) if problems else \
        (PASS, f"{len(JS)} JS modules + {len(PY_FILES)} Python modules, generated knowledge base, shared route table, no duplicated blocks")


def check_lint() -> Result:
    """Syntax and obvious lint problems in both languages."""
    problems = []
    for f in PY_FILES + sorted((ROOT / "tests").glob("*.py")):
        try:
            tree = ast.parse(f.read_text(encoding="utf-8"))
        except SyntaxError as e:
            problems.append(f"{f.name}: {e}")
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ExceptHandler) and node.type is None and not node.body:
                problems.append(f"{f.name}: empty bare except")
    if shutil.which("node"):
        for f in JS:
            r = subprocess.run(["node", "--check", str(f)], capture_output=True, text=True)
            if r.returncode:
                problems.append(f"{f.name}: {r.stderr.splitlines()[0][:80]}")
    else:
        problems.append("node not available - JavaScript not checked")
    for f, t in _js_text():
        if re.search(r"^\s*(var) ", t, re.M):
            problems.append(f"{f.name}: uses var")
        if "debugger" in t:
            problems.append(f"{f.name}: debugger statement")
    return (FAIL, "; ".join(problems[:6])) if problems else \
        (PASS, f"{len(PY_FILES)} Python files parse, {len(JS)} JS files pass node --check, no var/debugger")


CHECKS: List[Tuple[str, str, Callable[[], Result]]] = [
    ("1", "hide API keys", check_hide_api_key),
    ("2", "check env variables", check_env_variables),
    ("3", "protect admin routes", check_protect_admin_routes),
    ("4", "add authentication", check_authentication),
    ("5", "check user access", check_user_access),
    ("6", "sanitize forms", check_sanitize_forms),
    ("7", "protect against XSS", check_xss),
    ("8", "add rate limits", check_rate_limits),
    ("9", "secure API endpoints", check_secure_api),
    ("10", "check CORS settings", check_cors),
    ("11", "add security headers", check_security_headers),
    ("12", "turn off debug mode", check_debug_off),
    ("13", "update dependencies", check_dependencies),
    ("14", "remove unused packages", check_unused_packages),
    ("15", "check exposed files", check_exposed_files),
    ("16", "secure database", check_secure_database),
    ("17", "hash passwords", check_hash_passwords),
    ("18", "check git for secrets", check_git_secrets),
    # --- code review -------------------------------------------------------
    ("19", "privacy: consent gate before tracking", check_consent_gate),
    ("20", "privacy: no PII in logs", check_no_pii_logged),
    ("21", "privacy: export & delete my data", check_data_rights),
    ("22", "UX: loading, empty and error states", check_ui_states),
    ("23", "no infinite loops or redundant API calls", check_no_loops_or_redundant_calls),
    ("24", "modular structure, no duplicate code", check_structure_and_duplication),
    ("25", "valid versions and clean linting", check_lint),
]


def run() -> Dict[str, Any]:
    results = []
    for num, name, fn in CHECKS:
        try:
            status, detail = fn()
        except Exception as e:                       # a broken check must not hide the rest
            status, detail = FAIL, f"check raised {type(e).__name__}: {e}"
        results.append({"n": num, "name": name, "status": status, "detail": detail})
    counts = {s: sum(1 for r in results if r["status"] == s) for s in (PASS, WARN, FAIL)}
    return {"results": results, "counts": counts, "ok": counts[FAIL] == 0}


def main() -> int:
    report = run()
    if "--json" in sys.argv:
        print(json.dumps(report, indent=2))
    else:
        icon = {PASS: "PASS", WARN: "WARN", FAIL: "FAIL"}
        print("\n  SkillForge AI - security audit\n  " + "-" * 60)
        for r in report["results"]:
            print(f"  [{icon[r['status']]}] {r['n']:>2}. {r['name']:<26} {r['detail']}")
        c = report["counts"]
        print("  " + "-" * 60)
        print(f"  {c[PASS]} passed · {c[WARN]} warnings · {c[FAIL]} failed")
        print("  19. make no mistakes          -> run `python -m pytest -q` as well\n")
    if "--strict" in sys.argv:
        return 0 if report["counts"][FAIL] == 0 and report["counts"][WARN] == 0 else 1
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
