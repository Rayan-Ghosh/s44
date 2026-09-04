/**
 * AVARAN PAY — Recipient Resolution Contract & Placeholder Service.
 *
 * Defines the contract for resolving recipient inputs (UPI IDs and mobile numbers)
 * prior to payment initiation.
 *
 * Current Phase (Part 4H):
 * - Pure contract and conservative placeholder behavior only.
 * - Mobile-to-UPI resolution is NOT implemented (returns RESOLUTION_UNAVAILABLE).
 * - Valid UPI IDs pass through directly as resolved recipients.
 * - Invalid/empty values fail with INVALID_RECIPIENT.
 * - Performs no backend/network calls, no payment creation, no risk evaluation.
 * - Preserves user input without mutation and never appends '@upi'.
 */

import { getRecipientType, RecipientType } from "../utils/recipient-type";

export type RecipientResolutionFailureReason =
  | "INVALID_RECIPIENT"
  | "RESOLUTION_UNAVAILABLE"
  | "RECIPIENT_NOT_FOUND";

export interface RecipientResolutionInput {
  originalValue: string;
  recipientType?: "UPI_ID" | "MOBILE_NUMBER";
}

export interface RecipientResolutionSuccess {
  success: true;
  originalValue: string;
  resolvedRecipient: string;
  recipientType: "UPI_ID" | "MOBILE_NUMBER";
}

export interface RecipientResolutionFailure {
  success: false;
  originalValue: string;
  reason: RecipientResolutionFailureReason;
}

export type RecipientResolutionResult =
  | RecipientResolutionSuccess
  | RecipientResolutionFailure;

/**
 * Pure placeholder recipient resolution function.
 *
 * Rules:
 * - Trims only for validation via `getRecipientType()`.
 * - Preserves the original input verbatim in `originalValue`.
 * - If the input is a valid UPI ID:
 *     returns { success: true, originalValue, resolvedRecipient: originalValue, recipientType: "UPI_ID" }.
 * - If the input is a valid mobile number:
 *     returns { success: false, originalValue, reason: "RESOLUTION_UNAVAILABLE" }.
 * - If the input is invalid or UNKNOWN:
 *     returns { success: false, originalValue, reason: "INVALID_RECIPIENT" }.
 */
export function resolveRecipient(input: RecipientResolutionInput): RecipientResolutionResult {
  if (!input || typeof input !== "object" || typeof input.originalValue !== "string") {
    return {
      success: false,
      originalValue: typeof input?.originalValue === "string" ? input.originalValue : "",
      reason: "INVALID_RECIPIENT",
    };
  }

  const originalValue = input.originalValue;
  const detectedType = getRecipientType(originalValue);

  // If detected type is UNKNOWN, or if an explicitly provided recipientType conflicts with detection
  if (detectedType === "UNKNOWN") {
    return {
      success: false,
      originalValue,
      reason: "INVALID_RECIPIENT",
    };
  }

  if (input.recipientType && input.recipientType !== detectedType) {
    return {
      success: false,
      originalValue,
      reason: "INVALID_RECIPIENT",
    };
  }

  // 1. UPI ID: Directly verified format, return success with same recipient
  if (detectedType === "UPI_ID") {
    return {
      success: true,
      originalValue,
      resolvedRecipient: originalValue,
      recipientType: "UPI_ID",
    };
  }

  // 2. Mobile Number: Valid format, but real backend resolution is not yet implemented
  if (detectedType === "MOBILE_NUMBER") {
    return {
      success: false,
      originalValue,
      reason: "RESOLUTION_UNAVAILABLE",
    };
  }

  // Fallback for unexpected states
  return {
    success: false,
    originalValue,
    reason: "INVALID_RECIPIENT",
  };
}

export const RecipientResolutionService = {
  resolveRecipient,
};
