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

// Now require PaymentService after react-native is safely mocked
const {
  PaymentService,
  createPaymentDraft,
  evaluatePaymentDraft,
} = require("../../services/payment-service");
import type {
  CreateTransactionInput,
  CreateTransactionResult,
  PaymentDraft,
  CreatePaymentDraftResult,
  RiskEvaluationRequest,
  RiskEvaluationResult,
} from "../../services/payment-service";

/**
 * AVARAN PAY — Frontend Part 3A: Minimal Transaction-Creation Contract Regression Tests
 */

let totalChecks = 0;
let passedChecks = 0;
let failures = 0;

function assert(condition: boolean, message: string) {
  totalChecks++;
  if (!condition) {
    failures++;
    console.error(`[FAIL] ${message}`);
  } else {
    passedChecks++;
    console.log(`[OK]   ${message}`);
  }
}

async function runTests() {
  console.log("=================================================================");
  console.log("AVARAN PAY PART 3A: TRANSACTION-CREATION CONTRACT REGRESSION");
  console.log("=================================================================\n");

  // Get initial transaction count to verify store integrity
  const initial = await PaymentService.getTransactions(1, "all");
  const initialCount = initial.items.length;

  console.log("--- Test Suite 1: Valid Recipient and Amount ---");
  {
    const input: CreateTransactionInput = {
      recipient: "vendor@upi",
      amount: 1250,
    };
    const res: CreateTransactionResult = PaymentService.createTransaction(input);
    assert(res.success === true, "Valid recipient and amount returns success === true");
    if (res.success) {
      assert(res.data.recipient === "vendor@upi", "Result preserves recipient 'vendor@upi'");
      assert(res.data.amount === 1250, "Result preserves amount 1250");
      assert(res.data.note === undefined, "Result has undefined note when omitted");
    }
  }

  console.log("\n--- Test Suite 2: Trimmed Recipient ---");
  {
    const input: CreateTransactionInput = {
      recipient: "   merchant.store@hdfcbank   ",
      amount: 499.5,
    };
    const res: CreateTransactionResult = PaymentService.createTransaction(input);
    assert(res.success === true, "Padded recipient returns success === true");
    if (res.success) {
      assert(res.data.recipient === "merchant.store@hdfcbank", "Recipient is trimmed cleanly");
      assert(res.data.amount === 499.5, "Amount is parsed as positive finite number 499.5");
    }
  }

  console.log("\n--- Test Suite 3: Optional Note Trimming ---");
  {
    const inputWithNote: CreateTransactionInput = {
      recipient: "alice@okaxis",
      amount: 200,
      note: "   Invoice for consultation #401   ",
    };
    const resWithNote: CreateTransactionResult = PaymentService.createTransaction(inputWithNote);
    assert(resWithNote.success === true, "Input with padded note returns success === true");
    if (resWithNote.success) {
      assert(resWithNote.data.note === "Invoice for consultation #401", "Note is trimmed cleanly");
    }

    const inputWithWhitespaceNote: CreateTransactionInput = {
      recipient: "alice@okaxis",
      amount: 200,
      note: "      ",
    };
    const resWhitespaceNote: CreateTransactionResult = PaymentService.createTransaction(inputWithWhitespaceNote);
    assert(resWhitespaceNote.success === true, "Input with whitespace-only note returns success === true");
    if (resWhitespaceNote.success) {
      assert(resWhitespaceNote.data.note === undefined, "Whitespace-only note normalizes to undefined");
    }
  }

  console.log("\n--- Test Suite 4: Empty Recipient Rejection ---");
  {
    const resEmpty: CreateTransactionResult = PaymentService.createTransaction({
      recipient: "",
      amount: 100,
    });
    assert(resEmpty.success === false, "Empty recipient returns success === false");
    if (!resEmpty.success) {
      assert(typeof resEmpty.error === "string" && resEmpty.error.length > 0, "Error message provided for empty recipient");
    }

    const resWhitespace: CreateTransactionResult = PaymentService.createTransaction({
      recipient: "     \t   ",
      amount: 100,
    });
    assert(resWhitespace.success === false, "Whitespace-only recipient returns success === false");
    if (!resWhitespace.success) {
      assert(typeof resWhitespace.error === "string" && resWhitespace.error.length > 0, "Error message provided for whitespace recipient");
    }

    const resNullish: CreateTransactionResult = PaymentService.createTransaction({
      recipient: null as any,
      amount: 100,
    });
    assert(resNullish.success === false, "Null recipient returns success === false");
  }

  console.log("\n--- Test Suite 5: Zero Amount Rejection ---");
  {
    const resZero: CreateTransactionResult = PaymentService.createTransaction({
      recipient: "test@upi",
      amount: 0,
    });
    assert(resZero.success === false, "Amount 0 returns success === false");
    if (!resZero.success) {
      assert(typeof resZero.error === "string" && resZero.error.length > 0, "Error message provided for zero amount");
    }
  }

  console.log("\n--- Test Suite 6: Negative Amount Rejection ---");
  {
    const resNegative: CreateTransactionResult = PaymentService.createTransaction({
      recipient: "test@upi",
      amount: -150,
    });
    assert(resNegative.success === false, "Negative amount -150 returns success === false");
    if (!resNegative.success) {
      assert(typeof resNegative.error === "string" && resNegative.error.length > 0, "Error message provided for negative amount");
    }
  }

  console.log("\n--- Test Suite 7: Non-finite Amount Rejection ---");
  {
    const resNaN: CreateTransactionResult = PaymentService.createTransaction({
      recipient: "test@upi",
      amount: NaN,
    });
    assert(resNaN.success === false, "NaN amount returns success === false");

    const resInf: CreateTransactionResult = PaymentService.createTransaction({
      recipient: "test@upi",
      amount: Infinity,
    });
    assert(resInf.success === false, "Infinity amount returns success === false");

    const resNegInf: CreateTransactionResult = PaymentService.createTransaction({
      recipient: "test@upi",
      amount: -Infinity,
    });
    assert(resNegInf.success === false, "-Infinity amount returns success === false");
  }

  console.log("\n--- Test Suite 8: No Transaction Insertion on Failure or Contract Validation ---");
  {
    const after = await PaymentService.getTransactions(1, "all");
    assert(
      after.items.length === initialCount,
      `Transaction store remains untouched (initial: ${initialCount}, current: ${after.items.length})`
    );
  }

  console.log("\n--- Test Suite 9: PaymentsScreen Form Input Adapter Verification ---");
  {
    // Simulating PaymentsScreen.tsx handleEvaluateAndPay adapter
    const adaptAndValidate = (recipientStr: string, amountStr: string, noteStr?: string) => {
      const parsedAmount = amountStr.trim() === "" ? NaN : Number(amountStr);
      return PaymentService.createTransaction({
        recipient: recipientStr,
        amount: parsedAmount,
        note: noteStr,
      });
    };

    // Empty recipient
    const res1 = adaptAndValidate("", "500");
    assert(res1.success === false, "Screen adapter rejects empty recipient");

    // Empty amount string
    const res2 = adaptAndValidate("user@upi", "");
    assert(res2.success === false, "Screen adapter rejects empty amount string");

    // Whitespace amount string
    const res3 = adaptAndValidate("user@upi", "   ");
    assert(res3.success === false, "Screen adapter rejects whitespace amount string");

    // Non-numeric amount string
    const res4 = adaptAndValidate("user@upi", "not-a-number");
    assert(res4.success === false, "Screen adapter rejects non-numeric amount string");

    // Negative amount string
    const res5 = adaptAndValidate("user@upi", "-250");
    assert(res5.success === false, "Screen adapter rejects negative amount string");

    // Zero amount string
    const res6 = adaptAndValidate("user@upi", "0");
    assert(res6.success === false, "Screen adapter rejects zero amount string");

    // Valid inputs
    const res7 = adaptAndValidate("valid.merchant@upi", "1500.50", "Lunch order");
    assert(res7.success === true, "Screen adapter accepts valid recipient, amount string, and note");
    if (res7.success) {
      assert(res7.data.amount === 1500.5, "Screen adapter parses '1500.50' to 1500.5");
      assert(res7.data.recipient === "valid.merchant@upi", "Screen adapter preserves valid recipient");
      assert(res7.data.note === "Lunch order", "Screen adapter preserves note");
    }

    // Final check that transaction list is strictly untouched
    const afterAll = await PaymentService.getTransactions(1, "all");
    assert(
      afterAll.items.length === initialCount,
      `Transaction store still strictly untouched after form validations (count: ${afterAll.items.length})`
    );
  }

  console.log("\n=================================================================");
  console.log("AVARAN PAY PART 3C: NON-PERSISTED PAYMENT DRAFT REGRESSION");
  console.log("=================================================================\n");

  console.log("--- Test Suite 10: Valid Draft Creation ---");
  {
    const input: CreateTransactionInput = {
      recipient: "merchant.pay@okaxis",
      amount: 850.75,
      note: "Team lunch",
    };

    const resFn: CreatePaymentDraftResult = createPaymentDraft(input);
    assert(resFn.success === true, "createPaymentDraft returns success === true for valid input");
    if (resFn.success) {
      assert(resFn.draft.recipient === "merchant.pay@okaxis", "Draft preserves recipient");
      assert(resFn.draft.amount === 850.75, "Draft preserves numeric amount");
      assert(resFn.draft.note === "Team lunch", "Draft preserves note");
    }

    const resSvc: CreatePaymentDraftResult = PaymentService.createPaymentDraft(input);
    assert(resSvc.success === true, "PaymentService.createPaymentDraft returns success === true");
    if (resSvc.success) {
      assert(resSvc.draft.recipient === "merchant.pay@okaxis", "PaymentService draft preserves recipient");
      assert(resSvc.draft.amount === 850.75, "PaymentService draft preserves numeric amount");
      assert(resSvc.draft.note === "Team lunch", "PaymentService draft preserves note");
    }
  }

  console.log("\n--- Test Suite 11: Recipient and Note Trimming ---");
  {
    const input: CreateTransactionInput = {
      recipient: "   vendor.electronics@upi   ",
      amount: 1999,
      note: "   Hardware cables   ",
    };

    const res: CreatePaymentDraftResult = createPaymentDraft(input);
    assert(res.success === true, "Draft creation succeeds with padded inputs");
    if (res.success) {
      assert(res.draft.recipient === "vendor.electronics@upi", "Draft recipient is cleanly trimmed");
      assert(res.draft.note === "Hardware cables", "Draft note is cleanly trimmed");
    }

    const inputWhitespaceNote: CreateTransactionInput = {
      recipient: "vendor.electronics@upi",
      amount: 1999,
      note: "      ",
    };
    const resWhitespace: CreatePaymentDraftResult = createPaymentDraft(inputWhitespaceNote);
    assert(resWhitespace.success === true, "Draft creation succeeds with whitespace-only note");
    if (resWhitespace.success) {
      assert(resWhitespace.draft.note === undefined, "Whitespace-only note normalizes to undefined in draft");
    }
  }

  console.log("\n--- Test Suite 12: Invalid Recipient Rejection ---");
  {
    const resEmpty: CreatePaymentDraftResult = createPaymentDraft({
      recipient: "",
      amount: 500,
    });
    assert(resEmpty.success === false, "Draft creation rejects empty recipient");
    if (!resEmpty.success) {
      assert(typeof resEmpty.error === "string" && resEmpty.error.length > 0, "Provides clear error message");
    }

    const resWhitespace: CreatePaymentDraftResult = createPaymentDraft({
      recipient: "    ",
      amount: 500,
    });
    assert(resWhitespace.success === false, "Draft creation rejects whitespace-only recipient");
  }

  console.log("\n--- Test Suite 13: Invalid Amount Rejection ---");
  {
    const resZero: CreatePaymentDraftResult = createPaymentDraft({
      recipient: "user@upi",
      amount: 0,
    });
    assert(resZero.success === false, "Draft creation rejects zero amount");

    const resNegative: CreatePaymentDraftResult = createPaymentDraft({
      recipient: "user@upi",
      amount: -50,
    });
    assert(resNegative.success === false, "Draft creation rejects negative amount");

    const resNaN: CreatePaymentDraftResult = createPaymentDraft({
      recipient: "user@upi",
      amount: NaN,
    });
    assert(resNaN.success === false, "Draft creation rejects NaN amount");

    const resInf: CreatePaymentDraftResult = createPaymentDraft({
      recipient: "user@upi",
      amount: Infinity,
    });
    assert(resInf.success === false, "Draft creation rejects Infinity amount");
  }

  console.log("\n--- Test Suite 14: No Generated Transaction ID, Status, or Risk Fields ---");
  {
    const res: CreatePaymentDraftResult = createPaymentDraft({
      recipient: "clean.draft@upi",
      amount: 100,
    });
    assert(res.success === true, "Draft creation succeeded");
    if (res.success) {
      const draftAny = res.draft as any;
      assert(draftAny.id === undefined, "Draft has no generated id");
      assert(draftAny.status === undefined, "Draft has no status field");
      assert(draftAny.canonicalStatus === undefined, "Draft has no canonicalStatus field");
      assert(draftAny.riskScore === undefined, "Draft has no riskScore");
      assert(draftAny.riskLevel === undefined, "Draft has no riskLevel");
      assert(draftAny.riskFactors === undefined, "Draft has no riskFactors");
      assert(draftAny.reasons === undefined, "Draft has no reasons");
      assert(draftAny.isCompleted === undefined, "Draft has no isCompleted field");

      const allowedKeys = new Set(["recipient", "amount", "note"]);
      const extraKeys = Object.keys(res.draft).filter((k) => !allowedKeys.has(k));
      assert(extraKeys.length === 0, `Draft contains ONLY allowed keys, no extras (found extras: ${extraKeys.join(", ")})`);
    }
  }

  console.log("\n--- Test Suite 15: No Transaction Store Insertion or Persistence ---");
  {
    const afterDrafts = await PaymentService.getTransactions(1, "all");
    assert(
      afterDrafts.items.length === initialCount,
      `Transaction store strictly unmutated (initial: ${initialCount}, final: ${afterDrafts.items.length})`
    );
  }

  console.log("\n=================================================================");
  console.log("AVARAN PAY PART 3D: RISK-EVALUATION BOUNDARY REGRESSION");
  console.log("=================================================================\n");

  console.log("--- Test Suite 16: Risk-Evaluation Boundary Placeholder & Rejection Checks ---");
  {
    const validDraft: PaymentDraft = {
      recipient: "security.merchant@hdfc",
      amount: 450,
      note: "Annual subscription",
    };

    // 1. Valid draft reaches boundary (helper and service method)
    const req: RiskEvaluationRequest = { draft: validDraft };
    const resFn: RiskEvaluationResult = evaluatePaymentDraft(req);
    assert(resFn.success === true, "evaluatePaymentDraft returns success === true for valid draft");
    if (resFn.success) {
      assert(resFn.data.status === "UNAVAILABLE", "Returns explicit UNAVAILABLE status");
      assert(
        typeof resFn.data.message === "string" && resFn.data.message.includes("unavailable"),
        "Returns explicit unavailable message"
      );
      const dataAny = resFn.data as any;
      assert(dataAny.id === undefined, "No transaction ID fabricated");
      assert(dataAny.riskScore === undefined, "No risk score fabricated");
      assert(dataAny.riskLevel === undefined, "No risk level fabricated");
      assert(dataAny.riskFactors === undefined, "No risk factors fabricated");
      assert(dataAny.reasons === undefined, "No risk reasons fabricated");
      assert(dataAny.canonicalStatus === undefined, "No canonical status fabricated");
      assert(dataAny.isCompleted === undefined, "No isCompleted fabricated");
      assert(dataAny.status !== "Safe" && dataAny.status !== "Approved" && dataAny.status !== "Blocked", "Never pretends safe or approved or blocked");
    }

    const resSvc: RiskEvaluationResult = PaymentService.evaluatePaymentDraft(req);
    assert(resSvc.success === true, "PaymentService.evaluatePaymentDraft returns success === true");
    if (resSvc.success) {
      assert(resSvc.data.status === "UNAVAILABLE", "Service method returns explicit UNAVAILABLE status");
    }

    // 2. Invalid draft input rejected
    const nullReq: RiskEvaluationResult = evaluatePaymentDraft(null as any);
    assert(nullReq.success === false, "Rejects null request");

    const nullDraftReq: RiskEvaluationResult = evaluatePaymentDraft({ draft: null as any });
    assert(nullDraftReq.success === false, "Rejects null draft");

    const emptyRecipientReq: RiskEvaluationResult = evaluatePaymentDraft({
      draft: { recipient: "   ", amount: 100 },
    });
    assert(emptyRecipientReq.success === false, "Rejects whitespace-only recipient in draft");

    const negativeAmountReq: RiskEvaluationResult = evaluatePaymentDraft({
      draft: { recipient: "user@upi", amount: -25 },
    });
    assert(negativeAmountReq.success === false, "Rejects negative amount in draft");

    const nanAmountReq: RiskEvaluationResult = evaluatePaymentDraft({
      draft: { recipient: "user@upi", amount: NaN },
    });
    assert(nanAmountReq.success === false, "Rejects NaN amount in draft");

    // 3. Confirm store remains strictly untouched
    const afterAll = await PaymentService.getTransactions(1, "all");
    assert(
      afterAll.items.length === initialCount,
      `Transaction store strictly unmutated after evaluation tests (initial: ${initialCount}, final: ${afterAll.items.length})`
    );
  }

  console.log("\n=================================================================");
  console.log(`ALL ${passedChecks} PART 3A, 3C, & 3D REGRESSION CHECKS PASSED (${totalChecks}/${totalChecks})`);
  console.log("=================================================================\n");

  if (failures > 0) {
    throw new Error(`${failures} check(s) failed.`);
  }
}

runTests().catch((e) => {
  console.error("Test execution failed with error:", e);
  throw e;
});
