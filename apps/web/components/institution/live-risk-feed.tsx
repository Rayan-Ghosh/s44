"use client"

import type { RiskLevel } from "@/lib/demo/types"
import type { FeedTransaction, TransactionStatus } from "@/lib/institution/types"
import { EmptyState } from "@/components/institution/dashboard-states"

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

const STATUS_LABEL: Record<TransactionStatus, string> = {
  allowed: "Allowed",
  held: "Held",
  confirmed: "Confirmed by user",
  cancelled: "Cancelled",
  reported: "Reported",
}

const STATUS_TOKEN: Record<TransactionStatus, string> = {
  allowed: "--safe-text",
  held: "--info-text",
  confirmed: "--caution-text",
  cancelled: "--muted-foreground",
  reported: "--threat-text",
}

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  return `${Math.round(mins / 60)}h ago`
}

function BandChip({ level }: { level: RiskLevel }) {
  return (
    <span
      className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5"
      style={{ backgroundColor: `var(${BAND_SUBTLE_TOKEN[level]})`, border: `1px solid var(${BAND_TOKEN[level]})` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: `var(${BAND_TOKEN[level]})` }} />
      <span className="text-2xs font-semibold tracking-wide" style={{ color: `var(${BAND_TEXT_TOKEN[level]})` }}>
        {level}
      </span>
    </span>
  )
}

/**
 * Realistic, high-density operations feed for fraud analysts.
 */
export function LiveRiskFeed({
  transactions,
  onSelect,
}: {
  transactions: FeedTransaction[]
  onSelect: (id: string) => void
}) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        title="No transactions in range"
        body="Nothing has come through the risk feed for the current filter."
      />
    )
  }

  return (
    <>
      {/* Desktop / tablet operations table — overflow-x-auto (not
          overflow-hidden) so a viewport narrower than the table scrolls
          horizontally instead of clipping the rightmost columns. */}
      <div className="product-surface hidden lg:block">
        <div className="overflow-x-auto rounded-[inherit]">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-xs">
          <colgroup>
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[25%]" />
            <col className="w-[12%]" />
            <col className="w-[13%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: "var(--surface-sunken)", borderBottom: "1px solid var(--border)" }}>
              {["Transaction ID", "Amount", "Recipient", "Risk Score", "Risk Band", "Timestamp", "State"].map((h) => (
                <th key={h} className="text-muted-foreground px-4 py-3 text-2xs font-semibold uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {transactions.map((t) => (
              <tr
                key={t.id}
                onClick={() => onSelect(t.id)}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(t.id)}
                className="cursor-pointer transition-colors duration-fast ease-standard hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <td className="px-4 py-3 font-mono text-2xs text-muted-foreground whitespace-nowrap">{t.id}</td>
                <td className="px-4 py-3 font-medium tabular-nums text-foreground whitespace-nowrap">
                  ₹{t.amount.toLocaleString("en-IN")}
                </td>
                <td className="text-foreground px-4 py-3 font-medium">{t.recipientName}</td>
                <td className="px-4 py-3 font-semibold tabular-nums text-foreground">{t.riskScore}</td>
                <td className="px-4 py-3">
                  <BandChip level={t.riskLevel} />
                </td>
                <td className="text-muted-foreground px-4 py-3 text-2xs whitespace-nowrap">{timeAgo(t.timestamp)}</td>
                <td className="px-4 py-3 text-xs font-medium whitespace-nowrap" style={{ color: `var(${STATUS_TOKEN[t.status]})` }}>
                  {STATUS_LABEL[t.status]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="flex flex-col gap-2.5 lg:hidden">
        {transactions.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className="product-surface flex flex-col gap-2 p-4 text-left transition-colors duration-fast ease-standard active:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-2xs text-muted-foreground">{t.id}</span>
              <BandChip level={t.riskLevel} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold tabular-nums text-foreground">₹{t.amount.toLocaleString("en-IN")}</span>
              <span className="text-xs font-semibold tabular-nums text-foreground">Score: {t.riskScore}</span>
            </div>
            <div className="text-muted-foreground flex items-center justify-between gap-2 text-2xs">
              <span>{t.recipientName}</span>
              <span>{timeAgo(t.timestamp)}</span>
            </div>
            <span className="text-2xs font-medium" style={{ color: `var(${STATUS_TOKEN[t.status]})` }}>
              {STATUS_LABEL[t.status]}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
