/**
 * AVARAN PAY — Safe UPI Return Handling Helper (Part 4U)
 *
 * Implements robust detection and handling of UPI app return events:
 * - App returning from background (AppState lifecycle)
 * - Supported deep-link return URLs (Linking API)
 * - Strict verification that transaction is awaiting return
 * - Non-inferential policy: return NEVER implies confirmation/completion
 * - Rejection of malformed, unknown, or cancelled return payloads
 * - Duplicate event suppression (lifecycle/deep-link debouncing)
 * - Safe transition preservation in PAYMENT_APP_PENDING state
 */

import {
  UserTransaction,
  isTransactionTerminal,
  PaymentWorkflowStage,
} from "../services/payment-service";

export type UpiReturnStatus =
  | "SUCCESS"
  | "FAILURE"
  | "CANCELLED"
  | "PENDING"
  | "UNKNOWN";

export interface ParsedUpiReturnData {
  rawUrl: string;
  status: UpiReturnStatus;
  txnId?: string;
  responseCode?: string;
  approvalRefNo?: string;
  isExplicitFailure: boolean;
  isExplicitSuccess: boolean;
}

export interface ParsedUpiReturnResult {
  valid: boolean;
  data?: ParsedUpiReturnData;
  error?: string;
}

/**
 * Standard message displayed to user upon returning from external payment app.
 */
export const UPI_RETURN_PROMPT_MESSAGE =
  "You returned to AVARAN. Confirm whether the payment was completed.";

export const UPI_RETURN_CANCELLED_MESSAGE =
  "Payment was cancelled in the external app. Confirm or retry in AVARAN.";

export const UPI_RETURN_FAILED_MESSAGE =
  "External payment was not completed. Confirm or retry in AVARAN.";

/**
 * Parses and normalizes a potential UPI deep-link return URL.
 *
 * Handles schemes like:
 * - avaran://upi-return?...
 * - avaran://payment-return?...
 * - avaran://payment/callback?...
 * - upi://pay?...
 */
export function parseUpiReturnUrl(url?: string | null): ParsedUpiReturnResult {
  if (!url || typeof url !== "string" || !url.trim()) {
    return { valid: false, error: "Missing or empty return URL" };
  }

  const cleanUrl = url.trim();

  // Basic URI format check
  if (!cleanUrl.includes("://")) {
    return { valid: false, error: "Malformed URL: missing scheme separator" };
  }

  try {
    const qIndex = cleanUrl.indexOf("?");
    const queryString = qIndex !== -1 ? cleanUrl.substring(qIndex + 1) : "";
    const params = new URLSearchParams(queryString);

    // Extract status indicators across common UPI parameters
    const rawStatus = (
      params.get("status") ||
      params.get("Status") ||
      params.get("st") ||
      params.get("txnStatus") ||
      ""
    ).toUpperCase();

    const responseCode =
      params.get("responseCode") ||
      params.get("ResponseCode") ||
      params.get("rc") ||
      undefined;

    const approvalRefNo =
      params.get("approvalRefNo") ||
      params.get("ApprovalRefNo") ||
      params.get("refId") ||
      undefined;

    const txnId =
      params.get("txnId") ||
      params.get("transactionId") ||
      params.get("tr") ||
      undefined;

    let status: UpiReturnStatus = "UNKNOWN";
    let isExplicitFailure = false;
    let isExplicitSuccess = false;

    if (rawStatus.includes("SUCCESS") || responseCode === "0" || responseCode === "00") {
      status = "SUCCESS";
      isExplicitSuccess = true;
    } else if (rawStatus.includes("CANCEL")) {
      status = "CANCELLED";
      isExplicitFailure = true;
    } else if (
      rawStatus.includes("FAIL") ||
      rawStatus.includes("DECLINE") ||
      rawStatus.includes("REJECT")
    ) {
      status = "FAILURE";
      isExplicitFailure = true;
    } else if (rawStatus.includes("PENDING") || rawStatus.includes("SUBMITTED")) {
      status = "PENDING";
    }

    return {
      valid: true,
      data: {
        rawUrl: cleanUrl,
        status,
        txnId,
        responseCode,
        approvalRefNo,
        isExplicitFailure,
        isExplicitSuccess,
      },
    };
  } catch (err: any) {
    return { valid: false, error: `Malformed return URL: ${err?.message || "parse error"}` };
  }
}

/**
 * Checks whether an incoming return event should be processed.
 */
