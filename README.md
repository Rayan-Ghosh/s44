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

**Phase 2 — real database schema, database layer, initial API contracts.**

The backend (`apps/api`) now has: a real SQLAlchemy schema for all 12 spec
entities (users, devices, recipients, transactions, risk_scores,
risk_factors, voice_analysis, alerts, user_feedback, fraud_cases,
model_predictions, audit_logs), Alembic-managed migrations, and a first
API surface (`/api/v1/users`, `/api/v1/transactions`, `/api/v1/risk`,
`/api/v1/alerts`) backed by a repository/service layer. `Avaran.db` is the
local SQLite development database.

Explicitly **not** implemented yet: fraud ML, anomaly detection, voice ML,
risk fusion/decision engine, Support AI, real frontend, authentication.
`POST /api/v1/risk/evaluate` exists as a contract only — it returns `501`
rather than a fabricated score, since no model exists to produce one. See
`docs/DEVELOPMENT_PLAN.md` for what comes next.

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
.venv\Scripts\python.exe -m pip install -r apps/api/requirements.txt -r ml/requirements.txt
```

(macOS/Linux: `python3 -m venv .venv && .venv/bin/python -m pip install -r apps/api/requirements.txt -r ml/requirements.txt`)

Both files are required: the risk API (`apps/api/app/api/routers/risk.py`) imports
`ml.inference.predict` at module load time, so the backend will not start with
only `apps/api/requirements.txt` installed.

### Initialize / migrate the development database

```bash
.venv\Scripts\python.exe scripts/seed_database.py
```

Runs `alembic upgrade head` against `Avaran.db` (creating it if it doesn't
exist yet) and then inserts a small set of deterministic, synthetic demo
rows (Indian names/context per `docs/PRODUCT_DIRECTIVES.md` §A — no real
people, no real financial data). Safe to run repeatedly: it is idempotent
and will not create duplicate rows or re-run migrations that already
applied.

To work with Alembic directly (from `apps/api`):

```bash
cd apps/api
../../.venv/Scripts/python.exe -m alembic upgrade head     # apply migrations
../../.venv/Scripts/python.exe -m alembic revision --autogenerate -m "..."  # new migration after a model change
```

Schema is owned by Alembic (`apps/api/alembic/`) — the application never
creates tables itself at startup.

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

### Exercise the API

With the backend running (and the database seeded):

```bash
curl -X POST http://127.0.0.1:8000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","phone_number":"+91-90000-00000"}'

curl http://127.0.0.1:8000/api/v1/alerts
curl http://127.0.0.1:8000/api/v1/risk/2
```

All verified against a live run of the server during Phase 2 development.

### Run tests

```bash
cd apps/api
../../.venv/Scripts/python.exe -m pytest -v
```

Verified: 28 passed — health endpoints, Alembic migration against a fresh
database, ORM relationship integrity, and full CRUD/validation coverage
for the users/transactions/risk/alerts API surface. Tests run against an
isolated temporary SQLite database and never touch `Avaran.db`.

---

## Download and Install Android APK

Anyone can download, install, and run the standalone AVARAN Android application on an Android phone without Expo Go, Metro, VS Code, or a development server.

### Installation Steps

1. **Download `AVARAN.apk`** from the [`releases/`](releases/AVARAN.apk) directory in GitHub (or repository releases).
2. **Transfer / download** it to your Android phone (via direct browser download, USB, WhatsApp, or Google Drive).
3. **Open the APK** file on your device (from your browser downloads or file manager).
4. **Allow installation from unknown sources** if prompted by Android security settings:
   - Go to *Settings* &rarr; *Install Unknown Apps* (or tap *Settings* on the install prompt) and toggle *Allow from this source*.
5. **Install AVARAN** by tapping *Install*.
6. **Open the app** from your app drawer or home screen.

### API URL & Evaluator Configuration

- **Local Backend (Android Emulator)**:
  - Start the backend on the host machine:
    ```bash
    .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir apps/api
    ```
  - The standalone APK automatically resolves host localhost via `http://10.0.2.2:8000`.
- **Physical Device**:
  - Point `EXPO_PUBLIC_API_URL` to `http://<YOUR_LOCAL_IP>:8000` or a deployed public backend HTTPS URL.
- **Offline Mode**:
  - The app gracefully falls back to local secure protection if the backend is unreachable.
