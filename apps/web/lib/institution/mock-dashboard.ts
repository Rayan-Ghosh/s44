/**
 * MOCK DATA — the one place /institution's dashboard data lives.
 *
 * No component under components/institution/* hardcodes a count, a
 * transaction, a score, or a review status. Everything comes from
 * `loadDashboard()` here, which stands in for a future set of institution
 * API endpoints (GET /api/v1/alerts, plus the not-yet-built transaction
 * list / false-positive queue — see apps/api/app/api/routers/alerts.py,
 * which today is read-only with no review-workflow endpoints).
 *
 * TO REPLACE WITH THE REAL API:
 *   1. Delete FEED / ALERTS / FALSE_POSITIVES and the artificial delay.
 *   2. Point `loadDashboard` at GET /api/v1/alerts (+ a transactions list
 *      endpoint once one exists) and map the response onto DashboardData.
 *   3. `markLegitimate` / `escalate` become POST /api/v1/alerts/{id}/review
 *      calls instead of local state mutation (see components/institution/
 *      institution-dashboard.tsx, which already isolates those two calls
 *      behind a single interface for exactly this reason).
 */

import type { DetectorResult, RiskResult } from "@/lib/demo/types"
import type {
  AlertDetail,
  DashboardData,
  FalsePositiveCase,
  FeedTransaction,
  OverviewStats,
  TransactionStatus,
} from "./types"

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

/* ── shared detector/result builder ───────────────────────────────────── */

function detector(
  key: DetectorResult["key"],
  label: string,
  score: number | null,
  factorLabel: string,
  contribution: number
): DetectorResult {
  if (score === null) {
    return { key, label, score: null, status: "unavailable", note: "no active call", factors: [] }
  }
  return {
    key,
    label,
    score,
    status: "ok",
    factors: [
      {
        label: factorLabel,
        contribution,
        direction: contribution >= 0 ? "increases" : "decreases",
      },
    ],
  }
}

function contributionsFrom(detectors: DetectorResult[]): Record<string, number> {
  const weights: Record<string, number> = { transaction: 0.35, behaviour: 0.25, device: 0.2, voice: 0.2 }
  const reporting = detectors.filter((d) => d.status === "ok" && d.score !== null)
  const raw = reporting.map((d) => ({ label: d.label, value: Math.max(0.01, (d.score as number) * weights[d.key]) }))
  const total = raw.reduce((s, r) => s + r.value, 0)
  return Object.fromEntries(raw.map((r) => [r.label, Math.round((r.value / total) * 1000) / 10]))
}

function result(
  riskScore: number,
  reasons: string[],
  detectors: DetectorResult[]
): RiskResult {
  const riskLevel = riskScore <= 30 ? "LOW" : riskScore <= 60 ? "MEDIUM" : "HIGH"
  const decision = riskLevel === "LOW" ? "ALLOW" : riskLevel === "MEDIUM" ? "WARN" : "CONFIRM_OR_CANCEL"
  return { riskScore, riskLevel, decision, detectors, reasons, contributionsPct: contributionsFrom(detectors) }
}

/* ── the live feed ─────────────────────────────────────────────────────── */

