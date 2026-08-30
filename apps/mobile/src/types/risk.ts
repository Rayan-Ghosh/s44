export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type Decision = "ALLOW" | "WARN" | "CONFIRM_OR_CANCEL";

export type DetectorKey = "transaction" | "behaviour" | "device" | "voice" | "rules";

export interface DetectorFactor {
  label: string;
  contribution: number; // Signed, -1..1
  direction: "increases" | "decreases";
}

export interface DetectorResult {
  key: DetectorKey;
  label: string;
  score: number | null; // 0..1
  status: "ok" | "unavailable";
  note?: string;
  factors: DetectorFactor[];
}

export interface RiskResult {
  riskScore: number; // 0-100
  riskLevel: RiskLevel;
  decision: Decision;
  detectors: DetectorResult[];
  reasons: string[];
  contributionsPct: Record<string, number>;
}
