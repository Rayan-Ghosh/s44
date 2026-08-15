# Security & Privacy — S40

Derived from spec §21 plus the security-relevant implications of
`PRODUCT_DIRECTIVES.md` (especially §E–§H, the Support AI). Same labeling
convention: **CONFIRMED** / **PROPOSED** / **UNDECIDED**.

------------------------------------------------------------------------

## 1. Data minimization

**CONFIRMED** (spec §21): only retain information required for risk
evaluation and auditing. The User Risk Profile (spec §7) must be
privacy-minimized, not an unbounded historical store.

## 2. Sensitive identifiers

**CONFIRMED** (spec §21):
- `hash(device_id)`
- `hash(phone_number)`
- Pseudonymous user IDs

**PROPOSED**: use a consistent, documented hashing approach (e.g. salted
SHA-256) applied at the point of ingestion, so raw identifiers never reach
storage. **UNDECIDED**: exact hashing/salting scheme and key management —
to be decided during backend implementation, not invented here.

## 3. Voice/audio handling

**CONFIRMED** (spec §21): do not retain raw audio unless explicitly
required for the demo. Preferred flow:
```
audio → transcription/features → risk analysis → discard raw audio
```
This directly constrains the Voice pipeline (`docs/ML_ARCHITECTURE.md` §5)
and the Support AI's voice interaction feature (`PRODUCT_DIRECTIVES.md`
§F) equally — neither should become a standing store of raw recordings.

## 4. Authentication and authorization

**CONFIRMED** (spec §21):
- JWT/session authentication.
- Role-based access control with roles: `USER`, `INSTITUTION_ANALYST`,
  `ADMIN`.

**UNDECIDED**: session lifetime, token refresh strategy, and whether
institution analysts and admins share a login surface distinct from the
user app — none of this is specified and must be decided during backend
implementation.

## 5. Audit logging

**CONFIRMED** (spec §18, §21): record sensitive operations via the
`audit_logs` table (actor, action, resource, timestamp, metadata).
Applies to at least: risk decisions, user confirm/cancel/report actions,
institution case reviews, and any admin action.

**PROPOSED**: audit log writes should never include raw PII or raw audio
content in the `metadata` field — only references (hashed/pseudonymous
IDs, transaction IDs) per the data-minimization principle above.

## 6. API security / input validation

**CONFIRMED** (spec §3, backend responsibilities): FastAPI + Pydantic used
for schema validation on every endpoint listed in `docs/ARCHITECTURE.md`
§3.

**PROPOSED** (standard practice, not spec-invented architecture):
- Validate and sanitize all request bodies via Pydantic models — reject
  unknown/malformed fields rather than silently ignoring them.
- Rate-limit sensitive endpoints (transaction creation, voice analysis) to
  protect the demo from accidental overload — exact limits **UNDECIDED**.
- Standard OWASP-class protections (parameterized queries via SQLAlchemy,
  no string-built SQL, output encoding on the frontend) apply throughout,
  per the general engineering rules in `CLAUDE.md`.

## 7. Secrets management

**CONFIRMED** (`CLAUDE.md`, general engineering rule): secrets never live
in source code or commits. `.env` files are git-ignored; `.env.example`
documents required variable names with placeholder values only.

## 8. Support AI — prompt injection and action boundaries

**CONFIRMED** (product directive §E, §H): this is a new security surface
not covered by the original spec, since the Support AI is itself a
directive-level addition.

- The Support AI must never invent account actions, financial actions,
  policies, or security decisions.
- Sensitive/high-risk requests must escalate to a human path rather than
  being resolved (or hallucinated) by the AI.
- The Support AI has **no write path** into the fraud decision engine,
  risk scores, or transaction state — read-only access to already-computed,
  already-authorized data only (e.g., "why was my transaction flagged"
  using the existing explanation package, not a live re-evaluation).
- Because the Support AI will process free-form user text (and
  potentially voice), it is a prompt-injection surface: user-supplied
  content must never be interpreted as system-level instructions capable
  of changing its tool access, escalation rules, or the scope of what it's
  permitted to do.

**UNDECIDED**: concrete implementation of the escalation trigger (keyword
rules, classifier, confidence threshold, or a combination) and the exact
list of "sensitive/high-risk" request categories that force escalation.
This needs explicit definition before the Support AI is built, not
improvised during implementation.

## 9. Data retention

**CONFIRMED** (spec §21, product directive §I): minimize retention broadly;
raw audio specifically must not persist beyond feature extraction unless
explicitly required for demo purposes.

**UNDECIDED**: retention period for transaction records, risk scores, and
audit logs in the demo environment. Since this is a prototype using
synthetic data, a generous retention window is likely acceptable, but the
exact number has not been decided and should not be assumed.

## 10. Synthetic / anonymized demo data

**CONFIRMED** (spec §2 Non-Goals, §24): the system uses a realistic
transaction simulator and synthetic/anonymized data — never real financial
credentials, never real-money movement. This is a hard constraint per
`CLAUDE.md` as well.

**CONFIRMED** (product directive §A): demo data should use Indian
names/locations for cultural relevance, while remaining clearly synthetic.

## 11. No proprietary AI dependency for core function

**CONFIRMED** (product directive §G): the shipped application's core AI
functionality (STT, support LLM, TTS, voice/social-engineering analysis)
should not depend on proprietary inference APIs. This is as much a
data-governance decision as an architectural one — it avoids sending
user voice/text content to third-party inference providers by default.

------------------------------------------------------------------------

## Summary of open security items requiring a decision

- Hashing/salting scheme and key management for identifiers.
- Session/token lifetime and refresh strategy; analyst/admin login surface.
- Rate-limiting thresholds for sensitive endpoints.
- Retention periods for transactions, risk scores, and audit logs.
- Escalation trigger logic and sensitive-category list for the Support AI.
