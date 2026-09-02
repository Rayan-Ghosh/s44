import { DEMO_USER_TRANSACTIONS } from "../../data/demo-data";
import { getRiskLevelFromScore, validateAndLogRiskState } from "../risk-scoring";

// Mirrors payment-service.ts authoritative terminal / payable definitions
const isTransactionTerminal = (
  tx: { status?: string; isCompleted?: boolean } | null | undefined
): boolean => {
  if (!tx) return false;
  if (tx.isCompleted) return true;
  const s = tx.status;
  return s === "Completed" || s === "Safe" || s === "Blocked" || s === "Reported";
};

const isTransactionPayable = (
  tx: { status?: string; isCompleted?: boolean } | null | undefined
): boolean => {
  if (!tx) return false;
  if (isTransactionTerminal(tx)) return false;
  return tx.status === "Held" || tx.status === "Risk detected" || tx.status === "Approved by you";
};

console.log("=== High-Risk Mock Transactions Validation ===");
console.log(`Total transactions in DEMO_USER_TRANSACTIONS: ${DEMO_USER_TRANSACTIONS.length}`);

const targetIds = ["13", "14", "15", "16", "17", "18", "19"];
const addedHighRisk = DEMO_USER_TRANSACTIONS.filter((t) => targetIds.includes(t.id));

if (addedHighRisk.length !== 7) {
  throw new Error(`Expected 7 added high-risk transactions, found ${addedHighRisk.length}`);
}

const seenIds = new Set<string>();
const seenMerchants = new Set<string>();
const seenAmounts = new Set<number>();
const seenTimestamps = new Set<string>();

addedHighRisk.forEach((t) => {
  // Check unique attributes
  if (seenIds.has(t.id)) throw new Error(`Duplicate ID: ${t.id}`);
  seenIds.add(t.id);

  if (seenMerchants.has(t.merchant)) throw new Error(`Duplicate Merchant: ${t.merchant}`);
  seenMerchants.add(t.merchant);

  if (seenAmounts.has(t.amount)) throw new Error(`Duplicate Amount: ${t.amount}`);
  seenAmounts.add(t.amount);

  if (seenTimestamps.has(t.timestamp)) throw new Error(`Duplicate Timestamp: ${t.timestamp}`);
  seenTimestamps.add(t.timestamp);

  // Check risk score and derived level
  const score = t.riskScore ?? 0;
  if (score < 61) {
    throw new Error(`Transaction ${t.id} risk score ${score} is not in HIGH range (>= 61)`);
  }

  const derivedLevel = getRiskLevelFromScore(score);
  if (derivedLevel !== "HIGH" || t.riskLevel !== "HIGH") {
    throw new Error(`Transaction ${t.id} risk level mismatch: derived=${derivedLevel}, stored=${t.riskLevel}`);
  }

  // Check payable state
  if (!isTransactionPayable(t)) {
    throw new Error(`Transaction ${t.id} must be payable (isTransactionPayable = false)`);
  }
  if (isTransactionTerminal(t)) {
    throw new Error(`Transaction ${t.id} must not be terminal (isTransactionTerminal = true)`);
  }
  if (t.isCompleted === true) {
    throw new Error(`Transaction ${t.id} isCompleted must be false`);
  }
  if (t.authorizationRequired !== true) {
    throw new Error(`Transaction ${t.id} authorizationRequired must be true`);
  }

  validateAndLogRiskState({
    component: "MockTransactionValidation",
    transactionId: t.id,
    riskScore: score,
    riskLevel: t.riskLevel!,
  });

  console.log(
    `[VERIFIED] ID: ${t.id.padEnd(2)} | Amount: ₹${t.amount.toLocaleString("en-IN").padEnd(7)} | Score: ${score.toFixed(1)}/100 | Level: ${t.riskLevel} | Status: ${t.status.padEnd(13)} | Merchant: ${t.merchant}`
  );
});

console.log("\nAll 7 high-risk mock transactions passed all validation checks!");
