import { DetectorResult, RiskLevel } from "./risk";

export type CallStatus = "inactive" | "connecting" | "active" | "fraud_alert" | "disconnected";

export interface CallerInfo {
  displayName: string;
  phoneNumber: string;
  direction: "inbound" | "outbound";
}

export interface TranscriptLine {
  id: string;
  speaker: "caller" | "user";
  text: string;
  atSec: number;
  isFinal: boolean;
}

export type DetectedPattern =
  | "AUTHORITY_IMPERSONATION"
  | "REMOTE_ACCESS_COERCION"
  | "FINANCIAL_CREDENTIAL_EXTRACTION"
  | "URGENT_LANGUAGE"
  | "OTP_SOLICITATION"
  | "SUSPICIOUS_CALL_PATTERN";

export interface FraudAlert {
  triggered: boolean;
  pattern: DetectedPattern | null;
  title: string;
  explanation: string;
  recommendedAction: string;
}

export interface CallSnapshot {
  status: CallStatus;
  caller: CallerInfo;
  durationSec: number;
  transcript: TranscriptLine[];
  riskScore: number;
  riskLevel: RiskLevel;
  detectedPatterns: DetectedPattern[];
  signals: DetectorResult[];
  reasons: string[];
  alert: FraudAlert;
}
