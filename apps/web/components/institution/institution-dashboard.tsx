"use client"

import * as React from "react"
import Link from "next/link"

import { AlertDetails } from "@/components/institution/alert-details"
import {
  DashboardLoading,
  EmptyState,
  ErrorState,
} from "@/components/institution/dashboard-states"
import { FalsePositiveReview } from "@/components/institution/false-positive-review"
import { LiveRiskFeed } from "@/components/institution/live-risk-feed"
import { OverviewStats } from "@/components/institution/overview-stats"
import { loadDashboard } from "@/lib/institution/mock-dashboard"
import type { AlertDetail, DashboardData, ReviewStatus } from "@/lib/institution/types"

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: DashboardData }

/**
 * Tracks which drawer is currently open and from where it was opened.
 * When opened from the FP queue we also record the FP case ID so we can
 * look up the live reviewStatus for display in the drawer.
 */
type DrawerTarget = {
  transactionId: string
  /** Set only when opened from the False-Positive queue. */
  fpCaseId?: string
} | null

export function InstitutionDashboard() {
  const [state, setState] = React.useState<PageState>({ status: "loading" })
  const [drawerTarget, setDrawerTarget] = React.useState<DrawerTarget>(null)

  const fetchData = React.useCallback(
    (opts?: { simulateError?: boolean }) => {
      setState({ status: "loading" })
      loadDashboard(opts)
        .then((data) => setState({ status: "ready", data }))
        .catch((err: Error) => setState({ status: "error", message: err.message }))
    },
    []
  )

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  // Derive the alert to show in the drawer from the current drawer target.
  const alertDetail: AlertDetail | null =
    state.status === "ready" && drawerTarget
      ? state.data.alerts[drawerTarget.transactionId] ?? null
      : null

  // When the drawer was opened from the FP queue, look up the live reviewStatus
  // from the (possibly mutated) falsePositives list so it stays in sync with
  // Mark-Legitimate / Escalate actions taken in the same session.
  const drawerReviewStatus: ReviewStatus | null =
    state.status === "ready" && drawerTarget?.fpCaseId
      ? (state.data.falsePositives.find((c) => c.id === drawerTarget.fpCaseId)?.reviewStatus ?? null)
      : null

  const handleMarkLegitimate = (caseId: string) => {
    if (state.status !== "ready") return
    setState({
      ...state,
      data: {
        ...state.data,
        falsePositives: state.data.falsePositives.map((c) =>
          c.id === caseId ? { ...c, reviewStatus: "resolved_legitimate" as const } : c
        ),
      },
    })
  }

  const handleEscalate = (caseId: string) => {
    if (state.status !== "ready") return
    setState({
      ...state,
      data: {
        ...state.data,
        falsePositives: state.data.falsePositives.map((c) =>
          c.id === caseId ? { ...c, reviewStatus: "escalated" as const } : c
        ),
      },
    })
  }

  /** Open drawer from the Live Risk Feed — no FP case context. */
  const handleFeedSelect = (transactionId: string) => {
    setDrawerTarget({ transactionId })
  }

  /** Open drawer from the FP queue — includes the FP case for reviewStatus lookup. */
  const handleFpOpenDetail = (transactionId: string, fpCaseId: string) => {
    setDrawerTarget({ transactionId, fpCaseId })
  }

  return (
    <main className="product-page">
      <div className="product-shell-wide">
        {/* Header */}
        <header className="product-header">
          <Link href="/" className="flex flex-col gap-0.5">
            <span className="font-display text-sm font-semibold tracking-tight text-foreground">AVARAN</span>
            <span className="text-muted-foreground text-2xs">Institution Security Console</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-2xs text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--safe)" }} />
              <span>4 detectors active</span>
            </div>
            {state.status === "ready" && (
              <button
                type="button"
                onClick={() => fetchData({ simulateError: true })}
                className="text-muted-foreground rounded-md px-2.5 py-1 text-2xs transition-colors duration-fast ease-standard hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                style={{ border: "1px solid var(--border)" }}
                title="Simulate network error"
              >
                Simulate error
              </button>
            )}
          </div>
        </header>

        {state.status === "loading" && <DashboardLoading />}
        {state.status === "error" && <ErrorState message={state.message} onRetry={() => fetchData()} />}

        {state.status === "ready" && (
          <>
            {state.data.feed.length === 0 ? (
              <EmptyState title="No transactions" body="No telemetry data available for the current filter." />
            ) : (
              <div className="flex flex-col gap-6">
                {/* Section: Overview Metrics */}
                <section className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <h1 className="product-section-title">24-Hour Interception Overview</h1>
                    <span className="text-muted-foreground text-2xs">Real-time telemetry</span>
                  </div>
                  <OverviewStats stats={state.data.overview} />
                </section>

                {/* Section: Live Risk Feed */}
                <section className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <h2 className="product-section-title">Live risk feed</h2>
                      <p className="text-muted-foreground text-xs">Select any transaction row to inspect ML detector activations and signal vectors.</p>
                    </div>
                  </div>
                  <LiveRiskFeed transactions={state.data.feed} onSelect={handleFeedSelect} />
                </section>

                {/* Section: False Positive Review */}
                <section className="flex flex-col gap-2.5">
                  <div className="flex flex-col gap-0.5">
                    <h2 className="product-section-title">Override & False-Positive Queue</h2>
                    <p className="text-muted-foreground text-xs">
                      Flagged high-risk transfers authorized by customer overrides requiring manual analyst review.
                    </p>
                  </div>
                  <FalsePositiveReview
                    cases={state.data.falsePositives}
                    onMarkLegitimate={handleMarkLegitimate}
                    onEscalate={handleEscalate}
                    onOpenDetail={handleFpOpenDetail}
                  />
                </section>
              </div>
            )}

            <AlertDetails
              alert={alertDetail}
              reviewStatus={drawerReviewStatus}
              onClose={() => setDrawerTarget(null)}
            />
          </>
        )}
      </div>
    </main>
  )
}
