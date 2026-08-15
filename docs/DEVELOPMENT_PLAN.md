# Development Plan — S40

This roadmap keeps the original specification's Phase 0–13 structure
(spec §28) and inserts the Support AI / product-directive work as its own
phase (**Phase 7.5**) rather than pretending it was part of the original
document. No phase has been started; this is planning only.

For each phase: objective, major deliverables, dependencies, validation
criteria, and likely risks.

------------------------------------------------------------------------

## Phase 0 — Project Definition
**Status: in progress (this foundation work is part of Phase 0).**

- **Objective**: freeze scope, architecture, data contracts, acceptance
  criteria before writing application code.
- **Deliverables**: this document set (`CLAUDE.md`, `docs/*`), resolved or
  explicitly tracked open decisions.
- **Dependencies**: none.
- **Validation**: the open-items lists in `ARCHITECTURE.md`,
  `ML_ARCHITECTURE.md`, and `SECURITY.md` are either resolved or
  consciously deferred with an owner.
- **Risks**: proceeding to Phase 1 with unresolved architectural
  decisions (e.g. Redis in/out, fusion methodology) causes rework later.

## Phase 1 — Repository & Infrastructure

- **Objective**: stand up the monorepo skeleton per spec §27.
- **Deliverables**: `apps/web`, `apps/api`, `ml/`, `voice/`, `scripts/`,
  `infra/`, `docker-compose.yml`, `.env.example`, CI skeleton.
- **Dependencies**: Phase 0 decisions on Redis inclusion and Docker
  availability (Docker was not found on this machine during the
  understanding phase — needs installation or an alternative local-dev
  path before this phase can fully complete).
- **Validation**: `docker compose up` (or the agreed alternative) brings
  up a runnable, empty skeleton; CI runs on push.
- **Risks**: Docker unavailability blocking Compose-based local dev.

## Phase 2 — Database & APIs

- **Objective**: implement the schema (spec §18) and core API surface
  (spec §19).
- **Deliverables**: SQLAlchemy models, Alembic migrations, transaction/
  risk/feedback/institution endpoints (stubs acceptable before ML exists,
  but must be clearly marked as stubs).
- **Dependencies**: Phase 1 infra.
- **Validation**: migrations apply cleanly; endpoints pass Pydantic
  validation tests; integration test skeleton from
  `docs/TESTING_STRATEGY.md` §2 exists even if models aren't trained yet.
- **Risks**: schema drift if entities are extended ad hoc without updating
  `docs/ARCHITECTURE.md` §6.

## Phase 3 — Synthetic Data

- **Objective**: build the transaction/user/device/fraud/voice-phishing
  generator (spec §24, §37, §38).
- **Deliverables**: `scripts/generate_data.py`, `scripts/seed_database.py`,
  scenarios A–F from spec §38 (including the important Scenario F —
  legitimate high-value transactions).
- **Dependencies**: Phase 2 schema.
- **Validation**: generated data reproduces all six scenarios; seeded DB
  supports the four demo scenarios end to end once the pipeline exists.
- **Risks**: spec's own warning — generating data via a simplistic rule
  (e.g. amount > ₹50,000 → fraud) would let models learn the artificial
  rule instead of real patterns. Must use overlapping scenarios as
  specified.

## Phase 4 — ML

- **Objective**: build feature pipeline, train fraud + anomaly models,
  add inference and explainability.
- **Deliverables**: `ml/features/*`, `ml/training/*`, `ml/models/*`
  artifacts, `ml/inference/predict.py`, SHAP integration.
- **Dependencies**: Phase 3 data (synthetic + public datasets, pending
  license verification per `docs/ML_ARCHITECTURE.md` §15); Phase 2 schema
  for feature sourcing.
- **Validation**: real evaluation metrics reported (spec §47) — Precision,
  Recall, F1, PR-AUC, ROC-AUC, FPR — from actual test runs, chronological
  split respected, no label leakage.
- **Risks**: PaySim → IEEE-CIS generalization is explicitly not guaranteed
  by the spec; treat IEEE-CIS as a validation/generalization check, not an
  assumed drop-in extension.

## Phase 5 — Voice

- **Objective**: build the voice/social-engineering pipeline.
- **Deliverables**: `voice/transcription`, `voice/preprocessing`,
  `voice/classifier`, integration with risk fusion.
- **Dependencies**: Phase 4 (fusion contract must exist to integrate
  into); STT engine choice (open item in `docs/ML_ARCHITECTURE.md` §5,
  constrained by product directive §G to local/open-weight).
- **Validation**: `voice_risk_score` produced from both TeleAntiFraud-28k
  samples and S40 scripted scenarios; raw audio discarded per
  `docs/SECURITY.md` §3.
- **Risks**: local STT/classifier latency or accuracy on Indian-accented
  English/Hinglish audio — needs an honest fallback per product directive
  §I if hardware constraints bite.

## Phase 6 — Risk Engine

- **Objective**: build rule engine, fusion, decision engine,
  explainability, configurable thresholds, audit logging.
- **Deliverables**: fusion module with externalized/versioned config,
  decision engine implementing the LOW/MEDIUM/HIGH thresholds (spec §13),
  explanation package generation before decision output (spec §14).
- **Dependencies**: Phases 4 and 5 (needs both ML outputs and voice risk
  to fuse).
- **Validation**: fusion weights calibrated against validation scenarios
  and documented (not invented); double-counting safeguards verified with
  a test case where `new_device` affects both device risk and the fraud
  model.
- **Risks**: this is the highest-stakes phase for the "never fabricate...
  never let a conversational LLM become the fraud decision engine" rules
  in `CLAUDE.md` and product directive §H — extra scrutiny warranted.

