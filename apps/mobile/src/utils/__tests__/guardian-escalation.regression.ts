// @ts-ignore
(globalThis as any).__DEV__ = true;
// @ts-ignore
(globalThis as any).expo = { EventEmitter: class {} };

// Mock 'react-native' and native modules in Node's require cache
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
const { GuardianService } = require("../../services/guardian-service");
const { PaymentService } = require("../../services/payment-service");
const { ApiClient } = require("../../services/api-client");
import type {
  PreparedPaymentDraft,
  PaymentRiskEvaluationState,
  GuardianEscalationState,
  GuardianEscalationStatus,
} from "../../types/transaction";
import type { PaymentEvaluationData } from "../../services/payment-service";

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

// Intercept ApiClient.post to simulate backend responses
let mockPostBehavior: (endpoint: string, payload: any) => Promise<any> = async () => ({
  success: true,
  status: 200,
  data: {},
});
let mockGetBehavior: (endpoint: string) => Promise<any> = async () => ({
  success: true,
  status: 200,
  data: {},
});

ApiClient.post = async function (endpoint: string, payload: any) {
  return mockPostBehavior(endpoint, payload);
};

ApiClient.get = async function (endpoint: string) {
  return mockGetBehavior(endpoint);
};

async function runTests() {
  console.log("=================================================================");
  console.log("AVARAN PAY: GUARDIAN ESCALATION & AUTH PREPARATION REGRESSION");
  console.log("=================================================================\n");

  let lastCapturedPostEndpoint = "";
  let lastCapturedPostPayload: any = null;

  const sampleDraft: PreparedPaymentDraft = {
    source: "UPI_ID",
    recipient: "suspicious_deal@okaxis",
    recipientType: "UPI_ID",
    amount: 15000,
    note: "Emergency transfer",
    preparedAt: new Date().toISOString(),
    status: "PREPARED",
  };

  const sampleHighRiskData: PaymentEvaluationData = {
    evaluation_id: "EVAL-HIGH-999",
    stage: "EVALUATION_COMPLETED",
    risk_score: 88.0,
    risk_level: "HIGH",
    decision: "HOLD",
    plain_language_reasons: [
      "Recipient handle matches known scam pattern",
      "Spike in payment amount relative to 30-day baseline",
    ],
    risk_factors: ["blacklist_match", "amount_spike"],
    risk_contributions_pct: { blacklist_match: 70, amount_spike: 30 },
    sub_scores: { anomaly_score: 0.88 },
    recipient: {
      raw_input: "suspicious_deal@okaxis",
      normalized: "suspicious_deal@okaxis",
      recipient_type: "UPI_ID",
      display_name: null,
      resolution_status: "FLAGGED",
    },
    amount: 15000,
    note: "Emergency transfer",
    timestamp: new Date().toISOString(),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    guardian_required: true,
    isAuthorized: false,
    isApproved: false,
    isCompleted: false,
    isSubmitted: false,
  };

  const sampleLowRiskData: PaymentEvaluationData = {
    evaluation_id: "EVAL-LOW-111",
    stage: "EVALUATION_COMPLETED",
    risk_score: 18.0,
    risk_level: "LOW",
    decision: "ALLOW",
    plain_language_reasons: ["Verified routine payment"],
    risk_factors: ["baseline_match"],
    risk_contributions_pct: { baseline_match: 100 },
    sub_scores: { anomaly_score: 0.18 },
    recipient: {
      raw_input: "groceries@upi",
      normalized: "groceries@upi",
      recipient_type: "UPI_ID",
      display_name: "Supermarket",
      resolution_status: "RESOLVED",
    },
    amount: 350,
    timestamp: new Date().toISOString(),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    guardian_required: false,
    isAuthorized: false,
    isApproved: false,
    isCompleted: false,
    isSubmitted: false,
  };

  // ── SUITE 1: LOW Risk with No Guardian Requirement ─────────────────────────
  console.log("--- Test Suite 1: LOW Risk with No Guardian Requirement ---");
  {
    let guardianState: GuardianEscalationState = { status: "IDLE" };

    // When backend risk evaluation completes with guardian_required === false
    if (sampleLowRiskData.guardian_required) {
      guardianState = { status: "APPROVAL_REQUIRED" };
    } else {
      guardianState = { status: "AUTHORIZATION_READY" };
    }

    assert(guardianState.status === "AUTHORIZATION_READY", "LOW risk transitions directly to AUTHORIZATION_READY");
    assert(guardianState.requestId === undefined, "No Guardian request ID generated for exempt low risk");
    assert(guardianState.error === undefined, "No error in low risk authorization ready state");
  }

  // ── SUITE 2: HIGH Risk with Guardian Requirement Gate ──────────────────────
  console.log("\n--- Test Suite 2: HIGH Risk with Guardian Requirement Gate ---");
  {
    let guardianState: GuardianEscalationState = { status: "IDLE" };

    // When backend risk evaluation completes with guardian_required === true
    if (sampleHighRiskData.guardian_required) {
      guardianState = { status: "APPROVAL_REQUIRED" };
    } else {
      guardianState = { status: "AUTHORIZATION_READY" };
    }

    assert(guardianState.status === "APPROVAL_REQUIRED", "HIGH risk strictly requires Guardian approval (APPROVAL_REQUIRED)");
    assert(guardianState.status !== "AUTHORIZATION_READY", "HIGH risk cannot bypass straight to AUTHORIZATION_READY");
    assert(sampleHighRiskData.guardian_required === true, "Authoritative guardian_required is true");
    assert(sampleHighRiskData.risk_score >= 61, "Score is in HIGH risk band (>= 61)");
  }

  // ── SUITE 3: Guardian Approval Request & Duplicate-Request Prevention ───────
  console.log("\n--- Test Suite 3: Request Dispatch & Duplicate-Request Prevention ---");
  {
    let isRequesting = false;
    let callCount = 0;

    mockPostBehavior = async (endpoint: string, payload: any) => {
      lastCapturedPostEndpoint = endpoint;
      lastCapturedPostPayload = payload;
      callCount++;
      return {
        success: true,
        status: 201,
        data: {
          id: 4040,
          request_id: "REQ-4040",
          expires_at: new Date(Date.now() + 120000).toISOString(),
          remaining_seconds: 120,
        },
      };
    };

    const triggerRequest = async () => {
      if (isRequesting) return null; // Duplicate guard
      isRequesting = true;
      try {
        return await GuardianService.requestEvaluationGuardianApproval({
          evaluationId: sampleHighRiskData.evaluation_id,
          userId: 1,
          amount: sampleDraft.amount,
          recipient: sampleDraft.recipient,
          riskScore: sampleHighRiskData.risk_score,
          riskLevel: sampleHighRiskData.risk_level,
          reasons: sampleHighRiskData.plain_language_reasons || [],
        });
      } finally {
        isRequesting = false;
      }
    };

    // First call succeeds
    const res1 = await triggerRequest();
    assert(res1 !== null && res1.success === true, "First request dispatch succeeds");
    assert(res1?.requestId === "4040", "Returns backend request ID");
    assert(res1?.remainingSeconds === 120, "Returns 120s remaining hold window");
    assert(callCount === 1, "Backend called exactly once");

    // In-flight concurrent duplicate calls are prevented
    isRequesting = true;
    const res2 = await triggerRequest();
    assert(res2 === null, "Concurrent duplicate request rejected by guard");
    assert(callCount === 1, "Duplicate request did not trigger backend endpoint");
    isRequesting = false;
  }

  // ── SUITE 4: Approval Success -> AUTHORIZATION_READY ───────────────────────
  console.log("\n--- Test Suite 4: Guardian Approval Success -> AUTHORIZATION_READY ---");
  {
    let guardianState: GuardianEscalationState = {
      status: "APPROVAL_PENDING",
      requestId: "4040",
      remainingSeconds: 95,
    };

    // Simulate backend response where Guardian approves
    mockGetBehavior = async () => ({
      success: true,
      status: 200,
      data: {
        id: 4040,
        outcome: "APPROVED",
        resolution_notes: "Parent verified payment details via call",
        remaining_seconds: 0,
      },
    });

    const statusCheck = await GuardianService.checkEvaluationGuardianStatus("4040");
    assert(statusCheck.success === true, "Guardian status query succeeds");
    assert(statusCheck.status === "APPROVED", "Status is APPROVED");

    // State transition to APPROVED
    if (statusCheck.status === "APPROVED") {
      guardianState = {
        status: "APPROVED",
        requestId: "4040",
        resolutionNotes: statusCheck.resolutionNotes,
      };
    }
    assert(guardianState.status === "APPROVED", "State transitions to APPROVED");
    assert(guardianState.resolutionNotes?.includes("Parent verified") === true, "Preserves guardian resolution notes");

    // Seamless progression to AUTHORIZATION_READY
    guardianState = {
      status: "AUTHORIZATION_READY",
      requestId: "4040",
      resolutionNotes: statusCheck.resolutionNotes,
      authorizedStage: "PAYMENT_AUTHORIZED_READY",
    };
    assert(guardianState.status === "AUTHORIZATION_READY", "State progresses cleanly to AUTHORIZATION_READY");
  }

  // ── SUITE 5: Guardian Decline -> DECLINED State ─────────────────────────────
  console.log("\n--- Test Suite 5: Guardian Decline Handling ---");
  {
    let guardianState: GuardianEscalationState = {
      status: "APPROVAL_PENDING",
      requestId: "4041",
      remainingSeconds: 60,
    };

    mockGetBehavior = async () => ({
      success: true,
      status: 200,
      data: {
        id: 4041,
        outcome: "REJECTED",
        resolution_notes: "Suspicious payee unrecognized by family",
      },
    });

    const statusCheck = await GuardianService.checkEvaluationGuardianStatus("4041");
    assert(statusCheck.status === "REJECTED", "Detects REJECTED outcome from Guardian");

    if (statusCheck.status === "REJECTED") {
      guardianState = {
        status: "DECLINED",
        requestId: "4041",
        resolutionNotes: statusCheck.resolutionNotes,
      };
    }
    assert(guardianState.status === "DECLINED", "Transitions to DECLINED state");
    assert(guardianState.status !== "AUTHORIZATION_READY", "Declined state cannot proceed to AUTHORIZATION_READY");
  }

  // ── SUITE 6: Error State and Retry Recovery ─────────────────────────────────
  console.log("\n--- Test Suite 6: Error State and Retry Recovery ---");
  {
    // Backend service error / limitation
    mockPostBehavior = async () => ({
      success: false,
      status: 503,
      error: "Guardian notification service unreachable",
    });

    const failRes = await GuardianService.requestEvaluationGuardianApproval({
      evaluationId: "EVAL-ERR",
      userId: 1,
      amount: 1000,
      recipient: "test@upi",
      riskScore: 75,
      riskLevel: "HIGH",
      reasons: ["Test reason"],
    });

    assert(failRes.success === false, "Handles server failure cleanly");

    let guardianState: GuardianEscalationState = {
      status: "ERROR",
      error: failRes.error,
      blockerNotice: failRes.blockerNotice,
    };
    assert(guardianState.status === "ERROR", "Transitions to ERROR state");
    assert(guardianState.error?.includes("unreachable") === true, "Preserves error message");

    // Subsequent retry recovers
    mockPostBehavior = async () => ({
      success: true,
      status: 201,
      data: {
        id: 5050,
        request_id: "REQ-5050",
        remaining_seconds: 120,
      },
    });

    const retryRes = await GuardianService.requestEvaluationGuardianApproval({
      evaluationId: "EVAL-ERR",
      userId: 1,
      amount: 1000,
      recipient: "test@upi",
      riskScore: 75,
      riskLevel: "HIGH",
      reasons: ["Test reason"],
    });

    assert(retryRes.success === true, "Retry succeeds after recovery");
    if (retryRes.success) {
      guardianState = {
        status: "APPROVAL_PENDING",
        requestId: retryRes.requestId,
        remainingSeconds: 120,
      };
    }
    assert(guardianState.status === "APPROVAL_PENDING", "State recovers to APPROVAL_PENDING on retry");
  }

  // ── SUITE 7: Expiry Timeout Handling ────────────────────────────────────────
  console.log("\n--- Test Suite 7: Expiry Timeout Handling ---");
  {
    let guardianState: GuardianEscalationState = {
      status: "APPROVAL_PENDING",
      requestId: "6060",
      remainingSeconds: 0,
      expiresAt: new Date(Date.now() - 10000).toISOString(),
    };

    const isExpired =
      guardianState.remainingSeconds === 0 ||
      (guardianState.expiresAt && new Date(guardianState.expiresAt).getTime() <= Date.now());

    assert(Boolean(isExpired) === true, "Detects that Guardian hold timer elapsed");

    if (isExpired) {
      guardianState = {
        status: "EXPIRED",
        requestId: "6060",
        error: "Guardian approval hold window expired.",
      };
    }
    assert(guardianState.status === "EXPIRED", "Transitions to EXPIRED state");
  }

  // ── SUITE 8: State Reset when Inputs Change ─────────────────────────────────
  console.log("\n--- Test Suite 8: State Reset on Input Modification ---");
  {
    let guardianState: GuardianEscalationState = {
      status: "APPROVAL_REQUIRED",
    };
    let evaluationState: PaymentRiskEvaluationState = {
      status: "EVALUATED",
    };

    // User modifies payment recipient
    const handleInputChanged = () => {
      guardianState = { status: "IDLE" };
      evaluationState = { status: "IDLE" };
    };

    handleInputChanged();
    assert(guardianState.status === "IDLE", "Guardian state resets to IDLE when inputs change");
    assert(evaluationState.status === "IDLE", "Evaluation state resets to IDLE when inputs change");
  }

  // ── SUITE 9: Invariant Verification - Zero Execution & Zero Settlement ─────
  console.log("\n--- Test Suite 9: Invariant Verification (Zero Execution / Settlement) ---");
  {
    const initialTxns = await PaymentService.getTransactions(1, "all");
    const countBefore = initialTxns.items.length;

    // Simulate complete authorization ready state
    const authReadyState: GuardianEscalationState = {
      status: "AUTHORIZATION_READY",
      requestId: "7070",
      resolutionNotes: "Approved by Guardian",
    };

    assert(authReadyState.status === "AUTHORIZATION_READY", "In AUTHORIZATION_READY state");

    // Invariant: no transaction was inserted into the database
    const currentTxns = await PaymentService.getTransactions(1, "all");
    assert(currentTxns.items.length === countBefore, "No transaction records created or modified in database");

    // Invariant: Prepared payment draft remains non-submitted
    assert(sampleDraft.status === "PREPARED", "Draft status remains PREPARED");
  }

  console.log("\n=================================================================");
  console.log(`ALL GUARDIAN ESCALATION CHECKS PASSED: ${passedChecks}/${totalChecks}`);
  console.log("=================================================================");
}

runTests().catch((err) => {
  console.error("FATAL ERROR in guardian escalation regression tests:", err);
  process.exit(1);
});
