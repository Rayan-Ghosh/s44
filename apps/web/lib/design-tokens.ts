/**
 * Token registry for the /design-system reference route.
 *
 * This lists token NAMES only. Every value is read at runtime from the CSS
 * custom properties defined in app/styles/tokens.css, so this file can never
 * drift into being a second source of truth — if a token is renamed there, the
 * swatch here goes blank rather than quietly showing a stale colour.
 */

export type Swatch = {
  /** CSS custom property, without the leading `--`. */
  token: string
  /** What this colour MEANS, not what hue it is. */
  meaning: string
}

export type SwatchGroup = {
  title: string
  description: string
  swatches: Swatch[]
}

export const SEMANTIC_GROUPS: SwatchGroup[] = [
  {
    title: "Surfaces",
    description:
      "Light mode pairs a cool neutral ground with warm off-white surfaces. That temperature shift creates elevation with almost no shadow.",
    swatches: [
      { token: "background", meaning: "Page ground" },
      { token: "background-subtle", meaning: "Recessed ground" },
      { token: "surface", meaning: "Default panel" },
      { token: "surface-raised", meaning: "Elevated panel" },
      { token: "surface-sunken", meaning: "Inset well" },
      { token: "muted", meaning: "Quiet fill" },
      { token: "border", meaning: "Default hairline" },
      { token: "border-strong", meaning: "Emphasised edge" },
    ],
  },
  {
    title: "Semantic — fills, icons, borders",
    description:
      "What a colour means. Components reference only these, never a raw hue. This tier is for non-text UI and is held to WCAG 1.4.11 (3:1). Measured in-browser: every value clears it in both themes.",
    swatches: [
      { token: "safe", meaning: "Safe / normal" },
      { token: "safe-subtle", meaning: "Safe, low emphasis" },
      { token: "caution", meaning: "Caution" },
      { token: "caution-subtle", meaning: "Caution, low emphasis" },
      { token: "threat", meaning: "Threat / fraud" },
      { token: "threat-subtle", meaning: "Threat, low emphasis" },
      { token: "info", meaning: "Information" },
      { token: "info-subtle", meaning: "Information, low emphasis" },
      { token: "ai", meaning: "AI / assistant" },
      { token: "ai-subtle", meaning: "AI, low emphasis" },
    ],
  },
  {
    title: "Semantic — text",
    description:
      "The same meanings, darkened for type on a light surface so they clear WCAG 1.4.3 (4.5:1). Amber at full vividness measured 3.27:1 on white — forcing it to 4.5 turns it brown and kills the caution signal, so text gets its own value instead. On obsidian the two tiers converge. Use these whenever the colour is actual copy.",
    swatches: [
      { token: "safe-text", meaning: "Safe — as text" },
      { token: "caution-text", meaning: "Caution — as text" },
      { token: "threat-text", meaning: "Threat — as text" },
      { token: "info-text", meaning: "Information — as text" },
      { token: "ai-text", meaning: "AI — as text" },
    ],
  },
  {
    title: "Risk bands",
    description:
      "Mirrors Band in shared/s40_contracts.py. The fusion engine emits exactly LOW / MEDIUM / HIGH; these tokens keep the UI in lockstep with that contract.",
    swatches: [
      { token: "band-low", meaning: "LOW — allow silently" },
      { token: "band-medium", meaning: "MEDIUM — warn, user chooses" },
      { token: "band-high", meaning: "HIGH — confirm or cancel" },
    ],
  },
  {
    title: "Detector status",
    description:
      "Mirrors Status. `unavailable` is deliberately neutral, never red — a detector that did not run is unknown, not dangerous.",
    swatches: [
      { token: "status-ok", meaning: "Ran normally" },
      { token: "status-degraded", meaning: "Ran with missing inputs" },
      { token: "status-unavailable", meaning: "Did not run" },
    ],
  },
  {
    title: "Detector identity",
    description:
      "Mirrors Component. One stable hue per detector so a signal stays recognisable across the risk ring, breakdown, and timeline.",
    swatches: [
      { token: "detector-transaction", meaning: "transaction_ml" },
      { token: "detector-behaviour", meaning: "behaviour_anomaly" },
      { token: "detector-device", meaning: "device_risk" },
      { token: "detector-voice", meaning: "voice_social_engineering" },
    ],
  },
  {
    title: "India accent",
    description:
      "Accent only — a hairline, a small mark, one emphasis. Never a tricolour theme and never decorative nationalism (PRODUCT_DIRECTIVES §A).",
    swatches: [
      { token: "accent-india-saffron", meaning: "Saffron accent" },
      { token: "accent-india-green", meaning: "Green accent" },
      { token: "accent-india-blue", meaning: "Blue accent" },
    ],
  },
]

