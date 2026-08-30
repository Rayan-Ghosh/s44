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
    isCompleted: false,
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
    reasons: ["Unusual amount (7.2× above normal)", "New recipient handle", "New device fingerprint"],
    trustedApproval: {
      required: true,
      contactName: "Priya Sharma",
      notes: "Pending guardian verification",
    },
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
    isCompleted: true,
    paymentAppUsed: "Google Pay",
    completionTimestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
    riskFactors: [],
    reasons: ["Recognized merchant", "Normal spending range"],
    trustedApproval: {
      required: false,
      notes: "Standard recognized merchant",
    },
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
    isCompleted: true,
    paymentAppUsed: "PhonePe",
    completionTimestamp: new Date(Date.now() - 86400000).toISOString(),
    riskFactors: [],
    reasons: ["Frequent contact", "Verified device"],
    trustedApproval: {
      required: false,
    },
  },
  {
    id: "txn-4",
    title: "Swiggy India",
    merchant: "Swiggy India",
    amount: 480,
    date: "2 days ago",
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    paymentMethod: "Paytm UPI",
    status: "Safe",
    riskLevel: "LOW",
    riskScore: 4.5,
    isCompleted: true,
    paymentAppUsed: "Paytm Payments",
    completionTimestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    riskFactors: [],
    reasons: ["Verified merchant", "Small ticket transaction"],
    trustedApproval: {
      required: false,
    },
  },
  {
    id: "txn-5",
    title: "BESCOM Electricity Bill",
    merchant: "BESCOM Bangalore",
    amount: 1850,
    date: "3 days ago",
    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
    paymentMethod: "BHIM UPI",
    status: "Safe",
    riskLevel: "LOW",
    riskScore: 5.0,
    isCompleted: true,
    paymentAppUsed: "BHIM UPI",
    completionTimestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
    riskFactors: [],
    reasons: ["Government verified utility provider"],
    trustedApproval: {
      required: false,
    },
  },
  {
    id: "txn-6",
    title: "Flipkart Internet Pvt Ltd",
    merchant: "Flipkart",
    amount: 3290,
    date: "4 days ago",
    timestamp: new Date(Date.now() - 86400000 * 4).toISOString(),
    paymentMethod: "Google Pay UPI",
    status: "Safe",
    riskLevel: "LOW",
    riskScore: 6.8,
    isCompleted: true,
    paymentAppUsed: "Google Pay",
    completionTimestamp: new Date(Date.now() - 86400000 * 4).toISOString(),
    riskFactors: [],
    reasons: ["Verified e-commerce platform"],
    trustedApproval: {
      required: false,
    },
  },
  {
    id: "txn-7",
    title: "Zomato Online",
    merchant: "Zomato India",
    amount: 620,
    date: "5 days ago",
    timestamp: new Date(Date.now() - 86400000 * 5).toISOString(),
    paymentMethod: "PhonePe",
    status: "Safe",
    riskLevel: "LOW",
    riskScore: 5.2,
    isCompleted: true,
    paymentAppUsed: "PhonePe",
    completionTimestamp: new Date(Date.now() - 86400000 * 5).toISOString(),
    riskFactors: [],
    reasons: ["Frequent food delivery merchant"],
    trustedApproval: {
      required: false,
    },
  },
  {
    id: "txn-8",
    title: "Airtel Prepaid Recharge",
    merchant: "Bharti Airtel",
    amount: 719,
    date: "6 days ago",
    timestamp: new Date(Date.now() - 86400000 * 6).toISOString(),
    paymentMethod: "Paytm UPI",
    status: "Safe",
    riskLevel: "LOW",
    riskScore: 4.1,
    isCompleted: true,
    paymentAppUsed: "Paytm Payments",
    completionTimestamp: new Date(Date.now() - 86400000 * 6).toISOString(),
    riskFactors: [],
    reasons: ["Recurring monthly recharge handle"],
    trustedApproval: {
      required: false,
    },
  },
  {
    id: "txn-9",
    title: "Apollo Pharmacy",
    merchant: "Apollo Pharmacy",
    amount: 1450,
    date: "1 week ago",
    timestamp: new Date(Date.now() - 86400000 * 7).toISOString(),
    paymentMethod: "Google Pay UPI",
    status: "Safe",
    riskLevel: "LOW",
    riskScore: 7.0,
    isCompleted: true,
    paymentAppUsed: "Google Pay",
    completionTimestamp: new Date(Date.now() - 86400000 * 7).toISOString(),
    riskFactors: [],
    reasons: ["Verified healthcare merchant"],
    trustedApproval: {
      required: false,
    },
  },
  {
    id: "txn-10",
    title: "Uber India Mobility",
    merchant: "Uber India",
    amount: 340,
    date: "1 week ago",
    timestamp: new Date(Date.now() - 86400000 * 8).toISOString(),
    paymentMethod: "PhonePe",
    status: "Safe",
    riskLevel: "LOW",
    riskScore: 4.8,
    isCompleted: true,
    paymentAppUsed: "PhonePe",
    completionTimestamp: new Date(Date.now() - 86400000 * 8).toISOString(),
    riskFactors: [],
    reasons: ["Verified transportation gateway"],
    trustedApproval: {
      required: false,
    },
  },
  {
    id: "txn-11",
    title: "Cult.fit Healthcare",
    merchant: "Curefit Healthcare",
    amount: 12500,
    date: "2 weeks ago",
    timestamp: new Date(Date.now() - 86400000 * 14).toISOString(),
    paymentMethod: "BHIM UPI",
    status: "Safe",
    riskLevel: "LOW",
    riskScore: 14.5,
    isCompleted: true,
    paymentAppUsed: "BHIM UPI",
    completionTimestamp: new Date(Date.now() - 86400000 * 14).toISOString(),
    riskFactors: [],
    reasons: ["Verified fitness merchant handle", "Annual membership"],
    trustedApproval: {
      required: true,
      contactName: "Priya Sharma",
      decision: "Approved",
      decisionTime: "2 weeks ago",
      notes: "Approved by trusted contact for annual plan",
    },
  },
  {
    id: "txn-12",
    title: "BookMyShow Entertainment",
    merchant: "Bigtree Entertainment",
    amount: 920,
    date: "2 weeks ago",
    timestamp: new Date(Date.now() - 86400000 * 15).toISOString(),
    paymentMethod: "Google Pay UPI",
    status: "Safe",
    riskLevel: "LOW",
    riskScore: 6.0,
    isCompleted: true,
    paymentAppUsed: "Google Pay",
    completionTimestamp: new Date(Date.now() - 86400000 * 15).toISOString(),
    riskFactors: [],
    reasons: ["Verified ticketing merchant"],
    trustedApproval: {
      required: false,
    },
  },
  {
    id: "txn-13",
    title: "Nature Basket Grocery",
    merchant: "Nature Basket",
    amount: 1539,
    date: "3 weeks ago",
    timestamp: new Date(Date.now() - 86400000 * 21).toISOString(),
    paymentMethod: "PhonePe",
    status: "Safe",
    riskLevel: "LOW",
    riskScore: 5.9,
    isCompleted: true,
    paymentAppUsed: "PhonePe",
    completionTimestamp: new Date(Date.now() - 86400000 * 21).toISOString(),
    riskFactors: [],
    reasons: ["Verified retail grocery store"],
    trustedApproval: {
      required: false,
    },
  },
];

