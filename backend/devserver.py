"""
devserver.py - zero-install fallback server (Python standard library only).

Use this if `pip install` is blocked on your network:
    python devserver.py            ->  http://localhost:8000
It serves the same API (shared route table) and the same frontend as main.py.
"""
from __future__ import annotations

import json
import mimetypes
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from skillforge import routes, service  # noqa: E402

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload, ctype: str = "application/json") -> None:
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def _handle(self, method: str) -> None:
        url = urlparse(self.path)
        if url.path.startswith("/api/"):
            body = {}
            if method == "POST":
                n = int(self.headers.get("Content-Length") or 0)
                try:
                    body = json.loads(self.rfile.read(n) or b"{}")
                except json.JSONDecodeError:
                    return self._send(400, {"detail": "Invalid JSON"})
            query = {k: v[0] for k, v in parse_qs(url.query).items()}
            status, payload = routes.dispatch(method, url.path, query, body)
            return self._send(status, payload)
        rel = "index.html" if url.path in ("/", "") else url.path.removeprefix("/static/").lstrip("/")
        f = (FRONTEND / rel).resolve()
        if FRONTEND.resolve() not in f.parents or not f.is_file():
            return self._send(404, {"detail": "Not found"})
        self._send(200, f.read_bytes(), mimetypes.guess_type(f.name)[0] or "application/octet-stream")

    def do_GET(self) -> None:  # noqa: N802
        self._handle("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._handle("POST")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def log_message(self, fmt, *args) -> None:
        sys.stderr.write("  " + fmt % args + "\n")


def main(port: int = 8000) -> None:
    service.seed_demo()
    print(f"SkillForge AI running at http://localhost:{port}  (engine: {service.health()['agent_engine']}, "
          f"Gemini: {service.health()['gemini']})  - press Ctrl+C to stop")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 8000)
