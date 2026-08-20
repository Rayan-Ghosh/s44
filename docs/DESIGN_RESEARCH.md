# Design Research — Fintech / Security-Alert Interfaces

**Purpose:** identify techniques that recur across *many independent* sources,
so Avaran can adopt patterns users already understand — without replicating
any single product's signature look.

**Method:** category research across Dribbble tag/search collections
(`dark-fintech`, `fintech-dashboard`, `risk-dashboard`, `risk-score`,
`risk-indicator`, `fraud-alert`, `security-alert`, `scam-warning`),
Awwwards inspiration entries (dark-mode UI, glassmorphism light/dark),
component-library documentation (radial gauge), dark-dashboard template
roundups, ambient-canvas technique write-ups, and SOC alert-triage practice
guides. A technique is listed below only if it appeared in **three or more
independent sources**.

**Explicitly out of scope:** no single company's live marketing site was used
as a reference to replicate. `docs/PRODUCT_DIRECTIVES.md` and the design
brief rule that out, and `docs/UX_PRINCIPLES.md` lists "generic AI-generated
SaaS UI" as an anti-pattern — copying one entity's distinctive design is the
same failure in a different direction.

**Token discipline:** every mapping below uses token names that already exist
in `apps/web/app/styles/tokens.css`. This document proposes **no new colours
and no new tokens**.

---

## 1. Glass as a layering device, not a surface treatment

**Recurs in:** Awwwards glassmorphism entries (light *and* dark treatments),
Awwwards dark-mode UI pattern collection, cyber-security dashboard templates,
futuristic-glassmorphism dashboard templates, glassmorphism practice guides.

**What it solves.** Frosted blur + transparency + a hairline border produces
depth *without* heavy drop shadows or gradient stacks. The recurring
justification across sources is the OS-notification model: you can still
perceive what is behind the panel, blurred just enough that attention lands
on the panel. It answers "which layer am I being asked to act on?" without
darkening the whole screen.

**Fit for Avaran — yes, but narrowly.** A fraud warning is exactly an
"act on this layer now" moment. But `docs/UX_PRINCIPLES.md` bans "decorative
complexity that harms usability", and glass has a real cost: text over a
blurred, arbitrary backdrop has *unpredictable* contrast. Our own token
comments already commit to glass as a hierarchy tool rather than a default
surface, and that constraint is the correct reading of this pattern, not a
softening of it.

**Avaran mapping:**
- Confirmation / warning overlay → `--glass-bg`, `--glass-border`,
  `--glass-blur`, with `--shadow-lg`.
- Tint the panel to the band it represents using the existing border tints:
  `--band-high` for a HIGH-band interception, `--band-medium` for a warn.
- **Constraint:** the panel's *text* must sit on an opaque inner region using
  `--surface` / `--surface-foreground`. Do not place `--foreground` copy
  directly over the blurred region.
- Ordinary content — transaction rows, detector cards — stays on
  `--surface`, not glass.

---

## 2. One radial/ring gauge for the single composite score

**Recurs in:** radial-gauge component documentation, community "risk meter"
UI files, Dribbble `risk-score` / `risk-indicator` / `risk-dashboard`
collections, risk-dashboard template roundups.

**What it solves.** A ring converts an abstract number into an at-a-glance
magnitude, and the arc's colour band communicates severity before the digits
are read. It gives one obvious focal point in a screen that otherwise has
many competing numbers.

**Fit for Avaran — yes, for `FusionResult.risk_score` only.** This maps
cleanly onto our 0–100 score plus `Band`. Two caveats the sources raise
directly, both of which matter here:

1. **A gauge shows only the current value, no history.** Fine for us: the
   warning is about *this* payment.
2. **Needle/arc must contrast against its track.** Sources warn against using
   shades of one hue for both.

**A third caveat is Avaran-specific and more important.** `FusionResult`
carries `components_missing`, and `fuse()` renormalises weights over
detectors that actually reported. A ring that silently renders a confident
arc while a detector was `UNAVAILABLE` would misrepresent certainty — the
contract's own docstring warns that a missing component "must not be treated
as score 0". The ring must therefore show *coverage* alongside magnitude.

**Avaran mapping:**
- Arc fill: `--band-low` / `--band-medium` / `--band-high`, selected by
  `FusionResult.band` — never by a threshold re-derived in the UI.
- Track: `--surface-sunken` (light) — guarantees hue contrast against every
  band colour rather than being a tint of it.
- Numeral: `--foreground`; the band word ("HIGH") in the matching
  `--band-*` colour.
- Missing-coverage indication: render the unreported share of the ring in
  `--status-unavailable`, which is deliberately neutral rather than red — a
  detector that did not run is *unknown*, not dangerous.

