# Testing Strategy — S40

Derived from spec §25 (Testing Strategy), §26 (Demo Scenarios), and the
general engineering rules in `CLAUDE.md`.

**Core principle**: a feature is not considered complete merely because its
code exists or compiles. It is complete when it has been run and its
behavior verified against the requirement it implements.

------------------------------------------------------------------------

## 1. Unit tests

**CONFIRMED** (spec §25): cover feature calculations, the rule engine, risk
fusion, thresholds, and API validation. These are the fastest-running tests
and should be the first line of defense for the risk-engine logic
specifically, since that logic must stay deterministic and auditable
(product directive §H).

## 2. Integration tests

**CONFIRMED** (spec §25): exercise the full path —
```
transaction → feature extraction → ML inference → risk fusion → decision → database
```
These validate that the modules described in `docs/ARCHITECTURE.md`
actually compose correctly, not just that each one works in isolation.

## 3. ML tests

**CONFIRMED** (spec §25): prediction shape, missing-value handling, model
loading, threshold behavior, performance metrics. Per `docs/ML_ARCHITECTURE.md`
§12, any reported metric must come from an actual run against real
(synthetic or public) data — never a placeholder number presented as real.

## 4. Frontend tests

**CONFIRMED** (spec §25): transaction flow, warning modal, confirmation,
cancellation, dashboard loading.

## 5. Browser / end-to-end testing

**CONFIRMED** (`CLAUDE.md`): frontend behavior must be validated in a
real browser (via the Browser tool or Playwright), not inferred from
source alone. This applies to every UI change that affects user-facing
behavior — the warning/confirmation flow in particular, since it's the
product's core trust mechanism.

## 6. Accessibility testing

**PROPOSED** (derived from product directive §C, not explicitly itemized
as a test category in the original spec): verify contrast ratios, keyboard
navigation, touch-target sizing, and `prefers-reduced-motion` behavior for
any UI surface built. This is a gap between the spec's test list and the
accessibility commitments in the product directives — closing it here so
it isn't silently dropped.

## 7. Security testing

**PROPOSED** (derived from spec §21 + `docs/SECURITY.md`, not separately
itemized in spec §25): validate RBAC boundaries (a `USER` cannot reach
`/institution/*` endpoints; an `INSTITUTION_ANALYST` cannot perform
`ADMIN`-only actions), confirm sensitive identifiers are hashed at rest,
and confirm audit logs are written for the operations listed in
`docs/SECURITY.md` §5.

## 8. Performance / load testing

**CONFIRMED** (spec §25 Phase 10, "Load-test the demo pipeline"): confirm
the demo pipeline holds up under the load the actual demo will place on
it (a handful of concurrent scripted scenarios, not production-scale
traffic) — proportionate to the "demo-first reliability" principle in
product directive §I, not an attempt at production-grade load testing.

## 9. Four scripted demo scenarios (acceptance-level tests)

**CONFIRMED** (spec §26), these double as end-to-end acceptance tests and
must all pass deterministically before any demo:

1. **Legitimate** — known device, known recipient, normal amount/location
   → Risk = LOW → Allow.
2. **Suspicious transaction** — new recipient, 5× normal amount, new
   device → Risk = MEDIUM/HIGH → Warning.
3. **Voice phishing** — suspicious call → voice analysis → high
   social-engineering score → payment initiated → risk fusion increases →
   strong warning.
4. **False positive** — high-value transaction flagged → user confirms
   legitimate → feedback recorded → appears in institution dashboard →
   false-positive review workflow.

## 10. Regression testing

**PROPOSED**: once the four scripted scenarios above exist as automated
tests, run them after any change touching the risk engine, feature
computation, or the ML inference path — they are the cheapest reliable
signal that a change hasn't silently broken the demo's core story.

------------------------------------------------------------------------

## Testing and the workflow in CLAUDE.md

The `TEST` and `VERIFY` stages of the workflow in `CLAUDE.md` map directly
onto this document:
- `TEST` = write/run the automated tests appropriate to the change
  (categories 1–4 and 9 above, as applicable).
- `VERIFY` = actually execute the change in a running system (categories
  5–8 above, as applicable) — confirming the feature works, not just that
  its tests pass in isolation.

Neither stage may be skipped by asserting the code "looks correct."
