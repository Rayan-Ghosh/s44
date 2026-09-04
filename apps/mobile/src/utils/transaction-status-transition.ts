import { CanonicalTransactionStatus } from "../types/transaction";

/**
 * Transition table defining valid lifecycle state progressions for AVARAN PAY.
 * Every key is a CanonicalTransactionStatus with its strictly allowed next states.
 */
const ALLOWED_TRANSITIONS: Record<
  CanonicalTransactionStatus,
  ReadonlySet<CanonicalTransactionStatus>
> = {
  CREATED: new Set<CanonicalTransactionStatus>(["ANALYZING"]),

  ANALYZING: new Set<CanonicalTransactionStatus>([
    "LOW_RISK",
    "MEDIUM_RISK",
    "HIGH_RISK",
    "FAILED",
  ]),

  LOW_RISK: new Set<CanonicalTransactionStatus>([
    "AWAITING_BIOMETRICS",
    "CANCELLED",
    "FAILED",
  ]),

  MEDIUM_RISK: new Set<CanonicalTransactionStatus>([
    "AWAITING_BIOMETRICS",
    "CANCELLED",
    "FAILED",
  ]),

  HIGH_RISK: new Set<CanonicalTransactionStatus>([
    "AWAITING_BIOMETRICS",
    "CANCELLED",
    "FAILED",
  ]),

  AWAITING_BIOMETRICS: new Set<CanonicalTransactionStatus>([
    "AWAITING_GUARDIAN",
    "PAYMENT_APP_PENDING",
    "CANCELLED",
    "FAILED",
  ]),

  AWAITING_GUARDIAN: new Set<CanonicalTransactionStatus>([
    "GUARDIAN_APPROVED",
    "GUARDIAN_REJECTED",
    "GUARDIAN_TIMEOUT",
    "CANCELLED",
    "FAILED",
  ]),

  GUARDIAN_APPROVED: new Set<CanonicalTransactionStatus>([
    "PAYMENT_APP_PENDING",
    "CANCELLED",
    "FAILED",
  ]),

  GUARDIAN_REJECTED: new Set<CanonicalTransactionStatus>([
    "CANCELLED",
    "FAILED",
  ]),

  GUARDIAN_TIMEOUT: new Set<CanonicalTransactionStatus>([
    "CANCELLED",
    "FAILED",
  ]),

  PAYMENT_APP_PENDING: new Set<CanonicalTransactionStatus>([
    "PAYMENT_PENDING_CONFIRMATION",
    "CONFIRMED",
    "CANCELLED",
    "FAILED",
  ]),

  PAYMENT_PENDING_CONFIRMATION: new Set<CanonicalTransactionStatus>([
    "CONFIRMED",
    "CANCELLED",
    "FAILED",
    "REPORTED",
  ]),

  CONFIRMED: new Set<CanonicalTransactionStatus>(["REPORTED"]),

  CANCELLED: new Set<CanonicalTransactionStatus>(["REPORTED"]),

  FAILED: new Set<CanonicalTransactionStatus>(["REPORTED"]),

  REPORTED: new Set<CanonicalTransactionStatus>([]),
};

/**
 * Validates whether a transaction may transition from one CanonicalTransactionStatus to another.
 *
 * Rules:
 * - Pure function, never throws.
 * - Self-transitions return false.
 * - Terminal state REPORTED has no outgoing transitions.
 * - Arbitrary skips or backwards transitions return false.
 *
 * @param from Source canonical transaction status
 * @param to Target canonical transaction status
 * @returns boolean indicating if the transition is allowed
 */
export function canTransitionTransactionStatus(
  from: CanonicalTransactionStatus,
  to: CanonicalTransactionStatus
): boolean {
  if (from === to) {
    return false;
  }

  const allowedTargets = ALLOWED_TRANSITIONS[from];
  if (!allowedTargets) {
    return false;
  }

  return allowedTargets.has(to);
}
