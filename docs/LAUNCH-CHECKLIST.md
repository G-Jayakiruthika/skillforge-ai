# Launch checklist

Everything the code can do is done. This is what is left, split by who has to do
it. Work down the blockers in order; nothing below them matters until they are
cleared.

---

## A. Blockers — do not open public sign-up until these are done

| # | What | Who | Why it blocks |
|---|---|---|---|
| ~~A1~~ | ~~Decide the under-18 question~~ — **done**: self sign-up now requires an 18+ declaration and terms acceptance, enforced on the server and in the browser engine. Under-18s are directed to enrol through their college | — | — |
| A2 | Lawyer reviews `legal/TERMS-OF-SERVICE.md` and `legal/PRIVACY-POLICY.md`, and you fill in every `<<FILL: ...>>` | You + lawyer | The published pages say "draft, not in force" until this is done |
| A3 | Put the database on a persistent disk — `render.yaml`, `fly.toml` and the Dockerfile volume already do this; you only have to deploy with one of them | You | On most hosts every account is wiped on the next deploy. The server now prints a startup warning if it detects this |
| A4 | Set `SKILLFORGE_SECRET` and `SKILLFORGE_ADMIN_EMAIL` | You | Both are now checked at startup and warned about. Render generates the secret for you |
| A5 | Add a real support email to `LICENSE`, `SECURITY.md` and both legal documents | You | They currently say `<add your contact email before launch>` |
| ~~A6~~ | ~~Password reset and email verification~~ — **done**: single-use hashed tokens, no user enumeration, reset signs out every session, verification offered on the Account page | — | — |
| A6b | Point `SKILLFORGE_SMTP_*` and `SKILLFORGE_BASE_URL` at a real mail provider | You | The reset flow is built and tested, but with no SMTP host it cannot post a letter. Startup warns when this is missing on a public server |

---

## B. Strongly recommended before real users

| # | What | Who |
|---|---|---|
| B1 | Schedule `backend/backup.py` daily and copy the files off the machine, then test a restore — `docs/DEPLOYMENT.md` §7 | You |
| B2 | Uptime monitoring on `/api/health` (UptimeRobot and Better Stack both have free tiers) | You |
| B3 | Error tracking (Sentry has a free tier). Keep PII out of the events — the app logs none today, keep it that way | You + small code change |
| B4 | Ship server logs off the host, with a retention period that matches the Privacy Policy | You |
| B5 | Custom domain and HTTPS — `docs/DEPLOYMENT.md` §6, then update `sitemap.xml`, `robots.txt` and the canonical URLs | You |
| B6 | Run Lighthouse on the landing page and the dashboard; fix anything below 90 on accessibility | You |
| B7 | Decide what the company skill data is allowed to say, and have someone check the wording cannot be read as official hiring criteria | You |

---

## C. Product gaps worth closing early

| # | What | Note |
|---|---|---|
| C1 | Compete mode plays against the computer, not a live opponent | Real multiplayer needs a WebSocket server |
| C2 | No email notifications of any kind | Faculty replies sit unseen until the student signs in |
| C3 | No admin screen for content | Skills, roles and employers are edited in Python and need a redeploy |
| C4 | Institution list covers Tamil Nadu only | Other states are a data addition, not a code change |
| C5 | No analytics implementation behind the consent toggle | The toggle gates a `track()` call that currently does nothing. Honest, but you learn nothing |
| C6 | English only | Tamil would matter for the audience |

---

## D. Already done — do not redo

- Eight agents in Python **and** in the browser, with a parity test asserting
  they reach identical decisions.
- Accounts for students, faculty and admins; faculty see only their own
  students; demo profiles are read-only when public.
- Consent before any analytics or any outside AI call, enforced in code rather
  than described in a policy. Data export and permanent account deletion both
  work.
- 25-check security audit and 36 tests, run by CI on Python 3.11 and 3.12 on
  every push and pull request.
- Passwords hashed with PBKDF2-HMAC-SHA256 (600k iterations), HttpOnly
  SameSite sessions, origin checks on writes, strict CSP, nine security
  headers, CORS allow-list, rate limits, login lockout, parameterised SQL.
- Accessibility: bright/dark, text scaling, high contrast, reduced motion, wide
  spacing, minimalist style, hover notes, keyboard focus, skip links.
- Favicon set, PWA manifest, Open Graph and Twitter cards with a preview image,
  canonical URLs, `robots.txt`, `sitemap.xml`, a real 404 page.
- Licence, third-party notices, security policy, contributing guide, changelog,
  issue and PR templates, Dependabot.
- Age assurance at sign-up (18+ declaration and terms acceptance, recorded as a
  timestamp and terms version rather than a date of birth), enforced in both
  engines.
- Password reset and email verification: single-use tokens stored only as an
  HMAC fingerprint, one hour and 24 hour expiries, no user enumeration, reset
  ends every session, console mode that never logs an address or a name.
- Backup and restore script with an integrity check, and deploy blueprints for
  Render and Fly.io with the persistent volume already wired.
- Dockerfile, compose file and a deployment guide for Render, Railway, Fly.io
  and a plain VPS.

---

## E. The five-minute pre-launch smoke test

Run against the live host, not localhost.

1. `curl -s https://yourdomain.com/api/health` → `ok`
2. `curl -sI https://yourdomain.com/docs` → **404** (API docs must be off)
3. `curl -sI https://yourdomain.com/nonsense` → **404** and the 404 page
4. Sign up → sign in → sign out → sign in again
5. Edit your profile, run an assessment, confirm the roadmap changes
6. Data Consent: reject non-essential, confirm the mentor still answers
7. Data Privacy: download your data, open the JSON, confirm no password field
8. Delete the account, then confirm you cannot sign in with it
9. Open the site on a phone — the top bar is one row and the hero is visible
10. Share the URL in a chat app — the preview image and title appear
