import { ApiClient } from "./api-client";

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

export interface RiskFactorItem {
  factor_type: string;
  factor_name: string;
  contribution: number;
  explanation: string;
}

export interface UserTransaction {
  id: string;
  title: string;
  merchant: string;
  amount: number;
  date: string;
  timestamp: string;
  paymentMethod: string;
  status: "Safe" | "Risk detected" | "Approved by you" | "Reported" | "Blocked" | "Held";
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  riskScore?: number; // 0 - 100
  riskFactors: RiskFactorItem[];
  reasons: string[];
}

export const SEED_PAYMENT_OVERVIEW: UserPaymentOverview = {
  totalAmountThisMonth: 48250,
  transactionCount: 24,
  safeCount: 23,
  needsReviewCount: 1,
  blockedCount: 0,
  reportedCount: 0,
  currentRiskLevel: "MEDIUM",
  currentRiskScore: 38.5,
  protectionStatus: "ATTENTION REQUIRED",
};

export const SEED_USER_TRANSACTIONS: UserTransaction[] = [
  {
    id: "txn-1",
    title: "Unknown Merchant",
    merchant: "Unknown Merchant",
    amount: 14200,
    date: "Today · 10 min ago",
    timestamp: new Date().toISOString(),
    paymentMethod: "UPI FastPay",
    status: "Risk detected",
    riskLevel: "HIGH",
    riskScore: 78.4,
    riskFactors: [
      {
        factor_type: "transaction",
        factor_name: "amount_deviation",
        contribution: 45.0,
        explanation: "Unusual amount compared to past 30 days history",
      },
      {
        factor_type: "transaction",
        factor_name: "new_recipient",
        contribution: 30.0,
        explanation: "First time sending money to this recipient identifier",
      },
      {
        factor_type: "device",
        factor_name: "new_device",
        contribution: 25.0,
        explanation: "Unusual transaction velocity and device activity",
      },
    ],
    reasons: ["Unusual amount", "New merchant", "Unusual activity"],
  },
  {
    id: "txn-2",
    title: "Amazon India",
    merchant: "Amazon India",
    amount: 2499,
    date: "Today",
    timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
    paymentMethod: "Google Pay UPI",
    status: "Safe",
    riskLevel: "LOW",
    riskScore: 8.2,
    riskFactors: [],
    reasons: ["Recognized merchant", "Normal spending range"],
  },
  {
    id: "txn-3",
    title: "UPI Transfer",
    merchant: "Rohit Verma",
    amount: 8500,
    date: "Yesterday",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    paymentMethod: "PhonePe",
    status: "Safe",
    riskLevel: "LOW",
    riskScore: 12.0,
    riskFactors: [],
    reasons: ["Frequent contact", "Verified device"],
  },
  {
    id: "txn-4",
    title: "Swiggy Food",
    merchant: "Swiggy",
    amount: 480,
    date: "2 days ago",
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    paymentMethod: "Paytm UPI",
    status: "Safe",
    riskLevel: "LOW",
    riskScore: 4.5,
    riskFactors: [],
    reasons: ["Standard recurring merchant"],
  },
];

export class PaymentService {
  static async getOverview(userId: number = 1): Promise<UserPaymentOverview> {
    const res = await ApiClient.get<any>(`/api/v1/users/${userId}/overview`);
    if (res.data) {
      return {
        totalAmountThisMonth: res.data.total_amount_this_month,
        transactionCount: res.data.transaction_count,
        safeCount: res.data.safe_count,
        needsReviewCount: res.data.needs_review_count,
        blockedCount: res.data.blocked_count,
        reportedCount: res.data.reported_count,
        currentRiskLevel: res.data.current_risk_level as "LOW" | "MEDIUM" | "HIGH",
        currentRiskScore: res.data.current_risk_score,
        protectionStatus: res.data.protection_status as "PROTECTED" | "ATTENTION REQUIRED",
      };
    }
    return SEED_PAYMENT_OVERVIEW;
  }

  static async getTransactions(
    userId: number = 1,
    statusFilter?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ items: UserTransaction[]; total: number }> {
    const url = `/api/v1/users/${userId}/transactions?limit=${limit}&offset=${offset}${
      statusFilter && statusFilter !== "all" ? `&status=${statusFilter}` : ""
    }`;

    const res = await ApiClient.get<{ items: any[]; total: number }>(url);
    if (res.data && Array.isArray(res.data.items) && res.data.items.length > 0) {
      const items: UserTransaction[] = res.data.items.map((t: any) => {
        let displayStatus: UserTransaction["status"] = "Safe";
        if (t.status === "HELD" || t.status === "PENDING" || t.status === "NEEDS_REVIEW") {
          displayStatus = "Risk detected";
        } else if (t.status === "REPORTED" || t.status === "FRAUD") {
          displayStatus = "Reported";
        } else if (t.status === "BLOCKED" || t.status === "CANCELLED") {
          displayStatus = "Blocked";
        } else if (t.status === "CONFIRMED") {
          displayStatus = "Approved by you";
        }

        const reasons =
          t.risk_factors && t.risk_factors.length > 0
            ? t.risk_factors.map((f: any) => f.explanation || f.factor_name)
            : ["Standard transaction verification"];

        return {
          id: String(t.id),
          title: t.merchant || "Payment",
          merchant: t.merchant || "Merchant Payment",
          amount: t.amount,
          date: new Date(t.timestamp).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          }),
          timestamp: t.timestamp,
          paymentMethod: t.payment_method || "UPI",
          status: displayStatus,
          riskLevel: t.risk_level as any,
          riskScore: t.risk_score,
          riskFactors: t.risk_factors || [],
          reasons,
        };
      });

      return { items, total: res.data.total };
    }

    // Filter seed transactions if backend returned empty
    let filtered = [...SEED_USER_TRANSACTIONS];
    if (statusFilter === "review") {
      filtered = filtered.filter((t) => t.status === "Risk detected" || t.status === "Held");
    } else if (statusFilter === "safe") {
      filtered = filtered.filter((t) => t.status === "Safe" || t.status === "Approved by you");
    } else if (statusFilter === "blocked") {
      filtered = filtered.filter((t) => t.status === "Blocked" || t.status === "Reported");
    }

    return { items: filtered, total: filtered.length };
  }

  static async confirmTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    const numId = parseInt(transactionId.replace(/\D/g, ""), 10) || 1;
    const res = await ApiClient.post(`/api/v1/transactions/${numId}/confirm`);
    if (res.data || res.status === 200) {
      return { success: true };
    }
    return { success: res.isNetworkError ?? false, error: res.error };
  }

  static async cancelTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    const numId = parseInt(transactionId.replace(/\D/g, ""), 10) || 1;
    const res = await ApiClient.post(`/api/v1/transactions/${numId}/cancel`);
    if (res.data || res.status === 200) {
      return { success: true };
    }
    return { success: res.isNetworkError ?? false, error: res.error };
  }

  static async reportTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    const numId = parseInt(transactionId.replace(/\D/g, ""), 10) || 1;
    const res = await ApiClient.post(`/api/v1/transactions/${numId}/report`);
    if (res.data || res.status === 200) {
      return { success: true };
    }
    return { success: res.isNetworkError ?? false, error: res.error };
  }
}
