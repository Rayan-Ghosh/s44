"use client"

import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"

import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

/**
 * Payment risk-decision card — isolated design-critique surface.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MODE EXCEPTION (scoped to this screen only).
 *
 * The rest of the design system is built in Operate mode: scanability and
 * restraint outrank expression. This screen is deliberately the exception.
 * It is a first-impression, emotional-trust moment — a person deciding
 * whether to stop their own ₹45,000 payment — so expression and confidence
 * lead. In impeccable's taxonomy that is Persuade mode: the visitor decides
 * and acts, and the design IS the product.
 *
 * This is NOT a change to the system default. Every other surface stays
 * Operate.
 *
 * Tone reference: the confidence level of premium Indian fintech — bold
 * type, glow with intent, generous depth. Reference for CONFIDENCE ONLY.
 * No layout, component shape, or copy is taken from any external product;
 * the composition and every colour below come from Avaran's own locked
 * token set.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * DATA PROVENANCE — every number on this screen is real output of
 * `shared/s40_contracts.py::fuse()`, not invented for the mock. Produced by
 * feeding four ComponentScores (voice UNAVAILABLE) through the actual
 * contract:
 *
 *   risk_score        61.93
 *   band              MEDIUM        (BAND_THRESHOLDS: medium 40, high 70)
 *   effective_weights transaction 0.5333 · behaviour 0.2667 · device 0.2
 *                     (DEFAULT_WEIGHTS renormalised over the 3 that reported)
 *   components_missing ["voice_social_engineering"]
 *
 * Nothing here displays a metric the contract does not produce.
 */

/* ── Verified fusion output ────────────────────────────────────────────── */

const FUSION = {
  riskScore: 61.93,
  band: "MEDIUM",
  effectiveWeights: {
    transaction_ml: 0.5333,
    behaviour_anomaly: 0.2667,
    device_risk: 0.2,
  },
  componentsMissing: ["voice_social_engineering"],
} as const

/** Share of configured weight that actually reported. Voice carries 0.25 of
 *  DEFAULT_WEIGHTS, so coverage is 75%. Drives the outer ring. */
const COVERAGE = 0.75

type Detector = {
  key: string
  label: string
  /** --detector-* token driving this card's identity colour. */
  token: string
  version: string
  score: number | null
  latencyMs: number | null
  status: "ok" | "unavailable"
  /** ComponentScore.error, when status is unavailable. */
  error?: string
  factors: { label: string; contribution: number; direction: "increases" | "decreases" }[]
}

const DETECTORS: Detector[] = [
  {
    key: "transaction_ml",
    label: "Transaction",
    token: "--detector-transaction",
    version: "xgb-1.0.0",
    score: 0.62,
    latencyMs: 3,
    status: "ok",
    factors: [
      { label: "Amount is 12x your usual transfer", contribution: 0.44, direction: "increases" },
      { label: "First payment to this recipient", contribution: 0.26, direction: "increases" },
    ],
  },
  {
    key: "behaviour_anomaly",
    label: "Behaviour",
    token: "--detector-behaviour",
    version: "iforest-1.0.0",
    score: 0.55,
    latencyMs: 2,
    status: "ok",
    factors: [
      { label: "Sent at 01:47, outside your normal hours", contribution: 0.31, direction: "increases" },
    ],
  },
  {
    key: "device_risk",
    label: "Device",
    token: "--detector-device",
    version: "rules-1.0.0",
    score: 0.71,
    latencyMs: 1,
    status: "ok",
    factors: [
      { label: "Device seen for the first time", contribution: 0.4, direction: "increases" },
      { label: "Location matches your usual city", contribution: -0.12, direction: "decreases" },
    ],
  },
  {
    key: "voice_social_engineering",
    label: "Voice",
    token: "--detector-voice",
    version: "n/a",
    score: null,
    latencyMs: null,
    status: "unavailable",
    error: "no active call",
    factors: [],
  },
]

/* ── Screen ────────────────────────────────────────────────────────────── */

