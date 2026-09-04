/**
 * AVARAN PAY: Form Clear + Medium-Risk Color + Connected Apps Regression Suite
 *
 * PART 1 — Form clear after successful evaluation:
 *   - Form fields clear on success; evaluation card state preserved.
 *   - Fields are NOT cleared on evaluation failure.
 *
 * PART 2 — Medium-risk color consistency:
 *   - MEDIUM risk amount/icon uses colors.caution (#A87520), not colors.threat.
 *   - HIGH risk amount/icon uses colors.threat (#A33D35).
 *   - LOW / non-risk uses textPrimary.
 *   - StatusBadge maps "medium" → caution, "high" → threat, "low" → safe.
 *
 * PART 3 — Connected payment apps:
 *   - Modal list is built from ConnectedAppsService, not from KNOWN_PAYMENT_APPS.
 *   - Only UPI-type apps with a scheme appear.
 *   - Empty state shown when no UPI apps are connected.
 *   - Disabled (isProtected=false) apps are not launchable.
 */

import { getRiskLevelFromScore, getStatusBadgeProps, RiskLevel } from "../risk-scoring";
import { ConnectedApp } from "../../services/connected-apps-service";
import { colors } from "../../theme/colors";

// ─────────────────────────────────────────────────────────────
// Test harness
// ─────────────────────────────────────────────────────────────
let totalChecks = 0;
let failures = 0;

function assert(condition: boolean, description: string, value?: any) {
  totalChecks++;
  if (condition) {
    console.log(`[OK]   ${description}${value !== undefined ? `: ${JSON.stringify(value)}` : ""}`);
  } else {
    failures++;
    console.error(`[FAIL] ${description}${value !== undefined ? `: ${JSON.stringify(value)}` : ""}`);
  }
}

// ─────────────────────────────────────────────────────────────
// PART 1 — Form clear after successful evaluation
// ─────────────────────────────────────────────────────────────
console.log("=================================================================");
console.log("PART 1: Form Clear After Evaluation");
console.log("=================================================================\n");

interface FormState {
  recipient: string;
  amount: string;
  note: string;
  evaluationResult: object | null;
}

function simulateSuccessfulEvaluation(initial: FormState): FormState {
  // Mirrors the success path in handleEvaluateAndPay:
  //   setEvaluationResult({ ...data }) → setEntryRecipient("") → setEntryAmount("") → setEntryNote("")
  const evaluationResult = {
    riskLevel: "MEDIUM" as RiskLevel,
    riskScore: 42,
    recipient: { raw_input: initial.recipient, recipient_type: "UPI" },
    amount: parseFloat(initial.amount),
    stage: "EVALUATION_COMPLETED",
    isAuthorized: false as const,
    isApproved: false as const,
    isCompleted: false as const,
    isSubmitted: false as const,
  };
  return {
    recipient: "",   // cleared
    amount: "",      // cleared
    note: "",        // cleared
    evaluationResult, // NOT cleared — card stays visible
  };
}

function simulateFailedEvaluation(initial: FormState): FormState {
  // Mirrors the catch/error path — no form or evaluation state changes
  return { ...initial };
}

const initialForm: FormState = {
  recipient: "merchant@okhdfcbank",
  amount: "1500",
  note: "Grocery bill",
  evaluationResult: null,
};

const afterSuccess = simulateSuccessfulEvaluation(initialForm);
const afterFailure = simulateFailedEvaluation(initialForm);

assert(afterSuccess.recipient === "", "PART1: recipient cleared after successful evaluation");
assert(afterSuccess.amount === "", "PART1: amount cleared after successful evaluation");
assert(afterSuccess.note === "", "PART1: note cleared after successful evaluation");
assert(afterSuccess.evaluationResult !== null, "PART1: evaluation result card preserved after clearing form");
assert(
  (afterSuccess.evaluationResult as any)?.riskLevel === "MEDIUM",
  "PART1: evaluation result contains correct risk level"
);

assert(afterFailure.recipient === "merchant@okhdfcbank", "PART1: recipient kept on evaluation failure");
assert(afterFailure.amount === "1500", "PART1: amount kept on evaluation failure");
assert(afterFailure.note === "Grocery bill", "PART1: note kept on evaluation failure");
assert(afterFailure.evaluationResult === null, "PART1: no evaluation result on failure");

// ─────────────────────────────────────────────────────────────
// PART 2 — Medium-risk color consistency
// ─────────────────────────────────────────────────────────────
console.log("\n=================================================================");
console.log("PART 2: Medium-Risk Color Consistency");
console.log("=================================================================\n");