export const TYPE_SCALE = [
  { token: "text-5xl", label: "Display", sample: "Payment held" },
  { token: "text-4xl", label: "H1", sample: "Payment held" },
  { token: "text-3xl", label: "H2", sample: "Why was this flagged?" },
  { token: "text-2xl", label: "H3", sample: "Why was this flagged?" },
  { token: "text-xl", label: "H4", sample: "Risk breakdown" },
  { token: "text-lg", label: "Lead", sample: "This payment is unusual for you." },
  { token: "text-base", label: "Body", sample: "This payment is unusual for you." },
  { token: "text-sm", label: "Small", sample: "Amount is 12x your usual transfer" },
  { token: "text-xs", label: "Caption", sample: "Updated 2 minutes ago" },
  { token: "text-2xs", label: "Micro", sample: "TRANSACTION_ML v1.0.0" },
] as const

export const SPACE_SCALE = [
  "space-1",
  "space-2",
  "space-3",
  "space-4",
  "space-5",
  "space-6",
  "space-8",
  "space-10",
  "space-12",
  "space-16",
  "space-20",
  "space-24",
] as const

export const RADII = [
  "radius-xs",
  "radius-sm",
  "radius-md",
  "radius-lg",
  "radius-xl",
  "radius-2xl",
  "radius-3xl",
  "radius-full",
] as const

export const SHADOWS = [
  "shadow-xs",
  "shadow-sm",
  "shadow-md",
  "shadow-lg",
  "shadow-xl",
] as const

export const BLURS = [
  "blur-xs",
  "blur-sm",
  "blur-md",
  "blur-lg",
  "blur-xl",
  "blur-2xl",
] as const

export const GLOWS = [
  { token: "glow-sm", meaning: "Focus ring halo" },
  { token: "glow-md", meaning: "Standard emphasis" },
  { token: "glow-lg", meaning: "Focal element" },
  { token: "glow-safe", meaning: "Safe emphasis" },
  { token: "glow-caution", meaning: "Caution emphasis" },
  { token: "glow-threat", meaning: "Threat emphasis" },
  { token: "glow-ai", meaning: "AI emphasis" },
] as const

export const DURATIONS = [
  { token: "duration-instant", meaning: "State flip" },
  { token: "duration-fast", meaning: "Hover, press" },
  { token: "duration-normal", meaning: "Panel, popover" },
  { token: "duration-slow", meaning: "Page-level" },
  { token: "duration-slower", meaning: "Deliberate reveal" },
  { token: "duration-theme", meaning: "Light ↔ dark cross-fade" },
] as const

export const EASINGS = [
  { token: "ease-standard", meaning: "Default" },
  { token: "ease-out", meaning: "Entering" },
  { token: "ease-in", meaning: "Exiting" },
  { token: "ease-in-out", meaning: "Moving between states" },
  { token: "ease-spring", meaning: "Playful accent (used sparingly)" },
] as const

export const Z_LAYERS = [
  "z-base",
  "z-raised",
  "z-sticky",
  "z-header",
  "z-overlay",
  "z-drawer",
  "z-modal",
  "z-popover",
  "z-toast",
  "z-tooltip",
] as const

export const BREAKPOINTS = [
  { token: "xs", value: "24rem" },
  { token: "sm", value: "40rem" },
  { token: "md", value: "48rem" },
  { token: "lg", value: "64rem" },
  { token: "xl", value: "80rem" },
  { token: "2xl", value: "96rem" },
] as const