export function RiskCardPreview() {
  return (
    <main className="bg-background relative min-h-dvh">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-10 sm:px-8 sm:py-16">
        <header className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-2xs">
              Design-critique surface — not the product page
            </span>
            <span className="font-display text-sm font-semibold tracking-tight">
              Risk decision card
            </span>
          </div>
          <ThemeToggle />
        </header>

        <RiskDecisionCard />

        <p className="text-muted-foreground text-2xs leading-relaxed">
          All values are real output of{" "}
          <code className="font-mono">shared/s40_contracts.py::fuse()</code> —
          risk {FUSION.riskScore}, band {FUSION.band}, weights renormalised
          over the three detectors that reported.
        </p>
      </div>
    </main>
  )
}

/* ── The card ──────────────────────────────────────────────────────────── */

/**
 * Exported so the landing page's phone frames can embed the REAL card rather
 * than a screenshot of it. That is the entire point of exporting it: a raster
 * mockup silently goes stale the moment this component changes, whereas an
 * embedded render cannot. Keep it self-contained — it must not depend on
 * anything the preview page's wrapper provides.
 */
export function RiskDecisionCard() {
  const reduceMotion = useReducedMotion()

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "glass relative overflow-hidden rounded-3xl",
        // Depth is generous here by intent — this panel must read as the
        // one thing on screen that matters.
        "shadow-xl"
      )}
      style={{ borderColor: "var(--band-medium)" }}
    >
      {/* The single India accent: one hairline along the top edge. Not a
          tricolour band, not decoration — it marks this as an Indian
          payments surface and nothing more. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, var(--accent-india-saffron) 50%, transparent 100%)",
        }}
      />

      {/* Band wash. Subtle, and the only place the band tints the surface. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{
          background:
            "linear-gradient(180deg, var(--band-medium-subtle) 0%, transparent 100%)",
        }}
      />

      <div className="relative flex flex-col gap-9 p-6 sm:p-9">
        <Headline />
        <ScoreBlock />
        <Breakdown />
        <Actions />
      </div>
    </motion.section>
  )
}

function Headline() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <BandChip />
        <span className="text-muted-foreground text-2xs">
          Held before sending · you decide
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {/* Bold by intent. The status is the first thing read, and it must
            land before any number does. */}
        <h1 className="font-display text-4xl leading-tight font-semibold tracking-tighter sm:text-5xl">
          Payment held
        </h1>
        <p className="text-muted-foreground max-w-md text-base leading-relaxed">
          This transfer looks unlike your usual activity. Nothing has been
          sent yet.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <span
          className="font-display text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl"
          style={{ color: "var(--foreground)" }}
        >
          ₹45,000
        </span>
        <span className="text-muted-foreground text-sm">
          to Rohit Verma ·{" "}
          <span style={{ color: "var(--caution-text)" }}>new recipient</span>
        </span>
      </div>
    </div>
  )
}

function BandChip() {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1"
      style={{
        backgroundColor: "var(--band-medium-subtle)",
        // Border carries the vivid tier; text uses the AA-compliant tier.
        border: "1px solid var(--band-medium)",
      }}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: "var(--band-medium)" }}
      />
      <span
        className="text-2xs font-semibold tracking-wide"
        style={{ color: "var(--caution-text)" }}
      >
        MEDIUM RISK
      </span>
    </span>
  )
}

/* ── Gauge ─────────────────────────────────────────────────────────────── */

/**
 * Composite risk gauge — technique #2 from docs/DESIGN_RESEARCH.md.
 *
 * Two concentric rings, because a single ring would lie:
 *
 *   INNER (thick)  risk_score magnitude, arc in --band-medium on a
 *                  --surface-sunken track. The track is a neutral, never a
 *                  tint of the band, so arc and track always contrast.
 *
 *   OUTER (thin)   COVERAGE. The share of configured detector weight that
 *                  actually reported (75%) versus the share that did not
 *                  (25%, rendered in --status-unavailable).
 *
 * The outer ring is the point. `fuse()` renormalises weights over reporting
 * detectors, and the contract is explicit that a missing component "must not
 * be treated as score 0". A confident, complete ring would imply the system
 * saw everything. It did not — voice never ran.
 */
