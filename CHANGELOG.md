# Changelog

All notable changes to SkillForge AI. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Launch preparation: proprietary licence, third-party notices, security
  policy, contributing guide, this changelog.
- CI that runs the test suite, the security audit and a JavaScript syntax
  check on every push and pull request.
- Dockerfile, compose file and a deployment guide covering Render, Railway,
  Fly.io and a plain VPS, plus the SQLite to Postgres migration path.
- PWA manifest, favicon set, offline-capable 404 page, `robots.txt`,
  `sitemap.xml` and Open Graph / Twitter cards with a preview image.
- Terms of Service and Privacy Policy drafts for legal review.

## [4.0.0] — 2026-11-16

### Added
- Accounts for students, faculty and admins, with sign-up, sign-in and a
  faculty portal for viewing their own students.
- Data Consent and Data Privacy tabs: granular toggles, download my data,
  delete my account, GDPR and India DPDP Act summaries in plain English.
- 231 Tamil Nadu institutions, with browsing by college, city and state.
- Three 3D doll games — Doll Dash, Bridge Builder, Memory Match — plus the
  Skill Arena and a compete mode.
- Display and accessibility settings: bright/dark, per-page colour, text size,
  high contrast, reduced motion, wide spacing, minimalist style, hover notes.
- Voice agent, 3D agent avatars, and `?reset=look` / `?diag=1` support URLs.

### Changed
- The eight agents run both in Python and, ported, in the browser, with a
  parity test asserting identical decisions.
- Entrance motion, counters and tilt now run on every page, not only the
  landing page.

### Security
- Authorisation hole closed: faculty could previously open any student profile
  and anyone could edit demo profiles.
- Published demo password removed in favour of a passwordless demo session
  that is disabled when `SKILLFORGE_PUBLIC=1`.

## [3.0.0] — 2026-11-14

### Added
- Immersive multi-page web version: nine industries, 14 roles, 30 employers
  with company matching, WebGL scroll stages, custom cursors.

## [1.0.0] — 2026-11-13

### Added
- First prototype: FastAPI plus a LangGraph state machine of five agents.
