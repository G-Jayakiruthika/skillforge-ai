"""
security.py - security primitives for SkillForge AI. Standard library only.

Covers the hardening checklist:
  hide API keys / check env vars   -> Env (no secrets in code, .env is git-ignored)
  hash passwords                   -> hash_password / verify_password (PBKDF2-HMAC-SHA256)
  add authentication               -> make_token / session helpers (auth.py)
  sanitize forms                   -> clean_text / clean_email / validate
  protect against XSS              -> clean_text strips tags; CSP in SECURITY_HEADERS
  add rate limits                  -> RateLimiter
  check CORS settings              -> allowed_origins()
  add security headers             -> SECURITY_HEADERS
  turn off debug mode              -> Env.debug (False unless explicitly enabled)
  secure database                  -> parameterised SQL everywhere + 0600 db file (store.py)
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import time
import unicodedata
from collections import defaultdict, deque
from pathlib import Path
from typing import Any, Deque, Dict, Iterable, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Environment (never hard-code secrets)
# ---------------------------------------------------------------------------
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def _load_env_file() -> None:
    if not _ENV_FILE.is_file():
        return
    for line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        if v and v not in ("your-key-here", "change-me"):
            os.environ.setdefault(k.strip(), v)


_load_env_file()


def _truthy(v: Optional[str]) -> bool:
    return str(v or "").strip().lower() in ("1", "true", "yes", "on")


class Env:
    """Validated configuration. Secrets come from the environment only."""

    debug: bool = _truthy(os.getenv("SKILLFORGE_DEBUG"))                 # off unless asked for
    public: bool = _truthy(os.getenv("SKILLFORGE_PUBLIC"))               # served beyond localhost?
    gemini_key: Optional[str] = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    db_path: Optional[str] = os.getenv("SKILLFORGE_DB")
    cors_origins_raw: str = os.getenv("SKILLFORGE_CORS_ORIGINS", "")
    admin_email: str = (os.getenv("SKILLFORGE_ADMIN_EMAIL") or "").strip().lower()   # who may be admin
    session_hours: int = max(1, min(720, int(os.getenv("SKILLFORGE_SESSION_HOURS", "72") or 72)))
    # Never read from a file that could be committed: generated per install, stored outside git.
    _secret: Optional[str] = os.getenv("SKILLFORGE_SECRET")

    @classmethod
    def secret(cls) -> str:
        """Server secret for signing. Generated and cached on first use if unset."""
        if cls._secret:
            return cls._secret
        cache = Path(os.getenv("SKILLFORGE_SECRET_FILE") or (Path(__file__).resolve().parent.parent / "data" / ".secret"))
        try:
            if cache.is_file():
                cls._secret = cache.read_text(encoding="utf-8").strip()
            if not cls._secret:
                cls._secret = secrets.token_urlsafe(48)
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_text(cls._secret, encoding="utf-8")
                try:
                    os.chmod(cache, 0o600)
                except OSError:
                    pass
        except OSError:
            cls._secret = cls._secret or secrets.token_urlsafe(48)
        return cls._secret

    @classmethod
    def report(cls) -> Dict[str, Any]:
        """Safe-to-show summary. Never returns secret values."""
        return {
            "debug": cls.debug,
            "public": cls.public,
            "gemini_configured": bool(cls.gemini_key),
            "gemini_key_preview": (cls.gemini_key[:4] + "…" + cls.gemini_key[-2:]) if cls.gemini_key else None,
            "session_hours": cls.session_hours,
            "admin_email_configured": bool(cls.admin_email),
            "demo_logins": not cls.public,
            "cors_origins": allowed_origins(),
            "secret_source": "environment" if os.getenv("SKILLFORGE_SECRET") else "generated file (data/.secret)",
        }

    @classmethod
    def warnings(cls) -> List[str]:
        out = []
        if cls.debug:
            out.append("SKILLFORGE_DEBUG is on - turn it off before sharing this server.")
        if cls.public and cls.cors_origins_raw.strip() in ("", "*"):
            out.append("Server is public but CORS origins are not restricted - set SKILLFORGE_CORS_ORIGINS.")
        if cls.public and not cls.admin_email:
            out.append("Server is public but SKILLFORGE_ADMIN_EMAIL is not set - nobody can become admin.")
        if cls.gemini_key and len(cls.gemini_key) < 20:
            out.append("GEMINI_API_KEY looks too short to be valid.")
        if cls.public and not os.getenv("SKILLFORGE_SECRET"):
            out.append("SKILLFORGE_SECRET is not set - the signing key is a generated file, so every "
                       "redeploy signs all users out. Set it to a fixed random value.")
        out.extend(cls._storage_warnings())
        return out

    # The single most expensive mistake available on a PaaS: running publicly with the
    # database inside the application directory, which most hosts replace on each deploy.
    # Every account then disappears at the next push, silently.
    @classmethod
    def _storage_warnings(cls) -> List[str]:
        if not cls.public:
            return []
        from pathlib import Path as _Path
        app_dir = _Path(__file__).resolve().parent.parent
        db = _Path(cls.db_path).resolve() if cls.db_path else (app_dir / "data" / "skillforge.db")
        try:
            inside_app = db == app_dir or app_dir in db.parents
        except OSError:
            inside_app = False
        if inside_app:
            return ["Server is public but the database lives inside the application folder "
                    f"({db}). Most hosts wipe that folder on every deploy, which would delete every "
                    "account. Point SKILLFORGE_DB at a mounted volume - see docs/DEPLOYMENT.md."]
        return []


def allowed_origins() -> List[str]:
    """CORS allow-list. Localhost only by default - never '*' with credentials."""
    raw = Env.cors_origins_raw.strip()
    if raw and raw != "*":
        return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    return [f"http://{h}:{p}" for h in ("localhost", "127.0.0.1") for p in (8000, 8080, 5173, 3000)]


# Content-Security-Policy: scripts/styles from this origin only; Google Fonts allowed;
# no plugins, no framing, images/media from self and data: URIs.
CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; "
    "img-src 'self' data: blob:; "
    "media-src 'self' blob:; "
    "connect-src 'self'; "
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)
SECURITY_HEADERS: Dict[str, str] = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), camera=(), payment=(), usb=(), microphone=(self)",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Cache-Control": "no-store",
}


def response_headers(path: str = "", https: bool = False) -> Dict[str, str]:
    h = dict(SECURITY_HEADERS)
    if not path.startswith("/api/"):
        h["Cache-Control"] = "no-cache"           # static files may revalidate
    if https or Env.public:
        h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return h


# ---------------------------------------------------------------------------
# Passwords (PBKDF2-HMAC-SHA256; OWASP-recommended iteration count)
# ---------------------------------------------------------------------------
PBKDF2_ITERATIONS = 600_000
MIN_PASSWORD = 8
_COMMON = {"password", "12345678", "123456789", "qwerty123", "password1", "iloveyou", "admin123",
           "welcome1", "letmein1", "abc12345", "11111111", "skillforge"}


def hash_password(password: str, *, iterations: int = PBKDF2_ITERATIONS) -> str:
    """-> 'pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>'. Plain text is never stored."""
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check. False on any malformed record."""
    try:
        algo, iters, salt_hex, hash_hex = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, AttributeError, TypeError):
        return False