const FEED: FeedTransaction[] = [
  { id: "TXN-8231", amount: 2400, recipientName: "Rohit Verma", recipientHandle: "rohit.verma@okhdfc", riskScore: 8, riskLevel: "LOW", timestamp: minutesAgo(2), status: "allowed" },
  { id: "TXN-8230", amount: 45000, recipientName: "Ananya Rao", recipientHandle: "ananya.rao@oksbi", riskScore: 58, riskLevel: "MEDIUM", timestamp: minutesAgo(4), status: "confirmed" },
  { id: "TXN-8229", amount: 92500, recipientName: "Unknown Merchant", recipientHandle: "9821xxxxxx@paytm", riskScore: 84, riskLevel: "HIGH", timestamp: minutesAgo(9), status: "reported" },
  { id: "TXN-8228", amount: 1200, recipientName: "Priya Nair", recipientHandle: "priya.nair@okicici", riskScore: 5, riskLevel: "LOW", timestamp: minutesAgo(11), status: "allowed" },
  { id: "TXN-8227", amount: 61000, recipientName: "Sanjay Gupta", recipientHandle: "sanjay.g@okaxis", riskScore: 71, riskLevel: "HIGH", timestamp: minutesAgo(14), status: "cancelled" },
  { id: "TXN-8226", amount: 15600, recipientName: "Meera Iyer", recipientHandle: "meera.iyer@okhdfc", riskScore: 34, riskLevel: "MEDIUM", timestamp: minutesAgo(18), status: "confirmed" },
  { id: "TXN-8225", amount: 3200, recipientName: "Karan Singh", recipientHandle: "karan.s@oksbi", riskScore: 12, riskLevel: "LOW", timestamp: minutesAgo(21), status: "allowed" },
  { id: "TXN-8224", amount: 78000, recipientName: "Fresh Traders Co.", recipientHandle: "8891xxxxxx@ybl", riskScore: 79, riskLevel: "HIGH", timestamp: minutesAgo(27), status: "reported" },
  { id: "TXN-8223", amount: 22000, recipientName: "Divya Menon", recipientHandle: "divya.m@okicici", riskScore: 46, riskLevel: "MEDIUM", timestamp: minutesAgo(33), status: "confirmed" },
  { id: "TXN-8222", amount: 900, recipientName: "Arjun Nambiar", recipientHandle: "arjun.n@okaxis", riskScore: 4, riskLevel: "LOW", timestamp: minutesAgo(38), status: "allowed" },
  { id: "TXN-8221", amount: 51000, recipientName: "Ritika Shah", recipientHandle: "ritika.s@okhdfc", riskScore: 63, riskLevel: "HIGH", timestamp: minutesAgo(45), status: "confirmed" },
  { id: "TXN-8220", amount: 5400, recipientName: "Vikram Desai", recipientHandle: "vikram.d@oksbi", riskScore: 17, riskLevel: "LOW", timestamp: minutesAgo(52), status: "allowed" },
  { id: "TXN-8219", amount: 33000, recipientName: "Neha Kapoor", recipientHandle: "neha.k@okicici", riskScore: 55, riskLevel: "MEDIUM", timestamp: minutesAgo(58), status: "held" },
  { id: "TXN-8218", amount: 110000, recipientName: "Unknown Merchant", recipientHandle: "7712xxxxxx@ybl", riskScore: 91, riskLevel: "HIGH", timestamp: minutesAgo(64), status: "reported" },
]

/* ── full alert detail, for the rows a reviewer would actually open ─────── */

