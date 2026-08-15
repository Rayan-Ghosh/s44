# Architecture — S40

This document translates `S40_End_to_End_Project_Plan_FINAL.md` (the spec)
and `PRODUCT_DIRECTIVES.md` (approved extensions) into a working
architecture reference. Every item is labeled:

- **CONFIRMED** — explicitly stated in the spec or a product directive.
- **PROPOSED** — a reasonable engineering decision inferred to fill a gap;
  not yet approved, open to change.
- **UNDECIDED** — a genuine open question that needs a human decision
  before implementation.

No unresolved implementation details have been invented as fact anywhere in
this document.

------------------------------------------------------------------------

## 1. Overall shape

**CONFIRMED** (spec §4, §27, §31): a **modular monolith** with clearly
separated modules, not microservices. Repository layout follows spec §27:

```
s40-fraud-shield/
├── apps/web/         Next.js frontend
├── apps/api/         FastAPI backend
├── ml/                training + inference
├── voice/             transcription/preprocessing/classifier
├── scripts/           data generation, seeding, demo runner
├── docs/
├── infra/
├── docker-compose.yml
├── README.md
└── .env.example
```

**PROPOSED**: the Support AI (product directive §E/F/H) is not in the
spec's repository structure. Proposed placement: `apps/api/app/services/support/`
for backend logic, plus a dedicated frontend surface under
`apps/web/app/help/` (or similar), kept import-isolated from the fraud
risk modules per directive §H. **UNDECIDED**: exact directory name and
whether Support AI gets its own top-level `support/` module alongside
`ml/` and `voice/` — worth deciding once implementation starts, since it's
architecturally a peer of the voice pipeline, not a frontend-only feature.

## 2. Frontend

**CONFIRMED** (spec §3, §22): Next.js, TypeScript, Tailwind CSS, shadcn/ui,
Framer Motion, Recharts, Lucide icons.

**CONFIRMED** (spec §22): two applications sharing one codebase —
- User app: `/`, `/dashboard`, `/transactions`, `/transaction/[id]`,
  `/security`, `/alerts`.
- Institution app: `/institution`, `/institution/transactions`,
  `/institution/alerts`, `/institution/fraud-cases`,
  `/institution/analytics`, `/institution/models`.

**CONFIRMED** (product directives §B, §C): light-mode-first with a dark-mode
toggle; accessibility-first (large text, high contrast, touch-friendly,
reduced-motion support, multilingual-ready copy structure).

**CONFIRMED** (product directive §E/F): an additional Help Center surface
with an AI support assistant and (later) an animated character.

**PROPOSED**: a `/help` route under the user app rather than a fully
separate application, since the Support AI is user-facing help, not an
institution feature. **UNDECIDED**: whether institution analysts get their
own separate help surface, or share the user one.

## 3. Backend

**CONFIRMED** (spec §3): Python, FastAPI, Pydantic, SQLAlchemy, Alembic.

**CONFIRMED** (spec §3, §19) responsibilities: transaction API, risk
orchestration, feature computation, ML inference, voice-analysis
orchestration, user confirmation, alert generation, feedback collection,
institution APIs, audit logging.

**CONFIRMED** (spec §19) API surface:
```
POST /api/v1/transactions
GET  /api/v1/transactions/{id}
POST /api/v1/risk/evaluate
GET  /api/v1/risk/{transaction_id}
POST /api/v1/voice/analyze
POST /api/v1/transactions/{id}/confirm
POST /api/v1/transactions/{id}/cancel
POST /api/v1/transactions/{id}/report
GET  /api/v1/institution/overview
GET  /api/v1/institution/alerts
GET  /api/v1/institution/fraud-cases
POST /api/v1/institution/cases/{id}/review
```

**PROPOSED**: a `POST /api/v1/support/message` (or similar) endpoint family
for the Support AI, kept in its own router/service module, calling into
fraud-domain services only through read-only, already-defined interfaces
(e.g. "look up this transaction's status") — never into the fusion/decision
internals. **UNDECIDED**: exact contract; not needed until the Support AI
phase.

**CONFIRMED** (spec §309-317 architecture principles):
- Detection components independently testable and replaceable.
- User Risk Profile treated as first-class context, not recomputed ad hoc.
- Explanation package generated before the decision is presented.
- Fusion weights/config externalized and calibratable.
- Avoid double-counting the same feature across models/rules.

## 4. ML services

See `docs/ML_ARCHITECTURE.md` for full detail. Architecturally:

**CONFIRMED** (spec §23, §50): models are trained offline (`ml/training/`),
never inside the API process; the API loads versioned artifacts
(`ml/models/*.pkl`, `*.json`) at inference time via `ml/inference/predict.py`.

**CONFIRMED**: independently trained models per detection problem
(transaction fraud, behaviour anomaly, device risk, voice/social-engineering),
combined only at the fusion layer — not one monolithic model.

## 5. Risk engine (calibration, fusion, decision)

