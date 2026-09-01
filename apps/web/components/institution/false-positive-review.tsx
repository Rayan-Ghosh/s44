"use client"

import * as React from "react"

import { EmptyState } from "@/components/institution/dashboard-states"
import type { RiskLevel } from "@/lib/demo/types"
import type { FalsePositiveCase, ReviewStatus } from "@/lib/institution/types"
import { cn } from "@/lib/utils"

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

const STATUS_META: Record<ReviewStatus, { label: string; token: string; subtleToken: string }> = {
  open: { label: "Open Review", token: "--info", subtleToken: "--info-subtle" },
  escalated: { label: "Escalated", token: "--threat", subtleToken: "--threat-subtle" },
  resolved_legitimate: { label: "Resolved · Legitimate", token: "--safe", subtleToken: "--safe-subtle" },
}

const FILTERS: { key: "all" | ReviewStatus; label: string }[] = [
  { key: "all", label: "All Items" },
  { key: "open", label: "Pending Review" },
  { key: "escalated", label: "Escalations" },
  { key: "resolved_legitimate", label: "Resolved" },
]

export function FalsePositiveReview({
  cases,
  onMarkLegitimate,
  onEscalate,
  onOpenDetail,
}: {
  cases: FalsePositiveCase[]
  onMarkLegitimate: (id: string) => void
  onEscalate: (id: string) => void
  /** Open the investigation drawer for the transaction linked to this FP case. */
  onOpenDetail: (transactionId: string, caseId: string) => void
}) {
  const [filter, setFilter] = React.useState<"all" | ReviewStatus>("all")

  const filtered = filter === "all" ? cases : cases.filter((c) => c.reviewStatus === filter)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-lg px-3 py-1 text-xs font-medium transition-colors duration-fast ease-standard focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            )}
            style={{
              backgroundColor: filter === f.key ? "var(--foreground)" : "var(--surface)",
              color: filter === f.key ? "var(--background)" : "var(--muted-foreground)",
              border: "1px solid var(--border)",
            }}
            aria-pressed={filter === f.key}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="check"
          title="Queue clear"
          body={
            filter === "all"
              ? "No transactions have been marked legitimate after an intervention yet."
              : `No queue items with status "${STATUS_META[filter as ReviewStatus].label}".`
          }
        />
      ) : (
        <div className="product-surface divide-y divide-border/30 overflow-hidden">
          {filtered.map((c) => {
            const meta = STATUS_META[c.reviewStatus]
            const level = c.result.riskLevel
            return (
              <div
                key={c.id}
                className="flex flex-col gap-3 p-4 transition-colors duration-fast sm:flex-row sm:items-center sm:justify-between hover:bg-muted/20 cursor-pointer"
                onClick={() => onOpenDetail(c.transaction.id, c.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onOpenDetail(c.transaction.id, c.id)
                  }
                }}
                aria-label={`Open investigation detail for ${c.transaction.id}`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-2xs text-muted-foreground">{c.transaction.id}</span>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                      style={{ backgroundColor: `var(${BAND_SUBTLE_TOKEN[level]})`, border: `1px solid var(${BAND_TOKEN[level]})` }}
                    >
                      <span className="text-2xs font-semibold" style={{ color: `var(${BAND_TEXT_TOKEN[level]})` }}>
                        {level} · Score {c.result.riskScore}
                      </span>
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-2xs font-medium"
                      style={{ backgroundColor: `var(${meta.subtleToken})`, color: `var(${meta.token})` }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-foreground">
                    ₹{c.transaction.amount.toLocaleString("en-IN")} transferred to {c.transaction.recipientName}
                  </span>
                  <span className="text-muted-foreground text-2xs">
                    Confirmed by customer at {new Date(c.flaggedAt).toLocaleString("en-IN")}
                  </span>
                </div>

                {c.reviewStatus !== "resolved_legitimate" && (
                  <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onMarkLegitimate(c.id)}
                      className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-fast ease-standard focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                      style={{ backgroundColor: "var(--safe-subtle)", color: "var(--safe-text)", border: "1px solid var(--safe)" }}
                    >
                      Mark Legitimate
                    </button>
                    <button
                      type="button"
                      onClick={() => onEscalate(c.id)}
                      disabled={c.reviewStatus === "escalated"}
                      className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-fast ease-standard focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                      style={{ backgroundColor: "var(--threat-subtle)", color: "var(--threat-text)", border: "1px solid var(--threat)" }}
                    >
                      {c.reviewStatus === "escalated" ? "Escalated" : "Escalate"}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
