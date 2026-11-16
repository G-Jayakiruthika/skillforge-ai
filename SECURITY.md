# Security policy

## Reporting a vulnerability

Please report security problems privately. Do not open a public issue, and do
not post details on social media before a fix is out.

- Email: `<add your security contact email before launch>`
- Or use GitHub's private reporting: **Security → Report a vulnerability** on
  this repository.

Include what you found, the steps to reproduce it, and what an attacker could
do with it. A proof-of-concept helps.

**Response targets**

| Stage | Target |
|---|---|
| Acknowledge your report | 3 working days |
| First assessment | 7 working days |
| Fix for a critical issue | 30 days |

Please give us 90 days before publishing, and we will credit you in the
release notes unless you ask us not to.

## Scope

In scope: this repository, the hosted web version, and the API.

Out of scope: denial-of-service by volume, findings that need physical access
to a user's unlocked device, missing security headers with no demonstrated
impact, and reports produced solely by an automated scanner with no working
exploit.

## What the project already does

Run `python backend/security_audit.py` to see the current state; all 25 checks
must pass before a release.

- Passwords: PBKDF2-HMAC-SHA256, 600,000 iterations server-side, unique salt.
- Sessions: HttpOnly, SameSite=Lax cookies; expiry configurable; server-side
  rotation on sign-in; login lockout after repeated failures.
- Requests: origin checked on every write, strict Content-Security-Policy,
  nine security headers, CORS allow-list (never `*`), per-route rate limits.
- Data: parameterised SQL only, column allow-list on updates, database file
  created 0600, no secrets in the repository, debug off by default.
- Privacy: no analytics or outside AI call until consent is saved; export and
  full account deletion are implemented, not just described.

## Known limitations before a public launch

These are tracked in `docs/LAUNCH-CHECKLIST.md` and must be resolved before
real users sign up:

1. SQLite on local disk — fine for one server, lost on most PaaS redeploys.
2. No email verification or password reset flow.
3. No server-side audit log shipped off the host.
4. No automated backups.
