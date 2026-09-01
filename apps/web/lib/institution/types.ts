/**
 * Types for the /institution dashboard.
 *
 * `RiskResult`/`RiskLevel`/`DetectorResult` are imported from
 * `lib/demo/types.ts` rather than redefined — an institution alert and a
 * user-facing held payment describe the same fused risk output, and giving
 * them a second parallel shape would let the two drift apart for no reason.
 * The institution-specific pieces (feed rows, review workflow) are new
 * types layered on top of that shared vocabulary.
 */

import type { RiskLevel, RiskResult } from "@/lib/demo/types"

export type TransactionStatus =
  | "allowed"
  | "held"
  | "confirmed"
  | "cancelled"
  | "reported"

export interface FeedTransaction {
  id: string
  amount: number
  recipientName: string
  recipientHandle: string
  riskScore: number
  riskLevel: RiskLevel
  timestamp: string
  status: TransactionStatus
}

export type UserAction = "none" | "confirmed" | "cancelled" | "reported"

export interface AlertDetail {
  transaction: FeedTransaction
  /** The full fused result — feeds RiskScore/RiskReasons/RiskContributions
   *  directly, the same components the /demo flow uses. */
  result: RiskResult
  signals: {
    device: string
    behaviour: string
    recipient: string
  }
  userAction: UserAction
}

export type ReviewStatus = "open" | "escalated" | "resolved_legitimate"

export interface FalsePositiveCase {
  id: string
  transaction: FeedTransaction
  result: RiskResult
  flaggedAt: string
  reviewStatus: ReviewStatus
}

export interface OverviewStats {
  totalTransactions: number
  suspiciousTransactions: number
  highRiskTransactions: number
  blockedOrReported: number
}

export interface DashboardData {
  overview: OverviewStats
  feed: FeedTransaction[]
  alerts: Record<string, AlertDetail>
  falsePositives: FalsePositiveCase[]
}
