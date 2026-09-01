"use client"

import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import { RiskContributions } from "@/components/demo/risk-contributions"
import { RiskReasons } from "@/components/demo/risk-reasons"
import { RiskScore } from "@/components/demo/risk-score"
import type { RiskLevel } from "@/lib/demo/types"
import type { AlertDetail, ReviewStatus } from "@/lib/institution/types"

const EASE_OUT = [0.16, 1, 0.3, 1] as const

const BAND_TOKEN: Record<RiskLevel, string> = {
  LOW: "--band-low",
  MEDIUM: "--band-medium",
  HIGH: "--band-high",
}

const USER_ACTION_LABEL: Record<AlertDetail["userAction"], string> = {
  none: "No response yet",
  confirmed: "User confirmed the payment anyway",
  cancelled: "User cancelled the payment",
  reported: "User reported the payment as suspicious",
}

const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  open: "Open — pending analyst review",
  escalated: "Escalated — referred to senior analyst",
  resolved_legitimate: "Resolved · legitimate — marked by analyst",
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="max-w-[65%] text-right text-xs font-medium">{value}</span>
    </div>
  )
}

/**
 * Full alert view: transaction record, fused score, reasons, per-signal
 * breakdown, device/behaviour/recipient detail, and how the user responded.
 * Reuses RiskScore/RiskReasons/RiskContributions from components/demo — the
 * same components the held-payment flow renders — rather than a parallel
 * set of institution-only score widgets.
 *
 * `reviewStatus` is optional: supplied when the drawer is opened from the
 * False-Positive queue so the analyst can see the current review decision
 * alongside the transaction data.
 */
export function AlertDetails({
  alert,
  reviewStatus,
  onClose,
}: {
  alert: AlertDetail | null
  reviewStatus?: ReviewStatus | null
  onClose: () => void
}) {
  const reduceMotion = useReducedMotion()

  React.useEffect(() => {
    if (!alert) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [alert, onClose])

  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          className="z-modal fixed inset-0 flex justify-end"
          style={{ backgroundColor: "oklch(0 0 0 / 0.5)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          {/* Investigation drawer — slides in from the right rather than a
              centered dialog, so it reads as "opening a case file beside
              the feed" rather than a generic modal interrupting the page. */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Alert ${alert.transaction.id}`}
            onClick={(e) => e.stopPropagation()}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 32 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="relative flex h-full w-full max-w-xl flex-col overflow-hidden sm:border-l"
            style={{
              backgroundColor: "var(--surface)",
              borderLeft: "1px solid var(--border)",
              borderTop: `2px solid var(${BAND_TOKEN[alert.result.riskLevel]})`,
              boxShadow: "var(--shadow-xl)",
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b px-6 py-4 sm:px-9" style={{ borderColor: "var(--border)" }}>
              <span className="product-section-title">Investigation — case detail</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="focus-visible:ring-ring flex size-8 items-center justify-center rounded-full transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:outline-none"
                style={{ backgroundColor: "var(--surface-sunken)", border: "1px solid var(--border)" }}
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none">
                  <path d="M6 6L18 18M18 6L6 18" stroke="var(--foreground)" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-8 overflow-y-auto p-6 sm:p-9">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground font-mono text-2xs">{alert.transaction.id}</span>
                <h2 className="font-display text-2xl font-semibold tracking-tight">
                  ₹{alert.transaction.amount.toLocaleString("en-IN")} to {alert.transaction.recipientName}
                </h2>
              </div>

              <div
                className="flex flex-col gap-0 rounded-xl px-4"
                style={{ backgroundColor: "var(--surface-sunken)", border: "1px solid var(--border)" }}
              >
                <Row label="Recipient handle" value={alert.transaction.recipientHandle} />
                <Row label="Status" value={alert.transaction.status} />
                <Row label="Timestamp" value={new Date(alert.transaction.timestamp).toLocaleString("en-IN")} />
                {reviewStatus != null && (
                  <Row label="Review status" value={REVIEW_STATUS_LABEL[reviewStatus]} />
                )}
              </div>

              <RiskScore result={alert.result} />
              <RiskReasons reasons={alert.result.reasons} level={alert.result.riskLevel} />
              <RiskContributions detectors={alert.result.detectors} contributionsPct={alert.result.contributionsPct} />

              <div className="flex flex-col gap-3">
                <h3 className="font-display text-lg font-semibold tracking-tight">Signal detail</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Device", value: alert.signals.device },
                    { label: "Behaviour", value: alert.signals.behaviour },
                    { label: "Recipient", value: alert.signals.recipient },
                  ].map((s) => (
                    <div key={s.label} className="flex flex-col gap-1.5 rounded-xl p-3.5" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
                      <span className="text-muted-foreground text-2xs tracking-wide">{s.label.toUpperCase()}</span>
                      <span className="text-xs leading-relaxed">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="flex items-center gap-3 rounded-xl p-3.5"
                style={{ backgroundColor: "var(--surface-sunken)", border: "1px solid var(--border)" }}
              >
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: alert.userAction === "none" ? "var(--status-unavailable)" : "var(--info)" }} />
                <span className="text-xs font-medium">{USER_ACTION_LABEL[alert.userAction]}</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
