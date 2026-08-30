import { ApiClient } from "./api-client";
import { DetectorResult, RiskLevel, RiskResult } from "../types/risk";

/**
 * Real POST /api/v1/risk/evaluate — the authoritative fusion/decision engine
 * (spec §12, product directive §H). No client-side risk heuristics: a
 * transaction must already exist server-side (POST /api/v1/transactions)
 * before it can be evaluated.
 */
export class RiskService {
  static async evaluateTransaction(transactionId: number): Promise<RiskResult | null> {
    const res = await ApiClient.post<any>("/api/v1/risk/evaluate", {
      transaction_id: transactionId,
    });
    if (!res.data) return null;
    return mapDecisionPackage(res.data);
  }
}

function mapDecisionPackage(pkg: any): RiskResult {
  const riskLevel: RiskLevel = pkg.risk_level || "LOW";
  const decision = pkg.decision === "CONFIRM_OR_CANCEL"
    ? "CONFIRM_OR_CANCEL"
    : pkg.decision === "WARN_CHOICE"
    ? "WARN"
    : "ALLOW";

  const contributionsPct: Record<string, number> = pkg.risk_contributions_pct || {};
  const subScores: Record<string, number> = pkg.sub_scores || {};

  // The backend returns per-factor contribution percentages and named
  // sub-scores rather than a fixed 4-category breakdown — synthesize one
  // detector per named sub-score so the existing detector-list UI still has
  // something real to render.
  const detectors: DetectorResult[] = Object.entries(subScores).map(([key, score]) => ({
    key: (key.includes("voice") ? "voice" : key.includes("device") ? "device" : key.includes("behav") ? "behaviour" : "transaction") as DetectorResult["key"],
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    score: typeof score === "number" ? score : null,
    status: "ok",
    factors: [],
  }));

  return {
    riskScore: pkg.risk_score ?? 0,
    riskLevel,
    decision,
    detectors,
    reasons: pkg.plain_language_reasons || [],
    contributionsPct,
  };
}