def password_problem(password: str, *, email: str = "", name: str = "") -> Optional[str]:
    """Human-readable reason a password is unacceptable, or None if it is fine."""
    p = password or ""
    if len(p) < MIN_PASSWORD:
        return f"Password must be at least {MIN_PASSWORD} characters."
    if len(p) > 200:
        return "Password must be under 200 characters."
    low = p.lower()
    if low in _COMMON:
        return "That password is too common. Please choose something less guessable."
    if not re.search(r"[A-Za-z]", p) or not re.search(r"\d", p):
        return "Password must contain at least one letter and one number."
    for part in filter(None, [email.split("@")[0].lower() if email else "", name.lower()]):
        if len(part) >= 4 and part in low:
            return "Password must not contain your name or email."
    return None


def make_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def token_fingerprint(token: str) -> str:
    """Sessions are stored as an HMAC, so a leaked database cannot be replayed."""
    return hmac.new(Env.secret().encode(), token.encode(), hashlib.sha256).hexdigest()


# ---------------------------------------------------------------------------
# Input sanitising / validation
# ---------------------------------------------------------------------------
_TAG = re.compile(r"<[^>]*>")
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_EMAIL = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$")
_URLISH = re.compile(r"(?:javascript|data|vbscript)\s*:", re.I)


def clean_text(value: Any, *, max_len: int = 300, allow_newlines: bool = False) -> str:
    """Strip tags, control characters and dangerous URI schemes; collapse whitespace; truncate.

    Output is also HTML-escaped at render time in the browser - defence in depth.
    """
    s = "" if value is None else str(value)
    s = unicodedata.normalize("NFKC", s)
    s = _TAG.sub(" ", s)
    s = _URLISH.sub("", s)
    s = _CTRL.sub("", s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s) if allow_newlines else re.sub(r"\s+", " ", s)
    return s.strip()[:max_len]


