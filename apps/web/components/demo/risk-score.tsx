"use client"

import { motion, useReducedMotion } from "framer-motion"

import type { RiskLevel, RiskResult } from "@/lib/demo/types"

const BAND_TOKEN: Record<RiskLevel, string> = {
  LOW: "--band-low",
  MEDIUM: "--band-medium",
  HIGH: "--band-high",
}

const BAND_SUBTLE_TOKEN: Record<RiskLevel, string> = {
  LOW: "--band-low-subtle",
  MEDIUM: "--band-medium-subtle",
  HIGH: "--band-high-subtle",
}

const BAND_TEXT_TOKEN: Record<RiskLevel, string> = {
  LOW: "--safe-text",
  MEDIUM: "--caution-text",
  HIGH: "--threat-text",
}

/**
 * The risk gauge, adapted from the design-system's `RiskGauge`
 * (app/design-system/risk-card-preview) to run off a live `RiskResult`
 * rather than a fixed mock, and to render any of the three bands rather
 * than assuming MEDIUM.
 */
export function RiskScore({ result }: { result: RiskResult }) {
  const reduceMotion = useReducedMotion()
  const pct = result.riskScore
  const reported = result.detectors.filter((d) => d.status === "ok").length
  const total = result.detectors.length
  const coverage = reported / total
  const bandToken = BAND_TOKEN[result.riskLevel]

  return (
    <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-center sm:gap-9">
      <div className="relative flex size-[188px] shrink-0 items-center justify-center sm:size-[208px]">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r="46" fill="none" strokeWidth="3" stroke="var(--status-unavailable)" strokeLinecap="round" />
          <motion.circle
            cx="50" cy="50" r="46" fill="none" strokeWidth="3" stroke="var(--foreground)"
            pathLength={100}
            strokeDasharray={`${coverage * 100} ${100 - coverage * 100}`}
            strokeLinecap="round"
            initial={reduceMotion ? false : { strokeDashoffset: coverage * 100 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          />
          <circle cx="50" cy="50" r="34" fill="none" strokeWidth="11" stroke="var(--surface-sunken)" />
          <motion.circle
            cx="50" cy="50" r="34" fill="none" strokeWidth="11" stroke={`var(${bandToken})`}
            pathLength={100}
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeLinecap="round"
            initial={reduceMotion ? false : { strokeDashoffset: pct }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="font-display text-4xl leading-none font-semibold tracking-tighter tabular-nums">
            {Math.round(pct)}
          </span>
          <span className="text-muted-foreground text-2xs">out of 100</span>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span
            className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
            style={{
              backgroundColor: `var(${BAND_SUBTLE_TOKEN[result.riskLevel]})`,
              border: `1px solid var(${bandToken})`,
            }}
          >
            <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: `var(${bandToken})` }} />
            <span className="text-2xs font-semibold tracking-wide" style={{ color: `var(${BAND_TEXT_TOKEN[result.riskLevel]})` }}>
              {result.riskLevel} RISK
            </span>
          </span>
          <span className="text-base font-medium">
            {reported} of {total} detectors reported
          </span>
        </div>

        {reported < total && (
          <div
            className="flex items-start gap-3 rounded-xl p-3.5"
            style={{ backgroundColor: "var(--surface-sunken)", border: "1px solid var(--border)" }}
          >
            <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: "var(--status-unavailable)" }} />
            <p className="text-muted-foreground text-xs leading-relaxed">
              {result.detectors.find((d) => d.status === "unavailable")?.note ?? "One signal"} — excluded and{" "}
              <span style={{ color: "var(--foreground)" }}>not counted as safe</span>. The score comes only from
              detectors that reported.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
