/**
 * AVARAN PAY — Part 4U Regression Test Suite:
 * Safe UPI Return Handling
 *
 * Proves:
 * 1. Return from background is detected only when a payment is awaiting return.
 * 2. A valid supported return URL is handled without confirming payment.
 * 3. Unknown or malformed URLs do not confirm payment.
 * 4. Duplicate return events are ignored.
 * 5. The transaction remains pending after return.
 * 6. /confirm is not called automatically.
 * 7. No return event mutates a completed or cancelled transaction.
 * 8. Awaiting-return state resets safely.
 * 9. Existing manual confirmation remains available.
 *
 * Run with: npx -y tsx src/utils/__tests__/upi-return-handling.regression.ts
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
  parseUpiReturnUrl,
  canProcessUpiReturn,
  UpiReturnManager,
  GlobalUpiReturnManager,
  UPI_RETURN_PROMPT_MESSAGE,
  UPI_RETURN_CANCELLED_MESSAGE,
  UPI_RETURN_FAILED_MESSAGE,
} = require("../upi-return-handler");

const { PaymentService } = require("../../services/payment-service");
const { ApiClient } = require("../../services/api-client");

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

async function runUpiReturnHandlingRegressionSuite() {
  console.log("=================================================================");
  console.log("AVARAN PAY PART 4U: SAFE UPI RETURN HANDLING REGRESSION SUITE");
  console.log("=================================================================\n");

  // Track ApiClient calls to prove /confirm is never called automatically
  const postedRequests: Array<{ endpoint: string; body: any }> = [];
  const origPost = ApiClient.post;
  ApiClient.post = async function (endpoint: string, body?: any) {
    postedRequests.push({ endpoint, body });
    if (endpoint.includes("/confirm")) {
      return {
        success: true,
        data: {
          id: "TXN-901",
          status: "CONFIRMED",
          is_completed: true,
        },
      };
    }
    return { success: true, data: {} };
  };

  const manager = new UpiReturnManager();

  const mockPendingTx = {
    id: "TXN-901",
    amount: 1500,
    merchant: "Deepa Enterprises",
    status: "Pending",
    canonicalStatus: "PAYMENT_APP_PENDING",
    isCompleted: false,
    timestamp: "2026-09-04 12:00:00",
  };

  const mockCompletedTx = {
    id: "TXN-902",
    amount: 2500,
    merchant: "Metro Supermarket",
    status: "Completed",
    canonicalStatus: "CONFIRMED",
    isCompleted: true,
    timestamp: "2026-09-04 11:30:00",
  };

  const mockCancelledTx = {
    id: "TXN-903",
    amount: 800,
    merchant: "Quick Chai",
    status: "Cancelled",
    canonicalStatus: "CANCELLED",
    isCompleted: true,
    cancelledAt: "2026-09-04 11:45:00",
    timestamp: "2026-09-04 11:40:00",
  };

  PaymentService.addTransaction(mockPendingTx);

  // --------------------------------------------------------------------------
  // TEST 1: Return from background is detected only when payment is awaiting return
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 1: Return from background detected only when awaiting return ---");

  // A. When NOT awaiting return:
  manager.clearAwaitingReturn();
  assertEqual(manager.isAwaiting(), false, "Manager initially not awaiting return");

  const unhandledBackground = manager.handleAppReturn(null, mockPendingTx);
  assertEqual(unhandledBackground.handled, false, "Background return unhandled when not awaiting");
  assertEqual(unhandledBackground.shouldPromptUser, false, "Should not prompt user when not awaiting");

  const canProcessWhenNotAwaiting = canProcessUpiReturn({
    isAwaitingReturn: false,
    transaction: mockPendingTx as any,
  });
  assertEqual(canProcessWhenNotAwaiting, false, "canProcessUpiReturn returns false when not awaiting");

  // B. When actively awaiting return:
  manager.startAwaitingReturn("TXN-901");
  assertEqual(manager.isAwaiting("TXN-901"), true, "Manager is awaiting return for TXN-901");
  assertEqual(manager.isAwaiting("TXN-999"), false, "Manager is NOT awaiting return for TXN-999");

  const handledBackground = manager.handleAppReturn(null, mockPendingTx);
  assertEqual(handledBackground.handled, true, "Background return handled when actively awaiting");
  assertEqual(handledBackground.shouldPromptUser, true, "Prompts user to confirm after return");
  assertEqual(handledBackground.message, UPI_RETURN_PROMPT_MESSAGE, "Displays standard return prompt message");

  // --------------------------------------------------------------------------
  // TEST 2: Valid supported return URL handled without confirming payment
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 2: Valid supported return URL handled without confirming payment ---");

  const freshManager = new UpiReturnManager();
  freshManager.startAwaitingReturn("TXN-901");

  const validSuccessUrl = "avaran://upi-return?status=SUCCESS&responseCode=0&txnId=UPI12345678&approvalRefNo=REF987654";
  const parsedValid = parseUpiReturnUrl(validSuccessUrl);
  assertEqual(parsedValid.valid, true, "Valid return URL parsed successfully");
  assertEqual(parsedValid.data?.status, "SUCCESS", "Parsed status is SUCCESS");
  assertEqual(parsedValid.data?.txnId, "UPI12345678", "Parsed txnId matches");

  const returnResult = freshManager.handleAppReturn(validSuccessUrl, mockPendingTx);
  assertEqual(returnResult.handled, true, "Valid return URL is handled");
  assertEqual(returnResult.shouldPromptUser, true, "Prompts user for manual confirmation");
  assertEqual(returnResult.message, UPI_RETURN_PROMPT_MESSAGE, "Prompts user instead of assuming success");

  // CRITICAL: Ensure transaction remained pending and /confirm was not invoked
  assertEqual(mockPendingTx.canonicalStatus, "PAYMENT_APP_PENDING", "Transaction remains PAYMENT_APP_PENDING");
  assertEqual(mockPendingTx.isCompleted, false, "Transaction is NOT completed");
  const confirmCallsForTest2 = postedRequests.filter((r) => r.endpoint.includes("/confirm"));
  assertEqual(confirmCallsForTest2.length, 0, "No /confirm endpoint was invoked automatically");

  // --------------------------------------------------------------------------
  // TEST 3: Unknown or malformed URLs do not confirm payment
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 3: Unknown or malformed URLs do not confirm payment ---");

  const malformedUrl1 = "not-a-valid-scheme-url";
  const parsedMalformed1 = parseUpiReturnUrl(malformedUrl1);
  assertEqual(parsedMalformed1.valid, false, "Malformed scheme URL rejected by parser");

  const malformedUrl2 = "";
  const parsedMalformed2 = parseUpiReturnUrl(malformedUrl2);
  assertEqual(parsedMalformed2.valid, false, "Empty URL rejected by parser");

  const nullParsed = parseUpiReturnUrl(null);
  assertEqual(nullParsed.valid, false, "Null URL rejected by parser");

  const cancelledUrl = "avaran://payment-return?status=CANCELLED&responseCode=U30";
  const parsedCancelled = parseUpiReturnUrl(cancelledUrl);
  assertEqual(parsedCancelled.valid, true, "Cancelled URL parsed");
  assertEqual(parsedCancelled.data?.status, "CANCELLED", "Status recognized as CANCELLED");
  assertEqual(parsedCancelled.data?.isExplicitFailure, true, "Marked as explicit failure");

  const mgr3 = new UpiReturnManager();
  mgr3.startAwaitingReturn("TXN-901");
  const cancelReturn = mgr3.handleAppReturn(cancelledUrl, mockPendingTx);
  assertEqual(cancelReturn.handled, true, "Cancelled return URL processed safely");
  assertEqual(cancelReturn.message, UPI_RETURN_CANCELLED_MESSAGE, "Presents cancellation advisory message");
  assertEqual(mockPendingTx.isCompleted, false, "Cancelled return URL never completes transaction");

  const failedUrl = "avaran://payment-return?status=FAILED&responseCode=ZD";
  const parsedFailed = parseUpiReturnUrl(failedUrl);
  assertEqual(parsedFailed.valid, true, "Failed URL parsed");
  assertEqual(parsedFailed.data?.status, "FAILURE", "Status recognized as FAILURE");

  const mgr3b = new UpiReturnManager();
  mgr3b.startAwaitingReturn("TXN-901");
  const failReturn = mgr3b.handleAppReturn(failedUrl, mockPendingTx);
  assertEqual(failReturn.handled, true, "Failed return URL processed safely");
  assertEqual(failReturn.message, UPI_RETURN_FAILED_MESSAGE, "Presents failure advisory message");
  assertEqual(mockPendingTx.isCompleted, false, "Failed return URL never completes transaction");

  // --------------------------------------------------------------------------
  // TEST 4: Duplicate return events are ignored
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 4: Duplicate return events are ignored ---");

  const dupManager = new UpiReturnManager();
  dupManager.startAwaitingReturn("TXN-901");

  const urlTest = "avaran://upi-return?status=SUCCESS&txnId=TXN-DUP-01";

  // First event: should handle
  const firstEvent = dupManager.handleAppReturn(urlTest, mockPendingTx);
  assertEqual(firstEvent.handled, true, "First return event is handled");
  assertEqual(firstEvent.isDuplicate, false, "First return event is NOT duplicate");

  // Immediate second event with same URL: should debounce and reject as duplicate
  const secondEvent = dupManager.handleAppReturn(urlTest, mockPendingTx);
  assertEqual(secondEvent.handled, false, "Duplicate URL return event is ignored");
  assertEqual(secondEvent.isDuplicate, true, "Marked as duplicate");

  // Immediate third event (lifecycle AppState event without URL): should debounce
  const thirdEvent = dupManager.handleAppReturn(null, mockPendingTx);
  assertEqual(thirdEvent.handled, false, "Rapid duplicate lifecycle event is ignored");
  assertEqual(thirdEvent.isDuplicate, true, "Lifecycle event marked as duplicate within debounce window");

  // --------------------------------------------------------------------------
  // TEST 5: Transaction remains pending after return
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 5: Transaction remains pending after return ---");

  const stateManager = new UpiReturnManager();
  stateManager.startAwaitingReturn("TXN-901");

  const initialStatus = mockPendingTx.canonicalStatus;
  assertEqual(initialStatus, "PAYMENT_APP_PENDING", "Initial status is PAYMENT_APP_PENDING");

  const returnHandling = stateManager.handleAppReturn(
    "avaran://upi-return?status=SUCCESS",
    mockPendingTx
  );
  assertEqual(returnHandling.handled, true, "Return handled successfully");

  // Invariant check:
  assertEqual(mockPendingTx.canonicalStatus, "PAYMENT_APP_PENDING", "Still PAYMENT_APP_PENDING after return");
  assertEqual(mockPendingTx.status, "Pending", "Still Pending after return");
  assert(mockPendingTx.canonicalStatus !== "CONFIRMED", "Never set to CONFIRMED");
  assert(mockPendingTx.status !== "Completed", "Never set to Completed");

  // --------------------------------------------------------------------------
  // TEST 6: /confirm is not called automatically
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 6: /confirm is not called automatically ---");

  const currentConfirmCalls = postedRequests.filter((r) => r.endpoint.includes("/confirm"));
  assertEqual(currentConfirmCalls.length, 0, "Zero automated calls to /confirm endpoint across all returns");

  // --------------------------------------------------------------------------
  // TEST 7: No return event mutates a completed or cancelled transaction
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 7: Terminal/Completed/Cancelled transactions are untouched ---");

  const terminalManager = new UpiReturnManager();
  terminalManager.startAwaitingReturn("TXN-902");

  const completedReturn = terminalManager.handleAppReturn(
    "avaran://upi-return?status=SUCCESS",
    mockCompletedTx
  );
  assertEqual(completedReturn.handled, false, "Return for completed transaction is rejected");
  assertEqual(completedReturn.shouldPromptUser, false, "Does not prompt user for completed transaction");
  assertEqual(terminalManager.isAwaiting(), false, "Awaiting return state cleared on terminal detection");

  terminalManager.startAwaitingReturn("TXN-903");
  const cancelledReturn = terminalManager.handleAppReturn(
    "avaran://upi-return?status=SUCCESS",
    mockCancelledTx
  );
  assertEqual(cancelledReturn.handled, false, "Return for cancelled transaction is rejected");
  assertEqual(cancelledReturn.shouldPromptUser, false, "Does not prompt user for cancelled transaction");

  assertEqual(mockCompletedTx.canonicalStatus, "CONFIRMED", "Completed transaction status unchanged");
  assertEqual(mockCancelledTx.canonicalStatus, "CANCELLED", "Cancelled transaction status unchanged");

  // --------------------------------------------------------------------------
  // TEST 8: Awaiting-return state resets safely
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 8: Awaiting-return state resets safely ---");

  const resetManager = new UpiReturnManager();
  resetManager.startAwaitingReturn("TXN-901");
  assertEqual(resetManager.isAwaiting(), true, "State is awaiting return");
  assertEqual(resetManager.getAwaitingTransactionId(), "TXN-901", "Transaction ID is TXN-901");

  // Reset safely (e.g. user cancels or modal dismisses)
  resetManager.clearAwaitingReturn();
  assertEqual(resetManager.isAwaiting(), false, "State reset: isAwaiting is false");
  assertEqual(resetManager.getAwaitingTransactionId(), null, "Transaction ID reset to null");

  // Subsequent returns rejected cleanly
  const afterResetReturn = resetManager.handleAppReturn(null, mockPendingTx);
  assertEqual(afterResetReturn.handled, false, "Returns rejected after state reset");

  // --------------------------------------------------------------------------
  // TEST 9: Existing manual confirmation remains available
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 9: Existing manual confirmation remains available ---");

  // Simulate user tapping "YES — PAYMENT COMPLETED" in UI
  const manualCompleteResult = await PaymentService.completeTransaction(
    "TXN-901",
    "Google Pay UPI",
    { required: false },
    "PAYMENT_COMPLETED"
  );
  assertEqual(manualCompleteResult.success, true, "Manual confirmation completes successfully");

  const manualConfirmCall = postedRequests.find((r) => r.endpoint.includes("/confirm"));
  assert(Boolean(manualConfirmCall), "Manual confirmation successfully invokes /confirm");
  assertEqual(manualConfirmCall?.body?.stage, "PAYMENT_COMPLETED", "Manual confirmation sends PAYMENT_COMPLETED");

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

runUpiReturnHandlingRegressionSuite().catch((err) => {
  console.error("Unhandled regression suite error:", err);
  process.exit(1);
});