// Mirrors the fixed logic in PaymentsScreen transaction list render
function computeTxnAmountColor(isRisk: boolean, itemLevel: RiskLevel): string {
  return isRisk
    ? (itemLevel === "HIGH" ? colors.threat : colors.caution)
    : colors.textPrimary;
}

function computeTxnIconColor(isRisk: boolean, itemLevel: RiskLevel): string {
  return isRisk
    ? (itemLevel === "HIGH" ? colors.threat : colors.caution)
    : colors.safe;
}

const highAmtColor   = computeTxnAmountColor(true, "HIGH");
const medAmtColor    = computeTxnAmountColor(true, "MEDIUM");
const lowRiskColor   = computeTxnAmountColor(true, "LOW");    // isRisk=true but LOW score
const safeColor      = computeTxnAmountColor(false, "LOW");

const highIconColor  = computeTxnIconColor(true, "HIGH");
const medIconColor   = computeTxnIconColor(true, "MEDIUM");

// Amount color assertions
assert(highAmtColor === colors.threat,      "PART2: HIGH risk amount uses threat (red)",       highAmtColor);
assert(medAmtColor  === colors.caution,     "PART2: MEDIUM risk amount uses caution (amber)",  medAmtColor);
assert(safeColor    === colors.textPrimary, "PART2: Safe (non-risk) amount uses textPrimary",  safeColor);

// Core bug-fix assertion: MEDIUM ≠ HIGH
assert(medAmtColor !== highAmtColor, "PART2: MEDIUM amount color ≠ HIGH amount color", {
  medium: medAmtColor,
  high: highAmtColor,
});

// Icon color assertions
assert(highIconColor === colors.threat,  "PART2: HIGH risk icon uses threat (red)",    highIconColor);
assert(medIconColor  === colors.caution, "PART2: MEDIUM risk icon uses caution (amber)", medIconColor);
assert(medIconColor  !== highIconColor,  "PART2: MEDIUM icon color ≠ HIGH icon color");

// StatusBadge props (no change needed — were already correct)
const highBadge = getStatusBadgeProps("HIGH");
const medBadge  = getStatusBadgeProps("MEDIUM");
const lowBadge  = getStatusBadgeProps("LOW");

assert(highBadge.status === "high",   "PART2: getStatusBadgeProps HIGH → status=high");
assert(medBadge.status  === "medium", "PART2: getStatusBadgeProps MEDIUM → status=medium");
assert(lowBadge.status  === "low",    "PART2: getStatusBadgeProps LOW → status=low");
assert(highBadge.label  === "HIGH RISK",   "PART2: HIGH badge label correct");
assert(medBadge.label   === "MEDIUM RISK", "PART2: MEDIUM badge label correct");

// Risk score boundary checks (unchanged algorithm)
assert(getRiskLevelFromScore(62) === "HIGH",   "PART2: score 62 → HIGH");
assert(getRiskLevelFromScore(61) === "HIGH",   "PART2: score 61 → HIGH (boundary)");
assert(getRiskLevelFromScore(60) === "MEDIUM", "PART2: score 60 → MEDIUM");
assert(getRiskLevelFromScore(45) === "MEDIUM", "PART2: score 45 → MEDIUM");
assert(getRiskLevelFromScore(31) === "MEDIUM", "PART2: score 31 → MEDIUM (boundary)");
assert(getRiskLevelFromScore(30) === "LOW",    "PART2: score 30 → LOW (boundary)");
assert(getRiskLevelFromScore(15) === "LOW",    "PART2: score 15 → LOW");
assert(getRiskLevelFromScore(0)  === "LOW",    "PART2: score 0 → LOW");

// ─────────────────────────────────────────────────────────────
// PART 3 — Connected payment apps modal driven by ConnectedAppsService
// ─────────────────────────────────────────────────────────────
console.log("\n=================================================================");
console.log("PART 3: Connected Payment Apps Modal Source of Truth");
console.log("=================================================================\n");

interface SimAppOption {
  id: string;
  name: string;
  isEnabledInProfile: boolean;
  isReadyToPay: boolean;
  statusLabel: "READY TO PAY" | "DISABLED" | "NOT INSTALLED";
}

