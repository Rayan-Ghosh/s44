import { CanonicalTransactionStatus } from "../types/transaction";

/**
 * Pure mapping table for unambiguous, clearly equivalent transaction lifecycle statuses
 * and already-canonical lifecycle statuses.
 * Keys are normalized to lowercase for case-insensitive lookup.
 *
 * NOTE: Ambiguous legacy values (such as "Safe", "Held", "Risk detected", "Pending",
 * "Needs Review", "Waiting For User", "Approved by you", "Flagged & Held",
 * "Scam Intercepted", "Safe Call", "Allowed", "Authorized", and title-cased "Confirmed")
 * are intentionally omitted/intercepted and map to null until full canonical lifecycle migration.
 */
const CANONICAL_STATUS_MAP: Record<string, CanonicalTransactionStatus> = {
  // Legacy clearly equivalent mappings
  "detected": "CREATED",
  "analyzing": "ANALYZING",
  "waiting for guardian": "AWAITING_GUARDIAN",
  "approved": "GUARDIAN_APPROVED",
  "launching payment app": "PAYMENT_APP_PENDING",
  "payment app opened": "PAYMENT_APP_PENDING",
  "completed": "CONFIRMED",
  "cancelled": "CANCELLED",
  "blocked": "FAILED",
  "reported": "REPORTED",

  // Already-canonical lifecycle pass-through mappings
  "created": "CREATED",
  "low_risk": "LOW_RISK",
  "medium_risk": "MEDIUM_RISK",
  "high_risk": "HIGH_RISK",
  "awaiting_biometrics": "AWAITING_BIOMETRICS",
  "awaiting_guardian": "AWAITING_GUARDIAN",
  "guardian_approved": "GUARDIAN_APPROVED",
  "guardian_rejected": "GUARDIAN_REJECTED",
  "guardian_timeout": "GUARDIAN_TIMEOUT",
  "payment_app_pending": "PAYMENT_APP_PENDING",
  "payment_pending_confirmation": "PAYMENT_PENDING_CONFIRMATION",
  "confirmed": "CONFIRMED",
  "failed": "FAILED",
};

/**
 * Maps existing transaction status strings into the canonical lifecycle status type.
 *
 * Rules:
 * - Trims leading and trailing whitespace.
 * - Accepts already-canonical status values (case-insensitively, with underscores).
 * - "Confirmed" with normal title casing is ambiguous legacy input and returns null.
 * - Only canonical "CONFIRMED" (or case/whitespace variants of that exact canonical value) maps to "CONFIRMED".
 * - Returns null for null, undefined, empty, or whitespace-only inputs.
 * - Maps only clearly equivalent statuses; no fuzzy matching or partial matching.
 * - Does not replace underscores with spaces or invent alternate formats.
 * - Returns null for ambiguous, composite, or risk-conflated status strings.
 * - Pure function, never throws.
 *
 * @param status Existing raw or canonical transaction status string
 * @returns CanonicalTransactionStatus or null
 */
export function mapToCanonicalTransactionStatus(
  status: string | null | undefined
): CanonicalTransactionStatus | null {
  if (typeof status !== "string") {
    return null;
  }

  const trimmed = status.trim();
  if (!trimmed) {
    return null;
  }

  // Ambiguous legacy title-cased "Confirmed" must return null,
  // whereas the canonical form "CONFIRMED" maps to "CONFIRMED".
  if (trimmed === "Confirmed") {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  return CANONICAL_STATUS_MAP[normalized] ?? null;
}