---

## 3. Severity encoded as a three-step colour band

**Recurs in:** Dribbble `fraud-alert`, `security-alert`, `scam-warning`,
`risk-dashboard` collections; radial-gauge colour-range documentation;
SOC triage severity models.

**What it solves.** A consistent low/medium/high colour ramp lets a user
learn the scale once and apply it everywhere, so severity is legible
pre-attentively.

**Fit for Avaran — yes, and it is already encoded.** Our tokens mirror
`Band` from `shared/s40_contracts.py` exactly, so the UI cannot drift from
what fusion actually returns.

**The failure mode to avoid.** Colour *alone* is not an accessible severity
channel — `docs/UX_PRINCIPLES.md` §3 requires the product to work for users
with limited technical vocabulary and calls for accessible contrast. Several
sourced examples encode severity purely as hue. Avaran must always pair the
colour with a word and a shape.

**Avaran mapping:**
- LOW → `--band-low` / `--band-low-subtle`
- MEDIUM → `--band-medium` / `--band-medium-subtle`
- HIGH → `--band-high` / `--band-high-subtle`
- Always accompanied by the band word and a distinct icon per band.
- Body copy inside a banded panel uses the text tier
  (`--safe-text`, `--caution-text`, `--threat-text`) — the vivid tier is for
  fills, icons and borders only, per the measured contrast split.

---

## 4. Detector/source cards with progressive disclosure

**Recurs in:** SOC alert-triage practice guides, AI-assisted triage
prototypes, dashboard-UI collections, progressive-disclosure design writing.

**What it solves.** Analysts need the *summary* immediately and the
*evidence* on demand. Cards give each contributing signal a stable, scannable
home; expansion reveals the reasoning without making the default view dense.
`docs/UX_PRINCIPLES.md` names "unreadable dashboards — dense data without
hierarchy" as an anti-pattern, which this pattern directly answers.

**Fit for Avaran — strong.** `FusionResult.components` is literally a map of
four detectors, each with a score, a status, a version, and a `factors` list.
That is a card grid with an expandable evidence section, one-to-one.

**Avaran mapping:**
- One card per `Component`, keyed by identity colour:
  `--detector-transaction`, `--detector-behaviour`, `--detector-device`,
  `--detector-voice` — so a signal stays recognisable between the ring, the
  breakdown, and any later timeline.
- Card surface `--surface`, hairline `--border`, `--shadow-xs`.
- Collapsed: component name, score, status dot.
- Expanded: `RiskFactor.label` rows, with `--direction-increases` /
  `--direction-decreases` marking which way each factor pushed.
- Detector version (`ComponentScore.version`) in `--muted-foreground` at
  `--text-2xs` — present for auditability, visually recessive.

---

## 5. Confidence and coverage shown as separate dimensions from severity

**Recurs in:** SOC alert-triage frameworks, triage prioritisation guides,
explainable-risk-scoring prototypes. The recurring formulation is that good
triage combines **severity, confidence, and impact** — and explicitly *not*
severity alone.

**What it solves.** A high score from a degraded or partially-blind system is
a different decision from the same score at full coverage. Collapsing them
into one number destroys the information the reviewer most needs.

**Fit for Avaran — the strongest match of the six.** This is not a pattern we
have to adapt; our contract already models it. `ComponentScore` has a
`confidence` field and a `Status` of `OK` / `DEGRADED` / `UNAVAILABLE`, and
`fuse()` scales a degraded component's weight by its own confidence and
renormalises. `FusionResult` then reports `effective_weights` and
`components_missing`. The data is there; the UI simply must not throw it
away.

**Avaran mapping:**
- Status dot per detector card: `--status-ok`, `--status-degraded`,
  `--status-unavailable`.
- Never colour an `UNAVAILABLE` detector with `--threat` — neutral
  `--status-unavailable` is correct and deliberate.
- Surface `components_missing` as plain text near the score, not buried.
- Where `fuse()` returns the all-detectors-failed result, its own explanation
  string says risk is "unknown, not low" — the UI must render that sentence
  rather than a reassuring `LOW` chip.

---

## 6. Ambient generative canvas for the hero surface

**Recurs in:** ambient-canvas technique write-ups, open-source particle-network
canvas implementations, interactive particle-hero tutorials, particle-effect
collections, Dribbble network-graph data-visualisation shots.

**What it solves.** A drifting node field suggests "a system is continuously
watching" without a video file, without stock imagery, and at a fraction of
the weight. Sources consistently frame it as a *non-intrusive aesthetic
layer* — the value is atmosphere, not spectacle.

