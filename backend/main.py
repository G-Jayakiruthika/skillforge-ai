"""
main.py - SkillForge AI (FastAPI server).

Run:   uvicorn main:app --reload --port 8000      (from the backend folder)
Open:  http://localhost:8000          (landing page; app.html = dashboard)
       http://localhost:8000/docs     (interactive API docs)
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from skillforge import routes, service

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"

app = FastAPI(title="SkillForge AI", version="3.0.0",
              description="Multi-agent adaptive career & learning engine")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _seed() -> None:
    service.seed_demo()


def _make_endpoint(method: str):
    async def endpoint(request: Request) -> JSONResponse:
        body: Dict[str, Any] = {}
        if method == "POST":
            try:
                body = await request.json()
            except Exception:
                body = {}
        status, payload = routes.dispatch(method, request.url.path, dict(request.query_params), body)
        return JSONResponse(payload, status_code=status)
    return endpoint


# Register every route from the shared table (keeps FastAPI and devserver identical).
for _method, _pattern, _ in routes.ROUTES:
    _path = _pattern.replace(r"(?P<lid>[\w-]+)", "{lid}")
    app.add_api_route(_path, _make_endpoint(_method), methods=[_method], name=f"{_method} {_path}")

# Serve every page of the frontend (index.html, app.html, analysis.html, ...) - mounted last
# so the /api routes above take priority.
app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
