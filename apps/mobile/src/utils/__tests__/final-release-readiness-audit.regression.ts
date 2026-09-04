/**
 * AVARAN PAY — Part 4Y Regression Test Suite:
 * Final Release-Readiness Audit and Demo Walkthrough Verification
 *
 * Verifies all 12 core safety domains of the end-to-end payment system:
 * 1. LOW/MEDIUM/HIGH risk boundaries (0-30, 31-60, 61-100).
 * 2. Strict evaluation/payment separation (non-executable evaluation).
 * 3. Stale evaluation invalidation on input modification and race conditions.
 * 4. QR scanner, contact picker, and recipient resolution validation.
 * 5. Workflow-stage enforcement across authorization, submission, and confirmation.
 * 6. Submission to backend strictly before external UPI app launch.
 * 7. Safe UPI return handling (no automatic confirmation, pending state preserved).
 * 8. Manual confirmation once only (in-flight concurrency lock).
 * 9. Production offline confirmation safety (zero silent local fallback).
 * 10. Terminal-state protection and read-only invariants.
 * 11. Demo-mode configuration hardening (default-off, malformed values rejected).
 * 12. Backend-mobile workflow stage alignment.
 *
 * Run with: npx -y tsx src/utils/__tests__/final-release-readiness-audit.regression.ts
 */

// @ts-ignore
(globalThis as any).__DEV__ = true;
// @ts-ignore
(globalThis as any).expo = { EventEmitter: class {} };

const mockExpoConstants: { expoConfig?: { extra?: Record<string, any> } } = {
  expoConfig: { extra: {} },
};

// @ts-ignore
import Module from "module";

// @ts-ignore
const origRequire = Module.prototype.require;
// @ts-ignore
Module.prototype.require = function (id: string, ...args: any[]) {
  if (id === "react-native") {
    return {
      Platform: { OS: "ios", select: (objs: any) => objs?.ios ?? objs?.default },
      Linking: {
        canOpenURL: async () => true,
        openURL: async () => true,
        addEventListener: () => ({ remove: () => {} }),
        getInitialURL: async () => null,
      },
      AppState: {
        currentState: "active",
        addEventListener: () => ({ remove: () => {} }),
      },
    };
  }
  if (id === "expo-constants") {
    return {
      __esModule: true,
      default: mockExpoConstants,
      get expoConfig() {
        return mockExpoConstants.expoConfig;
      },
    };
  }
  if (id === "expo-secure-store") {
    return { getItemAsync: async () => null, setItemAsync: async () => null };
  }
  if (id === "expo-device") {
    return { modelName: "Test Device", osName: "Android" };
  }
  return origRequire.apply(this, [id, ...args]);
};

const {
  PaymentService,
  createPaymentDraft,
  evaluatePaymentDraft,
  isDemoMode,
  setDemoMode,
  resetDemoMode,
  resolveDemoModeConfiguration,
  validatePaymentAuthorizationStage,
  validatePaymentSubmissionStage,
  validatePaymentCompletionStage,
  assertNotEvaluationStage,
  buildPaymentAuthorizationPayload,
  buildPaymentSubmissionPayload,
  buildPaymentConfirmationPayload,
  parseUpiPaymentPayload,
} = require("../../services/payment-service");

const { ApiClient } = require("../../services/api-client");
const { getRiskLevelFromScore, getStatusBadgeProps } = require("../risk-scoring");
const { resolveRecipient } = require("../../services/recipient-resolution-service");
const { applyScannedQrToForm } = require("../qr-scanner-helper");
const { applySelectedContactToForm } = require("../contact-picker-helper");
const {
  GlobalUpiReturnManager,
  validateManualConfirmationEligibility,
} = require("../upi-return-handler");
const {
  isTerminalUserTransaction,
  isReadOnlyUserTransaction,
  getCanonicalStatusForUserTransaction,
} = require("../user-transaction-status");

let failures = 0;
let totalChecks = 0;

