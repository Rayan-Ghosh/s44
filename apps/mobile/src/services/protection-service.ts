export interface ProtectionShield {
  id: string;
  name: string;
  status: "Active" | "Paused" | "Unavailable";
  description: string;
}

export interface SecurityAlertItem {
  id: string;
  type: "TRANSACTION_RISK" | "CALL_SCAM" | "DEVICE_ANOMALY";
  title: string;
  description: string;
  merchant?: string;
  amount?: number;
  callerNumber?: string;
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  status: "Needs Review" | "Verified Safe" | "Reported Fraud" | "Action Taken";
  timestamp: string;
  reasons: string[];
}

export const INITIAL_SHIELDS: ProtectionShield[] = [
  {
    id: "shield-payment",
    name: "Payment Protection",
    status: "Active",
    description: "Detects suspicious transactions before they complete.",
  },
  {
    id: "shield-risk",
    name: "Risk Detection",
    status: "Active",
    description: "Identifies unusual payment activity.",
  },
  {
    id: "shield-call",
    name: "Call Protection",
    status: "Active",
    description: "Helps identify potentially fraudulent calls.",
  },
];

export const INITIAL_SECURITY_ALERTS: SecurityAlertItem[] = [
  {
    id: "alert-1",
    type: "TRANSACTION_RISK",
    title: "Potential fraud detected",
    description: "Unusual payment initiated to an unrecognized merchant.",
    merchant: "Unknown Merchant",
    amount: 14200,
    riskLevel: "HIGH",
    status: "Needs Review",
    timestamp: "Today · 10 mins ago",
    reasons: [
      "Unusual amount compared to typical transactions",
      "New merchant not in your transaction history",
      "Unusual device/location activity detected",
    ],
  },
  {
    id: "alert-2",
    type: "CALL_SCAM",
    title: "Potential scam call detected",
    description: "Caller pattern matches known bank impersonation tactics.",
    callerNumber: "+91 1800 209 8888 (Unknown caller)",
    riskLevel: "HIGH",
    status: "Needs Review",
    timestamp: "Today · 11:42 AM",
    reasons: [
      "Requested SMS verification OTP",
      "Requested sensitive banking information",
      "Claimed to be bank support team",
    ],
  },
];

export class ProtectionService {
  static async getShields(): Promise<ProtectionShield[]> {
    return [...INITIAL_SHIELDS];
  }

  static async getAlerts(): Promise<SecurityAlertItem[]> {
    return [...INITIAL_SECURITY_ALERTS];
  }

  static async resolveAlert(id: string, action: "SAFE" | "REPORT_FRAUD"): Promise<void> {
    await new Promise((r) => setTimeout(r, 200));
  }
}
