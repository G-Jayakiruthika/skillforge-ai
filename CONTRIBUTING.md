# Contributing

This is a proprietary project (see `LICENSE`). Issues and discussion are
welcome; code contributions are accepted only by prior arrangement with the
copyright holder.

## Getting set up

```bash
git clone https://github.com/G-Jayakiruthika/skillforge-ai.git
cd skillforge-ai
./run.sh          # macOS/Linux      run.bat on Windows
```

The web version needs nothing at all: open `frontend/index.html` through any
static server, or use the hosted build.

## Before you push

Every one of these must pass. CI runs the same three.

```bash
cd backend
python -m pytest -q          # 36 tests
python security_audit.py     # 25 checks, 0 failures
cd ../frontend && for f in js/*.js; do node --check "$f"; done
```

## How the code is organised

- `backend/skillforge/` — agents, knowledge base, store, auth, security, routes.
  One route table in `routes.py` is shared by the FastAPI server and the
  zero-install `devserver.py`, so they can never drift apart.
- `frontend/js/engine.js` — a JavaScript port of the same eight agents, so the
  site runs with no backend on GitHub Pages. `tests/test_parity.py` asserts
  both engines reach identical decisions; if you change agent logic, change it
  in both and the parity test will tell you if you missed something.
- `frontend/js/knowledge.js` is generated. Edit `backend/skillforge/*.py`, then
  run `python backend/export_knowledge.py`.

## Style

- Python: standard library first, type hints on public functions, no bare
  `except`. Comments explain *why*, never restate the code.
- JavaScript: ES modules, no build step, no framework, no `var`.
- Every user-facing string should read as plain English a first-year student
  understands.

## Commits

Write what changed and why in the body. One logical change per commit.
