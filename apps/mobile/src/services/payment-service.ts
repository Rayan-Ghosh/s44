import { ApiClient } from "./api-client";
import { AlertService } from "./alert-service";

export interface UserPaymentOverview {
  totalAmountThisMonth: number;
  transactionCount: number;
  safeCount: number;
  needsReviewCount: number;
  blockedCount: number;
  reportedCount: number;
  currentRiskLevel: "LOW" | "MEDIUM" | "HIGH";
  currentRiskScore: number; // 0 - 100
  protectionStatus: "PROTECTED" | "ATTENTION REQUIRED";
}

export const EMPTY_PAYMENT_OVERVIEW: UserPaymentOverview = {
  totalAmountThisMonth: 0,
  transactionCount: 0,
  safeCount: 0,
  needsReviewCount: 0,
  blockedCount: 0,
  reportedCount: 0,
  currentRiskLevel: "LOW",
  currentRiskScore: 0,
  protectionStatus: "PROTECTED",
};

export interface RiskFactorItem {
  factor_type: string;
  factor_name: string;
  contribution: number;
  explanation: string;
}

export interface TrustedApprovalAudit {
  required: boolean;
  contactName?: string;
  decision?: "Approved" | "Rejected" | "Expired";
  decisionTime?: string;
  notes?: string;
}

export interface UserTransaction {
  id: string;
  title: string;
  merchant: string;
  amount: number;
  date: string;
  timestamp: string;
  paymentMethod: string;
  status: "Safe" | "Risk detected" | "Approved by you" | "Reported" | "Blocked" | "Held" | "Completed";
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  riskScore?: number; // 0 - 100
  riskFactors: RiskFactorItem[];
  reasons: string[];
  isCompleted?: boolean;
  paymentAppUsed?: string;
  completionTimestamp?: string;
  trustedApproval?: TrustedApprovalAudit;
}

const STATUS_MAP: Record<string, UserTransaction["status"]> = {
  PENDING: "Held",
  AWAITING_CONFIRMATION: "Held",
  PENDING_GUARDIAN_APPROVAL: "Held",
  ALLOWED: "Safe",
  CONFIRMED: "Approved by you",
  GUARDIAN_APPROVED: "Approved by you",
  GUARDIAN_TIMEOUT_USER_OVERRODE: "Approved by you",
  CANCELLED: "Blocked",
  GUARDIAN_REJECTED: "Blocked",
  REPORTED: "Reported",
};

