"""
devserver.py - zero-install fallback server (Python standard library only).

Use this if `pip install` is blocked on your network:
    python devserver.py            ->  http://localhost:8000
It serves the same API (shared route table), the same frontend and the same
security rules as main.py: session cookies, security headers, rate limits,
role checks and a block-list for sensitive paths.
"""
from __future__ import annotations

import json
import mimetypes
import sys
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from skillforge import auth, routes, security, service  # noqa: E402
from skillforge.security import Env  # noqa: E402

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
BLOCKED = {".env", ".git", ".secret", "data", "__pycache__", ".venv", "node_modules"}
ALLOWED_SUFFIX = {".html", ".css", ".js", ".mjs", ".json", ".svg", ".png", ".jpg", ".webp",
                  ".ico", ".woff2", ".txt", ".webm"}
MAX_BODY = 256_000


class Handler(BaseHTTPRequestHandler):
    server_version = "SkillForge"
    sys_version = ""

    def _send(self, status: int, payload, ctype: str = "application/json", extra=None, path: str = "") -> None:
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        for k, v in security.response_headers(path).items():
            self.send_header(k, v)
        origin = self.headers.get("Origin")
        if origin and origin.rstrip("/") in security.allowed_origins():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Vary", "Origin")
        for k, v in (extra or []):
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _token(self):
        raw = self.headers.get("Cookie")
        if not raw:
            return None
        try:
            return SimpleCookie(raw).get(auth.SESSION_COOKIE).value  # type: ignore[union-attr]
        except (AttributeError, Exception):
            return None

    def _ip(self) -> str:
        return self.client_address[0] if self.client_address else "unknown"

    def _handle(self, method: str) -> None:
        url = urlparse(self.path)
        parts = [p for p in url.path.split("/") if p]
        if any(p in BLOCKED or p.startswith(".") for p in parts):
            return self._send(404, {"detail": "Not found"})

        if url.path.startswith("/api/"):
            body = {}
            if method == "POST":
                n = int(self.headers.get("Content-Length") or 0)
                if n > MAX_BODY:
                    return self._send(413, {"detail": "Request too large."})
                try:
                    body = json.loads(self.rfile.read(n) or b"{}")
                    if not isinstance(body, dict):
                        body = {}
                except json.JSONDecodeError:
                    return self._send(400, {"detail": "Invalid JSON."})
            token = self._token()
            user = auth.user_for_token(token)
            query = {k: v[0] for k, v in parse_qs(url.query).items()}
            status, payload, ctx = routes.dispatch(method, url.path, query, body,
                                                   user=user, ip=self._ip(), token=token,
                                                   origin=self.headers.get("Origin"), host=self.headers.get("Host"))
            extra = []
            if ctx.set_cookie:
                extra.append(("Set-Cookie", f"{auth.SESSION_COOKIE}={ctx.set_cookie}; HttpOnly; SameSite=Lax; "
                                            f"Path=/; Max-Age={Env.session_hours * 3600}"))
            if ctx.clear_cookie:
                extra.append(("Set-Cookie", f"{auth.SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"))
            return self._send(status, payload, extra=extra, path=url.path)

        rel = "index.html" if url.path in ("/", "") else url.path.lstrip("/")
        if rel.endswith("/"):
            rel += "index.html"
        f = (FRONTEND / rel).resolve()
        if FRONTEND.resolve() not in f.parents or not f.is_file():
            f = FRONTEND / "index.html"
        if f.suffix.lower() not in ALLOWED_SUFFIX:
            return self._send(404, {"detail": "Not found"})
        self._send(200, f.read_bytes(), mimetypes.guess_type(f.name)[0] or "application/octet-stream",
                   path=url.path)

    def do_GET(self) -> None:  # noqa: N802
        self._handle("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._handle("POST")

    def do_OPTIONS(self) -> None:  # noqa: N802
        origin = (self.headers.get("Origin") or "").rstrip("/")
        self.send_response(204)
        if origin in security.allowed_origins():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def log_message(self, fmt, *args) -> None:
        sys.stderr.write("  " + fmt % args + "\n")


def main(port: int = 8000) -> None:
    service.seed_demo()
    h = service.health()
    print(f"SkillForge AI running at http://localhost:{port}  (engine: {h['agent_engine']}, Gemini: {h['gemini']})")
    for w in Env.warnings():
        print(f"  [security] {w}")
    print("  press Ctrl+C to stop")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 8000)
