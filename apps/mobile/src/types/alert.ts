import { RiskLevel } from "./risk";

export type AlertCategory = "payment" | "voice" | "device" | "system";

export interface SecurityAlert {
  id: string;
  category: AlertCategory;
  severity: RiskLevel;
  title: string;
  description: string;
  timestamp: string;
  isRead: boolean;
  amount?: string;
  metadata?: {
    recipient?: string;
    callerNumber?: string;
    device?: string;
    riskScore?: number;
  };
  whatHappened: string;
  whyFlagged: string[];
  whatYouShouldDo: string[];
}
