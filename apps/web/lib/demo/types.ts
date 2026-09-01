/**
 * Shared types for the /demo payment flow.
 *
 * Field names deliberately mirror the real inference response
 * (`ml/inference/predict.py`'s `RiskDecisionPackage` / `MLPredictor.predict()`
 * output — risk_score, risk_level, decision, plain_language_reasons,
 * risk_factors, risk_contributions_pct, sub_scores) rather than the unused
 * `shared/s40_contracts.py` shape, so that swapping `lib/demo/mock-risk.ts`
 * for a real `POST /api/v1/risk/evaluate` call later is a data-source change,
 * not a component rewrite.
 */

export type DetectorKey = "transaction" | "behaviour" | "device" | "voice"

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH"

/** Mirrors `RiskFusionEngine`'s decision vocabulary. */
export type Decision = "ALLOW" | "WARN" | "CONFIRM_OR_CANCEL"

export interface DetectorFactor {
  label: string
  /** Signed, -1..1. Positive increases risk, negative decreases it. */
  contribution: number
  direction: "increases" | "decreases"
}

export interface DetectorResult {
  key: DetectorKey
  label: string
  /** 0..1. `null` when the detector did not run — never coerced to 0. */
  score: number | null
  status: "ok" | "unavailable"
  /** Why it didn't run, when status is "unavailable". */
  note?: string
  factors: DetectorFactor[]
}

export interface TransactionInput {
  /** The real backend transaction id, once created — absent only for the
   *  mock fallback path, which has no server-side row to reference. */
  id?: number
  amount: number
  recipientName: string
  recipientHandle: string
  isNewRecipient: boolean
  deviceLabel: string
  isNewDevice: boolean
  location: string
  paymentMethod: string
  /** ISO timestamp string. */
  timestamp: string
}

export interface RiskResult {
  riskScore: number // 0-100
  riskLevel: RiskLevel
  decision: Decision
  detectors: DetectorResult[]
  /** Plain-language explanation bullets. */
  reasons: string[]
  /** Detector label -> share of the score, already normalised to 100. */
  contributionsPct: Record<string, number>
}

export type ScenarioKey = "LOW" | "MEDIUM" | "HIGH"

export type FinalOutcome = "allowed" | "confirmed" | "cancelled" | "reported"

export type DemoStep = "held" | "details" | "analysis" | "result" | "status"
