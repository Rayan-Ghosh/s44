/**
 * Regression test for UserTransaction Canonical Status Adapter (Part 4H)
 *
 * Run with: npx tsx src/utils/__tests__/user-transaction-status.regression.ts
 */

import {
  getCanonicalStatusForUserTransaction,
  isTerminalUserTransaction,
  isReadOnlyUserTransaction,
} from "../user-transaction-status";
import type { UserTransaction } from "../../services/payment-service";
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
console.log("AVARAN PAY PART 4H: USER TRANSACTION STATUS ADAPTER REGRESSION");
console.log("=================================================================\n");

function createMockTx(
  status: any,
  riskScore: number = 20,
  riskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW"
): UserTransaction {
  return {
    id: "tx-test-1",
    title: "Test Merchant Payment",
    merchant: "Test Merchant",
    amount: 500,
    date: "2026-09-04",
    timestamp: "10:00 AM",
    paymentMethod: "UPI",
    status,
    riskScore,
    riskLevel,
    riskFactors: [],
    reasons: [],
  };
}

// ---------------------------------------------------------------------------
// 1. Clearly supported UserTransaction statuses
// ---------------------------------------------------------------------------
console.log("--- Test Suite 1: Clearly Supported UserTransaction Statuses ---");
const supportedCases: Array<[string, CanonicalTransactionStatus]> = [
  ["Completed", "CONFIRMED"],
  ["Blocked", "FAILED"],
  ["Reported", "REPORTED"],
];

for (const [rawStatus, expectedCanonical] of supportedCases) {
  const tx = createMockTx(rawStatus);
  const actual = getCanonicalStatusForUserTransaction(tx);
  assertEqual(actual, expectedCanonical, `UserTransaction status "${rawStatus}" -> "${expectedCanonical}"`);
}

