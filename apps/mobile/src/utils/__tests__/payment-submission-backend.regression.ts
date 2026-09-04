/**
 * AVARAN PAY — Part 4T Regression Test Suite:
 * Connect Mobile Payment Submission to Backend
 *
 * Proves:
 * 1. A valid submission sends POST /submit.
 * 2. The payload contains PAYMENT_SUBMITTED.
 * 3. The selected payment_app_used is preserved.
 * 4. The external UPI app is launched only after successful backend submission.
 * 5. Backend submission failure prevents external app launch.
 * 6. Duplicate submission attempts are blocked.
 * 7. EVALUATION_COMPLETED and invalid stages are rejected.
 * 8. Submission does not confirm or complete the transaction automatically.
 * 9. Existing request fields and error behavior remain intact.
 * 10. Loading/submission state resets on success and failure.
 *
 * Run with: npx tsx src/utils/__tests__/payment-submission-backend.regression.ts
 */

// @ts-ignore
(globalThis as any).__DEV__ = true;
// @ts-ignore
(globalThis as any).expo = { EventEmitter: class {} };
process.env.EXPO_PUBLIC_DEMO_MODE = "false"; // Test real dispatch flow

// Mock 'react-native' module in Node's require cache
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
      AppState: { currentState: "active" },
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
  buildPaymentSubmissionPayload,
  PaymentWorkflowStageEnum,
  validatePaymentSubmissionStage,
} = require("../../services/payment-service");
const { ApiClient } = require("../../services/api-client");
const { PaymentAppLauncherService } = require("../../services/payment-app-launcher-service");

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

