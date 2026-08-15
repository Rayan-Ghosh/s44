# Product Directives — Approved Extensions to the S40 Specification

**Status:** Approved by the project owner. These directives were issued
**after** `S40_End_to_End_Project_Plan_FINAL.md` was written. They are
**additions**, not replacements — the original specification remains the
authoritative technical source of truth. Where a directive and the
specification do not conflict, both apply. Where they genuinely conflict,
the conflict must be flagged rather than silently resolved (see
`CLAUDE.md`).

No conflicts between these directives and the original specification were
identified during this foundation pass — see the foundation report for the
explicit check.

------------------------------------------------------------------------

## A. India-first product experience

The product should feel designed for Indian users, particularly users who
may not be highly technical.

Use Indian context **naturally and purposefully**:
- ₹ currency throughout (already implied by spec examples, now made explicit
  as a product requirement, not just a demo-data convenience).
- UPI/payment context where appropriate (the spec already names UPI as the
  demo payment method — this directive extends that to general product
  framing).
- Indian names/locations in demo and synthetic data.
- English + Hindi/Hinglish where useful.
- Potentially additional Indian languages if technically feasible.
- Culturally familiar wording.
- Clear, simple security explanations — not jargon translated literally.

**Restraint requirement:** Indian identity should be subtle, premium, and
purposeful. Do **not** turn the interface into excessive patriotic
decoration. Do not fill the UI with Indian flags, tricolour graphics, or
decorative nationalism merely for visual effect. This is a fintech security
product, not a national-identity showcase.

## B. Light-first experience

- The primary UI is **light mode**.
- Provide a polished dark-mode toggle (not an afterthought — a genuine
  second theme).
- The design should feel like a premium modern fintech/security product,
  not a generic admin dashboard. This applies to both the user app and the
  institution dashboard.

## C. Accessibility / low-tech user experience

The product must be understandable to:
- ordinary smartphone users
- elderly users
- rural/non-technical users
- users with limited technical vocabulary

Prioritize:
- large, readable text
- clear, unambiguous actions (button labels say what will happen, not
  generic verbs)
- simple explanations (plain language, not ML/security jargon — this
  reinforces spec §14's explainability requirement)
- strong visual hierarchy
- accessible contrast (meets at least WCAG AA where feasible)
- touch-friendly controls
- reduced-motion support (respect `prefers-reduced-motion`)
- multilingual readiness (structure copy so translation is feasible later,
  even if only English + Hindi/Hinglish ship for the demo)

## D. Indian currency loading/analysis animation

The project may use a tasteful animation inspired by Indian currency
coins/notes as a **signature** loading state for relevant payment/security
analysis moments — e.g. transaction analysis, payment risk analysis,
security verification.

**Constraint:** this must **not** become the universal loading spinner.
Use it only where it adds meaning. Avoid repetitive or gimmicky use —
if every spinner in the app is the coin animation, it has lost its
signature value and become noise.

## E. AI-first Help Center

An AI-first Help Center is an approved extension to the original
specification (the spec itself does not describe a support assistant — this
directive introduces one).

Intended flow:

```
User
  → AI Support Assistant
  → knowledge retrieval / project tools
  → resolution if possible
  → human customer-support escalation only when AI cannot safely resolve
```

Hard constraints:
- The AI must never invent account actions, financial actions, policies, or
  security decisions.
- Sensitive or high-risk requests must be escalated to a human path rather
  than hallucinated or auto-resolved.
- This is a support/help surface. It is explicitly **not** part of the fraud
  decision pipeline (see §H below).

## F. Animated Indian AI support assistant

The Help Center should eventually include a tasteful animated Indian
support character.

Character concept (illustrative, not mandatory casting):
- An Indian middle-aged male character wearing a simple kurta/dhoti.
- An Indian middle-aged female character wearing a simple saree.

**Constraint:** do **not** automatically assign a character based on
inferred gender (e.g., inferring the user's gender from their name and
picking a matching character). Prefer explicit user selection, or a
neutral/default choice when no selection has been made.

Visual style: polished and approachable, in the spirit of modern
expressive AI-assistant characters — not a cartoon stereotype.

Meaningful character states to support:
- idle
- listening
- thinking
- speaking
- reassuring
- warning
- escalating

This is a UI/UX feature for later phases — no character asset work happens
during the foundation phase.

## G. Local/open AI requirement

The finished S40 application should **not** depend on proprietary
OpenAI/Gemini/Claude/ElevenLabs/Azure/Google AI inference APIs for its core
AI functionality.

Where practical, use local/open-weight components for:
- speech-to-text
- the support LLM
- text-to-speech
- voice/social-engineering analysis

**Explicit non-requirement:** do not train a foundation LLM, STT model, or
TTS model from scratch merely to satisfy this directive. Select practical
pretrained/open models, evaluated on:
- license
- accuracy
- Indian language support
- latency
- hardware feasibility
- deployment feasibility

The exact model choices are **UNDECIDED** — see `docs/ML_ARCHITECTURE.md`
and `docs/ARCHITECTURE.md` for open items.

## H. Separation of AI systems

Keep two systems conceptually and architecturally separate:

**1. Fraud Intelligence** (per the original specification)
- transaction fraud model
- anomaly detection
- device risk
- rules
- voice/social-engineering risk
- calibration
- fusion
- explainability
- decision engine

**2. Support AI** (this directive's addition)
- user assistance
- knowledge retrieval
- conversational interaction
- support tools
- voice interaction
- escalation

**Hard rule:** a conversational LLM must never become the authoritative
fraud decision engine. Fraud decisions must remain measurable, auditable,
and deterministic where appropriate — matching spec §12's principle that
individual detectors "should not directly block transactions" and that the
fusion/decision layer is the single point of authority for that outcome.
The Support AI has no path to influence a risk score or decision outcome.

## I. Demo-first reliability

Every advanced feature must have a reliable demo path.

If a feature requires heavyweight infrastructure or a model that cannot
reliably run on the available hardware, build a technically honest fallback
architecture rather than letting the demo fail. "Technically honest" means:
the fallback is documented as a fallback, not silently presented as the
real thing.

Reliability beats unnecessary sophistication — this reinforces spec §30
("What NOT to Overbuild") and §32 (Golden Demo Flow).