## Phase 7 — Frontend

- **Objective**: build the user app and institution dashboard per spec
  §22, styled per product directives §A–§D.
- **Deliverables**: pages listed in `docs/ARCHITECTURE.md` §2 (user app
  and institution app), animated risk ring, transaction timeline, warning/
  confirmation flow, analytics, false-positive review UI.
- **Dependencies**: Phase 6 (needs a real decision package to render, not
  a mock, per `CLAUDE.md`'s "prefer real implementations" rule — though
  UI work may start against a documented mock contract before Phase 6
  fully lands, as long as it's labeled).
- **Validation**: browser-tested per `docs/TESTING_STRATEGY.md` §5;
  accessibility checks per §6; light-mode-first with working dark toggle.
- **Risks**: scope creep into decorative complexity — check against the
  anti-patterns list in `docs/UX_PRINCIPLES.md` before considering this
  phase done.

## Phase 7.5 — Support AI (product-directive addition)

Not part of the original spec's phase list — inserted here because it's an
approved extension (product directive §E–§H) that depends on the same
frontend/backend foundation as Phase 7.

- **Objective**: build the AI-first Help Center with escalation and (later)
  the animated Indian support character.
- **Deliverables**: Support AI backend service (isolated from the fraud
  engine per §H), knowledge retrieval mechanism, escalation logic, `/help`
  frontend surface; character asset work explicitly deferred to a later
  sub-phase.
- **Dependencies**: Phase 7 frontend shell; a decision on the local LLM
  and retrieval approach (open item, `docs/ARCHITECTURE.md` §9).
- **Validation**: the AI never performs or claims to perform an account/
  financial/security action; sensitive-request escalation demonstrably
  triggers on the defined category list (once defined, per
  `docs/SECURITY.md` §8); no write path exists from this module into the
  risk/decision engine (verified by code review, not just by absence of
  an obvious call site).
- **Risks**: scope/time — product directive §I says every advanced feature
  needs a reliable demo path; if the local LLM path proves unreliable on
  available hardware, a scoped-down but honest fallback (e.g. a smaller
  retrieval-only assistant) should be used instead of overreaching.

## Phase 8 — Real-Time

- **Objective**: WebSockets for live transaction feed, risk changes,
  institution alerts, dashboard updates (spec §20).
- **Dependencies**: Phases 2, 6, 7.
- **Validation**: dashboard updates without a manual refresh when a new
  transaction is scored.
- **Risks**: added infra complexity — reconfirm at this point whether
  WebSockets are still in scope for the demo timeline (open item from
  Phase 0).

## Phase 9 — Security

- **Objective**: authentication, RBAC, hashing, audit logs, raw-voice
  cleanup, API validation hardening (spec §21).
- **Dependencies**: all preceding phases (security review touches every
  layer).
- **Validation**: checklist in `docs/SECURITY.md` walked end to end;
  security testing per `docs/TESTING_STRATEGY.md` §7.
- **Risks**: retrofitting auth/RBAC late tends to surface integration
  gaps — worth spot-checking role boundaries incrementally in earlier
  phases rather than purely at the end.

## Phase 10 — Testing

- **Objective**: complete the test suite across all categories in
  `docs/TESTING_STRATEGY.md`.
- **Dependencies**: all preceding phases.
- **Validation**: the four scripted demo scenarios pass as automated
  acceptance tests; unit/integration/ML/frontend suites green.
- **Risks**: treating this as a phase to "catch up" on testing rather than
  continuously testing throughout — contradicts the TEST/VERIFY stages in
  `CLAUDE.md`'s workflow and should be avoided in practice.

## Phase 11 — Polish

- **Objective**: animations, visual hierarchy, loading/error states,
  explainability polish, demo data quality, guided demo mode.
- **Dependencies**: Phase 7/7.5 substantially complete.
- **Validation**: reviewed against `docs/UX_PRINCIPLES.md` anti-patterns
  list explicitly, not just "does it look nice."
- **Risks**: polish time consuming budget needed for Phase 13 rehearsal.

## Phase 12 — Deployment

- **Objective**: Docker images, backend/frontend deployment, environment
  configuration, smoke tests.
- **Dependencies**: Phase 1 infra decisions finalized; Docker available.
- **Validation**: production smoke tests pass against the deployed demo
  environment.
- **Risks**: environment-specific breakage discovered late — mitigate by
  deploying early and often rather than only at Phase 12.

## Phase 13 — Final Demo

- **Objective**: rehearse the Golden Demo Flow (spec §32) and prepare
  supporting materials.
- **Deliverables**: legitimate/suspicious/voice-phishing/false-positive
  scenarios ready; architecture slide; ML metrics slide (real numbers
  only); privacy/security slide.
- **Dependencies**: everything above.
- **Validation**: a full run-through of spec §32's 15-step flow completes
  without manual intervention or fabricated data mid-demo.
- **Risks**: none of the "honest fallback" work from earlier phases has
  been exercised end-to-end until this rehearsal — schedule it with enough
  buffer to fix what breaks.

------------------------------------------------------------------------

## Notes on sequencing

- Phase 7.5 (Support AI) is placed after Phase 7 because it shares the
  frontend shell and backend service patterns established there, and
  because it is explicitly lower-priority than the core fraud pipeline —
  product directive §H keeps it a peer system, not a blocker for the core
  demo story in spec §32.
- Every phase's "Validation" column exists to satisfy the `VERIFY` stage
  in `CLAUDE.md`'s workflow — a phase isn't done when its code exists, but
  when its validation criteria have actually been run and passed.
