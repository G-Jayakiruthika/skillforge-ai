# Third-party notices

SkillForge AI bundles or depends on the software below. Each remains under its
own licence; the project's own LICENSE does not alter those terms.

## Bundled in the repository

| Component | Version | Licence | Where |
|---|---|---|---|
| three.js | r170 | MIT | `frontend/vendor/three.module.min.js` |

three.js — Copyright © 2010-2026 three.js authors, MIT Licence.
Full text: https://github.com/mrdoob/three.js/blob/dev/LICENSE

## Python dependencies (installed, not bundled)

| Package | Licence |
|---|---|
| fastapi | MIT |
| uvicorn | BSD-3-Clause |
| pydantic | MIT |
| langgraph (optional) | MIT |
| google-genai (optional) | Apache-2.0 |
| pytest (development only) | MIT |

The full version in use for each package is pinned in
`backend/requirements.txt`. Run `pip-licenses` after an install to regenerate
this table if a dependency changes.

## Fonts

Space Grotesk and JetBrains Mono are loaded from Google Fonts under the
SIL Open Font License 1.1. They are not redistributed in this repository.

## Data

Institution names and locations are drawn from public listings of colleges and
universities in Tamil Nadu. Employer skill expectations are indicative examples
written for this project; they are not supplied or endorsed by the named
companies and must not be presented as official hiring criteria.