**Fit for Avaran — yes, with a hard restraint.** A network-of-signals visual
is an honest metaphor for four detectors feeding a fusion layer.
`docs/UX_PRINCIPLES.md` lists "animation everywhere" as an anti-pattern and
our motion tokens are deliberately short and decelerating, so this must stay
slow, low-contrast, and strictly behind content.

**Avaran mapping (implemented — see `components/ambient-signal-field.tsx`):**
- Node/link colours read at runtime from `--detector-transaction`,
  `--detector-behaviour`, `--detector-voice`, `--info`, so the field
  re-themes on toggle with no hardcoded hex.
- Reduced motion → static gradient from `--background` / `--surface` /
  `--surface-sunken`.
- Must never imply live analysis it is not doing. It is ambient only until
  wired to real detector output; **presenting it as live signal data would be
  a "fake AI feature"** under `docs/UX_PRINCIPLES.md`.

---

## Patterns deliberately NOT adopted

**Dark mode as the default surface.** This was the single most frequent
pattern in the fintech category — the `dark-fintech` tag alone carries
hundreds of shots, and multiple template roundups treat dark as the house
style, justified by "sleek, modern" and reduced eye strain.

Avaran does not adopt it. `docs/PRODUCT_DIRECTIVES.md` §B locks light mode as
primary, and directive §C targets ordinary smartphone users, elderly users,
and rural/non-technical users — a population for whom a dark financial
interface is less familiar, not more. Dark remains a fully-designed equal
second theme, not the default. Recording this explicitly because the
category pressure runs the other way, and "everyone else does it" is not a
reason.

**Heavy gradient meshes and neon-on-black.** Common in the glassmorphism and
dark-UI collections. Ruled out by the anti-patterns list ("excessive
gradients or decorative visual noise") and by our own token comments, which
reserve glow for selective emphasis rather than ambient decoration.

**3D / WebGL hero scenes.** Present across award-site inspiration. Ruled out
by "unnecessary 3D — no 3D elements unless they serve a specific,
well-justified purpose". Canvas 2D achieves the needed atmosphere at far
lower cost.

---

## Sources

Category collections and references consulted:

- [Dribbble — dark-fintech](https://dribbble.com/tags/dark-fintech)
- [Dribbble — fintech-dashboard](https://dribbble.com/tags/fintech-dashboard)
- [Dribbble — risk-dashboard](https://dribbble.com/search/risk-dashboard)
- [Dribbble — risk-score](https://dribbble.com/search/risk-score)
- [Dribbble — risk-indicator](https://dribbble.com/search/risk-indicator)
- [Dribbble — fraud-alert](https://dribbble.com/search/fraud-alert)
- [Dribbble — security-alert](https://dribbble.com/search/security-alert)
- [Dribbble — scam-warning](https://dribbble.com/search/scam-warning)
- [Dribbble — fraud-detection-ui](https://dribbble.com/search/fraud-detection-ui)
- [Dribbble — network graph data visualisation](https://dribbble.com/shots/25147704-Network-Graph-Data-Visualization)
- [Awwwards — dark mode UI pattern](https://www.awwwards.com/inspiration/dark-mode-ui-pattern-1)
- [Awwwards — glassmorphism with dark & light theme](https://www.awwwards.com/inspiration/glassmorphism-with-dark-light-theme-henning-tillmann)
- [Awwwards — dashboard UI design collection](https://www.awwwards.com/inspiration/dashboard-ui-design-on-behance)
- [Infragistics — radial gauge component docs](https://www.infragistics.com/products/indigo-design/help/components/radial-gauge)
- [Figma Community — Risk Meter UI](https://www.figma.com/community/file/1467889729559171833/risk-meter-ui)
- [Codrops — ambient canvas backgrounds](https://tympanus.net/codrops/2018/12/13/ambient-canvas-backgrounds/)
- [canvas-particle-network (open source)](https://github.com/JulianLaval/canvas-particle-network)
- [UX Pilot — glassmorphism practice guide](https://uxpilot.ai/blogs/glassmorphism-ui)
- [Colorlib — dark admin dashboard roundup](https://colorlib.com/wp/dark-admin-dashboard-templates/)
- [Prophet Security — alert triage guide](https://www.prophetsecurity.ai/blog/alert-triage)
- [INE — SOC alert triage framework](https://ine.com/blog/soc-alert-triage-a-practical-framework-for-reducing-noise-without-missing-risk)
- [SOC alert triage prototype (explainable risk scoring)](https://github.com/shanthalalgudi/SOC_Alert_Triage_Prototype)
- [IBM Design — progressive disclosure](https://medium.com/design-ibm/designing-patterns-that-scale-with-progressive-disclosure-9341d53644ae)
