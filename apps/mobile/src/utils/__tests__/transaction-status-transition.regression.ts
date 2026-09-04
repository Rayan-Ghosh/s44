/**
 * Regression test for Canonical Transaction Status Transition Validator (Part 4F)
 *
 * Run with: npx tsx src/utils/__tests__/transaction-status-transition.regression.ts
 */

import { canTransitionTransactionStatus } from "../transaction-status-transition";
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
console.log("AVARAN PAY PART 4F: STATUS TRANSITION VALIDATION REGRESSION");
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
// 1. Every explicitly allowed transition must return true
// ---------------------------------------------------------------------------
console.log("--- Test Suite 1: Allowed Lifecycle Transitions ---");
const allowedTransitions: Array<[CanonicalTransactionStatus, CanonicalTransactionStatus]> = [
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

  // Terminal state leads to REPORTED
  ["CONFIRMED", "REPORTED"],
  ["CANCELLED", "REPORTED"],
  ["FAILED", "REPORTED"],
];

for (const [from, to] of allowedTransitions) {
  const actual = canTransitionTransactionStatus(from, to);
  assertEqual(actual, true, `Allowed: ${from} -> ${to}`);
}

// ---------------------------------------------------------------------------
// 2. Self-transitions strictly return false
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 2: Self-transitions Strictly Return false ---");
for (const status of allCanonicalStatuses) {
  const actual = canTransitionTransactionStatus(status, status);
  assertEqual(actual, false, `Self-transition disallowed: ${status} -> ${status}`);
}

// ---------------------------------------------------------------------------
// 3. Arbitrary invalid jumps return false
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 3: Invalid Arbitrary Forward & Backward Jumps ---");
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

for (const [from, to, reason] of invalidJumps) {
  const actual = canTransitionTransactionStatus(from, to);
  assertEqual(actual, false, `Invalid jump (${reason}): ${from} -> ${to}`);
}

// ---------------------------------------------------------------------------
// 4. Critical Terminal & Mutual Exclusion Invariants
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 4: Terminal States & Critical Safety Invariants ---");

// Terminal REPORTED has no outgoing transitions
for (const target of allCanonicalStatuses) {
  const actual = canTransitionTransactionStatus("REPORTED", target);
  assertEqual(actual, false, `Terminal REPORTED cannot transition to ${target}`);
}

// CONFIRMED cannot become CANCELLED
assertEqual(
  canTransitionTransactionStatus("CONFIRMED", "CANCELLED"),
  false,
  "CONFIRMED cannot transition to CANCELLED"
);

// CANCELLED cannot become CONFIRMED
assertEqual(
  canTransitionTransactionStatus("CANCELLED", "CONFIRMED"),
  false,
  "CANCELLED cannot transition to CONFIRMED"
);

// GUARDIAN_REJECTED cannot become PAYMENT_APP_PENDING
assertEqual(
  canTransitionTransactionStatus("GUARDIAN_REJECTED", "PAYMENT_APP_PENDING"),
  false,
  "GUARDIAN_REJECTED cannot transition to PAYMENT_APP_PENDING"
);

// GUARDIAN_TIMEOUT cannot become PAYMENT_APP_PENDING
assertEqual(
  canTransitionTransactionStatus("GUARDIAN_TIMEOUT", "PAYMENT_APP_PENDING"),
  false,
  "GUARDIAN_TIMEOUT cannot transition to PAYMENT_APP_PENDING"
);

// ---------------------------------------------------------------------------
// 5. Non-throwing Robustness
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 5: Non-throwing Robustness ---");
try {
  for (const s1 of allCanonicalStatuses) {
    for (const s2 of allCanonicalStatuses) {
      canTransitionTransactionStatus(s1, s2);
    }
  }
  assertEqual(true, true, "Matrix of all 256 state pairs evaluated safely without throwing");
} catch (e: any) {
  failures++;
  console.error(`[FAIL] Exception during transition check: ${e?.message}`);
}

// ---------------------------------------------------------------------------
// Final Results
// ---------------------------------------------------------------------------
console.log("\n=================================================================");
console.log(`${failures === 0 ? "ALL PART 4F REGRESSION TESTS PASSED" : `${failures} CHECK(S) FAILED`}`);
console.log("=================================================================");

if (failures > 0) {
  throw new Error(`${failures} transition-validator check(s) failed.`);
}
