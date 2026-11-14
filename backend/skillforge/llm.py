"""
llm.py - optional Google Gemini integration.

Uses the current `google-genai` SDK (the old `google-generativeai` package is
deprecated). If the package is missing, no GEMINI_API_KEY is set, or a call
fails, every function returns None and the agents fall back to their
deterministic logic - so the app always works, with or without a key.
"""
from __future__ import annotations

import json
import threading
from typing import Any, Dict, Optional

from .security import Env  # loads .env; the key itself is never stored in code

MODEL = Env.gemini_model

_client = None
_status = "disabled (no GEMINI_API_KEY)"

try:  # pragma: no cover - depends on environment
    if Env.gemini_key:
        from google import genai  # type: ignore

        _client = genai.Client()
        _status = f"active ({MODEL})"
except Exception as exc:  # pragma: no cover
    _client = None
    _status = f"disabled ({type(exc).__name__}: {exc})"[:120]


# Consent gate: Gemini is an outside processor, so it is used only when the signed-in user
# has switched "AI processing" on. Set per request by service.py; cleared afterwards.
_allowed = threading.local()


def set_allowed(flag: bool) -> None:
    _allowed.ok = bool(flag)


def allowed() -> bool:
    return getattr(_allowed, "ok", False)


def available() -> bool:
    """True only when a key is configured AND this request may use an outside AI processor."""
    return _client is not None and allowed()


def configured() -> bool:
    """A key is present (ignores consent) - for the status pill."""
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