const ALERTS: Record<string, AlertDetail> = {
  "TXN-8231": {
    transaction: FEED[0],
    result: result(
      8,
      ["All signals within normal baseline for this account."],
      [
        detector("transaction", "Transaction", 0.09, "Amount within usual range", -0.18),
        detector("behaviour", "Behaviour", 0.06, "Sent within normal hours", -0.12),
        detector("device", "Device", 0.07, "Known trusted device", -0.1),
        detector("voice", "Voice & call", null, "", 0),
      ]
    ),
    signals: {
      device: "Recognised device — same handset used in last 12 payments.",
      behaviour: "Sent within this user's normal active window.",
      recipient: "rohit.verma@okhdfc — paid 8 times before.",
    },
    userAction: "none",
  },
  "TXN-8230": {
    transaction: FEED[1],
    result: result(
      58,
      ["First payment to this recipient.", "Amount is noticeably higher than your recent average."],
      [
        detector("transaction", "Transaction", 0.62, "Amount is well above usual transfer", 0.42),
        detector("behaviour", "Behaviour", 0.4, "Sent outside normal hours", 0.28),
        detector("device", "Device", 0.35, "Handset matches usual device", -0.22),
        detector("voice", "Voice & call", null, "", 0),
      ]
    ),
    signals: {
      device: "OnePlus 11 · Android — recognised, last seen 2 days ago.",
      behaviour: "Sent at 22:40, ~3h outside this user's typical window.",
      recipient: "First transfer to ananya.rao@oksbi.",
    },
    userAction: "confirmed",
  },
  "TXN-8229": {
    transaction: FEED[2],
    result: result(
      84,
      [
        "Payment initiated from an unrecognised device.",
        "Recipient account has never been used before.",
        "Location is 1,740km from where the user usually pays.",
        "Amount is far above the user's usual transfer size.",
      ],
      [
        detector("transaction", "Transaction", 0.81, "Amount is well above usual transfer", 0.42),
        detector("behaviour", "Behaviour", 0.58, "Sent outside normal hours", 0.28),
        detector("device", "Device", 0.86, "Device seen for the first time", 0.4),
        detector("voice", "Voice & call", null, "", 0),
      ]
    ),
    signals: {
      device: "Unrecognised device — first transaction ever from this handset.",
      behaviour: "Velocity spike: 3 transfers in 10 minutes, typical is 1 per day.",
      recipient: "9821xxxxxx@paytm — never paid before, flagged in 2 other reports this week.",
    },
    userAction: "reported",
  },
  "TXN-8228": {
    transaction: FEED[3],
    result: result(
      5,
      ["No anomalies detected. All signals match this account's baseline."],
      [
        detector("transaction", "Transaction", 0.05, "Small routine payment", -0.2),
        detector("behaviour", "Behaviour", 0.04, "Consistent with normal rhythm", -0.15),
        detector("device", "Device", 0.06, "Known trusted device", -0.12),
        detector("voice", "Voice & call", null, "", 0),
      ]
    ),
    signals: {
      device: "Recognised device — used consistently over the past 3 months.",
      behaviour: "Transaction fits user's normal small-payment pattern.",
      recipient: "priya.nair@okicici — paid 4 times previously.",
    },
    userAction: "none",
  },
  "TXN-8227": {
    transaction: FEED[4],
    result: result(
      71,
      ["Rapid successive transfer within 60 seconds of the previous payment.", "Amount exceeds the recipient's typical transfer size for this user."],
      [
        detector("transaction", "Transaction", 0.68, "Rapid successive transfer", 0.35),
        detector("behaviour", "Behaviour", 0.52, "Two payments in under a minute", 0.31),
        detector("device", "Device", 0.3, "Recognised device", -0.15),
        detector("voice", "Voice & call", null, "", 0),
      ]
    ),
    signals: {
      device: "OnePlus 9 · Android — recognised.",
      behaviour: "Second transfer within 47 seconds of the first — rapid successive pattern.",
      recipient: "Paid before, but never at this amount.",
    },
    userAction: "cancelled",
  },
  "TXN-8226": {
    transaction: FEED[5],
    result: result(
      34,
      ["Amount above 30-day average.", "Recipient is known but this amount is higher than usual for them."],
      [
        detector("transaction", "Transaction", 0.4, "Amount above 30-day average", 0.22),
        detector("behaviour", "Behaviour", 0.25, "Within normal hours", -0.08),
        detector("device", "Device", 0.2, "Recognised device", -0.15),
        detector("voice", "Voice & call", null, "", 0),
      ]
    ),
    signals: {
      device: "Recognised device, last used yesterday.",
      behaviour: "Payment during normal active hours.",
      recipient: "meera.iyer@okhdfc — paid 3 times before, never at this amount.",
    },
    userAction: "confirmed",
  },
  "TXN-8225": {
    transaction: FEED[6],
    result: result(
      12,
      ["Low-value payment to a known recipient — within normal parameters."],
      [
        detector("transaction", "Transaction", 0.12, "Small payment within usual range", -0.16),
        detector("behaviour", "Behaviour", 0.1, "Sent during normal hours", -0.1),
        detector("device", "Device", 0.08, "Recognised device", -0.12),
        detector("voice", "Voice & call", null, "", 0),
      ]
    ),
    signals: {
      device: "Recognised handset — same device used for last 6 transactions.",
      behaviour: "Consistent with weekly payment pattern.",
      recipient: "karan.s@oksbi — regular recipient, 5 prior payments.",
    },
    userAction: "none",
  },
  "TXN-8224": {
    transaction: FEED[7],
    result: result(
      79,
      ["New recipient categorised as a business account with no prior relationship.", "Device app-install age is 4 days."],
      [
        detector("transaction", "Transaction", 0.74, "Amount is well above usual transfer", 0.4),
        detector("behaviour", "Behaviour", 0.5, "Outside normal spending pattern", 0.26),
        detector("device", "Device", 0.69, "App installed 4 days ago", 0.33),
        detector("voice", "Voice & call", null, "", 0),
      ]
    ),
    signals: {
      device: "App install age 4 days — unusually new for this account's payment history.",
      behaviour: "First large transfer this billing cycle.",
      recipient: "Fresh Traders Co. — no prior transaction history with this user.",
    },
    userAction: "reported",
  },
  "TXN-8223": {
    transaction: FEED[8],
    result: result(
      46,
      ["First payment to this recipient.", "Amount is above this user's median transfer."],
      [
        detector("transaction", "Transaction", 0.5, "New recipient, amount within range", 0.2),
        detector("behaviour", "Behaviour", 0.3, "Consistent with normal rhythm", -0.12),
        detector("device", "Device", 0.28, "Recognised device", -0.1),
        detector("voice", "Voice & call", null, "", 0),
      ]
    ),
    signals: {
      device: "Recognised device — consistent usage history.",
      behaviour: "Payment at typical time of day for this user.",
      recipient: "divya.m@okicici — first transaction to this handle.",
    },
    userAction: "confirmed",
  },
  "TXN-8222": {
    transaction: FEED[9],
    result: result(
      4,
      ["Routine small payment. No signals outside baseline."],
      [
        detector("transaction", "Transaction", 0.04, "Small payment, matches history", -0.22),
        detector("behaviour", "Behaviour", 0.03, "Consistent with normal rhythm", -0.14),
        detector("device", "Device", 0.05, "Known device", -0.1),
        detector("voice", "Voice & call", null, "", 0),
      ]
    ),
    signals: {
      device: "Recognised device — used in all recent sessions.",
      behaviour: "Fits this user's typical low-value payment pattern.",
      recipient: "arjun.n@okaxis — paid twice in the last month.",
    },
    userAction: "none",
  },
  "TXN-8221": {
    transaction: FEED[10],
    result: result(
      63,
      ["Amount is 9x the user's typical transfer.", "Recipient contacted for the first time this month."],
      [
        detector("transaction", "Transaction", 0.7, "Amount is 9x typical transfer", 0.38),
        detector("behaviour", "Behaviour", 0.45, "Within normal hours", -0.1),
        detector("device", "Device", 0.4, "Recognised device", -0.14),
        detector("voice", "Voice & call", null, "", 0),
      ]
    ),
    signals: {
      device: "iPhone 13 · Safari — recognised.",
      behaviour: "Otherwise consistent with this user's normal rhythm.",
      recipient: "Contacted once before, 6 months ago.",
    },
    userAction: "confirmed",
  },
  "TXN-8220": {
    transaction: FEED[11],
    result: result(
      17,
      ["Low risk. Small payment to a previously known recipient."],
      [
        detector("transaction", "Transaction", 0.18, "Amount within typical range", -0.14),
        detector("behaviour", "Behaviour", 0.14, "Sent during active hours", -0.1),
        detector("device", "Device", 0.12, "Recognised device", -0.12),
        detector("voice", "Voice & call", null, "", 0),
      ]
    ),
    signals: {
      device: "Recognised device, consistent usage history.",
      behaviour: "Payment timing within normal active window.",
      recipient: "vikram.d@oksbi — paid 2 times previously.",
    },
    userAction: "none",
  },
  "TXN-8219": {
    transaction: FEED[12],
    result: result(
      55,
      ["Amount is above this user's 30-day average.", "Payment held pending user review — no response yet."],
      [
        detector("transaction", "Transaction", 0.58, "Amount above 30-day average", 0.3),
        detector("behaviour", "Behaviour", 0.42, "Sent outside typical hours", 0.22),
        detector("device", "Device", 0.3, "Recognised device", -0.12),
        detector("voice", "Voice & call", null, "", 0),
      ]
    ),
    signals: {
      device: "Recognised device — no anomaly.",
      behaviour: "Transfer initiated 90 minutes past this user's usual activity window.",
      recipient: "neha.k@okicici — paid once 3 months ago.",
    },
    userAction: "none",
  },
  "TXN-8218": {
    transaction: FEED[13],
    result: result(
      91,
      [
        "Amount is the largest transfer ever attempted on this account.",
        "New device and new recipient in the same transaction.",
        "Location does not match any of the user's last 20 sessions.",
      ],
      [
        detector("transaction", "Transaction", 0.88, "Largest transfer on record", 0.46),
        detector("behaviour", "Behaviour", 0.66, "No comparable prior activity", 0.3),
        detector("device", "Device", 0.92, "New device and new location together", 0.44),
        detector("voice", "Voice & call", 0.74, "Active call showed urgency + secrecy language", 0.38),
      ]
    ),
    signals: {
      device: "Unrecognised device, unrecognised network — first activity of any kind.",
      behaviour: "No comparable transaction in this account's 14-month history.",
      recipient: "7712xxxxxx@ybl — first contact, flagged by 5 other institutions this week.",
    },
    userAction: "reported",
  },
}


