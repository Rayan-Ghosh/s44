import { ApiClient } from "./api-client";

export interface SecurityAlert {
  id: string;
  title: string;
  description: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  status: "ACTIVE" | "RESOLVED" | "ACKNOWLEDGED";
  timestamp: string;
  transactionId?: string | number;
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
    transactionId: "txn-1",
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

type AlertListener = (alerts: SecurityAlert[]) => void;

class AlertManager {
  private alerts: SecurityAlert[] = [...SEED_SECURITY_ALERTS];
  private listeners: Set<AlertListener> = new Set();

  public subscribe(listener: AlertListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const copy = [...this.alerts];
    this.listeners.forEach((listener) => listener(copy));
  }

  public async getAlerts(): Promise<SecurityAlert[]> {
    try {
      const res = await ApiClient.get<any[]>("/api/v1/alerts");
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        const remoteAlerts: SecurityAlert[] = res.data.map((a: any) => ({
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
        return remoteAlerts;
      }
    } catch {}
    return [...this.alerts];
  }

  public addAlert(alert: SecurityAlert): void {
    this.alerts = [alert, ...this.alerts];
    this.notify();
  }

  public resolveAlertForTransaction(transactionId: string): void {
    this.alerts = this.alerts.map((a) => {
      if (
        a.transactionId === transactionId ||
        String(a.transactionId) === transactionId ||
        transactionId.includes(String(a.transactionId || ""))
      ) {
        return {
          ...a,
          status: "RESOLVED",
          isRead: true,
        };
      }
      return a;
    });
    this.notify();
  }

  public markAsRead(alertId: string): void {
    this.alerts = this.alerts.map((a) =>
      a.id === alertId ? { ...a, isRead: true, status: "ACKNOWLEDGED" } : a
    );
    this.notify();
  }
}

export const AlertService = new AlertManager();
