"""
store.py - SQLite persistence (Python standard library, no setup needed).

Tables: learners (one JSON document each), users, sessions, contacts.

Security notes
  * every query is parameterised - no string-built SQL, so no SQL injection
  * the database file is created 0600 (owner read/write only)
  * passwords are stored only as PBKDF2 hashes; session tokens only as HMACs
  * the data/ directory is git-ignored so no learner data or secrets are committed
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

DB_PATH = Path(os.getenv("SKILLFORGE_DB") or (Path(__file__).resolve().parent.parent / "data" / "skillforge.db"))
_lock = threading.RLock()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS learners (
  id TEXT PRIMARY KEY, doc TEXT NOT NULL, updated TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', learner_id TEXT,
  institution_id TEXT, institution TEXT, department TEXT, city TEXT, district TEXT,
  state TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP, last_login TEXT, consent TEXT);
CREATE TABLE IF NOT EXISTS sessions (
  token_fp TEXT PRIMARY KEY, user_id TEXT NOT NULL, created REAL NOT NULL, expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, subject TEXT, message TEXT,
  institution TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP, handled INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, from_user TEXT NOT NULL, from_name TEXT, to_user TEXT NOT NULL,
  to_name TEXT, body TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP, reply TEXT, replied TEXT);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user);
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_user);
CREATE INDEX IF NOT EXISTS idx_users_inst ON users(institution_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
"""


def _conn() -> sqlite3.Connection:
    first = not DB_PATH.exists()
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.executescript(_SCHEMA)
    if "consent" not in {r["name"] for r in c.execute("PRAGMA table_info(users)")}:
        c.execute("ALTER TABLE users ADD COLUMN consent TEXT")          # migrate older databases
    if first:
        try:
            os.chmod(DB_PATH, 0o600)         # owner-only
        except OSError:
            pass
    return c


# ---------------------------------------------------------------- learners
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


def delete_learner(learner_id: str) -> None:
    with _lock, _conn() as c:
        c.execute("DELETE FROM learners WHERE id=?", (learner_id,))


def delete_all() -> None:
    with _lock, _conn() as c:
        c.execute("DELETE FROM learners")


def delete_user_fully(user_id: str, learner_id: Optional[str]) -> Dict[str, int]:
    """Erase an account and everything attached to it. Used by 'Delete my account & data'."""
    counts = {"learners": 0, "sessions": 0, "messages": 0, "contacts": 0}
    with _lock, _conn() as c:
        if learner_id:
            counts["learners"] = c.execute("DELETE FROM learners WHERE id=?", (learner_id,)).rowcount
        counts["sessions"] = c.execute("DELETE FROM sessions WHERE user_id=?", (user_id,)).rowcount
        row = c.execute("SELECT email FROM users WHERE id=?", (user_id,)).fetchone()
        counts["messages"] = c.execute("DELETE FROM messages WHERE from_user=? OR to_user=?",
                                       (user_id, user_id)).rowcount
        if row:
            counts["contacts"] = c.execute("DELETE FROM contacts WHERE email=?", (row["email"],)).rowcount
        c.execute("DELETE FROM users WHERE id=?", (user_id,))
    return counts


def delete_demo_learners() -> int:
    """Remove only the fictional demo learners - real students' profiles are never touched."""
    n = 0
    for l in all_learners():
        if l.get("demo"):
            delete_learner(l["id"])
            n += 1
    return n


# ---------------------------------------------------------------- users
USER_PUBLIC = ("id", "email", "name", "role", "learner_id", "institution_id", "institution",
               "department", "city", "district", "state", "created", "last_login", "consent")


