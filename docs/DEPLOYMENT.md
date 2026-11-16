# Deploying SkillForge AI

There are two things that can be deployed, and they are independent.

| | What it is | Needs a server? | Accounts? |
|---|---|---|---|
| **Web version** | `frontend/` only. All eight agents run in the browser. | No — any static host | No |
| **Full version** | `backend/` + `frontend/`. Same agents in Python, plus accounts, the database and optional Gemini. | Yes | Yes |

The web version is already live on GitHub Pages from `.github/workflows/pages.yml`
on every push to `main`. The rest of this document is about the full version.

---

## 0. Before any deploy

```bash
cd backend
python -m pytest -q          # 36 tests
python security_audit.py     # 25 checks, must be 0 failures
```

Then set these, whatever host you use:

| Variable | Value | Why it matters |
|---|---|---|
| `SKILLFORGE_PUBLIC` | `1` | Turns off the interactive API docs and the passwordless demo session |
| `SKILLFORGE_SECRET` | a long random string | Signs session cookies. **If this changes, every user is signed out.** Generate once: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `SKILLFORGE_CORS_ORIGINS` | `https://yourdomain.com` | Never `*` |
| `SKILLFORGE_ADMIN_EMAIL` | your email | Otherwise the first account to sign up becomes admin |
| `SKILLFORGE_DB` | a path on a persistent disk | See the database warning below |
| `SKILLFORGE_BASE_URL` | `https://yourdomain.com` | Where password-reset links point |
| `SKILLFORGE_SMTP_*` | your mail provider's settings | Without them, password reset cannot send mail |

The server prints a warning at startup for each of these that is wrong or
missing, including one if the database is sitting somewhere a redeploy will
erase. Read the first few lines of the log after your first deploy.

`backend/.env.example` documents every variable.

---

## 1. The database warning — read this first

The app stores accounts, profiles, progress and messages in **SQLite, in a
single file**. That is reliable for one server, and it is the right choice for a
pilot. Two things will bite you otherwise:

1. **Most PaaS hosts wipe the disk on every deploy.** Without a mounted volume,
   every account vanishes the next time you push. Render and Fly.io both offer
   persistent volumes; Railway offers volumes too. Mount one and point
   `SKILLFORGE_DB` at it.
2. **SQLite does not share across processes well.** Run **one** worker
   (`--workers 1`, as the Dockerfile does). More than one worker needs Postgres.

### When to move to Postgres

Move when any of these becomes true: more than roughly 200 active users, more
than one server or worker, or you need point-in-time backups.

The store is deliberately small and in one place — `backend/skillforge/store.py`
— so the migration is contained:

1. Add `psycopg[binary]` to `requirements.txt`.
2. In `store.py`, replace the `sqlite3.connect` calls with a connection factory
   that reads `DATABASE_URL`, and change the placeholder style from `?` to `%s`.
   Every query is already parameterised, so no SQL needs rewriting.
3. Translate the schema: `INTEGER PRIMARY KEY` → `BIGSERIAL PRIMARY KEY`,
   `TEXT` stays `TEXT`, the JSON columns can stay `TEXT` or become `JSONB`.
4. Export existing rows with `sqlite3 skillforge.db .dump`, fix the handful of
   SQLite-specific statements, and load into Postgres.
5. Run the test suite against the new store before switching traffic.

Supabase, Neon and Render Postgres all work and all have a free tier.

---

## 2. Docker — any host, or your own server

```bash
docker build -t skillforge-ai .
docker run -d --name skillforge -p 8000:8000 \
  --env-file backend/.env \
  -e SKILLFORGE_PUBLIC=1 \
  -v skillforge-data:/data \
  skillforge-ai
```

Or `docker compose up -d --build`.

The image runs as a non-root user, has a healthcheck on `/api/health`, and keeps
the database on the `/data` volume so a rebuild does not lose it.

### Behind Nginx with HTTPS

