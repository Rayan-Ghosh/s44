/**
 * Regression test for Canonical Transaction Status Mapping Utility (Part 4C, 4D, 4E)
 *
 * Run with: npx tsx src/utils/__tests__/transaction-status.regression.ts
 */

import { mapToCanonicalTransactionStatus } from "../transaction-status";
import { CanonicalTransactionStatus } from "../../types/transaction";

let failures = 0;

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    failures++;
    console.error(`[FAIL] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`[OK]   ${label}: ${JSON.stringify(actual)}`);
  }
}

console.log("=================================================================");
console.log("AVARAN PAY PART 4E: CANONICAL STATUS PASS-THROUGH & IDEMPOTENCY");
console.log("=================================================================\n");

// ---------------------------------------------------------------------------
// 1. Clearly equivalent known legacy mappings
// ---------------------------------------------------------------------------
console.log("--- Test Suite 1: Known Clearly Equivalent Legacy Mappings ---");
const expectedKnownMappings: Array<[string, CanonicalTransactionStatus]> = [
  ["Detected", "CREATED"],
  ["Analyzing", "ANALYZING"],
  ["Waiting For Guardian", "AWAITING_GUARDIAN"],
  ["Approved", "GUARDIAN_APPROVED"],
  ["Launching Payment App", "PAYMENT_APP_PENDING"],
  ["Payment App Opened", "PAYMENT_APP_PENDING"],
  ["Completed", "CONFIRMED"],
  ["Cancelled", "CANCELLED"],
  ["Blocked", "FAILED"],
  ["Reported", "REPORTED"],
];

for (const [input, expected] of expectedKnownMappings) {
  const actual = mapToCanonicalTransactionStatus(input);
  assertEqual(actual, expected, `Legacy "${input}" -> "${expected}"`);
}

// ---------------------------------------------------------------------------
// 2. All 16 Canonical statuses accepted directly (Idempotent uppercase)
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 2: Every Canonical Status Accepted (Idempotent Uppercase) ---");
const allCanonicalStatuses: CanonicalTransactionStatus[] = [
  "CREATED",
  "ANALYZING",
  "LOW_RISK",
  "MEDIUM_RISK",
  "HIGH_RISK",
  "AWAITING_BIOMETRICS",
  "AWAITING_GUARDIAN",
  "GUARDIAN_APPROVED",
  "GUARDIAN_REJECTED",
  "GUARDIAN_TIMEOUT",
  "PAYMENT_APP_PENDING",
  "PAYMENT_PENDING_CONFIRMATION",
  "CONFIRMED",
  "CANCELLED",
  "FAILED",
  "REPORTED",
];

for (const status of allCanonicalStatuses) {
  const actual = mapToCanonicalTransactionStatus(status);
  assertEqual(actual, status, `Canonical "${status}" -> "${status}"`);
}

// ---------------------------------------------------------------------------
// 3. Lowercase, mixed-case, and padded canonical values
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 3: Lowercase, Mixed-case, and Padded Canonical Values ---");
const canonicalFormattingCases: Array<[string, CanonicalTransactionStatus]> = [
  // Lowercase
  ["created", "CREATED"],
  ["analyzing", "ANALYZING"],
  ["low_risk", "LOW_RISK"],
  ["medium_risk", "MEDIUM_RISK"],
  ["high_risk", "HIGH_RISK"],
  ["awaiting_biometrics", "AWAITING_BIOMETRICS"],
  ["awaiting_guardian", "AWAITING_GUARDIAN"],
  ["guardian_approved", "GUARDIAN_APPROVED"],
  ["guardian_rejected", "GUARDIAN_REJECTED"],
  ["guardian_timeout", "GUARDIAN_TIMEOUT"],
  ["payment_app_pending", "PAYMENT_APP_PENDING"],
  ["payment_pending_confirmation", "PAYMENT_PENDING_CONFIRMATION"],
  ["confirmed", "CONFIRMED"],
  ["cancelled", "CANCELLED"],
  ["failed", "FAILED"],
  ["reported", "REPORTED"],

  // Mixed case with underscore
  ["Low_Risk", "LOW_RISK"],
  ["Awaiting_Guardian", "AWAITING_GUARDIAN"],
  ["Payment_App_Pending", "PAYMENT_APP_PENDING"],
  ["Payment_Pending_Confirmation", "PAYMENT_PENDING_CONFIRMATION"],
  ["Guardian_Approved", "GUARDIAN_APPROVED"],
  ["FaIlEd", "FAILED"],

  // Padded whitespace with canonical
  ["  CREATED  ", "CREATED"],
  ["  awaiting_guardian  ", "AWAITING_GUARDIAN"],
  ["\tPAYMENT_APP_PENDING\n", "PAYMENT_APP_PENDING"],
  ["  confirmed  ", "CONFIRMED"],
  ["  CONFIRMED  ", "CONFIRMED"],
  ["  FAILED  ", "FAILED"],
];

for (const [input, expected] of canonicalFormattingCases) {
  const actual = mapToCanonicalTransactionStatus(input);
  assertEqual(actual, expected, `"${input}" -> "${expected}"`);
}

// ---------------------------------------------------------------------------
// 4. Critical Isolation: "Confirmed" returns null while "CONFIRMED" / "confirmed" maps to "CONFIRMED"
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 4: Ambiguous 'Confirmed' vs Canonical 'CONFIRMED' ---");
assertEqual(mapToCanonicalTransactionStatus("Confirmed"), null, "Title-cased 'Confirmed' returns null");
assertEqual(mapToCanonicalTransactionStatus("  Confirmed  "), null, "Padded title-cased '  Confirmed  ' returns null");
assertEqual(mapToCanonicalTransactionStatus("\tConfirmed\n"), null, "Whitespace-wrapped 'Confirmed' returns null");
assertEqual(mapToCanonicalTransactionStatus("CONFIRMED"), "CONFIRMED", "All-caps 'CONFIRMED' returns 'CONFIRMED'");
assertEqual(mapToCanonicalTransactionStatus("confirmed"), "CONFIRMED", "Lowercase 'confirmed' returns 'CONFIRMED'");
assertEqual(mapToCanonicalTransactionStatus("  CONFIRMED  "), "CONFIRMED", "Padded '  CONFIRMED  ' returns 'CONFIRMED'");
assertEqual(mapToCanonicalTransactionStatus("  confirmed  "), "CONFIRMED", "Padded '  confirmed  ' returns 'CONFIRMED'");

// ---------------------------------------------------------------------------
// 5. Ambiguous legacy statuses intentionally return null
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 5: Ambiguous Legacy Statuses Return null ---");
const ambiguousInputs = [
  "Safe",
  "safe",
  "SAFE",
  "  safe  ",
  "Held",
  "held",
  "HELD",
  "  held  ",
  "Risk detected",
  "risk detected",
  "RISK DETECTED",
  "Pending",
  "pending",
  "PENDING",
  "Needs Review",
  "needs review",
  "Waiting For User",
  "waiting for user",
  "Approved by you",
  "approved by you",
  "Flagged & Held",
  "flagged & held",
  "Scam Intercepted",
  "scam intercepted",
  "Safe Call",
  "safe call",
  "Allowed",
  "allowed",
  "Authorized",
  "authorized",
  "UNKNOWN_CUSTOM_STATUS",
];

for (const input of ambiguousInputs) {
  const actual = mapToCanonicalTransactionStatus(input);
  assertEqual(actual, null, `Ambiguous status "${input}" returns null`);
}

// ---------------------------------------------------------------------------
// 6. Partial canonical values or space-instead-of-underscore strictly return null
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 6: Partial / Misformatted Values Return null ---");
const invalidPartialInputs = [
  "CONFIRM",
  "AWAITING",
  "GUARDIAN",
  "PAYMENT_APP",
  "BIOMETRICS",
  "LOW",
  "MEDIUM",
  "HIGH",
  "REJECTED",
  "TIMEOUT",
  "low risk",                      // Space instead of underscore
  "high risk",                     // Space instead of underscore
  "medium risk",                   // Space instead of underscore
  "awaiting guardian",             // Space instead of underscore (legacy is 'Waiting For Guardian')
  "payment app pending",           // Space instead of underscore
  "payment pending confirmation",  // Space instead of underscore
  "completedd",                    // Misspelling
  "analysingg",                    // Misspelling
];

for (const input of invalidPartialInputs) {
  const actual = mapToCanonicalTransactionStatus(input);
  assertEqual(actual, null, `Invalid/partial input "${input}" returns null`);
}

// ---------------------------------------------------------------------------
// 7. Null, undefined, and empty string handling
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 7: Null, Undefined, and Empty Inputs Return null ---");
assertEqual(mapToCanonicalTransactionStatus(null), null, "null returns null");
assertEqual(mapToCanonicalTransactionStatus(undefined), null, "undefined returns null");
assertEqual(mapToCanonicalTransactionStatus(""), null, "empty string returns null");
assertEqual(mapToCanonicalTransactionStatus("   "), null, "whitespace string returns null");
assertEqual(mapToCanonicalTransactionStatus("\t\n\r  "), null, "whitespace/tab/newline string returns null");

// ---------------------------------------------------------------------------
// 8. Non-throwing robust execution
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 8: Non-throwing Robustness ---");
try {
  const res1 = mapToCanonicalTransactionStatus(null);
  const res2 = mapToCanonicalTransactionStatus(undefined);
  const res3 = mapToCanonicalTransactionStatus("Detected");
  const res4 = mapToCanonicalTransactionStatus("CREATED");
  const res5 = mapToCanonicalTransactionStatus(123 as unknown as string);
  const res6 = mapToCanonicalTransactionStatus({} as unknown as string);
  assertEqual(
    res1 === null && res2 === null && res3 === "CREATED" && res4 === "CREATED" && res5 === null && res6 === null,
    true,
    "Function executes safely across unexpected inputs without throwing"
  );
} catch (e: any) {
  failures++;
  console.error(`[FAIL] Unexpected exception thrown: ${e?.message}`);
}

// ---------------------------------------------------------------------------
// Final Results
// ---------------------------------------------------------------------------
console.log("\n=================================================================");
console.log(`${failures === 0 ? "ALL PART 4E REGRESSION TESTS PASSED" : `${failures} CHECK(S) FAILED`}`);
console.log("=================================================================");

if (failures > 0) {
  throw new Error(`${failures} canonical-status-mapping check(s) failed.`);
}
