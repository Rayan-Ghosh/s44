/**
 * Centralized Single Source of Truth for Risk Level Calculation and Validation.
 * 
 * Rules:
 *   Score >= 61 => "HIGH"
 *   Score >= 31 => "MEDIUM"
 *   Score < 31  => "LOW"
 * 
 * No frontend screen or component may calculate, hardcode, or override
 * risk levels independently.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export function getRiskLevelFromScore(score: number | undefined | null): RiskLevel {
  const s = typeof score === "number" ? score : Number(score) || 0;
  if (s >= 61) return "HIGH";
  if (s >= 31) return "MEDIUM";
  return "LOW";
}

export function getStatusBadgeProps(level: RiskLevel): {
  label: string;
  status: "high" | "medium" | "low";
} {
  if (level === "HIGH") {
    return { label: "HIGH RISK", status: "high" };
  }
  if (level === "MEDIUM") {
    return { label: "MEDIUM RISK", status: "medium" };
  }
  return { label: "LOW RISK", status: "low" };
}

export interface RiskValidationRecord {
  component: string;
  transactionId: string | number;
  riskScore: number;
  riskLevel: RiskLevel;
}

/**
 * Validates that the rendered transaction ID, risk score, and risk level are identical
 * and prints an authoritative log in development/testing.
 */
export function validateAndLogRiskState(record: RiskValidationRecord): void {
  const calculatedLevel = getRiskLevelFromScore(record.riskScore);
  if (record.riskLevel !== calculatedLevel) {
    console.warn(
      `[RISK_VALIDATION_ERROR] Component: ${record.component} | Txn ID: ${record.transactionId} | Stored Level: ${record.riskLevel} != Calculated Level: ${calculatedLevel} (Score: ${record.riskScore})`
    );
  } else {
    console.log(
      `[RISK_VALIDATION_OK] Component: ${record.component} | Txn ID: ${record.transactionId} | Score: ${record.riskScore}/100 | Level: ${record.riskLevel}`
    );
  }
}
