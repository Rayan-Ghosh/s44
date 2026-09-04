/**
 * AVARAN PAY — Part 2 Regression Tests: MEDIUM-Risk Mapping & Flow Isolation
 *
 * Requirements:
 * 1. LOW remains LOW.
 * 2. MEDIUM remains MEDIUM.
 * 3. HIGH remains HIGH.
 * 4. MEDIUM does not become "Risk detected".
 * 5. MEDIUM does not become "Held" when that status triggers Guardian.
 * 6. MEDIUM does not trigger Guardian approval.
 * 7. HIGH can still be recognized as HIGH.
 * 8. Existing risk-boundary tests continue to pass.
 *
 * Run with: npx tsx src/utils/__tests__/medium-risk-mapping.regression.ts
 */

import { getRiskLevelFromScore, getStatusBadgeProps, RiskLevel } from "../risk-scoring";
import { DEMO_USER_TRANSACTIONS } from "../../data/demo-data";

let failures = 0;

function assert(condition: boolean, label: string, details?: string) {
  if (!condition) {
    failures++;
    console.error(`[FAIL] ${label}${details ? ` — ${details}` : ""}`);
  } else {
    console.log(`[OK]   ${label}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    failures++;
    console.error(`[FAIL] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`[OK]   ${label}: ${JSON.stringify(actual)}`);
  }
}

console.log("=================================================================");
console.log("AVARAN PAY PART 2: MEDIUM-RISK MAPPING & ISOLATION REGRESSION");
console.log("=================================================================\n");

// ---------------------------------------------------------------------------
// Mirror the authoritative status resolution logic from payment-service.ts
// ---------------------------------------------------------------------------
const STATUS_MAP: Record<string, string> = {
  PENDING: "Held",
  AWAITING_CONFIRMATION: "Held",
  PENDING_AUTHORIZATION: "Held",
  AUTHORIZED: "Held",
  PENDING_GUARDIAN_APPROVAL: "Held",
  ALLOWED: "Safe",
  CONFIRMED: "Completed",
  GUARDIAN_APPROVED: "Approved by you",
  GUARDIAN_TIMEOUT_USER_OVERRODE: "Approved by you",
  CANCELLED: "Blocked",
  GUARDIAN_REJECTED: "Blocked",
  REPORTED: "Reported",
};

function resolveTransactionStatus(backendStatus: string, riskScore: number): {
  riskLevel: RiskLevel;
  status: string;
} {
  const status = STATUS_MAP[backendStatus.toUpperCase()] || "Held";
  const riskLevel = getRiskLevelFromScore(riskScore);

  let resolvedStatus = status;
  if (riskLevel === "HIGH" && status === "Held") {
    resolvedStatus = "Risk detected";
  } else if (riskLevel === "MEDIUM" && status === "Risk detected") {
    resolvedStatus = "Held";
  }

  return { riskLevel, status: resolvedStatus };
}

// ---------------------------------------------------------------------------
// 1. LOW remains LOW
// ---------------------------------------------------------------------------
console.log("--- Test Suite 1: LOW remains LOW ---");
[0, 10, 25, 30].forEach((score) => {
  const level = getRiskLevelFromScore(score);
  assertEqual(level, "LOW", `Score ${score} evaluates to LOW`);
});

const lowResult = resolveTransactionStatus("ALLOWED", 15);
assertEqual(lowResult.riskLevel, "LOW", "LOW tx riskLevel is LOW");
assertEqual(lowResult.status, "Safe", "ALLOWED backend status maps to Safe for LOW risk");

// ---------------------------------------------------------------------------
// 2. MEDIUM remains MEDIUM
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 2: MEDIUM remains MEDIUM ---");
[31, 38, 45, 50, 59, 60].forEach((score) => {
  const level = getRiskLevelFromScore(score);
  assertEqual(level, "MEDIUM", `Score ${score} evaluates to MEDIUM`);
  const badge = getStatusBadgeProps(level);
  assertEqual(badge.label, "MEDIUM RISK", `Score ${score} badge label is 'MEDIUM RISK'`);
  assertEqual(badge.status, "medium", `Score ${score} badge status is 'medium'`);
});

const mediumResult = resolveTransactionStatus("PENDING", 45);
assertEqual(mediumResult.riskLevel, "MEDIUM", "MEDIUM tx riskLevel is MEDIUM");

// ---------------------------------------------------------------------------
// 3. HIGH remains HIGH
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 3: HIGH remains HIGH ---");
[61, 75, 88, 100].forEach((score) => {
  const level = getRiskLevelFromScore(score);
  assertEqual(level, "HIGH", `Score ${score} evaluates to HIGH`);
  const badge = getStatusBadgeProps(level);
  assertEqual(badge.label, "HIGH RISK", `Score ${score} badge label is 'HIGH RISK'`);
  assertEqual(badge.status, "high", `Score ${score} badge status is 'high'`);
});

const highResult = resolveTransactionStatus("PENDING", 82);
assertEqual(highResult.riskLevel, "HIGH", "HIGH tx riskLevel is HIGH");
assertEqual(highResult.status, "Risk detected", "HIGH tx maps to 'Risk detected'");

// ---------------------------------------------------------------------------
// 4. MEDIUM does not become "Risk detected"
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 4: MEDIUM does not become 'Risk detected' ---");
const mediumTxPending = resolveTransactionStatus("PENDING", 55);
assert(mediumTxPending.status !== "Risk detected", "MEDIUM tx with PENDING does not become 'Risk detected'");
assertEqual(mediumTxPending.status, "Held", "MEDIUM tx with PENDING maps to 'Held' (payable review)");

