/**
 * AVARAN PAY — Part 4X Regression Test Suite:
 * Demo-Mode Configuration Hardening and Production Startup Audit
 *
 * Proves:
 * 1. Default configuration is live/production (isDemoMode = false, source = default_production).
 * 2. Explicit lowercase "true" enables demo mode only where intended:
 *    - EXPO_PUBLIC_DEMO_MODE="true" (source = env_var)
 *    - Constants.expoConfig.extra.demoMode=true (source = expo_extra)
 * 3. "false" disables demo mode (source = env_var or expo_extra).
 * 4. Malformed environment values remain live/production:
 *    - "1", "yes", "TRUE", "True", " true", "true ", "", "0", "no", "demo", "development", "null"
 * 5. Missing or malformed Expo extra configuration remains live/production:
 *    - absent demoMode, extra=undefined, 1, "1", "yes", "TRUE", {}, [], "demo"
 * 6. Runtime test override works only when explicitly set:
 *    - setDemoMode(true) -> isDemoMode = true (source = runtime_override)
 *    - setDemoMode(false) -> isDemoMode = false (source = runtime_override)
 *    - resetDemoMode() / setDemoMode(null) clears override and restores underlying config
 * 7. Production confirmation still requires backend success:
 *    - Backend success -> CONFIRMED
 * 8. Production failure leaves transactions pending:
 *    - Backend error ("Unable to connect", 500, etc.) -> failure result, status remains PAYMENT_APP_PENDING
 *    - Network exception -> failure result, status remains PAYMENT_APP_PENDING
 * 9. Demo confirmation behavior remains intact:
 *    - In explicit demo mode, completion succeeds locally without backend confirmation.
 *
 * Run with: npx -y tsx src/utils/__tests__/demo-mode-configuration-hardening.regression.ts
 */

// @ts-ignore
(globalThis as any).__DEV__ = true;
// @ts-ignore
(globalThis as any).expo = { EventEmitter: class {} };

// Mutable reference for expo-constants mocking
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
  resolveDemoModeConfiguration,
  isDemoMode,
  setDemoMode,
  resetDemoMode,
  ApiClient,
} = require("../../services/api-client");

const {
  PaymentService,
} = require("../../services/payment-service");

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