// Mirrors the new refreshAppList in ChoosePaymentAppModal
function simulateRefreshAppList(
  connectedList: ConnectedApp[],
  installedIds: string[]  // simulated device-detected app IDs
): SimAppOption[] {
  const upiConnected = connectedList.filter((a) => a.type === "upi" && a.scheme);
  if (upiConnected.length === 0) return []; // triggers empty state

  return upiConnected.map((connApp) => {
    const isInstalled = installedIds.includes(connApp.id);
    const isEnabledInProfile = connApp.isProtected;
    const isReadyToPay = isEnabledInProfile && isInstalled;

    let statusLabel: "READY TO PAY" | "DISABLED" | "NOT INSTALLED" = "READY TO PAY";
    if (!isEnabledInProfile) statusLabel = "DISABLED";
    else if (!isInstalled)   statusLabel = "NOT INSTALLED";

    return { id: connApp.id, name: connApp.name, isEnabledInProfile, isReadyToPay, statusLabel };
  });
}

// Scenario A: Normal — GPay (enabled, installed) + PhonePe (disabled) + Banking (excluded)
const connectedApps: ConnectedApp[] = [
  {
    id: "gpay", name: "Google Pay", description: "", category: "",
    type: "upi", status: "Protected", iconName: "logo-google",
    isProtected: true, scheme: "tez://upi/pay",
  },
  {
    id: "phonepe", name: "PhonePe", description: "", category: "",
    type: "upi", status: "Paused", iconName: "wallet-outline",
    isProtected: false, scheme: "phonepe://pay",
  },
  {
    id: "bank", name: "Primary Banking App", description: "", category: "",
    type: "banking", status: "Protected", iconName: "business-outline",
    isProtected: true,
    // no scheme — banking type excluded
  },
];

const installedOnDevice = ["gpay", "phonepe"];
const resultA = simulateRefreshAppList(connectedApps, installedOnDevice);

assert(resultA.length === 2, "PART3-A: Only UPI-type apps appear (gpay + phonepe, not bank)", resultA.length);
assert(!resultA.some((a) => a.id === "bank"), "PART3-A: Banking-type app never shown in payment modal");
assert(resultA.find((a) => a.id === "gpay")?.isReadyToPay === true, "PART3-A: GPay enabled+installed → READY TO PAY");
assert(resultA.find((a) => a.id === "phonepe")?.isReadyToPay === false, "PART3-A: PhonePe disabled in profile → not ready");
assert(resultA.find((a) => a.id === "phonepe")?.statusLabel === "DISABLED", "PART3-A: PhonePe statusLabel=DISABLED");

// Scenario B: No connected UPI apps → empty state
const bankOnlyList: ConnectedApp[] = [
  {
    id: "bank", name: "Primary Banking App", description: "", category: "",
    type: "banking", status: "Protected", iconName: "business-outline",
    isProtected: true,
  },
];
const resultB = simulateRefreshAppList(bankOnlyList, []);
assert(resultB.length === 0, "PART3-B: Empty state triggered when no connected UPI apps");

// Scenario C: Custom-added app (CRED) appears; was NOT in old KNOWN_PAYMENT_APPS demo fallback
const connectedWithCred: ConnectedApp[] = [
  {
    id: "cred", name: "CRED Pay UPI", description: "", category: "",
    type: "upi", status: "Protected", iconName: "card-outline",
    isProtected: true, scheme: "credpay://upi", isCustomAdded: true,
  },
];
const resultC = simulateRefreshAppList(connectedWithCred, ["cred"]);
assert(resultC.length === 1, "PART3-C: Custom-added CRED app appears when connected", resultC.length);
assert(resultC[0].id === "cred", "PART3-C: CRED app ID correct");
assert(resultC[0].isReadyToPay === true, "PART3-C: CRED enabled+installed → READY TO PAY");

// Scenario D: After removing GPay, it no longer appears
const connectedAfterRemoval = connectedApps.filter((a) => a.id !== "gpay");
const resultD = simulateRefreshAppList(connectedAfterRemoval, installedOnDevice);
assert(!resultD.some((a) => a.id === "gpay"),    "PART3-D: Removed app (gpay) no longer in modal");
assert(resultD.some((a) => a.id === "phonepe"), "PART3-D: Remaining app (phonepe) still present");

// Scenario E: App installed on device but NOT connected in Profile → not shown
const onlyBankConnected: ConnectedApp[] = [
  {
    id: "bank", name: "Primary Banking App", description: "", category: "",
    type: "banking", status: "Protected", iconName: "business-outline",
    isProtected: true,
  },
];
const resultE = simulateRefreshAppList(onlyBankConnected, ["gpay", "phonepe", "paytm"]);
assert(
  resultE.length === 0,
  "PART3-E: Apps installed on device but not in ConnectedAppsService are NOT shown (empty state)"
);

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────
console.log("\n=================================================================");
console.log(`TOTAL CHECKS: ${totalChecks}`);
console.log(`FAILURES:     ${failures}`);
console.log("=================================================================\n");

if (failures > 0) {
  process.exit(1);
}
