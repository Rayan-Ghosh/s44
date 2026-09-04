/**
 * AVARAN PAY — Part 4W Regression Test Suite:
 * Production Confirmation and Offline Fallback Safety
 *
 * Proves:
 * 1. Explicit demo mode allows mocked confirmation.
 * 2. Production mode requires backend confirmation.
 * 3. Production network failure does not mark CONFIRMED (no silent fallback on "Unable to connect" or network errors).
 * 4. Production failure leaves the transaction pending.
 * 5. No silent fallback from production to local mock storage.
 * 6. Successful backend confirmation changes status only after backend success.
 * 7. Duplicate confirmation attempts are blocked.
 * 8. Terminal transactions remain unchanged.
 * 9. PAYMENT_COMPLETED is still required.
 * 10. Manual confirmation remains available after a safe UPI return.
 *
 * Run with: npx -y tsx src/utils/__tests__/production-confirmation-offline-safety.regression.ts
 */

// @ts-ignore
(globalThis as any).__DEV__ = true;
// @ts-ignore
(globalThis as any).expo = { EventEmitter: class {} };
process.env.EXPO_PUBLIC_DEMO_MODE = "false";

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
  isDemoMode,
  setDemoMode,
} = require("../../services/payment-service");
const { ApiClient } = require("../../services/api-client");
const {
  UpiReturnManager,
  validateManualConfirmationEligibility,
} = require("../upi-return-handler");

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

