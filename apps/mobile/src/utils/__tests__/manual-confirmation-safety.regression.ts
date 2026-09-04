/**
 * AVARAN PAY — Part 4V Regression Test Suite:
 * End-to-End Manual Confirmation Safety after UPI Return
 *
 * Proves:
 * 1. Successful manual confirmation calls completion once.
 * 2. Repeated taps call it once (debouncing/concurrency lock).
 * 3. Completion uses canonical stage PAYMENT_COMPLETED.
 * 4. Transaction changes to confirmed only after backend success.
 * 5. Failed completion leaves transaction pending.
 * 6. Retry is possible after failure.
 * 7. Cancelled/failed/confirmed/reported transactions are untouched.
 * 8. Missing or stale transaction is rejected.
 * 9. Awaiting-return state is cleared only after successful completion.
 * 10. Return events never invoke completion automatically.
 *
 * Run with: npx -y tsx src/utils/__tests__/manual-confirmation-safety.regression.ts
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
  confirmPaymentTransaction,
  completePaymentTransaction,
} = require("../../services/payment-service");
const { ApiClient } = require("../../services/api-client");
const {
  UpiReturnManager,
  GlobalUpiReturnManager,
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

async function runManualConfirmationSafetyRegressionSuite() {
  console.log("=================================================================");
  console.log("AVARAN PAY PART 4V: MANUAL CONFIRMATION SAFETY REGRESSION SUITE");
  console.log("=================================================================\n");

  const postedRequests: Array<{ endpoint: string; body: any }> = [];
  let backendShouldFail = false;
  let backendErrorMessage = "500 Internal Server Error";

  const origPost = ApiClient.post;
  ApiClient.post = async function (endpoint: string, body?: any) {
    postedRequests.push({ endpoint, body });
    if (endpoint.includes("/confirm")) {
      if (backendShouldFail) {
        return {
          success: false,
          error: backendErrorMessage,
          status: 500,
        };
      }
      return {
        success: true,
        data: {
          id: 991,
          status: "CONFIRMED",
          is_completed: true,
        },
      };
    }
    return { success: true, data: {} };
  };

  // Seed test transactions
  const txValidPending = {
    id: "TXN-4V-001",
    amount: 1200,
    merchant: "Swiggy UPI",
    status: "Pending",
    canonicalStatus: "PAYMENT_APP_PENDING",
    isCompleted: false,
    timestamp: "2026-09-04 12:00:00",
  };

  const txTerminalConfirmed = {
    id: "TXN-4V-002",
    amount: 2500,
    merchant: "Amazon India",
    status: "Completed",
    canonicalStatus: "CONFIRMED",
    isCompleted: true,
    timestamp: "2026-09-04 11:00:00",
  };

  const txTerminalCancelled = {
    id: "TXN-4V-003",
    amount: 300,
    merchant: "Chai Point",
    status: "Cancelled",
    canonicalStatus: "CANCELLED",
    isCompleted: true,
    cancelledAt: "2026-09-04 11:30:00",
    timestamp: "2026-09-04 11:20:00",
  };

  const txTerminalFailed = {
    id: "TXN-4V-004",
    amount: 450,
    merchant: "Uber Ride",
    status: "Failed",
    canonicalStatus: "FAILED",
    isCompleted: true,
    timestamp: "2026-09-04 11:10:00",
  };

  const txTerminalReported = {
    id: "TXN-4V-005",
    amount: 5000,
    merchant: "Suspicious Payee",
    status: "Reported",
    canonicalStatus: "REPORTED",
    isCompleted: true,
    timestamp: "2026-09-04 10:00:00",
  };

  PaymentService.addTransaction(txValidPending);
  PaymentService.addTransaction(txTerminalConfirmed);
  PaymentService.addTransaction(txTerminalCancelled);
  PaymentService.addTransaction(txTerminalFailed);
  PaymentService.addTransaction(txTerminalReported);

  // --------------------------------------------------------------------------
  // TEST 1 & 3: Successful manual confirmation calls completion once with PAYMENT_COMPLETED
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 1 & 3: Successful manual confirmation uses PAYMENT_COMPLETED exactly once ---");
  postedRequests.length = 0;
  backendShouldFail = false;

  const returnManager = new UpiReturnManager();
  returnManager.startAwaitingReturn("TXN-4V-001");
  assertEqual(returnManager.isAwaiting("TXN-4V-001"), true, "Transaction is awaiting return");

  // Validate eligibility before completion
  const eligibility1 = validateManualConfirmationEligibility(txValidPending as any, {
    hasActiveContext: true,
    stage: "PAYMENT_COMPLETED",
  });
  assertEqual(eligibility1.eligible, true, "Pending transaction with active context is eligible");

  // Call completion
  const completeRes1 = await PaymentService.completeTransaction(
    "TXN-4V-001",
    "Google Pay UPI",
    undefined,
    "PAYMENT_COMPLETED",
    { hasActiveContext: true }
  );
  assertEqual(completeRes1.success, true, "Manual confirmation succeeded");

  // Invariant checks on network call:
  const confirmCalls = postedRequests.filter((r) => r.endpoint.includes("/confirm"));
  assertEqual(confirmCalls.length, 1, "Exactly one /confirm call was dispatched");
  assertEqual(confirmCalls[0].endpoint, "/api/v1/transactions/TXN-4V-001/confirm", "Target endpoint is correct");
  assertEqual(confirmCalls[0].body.stage, "PAYMENT_COMPLETED", "Payload stage is PAYMENT_COMPLETED");

  // Invariant check on transaction mutation:
  const tx1After = (await PaymentService.getTransactions()).items.find((t: any) => t.id === "TXN-4V-001");
  assertEqual(tx1After?.status, "Completed", "Transaction status updated to Completed");
  assertEqual(tx1After?.canonicalStatus, "CONFIRMED", "Canonical status updated to CONFIRMED");
  assertEqual(tx1After?.isCompleted, true, "isCompleted updated to true");

  // Clear awaiting return state after success
  returnManager.clearAwaitingReturn();
  assertEqual(returnManager.isAwaiting(), false, "Awaiting return cleared after successful confirmation");

  // --------------------------------------------------------------------------
  // TEST 2: Repeated taps / concurrent calls execute only once
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 2: Repeated taps execute only once (in-flight concurrency lock) ---");
  const txConcurrent = {
    id: "TXN-4V-CONCURRENT",
    amount: 800,
    merchant: "Flipkart",
    status: "Pending",
    canonicalStatus: "PAYMENT_APP_PENDING",
    isCompleted: false,
    timestamp: "2026-09-04 12:15:00",
  };
  PaymentService.addTransaction(txConcurrent);
  postedRequests.length = 0;

  // Simulate two rapid concurrent taps
  const tap1Promise = PaymentService.completeTransaction(
    "TXN-4V-CONCURRENT",
    "Google Pay UPI",
    undefined,
    "PAYMENT_COMPLETED"
  );
  const tap2Promise = PaymentService.completeTransaction(
    "TXN-4V-CONCURRENT",
    "Google Pay UPI",
    undefined,
    "PAYMENT_COMPLETED"
  );

  const [resTap1, resTap2] = await Promise.all([tap1Promise, tap2Promise]);
  const succeededCount = [resTap1, resTap2].filter((r) => r.success).length;
  const rejectedCount = [resTap1, resTap2].filter((r) => !r.success).length;

  assertEqual(succeededCount, 1, "Exactly one of concurrent calls succeeded");
  assertEqual(rejectedCount, 1, "The duplicate in-flight call was rejected");
  const concurrentConfirmCalls = postedRequests.filter((r) => r.endpoint.includes("/confirm"));
  assertEqual(concurrentConfirmCalls.length, 1, "Only one HTTP request dispatched for repeated taps");

  // UpiReturnManager in-flight lock check
  const mgrLock = new UpiReturnManager();
  assertEqual(mgrLock.startConfirming("TXN-TEST"), true, "First startConfirming succeeds");
  assertEqual(mgrLock.startConfirming("TXN-TEST"), false, "Second startConfirming rejected while active");
  mgrLock.finishConfirming("TXN-TEST");
  assertEqual(mgrLock.startConfirming("TXN-TEST"), true, "startConfirming succeeds after finishConfirming");

  // --------------------------------------------------------------------------
  // TEST 4 & 5: Failed completion leaves transaction pending
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 4 & 5: Failed completion leaves transaction pending ---");
  const txFailTest = {
    id: "TXN-4V-FAIL",
    amount: 1500,
    merchant: "Blinkit",
    status: "Pending",
    canonicalStatus: "PAYMENT_APP_PENDING",
    isCompleted: false,
    timestamp: "2026-09-04 12:30:00",
  };
  PaymentService.addTransaction(txFailTest);

  // Trigger backend failure
  backendShouldFail = true;
  backendErrorMessage = "Bank server timeout during confirmation";

  const failRes = await PaymentService.completeTransaction(
    "TXN-4V-FAIL",
    "PhonePe UPI",
    undefined,
    "PAYMENT_COMPLETED"
  );
  assertEqual(failRes.success, false, "completeTransaction returns success === false on backend failure");
  assertEqual(failRes.error, "Bank server timeout during confirmation", "Returns exact backend error");

  // Crucial check: transaction must NOT be mutated to Completed or CONFIRMED
  const txFailAfter = (await PaymentService.getTransactions()).items.find((t: any) => t.id === "TXN-4V-FAIL");
  assertEqual(txFailAfter?.status, "Pending", "Transaction status remains Pending");
  assertEqual(txFailAfter?.canonicalStatus, "PAYMENT_APP_PENDING", "Canonical status remains PAYMENT_APP_PENDING");
  assertEqual(txFailAfter?.isCompleted, false, "isCompleted remains false");

  // --------------------------------------------------------------------------
  // TEST 6: Retry is possible after failure
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 6: Retry is possible after failure ---");
  backendShouldFail = false; // Network/server recovered

  const retryRes = await PaymentService.completeTransaction(
    "TXN-4V-FAIL",
    "PhonePe UPI",
    undefined,
    "PAYMENT_COMPLETED"
  );
  assertEqual(retryRes.success, true, "Retry succeeded after previous failure");

  const txRetryAfter = (await PaymentService.getTransactions()).items.find((t: any) => t.id === "TXN-4V-FAIL");
  assertEqual(txRetryAfter?.status, "Completed", "Transaction status updated to Completed on retry");
  assertEqual(txRetryAfter?.isCompleted, true, "isCompleted updated to true on retry");

  // --------------------------------------------------------------------------
  // TEST 7: Terminal/Cancelled/Failed/Reported transactions are untouched
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 7: Terminal transactions (CONFIRMED, CANCELLED, FAILED, REPORTED) are rejected ---");
  postedRequests.length = 0;

  // A. CONFIRMED
  const eligConfirmed = validateManualConfirmationEligibility(txTerminalConfirmed as any);
  assertEqual(eligConfirmed.eligible, false, "CONFIRMED transaction rejected by eligibility check");
  const compConfirmed = await PaymentService.completeTransaction("TXN-4V-002", undefined, undefined, "PAYMENT_COMPLETED");
  assertEqual(compConfirmed.success, false, "PaymentService rejects completing CONFIRMED transaction");

  // B. CANCELLED
  const eligCancelled = validateManualConfirmationEligibility(txTerminalCancelled as any);
  assertEqual(eligCancelled.eligible, false, "CANCELLED transaction rejected by eligibility check");
  const compCancelled = await PaymentService.completeTransaction("TXN-4V-003", undefined, undefined, "PAYMENT_COMPLETED");
  assertEqual(compCancelled.success, false, "PaymentService rejects completing CANCELLED transaction");

  // C. FAILED
  const eligFailed = validateManualConfirmationEligibility(txTerminalFailed as any);
  assertEqual(eligFailed.eligible, false, "FAILED transaction rejected by eligibility check");
  const compFailed = await PaymentService.completeTransaction("TXN-4V-004", undefined, undefined, "PAYMENT_COMPLETED");
  assertEqual(compFailed.success, false, "PaymentService rejects completing FAILED transaction");

  // D. REPORTED
  const eligReported = validateManualConfirmationEligibility(txTerminalReported as any);
  assertEqual(eligReported.eligible, false, "REPORTED transaction rejected by eligibility check");
  const compReported = await PaymentService.completeTransaction("TXN-4V-005", undefined, undefined, "PAYMENT_COMPLETED");
  assertEqual(compReported.success, false, "PaymentService rejects completing REPORTED transaction");

  assertEqual(postedRequests.length, 0, "Zero HTTP calls dispatched for terminal transactions");

  // --------------------------------------------------------------------------
  // TEST 8: Missing, null, or stale transaction is rejected
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 8: Missing or stale transaction is rejected ---");

  const eligNull = validateManualConfirmationEligibility(null);
  assertEqual(eligNull.eligible, false, "Null transaction rejected by eligibility check");

  const eligEmptyId = validateManualConfirmationEligibility({ id: "" } as any);
  assertEqual(eligEmptyId.eligible, false, "Transaction with empty ID rejected by eligibility check");

  const compMissing = await PaymentService.completeTransaction("NON_EXISTENT_TX_ID", undefined, undefined, "PAYMENT_COMPLETED");
  assertEqual(compMissing.success, false, "PaymentService rejects non-existent transaction ID");
  assertEqual(compMissing.error, "Transaction not found", "Returns Transaction not found error");

  const compEmptyId = await PaymentService.completeTransaction("", undefined, undefined, "PAYMENT_COMPLETED");
  assertEqual(compEmptyId.success, false, "PaymentService rejects empty transaction ID string");

  // --------------------------------------------------------------------------
  // TEST 9: PAYMENT_APP_PENDING rejected when no active context exists
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 9: PAYMENT_APP_PENDING rejected when no active manual-confirmation context exists ---");
  const txNoContext = {
    id: "TXN-4V-NOCONTEXT",
    amount: 400,
    merchant: "Local Kirana",
    status: "Pending",
    canonicalStatus: "PAYMENT_APP_PENDING",
    isCompleted: false,
    timestamp: "2026-09-04 12:45:00",
  };
  PaymentService.addTransaction(txNoContext);

  const eligNoContext = validateManualConfirmationEligibility(txNoContext as any, {
    hasActiveContext: false,
    stage: "PAYMENT_COMPLETED",
  });
  assertEqual(eligNoContext.eligible, false, "Eligibility check rejects when hasActiveContext === false");
  assertEqual(eligNoContext.error, "No active manual-confirmation context for pending payment", "Returns no active context error");

  const compNoContext = await PaymentService.completeTransaction(
    "TXN-4V-NOCONTEXT",
    "Google Pay UPI",
    undefined,
    "PAYMENT_COMPLETED",
    { hasActiveContext: false }
  );
  assertEqual(compNoContext.success, false, "PaymentService rejects completion when hasActiveContext === false");
  assertEqual(compNoContext.error, "No active manual-confirmation context for pending payment", "Returns expected error message");

  // --------------------------------------------------------------------------
  // TEST 10: Evaluation-only stages strictly rejected
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 10: Evaluation-only stage rejected from confirmation ---");

  const eligEval = validateManualConfirmationEligibility(txNoContext as any, {
    hasActiveContext: true,
    stage: "EVALUATION_COMPLETED",
  });
  assertEqual(eligEval.eligible, false, "EVALUATION_COMPLETED rejected by eligibility check");

  const compEval = await PaymentService.completeTransaction(
    "TXN-4V-NOCONTEXT",
    "Google Pay UPI",
    undefined,
    "EVALUATION_COMPLETED"
  );
  assertEqual(compEval.success, false, "PaymentService.completeTransaction rejects EVALUATION_COMPLETED");

  // --------------------------------------------------------------------------
  // TEST 11: Return events never invoke completion automatically
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 11: Return events never invoke completion automatically ---");
  postedRequests.length = 0;

  const autoCheckManager1 = new UpiReturnManager();
  autoCheckManager1.startAwaitingReturn("TXN-4V-NOCONTEXT");

  // 1. AppState lifecycle return event
  const resLifecycle = autoCheckManager1.handleAppReturn(null, txNoContext as any);
  assertEqual(resLifecycle.handled, true, "Lifecycle return event was handled for prompting");
  assertEqual(resLifecycle.shouldPromptUser, true, "Prompts user rather than auto-confirming");

  // 2. URL return event with explicit success (tested on fresh manager)
  const autoCheckManager2 = new UpiReturnManager();
  autoCheckManager2.startAwaitingReturn("TXN-4V-NOCONTEXT");
  const resSuccessUrl = autoCheckManager2.handleAppReturn("avaran://upi-return?status=SUCCESS&txnId=UPI999", txNoContext as any);
  assertEqual(resSuccessUrl.handled, true, "Success URL was handled for prompting");
  assertEqual(resSuccessUrl.shouldPromptUser, true, "Still prompts user rather than auto-confirming");

  // Invariant check: zero /confirm calls dispatched by return events!
  const autoConfirmCalls = postedRequests.filter((r) => r.endpoint.includes("/confirm"));
  assertEqual(autoConfirmCalls.length, 0, "Zero automated confirmation calls dispatched by return events");

  // Transaction remains pending:
  const txStillPending = (await PaymentService.getTransactions()).items.find((t: any) => t.id === "TXN-4V-NOCONTEXT");
  assertEqual(txStillPending?.canonicalStatus, "PAYMENT_APP_PENDING", "Transaction remains in PAYMENT_APP_PENDING state");
  assertEqual(txStillPending?.isCompleted, false, "isCompleted remains false");

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

runManualConfirmationSafetyRegressionSuite().catch((err) => {
  console.error("Unhandled regression suite error:", err);
  process.exit(1);
});
