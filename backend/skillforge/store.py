"""
store.py - tiny SQLite persistence (Python standard library, no setup needed).
Each learner is stored as one JSON document.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

DB_PATH = Path(os.getenv("SKILLFORGE_DB", Path(__file__).resolve().parent.parent / "data" / "skillforge.db"))
_lock = threading.Lock()


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.execute("CREATE TABLE IF NOT EXISTS learners (id TEXT PRIMARY KEY, doc TEXT NOT NULL, "
              "updated TEXT DEFAULT CURRENT_TIMESTAMP)")
    return c


def save(learner: Dict[str, Any]) -> None:
    with _lock, _conn() as c:
        c.execute("INSERT INTO learners (id, doc, updated) VALUES (?, ?, CURRENT_TIMESTAMP) "
                  "ON CONFLICT(id) DO UPDATE SET doc=excluded.doc, updated=CURRENT_TIMESTAMP",
                  (learner["id"], json.dumps(learner)))


def get(learner_id: str) -> Optional[Dict[str, Any]]:
    with _lock, _conn() as c:
        row = c.execute("SELECT doc FROM learners WHERE id=?", (learner_id,)).fetchone()
    return json.loads(row[0]) if row else None


def all_learners() -> List[Dict[str, Any]]:
    with _lock, _conn() as c:
        rows = c.execute("SELECT doc FROM learners ORDER BY updated DESC").fetchall()
    return [json.loads(r[0]) for r in rows]


def delete_all() -> None:
    with _lock, _conn() as c:
        c.execute("DELETE FROM learners")