const mapBackendTransaction = (t: any): UserTransaction => {
  const status = STATUS_MAP[String(t.status).toUpperCase()] || "Held";
  const isRisky = (t.risk_level === "HIGH" || t.risk_level === "MEDIUM") && status === "Held";
  return {
    id: String(t.id),
    title: t.merchant || "UPI Payment",
    merchant: t.merchant || "UPI Payment",
    amount: Number(t.amount) || 0,
    date: t.timestamp ? new Date(t.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "",
    timestamp: t.timestamp || new Date().toISOString(),
    paymentMethod: t.payment_method || "UPI",
    status: isRisky ? "Risk detected" : status,
    riskLevel: t.risk_level,
    riskScore: typeof t.risk_score === "number" ? t.risk_score : undefined,
    riskFactors: Array.isArray(t.risk_factors) ? t.risk_factors : [],
    reasons: Array.isArray(t.risk_factors) ? t.risk_factors.map((f: any) => f.explanation).filter(Boolean) : [],
    isCompleted: status === "Approved by you" || status === "Safe",
    completionTimestamp: status !== "Held" ? t.timestamp : undefined,
  };
};

type PaymentSubscriber = (overview: UserPaymentOverview, transactions: UserTransaction[]) => void;

class CentralPaymentManager {
  private transactions: UserTransaction[] = [];
  private overview: UserPaymentOverview = EMPTY_PAYMENT_OVERVIEW;
  private subscribers: Set<PaymentSubscriber> = new Set();

  public subscribe(fn: PaymentSubscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private notify() {
    const txCopy = [...this.transactions];
    this.subscribers.forEach((fn) => {
      try {
        fn(this.overview, txCopy);
      } catch {
        // Safe subscriber notification
      }
    });
  }

  /** Real GET /api/v1/users/{id}/overview. */
  public async getOverview(userId: number): Promise<UserPaymentOverview> {
    const res = await ApiClient.get<any>(`/api/v1/users/${userId}/overview`);
    if (!res.data) return this.overview;
    this.overview = {
      totalAmountThisMonth: res.data.total_amount_this_month ?? 0,
      transactionCount: res.data.transaction_count ?? 0,
      safeCount: res.data.safe_count ?? 0,
      needsReviewCount: res.data.needs_review_count ?? 0,
      blockedCount: res.data.blocked_count ?? 0,
      reportedCount: res.data.reported_count ?? 0,
      currentRiskLevel: res.data.current_risk_level ?? "LOW",
      currentRiskScore: res.data.current_risk_score ?? 0,
      protectionStatus: res.data.protection_status ?? "PROTECTED",
    };
    return this.overview;
  }

  /** Real GET /api/v1/users/{id}/transactions. */
  public async getTransactions(
    userId: number,
    filter?: "all" | "review" | "safe" | "completed",
    limit?: number,
    offset?: number
  ): Promise<{ items: UserTransaction[]; total: number }> {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set("limit", String(limit));
    if (offset !== undefined) params.set("offset", String(offset));
    const qs = params.toString();
    const res = await ApiClient.get<{ items: any[]; total: number }>(
      `/api/v1/users/${userId}/transactions${qs ? `?${qs}` : ""}`
    );
    if (!res.data) return { items: [], total: 0 };

    let items = res.data.items.map(mapBackendTransaction);
    if (filter === "review") {
      items = items.filter((t) => t.status === "Risk detected" || t.status === "Held");
    } else if (filter === "safe" || filter === "completed") {
      items = items.filter((t) => t.status === "Safe" || t.status === "Approved by you" || t.status === "Completed");
    }

    this.transactions = res.data.items.map(mapBackendTransaction);
    this.notify();
    return { items, total: res.data.total };
  }

  /** Optimistic local cache update — the backend remains the source of truth. */
  public addTransaction(newTx: UserTransaction) {
    this.transactions = [newTx, ...this.transactions];
    this.notify();
  }

  public updateTransactionStatus(
    transactionId: string,
    status: UserTransaction["status"]
  ): boolean {
    let found = false;
    this.transactions = this.transactions.map((t) => {
      if (t.id === transactionId) {
        found = true;
        return {
          ...t,
          status,
          isCompleted: status === "Approved by you" || status === "Safe" || status === "Completed",
          completionTimestamp:
            status === "Approved by you" || status === "Safe" || status === "Completed"
              ? new Date().toISOString()
              : t.completionTimestamp,
        };
      }
      return t;
    });

    if (found) {
      if (status === "Approved by you" || status === "Safe" || status === "Completed") {
        AlertService.resolveAlertForTransaction(transactionId);
      }
      this.notify();
    }
    return found;
  }

  public completeTransaction(
    transactionId: string,
    paymentAppUsed?: string,
    trustedDetails?: TrustedApprovalAudit
  ): boolean {
    let found = false;
    this.transactions = this.transactions.map((t) => {
      if (t.id === transactionId) {
        found = true;
        return {
          ...t,
          status: "Approved by you",
          isCompleted: true,
          paymentAppUsed: paymentAppUsed || t.paymentAppUsed,
          completionTimestamp: new Date().toISOString(),
          trustedApproval: trustedDetails || t.trustedApproval || { required: false },
        };
      }
      return t;
    });

    if (found) {
      AlertService.resolveAlertForTransaction(transactionId);
      this.notify();
    }
    return found;
  }

  /** Real POST /api/v1/transactions/{id}/confirm. */
  public async confirmTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    const res = await ApiClient.post(`/api/v1/transactions/${transactionId}/confirm`);
    if (!res.data) return { success: false, error: res.error || "Unable to confirm payment." };
    this.updateTransactionStatus(transactionId, "Approved by you");
    return { success: true };
  }

  /** Real POST /api/v1/transactions/{id}/report. */
  public async reportTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    const res = await ApiClient.post(`/api/v1/transactions/${transactionId}/report`);
    if (!res.data) return { success: false, error: res.error || "Unable to report transaction." };

    let reportedTx: UserTransaction | undefined;
    this.transactions = this.transactions.map((t) => {
      if (t.id === transactionId) {
        reportedTx = { ...t, status: "Reported", isCompleted: true };
        return reportedTx;
      }
      return t;
    });

    if (reportedTx) {
      AlertService.addAlert({
        id: `alert-fraud-${transactionId}`,
        title: "Fraud Incident Reported",
        description: `Payment to ${reportedTx.merchant} (₹${reportedTx.amount.toLocaleString("en-IN")}) marked as fraudulent by user.`,
        severity: "HIGH",
        status: "ACTIVE",
        timestamp: "Just now",
        transactionId: transactionId,
        isRead: false,
      });
      this.notify();
    }
    return { success: true };
  }

  /** Real POST /api/v1/transactions/{id}/cancel. */
  public async cancelTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    const res = await ApiClient.post(`/api/v1/transactions/${transactionId}/cancel`);
    if (!res.data) return { success: false, error: res.error || "Unable to cancel payment." };
    this.updateTransactionStatus(transactionId, "Blocked");
    return { success: true };
  }
}

export const PaymentService = new CentralPaymentManager();