export const SEED_PAYMENT_OVERVIEW: UserPaymentOverview = {
  totalAmountThisMonth: 48907,
  transactionCount: 13,
  safeCount: 12,
  needsReviewCount: 1,
  blockedCount: 0,
  reportedCount: 0,
  currentRiskLevel: "HIGH",
  currentRiskScore: 78.4,
  protectionStatus: "ATTENTION REQUIRED",
};

type PaymentSubscriber = (overview: UserPaymentOverview, transactions: UserTransaction[]) => void;

class CentralPaymentManager {
  private transactions: UserTransaction[] = [...SEED_USER_TRANSACTIONS];
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

    const hasRisk = reviewItems.length > 0;
    const currentScore = hasRisk ? reviewItems[0].riskScore || 78.4 : 8.2;
    const currentLevel = hasRisk ? "HIGH" : "LOW";
    const protStatus = hasRisk ? "ATTENTION REQUIRED" : "PROTECTED";

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

  public async getOverview(_userId?: number): Promise<UserPaymentOverview> {
    try {
      const resp = await (ApiClient as any).getOverview?.();
      if (resp && resp.overview) {
        return resp.overview;
      }
    } catch {
      // Fallback to local store
    }
    return this.computeOverview();
  }

  public async getTransactions(
    _userId?: number,
    filter?: "all" | "review" | "safe" | "completed",
    limit?: number,
    offset?: number
  ): Promise<{ items: UserTransaction[]; total: number }> {
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

  public async confirmTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await (ApiClient as any).confirmPayment?.(Number(transactionId.replace(/\D/g, "")) || 1);
    } catch {
      // Offline fallback
    }

    const ok = this.updateTransactionStatus(transactionId, "Approved by you");
    return { success: ok };
  }

  public async reportTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await (ApiClient as any).reportFraud?.(Number(transactionId.replace(/\D/g, "")) || 1);
    } catch {
      // Offline fallback
    }

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
      return { success: true };
    }
    return { success: false, error: "Transaction not found" };
  }

  public async cancelTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    const ok = this.updateTransactionStatus(transactionId, "Blocked");
    return { success: ok };
  }
}

export const PaymentService = new CentralPaymentManager();