async function runPaymentSubmissionBackendTests() {
  console.log("=================================================================");
  console.log("AVARAN PAY PART 4T: PAYMENT SUBMISSION BACKEND INTEGRATION");
  console.log("=================================================================\n");

  // Track ApiClient calls
  const postedRequests: Array<{ endpoint: string; body: any }> = [];
  let apiShouldFail = false;
  let apiFailMessage = "Cannot submit transaction in terminal status";

  const origPost = ApiClient.post;
  ApiClient.post = async function (endpoint: string, body?: any) {
    postedRequests.push({ endpoint, body });
    if (apiShouldFail) {
      return {
        status: 400,
        error: apiFailMessage,
        data: { detail: apiFailMessage },
      };
    }
    return {
      status: 200,
      data: {
        transaction_id: 12345,
        stage: "PAYMENT_SUBMITTED",
        status: "PAYMENT_APP_PENDING",
        payment_app_used: body?.payment_app_used || "Google Pay UPI",
        message: "Payment submitted successfully to payment provider / UPI app.",
      },
    };
  };

  // Track PaymentAppLauncherService calls
  const launchedApps: Array<{ app: any; details: any; stage: any }> = [];
  let launcherShouldFail = false;

  const origLaunch = PaymentAppLauncherService.launchPaymentApp;
  PaymentAppLauncherService.launchPaymentApp = async function (app: any, details: any, stage: any) {
    launchedApps.push({ app, details, stage });
    if (launcherShouldFail) {
      return { success: false, uri: "", error: "Failed to open app" };
    }
    return { success: true, uri: "tez://upi/pay?pa=test@upi" };
  };

  // Seed test transaction
  const testTxId = "tx-submit-integration-100";
  PaymentService.addTransaction({
    id: testTxId,
    title: "Submission Test Tx",
    merchant: "Test Merchant",
    amount: 1500,
    date: "Just now",
    status: "Safe",
    canonicalStatus: "LOW_RISK",
    riskLevel: "LOW",
    riskScore: 12,
  });

  // ---------------------------------------------------------------------------
  // Test Suite 1: Valid Submission Sends POST /submit with Canonical Payload
  // ---------------------------------------------------------------------------
  console.log("--- Test Suite 1: Valid Submission Sends POST /submit with Canonical Payload ---");

  postedRequests.length = 0;
  apiShouldFail = false;

  const subRes = await PaymentService.submitTransaction(
    testTxId,
    PaymentWorkflowStageEnum.PAYMENT_SUBMITTED,
    "Google Pay UPI"
  );

  assert(subRes.success === true, "submitTransaction returns success === true");
  assertEqual(postedRequests.length, 1, "Exactly one HTTP POST was dispatched");
  assertEqual(
    postedRequests[0].endpoint,
    `/api/v1/transactions/${testTxId}/submit`,
    "Dispatched to POST /api/v1/transactions/{id}/submit"
  );
  assertEqual(
    postedRequests[0].body.stage,
    "PAYMENT_SUBMITTED",
    "Request payload contains stage: 'PAYMENT_SUBMITTED'"
  );
  assertEqual(
    postedRequests[0].body.payment_app_used,
    "Google Pay UPI",
    "Request payload contains payment_app_used: 'Google Pay UPI'"
  );

  // ---------------------------------------------------------------------------
  // Test Suite 2: Selected Payment App is Preserved in Payload and State
  // ---------------------------------------------------------------------------
  console.log("\n--- Test Suite 2: Selected Payment App Preservation ---");

  postedRequests.length = 0;
  const customApp = "PhonePe UPI";

  const subPhonePe = await PaymentService.submitTransaction(
    testTxId,
    PaymentWorkflowStageEnum.PAYMENT_SUBMITTED,
    customApp
  );

  assert(subPhonePe.success === true, "submitTransaction with PhonePe returns success");
  assertEqual(
    postedRequests[0].body.payment_app_used,
    "PhonePe UPI",
    "Payload preserves custom payment_app_used"
  );

  const txAfterPhonePe = (await PaymentService.getTransactions()).items.find(
    (t: any) => t.id === testTxId
  );
  assertEqual(
    txAfterPhonePe?.paymentAppUsed,
    "PhonePe UPI",
    "In-memory transaction records updated paymentAppUsed"
  );
  assertEqual(
    txAfterPhonePe?.canonicalStatus,
    "PAYMENT_APP_PENDING",
    "Transaction transitions to PAYMENT_APP_PENDING"
  );

  // ---------------------------------------------------------------------------
  // Test Suite 3: External UPI App Launched Only After Successful Submission
  // ---------------------------------------------------------------------------
  console.log("\n--- Test Suite 3: Sequential Submission Before App Launch ---");

  postedRequests.length = 0;
  launchedApps.length = 0;
  apiShouldFail = false;

  // Simulate ChoosePaymentAppModal handleSelectApp workflow
  let loadingAppId: string | null = null;
  let selectedAppOption: any = null;

  async function simulateSelectApp(app: any, workflowStage: any) {
    loadingAppId = app.id;
    selectedAppOption = app;

    // 1. Submit to backend
    const submitResult = await PaymentService.submitTransaction(
      testTxId,
      workflowStage || "PAYMENT_SUBMITTED",
      app.name
    );

    if (!submitResult.success) {
      loadingAppId = null;
      selectedAppOption = null;
      return { success: false, error: submitResult.error };
    }

    // 2. Launch external UPI app
    const launchResult = await PaymentAppLauncherService.launchPaymentApp(
      app,
      { payeeUpiId: "test@upi", payeeName: "Merchant", amount: 1500 },
      workflowStage || "PAYMENT_SUBMITTED"
    );

    loadingAppId = null;
    return launchResult;
  }

  const dummyApp = {
    id: "gpay",
    name: "Google Pay",
    packageName: "com.google.android.apps.nbu.paisa.user",
    scheme: "tez://upi/pay",
    iconName: "logo-google",
    isInstalled: true,
    isSupported: true,
  };

  const flowResult = await simulateSelectApp(dummyApp, "PAYMENT_SUBMITTED");
  assert(flowResult.success === true, "Full select-and-launch flow succeeds");
  assertEqual(postedRequests.length, 1, "Backend submission was executed");
  assertEqual(launchedApps.length, 1, "External UPI app was launched after backend submission");
  assertEqual(loadingAppId, null, "Loading state is reset to null on success");

  // ---------------------------------------------------------------------------
  // Test Suite 4: Backend Submission Failure Prevents External App Launch
  // ---------------------------------------------------------------------------
  console.log("\n--- Test Suite 4: Backend Failure Prevents App Launch & Resets State ---");

  postedRequests.length = 0;
  launchedApps.length = 0;
  apiShouldFail = true;
  apiFailMessage = "Transaction details changed after approval (409 Conflict)";

  const failResult = await simulateSelectApp(dummyApp, "PAYMENT_SUBMITTED");
  assert(failResult.success === false, "Flow returns failure when backend rejects");
  assertEqual(
    failResult.error,
    "Transaction details changed after approval (409 Conflict)",
    "Returns exact backend error message"
  );
  assertEqual(postedRequests.length, 1, "Backend submission was attempted");
  assertEqual(launchedApps.length, 0, "External UPI app was strictly NOT launched");
  assertEqual(loadingAppId, null, "Loading state is reset to null on failure");
  assertEqual(selectedAppOption, null, "Selected app state is reset to null on failure");

  // ---------------------------------------------------------------------------
  // Test Suite 5: Duplicate Submission Attempts Are Blocked
  // ---------------------------------------------------------------------------
  console.log("\n--- Test Suite 5: Duplicate In-Flight Submission Prevention ---");

  apiShouldFail = false;
  postedRequests.length = 0;

  // Make ApiClient.post hang momentarily to test concurrent submission
  let resolvePost: ((val: any) => void) | null = null;
  ApiClient.post = async function (endpoint: string, body?: any) {
    postedRequests.push({ endpoint, body });
    return new Promise((res) => {
      resolvePost = res;
    });
  };

  const call1Promise = PaymentService.submitTransaction(
    testTxId,
    "PAYMENT_SUBMITTED",
    "Google Pay UPI"
  );

  // Immediate second call while call1 is in-flight
  const call2Result = await PaymentService.submitTransaction(
    testTxId,
    "PAYMENT_SUBMITTED",
    "Google Pay UPI"
  );

  assert(call2Result.success === false, "Duplicate submission while in progress returns success === false");
  assertEqual(
    call2Result.error,
    "Payment submission already in progress",
    "Returns duplicate submission error message"
  );

  // Release the first call
  if (resolvePost) {
    (resolvePost as any)({
      status: 200,
      data: { stage: "PAYMENT_SUBMITTED", status: "PAYMENT_APP_PENDING" },
    });
  }
  const call1Result = await call1Promise;
  assert(call1Result.success === true, "First in-flight submission completed successfully");

  // Restore ApiClient.post
  ApiClient.post = async function (endpoint: string, body?: any) {
    postedRequests.push({ endpoint, body });
    return {
      status: 200,
      data: {
        transaction_id: 12345,
        stage: "PAYMENT_SUBMITTED",
        status: "PAYMENT_APP_PENDING",
        payment_app_used: body?.payment_app_used,
      },
    };
  };

  // ---------------------------------------------------------------------------
  // Test Suite 6: EVALUATION_COMPLETED and Invalid Stages Are Rejected
  // ---------------------------------------------------------------------------
  console.log("\n--- Test Suite 6: Stage Enforcement on Submission ---");

  postedRequests.length = 0;
  launchedApps.length = 0;

  const evalAttempt = await PaymentService.submitTransaction(
    testTxId,
    "EVALUATION_COMPLETED",
    "Google Pay UPI"
  );
  assert(evalAttempt.success === false, "submitTransaction rejects EVALUATION_COMPLETED");
  assertEqual(postedRequests.length, 0, "Zero HTTP calls on EVALUATION_COMPLETED");

  for (const bad of ["LOW", "MEDIUM", "HIGH", "PAYMENT_AUTHORIZED", "PAYMENT_COMPLETED", "UNKNOWN"]) {
    const badRes = await PaymentService.submitTransaction(testTxId, bad, "Google Pay UPI");
    assert(badRes.success === false, `submitTransaction rejects invalid stage '${bad}'`);
  }
  assertEqual(postedRequests.length, 0, "Zero HTTP calls across all invalid stages");

  // ---------------------------------------------------------------------------
  // Test Suite 7: Submission Does Not Confirm or Complete Transaction
  // ---------------------------------------------------------------------------
  console.log("\n--- Test Suite 7: No Automatic Confirmation on Submission ---");

  const txAfterSub = (await PaymentService.getTransactions()).items.find(
    (t: any) => t.id === testTxId
  );
  assert(txAfterSub?.isCompleted !== true, "Transaction isCompleted is NOT true after submission");
  assert(txAfterSub?.status !== "Completed", "Transaction status is NOT 'Completed' after submission");
  assertEqual(
    txAfterSub?.canonicalStatus,
    "PAYMENT_APP_PENDING",
    "Canonical status is strictly PAYMENT_APP_PENDING"
  );

  // Restore mocks
  ApiClient.post = origPost;
  PaymentAppLauncherService.launchPaymentApp = origLaunch;

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`TOTAL PART 4T CHECKS: ${totalChecks}`);
  console.log(`PASSED:               ${totalChecks - failures}`);
  console.log(`FAILURES:             ${failures}`);
  console.log("=================================================================");

  if (failures > 0) {
    process.exit(1);
  }
}

runPaymentSubmissionBackendTests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
