/**
 * Regression test for Safe Canonical Status Transition Helper (Part 4G)
 *
 * Run with: npx tsx src/utils/__tests__/apply-transaction-status-transition.regression.ts
 */

import { applyTransactionStatusTransition } from "../apply-transaction-status-transition";
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
console.log("AVARAN PAY PART 4G: APPLY STATUS TRANSITION REGRESSION");
console.log("=================================================================\n");

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

// ---------------------------------------------------------------------------
// 1. Every valid transition returns the requested nextStatus
// ---------------------------------------------------------------------------
console.log("--- Test Suite 1: Allowed Transitions Return nextStatus ---");
const validTransitions: Array<[CanonicalTransactionStatus, CanonicalTransactionStatus]> = [
  // CREATED
  ["CREATED", "ANALYZING"],

  // ANALYZING
  ["ANALYZING", "LOW_RISK"],
  ["ANALYZING", "MEDIUM_RISK"],
  ["ANALYZING", "HIGH_RISK"],
  ["ANALYZING", "FAILED"],

  // LOW_RISK
  ["LOW_RISK", "AWAITING_BIOMETRICS"],
  ["LOW_RISK", "CANCELLED"],
  ["LOW_RISK", "FAILED"],

  // MEDIUM_RISK
  ["MEDIUM_RISK", "AWAITING_BIOMETRICS"],
  ["MEDIUM_RISK", "CANCELLED"],
  ["MEDIUM_RISK", "FAILED"],

  // HIGH_RISK
  ["HIGH_RISK", "AWAITING_BIOMETRICS"],
  ["HIGH_RISK", "CANCELLED"],
  ["HIGH_RISK", "FAILED"],

  // AWAITING_BIOMETRICS
  ["AWAITING_BIOMETRICS", "AWAITING_GUARDIAN"],
  ["AWAITING_BIOMETRICS", "PAYMENT_APP_PENDING"],
  ["AWAITING_BIOMETRICS", "CANCELLED"],
  ["AWAITING_BIOMETRICS", "FAILED"],

  // AWAITING_GUARDIAN
  ["AWAITING_GUARDIAN", "GUARDIAN_APPROVED"],
  ["AWAITING_GUARDIAN", "GUARDIAN_REJECTED"],
  ["AWAITING_GUARDIAN", "GUARDIAN_TIMEOUT"],
  ["AWAITING_GUARDIAN", "CANCELLED"],
  ["AWAITING_GUARDIAN", "FAILED"],

  // GUARDIAN_APPROVED
  ["GUARDIAN_APPROVED", "PAYMENT_APP_PENDING"],
  ["GUARDIAN_APPROVED", "CANCELLED"],
  ["GUARDIAN_APPROVED", "FAILED"],

  // GUARDIAN_REJECTED
  ["GUARDIAN_REJECTED", "CANCELLED"],
  ["GUARDIAN_REJECTED", "FAILED"],

  // GUARDIAN_TIMEOUT
  ["GUARDIAN_TIMEOUT", "CANCELLED"],
  ["GUARDIAN_TIMEOUT", "FAILED"],

  // PAYMENT_APP_PENDING
  ["PAYMENT_APP_PENDING", "PAYMENT_PENDING_CONFIRMATION"],
  ["PAYMENT_APP_PENDING", "CONFIRMED"],
  ["PAYMENT_APP_PENDING", "CANCELLED"],
  ["PAYMENT_APP_PENDING", "FAILED"],

  // PAYMENT_PENDING_CONFIRMATION
  ["PAYMENT_PENDING_CONFIRMATION", "CONFIRMED"],
  ["PAYMENT_PENDING_CONFIRMATION", "CANCELLED"],
  ["PAYMENT_PENDING_CONFIRMATION", "FAILED"],
  ["PAYMENT_PENDING_CONFIRMATION", "REPORTED"],

  // Terminals to REPORTED
  ["CONFIRMED", "REPORTED"],
  ["CANCELLED", "REPORTED"],
  ["FAILED", "REPORTED"],
];

for (const [current, next] of validTransitions) {
  const result = applyTransactionStatusTransition(current, next);
  assertEqual(result, next, `Valid transition ${current} -> ${next} returns ${next}`);
}

// ---------------------------------------------------------------------------
// 2. Self-transitions strictly return null
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 2: Self-transitions Return null ---");
for (const status of allCanonicalStatuses) {
  const result = applyTransactionStatusTransition(status, status);
  assertEqual(result, null, `Self-transition ${status} -> ${status} returns null`);
}

