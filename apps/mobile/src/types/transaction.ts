import { RiskResult } from "./risk";

export interface TransactionInput {
  id?: number;
  amount: number;
  recipientName: string;
  recipientHandle: string;
  isNewRecipient: boolean;
  deviceLabel: string;
  isNewDevice: boolean;
  location: string;
  paymentMethod: string;
  timestamp: string;
}

export type FinalOutcome = "pending" | "confirmed" | "cancelled" | "reported";

export interface PaymentRiskEvaluation {
  transaction: TransactionInput;
  risk: RiskResult;
  outcome: FinalOutcome;
  evaluatedAt: string;
}

/**
 * Canonical Transaction Lifecycle Status for AVARAN PAY.
 *
 * Explicitly separates transaction lifecycle state from risk classification:
 * - Risk Level: LOW, MEDIUM, HIGH (managed via utils/risk-scoring.ts)
 * - Transaction Status: strictly represents lifecycle workflow progression
 */
export type CanonicalTransactionStatus =
  | "CREATED"
  | "ANALYZING"
  | "LOW_RISK"
  | "MEDIUM_RISK"
  | "HIGH_RISK"
  | "AWAITING_BIOMETRICS"
  | "AWAITING_GUARDIAN"
  | "GUARDIAN_APPROVED"
  | "GUARDIAN_REJECTED"
  | "GUARDIAN_TIMEOUT"
  | "PAYMENT_APP_PENDING"
  | "PAYMENT_PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "CANCELLED"
  | "FAILED"
  | "REPORTED";

export enum CanonicalTransactionStatusEnum {
  CREATED = "CREATED",
  ANALYZING = "ANALYZING",
  LOW_RISK = "LOW_RISK",
  MEDIUM_RISK = "MEDIUM_RISK",
  HIGH_RISK = "HIGH_RISK",
  AWAITING_BIOMETRICS = "AWAITING_BIOMETRICS",
  AWAITING_GUARDIAN = "AWAITING_GUARDIAN",
  GUARDIAN_APPROVED = "GUARDIAN_APPROVED",
  GUARDIAN_REJECTED = "GUARDIAN_REJECTED",
  GUARDIAN_TIMEOUT = "GUARDIAN_TIMEOUT",
  PAYMENT_APP_PENDING = "PAYMENT_APP_PENDING",
  PAYMENT_PENDING_CONFIRMATION = "PAYMENT_PENDING_CONFIRMATION",
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
  FAILED = "FAILED",
  REPORTED = "REPORTED",
}

/**
 * Frontend Payment Workflow Stage.
 *
 * Explicitly separates risk evaluation from authorization, app launch, and settlement:
 * - EVALUATION_COMPLETED: Risk assessment performed; strictly NOT authorized or submitted.
 * - PAYMENT_AUTHORIZED: Biometrics / user credentials verified.
 * - PAYMENT_SUBMITTED: Payment launched in external UPI payment app.
 * - PAYMENT_COMPLETED: Final settlement confirmed.
 */
export type PaymentWorkflowStage =
  | "EVALUATION_COMPLETED"
  | "PAYMENT_AUTHORIZED"
  | "PAYMENT_SUBMITTED"
  | "PAYMENT_COMPLETED";

export enum PaymentWorkflowStageEnum {
  EVALUATION_COMPLETED = "EVALUATION_COMPLETED",
  PAYMENT_AUTHORIZED = "PAYMENT_AUTHORIZED",
  PAYMENT_SUBMITTED = "PAYMENT_SUBMITTED",
  PAYMENT_COMPLETED = "PAYMENT_COMPLETED",
}

export function isEvaluationStage(stage?: PaymentWorkflowStage | null): boolean {
  return stage === "EVALUATION_COMPLETED";
}

export function isPaymentAuthorizedStage(stage?: PaymentWorkflowStage | null): boolean {
  return stage === "PAYMENT_AUTHORIZED";
}

export function isPaymentSubmittedStage(stage?: PaymentWorkflowStage | null): boolean {
  return stage === "PAYMENT_SUBMITTED";
}

export function isPaymentCompletedStage(stage?: PaymentWorkflowStage | null): boolean {
  return stage === "PAYMENT_COMPLETED";
}

/**
 * @deprecated Use isPaymentAuthorizedStage(stage) or isEvaluationStage(stage) for explicit semantics.
 */
export const isEvaluationAuthorized = (stage?: PaymentWorkflowStage | null): boolean =>
  stage === "PAYMENT_AUTHORIZED" || stage === "PAYMENT_SUBMITTED" || stage === "PAYMENT_COMPLETED";

/**
 * @deprecated Use isPaymentCompletedStage(stage) for explicit semantics.
 */
export const isEvaluationCompleted = (stage?: PaymentWorkflowStage | null): boolean =>
  stage === "PAYMENT_COMPLETED";

export interface PaymentWorkflowValidationResult {
  valid: boolean;
  error?: string;
  stage?: PaymentWorkflowStage | string | null;
}

/**
 * Helper to extract stage string from either a stage string or an object containing stage.
 */
function extractWorkflowStage(
  stageOrObject?: PaymentWorkflowStage | { stage?: PaymentWorkflowStage | string | null } | string | null
): string | null | undefined {
  if (stageOrObject && typeof stageOrObject === "object" && "stage" in stageOrObject) {
    return (stageOrObject as { stage?: PaymentWorkflowStage | string | null }).stage ?? undefined;
  }
  return typeof stageOrObject === "string" ? stageOrObject : (stageOrObject as any);
}

