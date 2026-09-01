"use client"

import { motion, useReducedMotion } from "framer-motion"

import type { OverviewStats as OverviewStatsData } from "@/lib/institution/types"

const EASE_OUT = [0.16, 1, 0.3, 1] as const

function StatBlock({
  label,
  value,
  token,
  delay,
}: {
  label: string
  value: number
  token: string
  delay: number
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT, delay }}
      className="flex flex-col gap-1 p-3.5 sm:p-4"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: `var(${token})` }} />
        <span className="text-muted-foreground text-2xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <span className="font-display text-2xl font-semibold tracking-tight tabular-nums text-foreground sm:text-3xl">
        {value.toLocaleString("en-IN")}
      </span>
    </motion.div>
  )
}

/**
 * Compact horizontal stat bar for fraud analysts — dense, clean, and operational.
 */
export function OverviewStats({ stats }: { stats: OverviewStatsData }) {
  return (
    <div className="product-surface grid grid-cols-2 divide-y divide-x sm:grid-cols-4 sm:divide-y-0 divide-border/40">
      <StatBlock label="Total Transacted" value={stats.totalTransactions} token="--foreground" delay={0} />
      <StatBlock label="Suspicious Intercepts" value={stats.suspiciousTransactions} token="--band-medium" delay={0.04} />
      <StatBlock label="High Risk Escalations" value={stats.highRiskTransactions} token="--band-high" delay={0.08} />
      <StatBlock label="Blocked / Reported" value={stats.blockedOrReported} token="--threat" delay={0.12} />
    </div>
  )
}
