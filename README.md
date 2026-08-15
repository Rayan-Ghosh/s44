# S40 — Explainable Fraud-Risk Engine

**SOAIDEATHON 2026 — Problem Statement S40**

## What is S40?

S40 is a privacy-preserving, real-time fraud-risk engine that detects
suspicious payment behaviour, device changes, coercive interaction
patterns, and voice-phishing indicators before a transaction completes. It
explains its reasoning to the user, supports user confirmation, and enables
institutional review of false positives.

S40 is designed as an **explainable, multimodal, real-time fraud decision
system** — not a single fraud-classification model. It combines
independently trained transaction, behavioural, device, and voice/
social-engineering detectors through a configurable risk-fusion layer.

## Project status

**Minimal development scaffold.**

A minimal, verified backend scaffold exists (`apps/api`) — a health-checked
FastAPI application backed by a local SQLite development database
(`Avaran.db`). This is infrastructure only: no fraud ML, anomaly detection,
voice ML, Support AI, real frontend, or authentication has been
implemented. See `docs/DEVELOPMENT_PLAN.md` for what comes next.

## Specification and documentation

- [`S40_End_to_End_Project_Plan_FINAL.md`](S40_End_to_End_Project_Plan_FINAL.md)
  — the authoritative technical specification. Not to be modified.
- [`CLAUDE.md`](CLAUDE.md) — operating manual for Claude Code sessions
  working in this repository (source-of-truth rules, non-negotiable
  behaviors, development workflow).
- [`docs/PRODUCT_DIRECTIVES.md`](docs/PRODUCT_DIRECTIVES.md) — approved
  product/UX directives issued by the project owner, extending (not
  replacing) the specification.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system architecture
  reference (frontend, backend, ML, database, real-time, security
  boundaries).
- [`docs/ML_ARCHITECTURE.md`](docs/ML_ARCHITECTURE.md) — ML architecture:
  transaction fraud model, anomaly model, device risk, voice/
  social-engineering classifier, fusion, evaluation methodology.
- [`docs/SECURITY.md`](docs/SECURITY.md) — security and privacy
  requirements.
- [`docs/UX_PRINCIPLES.md`](docs/UX_PRINCIPLES.md) — product UX principles
  and explicit anti-patterns.
- [`docs/TESTING_STRATEGY.md`](docs/TESTING_STRATEGY.md) — testing
  strategy across unit, integration, ML, frontend, and acceptance-level
  demo scenarios.
- [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md) — phased
  implementation roadmap.

## High-level future architecture

A modular monolith, not microservices:

- **Frontend**: Next.js, TypeScript, Tailwind CSS, shadcn/ui, Framer
  Motion, Recharts.
- **Backend**: Python, FastAPI, Pydantic, SQLAlchemy, Alembic.
- **ML**: independently trained transaction fraud model (XGBoost/
  LightGBM), behaviour anomaly model (Isolation Forest), device-risk
  rules, and a voice/social-engineering classifier — combined through a
  calibrated risk-fusion layer, never a single end-to-end model.
- **Database**: PostgreSQL, with Redis as an optional cache/real-time
  store (decision pending).
- **Real-time**: WebSockets for live transaction/risk/alert feeds.

See `docs/ARCHITECTURE.md` for the full breakdown, including which
decisions are confirmed, proposed, or still open.

## Development philosophy

- The original specification is the source of truth; approved product
  directives are additions layered on top of it, never silent
  replacements.
- Real implementations are preferred over mocks; mocks are used only at
  explicit demo/testing boundaries and labeled as such.
- No fabricated metrics, security claims, or test results — ever.
- Fraud decisions stay deterministic, auditable, and separate from any
  conversational AI (see the Support AI / Fraud Intelligence separation
  in `docs/PRODUCT_DIRECTIVES.md`).
- Demo reliability and explainability are prioritized over unnecessary
  technical sophistication.

Full detail: `CLAUDE.md`.

## Important notes

- This is an **SIH hackathon prototype**. It uses synthetic/anonymized
  data only — no real financial credentials, no real-money movement, no
  live banking/UPI integration.
- Model performance numbers, latency figures, and security claims shown
  anywhere in this project's documentation prior to implementation (e.g.
  in the specification's illustrative examples) are **not** measured
  results. Real numbers will be reported only once actually measured.

## Development commands

Only the commands below have been run and verified to work. This section
grows as each part of the stack is actually scaffolded, per
`docs/DEVELOPMENT_PLAN.md`. Nothing here is aspirational.

The backend scaffold lives in `apps/api` (FastAPI). `Avaran.db` is a local
SQLite development database, git-ignored and reproducible from
`scripts/seed_database.py` — see `docs/SECURITY.md` and `.gitignore` for
why it isn't committed.

### Getting started (once, per machine)

```bash
py -m venv .venv
.venv\Scripts\python.exe -m pip install -r apps/api/requirements.txt
```

(macOS/Linux: `python3 -m venv .venv && .venv/bin/python -m pip install -r apps/api/requirements.txt`)

### Initialize the development database

```bash
.venv\Scripts\python.exe scripts/seed_database.py
```

Creates `Avaran.db` at the repository root with the current bootstrap
schema (see `apps/api/app/models/dev_check.py` — a placeholder table used
only to prove the database connection works, not part of the final S40
schema).

### Start the backend

Either of these is equivalent — `server.js` is a thin development
orchestration wrapper around the same `uvicorn` command, not a second
backend (see the header comment in `server.js`):

```bash
node server.js
# or: node server.js --seed   (seeds the database first)
# or directly:
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --app-dir apps/api
```

### Health check

With the backend running:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/health/db
```

Both were verified to return `200 OK` during scaffold setup.

### Run tests

```bash
cd apps/api
../../.venv/Scripts/python.exe -m pytest -v
```

Verified: 3 passed (backend startup, `/health` response, database
write/read round trip) — see `apps/api/tests/test_health.py`.