export function canProcessUpiReturn(params: {
  isAwaitingReturn: boolean;
  transaction: UserTransaction | null;
  lastProcessedAt?: number;
  minDebounceMs?: number;
}): boolean {
  const { isAwaitingReturn, transaction, lastProcessedAt = 0, minDebounceMs = 800 } = params;

  if (!isAwaitingReturn || !transaction) {
    return false;
  }

  // Do not mutate or reopen terminal transactions
  if (isTransactionTerminal({
    status: transaction.canonicalStatus || (transaction.status as any),
    isCompleted: transaction.isCompleted,
  })) {
    return false;
  }

  // Debounce rapid duplicate events (e.g. AppState active + Linking url firing together)
  const now = Date.now();
  if (now - lastProcessedAt < minDebounceMs) {
    return false;
  }

  return true;
}

/**
 * Stateful manager tracking awaiting-return transactions and deduplicating return events.
 */
export class UpiReturnManager {
  private _isAwaitingReturn: boolean = false;
  private _awaitingTransactionId: string | null = null;
  private _lastProcessedTimestamp: number = 0;
  private _lastProcessedUrl: string | null = null;
  private _debounceWindowMs: number = 800;

  private _isConfirming: boolean = false;
  private _confirmingTransactionId: string | null = null;

  public startAwaitingReturn(transactionId: string): void {
    this._isAwaitingReturn = true;
    this._awaitingTransactionId = String(transactionId);
    this._lastProcessedTimestamp = 0;
    this._lastProcessedUrl = null;
    this._isConfirming = false;
    this._confirmingTransactionId = null;
  }

  public clearAwaitingReturn(): void {
    this._isAwaitingReturn = false;
    this._awaitingTransactionId = null;
    this._lastProcessedUrl = null;
    this._isConfirming = false;
    this._confirmingTransactionId = null;
  }

  public isAwaiting(transactionId?: string): boolean {
    if (!this._isAwaitingReturn) return false;
    if (transactionId !== undefined && this._awaitingTransactionId !== null) {
      return this._awaitingTransactionId === String(transactionId);
    }
    return this._isAwaitingReturn;
  }

  public getAwaitingTransactionId(): string | null {
    return this._awaitingTransactionId;
  }

  public isConfirming(transactionId?: string): boolean {
    if (!this._isConfirming) return false;
    if (transactionId !== undefined && this._confirmingTransactionId !== null) {
      return this._confirmingTransactionId === String(transactionId);
    }
    return this._isConfirming;
  }

  public startConfirming(transactionId: string): boolean {
    if (this._isConfirming) {
      return false;
    }
    this._isConfirming = true;
    this._confirmingTransactionId = String(transactionId);
    return true;
  }

  public finishConfirming(transactionId?: string): void {
    if (transactionId === undefined || this._confirmingTransactionId === String(transactionId)) {
      this._isConfirming = false;
      this._confirmingTransactionId = null;
    }
  }

  /**
   * Processes an app return from background or deep-link.
   *
   * Crucial invariants:
   * - NEVER mutates transaction to CONFIRMED or Completed.
   * - NEVER calls backend /confirm.
   * - Returns shouldPromptUser = true so manual confirmation card is shown.
   * - Suppresses duplicate lifecycle/URL events.
   */
  public handleAppReturn(
    url?: string | null,
    currentTransaction?: UserTransaction | null
  ): {
    handled: boolean;
    isDuplicate: boolean;
    shouldPromptUser: boolean;
    message: string;
    parsed?: ParsedUpiReturnData;
    error?: string;
  } {
    if (!this._isAwaitingReturn) {
      return {
        handled: false,
        isDuplicate: false,
        shouldPromptUser: false,
        message: "",
        error: "Not awaiting payment return",
      };
    }

    if (!currentTransaction) {
      return {
        handled: false,
        isDuplicate: false,
        shouldPromptUser: false,
        message: "",
        error: "No active transaction associated with return",
      };
    }

    // Check terminal safety
    if (isTransactionTerminal({
      status: currentTransaction.canonicalStatus || (currentTransaction.status as any),
      isCompleted: currentTransaction.isCompleted,
    })) {
      this.clearAwaitingReturn();
      return {
        handled: false,
        isDuplicate: false,
        shouldPromptUser: false,
        message: "",
        error: "Transaction is already in terminal state",
      };
    }

    const now = Date.now();

    // Check duplicate URL
    if (url && typeof url === "string" && this._lastProcessedUrl === url.trim()) {
      return {
        handled: false,
        isDuplicate: true,
        shouldPromptUser: false,
        message: "Duplicate return URL ignored",
      };
    }

    // Check lifecycle debounce
    if (now - this._lastProcessedTimestamp < this._debounceWindowMs) {
      return {
        handled: false,
        isDuplicate: true,
        shouldPromptUser: false,
        message: "Duplicate return lifecycle event ignored",
      };
    }

    this._lastProcessedTimestamp = now;
    if (url) {
      this._lastProcessedUrl = url.trim();
    }

    // Parse URL if provided
    let parsed: ParsedUpiReturnData | undefined;
    let message = UPI_RETURN_PROMPT_MESSAGE;

    if (url) {
      const parseResult = parseUpiReturnUrl(url);
      if (parseResult.valid && parseResult.data) {
        parsed = parseResult.data;
        if (parsed.status === "CANCELLED") {
          message = UPI_RETURN_CANCELLED_MESSAGE;
        } else if (parsed.status === "FAILURE") {
          message = UPI_RETURN_FAILED_MESSAGE;
        }
      }
    }

    return {
      handled: true,
      isDuplicate: false,
      shouldPromptUser: true,
      message,
      parsed,
    };
  }
}

