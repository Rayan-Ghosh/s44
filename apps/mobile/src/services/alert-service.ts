import { ApiClient } from "./api-client";

export interface SecurityAlert {
  id: string;
  title: string;
  description: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "DISMISSED" | "ACTIVE" | "ACKNOWLEDGED";
  timestamp: string;
  transactionId?: string | number;
  isRead: boolean;
}

type AlertListener = (alerts: SecurityAlert[]) => void;

class AlertManager {
  private alerts: SecurityAlert[] = [];
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

  /** Real GET /api/v1/alerts. */
  public async getAlerts(): Promise<SecurityAlert[]> {
    const res = await ApiClient.get<any[]>("/api/v1/alerts");
    if (res.data && Array.isArray(res.data)) {
      this.alerts = res.data.map((a: any) => ({
        id: String(a.id),
        title: a.summary || "Security Alert",
        description: a.summary || "A security event was detected.",
        severity: a.severity || "MEDIUM",
        status: a.status || "OPEN",
        timestamp: a.created_at
          ? new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
          : "Recently",
        transactionId: a.transaction_id,
        isRead: a.status !== "OPEN" && a.status !== "ACTIVE",
      }));
    }
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
