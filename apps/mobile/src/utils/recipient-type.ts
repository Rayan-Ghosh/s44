/**
 * Pure recipient-type detection utility for AVARAN PAY.
 *
 * Classifies recipient input into:
 * - `UPI_ID`: Valid Virtual Payment Address (e.g. user@upi, name@bank)
 * - `MOBILE_NUMBER`: Valid Indian mobile number (e.g. 9876543210, +919876543210, 919876543210)
 * - `UNKNOWN`: Empty, invalid, or unrecognized input
 *
 * Guarantees:
 * - Pure and conservative: no network calls, no payment service calls, no side-effects.
 * - Does not perform mobile-to-UPI resolution.
 * - Does not append '@upi' or rewrite/mutate the user's input.
 * - Returns UNKNOWN for arbitrary text, invalid formats, or empty strings.
 */

export type RecipientType = "UPI_ID" | "MOBILE_NUMBER" | "UNKNOWN";

/**
 * Standard Indian mobile number patterns:
 * - 10 digits starting with 6, 7, 8, or 9
 * - Optional +91 or 91 country code prefix (with optional space or hyphen separator)
 */
const INDIAN_MOBILE_REGEX = /^(\+91[\-\s]?|91[\-\s]?)?[6-9]\d{9}$/;

/**
 * Standard UPI ID / VPA pattern:
 * - Exactly one '@' delimiter
 * - Non-empty username: alphanumeric, dots, hyphens, underscores (min 1 char)
 * - Non-empty handle: alphanumeric, dots, hyphens, underscores (min 2 chars)
 * - No whitespace permitted
 */
const UPI_ID_REGEX = /^[a-zA-Z0-9.\-_]{1,256}@[a-zA-Z0-9.\-_]{2,64}$/;

/**
 * Determines the recipient type for a given input value.
 *
 * @param value Raw recipient string entered by the user
 * @returns RecipientType ("UPI_ID" | "MOBILE_NUMBER" | "UNKNOWN")
 */
export function getRecipientType(value: string | null | undefined): RecipientType {
  if (typeof value !== "string") {
    return "UNKNOWN";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "UNKNOWN";
  }

  // 1. Check for UPI ID format
  // A UPI ID must contain '@' and adhere to standard VPA format
  if (trimmed.includes("@")) {
    // Disallow whitespace within UPI ID
    if (/\s/.test(trimmed)) {
      return "UNKNOWN";
    }

    // Must match valid UPI ID pattern
    if (UPI_ID_REGEX.test(trimmed)) {
      return "UPI_ID";
    }

    return "UNKNOWN";
  }

  // 2. Check for Indian mobile number format
  // Must match standard 10-digit Indian mobile format with optional +91/91 prefix
  if (INDIAN_MOBILE_REGEX.test(trimmed)) {
    return "MOBILE_NUMBER";
  }

  // 3. Any other arbitrary text or unrecognized format
  return "UNKNOWN";
}

/**
 * Pure helper to verify whether a recipient value is a recognized format (UPI ID or Mobile Number).
 */
export function isRecipientValid(value: string | null | undefined): boolean {
  const type = getRecipientType(value);
  return type === "UPI_ID" || type === "MOBILE_NUMBER";
}

/**
 * Returns the subtle UI helper hint text for a recognized recipient type, or null if UNKNOWN.
 *
 * - UPI_ID -> "UPI ID detected"
 * - MOBILE_NUMBER -> "Mobile number detected"
 * - UNKNOWN -> null
 */
export function getRecipientTypeHint(value: string | null | undefined): string | null {
  const type = getRecipientType(value);
  switch (type) {
    case "UPI_ID":
      return "UPI ID detected";
    case "MOBILE_NUMBER":
      return "Mobile number detected";
    case "UNKNOWN":
    default:
      return null;
  }
}

/**
 * Validates a UPI ID input string with detailed error feedback.
 */
export function validateUpiIdInput(value: string | null | undefined): {
  valid: boolean;
  error?: string;
  normalized?: string;
} {
  if (typeof value !== "string") {
    return { valid: false, error: "UPI ID is required" };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: "UPI ID is required" };
  }

  if (/\s/.test(trimmed)) {
    return { valid: false, error: "UPI ID cannot contain spaces" };
  }

  const atCount = (trimmed.match(/@/g) || []).length;
  if (atCount === 0) {
    return { valid: false, error: "UPI ID must contain '@' (e.g. name@bank)" };
  }
  if (atCount > 1) {
    return { valid: false, error: "UPI ID cannot contain multiple '@' symbols" };
  }

  if (!UPI_ID_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: "Enter a valid UPI ID (e.g. user@okaxis or merchant@upi)",
    };
  }

  return { valid: true, normalized: trimmed.toLowerCase() };
}

/**
 * Validates an Indian mobile number input string with detailed error feedback.
 */
export function validateMobileNumberInput(value: string | null | undefined): {
  valid: boolean;
  error?: string;
  normalized?: string;
} {
  if (typeof value !== "string") {
    return { valid: false, error: "Mobile number is required" };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: "Mobile number is required" };
  }

  // Remove whitespace, dashes, parentheses
  const clean = trimmed.replace(/[\s\-\(\)]/g, "");

  let stripped = clean;
  if (clean.startsWith("+91")) {
    stripped = clean.slice(3);
  } else if (clean.startsWith("91") && clean.length === 12) {
    stripped = clean.slice(2);
  } else if (clean.startsWith("0") && clean.length === 11) {
    stripped = clean.slice(1);
  }

  if (!/^\d+$/.test(stripped)) {
    return { valid: false, error: "Mobile number must contain digits only" };
  }

  if (stripped.length !== 10) {
    return {
      valid: false,
      error: `Enter a 10-digit mobile number (${stripped.length} digits entered)`,
    };
  }

  if (!/^[6-9]/.test(stripped)) {
    return {
      valid: false,
      error: "Mobile number must start with 6, 7, 8, or 9",
    };
  }

  return { valid: true, normalized: stripped };
}

/**
 * Validates transaction amount input.
 */
export function validateAmountInput(value: string | number | null | undefined): {
  valid: boolean;
  error?: string;
  amount?: number;
} {
  if (value === null || value === undefined) {
    return { valid: false, error: "Amount is required" };
  }

  let num: number;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return { valid: false, error: "Amount is required" };
    }
    num = Number(trimmed);
  } else {
    num = value;
  }

  if (!Number.isFinite(num) || isNaN(num)) {
    return { valid: false, error: "Enter a valid numeric amount" };
  }

  if (num <= 0) {
    return { valid: false, error: "Amount must be greater than ₹0" };
  }

  if (num > 1000000) {
    return { valid: false, error: "Amount cannot exceed ₹10,00,000" };
  }

  return { valid: true, amount: Math.round(num * 100) / 100 };
}
