"use client"

import { motion, useReducedMotion } from "framer-motion"

import type { RiskLevel } from "@/lib/demo/types"

const BAND_TOKEN: Record<RiskLevel, string> = {
  LOW: "--band-low",
  MEDIUM: "--band-medium",
  HIGH: "--band-high",
}

/** Plain-language explanation bullets — the "why", stated in words a
 *  non-technical user can act on, not a dump of feature names. */
export function RiskReasons({
  reasons,
  level,
  title = "Why it was held",
}: {
  reasons: string[]
  level: RiskLevel
  /** Overridable so other risk surfaces (e.g. the voice-call dashboard) can
   *  use this exact component with wording that fits their context. */
  title?: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <ul className="flex flex-col gap-2.5">
        {reasons.map((reason, i) => (
          <motion.li
            key={reason}
            initial={reduceMotion ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: 0.05 * i }}
            className="flex items-start gap-3"
          >
            <span
              aria-hidden
              className="mt-1.5 size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: `var(${BAND_TOKEN[level]})` }}
            />
            <span className="text-sm leading-relaxed">{reason}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  )
}
