import { ApiClient, IS_DEMO_MODE } from "./api-client";
import { AlertService } from "./alert-service";
import {
  DEMO_USER_TRANSACTIONS,
  DEMO_PAYMENT_OVERVIEW,
} from "../data/demo-data";

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
  authorizationRequired?: boolean;
  authorizationStatus?: "NONE" | "PENDING" | "AUTHORIZED" | "REJECTED";
  authorizedAt?: string;
  authorizationMethod?: string;
}

const STATUS_MAP: Record<string, UserTransaction["status"]> = {
  PENDING: "Held",
  AWAITING_CONFIRMATION: "Held",
  PENDING_AUTHORIZATION: "Held",
  AUTHORIZED: "Held",
  PENDING_GUARDIAN_APPROVAL: "Held",
  ALLOWED: "Safe",
  CONFIRMED: "Approved by you",
  GUARDIAN_APPROVED: "Approved by you",
  GUARDIAN_TIMEOUT_USER_OVERRODE: "Approved by you",
  CANCELLED: "Blocked",
  GUARDIAN_REJECTED: "Blocked",
  REPORTED: "Reported",
};

import { getRiskLevelFromScore } from "../utils/risk-scoring";

const mapBackendTransaction = (t: any): UserTransaction => {
  const status = STATUS_MAP[String(t.status).toUpperCase()] || "Held";
  const rawRiskScore = typeof t.risk_score === "number" ? Math.round(t.risk_score * 10) / 10 : (t.risk_score !== undefined ? Number(t.risk_score) : 0);
  const riskLevel: "LOW" | "MEDIUM" | "HIGH" = getRiskLevelFromScore(rawRiskScore);

  const isRisky = (riskLevel === "HIGH" || riskLevel === "MEDIUM") && status === "Held";
  const authRequired = Boolean(t.authorization_required || riskLevel === "HIGH");

  const factors: RiskFactorItem[] = Array.isArray(t.risk_factors)
    ? t.risk_factors.map((f: any) => ({
        factor_type: f.factor_type || "ml_signal",
        factor_name: f.factor_name || f.name || "Risk Signal",
        contribution: typeof f.contribution === "number" ? f.contribution : 0,
        explanation: f.explanation || f.factor_name || "Telemetry signal evaluated",
      }))
    : [];

  const reasons = factors.length > 0
    ? factors.map((f) => f.explanation).filter(Boolean)
    : Array.isArray(t.reasons) && t.reasons.length > 0
    ? t.reasons
    : riskLevel === "HIGH"
    ? ["High-risk behavioral anomaly detected", "Transaction requires guardian verification"]
    : riskLevel === "MEDIUM"
    ? ["Transaction amount exceeds usual baseline", "Unverified recipient profile"]
    : ["Standard verified transaction signature"];

  return {
    id: String(t.id),
    title: t.merchant || "UPI Payment",
    merchant: t.merchant || "UPI Payment",
    amount: Number(t.amount) || 0,
    date: t.timestamp ? new Date(t.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Today",
    timestamp: t.timestamp || new Date().toISOString(),
    paymentMethod: t.payment_method || "UPI",
    status: isRisky ? "Risk detected" : status,
    riskLevel: riskLevel,
    riskScore: rawRiskScore,
    riskFactors: factors,
    reasons: reasons,
    isCompleted: status === "Approved by you" || status === "Safe" || status === "Completed",
    completionTimestamp: status !== "Held" ? t.timestamp : undefined,
    authorizationRequired: authRequired,
    authorizationStatus: t.authorization_status || (authRequired ? "PENDING" : "NONE"),
    authorizedAt: t.authorized_at,
    authorizationMethod: t.authorization_method,
  };
};

type PaymentSubscriber = (overview: UserPaymentOverview, transactions: UserTransaction[]) => void;

class CentralPaymentManager {
  private transactions: UserTransaction[] = IS_DEMO_MODE ? [...DEMO_USER_TRANSACTIONS] : [];
  private overview: UserPaymentOverview = IS_DEMO_MODE ? { ...DEMO_PAYMENT_OVERVIEW } : EMPTY_PAYMENT_OVERVIEW;
  private subscribers: Set<PaymentSubscriber> = new Set();

  public subscribe(fn: PaymentSubscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private notify() {
    const ov = this.computeOverview();
    const txCopy = [...this.transactions];
    this.subscribers.forEach((fn) => {
      try {
        fn(ov, txCopy);
      } catch {
        // Safe subscriber notification
      }
    });
  }

  public computeOverview(): UserPaymentOverview {
    const totalAmount = this.transactions.reduce((acc, t) => acc + (t.amount || 0), 0);
    const count = this.transactions.length;
    const reviewItems = this.transactions.filter(
      (t) => t.status === "Risk detected" || t.status === "Held"
    );
    const safeCount = this.transactions.filter(
      (t) => t.status === "Safe" || t.status === "Approved by you" || t.status === "Completed"
    );
    const blockedCount = this.transactions.filter((t) => t.status === "Blocked");
    const reportedCount = this.transactions.filter((t) => t.status === "Reported");

    let currentScore = 0;
    let currentLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";

    if (reviewItems.length > 0) {
      const highestItem = reviewItems.reduce((max, cur) => {
        const curScore = cur.riskScore ?? 0;
        const maxScore = max.riskScore ?? 0;
        return curScore > maxScore ? cur : max;
      }, reviewItems[0]);

      currentScore = highestItem.riskScore ?? 0;
      currentLevel = getRiskLevelFromScore(currentScore);
    }

    const protStatus = reviewItems.length > 0 || currentLevel === "HIGH" || currentLevel === "MEDIUM" ? "ATTENTION REQUIRED" : "PROTECTED";

    return {
      totalAmountThisMonth: totalAmount,
      transactionCount: count,
      safeCount: safeCount.length,
      needsReviewCount: reviewItems.length,
      blockedCount: blockedCount.length,
      reportedCount: reportedCount.length,
      currentRiskLevel: currentLevel,
      currentRiskScore: currentScore,
      protectionStatus: protStatus,
    };
  }

  /** GET Overview */
  public async getOverview(userId: number = 1): Promise<UserPaymentOverview> {
    if (IS_DEMO_MODE) {
      this.overview = this.computeOverview();
      return this.overview;
    }

    try {
      const res = await ApiClient.get<any>(`/api/v1/users/${userId}/overview`);
      if (res.data) {
        const ovScore = res.data.current_risk_score ?? 0;
        this.overview = {
          totalAmountThisMonth: res.data.total_amount_this_month ?? 0,
          transactionCount: res.data.transaction_count ?? 0,
          safeCount: res.data.safe_count ?? 0,
          needsReviewCount: res.data.needs_review_count ?? 0,
          blockedCount: res.data.blocked_count ?? 0,
          reportedCount: res.data.reported_count ?? 0,
          currentRiskLevel: getRiskLevelFromScore(ovScore),
          currentRiskScore: ovScore,
          protectionStatus: res.data.protection_status ?? (ovScore >= 31 || res.data.needs_review_count > 0 ? "ATTENTION REQUIRED" : "PROTECTED"),
        };
        return this.overview;
      }
    } catch {
      // Fallback
    }

    return this.overview;
  }

  /** GET Transactions */
  public async getTransactions(
    userId: number = 1,
    filter?: "all" | "review" | "safe" | "completed",
    limit?: number,
    offset?: number
  ): Promise<{ items: UserTransaction[]; total: number }> {
    if (IS_DEMO_MODE) {
      let items = [...this.transactions];
      if (filter === "review") {
        items = items.filter((t) => t.status === "Risk detected" || t.status === "Held");
      } else if (filter === "safe" || filter === "completed") {
        items = items.filter(
          (t) => t.status === "Safe" || t.status === "Approved by you" || t.status === "Completed"
        );
      }
      if (offset !== undefined && limit !== undefined) {
        items = items.slice(offset, offset + limit);
      } else if (limit !== undefined) {
        items = items.slice(0, limit);
      }
      return { items, total: items.length };
    }

    try {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set("limit", String(limit));
      if (offset !== undefined) params.set("offset", String(offset));
      const qs = params.toString();
      const res = await ApiClient.get<{ items: any[]; total: number }>(
        `/api/v1/users/${userId}/transactions${qs ? `?${qs}` : ""}`
      );
      if (res.data && Array.isArray(res.data.items)) {
        let items = res.data.items.map(mapBackendTransaction);
        this.transactions = items;
        if (filter === "review") {
          items = items.filter((t) => t.status === "Risk detected" || t.status === "Held");
        } else if (filter === "safe" || filter === "completed") {
          items = items.filter((t) => t.status === "Safe" || t.status === "Approved by you" || t.status === "Completed");
        }
        this.notify();
        return { items, total: res.data.total };
      }
    } catch {
      // Fallback
    }

    return { items: [], total: 0 };
  }

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
      if (t.id === transactionId || String(t.id) === String(transactionId)) {
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
      if (t.id === transactionId || String(t.id) === String(transactionId)) {
        found = true;
        return {
          ...t,
          status: "Approved by you",
          isCompleted: true,
          paymentAppUsed: paymentAppUsed || t.paymentAppUsed || "Google Pay UPI",
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

  public async authorizeTransaction(
    transactionId: string,
    method: string = "BIOMETRIC"
  ): Promise<{ success: boolean; error?: string }> {
    if (!IS_DEMO_MODE) {
      const res = await ApiClient.post<{
        transaction_id: number;
        status: string;
        authorization_status: string;
        message?: string;
      }>(`/api/v1/transactions/${transactionId}/authorize`, { method });
      if (res.error) {
        return { success: false, error: res.error };
      }
    }

    let found = false;
    this.transactions = this.transactions.map((t) => {
      if (t.id === transactionId || String(t.id) === String(transactionId)) {
        found = true;
        return {
          ...t,
          authorizationStatus: "AUTHORIZED",
          authorizedAt: new Date().toISOString(),
          authorizationMethod: method,
        };
      }
      return t;
    });

    if (found) {
      this.notify();
    }
    return { success: found };
  }

  public async confirmTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    if (!IS_DEMO_MODE) {
      const res = await ApiClient.post<{ status: string; message?: string }>(
        `/api/v1/transactions/${transactionId}/confirm`
      );
      if (res.error) {
        return { success: false, error: res.error };
      }
    }

    const ok = this.updateTransactionStatus(transactionId, "Approved by you");
    return { success: ok };
  }

  public async reportTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    if (!IS_DEMO_MODE) {
      try {
        await ApiClient.post(`/api/v1/transactions/${transactionId}/report`);
      } catch {
        // Fallback
      }
    }

    let reportedTx: UserTransaction | undefined;
    this.transactions = this.transactions.map((t) => {
      if (t.id === transactionId || String(t.id) === String(transactionId)) {
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
      return { success: true };
    }
    return { success: false, error: "Transaction not found" };
  }

  public async cancelTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    if (!IS_DEMO_MODE) {
      try {
        await ApiClient.post(`/api/v1/transactions/${transactionId}/cancel`);
      } catch {
        // Fallback
      }
    }

    const ok = this.updateTransactionStatus(transactionId, "Blocked");
    return { success: ok };
  }
}

export const PaymentService = new CentralPaymentManager();