```nginx
server {
    server_name yourdomain.com;
    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

Then `sudo certbot --nginx -d yourdomain.com` for a free certificate.
The app already sends HSTS and the other security headers once it sees HTTPS.

---

## 3. Render

`render.yaml` is in the repository, so the service, the 1 GB disk at `/data`
and the health check are already described:

1. New → **Blueprint** → connect this repository.
2. Render reads `render.yaml` and creates everything.
3. Fill in the values marked `sync: false` in the dashboard: your origin, base
   URL, admin email and SMTP settings.

`SKILLFORGE_SECRET` is generated once by Render and kept across deploys, so
nobody gets signed out by a push.

Render's free tier sleeps after inactivity; the first request then takes ~30
seconds. Fine for a demo, not for a launch.

---

## 4. Railway

1. New Project → Deploy from GitHub repo.
2. It detects the `Dockerfile`.
3. Add a **Volume** mounted at `/data`, and set `SKILLFORGE_DB=/data/skillforge.db`.
4. Add the variables from section 0. Railway sets `PORT` itself; the image
   already honours it.

---

## 5. Fly.io

```bash
fly launch --no-deploy          # generates fly.toml from the Dockerfile
fly volumes create skillforge_data --size 1
fly secrets set SKILLFORGE_SECRET=... SKILLFORGE_PUBLIC=1 \
                SKILLFORGE_CORS_ORIGINS=https://yourdomain.com \
                SKILLFORGE_ADMIN_EMAIL=you@example.com
fly deploy
```

In `fly.toml`, mount the volume and keep one machine:

```toml
[mounts]
  source      = "skillforge_data"
  destination = "/data"

[env]
  SKILLFORGE_DB = "/data/skillforge.db"
```

---

## 6. Custom domain

1. Point an `A`/`CNAME` record at your host.
2. Add the domain in the host's dashboard and let it issue the certificate.
3. Set `SKILLFORGE_CORS_ORIGINS` to the exact origin, including `https://`.
4. For the GitHub Pages web version: add a `CNAME` file to `frontend/` holding
   the domain, and set it under Settings → Pages → Custom domain.
5. Update the absolute URLs in `frontend/sitemap.xml`, `frontend/robots.txt` and
   the `og:url` / `canonical` tags, which currently point at the Pages address.

---

## 7. Backups

`backend/backup.py` takes a consistent snapshot while the server is running,
verifies it opens, and reports how many accounts it holds:

```bash
cd backend
python backup.py --dir /backups --keep 30     # daily cron
python backup.py --list
python backup.py --restore /backups/skillforge-20261116-031700.db
```

Daily cron entry:

```
17 3 * * * cd /app/backend && python backup.py --dir /backups --keep 30
```

A backup on the same disk as the database is not a backup — copy the files off
the machine with rclone, scp or your host's object storage. Restore moves the
existing database aside first, so a bad restore is recoverable.

Test a restore before you need one.

---

## 8. After deploying, check

```bash
curl -s https://yourdomain.com/api/health
curl -sI https://yourdomain.com | grep -i "content-security-policy\|strict-transport"
curl -sI https://yourdomain.com/docs          # must be 404 when SKILLFORGE_PUBLIC=1
curl -sI https://yourdomain.com/nonsense-url  # must be 404, not 200
```

Then sign up, sign in, export your data and delete the account, to confirm the
whole privacy path works on the real host.

---

## 9. Email

Password reset and email verification need SMTP. Any provider works — Brevo,
Resend, Mailgun, Amazon SES, Zoho Mail, or Gmail with an app password — and the
free tiers are generous at this scale.

Set `SKILLFORGE_SMTP_HOST`, `SKILLFORGE_SMTP_PORT`, `SKILLFORGE_SMTP_USER`,
`SKILLFORGE_SMTP_PASSWORD`, `SKILLFORGE_MAIL_FROM` and `SKILLFORGE_BASE_URL`.

Without a host configured the app runs in console mode: links are printed to
the server log rather than sent, which is useful locally and refused when
`SKILLFORGE_PUBLIC=1`. Console mode prints the subject and the link only — never
the recipient's address or name, because a log is not a place for personal data.

After configuring it, test on the real host: sign up, sign out, use **Forgot
your password?**, and check the email arrives and the link works.

## 10. What is still missing for a large launch

Tracked in `docs/LAUNCH-CHECKLIST.md`: off-host log shipping, an uptime
monitor, error tracking, and the Postgres migration above.
