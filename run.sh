#!/usr/bin/env bash
# SkillForge AI - setup and run for macOS / Linux
set -e
cd "$(dirname "$0")/backend"
PY=$(command -v python3 || command -v python)
[ -d .venv ] || "$PY" -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
if pip install -r requirements.txt; then
  echo "Starting SkillForge AI on http://localhost:8000"
  python -m uvicorn main:app --port 8000
else
  echo "Package install failed - starting the zero-install server instead."
  python devserver.py
fi