function RiskGauge() {
  const reduceMotion = useReducedMotion()
  const pct = FUSION.riskScore // already 0–100

  return (
    <div className="relative flex size-[188px] shrink-0 items-center justify-center sm:size-[208px]">
      {/*
        NOTE ON THE SWEEP ANIMATION.
        Framer Motion's `pathLength` prop must NOT be used here. It drives the
        same underlying SVG properties as `strokeDasharray`/`pathLength`, and
        it overwrites them: a first pass shipped `pathLength={100}` +
        `strokeDasharray="61.93 38.07"` and Framer rewrote them to
        `pathLength="1"` / `strokeDasharray="0 1"`, rendering a COMPLETE ring.
        On a payment-risk screen that silently reported 62/100 as a full
        gauge. The ratio is now static and only `strokeDashoffset` — a
        property nothing else here touches — carries the sweep.
      */}
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        {/* Outer: full coverage track. What is NOT covered stays visible in
            --status-unavailable, so the gap is a statement, not an absence. */}
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          strokeWidth="3"
          stroke="var(--status-unavailable)"
          strokeLinecap="round"
        />
        {/* Outer: the covered share. Uses --foreground, not
            --muted-foreground: in dark mode muted (L .680) and
            status-unavailable (L .640) are nearly the same lightness, so the
            covered/missing split was invisible — the whole point of the ring. */}
        <motion.circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          strokeWidth="3"
          stroke="var(--foreground)"
          pathLength={100}
          strokeDasharray={`${COVERAGE * 100} ${100 - COVERAGE * 100}`}
          strokeLinecap="round"
          initial={reduceMotion ? false : { strokeDashoffset: COVERAGE * 100 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        />

        {/* Inner: score track */}
        <circle
          cx="50"
          cy="50"
          r="34"
          fill="none"
          strokeWidth="11"
          stroke="var(--surface-sunken)"
        />
        {/* Inner: score arc — 61.93 of 100, with the remainder left open. */}
        <motion.circle
          cx="50"
          cy="50"
          r="34"
          fill="none"
          strokeWidth="11"
          stroke="var(--band-medium)"
          pathLength={100}
          strokeDasharray={`${pct} ${100 - pct}`}
          strokeLinecap="round"
          initial={reduceMotion ? false : { strokeDashoffset: pct }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        />
      </svg>

      {/* Glow is used once, here, on the thing that matters most. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-8 rounded-full glow-caution"
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span
          className="font-display text-4xl leading-none font-semibold tracking-tighter tabular-nums"
          style={{ color: "var(--foreground)" }}
        >
          {Math.round(FUSION.riskScore)}
        </span>
        <span className="text-muted-foreground text-2xs">out of 100</span>
      </div>
    </div>
  )
}

function ScoreBlock() {
  return (
    <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-center sm:gap-9">
      <RiskGauge />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          {/* Sentence case, not uppercase. An uppercase letterspaced kicker is
              on the craft floor's refuse list, and this label is now visible
              on the landing page's phone frames as well as here. */}
          <span className="text-muted-foreground text-2xs tracking-wide">
            Detector coverage
          </span>
          <span className="text-base font-medium">
            3 of 4 detectors reported
          </span>
        </div>

        {/* The missing-is-not-safe statement, stated plainly rather than
            implied by a gap in a chart. */}
        <div
          className="flex items-start gap-3 rounded-xl p-3.5"
          style={{
            backgroundColor: "var(--surface-sunken)",
            border: "1px solid var(--border)",
          }}
        >
          <span
            aria-hidden
            className="mt-1.5 size-2 shrink-0 rounded-full"
            style={{ backgroundColor: "var(--status-unavailable)" }}
          />
          <p className="text-muted-foreground text-xs leading-relaxed">
            Voice analysis did not run — there was no active call. That part of
            the picture is{" "}
            <span style={{ color: "var(--foreground)" }}>unknown, not safe</span>
            . The score was calculated from the detectors that did report.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── Detector breakdown ────────────────────────────────────────────────── */

function Breakdown() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold tracking-tight">
        Why it was held
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {DETECTORS.map((d) => (
          <DetectorCard key={d.key} detector={d} />
        ))}
      </div>
    </div>
  )
}

function DetectorCard({ detector }: { detector: Detector }) {
  const unavailable = detector.status === "unavailable"
  const weight =
    FUSION.effectiveWeights[detector.key as keyof typeof FUSION.effectiveWeights]

  return (
    <div
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl p-4"
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        // An unavailable detector is visually quieter but never hidden —
        // the user should see that something did not run.
        opacity: unavailable ? 0.82 : 1,
      }}
    >
      {/* Identity keel: the detector's own colour, so a signal stays
          recognisable between the gauge, this card, and any later timeline. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{
          backgroundColor: unavailable
            ? "var(--status-unavailable)"
            : `var(${detector.token})`,
        }}
      />

      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{detector.label}</span>
          <span className="text-muted-foreground font-mono text-2xs">
            {detector.version}
            {detector.latencyMs !== null && ` · ${detector.latencyMs}ms`}
          </span>
        </div>

        {unavailable ? (
          <span
            className="text-2xs shrink-0 rounded-full px-2 py-0.5"
            style={{
              color: "var(--foreground)",
              backgroundColor: "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            not scored
          </span>
        ) : (
          <span
            className="text-sm font-semibold tabular-nums"
            style={{ color: "var(--foreground)" }}
          >
            {detector.score?.toFixed(2)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 pl-2">
        {unavailable ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {detector.error} — excluded from the score rather than counted as
            zero.
          </p>
        ) : (
          detector.factors.map((f) => (
            <div key={f.label} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-[7px] size-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    f.direction === "increases"
                      ? "var(--direction-increases)"
                      : "var(--direction-decreases)",
                }}
              />
              <span className="text-muted-foreground text-xs leading-relaxed">
                {f.label}
              </span>
              <span
                className="ml-auto shrink-0 font-mono text-2xs tabular-nums"
                style={{
                  color:
                    f.direction === "increases"
                      ? "var(--threat-text)"
                      : "var(--safe-text)",
                }}
              >
                {f.contribution > 0 ? "+" : ""}
                {f.contribution.toFixed(2)}
              </span>
            </div>
          ))
        )}
      </div>

      {weight !== undefined && (
        <div className="text-muted-foreground pl-2 text-2xs">
          weight {(weight * 100).toFixed(0)}%
        </div>
      )}
    </div>
  )
}

/* ── Actions ───────────────────────────────────────────────────────────── */

/**
 * Two actions, deliberately unequal.
 *
 * Cancelling is the protective outcome, so it is the solid, unmissable
 * primary. Proceeding is still fully available — spec §15 is explicit that
 * S40 must not block legitimate urgent payments — but it is an outline
 * marked in the band colour, so it reads as a decision rather than a
 * default. Confidence here means clarity about consequence, not shouting.
 */
function Actions() {
  const reduceMotion = useReducedMotion()

  const press = reduceMotion ? undefined : { scale: 0.98 }
  const transition = { type: "spring" as const, stiffness: 600, damping: 30 }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <motion.button
          type="button"
          whileTap={press}
          transition={transition}
          className={cn(
            "focus-visible:ring-ring flex-1 rounded-xl px-6 py-3.5 text-base font-semibold",
            "transition-colors duration-fast ease-standard",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          )}
          style={{
            backgroundColor: "var(--foreground)",
            color: "var(--background)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          Cancel payment
        </motion.button>

        <motion.button
          type="button"
          whileTap={press}
          transition={transition}
          className={cn(
            "focus-visible:ring-ring flex-1 rounded-xl px-6 py-3.5 text-base font-medium",
            "transition-colors duration-fast ease-standard",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          )}
          style={{
            color: "var(--caution-text)",
            backgroundColor: "transparent",
            border: "1px solid var(--band-medium)",
          }}
        >
          Confirm payment anyway
        </motion.button>
      </div>

      <p className="text-muted-foreground text-center text-2xs">
        You can report this payment as a scam after cancelling.
      </p>
    </div>
  )
}