async function runDemoModeConfigurationHardeningSuite() {
  console.log("=================================================================");
  console.log("AVARAN PAY PART 4X: DEMO-MODE CONFIGURATION HARDENING & AUDIT");
  console.log("=================================================================\n");

  const originalEnvDemo = process.env.EXPO_PUBLIC_DEMO_MODE;

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: DEFAULT CONFIGURATION IS LIVE / PRODUCTION
    // -------------------------------------------------------------------------
    console.log("--- Section 1: Default configuration is live/production ---");
    resetDemoMode();
    delete process.env.EXPO_PUBLIC_DEMO_MODE;
    mockExpoConstants.expoConfig = { extra: {} };

    let audit = resolveDemoModeConfiguration();
    assertEqual(audit.isDemoMode, false, "Default config: isDemoMode is false");
    assertEqual(audit.source, "default_production", "Default config source is default_production");
    assertEqual(audit.isExplicitDemo, false, "Default config: isExplicitDemo is false");
    assertEqual(isDemoMode(), false, "isDemoMode() returns false by default");

    // Also when expoConfig is completely missing
    mockExpoConstants.expoConfig = undefined;
    audit = resolveDemoModeConfiguration();
    assertEqual(audit.isDemoMode, false, "Missing expoConfig: isDemoMode is false");
    assertEqual(audit.source, "default_production", "Missing expoConfig source is default_production");
    mockExpoConstants.expoConfig = { extra: {} };

    // -------------------------------------------------------------------------
    // SECTION 2: EXPLICIT "true" ENABLES DEMO MODE ONLY WHERE INTENDED
    // -------------------------------------------------------------------------
    console.log("\n--- Section 2: Explicit 'true' enables demo mode ---");
    resetDemoMode();

    // Via environment variable
    process.env.EXPO_PUBLIC_DEMO_MODE = "true";
    audit = resolveDemoModeConfiguration();
    assertEqual(audit.isDemoMode, true, "EXPO_PUBLIC_DEMO_MODE='true' enables demo mode");
    assertEqual(audit.source, "env_var", "Source is env_var");
    assertEqual(audit.rawValue, "true", "Raw value matches 'true'");
    assertEqual(isDemoMode(), true, "isDemoMode() is true when env var is 'true'");

    // Via Expo extra when env var is absent
    delete process.env.EXPO_PUBLIC_DEMO_MODE;
    mockExpoConstants.expoConfig = { extra: { demoMode: true } };
    audit = resolveDemoModeConfiguration();
    assertEqual(audit.isDemoMode, true, "extra.demoMode=true enables demo mode");
    assertEqual(audit.source, "expo_extra", "Source is expo_extra");
    assertEqual(audit.rawValue, true, "Raw value matches boolean true");
    assertEqual(isDemoMode(), true, "isDemoMode() is true when extra.demoMode is boolean true");

    // Also string "true" in extra.demoMode
    mockExpoConstants.expoConfig = { extra: { demoMode: "true" } };
    audit = resolveDemoModeConfiguration();
    assertEqual(audit.isDemoMode, true, "extra.demoMode='true' enables demo mode");
    assertEqual(audit.source, "expo_extra", "Source is expo_extra");

    // -------------------------------------------------------------------------
    // SECTION 3: EXPLICIT "false" DISABLES DEMO MODE
    // -------------------------------------------------------------------------
    console.log("\n--- Section 3: Explicit 'false' disables demo mode ---");
    resetDemoMode();
    mockExpoConstants.expoConfig = { extra: {} };

    process.env.EXPO_PUBLIC_DEMO_MODE = "false";
    audit = resolveDemoModeConfiguration();
    assertEqual(audit.isDemoMode, false, "EXPO_PUBLIC_DEMO_MODE='false' disables demo mode");
    assertEqual(audit.source, "env_var", "Source is env_var");
    assertEqual(audit.isExplicitDemo, false, "isExplicitDemo is false");
    assertEqual(isDemoMode(), false, "isDemoMode() returns false");

    delete process.env.EXPO_PUBLIC_DEMO_MODE;
    mockExpoConstants.expoConfig = { extra: { demoMode: false } };
    audit = resolveDemoModeConfiguration();
    assertEqual(audit.isDemoMode, false, "extra.demoMode=false disables demo mode");
    assertEqual(audit.source, "expo_extra", "Source is expo_extra");
    assertEqual(isDemoMode(), false, "isDemoMode() returns false");

    // -------------------------------------------------------------------------
    // SECTION 4: MALFORMED ENVIRONMENT VALUES REMAIN LIVE / PRODUCTION
    // -------------------------------------------------------------------------
    console.log("\n--- Section 4: Malformed environment values remain live ---");
    resetDemoMode();
    mockExpoConstants.expoConfig = { extra: {} };

    const malformedEnvValues = [
      "1",
      "yes",
      "TRUE",
      "True",
      " true",
      "true ",
      "True ",
      "demo",
      "DEMO",
      "development",
      "0",
      "no",
      "NO",
      "",
      "null",
      "undefined",
      "random_string",
    ];

    for (const val of malformedEnvValues) {
      process.env.EXPO_PUBLIC_DEMO_MODE = val;
      const res = resolveDemoModeConfiguration();
      assertEqual(
        res.isDemoMode,
        false,
        `Malformed env value '${val}' evaluates to live mode (isDemoMode=false)`
      );
      assertEqual(res.source, "env_var", `Malformed env value '${val}' source is env_var`);
      assertEqual(isDemoMode(), false, `isDemoMode() is false for '${val}'`);
    }

    // -------------------------------------------------------------------------
    // SECTION 5: MISSING OR MALFORMED EXPO EXTRA CONFIGURATION REMAINS LIVE
    // -------------------------------------------------------------------------
    console.log("\n--- Section 5: Missing or malformed Expo extra remains live ---");
    resetDemoMode();
    delete process.env.EXPO_PUBLIC_DEMO_MODE;

    const malformedExtraValues: any[] = [
      1,
      "1",
      "yes",
      "TRUE",
      "True",
      "true ",
      " true",
      "demo",
      {},
      [],
      0,
      "0",
      "no",
      null,
    ];

    for (const val of malformedExtraValues) {
      mockExpoConstants.expoConfig = { extra: { demoMode: val } };
      const res = resolveDemoModeConfiguration();
      assertEqual(
        res.isDemoMode,
        false,
        `Malformed extra value ${JSON.stringify(val)} evaluates to live mode (isDemoMode=false)`
      );
      assertEqual(isDemoMode(), false, `isDemoMode() is false for extra ${JSON.stringify(val)}`);
    }

    // -------------------------------------------------------------------------
    // SECTION 6: RUNTIME TEST OVERRIDE WORKS ONLY WHEN EXPLICITLY SET
    // -------------------------------------------------------------------------
    console.log("\n--- Section 6: Runtime test override isolation ---");
    // Ensure runtime override takes precedence over env var
    process.env.EXPO_PUBLIC_DEMO_MODE = "false";
    mockExpoConstants.expoConfig = { extra: { demoMode: false } };

    setDemoMode(true);
    audit = resolveDemoModeConfiguration();
    assertEqual(audit.isDemoMode, true, "setDemoMode(true) overrides live env var to demo");
    assertEqual(audit.source, "runtime_override", "Source is runtime_override");
    assertEqual(isDemoMode(), true, "isDemoMode() returns true when overridden to true");

    process.env.EXPO_PUBLIC_DEMO_MODE = "true";
    setDemoMode(false);
    audit = resolveDemoModeConfiguration();
    assertEqual(audit.isDemoMode, false, "setDemoMode(false) overrides demo env var to live");
    assertEqual(audit.source, "runtime_override", "Source is runtime_override");
    assertEqual(isDemoMode(), false, "isDemoMode() returns false when overridden to false");

    // Clearing runtime override restores underlying configuration
    resetDemoMode();
    audit = resolveDemoModeConfiguration();
    assertEqual(audit.isDemoMode, true, "resetDemoMode() restores env var 'true'");
    assertEqual(audit.source, "env_var", "Source restored to env_var");

    process.env.EXPO_PUBLIC_DEMO_MODE = "false";
    resetDemoMode();
    audit = resolveDemoModeConfiguration();
    assertEqual(audit.isDemoMode, false, "resetDemoMode() restores env var 'false'");
    assertEqual(audit.source, "env_var", "Source restored to env_var");

    // setDemoMode(null) is equivalent to resetDemoMode()
    setDemoMode(true);
    assertEqual(isDemoMode(), true, "setDemoMode(true) active");
    setDemoMode(null);
    assertEqual(isDemoMode(), false, "setDemoMode(null) clears override back to env var false");

    // -------------------------------------------------------------------------
    // SECTION 7: PRODUCTION CONFIRMATION STILL REQUIRES BACKEND SUCCESS
    // -------------------------------------------------------------------------
    console.log("\n--- Section 7: Production confirmation requires backend success ---");
    // Explicitly live mode
    setDemoMode(false);

    let apiCallMade = false;
    let apiCallUrl = "";
    let apiCallPayload: any = null;

    const originalPost = ApiClient.post;
    ApiClient.post = async (url: string, payload: any) => {
      apiCallMade = true;
      apiCallUrl = url;
      apiCallPayload = payload;
      return {
        data: {
          id: 9991,
          status: "CONFIRMED",
          message: "Payment successfully confirmed on backend",
        },
      };
    };

    PaymentService.transactions = [
      {
        id: "tx-p4x-prod-1",
        merchant: "Merchant Alpha",
        amount: 500,
        status: "Pending",
        canonicalStatus: "PAYMENT_APP_PENDING",
        isCompleted: false,
        timestamp: "Just now",
        recipientType: "MERCHANT",
        riskLevel: "LOW",
        category: "Payment",
      },
    ];

    const prodConfirmResult = await PaymentService.confirmTransaction(
      "tx-p4x-prod-1",
      "PAYMENT_COMPLETED"
    );

    assertEqual(prodConfirmResult.success, true, "Production confirmation succeeds when backend succeeds");
    assertEqual(apiCallMade, true, "Backend API call was executed");
    assert(apiCallUrl.includes("/transactions/tx-p4x-prod-1/confirm"), "Called /confirm endpoint");
    assertEqual(apiCallPayload.stage, "PAYMENT_COMPLETED", "Payload includes PAYMENT_COMPLETED");

    const updatedTx1 = PaymentService.transactions.find((t: any) => t.id === "tx-p4x-prod-1");
    assertEqual(updatedTx1.status, "Completed", "Status updated to Completed after backend success");
    assertEqual(updatedTx1.canonicalStatus, "CONFIRMED", "Canonical status updated to CONFIRMED");
    assertEqual(updatedTx1.isCompleted, true, "isCompleted is true");

    // -------------------------------------------------------------------------
    // SECTION 8: PRODUCTION FAILURE LEAVES TRANSACTIONS PENDING
    // -------------------------------------------------------------------------
    console.log("\n--- Section 8: Production failure leaves transaction pending ---");
    setDemoMode(false);

    // Case 8A: Backend returns error (e.g. offline / Unable to connect)
    ApiClient.post = async () => ({
      error: "Unable to connect to server. Please check your network connection.",
    });

    PaymentService.transactions = [
      {
        id: "tx-p4x-prod-err",
        merchant: "Merchant Beta",
        amount: 750,
        status: "Pending",
        canonicalStatus: "PAYMENT_APP_PENDING",
        isCompleted: false,
        timestamp: "Just now",
        recipientType: "MERCHANT",
        riskLevel: "LOW",
        category: "Payment",
      },
    ];

    const failResult8A = await PaymentService.confirmTransaction(
      "tx-p4x-prod-err",
      "PAYMENT_COMPLETED"
    );

    assertEqual(failResult8A.success, false, "Confirmation fails on backend network error");
    assert(
      failResult8A.error?.includes("Unable to connect") || false,
      "Returns connection error feedback"
    );

    const tx8A = PaymentService.transactions.find((t: any) => t.id === "tx-p4x-prod-err");
    assertEqual(tx8A.canonicalStatus, "PAYMENT_APP_PENDING", "Transaction remains PAYMENT_APP_PENDING");
    assertEqual(tx8A.status, "Pending", "Transaction remains Pending");
    assertEqual(tx8A.isCompleted, false, "Transaction is NOT marked completed");

    // Case 8B: Network throws an exception
    ApiClient.post = async () => {
      throw new Error("Network request failed: ECONNREFUSED");
    };

    const failResult8B = await PaymentService.confirmTransaction(
      "tx-p4x-prod-err",
      "PAYMENT_COMPLETED"
    );

    assertEqual(failResult8B.success, false, "Confirmation fails on thrown network exception");
    assert(
      failResult8B.error?.includes("Network request failed") || false,
      "Returns thrown exception message"
    );

    const tx8B = PaymentService.transactions.find((t: any) => t.id === "tx-p4x-prod-err");
    assertEqual(tx8B.canonicalStatus, "PAYMENT_APP_PENDING", "Transaction remains PAYMENT_APP_PENDING after thrown error");
    assertEqual(tx8B.isCompleted, false, "Transaction remains incomplete");

    // -------------------------------------------------------------------------
    // SECTION 9: DEMO CONFIRMATION BEHAVIOR REMAINS INTACT
    // -------------------------------------------------------------------------
    console.log("\n--- Section 9: Demo confirmation behavior remains intact ---");
    setDemoMode(true);

    let demoBackendCalled = false;
    ApiClient.post = async () => {
      demoBackendCalled = true;
      return { error: "Should not be called in demo mode" };
    };

    PaymentService.transactions = [
      {
        id: "tx-p4x-demo-1",
        merchant: "Demo Merchant",
        amount: 200,
        status: "Pending",
        canonicalStatus: "PAYMENT_APP_PENDING",
        isCompleted: false,
        timestamp: "Just now",
        recipientType: "MERCHANT",
        riskLevel: "LOW",
        category: "Payment",
      },
    ];

    const demoConfirmResult = await PaymentService.confirmTransaction(
      "tx-p4x-demo-1",
      "PAYMENT_COMPLETED"
    );

    assertEqual(demoConfirmResult.success, true, "Demo confirmation succeeds locally");
    assertEqual(demoBackendCalled, false, "Backend API was NOT called in demo mode");

    const demoTx = PaymentService.transactions.find((t: any) => t.id === "tx-p4x-demo-1");
    assertEqual(demoTx.status, "Completed", "Demo transaction status updated to Completed");
    assertEqual(demoTx.canonicalStatus, "CONFIRMED", "Demo transaction canonicalStatus updated to CONFIRMED");
    assertEqual(demoTx.isCompleted, true, "Demo transaction isCompleted is true");

    // Restore ApiClient.post
    ApiClient.post = originalPost;

  } finally {
    // Restore initial environment and state
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
  console.log(`PART 4X REGRESSION SUITE TOTALS: ${totalChecks} checks, ${failures} failures`);
  console.log("=================================================================");

  if (failures > 0) {
    process.exit(1);
  }
}

runDemoModeConfigurationHardeningSuite().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
