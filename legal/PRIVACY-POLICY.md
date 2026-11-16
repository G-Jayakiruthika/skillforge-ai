# Privacy Policy — SkillForge AI

> **DRAFT — not legal advice.** Have a qualified lawyer review this before
> launch, ideally one familiar with India's DPDP Act 2023. Replace every
> `<<FILL: ...>>` marker.

**Data Fiduciary / Controller:** <<FILL: legal name>>
**Contact for privacy questions:** <<FILL: privacy email>>
**Grievance Officer (required under the DPDP Act):** <<FILL: name and email>>
**Last updated:** <<FILL: date>>

This policy explains what personal data SkillForge AI collects, why, and what
you can do about it. The app shows a short version of this on the Data Privacy
tab; this is the full version.

## 1. What we collect, and why

| Data | Why we hold it | Legal basis (GDPR) |
|---|---|---|
| Name, email, password hash | To create your account and sign you in | Contract (Art. 6(1)(b)) |
| Role (student / faculty / admin), institution, city | To show you the right pages and the right student lists | Contract |
| Skills, certificates, projects, career goal, dream company | The whole purpose of the product: to find your gaps and build a roadmap | Contract |
| Assessment answers, scores, learning hours, game results | To track progress and re-plan when you struggle | Contract |
| Messages to faculty and to the AI mentor | To deliver the conversation | Contract |
| Display and consent settings | To remember your choices | Contract, and Consent for the optional ones (Art. 6(1)(a)) |
| Analytics events | To understand which features are used | **Consent only** — off until you turn it on |
| Text sent to a third-party AI model | To write mentor replies and grade explanations | **Consent only** — off until you turn it on |

We do not collect your date of birth, government identifiers, payment details,
caste, religion, health data or location beyond the city you type in.

**Your password is never stored.** We keep only a PBKDF2-HMAC-SHA256 hash with
a unique salt, which cannot be reversed, and it is never included in a data
export.

## 2. Consent, and what happens without it

Nothing optional runs until you say so. On your first visit a banner offers
Accept all, Reject non-essential, or Choose. Until you save a choice, no
analytics script runs and no text leaves the server for any outside AI.

| Category | Default | What turning it off means |
|---|---|---|
| Essential | Always on | Sign-in and display settings. Cannot be turned off; the app cannot work without it |
| Analytics | **Off** | We learn nothing about which features you use |
| Marketing | **Off** | We will not contact you about new features |
| AI processing | **Off** | Mentor wording and grading come from the built-in rules on the server instead. Every agent still works |

You can change any of these at any time on the Data Consent tab. Turning one
off also deletes what it had collected.

## 3. Who we share it with

We do not sell your personal data. We do not share it with employers,
recruiters or advertisers.

| Who | What they get | When |
|---|---|---|
| <<FILL: your hosting provider>> | Whatever is stored, as our infrastructure provider | Always, as processor |
| Google (Gemini API) | The text of a mentor question or an explanation you write | Only while AI processing consent is on |
| Your faculty member | Your profile and progress, if you are their student at their institution | Only within your own institution |

Google processes that text under its own terms as our processor. If you would
rather no text ever left our server, leave AI processing off; everything still
works.

Faculty can see their own students only. Students cannot see each other's
profiles. You can hide yourself from college lists entirely with a checkbox on
your Profile, without deleting your account.

## 4. Where your data lives

<<FILL: name the country your server and database are in. If that is outside
India or the EEA, say which safeguards apply — for example standard contractual
clauses.>>

## 5. How long we keep it

| Data | Kept for |
|---|---|
| Account and profile | Until you delete your account |
| Assessment and progress history | Until you delete your account |
| Messages | Until you delete your account |
| Analytics events | <<FILL: e.g. 14 months>>, then deleted |
| Server logs | <<FILL: e.g. 30 days>>, then deleted |

Deleting your account removes all of it permanently. Backups are overwritten
within <<FILL: e.g. 30 days>>.

## 6. Your rights

Under the GDPR and the DPDP Act you can:

- **See** what we hold — Data Privacy tab → Download my data, which gives you a
  complete JSON file;
- **Correct** anything wrong — edit your Profile;
- **Delete** everything — Data Privacy tab → Delete my account & data. You type
  DELETE to confirm, and it is permanent;
- **Withdraw consent** at any time — Data Consent tab;
- **Take your data elsewhere** — the export is machine-readable JSON;
- **Object** or ask us to restrict processing — write to us;
- **Complain** to a supervisory authority: the Data Protection Board of India,
  or your EU/UK supervisory authority if you are there.

We answer requests within 30 days.

## 7. Security

Passwords are hashed with PBKDF2-HMAC-SHA256 (600,000 iterations server-side).
Sessions use HttpOnly, SameSite cookies. Every write checks the request's
origin. The app sends a strict Content-Security-Policy and eight other security
headers, uses an allow-list for CORS, rate-limits requests, locks accounts after
repeated failed sign-ins, and uses parameterised SQL everywhere. The database
file is created readable only by the server account.

No system is perfectly secure. If there is a breach affecting your rights we
will notify you and the relevant authority as the law requires.

## 8. Children

See `legal/README.md`. <<FILL: state your decision — either "You must be 18 or
over to create an account", or describe the institution-mediated or parental
consent route you implemented.>> We do not knowingly process the personal data
of a child without verifiable parental consent, and we never run behavioural
tracking or targeted advertising at children.

## 9. Cookies and local storage

| Name | Type | Purpose |
|---|---|---|
| session cookie | Essential, HttpOnly | Keeps you signed in |
| `sf-settings` | Essential, local storage | Your display and accessibility choices |
| `sf-learner` | Essential, local storage | Which profile you had open |

We set no advertising cookies and no third-party tracking cookies.

## 10. Automated decisions

SkillForge AI scores your skills against a role and suggests a learning order.
This is guidance for you to act on, not a decision that has legal or similarly
significant effects on you. No one is accepted, rejected or ranked for a job by
this system.

## 11. Changes

If we change this policy materially we will tell you in the app before the
change takes effect, and the "Last updated" date will change.

## 12. Contact

Privacy questions: <<FILL: privacy email>>
Grievance Officer: <<FILL: name and email>>
<<FILL: postal address>>
