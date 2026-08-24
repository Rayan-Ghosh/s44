import { ApiClient } from "./api-client";

export interface SecurityAlert {
  id: string;
  title: string;
  description: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  status: "ACTIVE" | "RESOLVED" | "ACKNOWLEDGED";
  timestamp: string;
  transactionId?: number;
  isRead: boolean;
}

export const SEED_SECURITY_ALERTS: SecurityAlert[] = [
  {
    id: "alert-101",
    title: "Suspicious Payment Flagged",
    description: "₹14,200 payment to Unknown Merchant held for review due to risk anomaly.",
    severity: "HIGH",
    status: "ACTIVE",
    timestamp: "Today · 10 min ago",
    transactionId: 1,
    isRead: false,
  },
  {
    id: "alert-102",
    title: "New Device Authentication",
    description: "Your account was accessed from a recognized Google Pixel device.",
    severity: "LOW",
    status: "RESOLVED",
    timestamp: "Yesterday",
    isRead: true,
  },
];

export class AlertService {
  static async getAlerts(): Promise<SecurityAlert[]> {
    const res = await ApiClient.get<any[]>("/api/v1/alerts");
    if (res.data && Array.isArray(res.data) && res.data.length > 0) {
      return res.data.map((a: any) => ({
        id: String(a.id),
        title: a.summary || "Security Alert",
        description: a.summary || "A security event was detected.",
        severity: a.severity || "MEDIUM",
        status: a.status || "ACTIVE",
        timestamp: a.created_at
          ? new Date(a.created_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })
          : "Recently",
        transactionId: a.transaction_id,
        isRead: a.status !== "ACTIVE",
      }));
    }
    return SEED_SECURITY_ALERTS;
  }

  static async markAsRead(alertId: string): Promise<void> {
    // In local state / backend
    return;
  }
}