// ---------------------------------------------------------------------------
// 2. Already-canonical transaction statuses pass through
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 2: Already-canonical Statuses Pass Through ---");
const canonicalCases: CanonicalTransactionStatus[] = [
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

for (const canonical of canonicalCases) {
  const tx = createMockTx(canonical);
  const actual = getCanonicalStatusForUserTransaction(tx);
  assertEqual(actual, canonical, `Canonical status "${canonical}" passed through`);
}

// ---------------------------------------------------------------------------
// 3. Ambiguous statuses intentionally return null (No false inferences)
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 3: Ambiguous Statuses Return null ---");
const ambiguousStatuses = [
  "Safe",             // Must NOT infer CONFIRMED
  "Held",             // Must NOT infer AWAITING_GUARDIAN
  "Risk detected",    // Must NOT infer HIGH_RISK
  "Approved by you",  // Must NOT infer GUARDIAN_APPROVED
  "Pending",          // Must NOT infer PAYMENT_PENDING_CONFIRMATION
  "Allowed",          // Must NOT infer CONFIRMED
  "Authorized",       // Must NOT infer CONFIRMED
  "Needs Review",
  "Waiting For User",
  "Flagged & Held",
  "Scam Intercepted",
  "Safe Call",
  "Confirmed",        // Legacy title-cased is ambiguous
];

for (const status of ambiguousStatuses) {
  const tx = createMockTx(status);
  const actual = getCanonicalStatusForUserTransaction(tx);
  assertEqual(actual, null, `Ambiguous status "${status}" returns null`);
}

// ---------------------------------------------------------------------------
// 4. Missing, empty, or unknown statuses return null
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 4: Missing, Empty, or Unknown Statuses Return null ---");
assertEqual(getCanonicalStatusForUserTransaction(createMockTx("")), null, "Empty status string returns null");
assertEqual(getCanonicalStatusForUserTransaction(createMockTx("   ")), null, "Whitespace status string returns null");
assertEqual(getCanonicalStatusForUserTransaction(createMockTx(undefined)), null, "Undefined status returns null");
assertEqual(getCanonicalStatusForUserTransaction(createMockTx(null)), null, "Null status returns null");
assertEqual(getCanonicalStatusForUserTransaction(createMockTx("UNKNOWN_CUSTOM")), null, "Unknown status returns null");
assertEqual(getCanonicalStatusForUserTransaction(null as unknown as UserTransaction), null, "Null transaction object returns null");

// ---------------------------------------------------------------------------
// 5. Risk score / level does not influence status mapping
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 5: Risk Scores & Levels Do Not Alter Status Output ---");
const testScores = [0, 30, 31, 60, 61, 85, 100];

for (const score of testScores) {
  const level = score <= 30 ? "LOW" : score <= 60 ? "MEDIUM" : "HIGH";

  // Completed is always CONFIRMED regardless of score
  const txCompleted = createMockTx("Completed", score, level);
  assertEqual(
    getCanonicalStatusForUserTransaction(txCompleted),
    "CONFIRMED",
    `Completed with score=${score}, level=${level} -> CONFIRMED`
  );

  // Safe is always null regardless of score
  const txSafe = createMockTx("Safe", score, level);
  assertEqual(
    getCanonicalStatusForUserTransaction(txSafe),
    null,
    `Safe with score=${score}, level=${level} -> null (no risk inference)`
  );

  // Risk detected is always null regardless of score
  const txRiskDetected = createMockTx("Risk detected", score, level);
  assertEqual(
    getCanonicalStatusForUserTransaction(txRiskDetected),
    null,
    `Risk detected with score=${score}, level=${level} -> null (no risk inference)`
  );
}

// ---------------------------------------------------------------------------
// 6. Input Object Non-Mutation Verification
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 6: Input Object Non-Mutation Check ---");
const originalTx: UserTransaction = {
  id: "tx-immutable-1",
  title: "Coffee Shop",
  merchant: "Barista Cafe",
  amount: 250,
  date: "2026-09-04",
  timestamp: "10:30 AM",
  paymentMethod: "UPI_SCAN",
  status: "Completed",
  riskScore: 15,
  riskLevel: "LOW",
  riskFactors: [{ factor_type: "amount", factor_name: "Low Amount", contribution: 5, explanation: "Normal" }],
  reasons: ["Safe payee"],
};

const txSnapshotBefore = JSON.stringify(originalTx);
const derivedStatus = getCanonicalStatusForUserTransaction(originalTx);
const txSnapshotAfter = JSON.stringify(originalTx);

assertEqual(derivedStatus, "CONFIRMED", "Derived status is CONFIRMED");
assertEqual(txSnapshotBefore === txSnapshotAfter, true, "Original UserTransaction object was not mutated");

// ---------------------------------------------------------------------------
// 7. Non-throwing Robustness
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 7: Non-throwing Robustness ---");
try {
  getCanonicalStatusForUserTransaction({} as UserTransaction);
  getCanonicalStatusForUserTransaction({ status: 123 } as any);
  getCanonicalStatusForUserTransaction(undefined as any);
  assertEqual(true, true, "Safely evaluated malformed transactions without throwing");
} catch (e: any) {
  failures++;
  console.error(`[FAIL] Exception during adapter call: ${e?.message}`);
}

// ---------------------------------------------------------------------------
// 8. Part 4I: UserTransaction Optional canonicalStatus Type Check
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 8: Optional canonicalStatus on UserTransaction (Part 4I) ---");

// A UserTransaction without canonicalStatus is valid and undefined
const txWithoutCanonical: UserTransaction = {
  id: "tx-without-canonical",
  title: "Grocery Store",
  merchant: "Fresh Mart",
  amount: 1200,
  date: "2026-09-04",
  timestamp: "11:00 AM",
  paymentMethod: "UPI",
  status: "Completed",
  riskScore: 10,
  riskLevel: "LOW",
  riskFactors: [],
  reasons: [],
};
assertEqual(txWithoutCanonical.canonicalStatus, undefined, "UserTransaction without canonicalStatus has canonicalStatus === undefined");
assertEqual(txWithoutCanonical.status, "Completed", "Existing status field remains unchanged and present");

// A UserTransaction with a valid CanonicalTransactionStatus is valid
const txWithCanonical: UserTransaction = {
  id: "tx-with-canonical",
  title: "Electronics Store",
  merchant: "Tech World",
  amount: 4500,
  date: "2026-09-04",
  timestamp: "11:15 AM",
  paymentMethod: "UPI_QR",
  status: "Completed",
  canonicalStatus: "CONFIRMED",
  riskScore: 25,
  riskLevel: "LOW",
  riskFactors: [],
  reasons: [],
};
assertEqual(txWithCanonical.canonicalStatus, "CONFIRMED", "UserTransaction with canonicalStatus holds valid CanonicalTransactionStatus");
assertEqual(txWithCanonical.status, "Completed", "Existing status field remains unchanged alongside canonicalStatus");

// ---------------------------------------------------------------------------
// 9. Part 4J: Prefer Explicit canonicalStatus Over Legacy status
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 9: Prefer Explicit canonicalStatus (Part 4J) ---");

// Explicit canonicalStatus is returned unchanged
const txExplicit: UserTransaction = {
  ...createMockTx("Completed"),
  canonicalStatus: "PAYMENT_APP_PENDING",
};
assertEqual(
  getCanonicalStatusForUserTransaction(txExplicit),
  "PAYMENT_APP_PENDING",
  "Explicit canonicalStatus 'PAYMENT_APP_PENDING' returned directly"
);

// Explicit canonicalStatus takes priority over conflicting legacy status
const txConflicting: UserTransaction = {
  ...createMockTx("Safe"),
  canonicalStatus: "AWAITING_GUARDIAN",
};
assertEqual(
  getCanonicalStatusForUserTransaction(txConflicting),
  "AWAITING_GUARDIAN",
  "Explicit canonicalStatus 'AWAITING_GUARDIAN' takes priority over legacy 'Safe'"
);

const txConflictingBlocked: UserTransaction = {
  ...createMockTx("Blocked"),
  canonicalStatus: "CONFIRMED",
};
assertEqual(
  getCanonicalStatusForUserTransaction(txConflictingBlocked),
  "CONFIRMED",
  "Explicit canonicalStatus 'CONFIRMED' takes priority over legacy 'Blocked'"
);

// Missing canonicalStatus falls back to existing adapter behavior
const txFallback: UserTransaction = {
  ...createMockTx("Completed"),
  canonicalStatus: undefined,
};
assertEqual(
  getCanonicalStatusForUserTransaction(txFallback),
  "CONFIRMED",
  "Missing canonicalStatus falls back to legacy 'Completed' -> 'CONFIRMED'"
);

// Undefined canonicalStatus with ambiguous legacy status still returns null
const txAmbiguousFallback: UserTransaction = {
  ...createMockTx("Held"),
  canonicalStatus: undefined,
};
assertEqual(
  getCanonicalStatusForUserTransaction(txAmbiguousFallback),
  null,
  "Undefined canonicalStatus with ambiguous legacy 'Held' returns null"
);

const txSafeFallback: UserTransaction = {
  ...createMockTx("Safe"),
  canonicalStatus: undefined,
};
assertEqual(
  getCanonicalStatusForUserTransaction(txSafeFallback),
  null,
  "Undefined canonicalStatus with ambiguous legacy 'Safe' returns null"
);

// Input transaction non-mutation check for explicit canonicalStatus
const txExplicitImmutable: UserTransaction = {
  ...createMockTx("Safe"),
  canonicalStatus: "HIGH_RISK",
};
const txBefore4J = JSON.stringify(txExplicitImmutable);
const result4J = getCanonicalStatusForUserTransaction(txExplicitImmutable);
const txAfter4J = JSON.stringify(txExplicitImmutable);

assertEqual(result4J, "HIGH_RISK", "Returns explicit canonicalStatus");
assertEqual(txBefore4J === txAfter4J, true, "Transaction object remains strictly unmutated");

// ---------------------------------------------------------------------------
// 10. Part 4K: isTerminalUserTransaction Helper Tests
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 10: Terminal Status Helper (Part 4K) ---");

// Explicit CONFIRMED, CANCELLED, FAILED, REPORTED return true
assertEqual(
  isTerminalUserTransaction({ ...createMockTx("Safe"), canonicalStatus: "CONFIRMED" }),
  true,
  "Explicit CONFIRMED returns true"
);
assertEqual(
  isTerminalUserTransaction({ ...createMockTx("Safe"), canonicalStatus: "CANCELLED" }),
  true,
  "Explicit CANCELLED returns true"
);
assertEqual(
  isTerminalUserTransaction({ ...createMockTx("Safe"), canonicalStatus: "FAILED" }),
  true,
  "Explicit FAILED returns true"
);
assertEqual(
  isTerminalUserTransaction({ ...createMockTx("Safe"), canonicalStatus: "REPORTED" }),
  true,
  "Explicit REPORTED returns true"
);

// Explicit non-terminal canonical statuses return false
const nonTerminalCanonicalStatuses: CanonicalTransactionStatus[] = [
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
];
for (const nonTerminal of nonTerminalCanonicalStatuses) {
  assertEqual(
    isTerminalUserTransaction({ ...createMockTx("Completed"), canonicalStatus: nonTerminal }),
    false,
    `Explicit non-terminal '${nonTerminal}' returns false`
  );
}

// Legacy supported statuses fallback
assertEqual(
  isTerminalUserTransaction(createMockTx("Completed")),
  true,
  "Legacy 'Completed' resolves to CONFIRMED and returns true"
);
assertEqual(
  isTerminalUserTransaction(createMockTx("Blocked")),
  true,
  "Legacy 'Blocked' resolves to FAILED and returns true"
);
assertEqual(
  isTerminalUserTransaction(createMockTx("Reported")),
  true,
  "Legacy 'Reported' resolves to REPORTED and returns true"
);

// Ambiguous legacy statuses return false
assertEqual(isTerminalUserTransaction(createMockTx("Safe")), false, "Ambiguous legacy 'Safe' returns false");
assertEqual(isTerminalUserTransaction(createMockTx("Held")), false, "Ambiguous legacy 'Held' returns false");
assertEqual(isTerminalUserTransaction(createMockTx("Risk detected")), false, "Ambiguous legacy 'Risk detected' returns false");
assertEqual(isTerminalUserTransaction(createMockTx("Approved by you")), false, "Ambiguous legacy 'Approved by you' returns false");
assertEqual(isTerminalUserTransaction(createMockTx("Pending")), false, "Ambiguous legacy 'Pending' returns false");

// Missing, empty, or unknown status returns false
assertEqual(isTerminalUserTransaction(createMockTx("")), false, "Empty status returns false");
assertEqual(isTerminalUserTransaction(createMockTx(undefined)), false, "Undefined status returns false");
assertEqual(isTerminalUserTransaction(createMockTx(null)), false, "Null status returns false");

// Conflicting canonical and legacy statuses use canonicalStatus
assertEqual(
  isTerminalUserTransaction({ ...createMockTx("Completed"), canonicalStatus: "AWAITING_GUARDIAN" }),
  false,
  "Conflicting canonicalStatus 'AWAITING_GUARDIAN' overrides legacy 'Completed' -> false"
);
assertEqual(
  isTerminalUserTransaction({ ...createMockTx("Safe"), canonicalStatus: "CONFIRMED" }),
  true,
  "Conflicting canonicalStatus 'CONFIRMED' overrides legacy 'Safe' -> true"
);

// Risk fields and isCompleted do not affect the result
assertEqual(
  isTerminalUserTransaction({ ...createMockTx("Safe", 95, "HIGH"), isCompleted: true }),
  false,
  "isCompleted: true on ambiguous status does NOT make it terminal"
);
assertEqual(
  isTerminalUserTransaction({ ...createMockTx("Safe", 0, "LOW"), isCompleted: true }),
  false,
  "isCompleted: true with LOW risk score does NOT make it terminal"
);
assertEqual(
  isTerminalUserTransaction({ ...createMockTx("Completed", 99, "HIGH"), isCompleted: false }),
  true,
  "Completed status remains terminal regardless of high riskScore and isCompleted: false"
);

// Non-mutation check
const txTermImm: UserTransaction = {
  ...createMockTx("Completed"),
  canonicalStatus: "CONFIRMED",
};
const beforeTermSnap = JSON.stringify(txTermImm);
const termResult = isTerminalUserTransaction(txTermImm);
const afterTermSnap = JSON.stringify(txTermImm);
assertEqual(termResult, true, "isTerminalUserTransaction returns true");
assertEqual(beforeTermSnap === afterTermSnap, true, "Input transaction object is not mutated");

// ---------------------------------------------------------------------------
// 11. Part 4L: isReadOnlyUserTransaction Helper Tests
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 11: Read-Only Transaction Helper (Part 4L) ---");

// Explicit CONFIRMED, CANCELLED, FAILED, REPORTED return true
assertEqual(
  isReadOnlyUserTransaction({ ...createMockTx("Safe"), canonicalStatus: "CONFIRMED" }),
  true,
  "Explicit CONFIRMED is read-only"
);
assertEqual(
  isReadOnlyUserTransaction({ ...createMockTx("Safe"), canonicalStatus: "CANCELLED" }),
  true,
  "Explicit CANCELLED is read-only"
);
assertEqual(
  isReadOnlyUserTransaction({ ...createMockTx("Safe"), canonicalStatus: "FAILED" }),
  true,
  "Explicit FAILED is read-only"
);
assertEqual(
  isReadOnlyUserTransaction({ ...createMockTx("Safe"), canonicalStatus: "REPORTED" }),
  true,
  "Explicit REPORTED is read-only"
);

// Explicit non-terminal status returns false
for (const nonTerminal of nonTerminalCanonicalStatuses) {
  assertEqual(
    isReadOnlyUserTransaction({ ...createMockTx("Completed"), canonicalStatus: nonTerminal }),
    false,
    `Explicit non-terminal '${nonTerminal}' is NOT read-only`
  );
}

// Legacy supported statuses fallback
assertEqual(
  isReadOnlyUserTransaction(createMockTx("Completed")),
  true,
  "Legacy 'Completed' is read-only"
);
assertEqual(
  isReadOnlyUserTransaction(createMockTx("Blocked")),
  true,
  "Legacy 'Blocked' is read-only"
);
assertEqual(
  isReadOnlyUserTransaction(createMockTx("Reported")),
  true,
  "Legacy 'Reported' is read-only"
);

// Ambiguous Safe/Held/Risk detected returns false
assertEqual(isReadOnlyUserTransaction(createMockTx("Safe")), false, "Ambiguous legacy 'Safe' is NOT read-only");
assertEqual(isReadOnlyUserTransaction(createMockTx("Held")), false, "Ambiguous legacy 'Held' is NOT read-only");
assertEqual(isReadOnlyUserTransaction(createMockTx("Risk detected")), false, "Ambiguous legacy 'Risk detected' is NOT read-only");

// Conflicting canonical and legacy statuses use canonicalStatus
assertEqual(
  isReadOnlyUserTransaction({ ...createMockTx("Completed"), canonicalStatus: "AWAITING_GUARDIAN" }),
  false,
  "Conflicting canonicalStatus 'AWAITING_GUARDIAN' overrides legacy 'Completed' -> NOT read-only"
);
assertEqual(
  isReadOnlyUserTransaction({ ...createMockTx("Safe"), canonicalStatus: "CONFIRMED" }),
  true,
  "Conflicting canonicalStatus 'CONFIRMED' overrides legacy 'Safe' -> is read-only"
);

// isCompleted does not affect the result
assertEqual(
  isReadOnlyUserTransaction({ ...createMockTx("Safe"), isCompleted: true }),
  false,
  "isCompleted: true on ambiguous status does NOT make it read-only"
);
assertEqual(
  isReadOnlyUserTransaction({ ...createMockTx("Completed"), isCompleted: false }),
  true,
  "Completed status remains read-only even if isCompleted: false"
);

// Input transaction is not mutated
const txReadOnlyImm: UserTransaction = {
  ...createMockTx("Completed"),
  canonicalStatus: "CONFIRMED",
};
const beforeReadOnlySnap = JSON.stringify(txReadOnlyImm);
const readOnlyResult = isReadOnlyUserTransaction(txReadOnlyImm);
const afterReadOnlySnap = JSON.stringify(txReadOnlyImm);
assertEqual(readOnlyResult, true, "isReadOnlyUserTransaction returns true");
assertEqual(beforeReadOnlySnap === afterReadOnlySnap, true, "Input transaction object is not mutated");

// Read-only result matches isTerminalUserTransaction for all canonical statuses
for (const status of canonicalCases) {
  const testTx: UserTransaction = {
    ...createMockTx("Safe"),
    canonicalStatus: status,
  };
  const isTerminal = isTerminalUserTransaction(testTx);
  const isReadOnly = isReadOnlyUserTransaction(testTx);
  assertEqual(
    isReadOnly,
    isTerminal,
    `isReadOnlyUserTransaction matches isTerminalUserTransaction for status '${status}' (${isReadOnly})`
  );
}

// ---------------------------------------------------------------------------
// Final Results
// ---------------------------------------------------------------------------
console.log("\n=================================================================");
console.log(`${failures === 0 ? "ALL PART 4H, 4I, 4J, 4K, & 4L REGRESSION TESTS PASSED" : `${failures} CHECK(S) FAILED`}`);
console.log("=================================================================");

if (failures > 0) {
  throw new Error(`${failures} user-transaction-status check(s) failed.`);
}
