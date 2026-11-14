"""
llm.py - optional Google Gemini integration.

Uses the current `google-genai` SDK (the old `google-generativeai` package is
deprecated). If the package is missing, no GEMINI_API_KEY is set, or a call
fails, every function returns None and the agents fall back to their
deterministic logic - so the app always works, with or without a key.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

# Load backend/.env (KEY=value lines) without needing python-dotenv.
_env = Path(__file__).resolve().parent.parent / ".env"
if _env.is_file():
    for _line in _env.read_text(encoding="utf-8").splitlines():
        if "=" in _line and not _line.lstrip().startswith("#"):
            _k, _v = _line.split("=", 1)
            if _v.strip() and _v.strip() != "your-key-here":
                os.environ.setdefault(_k.strip(), _v.strip().strip('"'))

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

_client = None
_status = "disabled (no GEMINI_API_KEY)"

try:  # pragma: no cover - depends on environment
    if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        from google import genai  # type: ignore

        _client = genai.Client()
        _status = f"active ({MODEL})"
except Exception as exc:  # pragma: no cover
    _client = None
    _status = f"disabled ({type(exc).__name__}: {exc})"[:120]


def available() -> bool:
    return _client is not None


def status() -> str:
    return _status


def generate_text(prompt: str) -> Optional[str]:
    """Plain text completion. Returns None on any failure."""
    if not _client:
        return None
    try:  # pragma: no cover - network
        res = _client.models.generate_content(model=MODEL, contents=prompt)
        text = (res.text or "").strip()
        return text or None
    except Exception:
        return None


def generate_json(prompt: str) -> Optional[Dict[str, Any]]:
    """Ask for a JSON object. Returns None on any failure or bad JSON."""
    if not _client:
        return None
    try:  # pragma: no cover - network
        res = _client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        data = json.loads(res.text)
        return data if isinstance(data, dict) else None
    except Exception:
        return None