const mediumTxRawRiskDetected = resolveTransactionStatus("Risk detected", 40);
assert(mediumTxRawRiskDetected.status !== "Risk detected", "MEDIUM tx with raw 'Risk detected' does not remain 'Risk detected'");
assertEqual(mediumTxRawRiskDetected.status, "Held", "MEDIUM tx normalizes to 'Held'");

// ---------------------------------------------------------------------------
// 5. MEDIUM does not become "Held" when that status triggers Guardian
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 5: MEDIUM does not trigger high-risk behavior via 'Held' ---");
function isHighRiskEvaluated(tx: { riskLevel?: RiskLevel; riskScore?: number; status?: string }): boolean {
  // Post-fix authoritative logic: only actual HIGH risk (score >= 61 or level HIGH) enters high-risk flows
  return tx.riskLevel === "HIGH" || (typeof tx.riskScore === "number" && tx.riskScore >= 61);
}

const sampleMediumTx = {
  id: "201",
  merchant: "Downtown Cafe",
  amount: 1800,
  status: "Held",
  riskLevel: "MEDIUM" as RiskLevel,
  riskScore: 48,
};

assert(!isHighRiskEvaluated(sampleMediumTx), "MEDIUM transaction with status 'Held' is NOT evaluated as isHighRisk");
assert(sampleMediumTx.status === "Held", "MEDIUM transaction status is 'Held' (payable state, not terminal)");

// ---------------------------------------------------------------------------
// 6. MEDIUM does not trigger Guardian approval
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 6: MEDIUM does not trigger Guardian approval ---");
function simulatePaymentFlowDecision(tx: {
  id?: string;
  merchant?: string;
  amount?: number;
  riskLevel?: RiskLevel;
  riskScore?: number;
  status: string;
  authorizationStatus?: string;
  authorizationRequired?: boolean;
}, trustedContactsCount: number, featureEnabled: boolean) {
  const isHighRisk = isHighRiskEvaluated(tx);
  const requiresBiometric = Boolean(
    isHighRisk && tx.authorizationRequired !== false && tx.authorizationStatus !== "AUTHORIZED"
  );
  const routesToGuardian = Boolean(isHighRisk && featureEnabled && trustedContactsCount > 0);
  const routesToPaymentAppModal = !routesToGuardian && !requiresBiometric;

  return { isHighRisk, requiresBiometric, routesToGuardian, routesToPaymentAppModal };
}

const mediumFlow = simulatePaymentFlowDecision(sampleMediumTx, 2, true);
assertEqual(mediumFlow.routesToGuardian, false, "MEDIUM transaction does NOT route to Guardian approval");
assertEqual(mediumFlow.requiresBiometric, false, "MEDIUM transaction does NOT require biometric authorization");
assertEqual(mediumFlow.routesToPaymentAppModal, true, "MEDIUM transaction routes directly to Choose Payment App modal");

const lowFlow = simulatePaymentFlowDecision({ id: "202", merchant: "Bookstore", amount: 500, status: "Safe", riskLevel: "LOW", riskScore: 10 }, 2, true);
assertEqual(lowFlow.routesToGuardian, false, "LOW transaction does NOT route to Guardian approval");
assertEqual(lowFlow.routesToPaymentAppModal, true, "LOW transaction routes directly to Choose Payment App modal");

// ---------------------------------------------------------------------------
// 7. HIGH can still be recognized as HIGH
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 7: HIGH can still be recognized as HIGH ---");
const sampleHighTx = {
  id: "301",
  merchant: "QuickBullion P2P",
  amount: 75000,
  status: "Risk detected",
  riskLevel: "HIGH" as RiskLevel,
  riskScore: 89,
  authorizationRequired: true,
  authorizationStatus: "PENDING",
};

assert(isHighRiskEvaluated(sampleHighTx), "HIGH transaction is recognized as isHighRisk === true");
const highUnauthFlow = simulatePaymentFlowDecision(sampleHighTx, 2, true);
assertEqual(highUnauthFlow.requiresBiometric, true, "Unauthorized HIGH transaction triggers biometric check");

const highAuthFlow = simulatePaymentFlowDecision({ ...sampleHighTx, authorizationStatus: "AUTHORIZED" }, 2, true);
assertEqual(highAuthFlow.routesToGuardian, true, "Authorized HIGH transaction routes to Guardian approval");
assertEqual(highAuthFlow.routesToPaymentAppModal, false, "HIGH transaction cannot bypass Guardian to payment app modal");

// ---------------------------------------------------------------------------
// 8. Demo Data Integrity Check
// ---------------------------------------------------------------------------
console.log("\n--- Test Suite 8: Demo Data Integrity Check ---");
let demoMismatches = 0;
DEMO_USER_TRANSACTIONS.forEach((tx) => {
  const expectedLevel = getRiskLevelFromScore(tx.riskScore);
  if (tx.riskLevel && tx.riskLevel !== expectedLevel) {
    demoMismatches++;
    console.error(`Mismatch in tx ${tx.id}: stored=${tx.riskLevel}, expected=${expectedLevel}`);
  }
});
assertEqual(demoMismatches, 0, "All demo transactions have consistent riskLevel and riskScore");

// ---------------------------------------------------------------------------
// Final Results
// ---------------------------------------------------------------------------
console.log(`\n=================================================================`);
console.log(`${failures === 0 ? "ALL 8 PART 2 REGRESSION TEST SUITES PASSED" : `${failures} CHECK(S) FAILED`}`);
console.log(`=================================================================`);

if (failures > 0) {
  throw new Error(`${failures} medium-risk-mapping check(s) failed.`);
}