/* ── false-positive review queue ─────────────────────────────────────── */

const FALSE_POSITIVES: FalsePositiveCase[] = [
  { id: "FP-104", transaction: FEED[1], result: ALERTS["TXN-8230"].result, flaggedAt: minutesAgo(3), reviewStatus: "open" },
  { id: "FP-103", transaction: FEED[10], result: ALERTS["TXN-8221"].result, flaggedAt: minutesAgo(40), reviewStatus: "open" },
  { id: "FP-102", transaction: FEED[8], result: result(46, ["First payment to this recipient."], [
      detector("transaction", "Transaction", 0.5, "New recipient, amount within range", 0.2),
      detector("behaviour", "Behaviour", 0.3, "Consistent with normal rhythm", -0.12),
      detector("device", "Device", 0.28, "Recognised device", -0.1),
      detector("voice", "Voice & call", null, "", 0),
    ]), flaggedAt: minutesAgo(120), reviewStatus: "resolved_legitimate" },
  { id: "FP-101", transaction: FEED[5], result: result(34, ["Amount above 30-day average."], [
      detector("transaction", "Transaction", 0.4, "Amount above 30-day average", 0.22),
      detector("behaviour", "Behaviour", 0.25, "Within normal hours", -0.08),
      detector("device", "Device", 0.2, "Recognised device", -0.15),
      detector("voice", "Voice & call", null, "", 0),
    ]), flaggedAt: minutesAgo(200), reviewStatus: "escalated" },
]

/* ── overview, derived from the feed rather than hand-maintained ────────── */

function computeOverview(feed: FeedTransaction[]): OverviewStats {
  return {
    totalTransactions: feed.length,
    suspiciousTransactions: feed.filter((t) => t.riskLevel === "MEDIUM" || t.riskLevel === "HIGH").length,
    highRiskTransactions: feed.filter((t) => t.riskLevel === "HIGH").length,
    blockedOrReported: feed.filter((t) => t.status === "cancelled" || t.status === "reported").length,
  }
}

/* ── the "API" ─────────────────────────────────────────────────────────── */

/**
 * Stands in for the institution dashboard's read endpoints. `simulateError`
 * exists so the dashboard's error state is something you can actually
 * trigger and look at, not dead code — see the "Simulate error" control in
 * institution-dashboard.tsx.
 */
export function loadDashboard(opts?: { simulateError?: boolean }): Promise<DashboardData> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (opts?.simulateError) {
        reject(new Error("Could not reach the institution risk feed."))
        return
      }
      resolve({
        overview: computeOverview(FEED),
        feed: FEED,
        alerts: ALERTS,
        falsePositives: FALSE_POSITIVES,
      })
    }, 900)
  })
}

export type { TransactionStatus }
