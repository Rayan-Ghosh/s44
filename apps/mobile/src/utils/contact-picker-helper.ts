export interface PaymentFormFields {
  recipient: string;
  amount: string;
  note: string;
}

export interface ContactFormApplySuccess {
  success: true;
  phoneNumber: string;
  updatedForm: PaymentFormFields;
}

export interface ContactFormApplyFailure {
  success: false;
  error: string;
  updatedForm: PaymentFormFields;
}

export type ContactFormApplyResult = ContactFormApplySuccess | ContactFormApplyFailure;

export interface ContactSelectionCancelResult {
  cancelled: true;
  updatedForm: PaymentFormFields;
}

export type ContactSelectionOutcome = ContactFormApplyResult | ContactSelectionCancelResult;

/**
 * Normalizes a raw phone number candidate by trimming whitespace and
 * removing formatting characters (spaces, hyphens, parentheses, dots).
 * Preserves a leading '+' if present.
 * Returns null if no valid number digits remain or if the digit count is too low (< 3).
 */
export function cleanPhoneNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasLeadingPlus = trimmed.startsWith("+");
  // Strip out spaces, dashes, parentheses, dots
  const stripped = trimmed.replace(/[\s\-\(\)\.]/g, "");

  // Extract digits
  const digitsOnly = stripped.replace(/\D/g, "");
  if (digitsOnly.length < 3) {
    return null;
  }

  // Re-attach leading plus if originally present and not already at index 0
  if (hasLeadingPlus && !stripped.startsWith("+")) {
    return `+${stripped.replace(/\+/g, "")}`;
  }

  return stripped;
}

/**
 * Pure helper that extracts the first usable phone number from any contact data structure.
 * Supports:
 * - Legacy Expo shape: `contact.phoneNumbers: Array<{ number?: string; digits?: string }>`
 * - SDK 57 Expo Next shape: `contact.phones: Array<{ number?: string; digits?: string }>`
 * - Direct properties: `contact.phone`, `contact.phoneNumber`
 * - Direct string payload
 */
export function extractFirstPhoneNumber(contact: any): string | null {
  if (!contact) return null;

  if (typeof contact === "string") {
    return cleanPhoneNumber(contact);
  }

  if (typeof contact !== "object") {
    return null;
  }

  // 1. Check legacy phoneNumbers array
  if (Array.isArray(contact.phoneNumbers) && contact.phoneNumbers.length > 0) {
    for (const item of contact.phoneNumbers) {
      if (item) {
        const candidate = cleanPhoneNumber(item.number || item.digits);
        if (candidate) return candidate;
      }
    }
  }

  // 2. Check Next phones array
  if (Array.isArray(contact.phones) && contact.phones.length > 0) {
    for (const item of contact.phones) {
      if (item) {
        const candidate = cleanPhoneNumber(item.number || item.digits);
        if (candidate) return candidate;
      }
    }
  }

  // 3. Check direct phone / phoneNumber string properties
  if (typeof contact.phoneNumber === "string") {
    const candidate = cleanPhoneNumber(contact.phoneNumber);
    if (candidate) return candidate;
  }

  if (typeof contact.phone === "string") {
    const candidate = cleanPhoneNumber(contact.phone);
    if (candidate) return candidate;
  }

  return null;
}

/**
 * Pure helper that updates payment form state based on a selected contact.
 *
 * Rules:
 * - Extracts first usable phone number from contact.
 * - If found:
 *   - Overwrites recipient with extracted phone number ONLY.
 *   - Leaves amount completely unchanged.
 *   - Leaves note completely unchanged.
 *   - Returns typed success result.
 * - If no usable phone number found:
 *   - Leaves currentForm completely unchanged.
 *   - Returns typed failure with concise error message.
 * - Never creates a transaction or draft.
 * - Never calls risk evaluation or external lifecycle services.
 */
export function applySelectedContactToForm(
  currentForm: PaymentFormFields,
  contact: any
): ContactFormApplyResult {
  const phoneNumber = extractFirstPhoneNumber(contact);

  if (!phoneNumber) {
    return {
      success: false,
      error: "Selected contact has no usable phone number",
      updatedForm: { ...currentForm },
    };
  }

  return {
    success: true,
    phoneNumber,
    updatedForm: {
      recipient: phoneNumber,
      amount: currentForm.amount,
      note: currentForm.note,
    },
  };
}

/**
 * Pure helper that processes contact selection or cancellation.
 * If user cancelled (contact is null/undefined), leaves form untouched.
 */
export function handleContactSelectionOutcome(
  currentForm: PaymentFormFields,
  contact: any | null | undefined
): ContactSelectionOutcome {
  if (contact === null || contact === undefined) {
    return {
      cancelled: true,
      updatedForm: { ...currentForm },
    };
  }

  return applySelectedContactToForm(currentForm, contact);
}