async function runProductionConfirmationOfflineSafetyRegressionSuite() {
  console.log("=================================================================");
  console.log("AVARAN PAY PART 4W: PRODUCTION CONFIRMATION & OFFLINE SAFETY");
  console.log("=================================================================\n");

  const postedRequests: Array<{ endpoint: string; body: any }> = [];
  let apiMode: "SUCCESS" | "NETWORK_ERROR_STRING" | "NETWORK_EXCEPTION" | "HTTP_500" = "SUCCESS";

  const origPost = ApiClient.post;
  ApiClient.post = async function (endpoint: string, body?: any) {
    postedRequests.push({ endpoint, body });
    if (endpoint.includes("/confirm")) {
      if (apiMode === "NETWORK_ERROR_STRING") {
        return {
          success: false,
          error: "Unable to connect to AVARAN secure payment gateway",
          status: 0,
        };
      }
      if (apiMode === "NETWORK_EXCEPTION") {
        throw new Error("Network request failed (ERR_CONNECTION_REFUSED)");
      }
      if (apiMode === "HTTP_500") {
        return {
          success: false,
          error: "Internal Server Error during bank reconciliation (500)",
          status: 500,
        };
      }
      return {
        success: true,
        data: {
          id: 7001,
          status: "CONFIRMED",
          is_completed: true,
        },
      };
    }
    return { success: true, data: {} };
  };

  // --------------------------------------------------------------------------
  // TEST 1: How demo/offline mode is detected
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 1: Demo / production mode detection mechanics ---");
  setDemoMode(null);
  process.env.EXPO_PUBLIC_DEMO_MODE = "false";
  assertEqual(isDemoMode(), false, "isDemoMode() returns false when EXPO_PUBLIC_DEMO_MODE=false");

  process.env.EXPO_PUBLIC_DEMO_MODE = "true";
  assertEqual(isDemoMode(), true, "isDemoMode() returns true when EXPO_PUBLIC_DEMO_MODE=true");

  setDemoMode(false);
  assertEqual(isDemoMode(), false, "setDemoMode(false) forces production mode at runtime");

  setDemoMode(true);
  assertEqual(isDemoMode(), true, "setDemoMode(true) forces demo mode at runtime");

  // Reset to explicit production mode for tests
  setDemoMode(false);
  process.env.EXPO_PUBLIC_DEMO_MODE = "false";
  assertEqual(isDemoMode(), false, "Production mode is active");

  // --------------------------------------------------------------------------
  // TEST 2: Explicit demo mode allows mocked confirmation without network
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 2: Explicit demo mode allows mocked confirmation without network ---");
  setDemoMode(true);
  postedRequests.length = 0;

  const txDemo = {
    id: "TXN-4W-DEMO",
    amount: 500,
    merchant: "Demo Coffee",
    status: "Pending",
    canonicalStatus: "PAYMENT_APP_PENDING",
    isCompleted: false,
    timestamp: "2026-09-04 12:00:00",
  };
  PaymentService.addTransaction(txDemo);

  const demoRes = await PaymentService.completeTransaction(
    "TXN-4W-DEMO",
    "Google Pay UPI",
    undefined,
    "PAYMENT_COMPLETED"
  );
  assertEqual(demoRes.success, true, "Explicit demo mode completes successfully");
  assertEqual(postedRequests.length, 0, "No network calls in explicit demo mode");

  const txDemoAfter = (await PaymentService.getTransactions()).items.find((t: any) => t.id === "TXN-4W-DEMO");
  assertEqual(txDemoAfter?.status, "Completed", "Demo transaction marked Completed");
  assertEqual(txDemoAfter?.canonicalStatus, "CONFIRMED", "Demo transaction canonicalStatus marked CONFIRMED");
  assertEqual(txDemoAfter?.isCompleted, true, "Demo transaction isCompleted is true");

  // --------------------------------------------------------------------------
  // TEST 3: Production mode requires backend confirmation
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 3: Production mode requires backend confirmation ---");
  setDemoMode(false); // Strictly production mode
  postedRequests.length = 0;
  apiMode = "SUCCESS";

  const txProdSuccess = {
    id: "TXN-4W-PROD-SUCCESS",
    amount: 1999,
    merchant: "Tata Croma",
    status: "Pending",
    canonicalStatus: "PAYMENT_APP_PENDING",
    isCompleted: false,
    timestamp: "2026-09-04 12:10:00",
  };
  PaymentService.addTransaction(txProdSuccess);

  const prodSuccessRes = await PaymentService.completeTransaction(
    "TXN-4W-PROD-SUCCESS",
    "Google Pay UPI",
    undefined,
    "PAYMENT_COMPLETED"
  );
  assertEqual(prodSuccessRes.success, true, "Production confirmation succeeds when backend confirms");
  assertEqual(postedRequests.length, 1, "Dispatched exactly one HTTP request in production");
  assertEqual(postedRequests[0].endpoint, "/api/v1/transactions/TXN-4W-PROD-SUCCESS/confirm", "Target endpoint is correct");
  assertEqual(postedRequests[0].body.stage, "PAYMENT_COMPLETED", "Payload stage is PAYMENT_COMPLETED");

  const txProdAfter = (await PaymentService.getTransactions()).items.find((t: any) => t.id === "TXN-4W-PROD-SUCCESS");
  assertEqual(txProdAfter?.status, "Completed", "Transaction status updated to Completed after backend success");
  assertEqual(txProdAfter?.canonicalStatus, "CONFIRMED", "Canonical status updated to CONFIRMED");
  assertEqual(txProdAfter?.isCompleted, true, "isCompleted is true");

  // --------------------------------------------------------------------------
  // TEST 4 & 5: Production network failure (Unable to connect) NEVER marks CONFIRMED
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 4 & 5: Production network failure never falls back to local confirmation ---");
  postedRequests.length = 0;
  apiMode = "NETWORK_ERROR_STRING"; // Simulates "Unable to connect" failure

  const txOfflineFail = {
    id: "TXN-4W-OFFLINE-FAIL",
    amount: 750,
    merchant: "Apollo Pharmacy",
    status: "Pending",
    canonicalStatus: "PAYMENT_APP_PENDING",
    isCompleted: false,
    timestamp: "2026-09-04 12:20:00",
  };
  PaymentService.addTransaction(txOfflineFail);

  const offlineRes = await PaymentService.completeTransaction(
    "TXN-4W-OFFLINE-FAIL",
    "PhonePe UPI",
    undefined,
    "PAYMENT_COMPLETED"
  );
  assertEqual(offlineRes.success, false, "Offline/network failure in production returns success === false");
  assert(
    offlineRes.error?.includes("Unable to connect") || offlineRes.error?.includes("Backend confirmation required"),
    "Returns descriptive connectivity error"
  );

  // CRITICAL INVARIANT: The transaction must NOT silently fall back to local mock storage
  const txOfflineAfter = (await PaymentService.getTransactions()).items.find((t: any) => t.id === "TXN-4W-OFFLINE-FAIL");
  assertEqual(txOfflineAfter?.status, "Pending", "Transaction status remains Pending");
  assertEqual(txOfflineAfter?.canonicalStatus, "PAYMENT_APP_PENDING", "Canonical status remains PAYMENT_APP_PENDING");
  assertEqual(txOfflineAfter?.isCompleted, false, "isCompleted remains false");

  // --------------------------------------------------------------------------
  // TEST 6: Thrown network exception (ERR_CONNECTION_REFUSED) also leaves pending
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 6: Thrown network exception leaves transaction pending ---");
  postedRequests.length = 0;
  apiMode = "NETWORK_EXCEPTION";

  const txException = {
    id: "TXN-4W-EXCEPTION",
    amount: 1100,
    merchant: "Zomato",
    status: "Pending",
    canonicalStatus: "PAYMENT_APP_PENDING",
    isCompleted: false,
    timestamp: "2026-09-04 12:25:00",
  };
  PaymentService.addTransaction(txException);

  const exceptionRes = await PaymentService.completeTransaction(
    "TXN-4W-EXCEPTION",
    "Google Pay UPI",
    undefined,
    "PAYMENT_COMPLETED"
  );
  assertEqual(exceptionRes.success, false, "Thrown network exception returns success === false");
  assert(exceptionRes.error?.includes("Network request failed"), "Returns network failure message");

  const txExceptionAfter = (await PaymentService.getTransactions()).items.find((t: any) => t.id === "TXN-4W-EXCEPTION");
  assertEqual(txExceptionAfter?.status, "Pending", "Transaction remains Pending");
  assertEqual(txExceptionAfter?.canonicalStatus, "PAYMENT_APP_PENDING", "Canonical status remains PAYMENT_APP_PENDING");
  assertEqual(txExceptionAfter?.isCompleted, false, "isCompleted remains false");

  // --------------------------------------------------------------------------
  // TEST 7: Backend HTTP 500 error leaves transaction pending
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 7: Backend 500 server error leaves transaction pending ---");
  postedRequests.length = 0;
  apiMode = "HTTP_500";

  const txHttp500 = {
    id: "TXN-4W-HTTP500",
    amount: 3200,
    merchant: "Shoppers Stop",
    status: "Pending",
    canonicalStatus: "PAYMENT_APP_PENDING",
    isCompleted: false,
    timestamp: "2026-09-04 12:30:00",
  };
  PaymentService.addTransaction(txHttp500);

  const http500Res = await PaymentService.completeTransaction(
    "TXN-4W-HTTP500",
    "Google Pay UPI",
    undefined,
    "PAYMENT_COMPLETED"
  );
  assertEqual(http500Res.success, false, "HTTP 500 returns success === false");

  const txHttp500After = (await PaymentService.getTransactions()).items.find((t: any) => t.id === "TXN-4W-HTTP500");
  assertEqual(txHttp500After?.status, "Pending", "Transaction remains Pending on 500");
  assertEqual(txHttp500After?.canonicalStatus, "PAYMENT_APP_PENDING", "Canonical status remains PAYMENT_APP_PENDING");
  assertEqual(txHttp500After?.isCompleted, false, "isCompleted remains false");

  // --------------------------------------------------------------------------
  // TEST 8: Retry is possible after network recovery
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 8: Successful retry after network recovery ---");
  postedRequests.length = 0;
  apiMode = "SUCCESS"; // Network recovered

  const retryRes = await PaymentService.completeTransaction(
    "TXN-4W-OFFLINE-FAIL",
    "PhonePe UPI",
    undefined,
    "PAYMENT_COMPLETED"
  );
  assertEqual(retryRes.success, true, "Retry succeeds after network recovery");

  const txRecoveredAfter = (await PaymentService.getTransactions()).items.find((t: any) => t.id === "TXN-4W-OFFLINE-FAIL");
  assertEqual(txRecoveredAfter?.status, "Completed", "Status updated to Completed after successful retry");
  assertEqual(txRecoveredAfter?.canonicalStatus, "CONFIRMED", "Canonical status updated to CONFIRMED");
  assertEqual(txRecoveredAfter?.isCompleted, true, "isCompleted is true");

  // --------------------------------------------------------------------------
  // TEST 9: Duplicate confirmation attempts are blocked (concurrency lock)
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 9: Duplicate in-flight confirmation attempts blocked ---");
  const txLockTest = {
    id: "TXN-4W-LOCK",
    amount: 600,
    merchant: "BookMyShow",
    status: "Pending",
    canonicalStatus: "PAYMENT_APP_PENDING",
    isCompleted: false,
    timestamp: "2026-09-04 12:40:00",
  };
  PaymentService.addTransaction(txLockTest);
  postedRequests.length = 0;

  const [callA, callB] = await Promise.all([
    PaymentService.completeTransaction("TXN-4W-LOCK", "Google Pay UPI", undefined, "PAYMENT_COMPLETED"),
    PaymentService.completeTransaction("TXN-4W-LOCK", "Google Pay UPI", undefined, "PAYMENT_COMPLETED"),
  ]);

  const successes = [callA, callB].filter((r) => r.success).length;
  const fails = [callA, callB].filter((r) => !r.success).length;
  assertEqual(successes, 1, "Exactly one concurrent call succeeded");
  assertEqual(fails, 1, "Duplicate concurrent call was rejected");
  assertEqual(postedRequests.length, 1, "Exactly one backend confirmation HTTP call dispatched");

  // --------------------------------------------------------------------------
  // TEST 10: Terminal transactions remain unchanged in production mode
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 10: Terminal transactions remain unchanged in production mode ---");
  postedRequests.length = 0;

  const txTerminal = {
    id: "TXN-4W-TERMINAL",
    amount: 1400,
    merchant: "Cancelled Order",
    status: "Cancelled",
    canonicalStatus: "CANCELLED",
    isCompleted: true,
    timestamp: "2026-09-04 11:00:00",
  };
  PaymentService.addTransaction(txTerminal);

  const termRes = await PaymentService.completeTransaction("TXN-4W-TERMINAL", undefined, undefined, "PAYMENT_COMPLETED");
  assertEqual(termRes.success, false, "PaymentService rejects completing terminal transaction");
  assertEqual(postedRequests.length, 0, "No backend calls made for terminal transaction");

  const termAfter = (await PaymentService.getTransactions()).items.find((t: any) => t.id === "TXN-4W-TERMINAL");
  assertEqual(termAfter?.status, "Cancelled", "Cancelled status preserved");
  assertEqual(termAfter?.canonicalStatus, "CANCELLED", "CANCELLED canonicalStatus preserved");

  // --------------------------------------------------------------------------
  // TEST 11: PAYMENT_COMPLETED is still strictly required
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 11: Non-completion stages rejected ---");
  const badStages = ["EVALUATION_COMPLETED", "LOW", "MEDIUM", "HIGH", "PAYMENT_AUTHORIZED", "PAYMENT_SUBMITTED"];
  for (const bad of badStages) {
    const badRes = await PaymentService.completeTransaction("TXN-4W-EXCEPTION", undefined, undefined, bad);
    assertEqual(badRes.success, false, `Stage '${bad}' rejected by completeTransaction`);
  }

  // --------------------------------------------------------------------------
  // TEST 12: Manual confirmation remains available after a safe UPI return
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 12: Safe UPI return enables manual confirmation ---");
  const returnMgr = new UpiReturnManager();
  const txReturnCheck = {
    id: "TXN-4W-RETURN-CHECK",
    amount: 880,
    merchant: "FabIndia",
    status: "Pending",
    canonicalStatus: "PAYMENT_APP_PENDING",
    isCompleted: false,
    timestamp: "2026-09-04 12:50:00",
  };
  PaymentService.addTransaction(txReturnCheck);

  // App launches UPI app
  returnMgr.startAwaitingReturn("TXN-4W-RETURN-CHECK");
  assertEqual(returnMgr.isAwaiting("TXN-4W-RETURN-CHECK"), true, "Manager awaiting return");

  // App returns from background
  const returnEvent = returnMgr.handleAppReturn(null, txReturnCheck as any);
  assertEqual(returnEvent.handled, true, "Return event handled for prompt");
  assertEqual(returnEvent.shouldPromptUser, true, "User is prompted for manual confirmation");

  // Transaction was NOT automatically confirmed:
  const txBeforeUserConfirm = (await PaymentService.getTransactions()).items.find((t: any) => t.id === "TXN-4W-RETURN-CHECK");
  assertEqual(txBeforeUserConfirm?.status, "Pending", "Transaction remains Pending after return");
  assertEqual(txBeforeUserConfirm?.isCompleted, false, "isCompleted remains false after return");

  // User taps YES manual confirmation
  postedRequests.length = 0;
  apiMode = "SUCCESS";
  const userConfirmRes = await PaymentService.completeTransaction(
    "TXN-4W-RETURN-CHECK",
    "Google Pay UPI",
    undefined,
    "PAYMENT_COMPLETED",
    { hasActiveContext: true }
  );
  assertEqual(userConfirmRes.success, true, "Manual confirmation succeeded after return");
  returnMgr.clearAwaitingReturn();
  assertEqual(returnMgr.isAwaiting(), false, "Awaiting return cleared");

  const txAfterUserConfirm = (await PaymentService.getTransactions()).items.find((t: any) => t.id === "TXN-4W-RETURN-CHECK");
  assertEqual(txAfterUserConfirm?.status, "Completed", "Transaction status updated to Completed");
  assertEqual(txAfterUserConfirm?.canonicalStatus, "CONFIRMED", "Canonical status updated to CONFIRMED");
  assertEqual(txAfterUserConfirm?.isCompleted, true, "isCompleted is true");

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`FAILURES:     ${failures}`);
  console.log("=================================================================\n");

  ApiClient.post = origPost;

  if (failures > 0) {
    process.exit(1);
  }
}

runProductionConfirmationOfflineSafetyRegressionSuite().catch((err) => {
  console.error("Unhandled regression suite error:", err);
  process.exit(1);
});
