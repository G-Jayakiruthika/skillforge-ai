#!/usr/bin/env python3
"""
backup.py - back up and restore the SkillForge AI database.

    python backup.py                      write a backup into ./backups
    python backup.py --dir /mnt/backups   write it somewhere else
    python backup.py --keep 30            delete backups older than the newest 30
    python backup.py --list               show what backups exist
    python backup.py --restore FILE       put a backup back (asks first)

Uses SQLite's own online backup, so it is safe to run while the server is
serving requests: the copy is a consistent snapshot, not a half-written file.

A backup sitting on the same disk as the database is not a backup. Copy the
files off the machine - rclone, scp, or your host's object storage - or the
next disk failure takes both.

Suggested cron entry (daily at 03:17, keeping a month):

    17 3 * * * cd /app/backend && python backup.py --dir /backups --keep 30
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import time
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parent / "data" / "skillforge.db"


def db_path() -> Path:
    return Path(os.getenv("SKILLFORGE_DB") or DEFAULT_DB)


def human(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024.0
    return f"{n:.1f} GB"


def make_backup(target_dir: Path) -> Path:
    source = db_path()
    if not source.exists():
        sys.exit(f"No database at {source}. Nothing to back up.")
    target_dir.mkdir(parents=True, exist_ok=True)
    out = target_dir / f"skillforge-{time.strftime('%Y%m%d-%H%M%S')}.db"

    src = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    dst = sqlite3.connect(out)
    try:
        with dst:
            src.backup(dst)          # online backup: consistent even under writes
    finally:
        src.close()
        dst.close()
    try:
        os.chmod(out, 0o600)         # same privacy as the database itself
    except OSError:
        pass

    # A backup that cannot be opened is worse than none, so check before reporting success.
    check = sqlite3.connect(out)
    try:
        result = check.execute("PRAGMA integrity_check").fetchone()[0]
        users = check.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        learners = check.execute("SELECT COUNT(*) FROM learners").fetchone()[0]
    finally:
        check.close()
    if result != "ok":
        out.unlink(missing_ok=True)
        sys.exit(f"Backup failed its integrity check ({result}); the file was removed.")

    print(f"Backed up to {out}  ({human(out.stat().st_size)}, {users} accounts, {learners} profiles, integrity ok)")
    return out


def prune(target_dir: Path, keep: int) -> None:
    files = sorted(target_dir.glob("skillforge-*.db"), reverse=True)
    for old in files[keep:]:
        old.unlink()
        print(f"Removed old backup {old.name}")


def list_backups(target_dir: Path) -> None:
    files = sorted(target_dir.glob("skillforge-*.db"), reverse=True)
    if not files:
        print(f"No backups in {target_dir}")
        return
    print(f"{len(files)} backup(s) in {target_dir}:")
    for f in files:
        stamp = time.strftime("%Y-%m-%d %H:%M", time.localtime(f.stat().st_mtime))
        print(f"  {f.name}  {human(f.stat().st_size):>9}  {stamp}")


def restore(backup: Path) -> None:
    target = db_path()
    if not backup.exists():
        sys.exit(f"No such backup: {backup}")
    print(f"This replaces {target} with {backup}.")
    print("Stop the server first, or the running process will keep writing to the old file.")
    if input("Type RESTORE to continue: ").strip() != "RESTORE":
        sys.exit("Cancelled. Nothing was changed.")
    if target.exists():
        aside = target.with_suffix(f".before-restore-{time.strftime('%Y%m%d-%H%M%S')}.db")
        target.replace(aside)
        print(f"Existing database moved to {aside}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(backup.read_bytes())
    try:
        os.chmod(target, 0o600)
    except OSError:
        pass
    print(f"Restored. Start the server and check that you can sign in.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Back up or restore the SkillForge AI database.")
    ap.add_argument("--dir", default=str(Path(__file__).resolve().parent / "backups"),
                    help="where backups are kept (default: backend/backups)")
    ap.add_argument("--keep", type=int, default=0, help="keep only this many newest backups")
    ap.add_argument("--list", action="store_true", help="list existing backups and exit")
    ap.add_argument("--restore", metavar="FILE", help="restore from this backup file")
    args = ap.parse_args()

    target_dir = Path(args.dir)
    if args.restore:
        restore(Path(args.restore))
        return
    if args.list:
        list_backups(target_dir)
        return
    make_backup(target_dir)
    if args.keep > 0:
        prune(target_dir, args.keep)


if __name__ == "__main__":
    main()
