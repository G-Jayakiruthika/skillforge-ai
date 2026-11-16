"""
mail.py - outbound email for password resets and address verification.

Configured entirely from the environment (see backend/.env.example):

    SKILLFORGE_SMTP_HOST      smtp.example.com
    SKILLFORGE_SMTP_PORT      587 (STARTTLS) or 465 (implicit TLS)
    SKILLFORGE_SMTP_USER      login for the SMTP account
    SKILLFORGE_SMTP_PASSWORD  its password
    SKILLFORGE_MAIL_FROM      "SkillForge AI <no-reply@yourdomain.com>"
    SKILLFORGE_BASE_URL       https://yourdomain.com  (used to build the links)

With no SMTP host configured the sender is in *console mode*: the message is
printed to the server log instead of being sent, so the flow can be developed
and tested locally without an email account. Console mode is refused when
SKILLFORGE_PUBLIC=1, because a reset link printed into a production log is a
link nobody receives and anyone with log access can use.

Nothing here ever logs a password. Links are printed only in console mode, and
only on a non-public install.
"""
from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional, Tuple

from .security import Env


def _log(line: str) -> None:
    """Server-side diagnostics. Never called with personal data - see send()."""
    print(line)


def _cfg() -> dict:
    return {
        "host": (os.getenv("SKILLFORGE_SMTP_HOST") or "").strip(),
        "port": int(os.getenv("SKILLFORGE_SMTP_PORT") or 587),
        "user": (os.getenv("SKILLFORGE_SMTP_USER") or "").strip(),
        "password": os.getenv("SKILLFORGE_SMTP_PASSWORD") or "",
        "sender": (os.getenv("SKILLFORGE_MAIL_FROM") or "").strip()
                  or formataddr(("SkillForge AI", "no-reply@localhost")),
        "timeout": float(os.getenv("SKILLFORGE_SMTP_TIMEOUT") or 15),
    }


def configured() -> bool:
    """True when real email can be sent."""
    return bool(_cfg()["host"])


def base_url() -> str:
    """Where the links point. Falls back to localhost for development."""
    return (os.getenv("SKILLFORGE_BASE_URL") or "http://localhost:8000").rstrip("/")


def warnings() -> list:
    """Configuration problems worth printing at startup."""
    out = []
    if Env.public and not configured():
        out.append("SKILLFORGE_SMTP_HOST is not set: password reset and email verification "
                   "cannot send mail, so users who forget a password cannot get back in.")
    if Env.public and not (os.getenv("SKILLFORGE_BASE_URL") or "").strip():
        out.append("SKILLFORGE_BASE_URL is not set: reset links would point at localhost.")
    return out


def send(to: str, subject: str, body: str, *, link: str = "") -> Tuple[bool, Optional[str]]:
    """Send one plain-text message. Returns (sent, error). Never raises.

    `link` is used only by console mode, so a developer can follow the flow
    without the recipient's address or name ever reaching the log.
    """
    cfg = _cfg()
    msg = EmailMessage()
    msg["From"] = cfg["sender"]
    msg["To"] = to
    msg["Subject"] = subject
    msg["Auto-Submitted"] = "auto-generated"
    msg.set_content(body)

    if not cfg["host"]:
        if Env.public:
            return False, "Email is not configured on this server."
        # Development only. The subject and the one-time link are enough to follow
        # the flow; the recipient address, the name and the body stay out of the
        # log, because a log is not a place for anyone's personal data.
        _log("--- email not sent (console mode, no SMTP host configured) ---")
        _log(f"  subject: {subject}")
        if link:
            _log(f"  link:    {link}")
        return True, None

    try:
        context = ssl.create_default_context()
        if cfg["port"] == 465:
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=cfg["timeout"],
                                  context=context) as server:
                if cfg["user"]:
                    server.login(cfg["user"], cfg["password"])
                server.send_message(msg)
        else:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=cfg["timeout"]) as server:
                server.starttls(context=context)
                if cfg["user"]:
                    server.login(cfg["user"], cfg["password"])
                server.send_message(msg)
        return True, None
    except Exception as exc:                      # noqa: BLE001 - never break the request
        # The class name is safe to log; the message could contain the recipient.
        _log(f"  [mail] send failed: {type(exc).__name__}")
        return False, "The email could not be sent. Please try again later."


# --------------------------------------------------------------- templates
def reset_email(name: str, link: str, minutes: int) -> Tuple[str, str]:
    return ("Reset your SkillForge AI password",
            f"""Hi {name},

Someone asked to reset the password for your SkillForge AI account.

Open this link to choose a new one:

  {link}

The link works once and expires in {minutes} minutes.

If this was not you, you can ignore this email — your password has not
changed, and nobody can use the link without opening it.

— SkillForge AI
""")


def verify_email(name: str, link: str, hours: int) -> Tuple[str, str]:
    return ("Confirm your email address for SkillForge AI",
            f"""Hi {name},

Please confirm this is your email address so you can recover your account if
you ever forget your password.

  {link}

The link works once and expires in {hours} hours.

If you did not create a SkillForge AI account, ignore this email and the
account will stay unconfirmed.

— SkillForge AI
""")
