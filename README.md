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

**Foundation / Pre-Implementation.**

No application code has been written yet. The project currently consists
of the authoritative specification and a set of operating/architecture
documents that govern how implementation will proceed.

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

None yet — no application code exists in this repository. This section
will be filled in as each part of the stack (`apps/web`, `apps/api`,
`ml/`) is actually scaffolded, per `docs/DEVELOPMENT_PLAN.md`.