// ---------------------------------------------------------------------------
// 3. Arbitrary invalid forward/backward jumps return null
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 3: Invalid Jumps Return null ---");
const invalidJumps: Array<[CanonicalTransactionStatus, CanonicalTransactionStatus, string]> = [
  ["CREATED", "CONFIRMED", "Cannot skip straight from CREATED to CONFIRMED"],
  ["CREATED", "PAYMENT_APP_PENDING", "Cannot skip straight from CREATED to PAYMENT_APP_PENDING"],
  ["CREATED", "AWAITING_GUARDIAN", "Cannot skip straight from CREATED to AWAITING_GUARDIAN"],
  ["ANALYZING", "CONFIRMED", "Cannot skip straight from ANALYZING to CONFIRMED"],
  ["LOW_RISK", "GUARDIAN_APPROVED", "LOW_RISK cannot jump straight to GUARDIAN_APPROVED"],
  ["MEDIUM_RISK", "CONFIRMED", "MEDIUM_RISK cannot jump straight to CONFIRMED"],
  ["HIGH_RISK", "CONFIRMED", "HIGH_RISK cannot jump straight to CONFIRMED"],
  ["AWAITING_BIOMETRICS", "CONFIRMED", "AWAITING_BIOMETRICS cannot jump straight to CONFIRMED"],
  ["PAYMENT_APP_PENDING", "CREATED", "Cannot transition backward from PAYMENT_APP_PENDING to CREATED"],
];

for (const [current, next, reason] of invalidJumps) {
  const result = applyTransactionStatusTransition(current, next);
  assertEqual(result, null, `Invalid jump (${reason}): ${current} -> ${next} returns null`);
}

// ---------------------------------------------------------------------------
// 4. Critical Invariants: REPORTED, CONFIRMED/CANCELLED exclusion, Guardian rejections
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 4: Critical Invariants Return null ---");

// REPORTED cannot transition anywhere
for (const target of allCanonicalStatuses) {
  const result = applyTransactionStatusTransition("REPORTED", target);
  assertEqual(result, null, `REPORTED cannot transition to ${target} (returns null)`);
}

// CONFIRMED cannot become CANCELLED
assertEqual(
  applyTransactionStatusTransition("CONFIRMED", "CANCELLED"),
  null,
  "CONFIRMED cannot become CANCELLED (returns null)"
);

// CANCELLED cannot become CONFIRMED
assertEqual(
  applyTransactionStatusTransition("CANCELLED", "CONFIRMED"),
  null,
  "CANCELLED cannot become CONFIRMED (returns null)"
);

// GUARDIAN_REJECTED cannot become PAYMENT_APP_PENDING
assertEqual(
  applyTransactionStatusTransition("GUARDIAN_REJECTED", "PAYMENT_APP_PENDING"),
  null,
  "GUARDIAN_REJECTED cannot become PAYMENT_APP_PENDING (returns null)"
);

// GUARDIAN_TIMEOUT cannot become PAYMENT_APP_PENDING
assertEqual(
  applyTransactionStatusTransition("GUARDIAN_TIMEOUT", "PAYMENT_APP_PENDING"),
  null,
  "GUARDIAN_TIMEOUT cannot become PAYMENT_APP_PENDING (returns null)"
);

// ---------------------------------------------------------------------------
// 5. Non-throwing Robustness
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 5: Non-throwing Robustness ---");
try {
  for (const s1 of allCanonicalStatuses) {
    for (const s2 of allCanonicalStatuses) {
      applyTransactionStatusTransition(s1, s2);
    }
  }
  // Unexpected input testing
  applyTransactionStatusTransition(null as any, "CONFIRMED");
  applyTransactionStatusTransition("CONFIRMED", undefined as any);
  applyTransactionStatusTransition("INVALID" as any, "CONFIRMED");
  assertEqual(true, true, "Full transition matrix and unexpected inputs evaluated safely without throwing");
} catch (e: any) {
  failures++;
  console.error(`[FAIL] Exception thrown: ${e?.message}`);
}

// ---------------------------------------------------------------------------
// Final Results
// ---------------------------------------------------------------------------
console.log("\n=================================================================");
console.log(`${failures === 0 ? "ALL PART 4G REGRESSION TESTS PASSED" : `${failures} CHECK(S) FAILED`}`);
console.log("=================================================================");

if (failures > 0) {
  throw new Error(`${failures} apply-transition check(s) failed.`);
}