/**
 * Defensive runtime validation ensuring pre-payment evaluation stage can never
 * authorize a payment workflow.
 *
 * Requirements:
 * - Accepts ONLY 'PAYMENT_AUTHORIZED'
 * - Rejects 'EVALUATION_COMPLETED' explicitly
 * - Rejects null, undefined, or unknown stages
 * - Rejects risk levels (LOW, MEDIUM, HIGH)
 */
export function validatePaymentAuthorizationStage(
  stageOrObject?: PaymentWorkflowStage | { stage?: PaymentWorkflowStage | string | null } | string | null
): PaymentWorkflowValidationResult {
  const stage = extractWorkflowStage(stageOrObject);

  if (!stage || typeof stage !== "string") {
    return {
      valid: false,
      error: "Payment stage is required for authorization",
      stage: stage ?? null,
    };
  }

  if (stage === "EVALUATION_COMPLETED") {
    return {
      valid: false,
      error: "Pre-payment evaluation result cannot authorize payment. Explicit authorization is required.",
      stage,
    };
  }

  if (stage === "LOW" || stage === "MEDIUM" || stage === "HIGH") {
    return {
      valid: false,
      error: `Risk level '${stage}' is an evaluation metric and cannot authorize payment.`,
      stage,
    };
  }

  if (stage === "PAYMENT_AUTHORIZED") {
    return { valid: true, stage };
  }

  return {
    valid: false,
    error: `Stage '${stage}' is not permitted for payment authorization.`,
    stage,
  };
}

/**
 * Defensive runtime validation ensuring pre-payment evaluation stage can never
 * submit a payment workflow to external payment apps or networks.
 *
 * Requirements:
 * - Accepts ONLY 'PAYMENT_SUBMITTED'
 * - Rejects 'EVALUATION_COMPLETED' explicitly
 * - Rejects null, undefined, or unknown stages
 * - Rejects risk levels (LOW, MEDIUM, HIGH)
 */
export function validatePaymentSubmissionStage(
  stageOrObject?: PaymentWorkflowStage | { stage?: PaymentWorkflowStage | string | null } | string | null
): PaymentWorkflowValidationResult {
  const stage = extractWorkflowStage(stageOrObject);

  if (!stage || typeof stage !== "string") {
    return {
      valid: false,
      error: "Payment stage is required for payment submission",
      stage: stage ?? null,
    };
  }

  if (stage === "EVALUATION_COMPLETED") {
    return {
      valid: false,
      error: "Pre-payment evaluation result cannot submit payment. Explicit authorization and submission are required.",
      stage,
    };
  }

  if (stage === "LOW" || stage === "MEDIUM" || stage === "HIGH") {
    return {
      valid: false,
      error: `Risk level '${stage}' is an evaluation metric and cannot submit payment.`,
      stage,
    };
  }

  if (stage === "PAYMENT_SUBMITTED") {
    return { valid: true, stage };
  }

  return {
    valid: false,
    error: `Stage '${stage}' is not permitted for payment submission.`,
    stage,
  };
}

/**
 * Defensive runtime validation ensuring pre-payment evaluation stage can never
 * complete or settle a payment workflow.
 *
 * Requirements:
 * - Accepts ONLY 'PAYMENT_COMPLETED'
 * - Rejects 'EVALUATION_COMPLETED' explicitly
 * - Rejects null, undefined, or unknown stages
 * - Rejects risk levels (LOW, MEDIUM, HIGH)
 */
export function validatePaymentCompletionStage(
  stageOrObject?: PaymentWorkflowStage | { stage?: PaymentWorkflowStage | string | null } | string | null
): PaymentWorkflowValidationResult {
  const stage = extractWorkflowStage(stageOrObject);

  if (!stage || typeof stage !== "string") {
    return {
      valid: false,
      error: "Payment stage is required for payment completion",
      stage: stage ?? null,
    };
  }

  if (stage === "EVALUATION_COMPLETED") {
    return {
      valid: false,
      error: "Pre-payment evaluation result cannot complete payment. Explicit settlement is required.",
      stage,
    };
  }

  if (stage === "LOW" || stage === "MEDIUM" || stage === "HIGH") {
    return {
      valid: false,
      error: `Risk level '${stage}' is an evaluation metric and cannot complete payment.`,
      stage,
    };
  }

  if (stage === "PAYMENT_COMPLETED") {
    return { valid: true, stage };
  }

  return {
    valid: false,
    error: `Stage '${stage}' is not permitted for payment completion.`,
    stage,
  };
}

/**
 * General runtime assertion guard rejecting evaluation results from any payment lifecycle execution.
 */
export function assertNotEvaluationStage(
  stageOrObject?: PaymentWorkflowStage | { stage?: PaymentWorkflowStage | string | null } | string | null
): PaymentWorkflowValidationResult {
  const stage = extractWorkflowStage(stageOrObject);

  if (!stage || typeof stage !== "string") {
    return {
      valid: false,
      error: "Missing or invalid workflow stage",
      stage: stage ?? null,
    };
  }

  if (stage === "EVALUATION_COMPLETED") {
    return {
      valid: false,
      error: "Pre-payment evaluation results are strictly non-executable and cannot enter payment workflows.",
      stage,
    };
  }

  if (stage === "LOW" || stage === "MEDIUM" || stage === "HIGH") {
    return {
      valid: false,
      error: `Risk level '${stage}' is an evaluation metric and cannot enter payment workflows.`,
      stage,
    };
  }

  if (
    stage === "PAYMENT_AUTHORIZED" ||
    stage === "PAYMENT_SUBMITTED" ||
    stage === "PAYMENT_COMPLETED"
  ) {
    return { valid: true, stage: stage as PaymentWorkflowStage };
  }

  return {
    valid: false,
    error: `Unknown workflow stage '${stage}'.`,
    stage,
  };
}




