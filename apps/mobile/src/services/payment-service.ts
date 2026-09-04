import {
  ApiClient,
  IS_DEMO_MODE,
  isDemoMode,
  setDemoMode,
  resetDemoMode,
  resolveDemoModeConfiguration,
  DemoModeAudit,
} from "./api-client";
import { AlertService } from "./alert-service";
import {
  DEMO_USER_TRANSACTIONS,
  DEMO_PAYMENT_OVERVIEW,
} from "../data/demo-data";
import {
  CanonicalTransactionStatus,
  PaymentWorkflowStage,
  PaymentWorkflowStageEnum,
  PaymentWorkflowValidationResult,
  validatePaymentAuthorizationStage,
  validatePaymentSubmissionStage,
  validatePaymentCompletionStage,
  assertNotEvaluationStage,
} from "../types/transaction";
import { buildRiskEvaluationPayload } from "./risk-service";
import {
  parseUpiPaymentPayload,
  ParsedUpiPaymentData,
  ParsedUpiPaymentSuccess,
  ParsedUpiPaymentFailure,
  ParsedUpiPaymentResult,
} from "../utils/upi-payload-parser";

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
  canonicalStatus?: CanonicalTransactionStatus;
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
  note?: string;
}

export interface CreateTransactionInput {
  recipient: string;
  amount: number;
  note?: string;
}

export interface CreateTransactionSuccess {
  success: true;
  data: {
    recipient: string;
    amount: number;
    note?: string;
  };
  transaction?: UserTransaction;
}

export interface CreateTransactionFailure {
  success: false;
  error: string;
}

export type CreateTransactionResult = CreateTransactionSuccess | CreateTransactionFailure;

export interface PaymentDraft {
  recipient: string;
  amount: number;
  note?: string;
}

export interface CreatePaymentDraftSuccess {
  success: true;
  draft: PaymentDraft;
}

export interface CreatePaymentDraftFailure {
  success: false;
  error: string;
}

export type CreatePaymentDraftResult = CreatePaymentDraftSuccess | CreatePaymentDraftFailure;

export interface RiskEvaluationRequest {
  draft: PaymentDraft;
}

export interface RiskEvaluationPlaceholder {
  status: "UNAVAILABLE" | "EVALUATED" | string;
  message: string;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  riskScore?: number;
  reasons?: string[];
  summary?: string;
}

export interface RiskEvaluationSuccess {
  success: true;
  data: RiskEvaluationPlaceholder;
}

export interface RiskEvaluationFailure {
  success: false;
  error: string;
}

export type RiskEvaluationResult = RiskEvaluationSuccess | RiskEvaluationFailure;

export const isTransactionTerminal = (
  tx: UserTransaction | { status?: string; isCompleted?: boolean } | null | undefined
): boolean => {
  if (!tx) return false;
  if (tx.isCompleted) return true;
  const s = tx.status;
  return s === "Completed" || s === "Safe" || s === "Blocked" || s === "Reported";
};

export const isTransactionPayable = (tx: UserTransaction | null | undefined): boolean => {
  if (!tx) return false;
  if (isTransactionTerminal(tx)) return false;
  return tx.status === "Held" || tx.status === "Risk detected" || tx.status === "Approved by you";
};

const STATUS_MAP: Record<string, UserTransaction["status"]> = {
  PENDING: "Held",
  AWAITING_CONFIRMATION: "Held",
  PENDING_AUTHORIZATION: "Held",
  AUTHORIZED: "Held",
  PENDING_GUARDIAN_APPROVAL: "Held",
  // AVARAN PAY spec addition: UPI app launched, awaiting return/confirmation.
  PAYMENT_PENDING: "Held",
  ALLOWED: "Safe",
  CONFIRMED: "Completed",
  // AVARAN PAY spec addition: final immutable record, one step after CONFIRMED.
  COMPLETED: "Completed",
  GUARDIAN_APPROVED: "Approved by you",
  CANCELLED: "Blocked",
  GUARDIAN_REJECTED: "Blocked",
  // AVARAN PAY spec addition: replaces GUARDIAN_TIMEOUT_USER_OVERRODE, which
  // no longer exists backend-side — expiry is now a hard stop, not an
  // override the user could proceed past.
  GUARDIAN_TIMEOUT: "Blocked",
  BLOCKED: "Blocked",
  REPORTED: "Reported",
};

