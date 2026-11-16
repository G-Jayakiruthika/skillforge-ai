## What this changes

## Why

## Checks
- [ ] `python -m pytest -q` passes (from `backend/`)
- [ ] `python security_audit.py` reports 0 failures
- [ ] `node --check` passes for every changed file in `frontend/js/`
- [ ] Agent logic changed in **both** `backend/skillforge/` and
      `frontend/js/engine.js`, and the parity test still passes
- [ ] `knowledge.js` regenerated if the knowledge base changed
- [ ] No secret, key or personal data added to the repository
