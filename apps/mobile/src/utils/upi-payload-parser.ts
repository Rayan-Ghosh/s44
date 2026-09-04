/**
 * Centralized pure QR/UPI payload parser for AVARAN PAY.
 *
 * Implements conservative parsing of NPCI-standard `upi://pay` URIs.
 * Performs no camera, payment, risk evaluation, or transaction state manipulation.
 */

export interface ParsedUpiPaymentData {
  recipient: string;
  amount?: number;
  note?: string;
  payeeName?: string;
  rawPayload: string;
}

export interface ParsedUpiPaymentSuccess {
  success: true;
  data: ParsedUpiPaymentData;
}

export interface ParsedUpiPaymentFailure {
  success: false;
  error: string;
}

export type ParsedUpiPaymentResult = ParsedUpiPaymentSuccess | ParsedUpiPaymentFailure;

/**
 * Parses a raw UPI payment QR or deep link string.
 *
 * Requirements:
 * - Must begin with `upi://pay`.
 * - Only parses `pa`, `pn`, `am`, and `tn`.
 * - Requires a valid `pa` containing one `@` and no whitespace.
 * - Does not invent a recipient from `pn`.
 * - If `am` is present, it must parse to a finite positive number.
 * - Decodes and trims `tn` if present, omitting empty notes.
 * - Preserves the original raw payload for audit/debugging.
 */
export function parseUpiPaymentPayload(payload: string): ParsedUpiPaymentResult {
  if (typeof payload !== "string") {
    return { success: false, error: "Invalid payload: input must be a string." };
  }

  const trimmedPayload = payload.trim();
  if (!trimmedPayload) {
    return { success: false, error: "Empty UPI payment payload." };
  }

  // Must begin with upi://pay (case-insensitive check)
  if (!/^upi:\/\/pay(\/|\?)?/i.test(trimmedPayload) || !trimmedPayload.toLowerCase().startsWith("upi://pay")) {
    return { success: false, error: "Malformed payload: must be a valid upi://pay URI." };
  }

  const qIndex = trimmedPayload.indexOf("?");
  if (qIndex === -1) {
    return { success: false, error: "Missing UPI query parameters." };
  }

  const queryString = trimmedPayload.slice(qIndex + 1);
  if (!queryString.trim()) {
    return { success: false, error: "Empty UPI query parameters." };
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(queryString);
  } catch {
    return { success: false, error: "Failed to parse UPI query parameters." };
  }

  // 1. Recipient (pa) - Mandatory
  const rawPa = params.get("pa");
  if (rawPa === null || rawPa === undefined) {
    return { success: false, error: "Missing required UPI recipient (pa)." };
  }

  const recipient = rawPa.trim();
  if (!recipient) {
    return { success: false, error: "Empty UPI recipient (pa)." };
  }

  // Must not contain whitespace
  if (/\s/.test(recipient)) {
    return { success: false, error: "Invalid UPI recipient: contains whitespace." };
  }

  // Conservative UPI format check: exactly one '@', with characters before and after
  const atParts = recipient.split("@");
  if (atParts.length !== 2 || !atParts[0] || !atParts[1]) {
    return { success: false, error: "Invalid UPI recipient format: must contain username and handle separated by '@'." };
  }

  // 2. Amount (am) - Optional, but strictly validated if present
  let amount: number | undefined = undefined;
  const rawAm = params.get("am");
  if (rawAm !== null && rawAm !== undefined) {
    const trimmedAm = rawAm.trim();
    if (!trimmedAm) {
      return { success: false, error: "Invalid amount: empty amount specified in payload." };
    }

    const parsedAmount = Number(trimmedAm);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return { success: false, error: "Invalid amount: must be a positive finite number greater than zero." };
    }

    amount = parsedAmount;
  }

  // 3. Note (tn) - Optional, decoded and trimmed
  let note: string | undefined = undefined;
  const rawTn = params.get("tn");
  if (rawTn !== null && rawTn !== undefined) {
    const trimmedTn = rawTn.trim();
    if (trimmedTn.length > 0) {
      note = trimmedTn;
    }
  }

  // 4. Payee name (pn) - Optional, decoded and trimmed
  let payeeName: string | undefined = undefined;
  const rawPn = params.get("pn");
  if (rawPn !== null && rawPn !== undefined) {
    const trimmedPn = rawPn.trim();
    if (trimmedPn.length > 0) {
      payeeName = trimmedPn;
    }
  }

  return {
    success: true,
    data: {
      recipient,
      ...(amount !== undefined ? { amount } : {}),
      ...(note !== undefined ? { note } : {}),
      ...(payeeName !== undefined ? { payeeName } : {}),
      rawPayload: payload,
    },
  };
}
