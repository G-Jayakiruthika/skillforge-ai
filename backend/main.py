"""
main.py - SkillForge AI (FastAPI server).

Run:   uvicorn main:app --port 8000      (from the backend folder)
Open:  http://localhost:8000          (landing page; app.html = dashboard)
       http://localhost:8000/docs     (API docs - disabled when SKILLFORGE_PUBLIC=1)

Security: session cookies are HttpOnly + SameSite=Lax; every response carries the
headers in skillforge/security.py; CORS is an allow-list, never "*"; rate limits and
role checks run inside routes.dispatch; sensitive paths are never served.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from skillforge import auth, routes, security, service
from skillforge.security import Env

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
BLOCKED = {".env", ".git", ".secret", "data", "__pycache__", ".venv", "node_modules"}
# File types the frontend may serve. Anything else is refused, whatever the URL.
ALLOWED_SUFFIX = {".html", ".css", ".js", ".mjs", ".json", ".webmanifest", ".svg", ".png",
                  ".jpg", ".webp", ".ico", ".woff2", ".txt", ".xml", ".webm"}

app = FastAPI(
    title="SkillForge AI", version="4.0.0",
    description="Multi-agent adaptive career & learning engine",
    docs_url=None if Env.public else "/docs",
    redoc_url=None,
    openapi_url=None if Env.public else "/openapi.json",
    debug=False,                                   # never expose tracebacks
)
app.add_middleware(CORSMiddleware, allow_origins=security.allowed_origins(),
                   allow_credentials=True, allow_methods=["GET", "POST", "OPTIONS"],
                   allow_headers=["Content-Type"], max_age=600)


@app.on_event("startup")
def _startup() -> None:
    service.seed_demo()
    for w in Env.warnings():
        print(f"  [security] {w}")


@app.middleware("http")
async def _secure(request: Request, call_next):
    # Never serve dotfiles, the database folder or caches, whatever the URL says.
    if any(part in BLOCKED or part.startswith(".") for part in request.url.path.split("/") if part):
        return JSONResponse({"detail": "Not found"}, status_code=404)
    response = await call_next(request)
    for k, v in security.response_headers(request.url.path, https=request.url.scheme == "https").items():
        response.headers.setdefault(k, v)
    response.headers["Server"] = "SkillForge"      # hide the real server banner
    return response


def _client_ip(request: Request) -> str:
    return (request.client.host if request.client else "") or "unknown"


def _make_endpoint(method: str):
    async def endpoint(request: Request) -> Response:
        body: Dict[str, Any] = {}
        if method == "POST":
            try:
                raw = await request.body()
                if len(raw) > 256_000:                      # cap request size
                    return JSONResponse({"detail": "Request too large."}, status_code=413)
                body = __import__("json").loads(raw or b"{}")
                if not isinstance(body, dict):
                    body = {}
            except Exception:
                return JSONResponse({"detail": "Invalid JSON."}, status_code=400)
        token = request.cookies.get(auth.SESSION_COOKIE)
        user = auth.user_for_token(token)
        status, payload, ctx = routes.dispatch(method, request.url.path, dict(request.query_params), body,
                                               user=user, ip=_client_ip(request), token=token,
                                               origin=request.headers.get("origin"),
                                               host=request.headers.get("host"))
        res = JSONResponse(payload, status_code=status)
        if ctx.set_cookie:
            res.set_cookie(auth.SESSION_COOKIE, ctx.set_cookie, max_age=Env.session_hours * 3600,
                           httponly=True, samesite="lax", secure=Env.public, path="/")
        if ctx.clear_cookie:
            res.delete_cookie(auth.SESSION_COOKIE, path="/")
        return res
    return endpoint


for _method, _pattern, _, _ in routes.ROUTES:
    _path = __import__("re").sub(r"\(\?P<(\w+)>[^)]*\)", r"{\1}", _pattern)
    app.add_api_route(_path, _make_endpoint(_method), methods=[_method],
                      name=f"{_method} {_path}", include_in_schema=not Env.public)


@app.get("/{full_path:path}", include_in_schema=False)
def frontend(full_path: str) -> Response:
    """Serve the frontend. Only known-safe file types, only from the frontend folder."""
    rel = full_path or "index.html"
    if rel.endswith("/"):
        rel += "index.html"
    target = (FRONTEND / rel).resolve()
    missing = FRONTEND.resolve() not in target.parents or not target.is_file()
    if missing:
        # A wrong address gets the real 404 page and a 404 status, so browsers,
        # crawlers and link checkers are told the truth instead of being handed
        # the landing page with a 200.
        target = FRONTEND / "404.html"
    if target.suffix.lower() not in ALLOWED_SUFFIX:
        return JSONResponse({"detail": "Not found"}, status_code=404)
    return FileResponse(target, status_code=404 if missing else 200)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False, server_header=False)