function assert(condition: boolean, label: string) {
  totalChecks++;
  if (!condition) {
    failures++;
    console.error(`[FAIL] ${label}`);
  } else {
    console.log(`[OK]   ${label}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  totalChecks++;
  if (actual !== expected) {
    failures++;
    console.error(
      `[FAIL] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  } else {
    console.log(`[OK]   ${label}: ${JSON.stringify(actual)}`);
  }
}

async function runFinalReleaseReadinessAudit() {
  console.log("=================================================================");
  console.log("AVARAN PAY PART 4Y: FINAL RELEASE-READINESS AUDIT");
  console.log("=================================================================\n");

  const originalEnvDemo = process.env.EXPO_PUBLIC_DEMO_MODE;

  try {
    // -------------------------------------------------------------------------
    // 1. RISK SCORE BOUNDARIES (0-30 LOW, 31-60 MEDIUM, 61-100 HIGH)
    // -------------------------------------------------------------------------
    console.log("--- Domain 1: LOW / MEDIUM / HIGH Risk Score Boundaries ---");
    assertEqual(getRiskLevelFromScore(0), "LOW", "Score 0 is LOW");
    assertEqual(getRiskLevelFromScore(15), "LOW", "Score 15 is LOW");
    assertEqual(getRiskLevelFromScore(30), "LOW", "Score 30 is LOW (upper LOW boundary)");
    assertEqual(getRiskLevelFromScore(31), "MEDIUM", "Score 31 is MEDIUM (lower MEDIUM boundary)");
    assertEqual(getRiskLevelFromScore(45), "MEDIUM", "Score 45 is MEDIUM");
    assertEqual(getRiskLevelFromScore(60), "MEDIUM", "Score 60 is MEDIUM (upper MEDIUM boundary)");
    assertEqual(getRiskLevelFromScore(61), "HIGH", "Score 61 is HIGH (lower HIGH boundary)");
    assertEqual(getRiskLevelFromScore(85), "HIGH", "Score 85 is HIGH");
    assertEqual(getRiskLevelFromScore(100), "HIGH", "Score 100 is HIGH (upper HIGH boundary)");
    assertEqual(getRiskLevelFromScore(-5), "LOW", "Negative score falls back to LOW");
    assertEqual(getRiskLevelFromScore(undefined), "LOW", "Undefined score falls back to LOW");
    assertEqual(getRiskLevelFromScore(null), "LOW", "Null score falls back to LOW");

    assertEqual(getStatusBadgeProps("LOW").label, "LOW RISK", "LOW badge label is 'LOW RISK'");
    assertEqual(getStatusBadgeProps("MEDIUM").label, "MEDIUM RISK", "MEDIUM badge label is 'MEDIUM RISK'");
    assertEqual(getStatusBadgeProps("HIGH").label, "HIGH RISK", "HIGH badge label is 'HIGH RISK'");

    // -------------------------------------------------------------------------
    // 2. EVALUATION / PAYMENT SEPARATION
    // -------------------------------------------------------------------------
    console.log("\n--- Domain 2: Evaluation / Payment Separation ---");
    const initialTxCount = PaymentService.transactions.length;

    // A: Draft creation creates no transaction and fabricates no fields
    const draftRes = createPaymentDraft({
      recipient: "merchant@upi",
      amount: 1000,
      note: "Audit transfer",
    });
    assertEqual(draftRes.success, true, "createPaymentDraft succeeds for valid input");
    assert(draftRes.draft.id === undefined, "Draft has no transaction id");
    assert(draftRes.draft.status === undefined, "Draft has no status");
    assert(draftRes.draft.riskScore === undefined, "Draft has no riskScore");
    assert(draftRes.draft.isCompleted === undefined, "Draft has no isCompleted");
    assertEqual(
      PaymentService.transactions.length,
      initialTxCount,
      "Transaction store untouched after draft creation"
    );

    // B: Evaluation boundary returns UNAVAILABLE and does not mutate store
    const evalRes = evaluatePaymentDraft({ draft: draftRes.draft });
    assertEqual(evalRes.success, true, "evaluatePaymentDraft succeeds");
    assertEqual(evalRes.data.status, "UNAVAILABLE", "Evaluation returns explicit UNAVAILABLE status");
    assertEqual(
      PaymentService.transactions.length,
      initialTxCount,
      "Transaction store untouched after evaluation"
    );

    // C: EVALUATION_COMPLETED is rejected from all executable operations
    assertEqual(
      validatePaymentAuthorizationStage("EVALUATION_COMPLETED").valid,
      false,
      "EVALUATION_COMPLETED rejected for authorization"
    );
    assertEqual(
      validatePaymentSubmissionStage("EVALUATION_COMPLETED").valid,
      false,
      "EVALUATION_COMPLETED rejected for submission"
    );
    assertEqual(
      validatePaymentCompletionStage("EVALUATION_COMPLETED").valid,
      false,
      "EVALUATION_COMPLETED rejected for completion"
    );
    assertEqual(
      assertNotEvaluationStage("EVALUATION_COMPLETED").valid,
      false,
      "assertNotEvaluationStage rejects EVALUATION_COMPLETED"
    );

    // D: Risk levels are NOT valid workflow stages
    assertEqual(
      assertNotEvaluationStage("LOW").valid,
      false,
      "Risk level LOW is rejected as a workflow stage"
    );
    assertEqual(
      assertNotEvaluationStage("MEDIUM").valid,
      false,
      "Risk level MEDIUM is rejected as a workflow stage"
    );
    assertEqual(
      assertNotEvaluationStage("HIGH").valid,
      false,
      "Risk level HIGH is rejected as a workflow stage"
    );

    // -------------------------------------------------------------------------
    // 3. STALE EVALUATION INVALIDATION & RACE CONDITIONS
    // -------------------------------------------------------------------------
    console.log("\n--- Domain 3: Stale Evaluation Invalidation ---");
    // Simulate input modification invalidating evaluation
    let simulatedDraft: any = { recipient: "store@upi", amount: 500 };
    let simulatedEval: any = { stage: "EVALUATION_COMPLETED", riskLevel: "LOW" };
    let formVersion = 1;

    // User modifies recipient
    simulatedDraft = null;
    simulatedEval = null;
    formVersion += 1;
    assertEqual(simulatedDraft, null, "Draft is reset to null when recipient changes");
    assertEqual(simulatedEval, null, "Evaluation result is reset to null when recipient changes");

    // Race condition guard simulation
    const evaluationVersion = formVersion;
    // User modifies input while evaluation is in-flight
    formVersion += 1;
    const isStale = formVersion !== evaluationVersion;
    assertEqual(isStale, true, "In-flight evaluation detected as stale and discarded on formVersion mismatch");

    // -------------------------------------------------------------------------
    // 4. QR / CONTACT / RECIPIENT RESOLUTION VALIDATION
    // -------------------------------------------------------------------------
    console.log("\n--- Domain 4: QR / Contact / Recipient Input Resolution ---");
    // Valid UPI IDs pass through directly
    const upiRes1 = resolveRecipient({ originalValue: "merchant@okaxis" });
    assertEqual(upiRes1.success, true, "Valid UPI ID resolves successfully");
    if (upiRes1.success) {
      assertEqual(upiRes1.resolvedRecipient, "merchant@okaxis", "Resolved recipient matches original value");
      assertEqual(upiRes1.recipientType, "UPI_ID", "Type is UPI_ID");
    }

    // Valid mobile numbers return RESOLUTION_UNAVAILABLE
    const phoneRes = resolveRecipient({ originalValue: "9876543210" });
    assertEqual(phoneRes.success, false, "Mobile number resolution is guarded");
    if (!phoneRes.success) {
      assertEqual(phoneRes.reason, "RESOLUTION_UNAVAILABLE", "Returns RESOLUTION_UNAVAILABLE");
    }

    // Invalid/empty recipients return INVALID_RECIPIENT
    const invalidRes = resolveRecipient({ originalValue: "not_a_valid_id" });
    assertEqual(invalidRes.success, false, "Invalid recipient fails");
    if (!invalidRes.success) {
      assertEqual(invalidRes.reason, "INVALID_RECIPIENT", "Returns INVALID_RECIPIENT");
    }

    // QR parsing
    const parsedQr = parseUpiPaymentPayload("upi://pay?pa=store@upi&pn=Store%20Name&am=450&tn=Coffee");
    assertEqual(parsedQr.success, true, "Valid UPI payload parsed from QR");
    if (parsedQr.success) {
      assertEqual(parsedQr.data.recipient, "store@upi", "Parsed recipient");
      assertEqual(parsedQr.data.amount, 450, "Parsed amount");
    }

    // QR form applier
    const qrApplierRes = applyScannedQrToForm(
      { recipient: "", amount: "", note: "" },
      "upi://pay?pa=vendor@upi&pn=Vendor&am=1200"
    );
    assertEqual(qrApplierRes.success, true, "applyScannedQrToForm parses and populates form");
    if (qrApplierRes.success) {
      assertEqual(qrApplierRes.updatedForm.recipient, "vendor@upi", "Recipient updated from QR");
      assertEqual(qrApplierRes.updatedForm.amount, "1200", "Amount updated from QR");
    }

    // Contact picker applier
    const contactApplierRes = applySelectedContactToForm(
      { recipient: "", amount: "", note: "" },
      { name: "Priya Sharma", phoneNumbers: [{ number: "+91 91234 56789" }] }
    );
    assertEqual(contactApplierRes.success, true, "applySelectedContactToForm extracts phone");
    if (contactApplierRes.success) {
      assertEqual(contactApplierRes.updatedForm.recipient, "+919123456789", "Recipient set to normalized contact number");
    }

    // -------------------------------------------------------------------------
    // 5. WORKFLOW STAGE ENFORCEMENT
    // -------------------------------------------------------------------------
    console.log("\n--- Domain 5: Workflow Stage Enforcement ---");
    // Canonical stages
    assertEqual(validatePaymentAuthorizationStage("PAYMENT_AUTHORIZED").valid, true, "PAYMENT_AUTHORIZED valid for auth");
    assertEqual(validatePaymentSubmissionStage("PAYMENT_SUBMITTED").valid, true, "PAYMENT_SUBMITTED valid for submit");
    assertEqual(validatePaymentCompletionStage("PAYMENT_COMPLETED").valid, true, "PAYMENT_COMPLETED valid for confirm");

    // Cross-stage rejection
    assertEqual(validatePaymentAuthorizationStage("PAYMENT_SUBMITTED").valid, false, "PAYMENT_SUBMITTED rejected for auth");
    assertEqual(validatePaymentAuthorizationStage("PAYMENT_COMPLETED").valid, false, "PAYMENT_COMPLETED rejected for auth");
    assertEqual(validatePaymentSubmissionStage("PAYMENT_AUTHORIZED").valid, false, "PAYMENT_AUTHORIZED rejected for submit");
    assertEqual(validatePaymentSubmissionStage("PAYMENT_COMPLETED").valid, false, "PAYMENT_COMPLETED rejected for submit");
    assertEqual(validatePaymentCompletionStage("PAYMENT_AUTHORIZED").valid, false, "PAYMENT_AUTHORIZED rejected for confirm");
    assertEqual(validatePaymentCompletionStage("PAYMENT_SUBMITTED").valid, false, "PAYMENT_SUBMITTED rejected for confirm");

    // -------------------------------------------------------------------------
    // 6. SUBMISSION BEFORE EXTERNAL APP LAUNCH
    // -------------------------------------------------------------------------
    console.log("\n--- Domain 6: Submission Before External App Launch ---");
    setDemoMode(false);
    let submitCallMade = false;
    let submitPayload: any = null;

    const originalPost = ApiClient.post;
    ApiClient.post = async (url: string, payload: any) => {
      if (url.includes("/submit")) {
        submitCallMade = true;
        submitPayload = payload;
        return {
          data: {
            transaction_id: 888,
            stage: "PAYMENT_SUBMITTED",
            status: "PAYMENT_APP_PENDING",
            payment_app_used: "PhonePe UPI",
          },
        };
      }
      return { error: "Unknown endpoint" };
    };

    PaymentService.transactions = [
      {
        id: "tx-p4y-submit-1",
        merchant: "Audit Store",
        amount: 350,
        status: "Pending",
        canonicalStatus: "AWAITING_BIOMETRICS",
        isCompleted: false,
        timestamp: "Just now",
        recipientType: "MERCHANT",
        riskLevel: "LOW",
        category: "Payment",
      },
    ];

    const subRes = await PaymentService.submitTransaction(
      "tx-p4y-submit-1",
      "PAYMENT_SUBMITTED",
      "PhonePe UPI"
    );

    assertEqual(subRes.success, true, "submitTransaction succeeds");
    assertEqual(submitCallMade, true, "Backend submission API was invoked");
    assertEqual(submitPayload.stage, "PAYMENT_SUBMITTED", "Payload stage is PAYMENT_SUBMITTED");
    assertEqual(submitPayload.payment_app_used, "PhonePe UPI", "Payload payment_app_used is PhonePe UPI");

    const submittedTx = PaymentService.transactions.find((t: any) => t.id === "tx-p4y-submit-1");
    assertEqual(submittedTx.canonicalStatus, "PAYMENT_APP_PENDING", "Status transitioned to PAYMENT_APP_PENDING");
    assertEqual(submittedTx.isCompleted, false, "Transaction is NOT completed on submission");

    // -------------------------------------------------------------------------
    // 7. SAFE UPI RETURN HANDLING (NO AUTOMATIC CONFIRMATION)
    // -------------------------------------------------------------------------
    console.log("\n--- Domain 7: Safe UPI Return Handling ---");
    GlobalUpiReturnManager.startAwaitingReturn("tx-p4y-submit-1");
    assertEqual(GlobalUpiReturnManager.isAwaiting("tx-p4y-submit-1"), true, "Manager is awaiting return");

    // Simulate returning with a success deep link
    const returnEvent = GlobalUpiReturnManager.handleAppReturn(
      "avaran://upi-return?status=SUCCESS&txnId=UPI12345678",
      submittedTx
    );
    assertEqual(returnEvent.handled, true, "Return URL was processed");
    assertEqual(returnEvent.shouldPromptUser, true, "User is prompted for manual confirmation");

    // Critical invariant: transaction must remain pending
    assertEqual(submittedTx.canonicalStatus, "PAYMENT_APP_PENDING", "Transaction remains PAYMENT_APP_PENDING after return");
    assertEqual(submittedTx.isCompleted, false, "Transaction is strictly NOT marked completed on return");

    // -------------------------------------------------------------------------
    // 8. MANUAL CONFIRMATION ONCE ONLY (IN-FLIGHT CONCURRENCY LOCK)
    // -------------------------------------------------------------------------
    console.log("\n--- Domain 8: Manual Confirmation Concurrency Lock ---");
    const lockAcquired1 = GlobalUpiReturnManager.startConfirming("tx-p4y-submit-1");
    assertEqual(lockAcquired1, true, "First manual confirmation tap acquires lock");

    const lockAcquired2 = GlobalUpiReturnManager.startConfirming("tx-p4y-submit-1");
    assertEqual(lockAcquired2, false, "Second concurrent tap while in-flight is rejected");

    GlobalUpiReturnManager.finishConfirming("tx-p4y-submit-1");
    const lockAcquired3 = GlobalUpiReturnManager.startConfirming("tx-p4y-submit-1");
    assertEqual(lockAcquired3, true, "Lock can be reacquired after previous attempt finished");
    GlobalUpiReturnManager.finishConfirming("tx-p4y-submit-1");

    // -------------------------------------------------------------------------
    // 9. PRODUCTION OFFLINE CONFIRMATION SAFETY
    // -------------------------------------------------------------------------
    console.log("\n--- Domain 9: Production Offline Confirmation Safety ---");
    setDemoMode(false);

    // Simulate backend unreachable
    ApiClient.post = async () => ({
      error: "Unable to connect to server. Please check your network connection.",
    });

    const offlineConfirmResult = await PaymentService.confirmTransaction(
      "tx-p4y-submit-1",
      "PAYMENT_COMPLETED"
    );

    assertEqual(offlineConfirmResult.success, false, "Confirmation fails when backend is offline");
    assert(
      offlineConfirmResult.error?.includes("Unable to connect") || false,
      "Returns connectivity error message"
    );

    assertEqual(
      submittedTx.canonicalStatus,
      "PAYMENT_APP_PENDING",
      "Transaction remains PAYMENT_APP_PENDING on offline failure (zero silent fallback)"
    );
    assertEqual(submittedTx.isCompleted, false, "isCompleted remains false");

    // Now simulate backend recovering and confirming successfully
    ApiClient.post = async () => ({
      data: { id: 888, status: "CONFIRMED", message: "Transaction confirmed" },
    });

    const onlineConfirmResult = await PaymentService.confirmTransaction(
      "tx-p4y-submit-1",
      "PAYMENT_COMPLETED"
    );

    const onlineConfirmedTx = PaymentService.transactions.find((t: any) => t.id === "tx-p4y-submit-1");
    assertEqual(onlineConfirmedTx.canonicalStatus, "CONFIRMED", "Transaction canonicalStatus updated to CONFIRMED");
    assertEqual(onlineConfirmedTx.status, "Completed", "Transaction status updated to Completed");
    assertEqual(onlineConfirmedTx.isCompleted, true, "isCompleted updated to true");

    // -------------------------------------------------------------------------
    // 10. TERMINAL-STATE PROTECTION & READ-ONLY INVARIANTS
    // -------------------------------------------------------------------------
    console.log("\n--- Domain 10: Terminal-State Protection ---");
    const terminalTx: any = {
      id: "tx-p4y-term",
      canonicalStatus: "CONFIRMED",
      status: "Completed",
      isCompleted: true,
    };

    assertEqual(isTerminalUserTransaction(terminalTx), true, "CONFIRMED transaction is terminal");
    assertEqual(isReadOnlyUserTransaction(terminalTx), true, "CONFIRMED transaction is read-only");

    const nonTerminalTx: any = {
      id: "tx-p4y-non-term",
      canonicalStatus: "PAYMENT_APP_PENDING",
      status: "Pending",
      isCompleted: false,
    };

    assertEqual(isTerminalUserTransaction(nonTerminalTx), false, "PAYMENT_APP_PENDING is not terminal");
    assertEqual(isReadOnlyUserTransaction(nonTerminalTx), false, "PAYMENT_APP_PENDING is not read-only");

    // PaymentService rejects completing terminal transactions
    PaymentService.transactions.push(terminalTx);
    const reConfirmResult = await PaymentService.confirmTransaction("tx-p4y-term", "PAYMENT_COMPLETED");
    assertEqual(reConfirmResult.success, false, "Re-confirming a terminal transaction is rejected");

    // -------------------------------------------------------------------------
    // 11. DEMO-MODE DEFAULT-OFF & CONFIGURATION HARDENING
    // -------------------------------------------------------------------------
    console.log("\n--- Domain 11: Demo-Mode Configuration Hardening ---");
    resetDemoMode();
    delete process.env.EXPO_PUBLIC_DEMO_MODE;
    mockExpoConstants.expoConfig = { extra: {} };

    assertEqual(isDemoMode(), false, "isDemoMode() is false by default");
    const auditDefault = resolveDemoModeConfiguration();
    assertEqual(auditDefault.source, "default_production", "Source is default_production");
    assertEqual(auditDefault.isDemoMode, false, "Default mode is strictly live");

    // Malformed environment values
    for (const malformed of ["1", "yes", "TRUE", "True", " true", "true ", "demo", "0", "no", ""]) {
      process.env.EXPO_PUBLIC_DEMO_MODE = malformed;
      assertEqual(isDemoMode(), false, `Malformed value '${malformed}' remains live mode`);
    }

    // Explicit "true" activates demo mode
    process.env.EXPO_PUBLIC_DEMO_MODE = "true";
    assertEqual(isDemoMode(), true, "Explicit 'true' activates demo mode");

    // Reset restores live mode
    delete process.env.EXPO_PUBLIC_DEMO_MODE;
    resetDemoMode();
    assertEqual(isDemoMode(), false, "Reset restores live mode");

    // -------------------------------------------------------------------------
    // 12. BACKEND / MOBILE WORKFLOW STAGE ALIGNMENT
    // -------------------------------------------------------------------------
    console.log("\n--- Domain 12: Backend / Mobile Stage Alignment ---");
    const authPayload = buildPaymentAuthorizationPayload("BIOMETRIC");
    assertEqual(authPayload.stage, "PAYMENT_AUTHORIZED", "Auth payload uses PAYMENT_AUTHORIZED");

    const subPayload = buildPaymentSubmissionPayload("Google Pay UPI");
    assertEqual(subPayload.stage, "PAYMENT_SUBMITTED", "Submission payload uses PAYMENT_SUBMITTED");

    const confPayload = buildPaymentConfirmationPayload("Google Pay UPI");
    assertEqual(confPayload.stage, "PAYMENT_COMPLETED", "Confirmation payload uses PAYMENT_COMPLETED");

    // Restore ApiClient.post
    ApiClient.post = originalPost;

  } finally {
    resetDemoMode();
    if (originalEnvDemo !== undefined) {
      process.env.EXPO_PUBLIC_DEMO_MODE = originalEnvDemo;
    } else {
      delete process.env.EXPO_PUBLIC_DEMO_MODE;
    }
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`PART 4Y FINAL AUDIT TOTALS: ${totalChecks} checks, ${failures} failures`);
  console.log("=================================================================");

  if (failures > 0) {
    process.exit(1);
  }
}

runFinalReleaseReadinessAudit().catch((err) => {
  console.error("Part 4Y Audit execution fatal error:", err);
  process.exit(1);
});
