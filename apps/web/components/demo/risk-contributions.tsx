"use client"

import type { DetectorResult } from "@/lib/demo/types"

const TOKEN: Record<DetectorResult["key"], string> = {
  transaction: "--detector-transaction",
  behaviour: "--detector-behaviour",
  device: "--detector-device",
  voice: "--detector-voice",
}

/**
 * Per-detector breakdown: score, factors, and share of the fused score —
 * adapted from the design-system's `Breakdown`/`DetectorCard`
 * (app/design-system/risk-card-preview) to take detectors + contribution
 * percentages as props instead of reading a fixed mock.
 */
export function RiskContributions({
  detectors,
  contributionsPct,
  title = "Signal breakdown",
}: {
  detectors: DetectorResult[]
  contributionsPct: Record<string, number>
  /** Overridable so other risk surfaces (e.g. the voice-call dashboard) can
   *  use this exact component with wording that fits their context. */
  title?: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {detectors.map((d) => (
          // `label`, not `key` — `key` identifies which detector CATEGORY
          // this is (shared on purpose when several signals come from the
          // same channel, e.g. the voice dashboard's six social-engineering
          // signals all carry key:"voice"), while `label` is what's unique
          // per card here.
          <DetectorCard key={d.label} detector={d} contributionPct={contributionsPct[d.label]} />
        ))}
      </div>
    </div>
  )
}

function DetectorCard({
  detector,
  contributionPct,
}: {
  detector: DetectorResult
  contributionPct?: number
}) {
  const unavailable = detector.status === "unavailable"

  return (
    <div
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl p-4"
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        opacity: unavailable ? 0.82 : 1,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{
          backgroundColor: unavailable ? "var(--status-unavailable)" : `var(${TOKEN[detector.key]})`,
        }}
      />

      <div className="flex items-start justify-between gap-3 pl-2">
        <span className="text-sm font-semibold">{detector.label}</span>
        {unavailable ? (
          <span
            className="text-2xs shrink-0 rounded-full px-2 py-0.5"
            style={{ color: "var(--foreground)", backgroundColor: "var(--muted)", border: "1px solid var(--border)" }}
          >
            not scored
          </span>
        ) : (
          <span className="text-sm font-semibold tabular-nums">{detector.score?.toFixed(2)}</span>
        )}
      </div>

      <div className="flex flex-col gap-2 pl-2">
        {unavailable ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {detector.note} — excluded from the score rather than counted as zero.
          </p>
        ) : (
          detector.factors.map((f) => (
            <div key={f.label} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-[7px] size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: f.direction === "increases" ? "var(--direction-increases)" : "var(--direction-decreases)" }}
              />
              <span className="text-muted-foreground text-xs leading-relaxed">{f.label}</span>
              <span
                className="ml-auto shrink-0 font-mono text-2xs tabular-nums"
                style={{ color: f.direction === "increases" ? "var(--threat-text)" : "var(--safe-text)" }}
              >
                {f.contribution > 0 ? "+" : ""}
                {f.contribution.toFixed(2)}
              </span>
            </div>
          ))
        )}
      </div>

      {!unavailable && contributionPct !== undefined && (
        <div className="text-muted-foreground pl-2 text-2xs">
          {contributionPct.toFixed(0)}% of the fused score
        </div>
      )}
    </div>
  )
}
