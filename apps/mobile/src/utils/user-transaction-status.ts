import { CanonicalTransactionStatus } from "../types/transaction";
import type { UserTransaction } from "../services/payment-service";
import { mapToCanonicalTransactionStatus } from "./transaction-status";

/**
 * Derives a CanonicalTransactionStatus from an existing UserTransaction.
 *
 * Rules:
 * - Pure adapter, never throws.
 * - Does not mutate the input transaction object.
 * - If transaction.canonicalStatus is defined, returns it directly without remapping.
 * - If transaction.canonicalStatus is undefined, falls back to mapToCanonicalTransactionStatus(transaction.status).
 * - Ambiguous or unmapped statuses strictly return null.
 * - Does not infer lifecycle status from riskScore or riskLevel alone.
 *
 * @param transaction Existing UserTransaction object
 * @returns CanonicalTransactionStatus or null
 */
export function getCanonicalStatusForUserTransaction(
  transaction: UserTransaction
): CanonicalTransactionStatus | null {
  if (!transaction || typeof transaction !== "object") {
    return null;
  }

  if (transaction.canonicalStatus !== undefined) {
    return transaction.canonicalStatus;
  }

  return mapToCanonicalTransactionStatus(transaction.status);
}

/**
 * Set of canonical statuses that represent terminal (end-of-lifecycle) transaction outcomes.
 */
const TERMINAL_CANONICAL_STATUSES: ReadonlySet<CanonicalTransactionStatus> = new Set<CanonicalTransactionStatus>([
  "CONFIRMED",
  "CANCELLED",
  "FAILED",
  "REPORTED",
]);

/**
 * Determines whether a UserTransaction has reached a terminal lifecycle state.
 *
 * Rules:
 * - Resolves canonical status via getCanonicalStatusForUserTransaction(transaction).
 * - Returns true ONLY for: CONFIRMED, CANCELLED, FAILED, REPORTED.
 * - Returns false for intermediate/in-flight states or unresolved/null statuses.
 * - Never infers terminal state from riskScore, riskLevel, isCompleted, title, date, or paymentMethod.
 * - Pure function, never throws, does not mutate the transaction.
 *
 * @param transaction Existing UserTransaction object
 * @returns boolean indicating if the transaction is in a terminal state
 */
export function isTerminalUserTransaction(
  transaction: UserTransaction
): boolean {
  const canonical = getCanonicalStatusForUserTransaction(transaction);
  if (!canonical) {
    return false;
  }

  return TERMINAL_CANONICAL_STATUSES.has(canonical);
}

/**
 * Determines whether a UserTransaction is read-only based on its canonical lifecycle status.
 *
 * Rules:
 * - A transaction is read-only if and only if it has reached a terminal canonical status
 *   (CONFIRMED, CANCELLED, FAILED, REPORTED).
 * - Implemented by reusing isTerminalUserTransaction(transaction).
 * - Returns false for every non-terminal, unresolved, or ambiguous status.
 * - Does not infer read-only state from isCompleted, riskScore, riskLevel, title, date, or paymentMethod.
 * - Pure function, never throws, does not mutate the transaction.
 *
 * @param transaction Existing UserTransaction object
 * @returns boolean indicating if the transaction is read-only
 */
export function isReadOnlyUserTransaction(
  transaction: UserTransaction
): boolean {
  return isTerminalUserTransaction(transaction);
}