def clean_email(value: Any) -> str:
    e = clean_text(value, max_len=254).lower().replace(" ", "")
    return e if _EMAIL.match(e) else ""


def clean_choice(value: Any, allowed: Iterable[str], default: str = "") -> str:
    v = clean_text(value, max_len=120)
    allowed = list(allowed)
    return v if v in allowed else default


def clean_int(value: Any, lo: int, hi: int, default: int) -> int:
    try:
        return max(lo, min(hi, int(float(value))))
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Rate limiting (sliding window, in-process)
# ---------------------------------------------------------------------------
class RateLimiter:
    """Simple sliding-window limiter.

    Used per-IP for writes and per-account for logins, so a stolen password cannot be
    brute-forced and one client cannot flood the agents.
    """

    def __init__(self) -> None:
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._blocked: Dict[str, float] = {}

    def check(self, key: str, limit: int, window: float, *, block: float = 0) -> Tuple[bool, int]:
        """-> (allowed, retry_after_seconds)."""
        now = time.time()
        until = self._blocked.get(key, 0)
        if until > now:
            return False, int(until - now) + 1
        q = self._hits[key]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            if block:
                self._blocked[key] = now + block
                q.clear()
                return False, int(block) + 1
            return False, int(window - (now - q[0])) + 1
        q.append(now)
        if len(self._hits) > 5000:                       # bound memory
            for k in [k for k, v in list(self._hits.items())[:1000] if not v or now - v[-1] > 3600]:
                self._hits.pop(k, None)
        return True, 0

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)
        self._blocked.pop(key, None)


limiter = RateLimiter()

# path prefix -> (limit, window seconds, block seconds on breach)
RATE_RULES: List[Tuple[str, int, float, float]] = [
    ("/api/auth/login", 8, 300, 900),      # 8 failures / 5 min -> 15 min lockout
    ("/api/auth/signup", 5, 3600, 0),      # 5 new accounts per hour per IP
    ("/api/auth/forgot", 5, 3600, 0),      # 5 reset emails per hour per IP
    ("/api/auth/reset", 10, 3600, 0),      # guessing a token is hopeless, but cap it anyway
    ("/api/auth/verify", 10, 3600, 0),
    ("/api/contact", 5, 3600, 0),          # 5 contact messages per hour per IP
    ("/api/auth/demo", 20, 3600, 0),       # demo sessions
    ("/api/faculty/", 30, 3600, 0),        # questions to faculty
    ("/api/messages", 120, 3600, 0),
    ("/api/demo/reset", 6, 3600, 0),
    ("/api/", 240, 60, 0),                 # general API ceiling
]


def rate_rule_for(path: str) -> Tuple[int, float, float]:
    for prefix, limit, window, block in RATE_RULES:
        if path.startswith(prefix):
            return limit, window, block
    return 600, 60, 0


def client_key(ip: str, path: str) -> str:
    for prefix, *_ in RATE_RULES:
        if path.startswith(prefix):
            return f"{ip}|{prefix}"
    return f"{ip}|other"


def same_origin(origin: Optional[str], host: Optional[str]) -> bool:
    """CSRF guard for state-changing requests. Browsers always send Origin on cross-site POSTs,
    so: no Origin (curl, tests, same-origin GET-style clients) is fine; an Origin must match the
    Host header or be on the CORS allow-list."""
    if not origin:
        return True
    o = origin.rstrip("/").lower()
    if o in [a.lower() for a in allowed_origins()]:
        return True
    h = (host or "").lower()
    return bool(h) and o in (f"http://{h}", f"https://{h}")


SAFE_ERROR = "Something went wrong. Please try again."


def safe_error(exc: BaseException) -> str:
    """Never leak tracebacks or internals to clients unless debugging locally."""
    return f"{type(exc).__name__}: {exc}" if Env.debug else SAFE_ERROR
