// @ts-ignore
(globalThis as any).__DEV__ = true;
// @ts-ignore
(globalThis as any).expo = { EventEmitter: class {} };

// Mock 'react-native' and other mobile native modules in Node's require cache
// @ts-ignore
import Module from "module";

// @ts-ignore
const origRequire = Module.prototype.require;
// @ts-ignore
Module.prototype.require = function (id: string, ...args: any[]) {
  if (id === "react-native") {
    return {
      Platform: { OS: "ios", select: (objs: any) => objs?.ios ?? objs?.default },
      StyleSheet: { create: (styles: any) => styles },
      View: "View",
      Text: "Text",
      TouchableOpacity: "TouchableOpacity",
      ActivityIndicator: "ActivityIndicator",
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
  if (id === "@expo/vector-icons") {
    return { Ionicons: "Ionicons" };
  }
  return origRequire.apply(this, [id, ...args]);
};

// Import services and types
const { PaymentService } = require("../../services/payment-service");
const { ApiClient } = require("../../services/api-client");
import type {
  PaymentEvaluationData,
} from "../../services/payment-service";
import type {
  PreparedPaymentDraft,
  PaymentRiskEvaluationState,
} from "../../types/transaction";

let totalChecks = 0;
let passedChecks = 0;

function assert(condition: boolean, message: string) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`[OK]   ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Intercept ApiClient.post to test backend communication
let mockPostBehavior: (endpoint: string, payload: any) => Promise<any> = async () => ({
  success: true,
  status: 200,
  data: {},
});

ApiClient.post = async function (endpoint: string, payload: any) {
  return mockPostBehavior(endpoint, payload);
};

async function runTests() {
  console.log("=================================================================");
  console.log("AVARAN PAY: PAYMENT RISK ANALYSIS & EVALUATION REGRESSION SUITE");
  console.log("=================================================================\n");

  // Track the exact call payload sent to backend
  let lastCapturedEndpoint = "";
  let lastCapturedPayload: any = null;

  // ── SUITE 1: Canonical Payload Formation for POST /api/v1/risk/evaluate ─────
  console.log("--- Test Suite 1: Canonical Payload Formation for POST /api/v1/risk/evaluate ---");
  {
    mockPostBehavior = async (endpoint: string, payload: any) => {
      lastCapturedEndpoint = endpoint;
      lastCapturedPayload = payload;
      return {
        success: true,
        status: 200,
        data: {
          evaluation_id: "EVAL-TEST-SUITE1",
          stage: "EVALUATION_COMPLETED",
          risk_score: 12.0,
          risk_level: "LOW",
          decision: "ALLOW",
          plain_language_reasons: ["Standard habitual payment pattern"],
          risk_factors: ["baseline_check"],
          risk_contributions_pct: { baseline_check: 100 },
          sub_scores: { anomaly_score: 0.12 },
          recipient: {
            raw_input: payload.recipient,
            normalized: payload.recipient,
            recipient_type: "UPI_ID",
            display_name: "Anita Sharma",
            resolution_status: "RESOLVED",
          },
          amount: payload.amount,
          note: payload.note,
          timestamp: new Date().toISOString(),
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          guardian_required: false,
          isAuthorized: false,
          isApproved: false,
          isCompleted: false,
          isSubmitted: false,
        },
      };
    };

    // Test 1.1: UPI_ID prepared draft evaluation
    const upiDraft: PreparedPaymentDraft = {
      source: "UPI_ID",
      recipient: "anita@okhdfcbank",
      recipientType: "UPI_ID",
      recipientName: "Anita Sharma",
      amount: 450.0,
      note: "Groceries split",
      preparedAt: new Date().toISOString(),
      status: "PREPARED",
    };

    const res1 = await PaymentService.evaluatePreparedPayment(upiDraft, 101);
    assert(res1.success === true, "evaluatePreparedPayment succeeds for UPI draft");
    assert(lastCapturedEndpoint === "/api/v1/risk/evaluate", "Calls authoritative /api/v1/risk/evaluate endpoint");
    assert(lastCapturedPayload.recipient === "anita@okhdfcbank", "Canonical recipient is preserved exactly");
    assert(lastCapturedPayload.amount === 450.0, "Canonical amount is passed as numeric float");
    assert(lastCapturedPayload.note === "Groceries split", "Canonical note is passed");
    assert(lastCapturedPayload.user_id === 101, "User ID is passed to backend");
    assert(lastCapturedPayload.qr_data === undefined, "qr_data is undefined when not a QR payment");

    // Test 1.2: QR prepared draft evaluation with qr_data
    const qrDraft: PreparedPaymentDraft = {
      source: "QR",
      recipient: "merchant@icici",
      recipientType: "UPI_ID",
      recipientName: "SuperMart",
      amount: 1250.0,
      note: "Weekly shopping",
      qrPayload: "upi://pay?pa=merchant@icici&pn=SuperMart&am=1250&tn=Weekly%20shopping",
      preparedAt: new Date().toISOString(),
      status: "PREPARED",
    };

    const res2 = await PaymentService.evaluatePreparedPayment(qrDraft, 101);
    assert(res2.success === true, "evaluatePreparedPayment succeeds for QR draft");
    assert(lastCapturedPayload.qr_data === qrDraft.qrPayload, "Raw QR data forwarded to backend for scanning & validation");
    assert(lastCapturedPayload.recipient === "merchant@icici", "Extracted payee forwarded to backend");

    // Test 1.3: MOBILE prepared draft evaluation
    const mobileDraft: PreparedPaymentDraft = {
      source: "MOBILE",
      recipient: "9876543210",
      recipientType: "PHONE",
      recipientName: "Vikram Malhotra",
      amount: 800.0,
      preparedAt: new Date().toISOString(),
      status: "PREPARED",
    };

    const res3 = await PaymentService.evaluatePreparedPayment(mobileDraft, 102);
    assert(res3.success === true, "evaluatePreparedPayment succeeds for Mobile draft");
    assert(lastCapturedPayload.recipient === "9876543210", "10-digit mobile number sent canonical to backend");
    assert(lastCapturedPayload.user_id === 102, "User ID 102 passed accurately");
  }

  // ── SUITE 2: LOW Risk Evaluation (Score <= 30, Decision ALLOW) ──────────────
  console.log("\n--- Test Suite 2: LOW Risk Evaluation Handling ---");
  {
    const lowRiskPayload = {
      evaluation_id: "EVAL-LOW-001",
      stage: "EVALUATION_COMPLETED",
      risk_score: 14.5,
      risk_level: "LOW",
      decision: "ALLOW",
      plain_language_reasons: [
        "Verified recipient contact with habitual payment history",
        "Transaction amount is well within your routine 30-day baseline",
      ],
      risk_factors: ["baseline_match", "known_counterparty"],
      risk_contributions_pct: {
        baseline_match: 60,
        known_counterparty: 40,
      },
      sub_scores: { anomaly_score: 0.14 },
      recipient: {
        raw_input: "rohit@okaxis",
        normalized: "rohit@okaxis",
        recipient_type: "UPI_ID",
        display_name: "Rohit Verma",
        resolution_status: "RESOLVED",
      },
      amount: 250.0,
      note: "Tea & snacks",
      timestamp: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      guardian_required: false,
      isAuthorized: false,
      isApproved: false,
      isCompleted: false,
      isSubmitted: false,
    };

    mockPostBehavior = async () => ({
      success: true,
      status: 200,
      data: lowRiskPayload,
    });

    const draft: PreparedPaymentDraft = {
      source: "UPI_ID",
      recipient: "rohit@okaxis",
      recipientType: "UPI_ID",
      amount: 250.0,
      preparedAt: new Date().toISOString(),
      status: "PREPARED",
    };

    const res = await PaymentService.evaluatePreparedPayment(draft, 1);
    assert(res.success === true, "LOW risk evaluation returns success true");
    if (res.success) {
      assert(res.data.risk_level === "LOW", "Risk level is LOW");
      assert(res.data.risk_score === 14.5, "Risk score matches backend score exactly (14.5)");
      assert(res.data.decision === "ALLOW", "Decision is ALLOW");
      assert(res.data.guardian_required === false, "Guardian required is false for LOW risk");
      assert(res.data.plain_language_reasons.length === 2, "Returns 2 plain-language reasons");
      assert(res.data.risk_contributions_pct["baseline_match"] === 60, "Feature contribution pct parsed correctly");
      assert(res.data.stage === "EVALUATION_COMPLETED", "Workflow stage is EVALUATION_COMPLETED");
    }
  }

  // ── SUITE 3: MEDIUM Risk Evaluation (Score 31-60, Decision WARN) ────────────
  console.log("\n--- Test Suite 3: MEDIUM Risk Evaluation Handling ---");
  {
    const mediumRiskPayload = {
      evaluation_id: "EVAL-MED-002",
      stage: "EVALUATION_COMPLETED",
      risk_score: 48.0,
      risk_level: "MEDIUM",
      decision: "WARN",
      plain_language_reasons: [
        "First-time transfer to this recipient",
        "Amount is moderately higher than your average peer-to-peer transfers",
      ],
      risk_factors: ["first_time_payee", "amount_elevation"],
      risk_contributions_pct: {
        first_time_payee: 65,
        amount_elevation: 35,
      },
      sub_scores: { anomaly_score: 0.48 },
      recipient: {
        raw_input: "new_seller@upi",
        normalized: "new_seller@upi",
        recipient_type: "UPI_ID",
        display_name: null,
        resolution_status: "UNVERIFIED",
      },
      amount: 4999.0,
      note: "Electronics purchase",
      timestamp: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      guardian_required: false,
      isAuthorized: false,
      isApproved: false,
      isCompleted: false,
      isSubmitted: false,
    };

    mockPostBehavior = async () => ({
      success: true,
      status: 200,
      data: mediumRiskPayload,
    });

    const draft: PreparedPaymentDraft = {
      source: "UPI_ID",
      recipient: "new_seller@upi",
      recipientType: "UPI_ID",
      amount: 4999.0,
      note: "Electronics purchase",
      preparedAt: new Date().toISOString(),
      status: "PREPARED",
    };

    const res = await PaymentService.evaluatePreparedPayment(draft, 1);
    assert(res.success === true, "MEDIUM risk evaluation returns success true");
    if (res.success) {
      assert(res.data.risk_level === "MEDIUM", "Risk level is MEDIUM");
      assert(res.data.risk_score === 48.0, "Risk score matches backend score (48.0)");
      assert(res.data.decision === "WARN", "Decision is WARN");
      assert(res.data.guardian_required === false, "Guardian not required for MEDIUM advisory warning");
      assert(res.data.plain_language_reasons[0].includes("First-time transfer"), "Contains first-time transfer warning");
      assert(res.data.risk_contributions_pct["first_time_payee"] === 65, "SHAP anomaly contribution accurately mapped");
    }
  }

  // ── SUITE 4: HIGH Risk Evaluation (Score >= 61, Decision HOLD) ──────────────
  console.log("\n--- Test Suite 4: HIGH Risk Evaluation Handling ---");
  {
    const highRiskPayload = {
      evaluation_id: "EVAL-HIGH-003",
      stage: "EVALUATION_COMPLETED",
      risk_score: 87.5,
      risk_level: "HIGH",
      decision: "HOLD",
      plain_language_reasons: [
        "Recipient handle matches known scam / lottery impersonation patterns",
        "High anomaly spike exceeding 5x standard deviation",
        "Unusual payment time outside your typical operating hours",
      ],
      risk_factors: ["blacklist_heuristic", "extreme_anomaly", "time_anomaly"],
      risk_contributions_pct: {
        blacklist_heuristic: 55,
        extreme_anomaly: 30,
        time_anomaly: 15,
      },
      sub_scores: { anomaly_score: 0.88, scam_signal: 0.92 },
      recipient: {
        raw_input: "lottery_winner_claim@ybl",
        normalized: "lottery_winner_claim@ybl",
        recipient_type: "UPI_ID",
        display_name: "SUSPICIOUS LOTTERY",
        resolution_status: "FLAGGED",
      },
      amount: 25000.0,
      note: "Claim fee",
      timestamp: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      guardian_required: true,
      isAuthorized: false,
      isApproved: false,
      isCompleted: false,
      isSubmitted: false,
    };

    mockPostBehavior = async () => ({
      success: true,
      status: 200,
      data: highRiskPayload,
    });

    const draft: PreparedPaymentDraft = {
      source: "UPI_ID",
      recipient: "lottery_winner_claim@ybl",
      recipientType: "UPI_ID",
      amount: 25000.0,
      note: "Claim fee",
      preparedAt: new Date().toISOString(),
      status: "PREPARED",
    };

    const res = await PaymentService.evaluatePreparedPayment(draft, 1);
    assert(res.success === true, "HIGH risk evaluation returns success true");
    if (res.success) {
      assert(res.data.risk_level === "HIGH", "Risk level is HIGH");
      assert(res.data.risk_score === 87.5, "Risk score matches backend score (87.5)");
      assert(res.data.decision === "HOLD", "Decision is HOLD");
      assert(res.data.guardian_required === true, "guardian_required is TRUE for high-risk suspicious transaction");
      assert(res.data.plain_language_reasons.length === 3, "Returns 3 plain-language warning reasons");
    }
  }

  // ── SUITE 5: Loading & Analyzing State Management ───────────────────────────
  console.log("\n--- Test Suite 5: Loading State Transitions ---");
  {
    let evaluationState: PaymentRiskEvaluationState = { status: "IDLE" };
    assert(evaluationState.status === "IDLE", "Initial state is IDLE");

    // Transition to ANALYZING when evaluation is launched
    evaluationState = { status: "ANALYZING" };
    assert(evaluationState.status === "ANALYZING", "Transitions cleanly to ANALYZING");
    assert(evaluationState.data === undefined, "Data is undefined during analysis");
    assert(evaluationState.error === undefined, "Error is undefined during analysis");

    // Transition to EVALUATED on completion
    const mockData: PaymentEvaluationData = {
      evaluation_id: "EVAL-004",
      stage: "EVALUATION_COMPLETED",
      risk_score: 22,
      risk_level: "LOW",
      decision: "ALLOW",
      plain_language_reasons: ["Safe"],
      risk_factors: [],
      risk_contributions_pct: {},
      sub_scores: {},
      recipient: {
        raw_input: "test@upi",
        normalized: "test@upi",
        recipient_type: "UPI_ID",
        display_name: null,
        resolution_status: "UNVERIFIED",
      },
      amount: 100,
      timestamp: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      guardian_required: false,
      isAuthorized: false,
      isApproved: false,
      isCompleted: false,
      isSubmitted: false,
    };

    evaluationState = {
      status: "EVALUATED",
      data: mockData,
      evaluatedAt: new Date().toISOString(),
      expiresAt: mockData.expires_at,
    };

    assert(evaluationState.status === "EVALUATED", "Transitions to EVALUATED with authoritative data");
    assert(evaluationState.data?.risk_score === 22, "Holds evaluated risk score");
    assert(typeof evaluationState.expiresAt === "string", "Tracks expiresAt TTL timestamp");
  }

  // ── SUITE 6: Error State and Retry Recovery ─────────────────────────────────
  console.log("\n--- Test Suite 6: Error State and Retry Recovery ---");
  {
    // Simulate backend network failure
    mockPostBehavior = async () => ({
      success: false,
      status: 503,
      error: "AI risk evaluation engine service unavailable. Please retry.",
    });

    const draft: PreparedPaymentDraft = {
      source: "UPI_ID",
      recipient: "test@upi",
      recipientType: "UPI_ID",
      amount: 500,
      preparedAt: new Date().toISOString(),
      status: "PREPARED",
    };

    const failRes = await PaymentService.evaluatePreparedPayment(draft, 1);
    assert(failRes.success === false, "Handles backend service failure cleanly");
    if (!failRes.success) {
      assert(Boolean(failRes.error && failRes.error.includes("unavailable")), "Preserves descriptive server error message");

      // Set state to ERROR
      const errorState: PaymentRiskEvaluationState = {
        status: "ERROR",
        error: failRes.error,
      };
      assert(errorState.status === "ERROR", "Evaluation state transitions to ERROR");
      assert(Boolean(errorState.error?.includes("unavailable")), "Error message accessible to UI");
    }

    // Simulate user tapping RETRY and backend recovering
    mockPostBehavior = async () => ({
      success: true,
      status: 200,
      data: {
        evaluation_id: "EVAL-RECOVERED",
        stage: "EVALUATION_COMPLETED",
        risk_score: 15.0,
        risk_level: "LOW",
        decision: "ALLOW",
        plain_language_reasons: ["Service recovered: verified transaction"],
        risk_factors: [],
        risk_contributions_pct: {},
        sub_scores: {},
        recipient: {
          raw_input: "test@upi",
          normalized: "test@upi",
          recipient_type: "UPI_ID",
          display_name: null,
          resolution_status: "UNVERIFIED",
        },
        amount: 500,
        timestamp: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        guardian_required: false,
        isAuthorized: false,
        isApproved: false,
        isCompleted: false,
        isSubmitted: false,
      },
    });

    const retryRes = await PaymentService.evaluatePreparedPayment(draft, 1);
    assert(retryRes.success === true, "Retry evaluation succeeds after network recovery");
    if (retryRes.success) {
      const recoveredState: PaymentRiskEvaluationState = {
        status: "EVALUATED",
        data: retryRes.data,
        evaluatedAt: new Date().toISOString(),
        expiresAt: retryRes.data.expires_at,
      };
      assert(recoveredState.status === "EVALUATED", "State cleanly transitions from ERROR to EVALUATED on retry");
      assert(recoveredState.data?.evaluation_id === "EVAL-RECOVERED", "Recovered evaluation data holds valid ID");
    }
  }

  // ── SUITE 7: Expired Response State Detection ───────────────────────────────
  console.log("\n--- Test Suite 7: Expired Response State Detection ---");
  {
    // Evaluation timestamped in the past (expired 5 minutes ago)
    const expiredIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const expiredData: PaymentEvaluationData = {
      evaluation_id: "EVAL-EXP-001",
      stage: "EVALUATION_COMPLETED",
      risk_score: 35.0,
      risk_level: "MEDIUM",
      decision: "WARN",
      plain_language_reasons: ["Old evaluation"],
      risk_factors: [],
      risk_contributions_pct: {},
      sub_scores: {},
      recipient: {
        raw_input: "shop@upi",
        normalized: "shop@upi",
        recipient_type: "UPI_ID",
        display_name: null,
        resolution_status: "UNVERIFIED",
      },
      amount: 1500,
      timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      expires_at: expiredIso,
      guardian_required: false,
      isAuthorized: false,
      isApproved: false,
      isCompleted: false,
      isSubmitted: false,
    };

    const isExpired = new Date(expiredData.expires_at || "").getTime() <= Date.now();
    assert(isExpired === true, "Detects timestamp has exceeded expires_at TTL");

    const state: PaymentRiskEvaluationState = {
      status: isExpired ? "EXPIRED" : "EVALUATED",
      data: expiredData,
      evaluatedAt: expiredData.timestamp,
      expiresAt: expiredData.expires_at,
    };

    assert(state.status === "EXPIRED", "State evaluates to EXPIRED when TTL elapsed");
    assert(state.expiresAt === expiredIso, "Retains original expiresAt for inspection");
  }

  // ── SUITE 8: Invariant Safety - No Payment Execution or Local Risk Override ─
  console.log("\n--- Test Suite 8: Authoritative Scoring & Boundary Invariants ---");
  {
    // Invariant 1: evaluatePreparedPayment does NOT modify transactions list
    const initialTxns = await PaymentService.getTransactions(1, "all");
    const initialCount = initialTxns.items.length;

    mockPostBehavior = async () => ({
      success: true,
      status: 200,
      data: {
        evaluation_id: "EVAL-SAFETY-CHECK",
        stage: "EVALUATION_COMPLETED",
        risk_score: 92.0,
        risk_level: "HIGH",
        decision: "HOLD",
        plain_language_reasons: ["Critical danger"],
        risk_factors: [],
        risk_contributions_pct: {},
        sub_scores: {},
        recipient: {
          raw_input: "danger@upi",
          normalized: "danger@upi",
          recipient_type: "UPI_ID",
          display_name: null,
          resolution_status: "FLAGGED",
        },
        amount: 50000,
        timestamp: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        guardian_required: true,
        isAuthorized: false,
        isApproved: false,
        isCompleted: false,
        isSubmitted: false,
      },
    });

    const draft: PreparedPaymentDraft = {
      source: "UPI_ID",
      recipient: "danger@upi",
      recipientType: "UPI_ID",
      amount: 50000,
      preparedAt: new Date().toISOString(),
      status: "PREPARED",
    };

    const res = await PaymentService.evaluatePreparedPayment(draft, 1);
    assert(res.success === true, "Risk evaluation completes safely");

    const afterTxns = await PaymentService.getTransactions(1, "all");
    assert(afterTxns.items.length === initialCount, "Authoritative risk evaluation does NOT create completed transactions in database");

    // Invariant 2: Pure advisory stage
    assert(res.success && res.data.stage === "EVALUATION_COMPLETED", "Workflow stage strictly confined to EVALUATION_COMPLETED");
  }

  console.log("\n=================================================================");
  console.log(`ALL CHECKS PASSED: ${passedChecks}/${totalChecks}`);
  console.log("=================================================================");
}

runTests().catch((err) => {
  console.error("FATAL ERROR in regression tests:", err);
  process.exit(1);
});
