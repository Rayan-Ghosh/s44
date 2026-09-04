import { CanonicalTransactionStatus } from "../types/transaction";
import { canTransitionTransactionStatus } from "./transaction-status-transition";

/**
 * Safely applies a canonical transaction status transition.
 *
 * Rules:
 * - If canTransitionTransactionStatus(currentStatus, nextStatus) is true, returns nextStatus.
 * - If the transition is invalid, returns null.
 * - Pure function, never throws.
 * - Reuses canTransitionTransactionStatus as the single source of truth; zero duplication of rules.
 * - Does not mutate any object or external state.
 *
 * @param currentStatus Current canonical transaction status
 * @param nextStatus Desired next canonical transaction status
 * @returns CanonicalTransactionStatus (nextStatus) if allowed, or null if invalid
 */
export function applyTransactionStatusTransition(
  currentStatus: CanonicalTransactionStatus,
  nextStatus: CanonicalTransactionStatus
): CanonicalTransactionStatus | null {
  try {
    if (canTransitionTransactionStatus(currentStatus, nextStatus)) {
      return nextStatus;
    }
    return null;
  } catch {
    return null;
  }
}
