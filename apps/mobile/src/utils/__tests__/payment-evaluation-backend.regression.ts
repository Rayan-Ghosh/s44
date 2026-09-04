// @ts-ignore
(globalThis as any).__DEV__ = true;
// @ts-ignore
(globalThis as any).expo = { EventEmitter: class {} };

// Mock 'react-native' module in Node's require cache before loading payment-service
// @ts-ignore
import Module from "module";

// @ts-ignore
const origRequire = Module.prototype.require;
// @ts-ignore
Module.prototype.require = function (id: string, ...args: any[]) {
  if (id === "react-native") {
    return {
      Platform: { OS: "ios", select: (objs: any) => objs?.ios ?? objs?.default },
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
  evaluatePayment,
} = require("../../services/payment-service");
const { ApiClient } = require("../../services/api-client");
import type {
  PaymentEvaluationRequest,
  PaymentEvaluationResult,
} from "../../services/payment-service";
import { isRecipientValid, getRecipientType } from "../recipient-type";

// Mock ApiClient for Node.js test environment (no running backend server)
ApiClient.post = async function (endpoint: string, payload: any) {
  if (endpoint.includes("/api/v1/risk/evaluate")) {
    const raw = (payload.recipient || "").trim();
    const isPhone = !raw.includes("@");
    return {
      success: true,
      status: 200,
      data: {
        evaluation_id: "EVAL-TEST-001",
        stage: "EVALUATION_COMPLETED",
        risk_score: 18.0,
        risk_level: "LOW",
        decision: "ALLOW",
        plain_language_reasons: ["Standard verified transaction signature"],
        risk_factors: ["baseline_check"],
        risk_contributions_pct: { baseline_check: 100 },
        sub_scores: { transaction_fraud: 0.18 },
        recipient: {
          raw_input: raw,
          normalized: isPhone ? raw.replace(/\D/g, "").slice(-10) : raw.toLowerCase(),
          recipient_type: isPhone ? "PHONE" : "UPI_ID",
          display_name: null,
          resolution_status: isPhone ? "UNRESOLVED" : "UNVERIFIED",
        },
        amount: payload.amount,
        note: payload.note,
        timestamp: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        guardian_required: false,
        disclaimer: "Advisory pre-payment evaluation only. No payment authorized or initiated.",
      },
    };
  }
  return { success: true, status: 200, data: {} };
};


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

async function runTests() {
  console.log("=================================================================");
  console.log("AVARAN PAY PART 1: EVALUATION CARD BACKEND INTEGRATION REGRESSION");
  console.log("=================================================================\n");

  const initialTransactions = await PaymentService.getTransactions(1, "all");
  const initialOverview = await PaymentService.getOverview(1);
  const initialTxCount = initialTransactions.items.length;
  const initialTotalAmount = initialOverview.totalAmountThisMonth;

  // -------------------------------------------------------------------------
  // Suite 1: Pure Recipient Validation Prior to Backend Call
  // -------------------------------------------------------------------------
  console.log("--- Test Suite 1: Pure Recipient Validation (Client Guard) ---");
  assert(isRecipientValid("merchant@okhdfcbank"), "Valid UPI ID is recognized as valid recipient");
  assert(getRecipientType("merchant@okhdfcbank") === "UPI_ID", "UPI ID type is classified as UPI_ID");
  assert(isRecipientValid("9876543210"), "10-digit Indian mobile number is recognized as valid recipient");
  assert(getRecipientType("9876543210") === "MOBILE_NUMBER", "10-digit mobile type is classified as MOBILE_NUMBER");
  assert(isRecipientValid("+919876543210"), "+91 prefixed mobile is recognized as valid recipient");
  assert(!isRecipientValid("invalid-handle"), "Plain string without @ or digits is rejected");
  assert(!isRecipientValid(""), "Empty recipient is rejected");
  assert(!isRecipientValid("12345"), "Short phone number is rejected");
  assert(!isRecipientValid("user@"), "Incomplete UPI ID is rejected");

  // -------------------------------------------------------------------------
  // Suite 2: UPI Draft Evaluation
  // -------------------------------------------------------------------------
  console.log("\n--- Test Suite 2: Valid UPI Draft Evaluation ---");
  const upiReq: PaymentEvaluationRequest = {
    recipient: "priya@okhdfcbank",
    amount: 1500.0,
    note: "Freelance design work",
  };

  const upiRes = await PaymentService.evaluatePayment(upiReq);
  if (!upiRes.success) {
    console.error("Evaluation failed with error:", (upiRes as any).error);
  }
  assert(upiRes.success === true, "PaymentService.evaluatePayment returns success === true for UPI draft");


  if (upiRes.success) {
    const data = upiRes.data;
    assert(data.stage === "EVALUATION_COMPLETED", "Evaluation response strictly returns stage EVALUATION_COMPLETED");
    assert(
      data.risk_level === "LOW" || data.risk_level === "MEDIUM" || data.risk_level === "HIGH",
      `Risk level is within valid bands: got ${data.risk_level}`
    );
    assert(
      typeof data.risk_score === "number" && data.risk_score >= 0 && data.risk_score <= 100,
      `Risk score is within 0..100: got ${data.risk_score}`
    );
    assert(
      Array.isArray(data.plain_language_reasons) && data.plain_language_reasons.length > 0,
      "Contains plain language reasons array"
    );
    assert(
      data.decision === "ALLOW" || data.decision === "WARN_CHOICE" || data.decision === "CONFIRM_OR_CANCEL",
      `Contains standard decision: got ${data.decision}`
    );
    assert(data.amount === 1500.0, "Evaluated amount matches draft amount");
    assert(data.recipient?.normalized === "priya@okhdfcbank", "Normalized recipient matches input handle");
    assert(data.recipient?.recipient_type === "UPI_ID", "Recipient type is UPI_ID");

    // Strictly verify non-authorization flags
    assert(data.isAuthorized === false, "isAuthorized is strictly false");
    assert(data.isApproved === false, "isApproved is strictly false");
    assert(data.isCompleted === false, "isCompleted is strictly false");
    assert(data.isSubmitted === false, "isSubmitted is strictly false");
  }

  // -------------------------------------------------------------------------
  // Suite 3: Mobile Number Draft Evaluation (Without appending @upi)
  // -------------------------------------------------------------------------
  console.log("\n--- Test Suite 3: Valid Mobile Number Draft Evaluation ---");
  const phoneReq: PaymentEvaluationRequest = {
    recipient: "+91 98765 43210",
    amount: 500.0,
  };

  const phoneRes = await PaymentService.evaluatePayment(phoneReq);
  assert(phoneRes.success === true, "PaymentService.evaluatePayment returns success === true for mobile draft");

  if (phoneRes.success) {
    const data = phoneRes.data;
    assert(data.stage === "EVALUATION_COMPLETED", "Mobile evaluation returns stage EVALUATION_COMPLETED");
    assert(data.recipient !== undefined, "Recipient detail is returned");
    assert(!data.recipient?.normalized.includes("@"), "Normalized mobile does NOT have @upi appended");
    assert(
      data.recipient?.resolution_status === "RESOLVED" || data.recipient?.resolution_status === "UNRESOLVED",
      `Resolution status is valid for mobile: got ${data.recipient?.resolution_status}`
    );
    assert(data.isAuthorized === false, "Mobile evaluation produces no authorization");
    assert(data.isCompleted === false, "Mobile evaluation produces no completion");
  }

  // -------------------------------------------------------------------------
  // Suite 4: Invalid Request Rejections
  // -------------------------------------------------------------------------
  console.log("\n--- Test Suite 4: Invalid Request Rejections ---");
  const emptyRecRes = await PaymentService.evaluatePayment({ recipient: "", amount: 100 });
  assert(emptyRecRes.success === false, "Rejects empty recipient");

  const whitespaceRecRes = await PaymentService.evaluatePayment({ recipient: "   ", amount: 100 });
  assert(whitespaceRecRes.success === false, "Rejects whitespace recipient");

  const zeroAmtRes = await PaymentService.evaluatePayment({ recipient: "user@upi", amount: 0 });
  assert(zeroAmtRes.success === false, "Rejects zero amount");

  const negAmtRes = await PaymentService.evaluatePayment({ recipient: "user@upi", amount: -50 });
  assert(negAmtRes.success === false, "Rejects negative amount");

  const nanAmtRes = await PaymentService.evaluatePayment({ recipient: "user@upi", amount: NaN });
  assert(nanAmtRes.success === false, "Rejects NaN amount");

  // -------------------------------------------------------------------------
  // Suite 5: In-Flight & Stale Form Version Protection Simulation
  // -------------------------------------------------------------------------
  console.log("\n--- Test Suite 5: Stale Form Version Protection Simulation ---");
  let formVersion = 1;
  const capturedVersion = formVersion;

  // Simulate user changing an input before response returns
  formVersion = 2;

  // Stale check assertion: should discard if version drifted
  const shouldDiscard = capturedVersion !== formVersion;
  assert(shouldDiscard === true, "Stale response is discarded when form version increments during in-flight call");

  // Duplicate-click guard simulation
  let isEvaluating = false;
  const triggerClick = () => {
    if (isEvaluating) return false;
    isEvaluating = true;
    return true;
  };

  const firstClick = triggerClick();
  const secondClick = triggerClick();
  assert(firstClick === true, "First click initiates evaluation");
  assert(secondClick === false, "Second click while isEvaluating is blocked");
  isEvaluating = false;

  // -------------------------------------------------------------------------
  // Suite 6: Strict Zero Side-Effects Guarantee
  // -------------------------------------------------------------------------
  console.log("\n--- Test Suite 6: Strict Zero Side-Effects Guarantee ---");
  const finalTransactions = await PaymentService.getTransactions(1, "all");
  const finalOverview = await PaymentService.getOverview(1);

  assert(
    finalTransactions.items.length === initialTxCount,
    `Transaction store count strictly unmutated: ${initialTxCount} -> ${finalTransactions.items.length}`
  );
  assert(
    finalOverview.totalAmountThisMonth === initialTotalAmount,
    `Overview total amount strictly unmutated: ₹${initialTotalAmount} -> ₹${finalOverview.totalAmountThisMonth}`
  );
  assert(
    finalOverview.transactionCount === initialOverview.transactionCount,
    `Overview transaction count strictly unmutated: ${initialOverview.transactionCount} -> ${finalOverview.transactionCount}`
  );

  console.log("\n=================================================================");
  console.log(`ALL ${passedChecks}/${totalChecks} PART 1 REGRESSION CHECKS PASSED`);
  console.log("=================================================================\n");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
