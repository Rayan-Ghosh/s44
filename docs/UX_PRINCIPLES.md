# UX Principles — S40

Derived from spec §22 (Frontend Design) and `PRODUCT_DIRECTIVES.md` §A–§D.
These principles govern both the user app and the institution dashboard
unless stated otherwise.

------------------------------------------------------------------------

## 1. Light-first

**CONFIRMED** (product directive §B): light mode is the primary,
default UI. Dark mode is a polished, fully-supported second theme reached
via a toggle — not a half-finished secondary state.

## 2. Indian-first, but restrained

**CONFIRMED** (product directive §A): the product should feel designed for
Indian users — ₹ currency, UPI/payment framing, Indian names/locations in
demo data, English + Hindi/Hinglish where useful, culturally familiar and
plain-language security wording.

**Explicit anti-pattern**: excessive flags, tricolour graphics, or
decorative nationalism used merely for visual effect. Indian identity
should read as subtle, premium, and purposeful — expressed through
content and language choices, not decoration.

## 3. Accessibility as a first-class requirement

**CONFIRMED** (product directive §C): the product must be usable by
ordinary smartphone users, elderly users, rural/non-technical users, and
users with limited technical vocabulary. Concretely:
- Large, readable text.
- Clear, specific action labels (what will happen, not a generic verb).
- Simple explanations — plain language, not ML/security jargon.
- Strong visual hierarchy so the most important information (risk level,
  required action) is unmistakable.
- Accessible contrast (WCAG AA as a working target).
- Touch-friendly controls (adequate tap targets, no hover-only affordances).
- Reduced-motion support — respect `prefers-reduced-motion` and never make
  an animation the sole carrier of critical information.
- Multilingual-ready copy structure, even where only English/Hindi-Hinglish
  ship for the demo.

## 4. Clarity over decoration

**CONFIRMED** (spec §22): the UI should look like a modern financial
security product, not a generic dashboard. This means restraint is a
design choice, not a limitation — every visual element should earn its
place by supporting comprehension or trust.

## 5. Explainability is a UX requirement, not just a backend feature

**CONFIRMED** (spec §14, §22): risk explanations, contributing factors, and
risk-contribution breakdowns must be shown to users and analysts, not just
computed. The explanation package is generated before the decision is
shown, so the frontend should present risk score, decision, and reasons
together — never a bare score.

## 6. Trust

The product's core value is trustworthy intervention — warnings must feel
credible and specific (spec §14's "WHY WAS THIS FLAGGED?" example), never
generic or alarmist. Confirmation flows (spec §15) must give the user real
control (Cancel / Report / Confirm), not a forced path.

## 7. Meaningful, purposeful motion

**CONFIRMED** (product directive §D): a tasteful Indian currency
coin/note-inspired animation may serve as a **signature** loading state
for payment/security analysis moments (transaction analysis, risk
analysis, security verification) — used sparingly, not as the universal
spinner.

**General rule**: animation should communicate state (loading, analyzing,
warning) or provide continuity (Framer Motion transitions between related
views), not decorate for its own sake.

## 8. Responsive design

**CONFIRMED** (spec §3): a responsive web application — the user app in
particular should work well on mobile, since the persona explicitly
includes ordinary smartphone users (product directive §C).

## 9. User control

**CONFIRMED** (spec §15): the confirmation flow must avoid unnecessarily
blocking legitimate urgent payments — MEDIUM risk warns with a genuine
choice (Proceed/Cancel), HIGH risk requires explicit confirmation but still
offers Cancel/Report, never a dead end.

## 10. Simple language

**CONFIRMED** (product directive §C): explanations use plain language a
non-technical user can act on immediately — "This payment is 7× your usual
amount" rather than exposing amount_zscore or fraud_probability directly to
end users. (Analysts on the institution dashboard may see more technical
detail, per spec §17's Model Health panel.)

## 11. Premium fintech/security aesthetic

**CONFIRMED** (spec §22, product directive §B): both the user app and
institution dashboard should read as a premium, modern financial security
product — polished typography, restrained color use, purposeful spacing —
not a templated admin panel or generic SaaS dashboard.

------------------------------------------------------------------------

## Explicit anti-patterns

The following are called out as things to actively avoid, not just things
to deprioritize:

- Excessive flags/tricolour decoration or nationalism-as-visual-theme.
- Excessive gradients or decorative visual noise.
- Animation everywhere — including using the signature currency animation
  as a generic spinner.
- Fake AI features — any AI-looking UI element must be backed by a real
  implementation or clearly marked as a placeholder/demo stub.
- Fake security claims — never present illustrative or example numbers
  (e.g. the spec's `91.2%` precision example) as if they were the product's
  actual measured performance.
- Unreadable dashboards — dense data without hierarchy, contrast, or
  labeling that a non-expert can follow.
- Generic AI-generated SaaS UI — default component styling without
  intentional visual direction (see `CLAUDE.md`'s instruction to use
  installed design skills purposefully rather than defaulting to
  boilerplate).
- Unnecessary 3D — no 3D elements unless they serve a specific,
  well-justified purpose; none are implied by the spec or directives.
- Decorative complexity that harms usability — anything that makes the
  interface look impressive but slows down or confuses the target users
  described in product directive §C.