def _user_dict(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    d = {k: row[k] for k in USER_PUBLIC}
    if isinstance(d.get("consent"), str):                                # stored as JSON text
        try:
            d["consent"] = json.loads(d["consent"])
        except ValueError:
            d["consent"] = None
    return d


def create_user(user: Dict[str, Any]) -> Dict[str, Any]:
    cols = ("id", "email", "password_hash", "name", "role", "learner_id", "institution_id",
            "institution", "department", "city", "district", "state")
    with _lock, _conn() as c:
        c.execute(f"INSERT INTO users ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                  tuple(user.get(k) for k in cols))
    return get_user(user["id"])  # type: ignore[return-value]


def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    with _lock, _conn() as c:
        return _user_dict(c.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Includes password_hash - only for the login path."""
    with _lock, _conn() as c:
        row = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    return dict(row) if row else None


# Column names that may be updated. Keys are matched against this frozen set before they
# reach SQL, so a request can never name an arbitrary column.
UPDATABLE = frozenset({"consent", "name", "role", "learner_id", "institution_id", "institution", "department",
                       "city", "district", "state", "password_hash", "last_login"})


def update_user(user_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    sets = {k: v for k, v in fields.items() if k in UPDATABLE}
    if not sets:
        return get_user(user_id)
    with _lock, _conn() as c:
        c.execute(f"UPDATE users SET {','.join(f'{k}=?' for k in sets)} WHERE id=?",
                  (*sets.values(), user_id))
    return get_user(user_id)


# Fully static SQL: optional filters are expressed as parameters, never concatenated.
_LIST_USERS = ("SELECT * FROM users WHERE (:role IS NULL OR role = :role) "
               "AND (:inst IS NULL OR institution_id = :inst) ORDER BY name")


def list_users(role: Optional[str] = None, institution_id: Optional[str] = None) -> List[Dict[str, Any]]:
    with _lock, _conn() as c:
        rows = c.execute(_LIST_USERS, {"role": role or None, "inst": institution_id or None}).fetchall()
    return [_user_dict(r) for r in rows]  # type: ignore[misc]


def count_users() -> int:
    with _lock, _conn() as c:
        return int(c.execute("SELECT COUNT(*) FROM users").fetchone()[0])


# ---------------------------------------------------------------- sessions
def create_session(token_fp: str, user_id: str, ttl_seconds: float) -> None:
    now = time.time()
    with _lock, _conn() as c:
        c.execute("INSERT OR REPLACE INTO sessions (token_fp, user_id, created, expires) VALUES (?,?,?,?)",
                  (token_fp, user_id, now, now + ttl_seconds))
        c.execute("DELETE FROM sessions WHERE expires < ?", (now,))


def session_user(token_fp: str) -> Optional[Dict[str, Any]]:
    with _lock, _conn() as c:
        row = c.execute("SELECT user_id, expires FROM sessions WHERE token_fp=?", (token_fp,)).fetchone()
        if not row or row["expires"] < time.time():
            if row:
                c.execute("DELETE FROM sessions WHERE token_fp=?", (token_fp,))
            return None
        return _user_dict(c.execute("SELECT * FROM users WHERE id=?", (row["user_id"],)).fetchone())


def end_session(token_fp: str) -> None:
    with _lock, _conn() as c:
        c.execute("DELETE FROM sessions WHERE token_fp=?", (token_fp,))


def end_all_sessions(user_id: str) -> None:
    with _lock, _conn() as c:
        c.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))


# ---------------------------------------------------------------- contacts
def add_contact(entry: Dict[str, Any]) -> int:
    with _lock, _conn() as c:
        cur = c.execute("INSERT INTO contacts (name, email, subject, message, institution) VALUES (?,?,?,?,?)",
                        (entry.get("name"), entry.get("email"), entry.get("subject"),
                         entry.get("message"), entry.get("institution")))
        return int(cur.lastrowid)


def list_contacts(limit: int = 200) -> List[Dict[str, Any]]:
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM contacts ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]


def count_contacts() -> int:
    with _lock, _conn() as c:
        return int(c.execute("SELECT COUNT(*) FROM contacts").fetchone()[0])


# ---------------------------------------------------------------- messages (student -> faculty)
def add_message(from_user: str, from_name: str, to_user: str, to_name: str, body: str) -> int:
    with _lock, _conn() as c:
        cur = c.execute("INSERT INTO messages (from_user, from_name, to_user, to_name, body) VALUES (?,?,?,?,?)",
                        (from_user, from_name, to_user, to_name, body))
        return int(cur.lastrowid)


def get_message(mid: int) -> Optional[Dict[str, Any]]:
    with _lock, _conn() as c:
        row = c.execute("SELECT * FROM messages WHERE id=?", (mid,)).fetchone()
    return dict(row) if row else None


def messages_for(user_id: str, limit: int = 200) -> List[Dict[str, Any]]:
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM messages WHERE to_user=? OR from_user=? ORDER BY id DESC LIMIT ?",
                         (user_id, user_id, limit)).fetchall()
    return [dict(r) for r in rows]


def reply_message(mid: int, reply: str) -> None:
    with _lock, _conn() as c:
        c.execute("UPDATE messages SET reply=?, replied=CURRENT_TIMESTAMP WHERE id=?", (reply, mid))