import { getRiskLevelFromScore } from "../utils/risk-scoring";

export const mapBackendTransaction = (t: any): UserTransaction => {
  const status = STATUS_MAP[String(t.status).toUpperCase()] || "Held";
  const rawRiskScore = typeof t.risk_score === "number" ? Math.round(t.risk_score * 10) / 10 : (t.risk_score !== undefined ? Number(t.risk_score) : 0);
  const riskLevel: "LOW" | "MEDIUM" | "HIGH" = getRiskLevelFromScore(rawRiskScore);

  // Only HIGH risk transactions with status 'Held' map to 'Risk detected'.
  // MEDIUM risk transactions remain 'Held' (payable) and are never mapped to 'Risk detected' or 'Safe'.
  let resolvedStatus = status;
  if (riskLevel === "HIGH" && status === "Held") {
    resolvedStatus = "Risk detected";
  } else if (riskLevel === "MEDIUM" && status === "Risk detected") {
    resolvedStatus = "Held";
  }

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

  const isTerminal = isTransactionTerminal({ status: resolvedStatus });

  return {
    id: String(t.id),
    title: t.merchant || "UPI Payment",
    merchant: t.merchant || "UPI Payment",
    amount: Number(t.amount) || 0,
    date: t.timestamp ? new Date(t.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Today",
    timestamp: t.timestamp || new Date().toISOString(),
    paymentMethod: t.payment_method || "UPI",
    status: resolvedStatus,
    riskLevel: riskLevel,
    riskScore: rawRiskScore,
    riskFactors: factors,
    reasons: reasons,
    isCompleted: isTerminal,
    completionTimestamp: isTerminal ? t.timestamp : undefined,
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
  private submittingTransactionIds: Set<string> = new Set();
  private confirmingTransactionIds: Set<string> = new Set();

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

    return { items: [...this.transactions], total: this.transactions.length };
  }

  /**
   * Validates and registers a new transaction input contract.
   *
   * Rules:
   * - Trims recipient and note.
   * - Rejects an empty recipient.
   * - Rejects an amount that is not finite or is less than or equal to zero.
   * - Returns a clear, typed result ({ success: false, error: string }) for invalid input.
   * - Does not create or insert a transaction when validation fails.
   * - Does not fabricate arbitrary risk/status values into the store without evaluation.
   */
  public createTransaction(input: CreateTransactionInput): CreateTransactionResult {
    if (!input || typeof input !== "object") {
      return { success: false, error: "Recipient UPI ID or merchant name is required" };
    }

    const recipient = typeof input.recipient === "string" ? input.recipient.trim() : "";
    if (!recipient) {
      return { success: false, error: "Recipient UPI ID or merchant name is required" };
    }

    const amount = typeof input.amount === "number" ? input.amount : Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: "Transaction amount must be a positive finite number" };
    }

    const rawNote = typeof input.note === "string" ? input.note.trim() : undefined;
    const note = rawNote && rawNote.length > 0 ? rawNote : undefined;

    return {
      success: true,
      data: {
        recipient,
        amount,
        ...(note !== undefined ? { note } : {}),
      },
    };
  }

  /**
   * Converts validated CreateTransactionInput into a non-persisted PaymentDraft.
   * Reuses createTransaction() validation. Does not insert transactions or generate IDs/statuses.
   */
  public createPaymentDraft(input: CreateTransactionInput): CreatePaymentDraftResult {
    const res = this.createTransaction(input);
    if (!res.success) {
      return { success: false, error: res.error };
    }

    const draft: PaymentDraft = {
      recipient: res.data.recipient,
      amount: res.data.amount,
      ...(res.data.note !== undefined ? { note: res.data.note } : {}),
    };

    return {
      success: true,
      draft,
    };
  }

  /**
   * Risk-evaluation boundary contract.
   *
   * Accepts a validated PaymentDraft, performs no risk calculation, makes no backend call,
   * inserts no transaction, fabricates no risk/status/ID fields, and returns an explicit
   * UNAVAILABLE placeholder result.
   */
  public evaluatePaymentDraft(request: RiskEvaluationRequest): RiskEvaluationResult {
    if (!request || !request.draft || typeof request.draft !== "object") {
      return {
        success: false,
        error: "Risk evaluation request must provide a valid payment draft.",
      };
    }

    const { recipient, amount } = request.draft;
    if (typeof recipient !== "string" || !recipient.trim()) {
      return {
        success: false,
        error: "Payment draft must have a valid recipient for evaluation.",
      };
    }

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return {
        success: false,
        error: "Payment draft must have a valid positive amount for evaluation.",
      };
    }

    return {
      success: true,
      data: {
        status: "UNAVAILABLE",
        message: "AVARAN PAY risk evaluation is currently unavailable.",
      },
    };
  }

  /**
   * Parses a raw UPI payment payload using the centralized parser contract.
   */
  public parseUpiPayload(payload: string): ParsedUpiPaymentResult {
    return parseUpiPaymentPayload(payload);
  }

  public addTransaction(newTx: UserTransaction) {
    this.transactions = [newTx, ...this.transactions];
    this.notify();
  }

  public updateTransactionStatus(
    transactionId: string,
    status: UserTransaction["status"]
  ): boolean {
    const isTerminal = isTransactionTerminal({ status });
    let found = false;
    this.transactions = this.transactions.map((t) => {
      if (t.id === transactionId || String(t.id) === String(transactionId)) {
        found = true;
        return {
          ...t,
          status,
          isCompleted: isTerminal,
          completionTimestamp: isTerminal ? new Date().toISOString() : t.completionTimestamp,
        };
      }
      return t;
    });

    if (found) {
      if (isTerminal) {
        AlertService.resolveAlertForTransaction(transactionId);
      }
      this.notify();
    }
    return found;
  }

  public async completeTransaction(
    transactionId: string,
    paymentAppUsed?: string,
    trustedDetails?: TrustedApprovalAudit,
    stage?: PaymentWorkflowStage | { stage?: any } | string | null,
    options?: { hasActiveContext?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    if (!transactionId || String(transactionId).trim() === "") {
      return { success: false, error: "Missing transaction ID" };
    }

    const txKey = String(transactionId);

    // Concurrency lock: prevent duplicate completion while an existing call is in-flight
    if (this.confirmingTransactionIds.has(txKey)) {
      return { success: false, error: "Payment confirmation already in progress" };
    }

    // Find existing transaction
    const targetTx = this.transactions.find(
      (t) => t.id === transactionId || String(t.id) === txKey
    );
    if (!targetTx) {
      return { success: false, error: "Transaction not found" };
    }

    // Terminal status check: do NOT complete already completed, cancelled, failed, or reported transactions
    const rawStatus = String(targetTx.canonicalStatus || targetTx.status || "").toUpperCase();
    if (
      targetTx.isCompleted ||
      rawStatus === "CONFIRMED" ||
      rawStatus === "COMPLETED" ||
      rawStatus === "CANCELLED" ||
      rawStatus === "FAILED" ||
      rawStatus === "REPORTED" ||
      isTransactionTerminal({
        status: targetTx.canonicalStatus || (targetTx.status as any),
        isCompleted: targetTx.isCompleted,
      })
    ) {
      return {
        success: false,
        error: `Cannot complete transaction in terminal status '${targetTx.canonicalStatus || targetTx.status}'`,
      };
    }

    // Check active manual-confirmation context if explicitly provided
    if (
      (targetTx.canonicalStatus === "PAYMENT_APP_PENDING" || rawStatus === "PAYMENT_APP_PENDING") &&
      options?.hasActiveContext === false
    ) {
      return {
        success: false,
        error: "No active manual-confirmation context for pending payment",
      };
    }

    const stageToValidate =
      stage !== undefined
        ? stage
        : typeof paymentAppUsed === "object" && paymentAppUsed !== null && "stage" in (paymentAppUsed as any)
        ? paymentAppUsed
        : paymentAppUsed === "EVALUATION_COMPLETED" ||
          paymentAppUsed === "PAYMENT_AUTHORIZED" ||
          paymentAppUsed === "PAYMENT_SUBMITTED" ||
          paymentAppUsed === "PAYMENT_COMPLETED" ||
          paymentAppUsed === "LOW" ||
          paymentAppUsed === "MEDIUM" ||
          paymentAppUsed === "HIGH"
        ? paymentAppUsed
        : undefined;

    if (stageToValidate !== undefined) {
      const validation = validatePaymentCompletionStage(stageToValidate);
      if (!validation.valid) {
        return { success: false, error: validation.error || "Invalid workflow stage for payment completion" };
      }
    }

    this.confirmingTransactionIds.add(txKey);

    try {
      const demoActive = isDemoMode();

      // In production/live mode: backend confirmation is mandatory.
      // Network failure, offline state, or server error must NEVER silently fall back to local confirmation.
      if (!demoActive) {
        try {
          const payload = CentralPaymentManager.buildConfirmationPayload(
            (typeof paymentAppUsed === "string" && stageToValidate === undefined ? paymentAppUsed : undefined) || "Google Pay UPI"
          );
          const res = await ApiClient.post<{ id: number; status: string; message?: string }>(
            `/api/v1/transactions/${transactionId}/confirm`,
            payload
          );
          if (res.error) {
            return {
              success: false,
              error: res.error || "Backend confirmation required in live mode. Payment remains pending.",
            };
          }
        } catch (err: any) {
          return {
            success: false,
            error: err?.message || "Network error during confirmation. Payment remains pending.",
          };
        }
      }

      let found = false;
      this.transactions = this.transactions.map((t) => {
        if (t.id === transactionId || String(t.id) === txKey) {
          found = true;
          return {
            ...t,
            status: "Completed",
            canonicalStatus: "CONFIRMED",
            isCompleted: true,
            paymentAppUsed:
              (typeof paymentAppUsed === "string" && stageToValidate === undefined ? paymentAppUsed : undefined) ||
              t.paymentAppUsed ||
              "Google Pay UPI",
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
      return { success: found };
    } finally {
      this.confirmingTransactionIds.delete(txKey);
    }
  }

  public async authorizeTransaction(
    transactionId: string,
    methodOrStage: string | { stage?: any } = "BIOMETRIC",
    explicitStage?: PaymentWorkflowStage | { stage?: any } | string | null
  ): Promise<{ success: boolean; error?: string }> {
    const stageToValidate =
      explicitStage !== undefined
        ? explicitStage
        : typeof methodOrStage === "object" && methodOrStage !== null && "stage" in (methodOrStage as any)
        ? methodOrStage
        : methodOrStage === "EVALUATION_COMPLETED" ||
          methodOrStage === "PAYMENT_AUTHORIZED" ||
          methodOrStage === "PAYMENT_SUBMITTED" ||
          methodOrStage === "PAYMENT_COMPLETED" ||
          methodOrStage === "LOW" ||
          methodOrStage === "MEDIUM" ||
          methodOrStage === "HIGH"
        ? methodOrStage
        : undefined;

    const method =
      typeof methodOrStage === "string" &&
      methodOrStage !== "EVALUATION_COMPLETED" &&
      methodOrStage !== "PAYMENT_AUTHORIZED" &&
      methodOrStage !== "PAYMENT_SUBMITTED" &&
      methodOrStage !== "PAYMENT_COMPLETED" &&
      methodOrStage !== "LOW" &&
      methodOrStage !== "MEDIUM" &&
      methodOrStage !== "HIGH"
        ? methodOrStage
        : "BIOMETRIC";

    if (stageToValidate !== undefined) {
      const validation = validatePaymentAuthorizationStage(stageToValidate);
      if (!validation.valid) {
        return { success: false, error: validation.error || "Invalid workflow stage for payment authorization" };
      }
    }

    if (!isDemoMode()) {
      try {
        const payload = CentralPaymentManager.buildAuthorizationPayload(method);
        const res = await ApiClient.post<{
          transaction_id: number;
          status: string;
          authorization_status: string;
          message?: string;
        }>(`/api/v1/transactions/${transactionId}/authorize`, payload);
        if (res.error && !res.error.includes("Unable to connect")) {
          return { success: false, error: res.error };
        }
      } catch {
        // Fallback
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

  public async submitTransaction(
    transactionId: string,
    stageOrApp?: PaymentWorkflowStage | { stage?: any } | string | null,
    paymentAppUsed?: string
  ): Promise<{ success: boolean; error?: string }> {
    let stageToValidate: any = undefined;
    let actualApp = paymentAppUsed || "Google Pay UPI";

    if (stageOrApp !== undefined) {
      if (
        typeof stageOrApp === "object" ||
        stageOrApp === null ||
        paymentAppUsed !== undefined ||
        (typeof stageOrApp === "string" && (stageOrApp.includes("_") || stageOrApp.toUpperCase() === stageOrApp))
      ) {
        stageToValidate = stageOrApp;
      } else {
        actualApp = stageOrApp;
      }
    }

    if (stageToValidate !== undefined) {
      const validation = validatePaymentSubmissionStage(stageToValidate);
      if (!validation.valid) {
        return { success: false, error: validation.error || "Invalid workflow stage for payment submission" };
      }
    }

    const txKey = String(transactionId);
    if (this.submittingTransactionIds.has(txKey)) {
      return { success: false, error: "Payment submission already in progress" };
    }

    this.submittingTransactionIds.add(txKey);

    try {
      if (!isDemoMode()) {
        try {
          const payload = CentralPaymentManager.buildSubmissionPayload(actualApp);
          const res = await ApiClient.post<{
            transaction_id: number;
            stage: string;
            status: string;
            payment_app_used?: string;
            message?: string;
          }>(`/api/v1/transactions/${transactionId}/submit`, payload);

          if (res.error && !res.error.includes("Unable to connect")) {
            return { success: false, error: res.error };
          }
        } catch (err: any) {
          return { success: false, error: err?.message || "Failed to submit transaction to backend" };
        }
      }

      let found = false;
      this.transactions = this.transactions.map((t) => {
        if (t.id === transactionId || String(t.id) === String(transactionId)) {
          found = true;
          return {
            ...t,
            canonicalStatus: "PAYMENT_APP_PENDING",
            paymentAppUsed: actualApp,
          };
        }
        return t;
      });

      if (found) {
        this.notify();
      }
      return { success: found };
    } finally {
      this.submittingTransactionIds.delete(txKey);
    }
  }

  public async confirmTransaction(
    transactionId: string,
    stage?: PaymentWorkflowStage | { stage?: any } | string | null,
    options?: { hasActiveContext?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    if (stage !== undefined) {
      const validation = validatePaymentCompletionStage(stage);
      if (!validation.valid) {
        return { success: false, error: validation.error || "Invalid workflow stage for payment confirmation" };
      }
    }
    return this.completeTransaction(transactionId, undefined, undefined, stage, options);
  }

  public async reportTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    if (!isDemoMode()) {
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
    if (!isDemoMode()) {
      try {
        await ApiClient.post(`/api/v1/transactions/${transactionId}/cancel`);
      } catch {
        // Fallback
      }
    }

    const ok = this.updateTransactionStatus(transactionId, "Blocked");
    return { success: ok };
  }

  /**
   * Runtime guard validating payment workflow stages against unauthorized evaluation execution.
   */
  public validateWorkflowStage(
    operation: "authorize" | "submit" | "complete",
    stageOrObject?: PaymentWorkflowStage | { stage?: PaymentWorkflowStage | string | null } | string | null
  ): PaymentWorkflowValidationResult {
    switch (operation) {
      case "authorize":
        return validatePaymentAuthorizationStage(stageOrObject);
      case "submit":
        return validatePaymentSubmissionStage(stageOrObject);
      case "complete":
        return validatePaymentCompletionStage(stageOrObject);
      default:
        return { valid: false, error: `Unknown payment operation '${operation}'` };
    }
  }

  /**
   * Builds the canonical payload for the payment authorization API endpoint.
   * Required stage: "PAYMENT_AUTHORIZED".
   */
  public static buildAuthorizationPayload(method: string = "BIOMETRIC"): {
    method: string;
    stage: PaymentWorkflowStage;
  } {
    return {
      method,
      stage: PaymentWorkflowStageEnum.PAYMENT_AUTHORIZED,
    };
  }

  /**
   * Builds the canonical payload for the payment submission API endpoint.
   * Required stage: "PAYMENT_SUBMITTED".
   */
  public static buildSubmissionPayload(paymentAppUsed: string = "Google Pay UPI"): {
    stage: PaymentWorkflowStage;
    payment_app_used?: string;
  } {
    return {
      stage: PaymentWorkflowStageEnum.PAYMENT_SUBMITTED,
      payment_app_used: paymentAppUsed,
    };
  }

  /**
   * Builds the canonical payload for the payment confirmation API endpoint.
   * Required stage: "PAYMENT_COMPLETED".
   */
  public static buildConfirmationPayload(paymentAppUsed: string = "Google Pay UPI"): {
    stage: PaymentWorkflowStage;
    payment_app_used?: string;
  } {
    return {
      stage: PaymentWorkflowStageEnum.PAYMENT_COMPLETED,
      payment_app_used: paymentAppUsed,
    };
  }

  public buildAuthorizationPayload(method: string = "BIOMETRIC") {
    return CentralPaymentManager.buildAuthorizationPayload(method);
  }

  public buildSubmissionPayload(paymentAppUsed: string = "Google Pay UPI") {
    return CentralPaymentManager.buildSubmissionPayload(paymentAppUsed);
  }

  public buildConfirmationPayload(paymentAppUsed: string = "Google Pay UPI") {
    return CentralPaymentManager.buildConfirmationPayload(paymentAppUsed);
  }
}

export const PaymentService = new CentralPaymentManager();
export const createPaymentDraft = (input: CreateTransactionInput): CreatePaymentDraftResult => {
  return PaymentService.createPaymentDraft(input);
};
export const evaluatePaymentDraft = (request: RiskEvaluationRequest): RiskEvaluationResult => {
  return PaymentService.evaluatePaymentDraft(request);
};
export const authorizePaymentTransaction = (
  transactionId: string,
  methodOrStage?: string | { stage?: any },
  explicitStage?: PaymentWorkflowStage | { stage?: any } | string | null
): Promise<{ success: boolean; error?: string }> => {
  return PaymentService.authorizeTransaction(transactionId, methodOrStage, explicitStage);
};
export const submitPaymentTransaction = (
  transactionId: string,
  stageOrApp?: PaymentWorkflowStage | { stage?: any } | string | null,
  paymentAppUsed?: string
): Promise<{ success: boolean; error?: string }> => {
  return PaymentService.submitTransaction(transactionId, stageOrApp, paymentAppUsed);
};
export const completePaymentTransaction = (
  transactionId: string,
  paymentAppUsed?: string,
  trustedDetails?: TrustedApprovalAudit,
  stage?: PaymentWorkflowStage | { stage?: any } | string | null,
  options?: { hasActiveContext?: boolean }
): Promise<{ success: boolean; error?: string }> => {
  return PaymentService.completeTransaction(transactionId, paymentAppUsed, trustedDetails, stage, options);
};

export const buildPaymentAuthorizationPayload = CentralPaymentManager.buildAuthorizationPayload;
export const buildPaymentSubmissionPayload = CentralPaymentManager.buildSubmissionPayload;
export const buildPaymentConfirmationPayload = CentralPaymentManager.buildConfirmationPayload;
export { buildRiskEvaluationPayload };
export {
  isDemoMode,
  setDemoMode,
  resetDemoMode,
  resolveDemoModeConfiguration,
  DemoModeAudit,
};

export {
  parseUpiPaymentPayload,
  ParsedUpiPaymentData,
  ParsedUpiPaymentSuccess,
  ParsedUpiPaymentFailure,
  ParsedUpiPaymentResult,
};

export {
  PaymentWorkflowStage,
  PaymentWorkflowStageEnum,
  PaymentWorkflowValidationResult,
  isEvaluationStage,
  isPaymentAuthorizedStage,
  isPaymentSubmittedStage,
  isPaymentCompletedStage,
  isEvaluationAuthorized,
  isEvaluationCompleted,
  validatePaymentAuthorizationStage,
  validatePaymentSubmissionStage,
  validatePaymentCompletionStage,
  assertNotEvaluationStage,
} from "../types/transaction";