export const GlobalUpiReturnManager = new UpiReturnManager();

export interface ManualConfirmationValidationResult {
  eligible: boolean;
  error?: string;
  terminalStatus?: string;
}

/**
 * End-to-end safety validation for manual payment confirmation (Part 4V).
 *
 * Enforces:
 * - Reject missing or null transaction.
 * - Reject terminal transactions (CONFIRMED, CANCELLED, FAILED, REPORTED, isCompleted).
 * - Reject evaluation-only stages (EVALUATION_COMPLETED) or invalid non-completion stages.
 * - Reject PAYMENT_APP_PENDING when no active manual-confirmation context exists.
 * - Return eligible: true only when eligible for completion.
 */
export function validateManualConfirmationEligibility(
  transaction: UserTransaction | null | undefined,
  context?: {
    hasActiveContext?: boolean;
    stage?: PaymentWorkflowStage | { stage?: any } | string | null;
  }
): ManualConfirmationValidationResult {
  if (!transaction || !transaction.id) {
    return {
      eligible: false,
      error: "Missing transaction: cannot confirm null or invalid transaction",
    };
  }

  const rawStatus = String(transaction.canonicalStatus || transaction.status || "").toUpperCase();

  if (
    transaction.isCompleted ||
    rawStatus === "CONFIRMED" ||
    rawStatus === "COMPLETED"
  ) {
    return {
      eligible: false,
      error: "Transaction is already confirmed: duplicate confirmation rejected",
      terminalStatus: "CONFIRMED",
    };
  }

  if (rawStatus === "CANCELLED") {
    return {
      eligible: false,
      error: "Cannot confirm cancelled transaction",
      terminalStatus: "CANCELLED",
    };
  }

  if (rawStatus === "FAILED") {
    return {
      eligible: false,
      error: "Cannot confirm failed transaction",
      terminalStatus: "FAILED",
    };
  }

  if (rawStatus === "REPORTED") {
    return {
      eligible: false,
      error: "Cannot confirm reported transaction",
      terminalStatus: "REPORTED",
    };
  }

  if (
    isTransactionTerminal({
      status: transaction.canonicalStatus || (transaction.status as any),
      isCompleted: transaction.isCompleted,
    })
  ) {
    return {
      eligible: false,
      error: `Cannot confirm transaction in terminal status '${transaction.canonicalStatus || transaction.status}'`,
      terminalStatus: rawStatus,
    };
  }

  // Check stage if provided
  if (context?.stage !== undefined && context.stage !== null) {
    const rawStage =
      typeof context.stage === "object" && "stage" in context.stage
        ? (context.stage as any).stage
        : context.stage;

    if (rawStage === "EVALUATION_COMPLETED") {
      return {
        eligible: false,
        error: "EVALUATION_COMPLETED is a non-executable stage and cannot confirm payment",
      };
    }

    if (
      rawStage === "LOW" ||
      rawStage === "MEDIUM" ||
      rawStage === "HIGH" ||
      rawStage === "PAYMENT_AUTHORIZED" ||
      rawStage === "PAYMENT_SUBMITTED"
    ) {
      return {
        eligible: false,
        error: `Invalid workflow stage '${rawStage}' for confirmation: requires PAYMENT_COMPLETED`,
      };
    }
  }

  // Check active manual confirmation context for pending payment
  if (
    (transaction.canonicalStatus === "PAYMENT_APP_PENDING" ||
      transaction.canonicalStatus === "PAYMENT_PENDING_CONFIRMATION" ||
      rawStatus === "PAYMENT_APP_PENDING") &&
    context?.hasActiveContext === false
  ) {
    return {
      eligible: false,
      error: "No active manual-confirmation context for pending payment",
    };
  }

  return { eligible: true };
}