**CONFIRMED** (spec §12, §13, §48): individual detectors never block a
transaction directly; they produce normalized signals consumed by a
Calibration + Fusion Engine, which produces a single 0–100 `risk_score`,
a `risk_level` (LOW/MEDIUM/HIGH), contributing `risk_factors`, and a
`decision`. Thresholds: 0–30 LOW, 31–60 MEDIUM, 61–100 HIGH (explicitly
called "prototype thresholds, not banking-grade").

**CONFIRMED**: fusion weights are not specified by the spec and must be
calibrated against validation data — **UNDECIDED** until that calibration
work happens. Do not invent weights and present them as final.

**CONFIRMED** (product directive §H): the fusion/decision engine is the
sole authority for fraud decisions. The Support AI has no write path into
this engine.

## 6. Database

**CONFIRMED** (spec §3, §18): PostgreSQL primary store; Redis optional for
caching/short-lived real-time state. Entities: `users`, `devices`,
`transactions`, `recipients`, `risk_scores`, `risk_factors`,
`voice_analysis`, `alerts`, `user_feedback`, `fraud_cases`,
`model_predictions`, `audit_logs`. Table field lists per spec §18.

**UNDECIDED** (flagged in the prior understanding report): whether Redis is
included in this build or deferred — spec marks it "optional," no decision
has been made yet.

**PROPOSED**: if a Support AI knowledge base is built, it needs its own
table(s) (e.g. `support_conversations`, `support_escalations`) — not in the
spec's schema since the Support AI itself is a product-directive addition.
**UNDECIDED**: exact schema; deferred to the Support AI implementation
phase.

## 7. Real-time communication

**CONFIRMED** (spec §20): WebSockets for live transaction feed, live risk
changes, institution alerts, dashboard updates.

**UNDECIDED**: whether WebSockets are implemented in the first working
slice or deferred to a later phase — see `docs/DEVELOPMENT_PLAN.md`.

## 8. Voice pipeline

**CONFIRMED** (spec §6.4, §11, §42, §43): audio → speech-to-text → text
normalization → NLP classifier → social-engineering features
(urgency, threat, authority_impersonation, financial_request, coercion,
phishing) → `voice_risk_score`. Training data: TeleAntiFraud-28k +
S40-specific scripted scenarios.

**CONFIRMED** (product directive §G): STT and the classifier should use
local/open-weight models where practical — no proprietary AI inference API
for this core functionality.

**UNDECIDED**: specific STT model/engine and classifier architecture — the
spec deliberately leaves this open ("a reliable pretrained speech-to-text
model plus a lightweight classifier/rules"); directive §G adds the
local/open-weight constraint but not a specific model choice.

## 9. Support AI

**CONFIRMED** (product directive §E, §F, §H): AI-first Help Center,
separate from Fraud Intelligence; escalates to a human path on sensitive/
high-risk requests; never invents account/financial/security actions;
eventually paired with an animated character with defined states.

**CONFIRMED** (product directive §G): prefer local/open-weight LLM for the
support assistant where feasible.

**UNDECIDED**: specific local LLM choice, knowledge-retrieval mechanism
(e.g. RAG over docs/FAQs), and exact escalation trigger logic. None of this
is specified in the original spec (it predates the directive) or fully
specified in the directive itself.

## 10. Institutional dashboard

**CONFIRMED** (spec §17, §22): separate application surface — Overview,
Live Risk Feed, Fraud Analytics, Model Health & Monitoring, False Positive
Review. Uses the same real-time WebSocket infrastructure as the user app.

## 11. Security boundaries

See `docs/SECURITY.md` for full detail. Architecturally relevant boundary:
RBAC roles `USER`, `INSTITUTION_ANALYST`, `ADMIN` (spec §21) gate access
between the user app, institution dashboard, and any admin surface.

## 12. Data flow (canonical)

**CONFIRMED** (spec §1, §5–§14, §53 diagrams — condensed):

```
Payment/User Context
  → Signal Collection (transaction, device, behaviour, voice)
  → User Risk Profile lookup
  → Feature Engineering
  → Detection Layer (Fraud ML, Anomaly ML, Device Risk, Rules, Voice/NLP)
  → Risk Calibration + Fusion
  → Explainability Package
  → Decision Engine (LOW/MEDIUM/HIGH)
  → User Outcome (Allow / Warn+Choice / Confirm-or-Cancel)
  → Feedback + Audit Log
  → Institution Dashboard
  → Model Monitoring Loop
```

The Support AI (product directive) sits alongside this pipeline as a
separate, read-mostly consumer — it may read transaction/decision status
to help a user understand what happened, but it is not part of this data
flow's decision path (directive §H).

------------------------------------------------------------------------

## Summary of open items requiring a decision

- Redis: include now or defer.
- WebSockets: implement in first slice or defer.
- Support AI module placement and exact API/DB contract.
- Fusion weights/methodology (requires validation data first).
- STT engine and Support AI's local LLM choice.
- Institution-side help surface vs. shared user help surface.
