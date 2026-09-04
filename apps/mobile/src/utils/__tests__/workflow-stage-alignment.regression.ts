/**
 * AVARAN PAY — Part 4S Regression Test Suite:
 * Mobile API Request Workflow Stage Alignment
 *
 * Proves:
 * 1. Authorization payload contains PAYMENT_AUTHORIZED.
 * 2. Submission payload contains PAYMENT_SUBMITTED.
 * 3. Confirmation payload contains PAYMENT_COMPLETED.
 * 4. Risk evaluation payload/result uses EVALUATION_COMPLETED.
 * 5. EVALUATION_COMPLETED is strictly rejected for authorize, submit, or confirm endpoints.
 * 6. Existing request fields remain unchanged.
 * 7. No duplicate or automatic payment side effects are introduced.
 *
 * Run with: npx tsx src/utils/__tests__/workflow-stage-alignment.regression.ts
 */

// @ts-ignore
(globalThis as any).__DEV__ = true;
// @ts-ignore
(globalThis as any).expo = { EventEmitter: class {} };
process.env.EXPO_PUBLIC_DEMO_MODE = "true";

// Mock 'react-native' module in Node's require cache before loading services
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
      },
    };
  }
  if (id === "expo-constants") {
    return { default: { expoConfig: { extra: {} } } };
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
  buildPaymentAuthorizationPayload,
  buildPaymentSubmissionPayload,
  buildPaymentConfirmationPayload,
  buildRiskEvaluationPayload,
  PaymentWorkflowStageEnum,
  validatePaymentAuthorizationStage,
  validatePaymentSubmissionStage,
  validatePaymentCompletionStage,
  assertNotEvaluationStage,
} = require("../../services/payment-service");
const { RiskService } = require("../../services/risk-service");
const { PaymentAppLauncherService, KNOWN_PAYMENT_APPS } = require("../../services/payment-app-launcher-service");

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
    console.error(`[FAIL] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`[OK]   ${label}: ${JSON.stringify(actual)}`);
  }
}

async function runWorkflowStageAlignmentTests() {
  console.log("=================================================================");
  console.log("AVARAN PAY PART 4S: MOBILE API WORKFLOW STAGE ALIGNMENT REGRESSION");
  console.log("=================================================================\n");

  // Initial snapshot of PaymentService transaction store
  const initialTxResult = await PaymentService.getTransactions();
  const initialCount = initialTxResult.items.length;

  // ---------------------------------------------------------------------------
  // Test Suite 1: Authorization Payload Contains PAYMENT_AUTHORIZED
  // ---------------------------------------------------------------------------
  console.log("--- Test Suite 1: Authorization Payload Contains PAYMENT_AUTHORIZED ---");

  const defaultAuthPayload = buildPaymentAuthorizationPayload();
  assertEqual(
    defaultAuthPayload.stage,
    PaymentWorkflowStageEnum.PAYMENT_AUTHORIZED,
    "Default authorization payload stage is PAYMENT_AUTHORIZED"
  );
  assertEqual(
    defaultAuthPayload.method,
    "BIOMETRIC",
    "Default authorization payload method is BIOMETRIC"
  );

  const credAuthPayload = buildPaymentAuthorizationPayload("DEVICE_CREDENTIAL");
  assertEqual(
    credAuthPayload.stage,
    PaymentWorkflowStageEnum.PAYMENT_AUTHORIZED,
    "Credential authorization payload stage is PAYMENT_AUTHORIZED"
  );
  assertEqual(
    credAuthPayload.method,
    "DEVICE_CREDENTIAL",
    "Credential authorization payload method is DEVICE_CREDENTIAL"
  );

  const instanceAuthPayload = PaymentService.buildAuthorizationPayload("PIN");
  assertEqual(
    instanceAuthPayload.stage,
    PaymentWorkflowStageEnum.PAYMENT_AUTHORIZED,
    "PaymentService instance authorization payload stage is PAYMENT_AUTHORIZED"
  );
  assertEqual(
    instanceAuthPayload.method,
    "PIN",
    "Preserves custom authorization method"
  );

  // ---------------------------------------------------------------------------
  // Test Suite 2: Submission Payload Contains PAYMENT_SUBMITTED
  // ---------------------------------------------------------------------------
  console.log("\n--- Test Suite 2: Submission Payload Contains PAYMENT_SUBMITTED ---");

  const defaultSubPayload = buildPaymentSubmissionPayload();
  assertEqual(
    defaultSubPayload.stage,
    PaymentWorkflowStageEnum.PAYMENT_SUBMITTED,
    "Default submission payload stage is PAYMENT_SUBMITTED"
  );
  assertEqual(
    defaultSubPayload.payment_app_used,
    "Google Pay UPI",
    "Default submission payload includes payment_app_used"
  );

  const phonePeSubPayload = buildPaymentSubmissionPayload("PhonePe UPI");
  assertEqual(
    phonePeSubPayload.stage,
    PaymentWorkflowStageEnum.PAYMENT_SUBMITTED,
    "PhonePe submission payload stage is PAYMENT_SUBMITTED"
  );
  assertEqual(
    phonePeSubPayload.payment_app_used,
    "PhonePe UPI",
    "Submission payload preserves custom payment_app_used"
  );

  const instanceSubPayload = PaymentService.buildSubmissionPayload("Paytm UPI");
  assertEqual(
    instanceSubPayload.stage,
    PaymentWorkflowStageEnum.PAYMENT_SUBMITTED,
    "PaymentService instance submission payload stage is PAYMENT_SUBMITTED"
  );
  assertEqual(
    instanceSubPayload.payment_app_used,
    "Paytm UPI",
    "PaymentService instance preserves payment_app_used"
  );

  // ---------------------------------------------------------------------------
  // Test Suite 3: Confirmation Payload Contains PAYMENT_COMPLETED
  // ---------------------------------------------------------------------------
  console.log("\n--- Test Suite 3: Confirmation Payload Contains PAYMENT_COMPLETED ---");

  const defaultConfPayload = buildPaymentConfirmationPayload();
  assertEqual(
    defaultConfPayload.stage,
    PaymentWorkflowStageEnum.PAYMENT_COMPLETED,
    "Default confirmation payload stage is PAYMENT_COMPLETED"
  );
  assertEqual(
    defaultConfPayload.payment_app_used,
    "Google Pay UPI",
    "Default confirmation payload includes payment_app_used"
  );

  const customConfPayload = buildPaymentConfirmationPayload("BHIM UPI");
  assertEqual(
    customConfPayload.stage,
    PaymentWorkflowStageEnum.PAYMENT_COMPLETED,
    "Custom confirmation payload stage is PAYMENT_COMPLETED"
  );
  assertEqual(
    customConfPayload.payment_app_used,
    "BHIM UPI",
    "Confirmation payload preserves custom payment_app_used"
  );

  const instanceConfPayload = PaymentService.buildConfirmationPayload("Generic UPI");
  assertEqual(
    instanceConfPayload.stage,
    PaymentWorkflowStageEnum.PAYMENT_COMPLETED,
    "PaymentService instance confirmation payload stage is PAYMENT_COMPLETED"
  );
  assertEqual(
    instanceConfPayload.payment_app_used,
    "Generic UPI",
    "PaymentService instance preserves payment_app_used"
  );

  // ---------------------------------------------------------------------------
  // Test Suite 4: Risk Evaluation Payload and Result Uses EVALUATION_COMPLETED
  // ---------------------------------------------------------------------------
  console.log("\n--- Test Suite 4: Risk Evaluation Payload and Result Uses EVALUATION_COMPLETED ---");

  const evalPayload = buildRiskEvaluationPayload(101);
  assertEqual(
    evalPayload.stage,
    PaymentWorkflowStageEnum.EVALUATION_COMPLETED,
    "Risk evaluation payload stage is EVALUATION_COMPLETED"
  );
  assertEqual(
    evalPayload.transaction_id,
    101,
    "Risk evaluation payload preserves transaction_id"
  );

  const riskServicePayload = RiskService.buildEvaluationPayload(202);
  assertEqual(
    riskServicePayload.stage,
    PaymentWorkflowStageEnum.EVALUATION_COMPLETED,
    "RiskService.buildEvaluationPayload stage is EVALUATION_COMPLETED"
  );
  assertEqual(
    riskServicePayload.transaction_id,
    202,
    "RiskService preserves transaction_id"
  );

  // ---------------------------------------------------------------------------
  // Test Suite 5: EVALUATION_COMPLETED Is Never Used for Authorize, Submit, or Confirm
  // ---------------------------------------------------------------------------
  console.log("\n--- Test Suite 5: EVALUATION_COMPLETED Is Strictly Rejected from Execution ---");

  // 5.1 Stage validation helpers strictly reject EVALUATION_COMPLETED
  const authVal = validatePaymentAuthorizationStage("EVALUATION_COMPLETED");
  assert(authVal.valid === false, "validatePaymentAuthorizationStage rejects EVALUATION_COMPLETED");
  assert(authVal.error !== undefined, "validatePaymentAuthorizationStage returns descriptive error");

  const subVal = validatePaymentSubmissionStage("EVALUATION_COMPLETED");
  assert(subVal.valid === false, "validatePaymentSubmissionStage rejects EVALUATION_COMPLETED");
  assert(subVal.error !== undefined, "validatePaymentSubmissionStage returns descriptive error");

  const compVal = validatePaymentCompletionStage("EVALUATION_COMPLETED");
  assert(compVal.valid === false, "validatePaymentCompletionStage rejects EVALUATION_COMPLETED");
  assert(compVal.error !== undefined, "validatePaymentCompletionStage returns descriptive error");

  const assertNotEval = assertNotEvaluationStage("EVALUATION_COMPLETED");
  assert(assertNotEval.valid === false, "assertNotEvaluationStage rejects EVALUATION_COMPLETED");

  // 5.2 PaymentService operation entry points reject EVALUATION_COMPLETED
  const dummyTxId = "tx-part4s-test-1";

  const authAttempt = await PaymentService.authorizeTransaction(
    dummyTxId,
    "BIOMETRIC",
    "EVALUATION_COMPLETED"
  );
  assert(authAttempt.success === false, "PaymentService.authorizeTransaction rejects EVALUATION_COMPLETED");

  const subAttempt = await PaymentService.submitTransaction(
    dummyTxId,
    "EVALUATION_COMPLETED",
    "Google Pay UPI"
  );
  assert(subAttempt.success === false, "PaymentService.submitTransaction rejects EVALUATION_COMPLETED");

  const compAttempt = await PaymentService.completeTransaction(
    dummyTxId,
    "Google Pay UPI",
    undefined,
    "EVALUATION_COMPLETED"
  );
  assert(compAttempt.success === false, "PaymentService.completeTransaction rejects EVALUATION_COMPLETED");

  const confirmAttempt = await PaymentService.confirmTransaction(
    dummyTxId,
    "EVALUATION_COMPLETED"
  );
  assert(confirmAttempt.success === false, "PaymentService.confirmTransaction rejects EVALUATION_COMPLETED");

  // 5.3 PaymentAppLauncherService rejects EVALUATION_COMPLETED
  const dummyApp = {
    id: "gpay",
    name: "Google Pay",
    packageName: "com.google.android.apps.nbu.paisa.user",
    scheme: "tez://upi/pay",
    iconName: "logo-google" as const,
    isInstalled: true,
    isSupported: true,
  };
  const launchAttempt = await PaymentAppLauncherService.launchPaymentApp(
    dummyApp,
    { payeeUpiId: "test@upi", payeeName: "Test Merchant", amount: 500 },
    "EVALUATION_COMPLETED"
  );
  assert(launchAttempt.success === false, "PaymentAppLauncherService rejects EVALUATION_COMPLETED");
  assertEqual(launchAttempt.uri, "", "PaymentAppLauncherService returns empty URI on rejected stage");

  // ---------------------------------------------------------------------------
  // Test Suite 6: Existing Request Fields Remain Unchanged
  // ---------------------------------------------------------------------------
  console.log("\n--- Test Suite 6: Existing Request Fields Remain Unchanged ---");

  // Authorization request fields
  const authCustom = buildPaymentAuthorizationPayload("DEVICE_CREDENTIAL");
  assertEqual(Object.keys(authCustom).sort().join(","), "method,stage", "Authorization payload contains only method and stage");
  assertEqual(authCustom.method, "DEVICE_CREDENTIAL", "Method value unchanged");

  // Submission request fields
  const subCustom = buildPaymentSubmissionPayload("BHIM UPI");
  assertEqual(Object.keys(subCustom).sort().join(","), "payment_app_used,stage", "Submission payload contains only payment_app_used and stage");
  assertEqual(subCustom.payment_app_used, "BHIM UPI", "payment_app_used value unchanged");

  // Confirmation request fields
  const confCustom = buildPaymentConfirmationPayload("PhonePe UPI");
  assertEqual(Object.keys(confCustom).sort().join(","), "payment_app_used,stage", "Confirmation payload contains only payment_app_used and stage");
  assertEqual(confCustom.payment_app_used, "PhonePe UPI", "payment_app_used value unchanged");

  // Risk evaluation request fields
  const evalCustom = buildRiskEvaluationPayload(999);
  assertEqual(Object.keys(evalCustom).sort().join(","), "stage,transaction_id", "Risk evaluation payload contains only transaction_id and stage");
  assertEqual(evalCustom.transaction_id, 999, "transaction_id value unchanged");

  // ---------------------------------------------------------------------------
  // Test Suite 7: No Duplicate or Automatic Payment Side Effects
  // ---------------------------------------------------------------------------
  console.log("\n--- Test Suite 7: Zero Side Effects on Payload Building & Rejections ---");

  // Verify that building payloads has zero effect on the central transaction store
  const currentTxResult = await PaymentService.getTransactions();
  assertEqual(
    currentTxResult.items.length,
    initialCount,
    `Transaction store count strictly unchanged (initial: ${initialCount}, current: ${currentTxResult.items.length})`
  );

  // Verify that rejected operations with EVALUATION_COMPLETED did not add any transactions
  const hasDummy = currentTxResult.items.some((t: any) => t.id === dummyTxId);
  assert(!hasDummy, "Dummy transaction was never persisted or created during rejected calls");

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`TOTAL PART 4S CHECKS: ${totalChecks}`);
  console.log(`PASSED:               ${totalChecks - failures}`);
  console.log(`FAILURES:             ${failures}`);
  console.log("=================================================================");

  if (failures > 0) {
    process.exit(1);
  }
}

runWorkflowStageAlignmentTests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
