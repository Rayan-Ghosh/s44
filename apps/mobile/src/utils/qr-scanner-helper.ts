import { parseUpiPaymentPayload } from "./upi-payload-parser";

export interface PaymentFormFields {
  recipient: string;
  amount: string;
  note: string;
}

export interface QrFormApplySuccess {
  success: true;
  updatedForm: PaymentFormFields;
}

export interface QrFormApplyFailure {
  success: false;
  error: string;
  updatedForm: PaymentFormFields;
}

export type QrFormApplyResult = QrFormApplySuccess | QrFormApplyFailure;

/**
 * Pure helper that updates payment form state based on a raw scanned QR payload.
 *
 * Rules:
 * - Passes raw payload to parseUpiPaymentPayload.
 * - On valid payload:
 *   - Overwrites recipient with parsed recipient.
 *   - Overwrites amount ONLY if parsed amount is present (typeof amount === 'number').
 *   - Overwrites note ONLY if parsed note is present (typeof note === 'string').
 *   - Preserves existing amount and note if not in scanned payload.
 * - On invalid payload:
 *   - Leaves currentForm completely unchanged.
 *   - Returns clear error message.
 * - Never creates a transaction or draft.
 */
export function applyScannedQrToForm(
  currentForm: PaymentFormFields,
  rawPayload: string
): QrFormApplyResult {
  const parseResult = parseUpiPaymentPayload(rawPayload);

  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error,
      updatedForm: { ...currentForm },
    };
  }

  const { data } = parseResult;

  const nextRecipient = data.recipient;
  const nextAmount =
    typeof data.amount === "number" ? String(data.amount) : currentForm.amount;
  const nextNote =
    typeof data.note === "string" && data.note.length > 0 ? data.note : currentForm.note;

  return {
    success: true,
    updatedForm: {
      recipient: nextRecipient,
      amount: nextAmount,
      note: nextNote,
    },
  };
}

/**
 * Pure helper to verify if duplicate scan should be ignored.
 */
export function shouldIgnoreScan(
  hasScanned: boolean,
  currentPayload: string | null | undefined,
  lastScannedPayload: string | null | undefined
): boolean {
  if (hasScanned) return true;
  if (!currentPayload) return true;
  if (lastScannedPayload && currentPayload === lastScannedPayload) return true;
  return false;
}
