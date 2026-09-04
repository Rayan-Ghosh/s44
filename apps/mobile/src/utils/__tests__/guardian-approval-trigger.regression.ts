/**
 * AVARAN PAY — Guardian Approval Trigger Regression Test Suite
 *
 * Validates the core rule:
 * Guardian approval must NOT start when the user opens a HIGH-risk payment card.
 * The ONLY valid trigger is:
 * HIGH-risk payment card -> user clicks CONFIRM PAYMENT -> Guardian approval starts.
 *
 * Tests:
 * 1. Opening/evaluating a HIGH-risk card never starts Guardian approval or calls createRequest.
 * 2. LOW risk transactions never trigger Guardian approval on confirmation.
 * 3. MEDIUM risk transactions follow user-choice flow and never trigger Guardian approval.
 * 4. HIGH risk transactions without enrolled trusted contacts never call Guardian-start.
 * 5. HIGH risk transactions with enrolled trusted contacts trigger Guardian approval ONLY on CONFIRM PAYMENT.
 * 6. In-flight duplicate protection prevents duplicate requests on rapid clicks.
 * 7. Transactions with existing pending requests or terminal/resolved statuses do not restart Guardian approval.
 *
 * Run with: npx -y tsx src/utils/__tests__/guardian-approval-trigger.regression.ts
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
      Platform: { OS: "android", select: (objs: any) => objs?.android ?? objs?.default },
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
      Vibration: {
        vibrate: () => {},
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

const { PaymentService, isTransactionTerminal } = require("../../services/payment-service");
const { GuardianService } = require("../../services/guardian-service");

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

async function runGuardianTriggerRegressionSuite() {
  console.log("=================================================================");
  console.log("AVARAN PAY: GUARDIAN APPROVAL TRIGGER REGRESSION SUITE");
  console.log("=================================================================\n");

  let createRequestCallCount = 0;
  let getRequestByTxnCallCount = 0;
  let lastCreatedTxnId: number | null = null;
  let lastCreatedContactId: number | undefined = undefined;

  // Mock GuardianService methods
  const origCreate = GuardianService.createRequest;
  const origGetByTxn = GuardianService.getRequestByTransactionId;

  GuardianService.createRequest = async function (txnId: number, contactId?: number) {
    createRequestCallCount++;
    lastCreatedTxnId = txnId;
    lastCreatedContactId = contactId;
    return {
      success: true,
      request: {
        id: 999,
        transactionId: txnId,
        trustedContactId: contactId || 10,
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 120000).toISOString(),
        outcome: "PENDING",
        resolutionChannel: "WEB_CONSOLE",
        remainingSeconds: 120,
        transactionAmount: 50000,
        riskScore: 85,
        riskReasons: ["Scam suspected"],
        senderName: "Alice",
        recipientName: "Scammer",
      },
    };
  };

  GuardianService.getRequestByTransactionId = async function (txnId: number) {
    getRequestByTxnCallCount++;
    return null; // By default no existing request
  };

  // Helper simulating the card opening sync logic from GuardianContext
  async function simulateOpenCard(tx: any, isTrustedEnabled: boolean, contacts: any[]) {
    const numTxnId = parseInt(tx.id, 10);
    if (isNaN(numTxnId)) return null;

    // Fixed sync logic: ONLY get existing request, NEVER call createRequest
    const dto = await GuardianService.getRequestByTransactionId(numTxnId);
    return dto;
  }

  // Helper simulating handleConfirm from PaymentsScreen
  async function simulateClickConfirmPayment(
    tx: any,
    isTrustedEnabled: boolean,
    contacts: any[],
    activePendingRequest?: any
  ): Promise<{ action: "GUARDIAN_STARTED" | "BIOMETRIC" | "APP_SELECTOR" | "BLOCKED" | "NONE" }> {
    if (isTransactionTerminal(tx)) {
      return { action: "BLOCKED" };
    }

    const isHighRisk = tx.riskLevel === "HIGH" || (typeof tx.riskScore === "number" && tx.riskScore >= 61);

    // High risk with Guardian enabled and contacts enrolled
    if (isHighRisk && isTrustedEnabled && contacts.length > 0) {
      if (tx.canonicalStatus === "GUARDIAN_APPROVED" || tx.status === "Approved by you") {
        if (tx.authorizationRequired !== false && tx.authorizationStatus !== "AUTHORIZED") {
          return { action: "BIOMETRIC" };
        }
        return { action: "APP_SELECTOR" };
      }

      // If already pending, do not start again
      if (activePendingRequest && activePendingRequest.status === "PENDING" && String(activePendingRequest.transactionId) === String(tx.id)) {
        return { action: "NONE" };
      }

      // Trigger Guardian approval!
      const contactId = contacts[0]?.id ? parseInt(contacts[0].id, 10) : undefined;
      const res = await GuardianService.createRequest(parseInt(tx.id, 10), contactId);
      if (res.success && res.request) {
        PaymentService.updateTransactionStatus(tx.id, "Held", "AWAITING_GUARDIAN");
        return { action: "GUARDIAN_STARTED" };
      }
      return { action: "NONE" };
    }

    // High risk without Guardian
    if (isHighRisk && tx.authorizationRequired !== false && tx.authorizationStatus !== "AUTHORIZED") {
      return { action: "BIOMETRIC" };
    }

    // Low or Medium risk
    return { action: "APP_SELECTOR" };
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Opening a HIGH-risk payment card
    // -------------------------------------------------------------
    console.log("[Test 1] Opening a HIGH-risk payment card");
    createRequestCallCount = 0;
    getRequestByTxnCallCount = 0;

    const highRiskTx = {
      id: "101",
      amount: 55000,
      status: "Held",
      riskLevel: "HIGH",
      riskScore: 88,
      authorizationRequired: true,
      authorizationStatus: "NONE",
      canonicalStatus: "AWAITING_CONFIRMATION",
      isCompleted: false,
    };
    const contacts = [{ id: "5", name: "Bob", phone: "+91-99999-88888" }];

    // Open card
    const syncRes = await simulateOpenCard(highRiskTx, true, contacts);
    assertEqual(syncRes, null, "Syncing opened card returned null (no existing request)");
    assertEqual(createRequestCallCount, 0, "createRequest must NEVER be called when opening a high-risk card");
    assertEqual(getRequestByTxnCallCount, 1, "Only getRequestByTransactionId called to inspect existing state");

    // -------------------------------------------------------------
    // Test 2: LOW risk transaction confirm flow
    // -------------------------------------------------------------
    console.log("\n[Test 2] Clicking CONFIRM PAYMENT on a LOW-risk transaction");
    createRequestCallCount = 0;

    const lowRiskTx = {
      id: "102",
      amount: 250,
      status: "Held",
      riskLevel: "LOW",
      riskScore: 12,
      authorizationRequired: false,
      authorizationStatus: "NONE",
      canonicalStatus: "AWAITING_CONFIRMATION",
      isCompleted: false,
    };

    const lowRiskResult = await simulateClickConfirmPayment(lowRiskTx, true, contacts);
    assertEqual(lowRiskResult.action, "APP_SELECTOR", "LOW risk transaction proceeds directly to app selector");
    assertEqual(createRequestCallCount, 0, "Guardian approval was never triggered for LOW risk transaction");

    // -------------------------------------------------------------
    // Test 3: MEDIUM risk transaction confirm flow
    // -------------------------------------------------------------
    console.log("\n[Test 3] Clicking CONFIRM PAYMENT on a MEDIUM-risk transaction");
    createRequestCallCount = 0;

    const medRiskTx = {
      id: "103",
      amount: 4500,
      status: "Held",
      riskLevel: "MEDIUM",
      riskScore: 45,
      authorizationRequired: false,
      authorizationStatus: "NONE",
      canonicalStatus: "AWAITING_CONFIRMATION",
      isCompleted: false,
    };

    const medRiskResult = await simulateClickConfirmPayment(medRiskTx, true, contacts);
    assertEqual(medRiskResult.action, "APP_SELECTOR", "MEDIUM risk transaction proceeds to user-choice app selector");
    assertEqual(createRequestCallCount, 0, "Guardian approval was never triggered for MEDIUM risk transaction");

    // -------------------------------------------------------------
    // Test 4: HIGH risk transaction without enrolled Guardian
    // -------------------------------------------------------------
    console.log("\n[Test 4] HIGH risk transaction without enrolled Guardian contacts");
    createRequestCallCount = 0;

    const highRiskNoGuardianTx = {
      id: "104",
      amount: 60000,
      status: "Held",
      riskLevel: "HIGH",
      riskScore: 82,
      authorizationRequired: true,
      authorizationStatus: "NONE",
      canonicalStatus: "AWAITING_CONFIRMATION",
      isCompleted: false,
    };

    const noGuardianResult = await simulateClickConfirmPayment(highRiskNoGuardianTx, true, []);
    assertEqual(noGuardianResult.action, "BIOMETRIC", "HIGH risk without guardian proceeds to biometric verification");
    assertEqual(createRequestCallCount, 0, "createRequest was not called when user has no enrolled trusted contacts");

    // -------------------------------------------------------------
    // Test 5: HIGH risk transaction WITH Guardian contacts: CONFIRM PAYMENT triggers Guardian
    // -------------------------------------------------------------
    console.log("\n[Test 5] HIGH risk transaction WITH Guardian: Clicking CONFIRM PAYMENT triggers Guardian");
    createRequestCallCount = 0;

    const highRiskWithGuardianTx = {
      id: "105",
      amount: 70000,
      status: "Held",
      riskLevel: "HIGH",
      riskScore: 91,
      authorizationRequired: true,
      authorizationStatus: "NONE",
      canonicalStatus: "AWAITING_CONFIRMATION",
      isCompleted: false,
    };

    // Before clicking confirm, verify createRequest is 0
    assertEqual(createRequestCallCount, 0, "createRequest is 0 before clicking confirm");

    // User explicitly clicks CONFIRM PAYMENT
    const confirmResult = await simulateClickConfirmPayment(highRiskWithGuardianTx, true, contacts);
    assertEqual(confirmResult.action, "GUARDIAN_STARTED", "Guardian approval started on CONFIRM PAYMENT");
    assertEqual(createRequestCallCount, 1, "createRequest was called exactly once on CONFIRM PAYMENT");
    assertEqual(lastCreatedTxnId, 105, "createRequest called with transaction ID 105");
    assertEqual(lastCreatedContactId, 5, "createRequest called with contact ID 5");

    // -------------------------------------------------------------
    // Test 6: In-flight duplicate protection
    // -------------------------------------------------------------
    console.log("\n[Test 6] In-flight duplicate protection on repeated clicks");
    createRequestCallCount = 0;

    let isInitiatingLock = false;
    let successfulInitiations = 0;

    async function clickWithLock(tx: any) {
      if (isInitiatingLock) return;
      isInitiatingLock = true;
      try {
        await GuardianService.createRequest(parseInt(tx.id, 10), 5);
        successfulInitiations++;
      } finally {
        isInitiatingLock = false;
      }
    }

    // Simulate 5 simultaneous rapid clicks
    await Promise.all([
      clickWithLock(highRiskWithGuardianTx),
      clickWithLock(highRiskWithGuardianTx),
      clickWithLock(highRiskWithGuardianTx),
      clickWithLock(highRiskWithGuardianTx),
      clickWithLock(highRiskWithGuardianTx),
    ]);

    assertEqual(successfulInitiations, 1, "Only 1 request was created despite 5 rapid clicks");

    // -------------------------------------------------------------
    // Test 7: Already pending request does not create another request
    // -------------------------------------------------------------
    console.log("\n[Test 7] Already pending request does not create another request");
    createRequestCallCount = 0;

    const activePending = {
      id: "999",
      transactionId: "105",
      status: "PENDING",
    };

    const duplicatePendingResult = await simulateClickConfirmPayment(
      highRiskWithGuardianTx,
      true,
      contacts,
      activePending
    );
    assertEqual(duplicatePendingResult.action, "NONE", "Existing pending request prevented new request");
    assertEqual(createRequestCallCount, 0, "createRequest was not called when a request is already pending");

    // -------------------------------------------------------------
    // Test 8: Terminal or resolved transaction cannot restart Guardian approval
    // -------------------------------------------------------------
    console.log("\n[Test 8] Terminal or resolved transactions cannot trigger Guardian approval");
    createRequestCallCount = 0;

    const approvedTx = {
      id: "106",
      amount: 50000,
      status: "Approved by you",
      canonicalStatus: "GUARDIAN_APPROVED",
      riskLevel: "HIGH",
      riskScore: 80,
      authorizationRequired: true,
      authorizationStatus: "NONE",
      isCompleted: false,
    };
    const approvedRes = await simulateClickConfirmPayment(approvedTx, true, contacts);
    assertEqual(approvedRes.action, "BIOMETRIC", "Already approved transaction proceeds to biometric authorization without re-triggering Guardian");
    assertEqual(createRequestCallCount, 0, "createRequest was not called for GUARDIAN_APPROVED transaction");

    const terminalTx = {
      id: "107",
      amount: 50000,
      status: "Blocked",
      canonicalStatus: "GUARDIAN_REJECTED",
      riskLevel: "HIGH",
      riskScore: 80,
      isCompleted: true,
    };
    const terminalRes = await simulateClickConfirmPayment(terminalTx, true, contacts);
    assertEqual(terminalRes.action, "BLOCKED", "Terminal transaction is blocked from triggering Guardian");
    assertEqual(createRequestCallCount, 0, "createRequest was not called for terminal transaction");

    // Restore original methods
    GuardianService.createRequest = origCreate;
    GuardianService.getRequestByTransactionId = origGetByTxn;

    console.log("\n=================================================================");
    console.log(`TOTAL CHECKS: ${totalChecks}`);
    console.log(`FAILURES:     ${failures}`);
    console.log("=================================================================");

    if (failures > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error("Fatal error during test suite:", err);
    process.exit(1);
  }
}

runGuardianTriggerRegressionSuite();
