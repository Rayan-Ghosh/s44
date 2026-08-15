# CLAUDE.md — S40 Operating Manual

This file is the permanent operating manual for every Claude Code session working
in this repository. It does not replace the technical specification — it governs
*how* that specification gets implemented.

## Source of truth hierarchy

1. **`S40_End_to_End_Project_Plan_FINAL.md`** — the authoritative technical
   specification. Never edit this file. If it appears wrong or outdated, say so
   explicitly instead of silently deviating from it.
2. **`docs/PRODUCT_DIRECTIVES.md`** — approved product/UX directives from the
   project owner, written after the specification. These are additions, not
   replacements. Read both before any major architectural decision.
3. **`docs/ARCHITECTURE.md`, `docs/ML_ARCHITECTURE.md`, `docs/SECURITY.md`,
   `docs/UX_PRINCIPLES.md`, `docs/TESTING_STRATEGY.md`,
   `docs/DEVELOPMENT_PLAN.md`** — derived working documents. Keep them in sync
   with the two sources above as the project evolves.

**Conflict rule:** when the specification and a product directive don't
conflict, implement both. When they genuinely conflict, stop and flag the
conflict to the user instead of silently picking one side.

## Non-negotiable behaviors

- Read the original specification before making major architectural decisions
  — do not work from memory or from a summary once details matter.
- Read `PRODUCT_DIRECTIVES.md` before building anything user-facing.
- Preserve architectural consistency across frontend, backend, ML, and
  database. A local convenience shortcut in one module that breaks the shared
  contract is not acceptable.
- Never silently replace a major architecture decision (stack choice, schema
  shape, fusion approach, API contract). Propose the change and explain why
  before making it.
- Prefer real implementations over fake/mock functionality. A mock is
  acceptable only when explicitly required for a demo path or a testing
  boundary — and it must be clearly labeled as a mock in code and docs.
- Never fabricate ML metrics, model performance numbers, security claims,
  latency numbers, or test results. If a number hasn't been measured, say
  "not yet measured" — do not invent a plausible-looking one.
- Never claim something is complete without actually testing/verifying it.
  "The code compiles" is not "the feature works."
- Use the installed Claude Code skills that fit the task at hand — do not
  apply every available skill indiscriminately.
- Follow the security/privacy requirements in `docs/SECURITY.md` at all
  times, not just during a dedicated security phase.
- Keep secrets out of source code and commits. Use `.env` files (git-ignored)
  and `.env.example` for documented placeholders only.
- Maintain clean separation between frontend, backend, ML, and infrastructure
  concerns — no cross-layer shortcuts that couple them unnecessarily.
- Document meaningful architectural decisions as they're made, in the
  relevant `docs/` file, not only in commit messages.
- Prefer maintainable, production-quality engineering even though this is a
  hackathon prototype. "It's just a hackathon" is not a license for
  throwaway code in the core risk/decision path.
- Optimize for demo reliability, explainability, and judge-visible value over
  unnecessary technical complexity. See `PRODUCT_DIRECTIVES.md` §I
  (Demo-First Reliability).
- Treat accessibility and usability as first-class requirements, not
  polish added at the end. See `docs/UX_PRINCIPLES.md`.
- Keep the application runnable locally at all times once implementation
  begins. Don't leave the tree in a broken state between sessions.
- Run the appropriate tests after meaningful implementation changes — don't
  wait for a dedicated "testing phase" to discover something is broken.
- Use browser testing (the Browser tool / Playwright) when validating
  frontend behavior — don't declare a UI change correct from reading the
  code alone.
- Never introduce proprietary AI inference APIs (OpenAI, Gemini, Claude,
  ElevenLabs, Azure AI, Google AI, etc.) into the shipped application's core
  functionality. See `PRODUCT_DIRECTIVES.md` §G.
- Prefer local/open-weight AI models where feasible for the finished
  product's STT, support LLM, TTS, and voice/social-engineering analysis.
- Never retain sensitive data (raw audio, unhashed identifiers, unnecessary
  PII) beyond what's required for the immediate operation.
- Never use real financial credentials or real money movement anywhere in
  this project.
- Never expose private user data in logs, error messages, or client-visible
  responses.
- Never delete or overwrite important project work without a clear reason —
  investigate unfamiliar files/branches/state before touching them.
- Before starting a major implementation phase, inspect the existing code in
  the repository — do not assume it's empty or start from a blank-slate
  mental model.
- When uncertain about a requirement, stop and report the uncertainty
  instead of inventing one. Silent invention is worse than asking.

## Workflow

Every non-trivial change should move through these stages. Skipping a stage
is a decision, not a default — be able to say why if asked.

1. **UNDERSTAND** — read the relevant spec sections, product directives, and
   existing code before writing anything. Identify what's CONFIRMED vs.
   UNDECIDED for the area you're touching.
2. **PLAN** — state the approach, the files affected, and any architectural
   decision being made. For anything touching the risk-fusion logic, the
   data model, or the AI/support boundary, surface the plan before coding.
3. **IMPLEMENT** — write the real implementation. Keep modules cleanly
   separated per `docs/ARCHITECTURE.md`.
4. **TEST** — write/run the tests appropriate to the change (unit, API, ML,
   frontend) per `docs/TESTING_STRATEGY.md`.
5. **VERIFY** — actually execute the change (run the server, hit the API,
   load the page in a browser, run the eval script). Do not infer success
   from the diff alone.
6. **REVIEW** — check the change against the spec, the product directives,
   and this file for consistency and scope creep.
7. **FIX** — address anything found in VERIFY/REVIEW before moving on.
8. **DOCUMENT** — update the relevant `docs/` file if the change affects
   architecture, ML design, security posture, UX principles, or the
   development plan. Don't let docs drift from reality.

## Practical notes

- This is a **modular monolith** (per spec §4 architecture principles) —
  resist the urge to split into microservices prematurely.
- Fraud decisions (transaction fraud, anomaly, device risk, voice risk,
  fusion, decision engine) must stay deterministic/measurable and separate
  from the conversational Support AI. See `PRODUCT_DIRECTIVES.md` §H — a
  conversational LLM must never become the fraud decision authority.
- When something in the spec and something in the product directives appear
  to conflict and you can't resolve it with the stated conflict rule, list
  the conflict explicitly in your response and wait for a decision. Do not
  guess.
