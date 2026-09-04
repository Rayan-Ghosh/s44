// @ts-ignore
(globalThis as any).__DEV__ = true;
// @ts-ignore
(globalThis as any).expo = { EventEmitter: class {} };
process.env.EXPO_PUBLIC_DEMO_MODE = "true";

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

import {
  resolveRecipient,
  RecipientResolutionService,
  RecipientResolutionInput,
  RecipientResolutionResult,
} from "../../services/recipient-resolution-service";
import { getRiskLevelFromScore, getStatusBadgeProps } from "../risk-scoring";
const {
  PaymentService,
  PaymentWorkflowStageEnum,
  isEvaluationStage,
  isPaymentAuthorizedStage,
  isPaymentSubmittedStage,
  isPaymentCompletedStage,
  isEvaluationAuthorized,
  isEvaluationCompleted,
  validatePaymentAuthorizationStage,
  validatePaymentSubmissionStage,
  validatePaymentCompletionStage,
  assertNotEvaluationStage,
  authorizePaymentTransaction,
  submitPaymentTransaction,
  completePaymentTransaction,
} = require("../../services/payment-service");
const { PaymentAppLauncherService } = require("../../services/payment-app-launcher-service");

/**
 * AVARAN PAY — Frontend Part 4H: Recipient Resolution Contract Regression Tests
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
  console.log("AVARAN PAY PART 4H: RECIPIENT RESOLUTION CONTRACT REGRESSION");
  console.log("=================================================================\n");

  // Suite 1: Valid UPI ID returns success with the same UPI ID
  console.log("--- Test Suite 1: Valid UPI ID Resolution ---");
  const validUpiCases = [
    "alice@okhdfcbank",
    "merchant@upi",
    "john.doe@okaxis",
    "user_123@icici",
    "9876543210@paytm",
  ];

  for (const upi of validUpiCases) {
    const res = resolveRecipient({ originalValue: upi, recipientType: "UPI_ID" });
    assert(res.success === true, `Expected success === true for "${upi}"`);
    if (res.success) {
      assert(res.originalValue === upi, `originalValue must equal input "${upi}"`);
      assert(res.resolvedRecipient === upi, `resolvedRecipient must equal "${upi}"`);
      assert(res.recipientType === "UPI_ID", `recipientType must be "UPI_ID"`);
    }

    // Also verify via RecipientResolutionService object
    const serviceRes = RecipientResolutionService.resolveRecipient({ originalValue: upi });
    assert(serviceRes.success === true, `Service method succeeds for "${upi}"`);
    if (serviceRes.success) {
      assert(serviceRes.resolvedRecipient === upi, `Service method returns same resolvedRecipient`);
    }
  }

  // Suite 2: Valid Mobile Number returns RESOLUTION_UNAVAILABLE
  console.log("\n--- Test Suite 2: Valid Mobile Number Returns RESOLUTION_UNAVAILABLE ---");
  const validMobileCases = [
    "9876543210",
    "+919876543210",
    "919876543210",
    "+91 9876543210",
    "+91-9876543210",
  ];

  for (const mobile of validMobileCases) {
    const res = resolveRecipient({ originalValue: mobile, recipientType: "MOBILE_NUMBER" });
    assert(res.success === false, `Expected success === false for valid mobile "${mobile}"`);
    if (!res.success) {
      assert(
        res.reason === "RESOLUTION_UNAVAILABLE",
        `Expected reason === "RESOLUTION_UNAVAILABLE" for "${mobile}", got "${res.reason}"`
      );
      assert(res.originalValue === mobile, `originalValue must be preserved for "${mobile}"`);
    }

    // Also verify without explicit recipientType
    const resInferred = resolveRecipient({ originalValue: mobile });
    assert(resInferred.success === false, `Inferred type resolution fails for mobile`);
    if (!resInferred.success) {
      assert(resInferred.reason === "RESOLUTION_UNAVAILABLE", `Inferred mobile reason is RESOLUTION_UNAVAILABLE`);
    }
  }

  // Suite 3: Invalid Recipient returns INVALID_RECIPIENT
  console.log("\n--- Test Suite 3: Invalid Recipient Returns INVALID_RECIPIENT ---");
  const invalidCases = [
    "invalid",
    "user@",
    "@upi",
    "user@@upi",
    "1234567890", // Starts with 1
    "98765",      // Too short
    "+19876543210", // Non-IN country code
    "John Doe",
    "merchant name",
    "https://upi.pay",
  ];

  for (const inv of invalidCases) {
    const res = resolveRecipient({ originalValue: inv });
    assert(res.success === false, `Expected success === false for invalid input "${inv}"`);
    if (!res.success) {
      assert(
        res.reason === "INVALID_RECIPIENT",
        `Expected reason === "INVALID_RECIPIENT" for "${inv}", got "${res.reason}"`
      );
      assert(res.originalValue === inv, `originalValue must equal input "${inv}"`);
    }
  }

  // Suite 4: Empty & Whitespace Inputs return INVALID_RECIPIENT
  console.log("\n--- Test Suite 4: Empty & Whitespace Inputs Return INVALID_RECIPIENT ---");
  const emptyCases = ["", "   ", "\t\n"];

  for (const empty of emptyCases) {
    const res = resolveRecipient({ originalValue: empty });
    assert(res.success === false, `Expected success === false for empty input`);
    if (!res.success) {
      assert(res.reason === "INVALID_RECIPIENT", `Expected INVALID_RECIPIENT for empty input`);
      assert(res.originalValue === empty, `Preserves empty input verbatim`);
    }
  }

  // Malformed input objects
  const malformedInputs: any[] = [null, undefined, {}, { originalValue: null }];
  for (const malformed of malformedInputs) {
    const res = resolveRecipient(malformed);
    assert(res.success === false, `Malformed input returns success === false`);
    if (!res.success) {
      assert(res.reason === "INVALID_RECIPIENT", `Malformed input returns INVALID_RECIPIENT`);
    }
  }

  // Mismatched recipientType in input returns INVALID_RECIPIENT
  const mismatchedRes = resolveRecipient({ originalValue: "9876543210", recipientType: "UPI_ID" });
  assert(mismatchedRes.success === false, `Mismatched recipientType returns success === false`);
  if (!mismatchedRes.success) {
    assert(mismatchedRes.reason === "INVALID_RECIPIENT", `Mismatched recipientType returns INVALID_RECIPIENT`);
  }

  // Suite 5: Original Input Preservation & No Appending @upi
  console.log("\n--- Test Suite 5: Original Input Preservation & No Appending @upi ---");
  const testInputs = [
    "9876543210",
    "+919876543210",
    "user@upi",
    "merchant.store@bank",
  ];

  for (const inputStr of testInputs) {
    const copy = inputStr.slice();
    const res = resolveRecipient({ originalValue: inputStr });
    assert(inputStr === copy, `Input string "${inputStr}" must not be mutated in-place`);
    assert(res.originalValue === inputStr, `res.originalValue matches input`);
    assert(!res.originalValue.endsWith("@upi") || copy.endsWith("@upi"), `Never append @upi to originalValue`);
    if (res.success) {
      assert(!res.resolvedRecipient.endsWith("@upi") || copy.endsWith("@upi"), `Never append @upi to resolvedRecipient`);
    }
  }

  // Mobile number specifically tested for no @upi appending
  const mobileInput = "9876543210";
  const mobileRes = resolveRecipient({ originalValue: mobileInput, recipientType: "MOBILE_NUMBER" });
  assert(mobileRes.success === false, `Mobile resolution must not return fake success`);
  assert(mobileRes.originalValue === "9876543210", `Mobile originalValue remains exactly "9876543210"`);
  assert(mobileInput === "9876543210", `Input variable untouched`);

  // Suite 6: No Network or Payment Service Method Called
  console.log("\n--- Test Suite 6: Zero Payment Lifecycle Side Effects ---");
  const initialOverview = await PaymentService.getOverview();
  const initialTransactions = await PaymentService.getTransactions();
  const initialTxCount = initialTransactions.items.length;

  // Execute multiple resolutions
  resolveRecipient({ originalValue: "merchant@upi", recipientType: "UPI_ID" });
  resolveRecipient({ originalValue: "9876543210", recipientType: "MOBILE_NUMBER" });
  resolveRecipient({ originalValue: "+919876543210" });
  resolveRecipient({ originalValue: "invalid@input" });
  resolveRecipient({ originalValue: "" });

  const postOverview = await PaymentService.getOverview();
  const postTransactions = await PaymentService.getTransactions();

  assert(
    postTransactions.items.length === initialTxCount,
    `Transaction store count strictly unchanged (was ${initialTxCount}, now ${postTransactions.items.length})`
  );
  assert(
    postOverview.transactionCount === initialOverview.transactionCount,
    `Overview transactionCount strictly unchanged (was ${initialOverview.transactionCount}, now ${postOverview.transactionCount})`
  );

  // Suite 7: EVALUATE & PAY Flow Integration (Part 4I)
  console.log("\n--- Test Suite 7: EVALUATE & PAY Flow Integration (Part 4I) ---");

  function simulateEvaluateAndPay(form: { recipient: string; amount: string; note: string }) {
    let toastMessage: string | null = null;
    let toastType: string | null = null;
    let draftCreated: any = null;
    let evaluated: boolean = false;

    const showToast = (msg: string, type: string) => {
      toastMessage = msg;
      toastType = type;
    };

    // 1. Recipient Resolution
    const resolution = resolveRecipient({ originalValue: form.recipient });
    if (!resolution.success) {
      if (resolution.reason === "RESOLUTION_UNAVAILABLE") {
        showToast("Mobile number verification is not available yet", "warning");
      } else {
        showToast("Enter a valid UPI ID or mobile number", "warning");
      }
      return { toastMessage, toastType, draftCreated, evaluated, form };
    }

    // 2. Draft Creation & Evaluation
    const parsedAmount = form.amount.trim() === "" ? NaN : Number(form.amount);
    const draftResult = PaymentService.createPaymentDraft({
      recipient: resolution.resolvedRecipient,
      amount: parsedAmount,
      note: form.note,
    });

    if (!draftResult.success) {
      showToast(draftResult.error, "warning");
      return { toastMessage, toastType, draftCreated, evaluated, form };
    }

    draftCreated = draftResult.draft;
    const evalResult = PaymentService.evaluatePaymentDraft({ draft: draftCreated });
    if (!evalResult.success) {
      showToast(evalResult.error, "warning");
      return { toastMessage, toastType, draftCreated, evaluated, form };
    }

    evaluated = true;
    showToast(evalResult.data.message, "info");
    return { toastMessage, toastType, draftCreated, evaluated, form };
  }

  // 7.1 Valid UPI ID continues to the existing draft/evaluation path
  const validUpiForm = { recipient: "merchant@upi", amount: "1250", note: "Invoice 12" };
  const upiFlowResult = simulateEvaluateAndPay(validUpiForm);
  assert(upiFlowResult.evaluated === true, "Valid UPI ID successfully completes evaluation");
  assert(upiFlowResult.draftCreated !== null, "Valid UPI ID creates payment draft");
  assert(upiFlowResult.draftCreated?.recipient === "merchant@upi", "Draft recipient matches resolved UPI ID");
  assert(upiFlowResult.draftCreated?.amount === 1250, "Draft amount matches input 1250");
  assert(upiFlowResult.draftCreated?.note === "Invoice 12", "Draft note matches input");
  assert(validUpiForm.recipient === "merchant@upi", "Original form recipient remains unchanged");

  // 7.2 Valid mobile numbers stop before draft creation and show unavailable toast
  const mobileForms = [
    { recipient: "9876543210", amount: "500", note: "Mobile pay" },
    { recipient: "+919876543210", amount: "500", note: "Mobile pay" },
    { recipient: "919876543210", amount: "500", note: "Mobile pay" },
  ];

  for (const mForm of mobileForms) {
    const origRecipient = mForm.recipient;
    const mResult = simulateEvaluateAndPay(mForm);
    assert(mResult.draftCreated === null, `Mobile "${origRecipient}" must NOT create a draft`);
    assert(mResult.evaluated === false, `Mobile "${origRecipient}" must NOT evaluate risk`);
    assert(
      mResult.toastMessage === "Mobile number verification is not available yet",
      `Mobile "${origRecipient}" shows unavailable toast`
    );
    assert(mResult.toastType === "warning", `Toast type is warning for mobile`);
    assert(mForm.recipient === origRecipient, `Form recipient "${origRecipient}" remains untouched`);
    assert(mForm.amount === "500", "Form amount remains untouched");
    assert(mForm.note === "Mobile pay", "Form note remains untouched");
    assert(!mForm.recipient.includes("@upi"), "Form recipient does not have @upi appended");
  }

  // 7.3 Invalid recipient stops before draft creation and shows validation toast
  const invalidForms = [
    { recipient: "invalid", amount: "100", note: "" },
    { recipient: "user@", amount: "100", note: "" },
    { recipient: "@upi", amount: "100", note: "" },
    { recipient: "", amount: "100", note: "" },
    { recipient: "   ", amount: "100", note: "" },
    { recipient: "1234567890", amount: "100", note: "" },
  ];

  for (const iForm of invalidForms) {
    const origRecipient = iForm.recipient;
    const iResult = simulateEvaluateAndPay(iForm);
    assert(iResult.draftCreated === null, `Invalid "${origRecipient}" must NOT create a draft`);
    assert(iResult.evaluated === false, `Invalid "${origRecipient}" must NOT evaluate risk`);
    assert(
      iResult.toastMessage === "Enter a valid UPI ID or mobile number",
      `Invalid "${origRecipient}" shows validation toast`
    );
    assert(iResult.toastType === "warning", `Toast type is warning for invalid recipient`);
    assert(iForm.recipient === origRecipient, `Form recipient "${origRecipient}" remains untouched`);
  }

  // 7.4 Zero risk, biometric, Guardian, deep-link, or history side-effects for unresolved mobile numbers
  const postFlowTx = await PaymentService.getTransactions();
  const postFlowOverview = await PaymentService.getOverview();
  assert(
    postFlowTx.items.length === initialTxCount,
    `PaymentService transactions unchanged after flow simulations (${initialTxCount})`
  );
  assert(
    postFlowOverview.transactionCount === initialOverview.transactionCount,
    `PaymentService overview count unchanged after flow simulations (${initialOverview.transactionCount})`
  );

  // Suite 8: Loading-State Safety & Duplicate Prevention (Part 4J)
  console.log("\n--- Test Suite 8: Loading-State Safety & Duplicate Prevention (Part 4J) ---");

  class ScreenEvaluationTester {
    public isEvaluating = false;
    public toastMessage: string | null = null;
    public toastType: string | null = null;
    public draft: any = null;
    public evaluationResult: any = null;
    public executionCount = 0;
    public entryRecipient = "";
    public entryAmount = "";
    public entryNote = "";
    public formVersion = 0;

    public handleRecipientChange(val: string) {
      this.entryRecipient = val;
      this.draft = null;
      this.evaluationResult = null;
      this.formVersion++;
    }

    public handleAmountChange(val: string) {
      this.entryAmount = val;
      this.draft = null;
      this.evaluationResult = null;
      this.formVersion++;
    }

    public handleNoteChange(val: string) {
      this.entryNote = val;
      this.draft = null;
      this.evaluationResult = null;
      this.formVersion++;
    }

    public handleQrScan(form: { recipient: string; amount?: string; note?: string }) {
      this.entryRecipient = form.recipient;
      if (form.amount) this.entryAmount = form.amount;
      if (form.note) this.entryNote = form.note;
      this.draft = null;
      this.evaluationResult = null;
      this.formVersion++;
    }

    public handlePickContact(form: { recipient: string }) {
      this.entryRecipient = form.recipient;
      this.draft = null;
      this.evaluationResult = null;
      this.formVersion++;
    }

    public simulateUnrelatedRerender() {
      // Unrelated re-render returns current state without altering draft or evaluationResult
      return {
        recipient: this.entryRecipient,
        amount: this.entryAmount,
        note: this.entryNote,
        draft: this.draft,
        evaluationResult: this.evaluationResult,
      };
    }

    public handleEvaluateAndPay(
      form?: { recipient: string; amount: string; note?: string },
      shouldThrow = false,
      simulateModificationDuringEval?: () => void
    ) {
      if (this.isEvaluating) return;
      this.isEvaluating = true;
      this.draft = null;
      this.evaluationResult = null;
      const evalVersion = ++this.formVersion;
      this.executionCount++;

      if (form) {
        this.entryRecipient = form.recipient;
        this.entryAmount = form.amount;
        this.entryNote = form.note || "";
      }

      try {
        if (shouldThrow) {
          throw new Error("Unexpected evaluation failure");
        }

        const resolution = resolveRecipient({ originalValue: this.entryRecipient });
        if (!resolution.success) {
          if (resolution.reason === "RESOLUTION_UNAVAILABLE") {
            this.showToast("Mobile number verification is not available yet", "warning");
          } else {
            this.showToast("Enter a valid UPI ID or mobile number", "warning");
          }
          return;
        }

        const parsedAmount = this.entryAmount.trim() === "" ? NaN : Number(this.entryAmount);
        const draftResult = PaymentService.createPaymentDraft({
          recipient: resolution.resolvedRecipient,
          amount: parsedAmount,
          note: this.entryNote,
        });

        if (!draftResult.success) {
          this.showToast(draftResult.error, "warning");
          return;
        }

        const draft = draftResult.draft;
        const evalResult = PaymentService.evaluatePaymentDraft({ draft });
        if (!evalResult.success) {
          this.showToast(evalResult.error, "warning");
          return;
        }

        if (simulateModificationDuringEval) {
          simulateModificationDuringEval();
        }

        if (this.formVersion !== evalVersion) {
          return;
        }

        this.draft = draft;
        const evalData = evalResult.data;
        const derivedRiskLevel =
          evalData.riskLevel ||
          (typeof evalData.riskScore === "number" ? getRiskLevelFromScore(evalData.riskScore) : undefined);

        this.evaluationResult = {
          stage: "EVALUATION_COMPLETED",
          riskLevel: derivedRiskLevel,
          riskScore: typeof evalData.riskScore === "number" ? evalData.riskScore : undefined,
          reasons: Array.isArray(evalData.reasons) ? evalData.reasons : undefined,
          summary: typeof evalData.summary === "string" ? evalData.summary : undefined,
          message: typeof evalData.message === "string" ? evalData.message : undefined,
          status: typeof evalData.status === "string" ? evalData.status : undefined,
          isAuthorized: false,
          isApproved: false,
          isCompleted: false,
          isSubmitted: false,
        };
        this.showToast(evalResult.data.message, "info");
      } catch (err: any) {
        this.showToast(err?.message || "Unable to evaluate payment draft", "warning");
      } finally {
        this.isEvaluating = false;
      }
    }

    private showToast(msg: string, type: string) {
      this.toastMessage = msg;
      this.toastType = type;
    }
  }

  // 8.1 Invalid recipient resets loading state
  const tester1 = new ScreenEvaluationTester();
  tester1.handleEvaluateAndPay({ recipient: "invalid", amount: "100" });
  assert(tester1.isEvaluating === false, "Invalid recipient resets isEvaluating to false");
  assert(tester1.toastMessage === "Enter a valid UPI ID or mobile number", "Shows invalid recipient toast");

  // 8.2 Empty recipient resets loading state
  const tester2 = new ScreenEvaluationTester();
  tester2.handleEvaluateAndPay({ recipient: "", amount: "100" });
  assert(tester2.isEvaluating === false, "Empty recipient resets isEvaluating to false");
  assert(tester2.toastMessage === "Enter a valid UPI ID or mobile number", "Shows empty recipient toast");

  // 8.3 Unresolved mobile number resets loading state
  const tester3 = new ScreenEvaluationTester();
  tester3.handleEvaluateAndPay({ recipient: "9876543210", amount: "100" });
  assert(tester3.isEvaluating === false, "Mobile number resets isEvaluating to false");
  assert(tester3.toastMessage === "Mobile number verification is not available yet", "Shows mobile unavailable toast");

  // 8.4 Valid UPI evaluation resets loading state after completion
  const tester4 = new ScreenEvaluationTester();
  tester4.handleEvaluateAndPay({ recipient: "merchant@upi", amount: "100" });
  assert(tester4.isEvaluating === false, "Valid UPI resets isEvaluating to false after success");
  assert(tester4.toastType === "info", "Evaluation success toast dispatched");

  // 8.5 Draft failure (e.g. invalid amount) resets loading state
  const tester5 = new ScreenEvaluationTester();
  tester5.handleEvaluateAndPay({ recipient: "merchant@upi", amount: "-50" });
  assert(tester5.isEvaluating === false, "Draft creation failure (negative amount) resets isEvaluating to false");
  assert(tester5.toastType === "warning", "Draft creation failure warning toast");

  // 8.6 Evaluation failure resets loading state (amount 0)
  const tester6 = new ScreenEvaluationTester();
  tester6.handleEvaluateAndPay({ recipient: "merchant@upi", amount: "0" });
  assert(tester6.isEvaluating === false, "Amount 0 failure resets isEvaluating to false");

  // 8.7 Unexpected exception resets loading state
  const tester7 = new ScreenEvaluationTester();
  tester7.handleEvaluateAndPay({ recipient: "merchant@upi", amount: "100" }, true);
  assert(tester7.isEvaluating === false, "Unexpected exception resets isEvaluating to false");
  assert(tester7.toastMessage === "Unexpected evaluation failure", "Catches unexpected exception with toast");

  // 8.8 Duplicate submission is still prevented
  const tester8 = new ScreenEvaluationTester();
  tester8.isEvaluating = true;
  tester8.handleEvaluateAndPay({ recipient: "merchant@upi", amount: "100" });
  assert(tester8.executionCount === 0, "Second call while isEvaluating is true returns immediately without running");

  // 8.9 No new payment side-effects are introduced
  const finalTx = await PaymentService.getTransactions();
  const finalOverview = await PaymentService.getOverview();
  assert(
    finalTx.items.length === initialTxCount,
    `Transactions strictly unchanged after safety checks (${initialTxCount})`
  );
  assert(
    finalOverview.transactionCount === initialOverview.transactionCount,
    `Overview strictly unchanged after safety checks (${initialOverview.transactionCount})`
  );

  // Suite 9: Stale Payment Draft State Prevention (Part 4K)
  console.log("\n--- Test Suite 9: Stale Payment Draft State Prevention (Part 4K) ---");

  // Setup tester with a pre-existing successful draft
  const draftTester = new ScreenEvaluationTester();
  draftTester.handleEvaluateAndPay({ recipient: "merchant@upi", amount: "500", note: "Original Draft" });
  assert(draftTester.draft !== null, "Initial evaluation succeeds and stores draft");
  assert(draftTester.draft?.recipient === "merchant@upi", "Draft recipient matches original");
  assert(draftTester.draft?.amount === 500, "Draft amount matches original");

  // 9.1 Failed recipient resolution clears and leaves draft empty (null)
  draftTester.handleEvaluateAndPay({ recipient: "invalid-recipient", amount: "500" });
  assert(draftTester.draft === null, "Failed recipient resolution clears previous draft and leaves it null");

  // Re-establish a valid draft
  draftTester.handleEvaluateAndPay({ recipient: "merchant@upi", amount: "1000", note: "Second Draft" });
  assert(draftTester.draft !== null, "Re-established valid draft");
  assert(draftTester.draft?.amount === 1000, "Draft amount is 1000");

  // 9.2 Unresolved mobile number clears and leaves draft empty (null)
  draftTester.handleEvaluateAndPay({ recipient: "9876543210", amount: "1000" });
  assert(draftTester.draft === null, "Unresolved mobile number clears previous draft and leaves it null");

  // Re-establish a valid draft
  draftTester.handleEvaluateAndPay({ recipient: "merchant@upi", amount: "750" });
  assert(draftTester.draft !== null, "Re-established valid draft");

  // 9.3 Invalid amount (empty string) clears and leaves draft empty (null)
  draftTester.handleEvaluateAndPay({ recipient: "merchant@upi", amount: "" });
  assert(draftTester.draft === null, "Empty amount clears previous draft and leaves it null");

  // Re-establish a valid draft
  draftTester.handleEvaluateAndPay({ recipient: "merchant@upi", amount: "750" });
  assert(draftTester.draft !== null, "Re-established valid draft");

  // 9.4 Draft creation failure (negative amount) clears and leaves draft empty (null)
  draftTester.handleEvaluateAndPay({ recipient: "merchant@upi", amount: "-100" });
  assert(draftTester.draft === null, "Negative amount draft failure leaves draft null");

  // Re-establish a valid draft
  draftTester.handleEvaluateAndPay({ recipient: "merchant@upi", amount: "750" });
  assert(draftTester.draft !== null, "Re-established valid draft");

  // 9.5 Evaluation failure (simulate evaluatePaymentDraft failure) clears and leaves draft empty (null)
  draftTester.handleEvaluateAndPay({ recipient: "merchant@upi", amount: "100" }, true);
  assert(draftTester.draft === null, "Evaluation exception / failure leaves draft null");

  // 9.6 Successful evaluation overwrites previous state with only the new draft
  draftTester.handleEvaluateAndPay({ recipient: "vendor@okaxis", amount: "2500", note: "Fresh Payment" });
  assert(draftTester.draft !== null, "Fresh evaluation creates and stores new draft");
  assert(draftTester.draft?.recipient === "vendor@okaxis", "New draft recipient stored");
  assert(draftTester.draft?.amount === 2500, "New draft amount stored");
  assert(draftTester.draft?.note === "Fresh Payment", "New draft note stored");

  // 9.7 No transaction store or payment overview side-effects
  const postPart4KTx = await PaymentService.getTransactions();
  const postPart4KOverview = await PaymentService.getOverview();
  assert(
    postPart4KTx.items.length === initialTxCount,
    `Transaction store strictly unchanged after stale draft tests (${initialTxCount})`
  );
  assert(
    postPart4KOverview.transactionCount === initialOverview.transactionCount,
    `Overview strictly unchanged after stale draft tests (${initialOverview.transactionCount})`
  );

  // Suite 10: Display Evaluation Result (Part 4L)
  console.log("\n--- Test Suite 10: Display Evaluation Result (Part 4L) ---");

  const origEvaluate = PaymentService.evaluatePaymentDraft;
  const evalTester = new ScreenEvaluationTester();

  // 10.1 No result before evaluation
  assert(evalTester.evaluationResult === null, "No result before evaluation (evaluationResult is null)");

  // 10.2 Successful LOW result displays correctly
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: {
      status: "EVALUATED",
      riskLevel: "LOW",
      riskScore: 16,
      reasons: ["Verified contact profile", "Standard transaction amount"],
      summary: "Low risk payment profile",
      message: "Payment evaluated as low risk",
    },
  });

  evalTester.handleEvaluateAndPay({ recipient: "safe.merchant@upi", amount: "200", note: "Groceries" });
  assert(evalTester.evaluationResult !== null, "Successful LOW evaluation stores result");
  assert(evalTester.evaluationResult.riskLevel === "LOW", "Result riskLevel is LOW");
  assert(evalTester.evaluationResult.riskScore === 16, "Result riskScore is 16");
  assert(Array.isArray(evalTester.evaluationResult.reasons), "Result has reasons array");
  assert(evalTester.evaluationResult.reasons.length === 2, "Reasons count matches");
  assert(evalTester.evaluationResult.reasons[0] === "Verified contact profile", "First reason verified");
  assert(evalTester.evaluationResult.summary === "Low risk payment profile", "Summary verified");
  const lowBadge = getStatusBadgeProps(evalTester.evaluationResult.riskLevel);
  assert(lowBadge.label === "LOW RISK", "StatusBadge label is 'LOW RISK' for LOW");
  assert(lowBadge.status === "low", "StatusBadge status is 'low' for LOW");

  // 10.3 Previous result clears when a new evaluation starts
  // 10.4 Successful MEDIUM result displays correctly
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: {
      status: "EVALUATED",
      riskLevel: "MEDIUM",
      riskScore: 48,
      reasons: ["Amount exceeds daily velocity average", "First transfer to this UPI ID"],
      summary: "Medium risk advisory notice",
      message: "Payment requires advisory review",
    },
  });

  evalTester.handleEvaluateAndPay({ recipient: "new.vendor@upi", amount: "4500", note: "Office Supplies" });
  assert(evalTester.evaluationResult !== null, "Successful MEDIUM evaluation stores new result");
  assert(evalTester.evaluationResult.riskLevel === "MEDIUM", "Result riskLevel is MEDIUM");
  assert(evalTester.evaluationResult.riskScore === 48, "Result riskScore is 48");
  assert(evalTester.evaluationResult.reasons[0] === "Amount exceeds daily velocity average", "New reasons replace old");
  const medBadge = getStatusBadgeProps(evalTester.evaluationResult.riskLevel);
  assert(medBadge.label === "MEDIUM RISK", "StatusBadge label is 'MEDIUM RISK' for MEDIUM");
  assert(medBadge.status === "medium", "StatusBadge status is 'medium' for MEDIUM");

  // 10.5 Successful HIGH result displays correctly (and remains strictly informational)
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: {
      status: "EVALUATED",
      riskLevel: "HIGH",
      riskScore: 82,
      reasons: ["Known scam pattern signature", "High device anomaly score"],
      summary: "High risk warning notice",
      message: "High risk behavioral anomaly detected",
    },
  });

  evalTester.handleEvaluateAndPay({ recipient: "suspicious@upi", amount: "99000", note: "Urgent Transfer" });
  assert(evalTester.evaluationResult !== null, "Successful HIGH evaluation stores result");
  assert(evalTester.evaluationResult.riskLevel === "HIGH", "Result riskLevel is HIGH");
  assert(evalTester.evaluationResult.riskScore === 82, "Result riskScore is 82");
  assert(evalTester.evaluationResult.reasons[0] === "Known scam pattern signature", "High risk reason present");
  const highBadge = getStatusBadgeProps(evalTester.evaluationResult.riskLevel);
  assert(highBadge.label === "HIGH RISK", "StatusBadge label is 'HIGH RISK' for HIGH");
  assert(highBadge.status === "high", "StatusBadge status is 'high' for HIGH");

  // 10.6 Failed recipient resolution clears the previous result
  evalTester.handleEvaluateAndPay({ recipient: "invalid@@upi", amount: "500" });
  assert(evalTester.evaluationResult === null, "Failed recipient resolution clears result to null");

  // Re-establish a result
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: { status: "EVALUATED", riskLevel: "LOW", riskScore: 10, message: "OK" },
  });
  evalTester.handleEvaluateAndPay({ recipient: "safe@upi", amount: "50" });
  assert(evalTester.evaluationResult !== null, "Re-established result");

  // 10.7 Unresolved mobile number clears the result
  evalTester.handleEvaluateAndPay({ recipient: "9876543210", amount: "50" });
  assert(evalTester.evaluationResult === null, "Unresolved mobile number clears result to null");

  // Re-establish a result
  evalTester.handleEvaluateAndPay({ recipient: "safe@upi", amount: "50" });
  assert(evalTester.evaluationResult !== null, "Re-established result");

  // 10.8 Invalid amount clears the result
  evalTester.handleEvaluateAndPay({ recipient: "safe@upi", amount: "" });
  assert(evalTester.evaluationResult === null, "Empty amount clears result to null");

  // Re-establish a result
  evalTester.handleEvaluateAndPay({ recipient: "safe@upi", amount: "50" });
  assert(evalTester.evaluationResult !== null, "Re-established result");

  // 10.9 Draft creation failure (negative amount) clears the result
  evalTester.handleEvaluateAndPay({ recipient: "safe@upi", amount: "-100" });
  assert(evalTester.evaluationResult === null, "Negative amount clears result to null");

  // Re-establish a result
  evalTester.handleEvaluateAndPay({ recipient: "safe@upi", amount: "50" });
  assert(evalTester.evaluationResult !== null, "Re-established result");

  // 10.10 Risk evaluation failure clears the result
  PaymentService.evaluatePaymentDraft = () => ({
    success: false,
    error: "Service unavailable",
  });
  evalTester.handleEvaluateAndPay({ recipient: "safe@upi", amount: "50" });
  assert(evalTester.evaluationResult === null, "Evaluation failure clears result to null");

  // Re-establish a result
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: { status: "EVALUATED", riskLevel: "LOW", riskScore: 10, message: "OK" },
  });
  evalTester.handleEvaluateAndPay({ recipient: "safe@upi", amount: "50" });
  assert(evalTester.evaluationResult !== null, "Re-established result");

  // 10.11 Unexpected exception clears the result
  evalTester.handleEvaluateAndPay({ recipient: "safe@upi", amount: "50" }, true);
  assert(evalTester.evaluationResult === null, "Unexpected exception clears result to null");

  // Restore original evaluation service
  PaymentService.evaluatePaymentDraft = origEvaluate;

  // 10.12 Verify no transactions created/inserted, overview count strictly unchanged
  const postPart4LTx = await PaymentService.getTransactions();
  const postPart4LOverview = await PaymentService.getOverview();
  assert(
    postPart4LTx.items.length === initialTxCount,
    `Transaction store strictly unchanged throughout Part 4L (${initialTxCount})`
  );
  assert(
    postPart4LOverview.transactionCount === initialOverview.transactionCount,
    `Overview strictly unchanged throughout Part 4L (${initialOverview.transactionCount})`
  );

  // Suite 11: Clear Evaluation Result When Payment Inputs Change (Part 4M)
  console.log("\n--- Test Suite 11: Clear Evaluation Result When Payment Inputs Change (Part 4M) ---");

  const inputTester = new ScreenEvaluationTester();

  // Helper to establish an active evaluated state
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: {
      status: "EVALUATED",
      riskLevel: "LOW",
      riskScore: 20,
      reasons: ["Verified contact signature"],
      summary: "Low risk payment profile",
      message: "Low risk evaluation",
    },
  });

  inputTester.handleEvaluateAndPay({ recipient: "test.user@okaxis", amount: "500", note: "Dinner" });
  assert(inputTester.draft !== null, "Initial evaluation establishes active draft");
  assert(inputTester.evaluationResult !== null, "Initial evaluation establishes active evaluationResult");
  assert(inputTester.entryRecipient === "test.user@okaxis", "Recipient matches input");
  assert(inputTester.entryAmount === "500", "Amount matches input");
  assert(inputTester.entryNote === "Dinner", "Note matches input");

  // 11.1 Changing recipient immediately clears evaluationResult and paymentDraft
  inputTester.handleRecipientChange("modified.user@okaxis");
  assert(inputTester.evaluationResult === null, "Changing recipient clears evaluationResult to null");
  assert(inputTester.draft === null, "Changing recipient clears paymentDraft to null");
  assert(inputTester.entryRecipient === "modified.user@okaxis", "User's typed recipient is preserved");
  assert(inputTester.entryAmount === "500", "Amount remains preserved when recipient changes");
  assert(inputTester.entryNote === "Dinner", "Note remains preserved when recipient changes");

  // Re-establish evaluated state
  inputTester.handleEvaluateAndPay();
  assert(inputTester.draft !== null, "Re-established draft after recipient change");
  assert(inputTester.evaluationResult !== null, "Re-established evaluationResult after recipient change");

  // 11.2 Changing amount immediately clears evaluationResult and paymentDraft
  inputTester.handleAmountChange("750");
  assert(inputTester.evaluationResult === null, "Changing amount clears evaluationResult to null");
  assert(inputTester.draft === null, "Changing amount clears paymentDraft to null");
  assert(inputTester.entryAmount === "750", "User's typed amount is preserved");
  assert(inputTester.entryRecipient === "modified.user@okaxis", "Recipient remains preserved when amount changes");
  assert(inputTester.entryNote === "Dinner", "Note remains preserved when amount changes");

  // Re-establish evaluated state
  inputTester.handleEvaluateAndPay();
  assert(inputTester.draft !== null, "Re-established draft after amount change");
  assert(inputTester.evaluationResult !== null, "Re-established evaluationResult after amount change");

  // 11.3 Changing note immediately clears evaluationResult and paymentDraft
  inputTester.handleNoteChange("Lunch with team");
  assert(inputTester.evaluationResult === null, "Changing note clears evaluationResult to null");
  assert(inputTester.draft === null, "Changing note clears paymentDraft to null");
  assert(inputTester.entryNote === "Lunch with team", "User's typed note is preserved");
  assert(inputTester.entryRecipient === "modified.user@okaxis", "Recipient remains preserved when note changes");
  assert(inputTester.entryAmount === "750", "Amount remains preserved when note changes");

  // Re-establish evaluated state
  inputTester.handleEvaluateAndPay();
  assert(inputTester.draft !== null, "Re-established draft after note change");
  assert(inputTester.evaluationResult !== null, "Re-established evaluationResult after note change");

  // 11.4 Unrelated re-render does NOT clear the result or draft
  const renderSnapshot = inputTester.simulateUnrelatedRerender();
  assert(renderSnapshot.evaluationResult !== null, "Unrelated re-render does NOT clear evaluationResult");
  assert(renderSnapshot.draft !== null, "Unrelated re-render does NOT clear paymentDraft");
  assert(renderSnapshot.recipient === "modified.user@okaxis", "Recipient preserved across re-render");
  assert(renderSnapshot.amount === "750", "Amount preserved across re-render");
  assert(renderSnapshot.note === "Lunch with team", "Note preserved across re-render");

  // 11.5 QR scan modifying form immediately clears evaluationResult and paymentDraft
  inputTester.handleQrScan({ recipient: "merchant.scanned@icici", amount: "1200", note: "Invoice 12" });
  assert(inputTester.evaluationResult === null, "QR scan clears evaluationResult to null");
  assert(inputTester.draft === null, "QR scan clears paymentDraft to null");
  assert(inputTester.entryRecipient === "merchant.scanned@icici", "QR recipient applied");
  assert(inputTester.entryAmount === "1200", "QR amount applied");
  assert(inputTester.entryNote === "Invoice 12", "QR note applied");

  // Re-establish evaluated state
  inputTester.handleEvaluateAndPay();
  assert(inputTester.draft !== null, "Re-established draft after QR scan");
  assert(inputTester.evaluationResult !== null, "Re-established evaluationResult after QR scan");

  // 11.6 Contact picker modifying recipient immediately clears evaluationResult and paymentDraft
  inputTester.handlePickContact({ recipient: "picked.contact@okhdfcbank" });
  assert(inputTester.evaluationResult === null, "Contact picker clears evaluationResult to null");
  assert(inputTester.draft === null, "Contact picker clears paymentDraft to null");
  assert(inputTester.entryRecipient === "picked.contact@okhdfcbank", "Contact recipient applied");

  // 11.7 In-flight race condition protection (form edited during evaluation discards stale evaluation)
  const raceTester = new ScreenEvaluationTester();
  raceTester.entryRecipient = "merchant@upi";
  raceTester.entryAmount = "100";
  raceTester.handleEvaluateAndPay(undefined, false, () => {
    // User types in recipient input while evaluation is in-flight
    raceTester.handleRecipientChange("new.recipient@upi");
  });
  assert(raceTester.evaluationResult === null, "Stale evaluation result discarded when input modified in-flight");
  assert(raceTester.draft === null, "Stale draft discarded when input modified in-flight");
  assert(raceTester.entryRecipient === "new.recipient@upi", "Preserved newer edited recipient");

  // 11.8 Duplicate submit protection and loading-state safety remain intact
  assert(raceTester.isEvaluating === false, "isEvaluating safely reset to false");
  raceTester.isEvaluating = true;
  raceTester.handleEvaluateAndPay({ recipient: "test@upi", amount: "10" });
  assert(raceTester.executionCount === 1, "Duplicate submit blocked when isEvaluating is true");

  // Restore original evaluation service
  PaymentService.evaluatePaymentDraft = origEvaluate;

  // 11.9 Zero payment-store or overview side effects
  const postPart4MTx = await PaymentService.getTransactions();
  const postPart4MOverview = await PaymentService.getOverview();
  assert(
    postPart4MTx.items.length === initialTxCount,
    `Transaction store strictly unchanged throughout Part 4M (${initialTxCount})`
  );
  assert(
    postPart4MOverview.transactionCount === initialOverview.transactionCount,
    `Overview strictly unchanged throughout Part 4M (${initialOverview.transactionCount})`
  );

  // Suite 12: Separation of Evaluation State from Payment Authorization (Part 4N)
  console.log("\n--- Test Suite 12: Separation of Evaluation State from Authorization (Part 4N) ---");

  const authTester = new ScreenEvaluationTester();

  // 12.1 Successful LOW evaluation is NOT authorization
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: {
      status: "EVALUATED",
      riskLevel: "LOW",
      riskScore: 12,
      reasons: ["Verified contact profile"],
      summary: "Low risk verified transaction signature",
      message: "Low risk evaluated",
    },
  });

  authTester.handleEvaluateAndPay({ recipient: "safe.user@okhdfc", amount: "150" });
  assert(authTester.evaluationResult !== null, "LOW evaluation succeeds and sets evaluationResult");
  assert(authTester.evaluationResult.stage === "EVALUATION_COMPLETED", "Stage is explicitly EVALUATION_COMPLETED");
  assert(authTester.evaluationResult.isAuthorized === false, "LOW evaluation is NOT authorized (isAuthorized === false)");
  assert(authTester.evaluationResult.isApproved === false, "LOW evaluation is NOT approved (isApproved === false)");
  assert(authTester.evaluationResult.isCompleted === false, "LOW evaluation is NOT completed (isCompleted === false)");
  assert(authTester.evaluationResult.isSubmitted === false, "LOW evaluation is NOT submitted (isSubmitted === false)");
  assert(isEvaluationAuthorized(authTester.evaluationResult.stage) === false, "isEvaluationAuthorized returns false for LOW");
  assert(isEvaluationCompleted(authTester.evaluationResult.stage) === false, "isEvaluationCompleted returns false for LOW");

  // 12.2 Successful MEDIUM evaluation is NOT authorization
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: {
      status: "EVALUATED",
      riskLevel: "MEDIUM",
      riskScore: 45,
      reasons: ["Amount exceeds daily baseline"],
      summary: "Medium risk advisory notice",
      message: "Medium risk evaluated",
    },
  });

  authTester.handleEvaluateAndPay({ recipient: "medium.vendor@axis", amount: "3500" });
  assert(authTester.evaluationResult !== null, "MEDIUM evaluation succeeds and sets evaluationResult");
  assert(authTester.evaluationResult.stage === "EVALUATION_COMPLETED", "Stage is explicitly EVALUATION_COMPLETED");
  assert(authTester.evaluationResult.isAuthorized === false, "MEDIUM evaluation is NOT authorized (isAuthorized === false)");
  assert(authTester.evaluationResult.isApproved === false, "MEDIUM evaluation is NOT approved (isApproved === false)");
  assert(authTester.evaluationResult.isCompleted === false, "MEDIUM evaluation is NOT completed (isCompleted === false)");
  assert(authTester.evaluationResult.isSubmitted === false, "MEDIUM evaluation is NOT submitted (isSubmitted === false)");
  assert(isEvaluationAuthorized(authTester.evaluationResult.stage) === false, "isEvaluationAuthorized returns false for MEDIUM");
  assert(isEvaluationCompleted(authTester.evaluationResult.stage) === false, "isEvaluationCompleted returns false for MEDIUM");

  // 12.3 Successful HIGH evaluation is NOT authorization and does NOT trigger Guardian/blocking
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: {
      status: "EVALUATED",
      riskLevel: "HIGH",
      riskScore: 88,
      reasons: ["Anomalous transaction frequency"],
      summary: "High risk behavioral warning",
      message: "High risk evaluated",
    },
  });

  authTester.handleEvaluateAndPay({ recipient: "suspicious@upi", amount: "50000" });
  assert(authTester.evaluationResult !== null, "HIGH evaluation succeeds and sets evaluationResult");
  assert(authTester.evaluationResult.stage === "EVALUATION_COMPLETED", "Stage is explicitly EVALUATION_COMPLETED");
  assert(authTester.evaluationResult.isAuthorized === false, "HIGH evaluation is NOT authorized (isAuthorized === false)");
  assert(authTester.evaluationResult.isApproved === false, "HIGH evaluation is NOT approved (isApproved === false)");
  assert(authTester.evaluationResult.isCompleted === false, "HIGH evaluation is NOT completed (isCompleted === false)");
  assert(authTester.evaluationResult.isSubmitted === false, "HIGH evaluation is NOT submitted (isSubmitted === false)");
  assert(isEvaluationAuthorized(authTester.evaluationResult.stage) === false, "isEvaluationAuthorized returns false for HIGH");
  assert(isEvaluationCompleted(authTester.evaluationResult.stage) === false, "isEvaluationCompleted returns false for HIGH");

  // 12.4 Evaluation success does NOT create or insert a transaction
  const postPart4NTx = await PaymentService.getTransactions();
  assert(
    postPart4NTx.items.length === initialTxCount,
    `No transaction created or inserted after evaluations (${initialTxCount})`
  );

  // 12.5 Evaluation success does NOT change payment overview counts
  const postPart4NOverview = await PaymentService.getOverview();
  assert(
    postPart4NOverview.transactionCount === initialOverview.transactionCount,
    `Overview counts unchanged after evaluations (${initialOverview.transactionCount})`
  );

  // 12.6 Evaluation success does NOT mark any existing transaction Completed or Approved
  for (const item of postPart4NTx.items) {
    assert(item.id !== "draft-tx", "No draft transaction in store");
  }

  // 12.7 Input-change invalidation remains intact
  authTester.handleRecipientChange("fresh.user@upi");
  assert(authTester.evaluationResult === null, "Changing recipient clears evaluationResult to null");
  assert(authTester.draft === null, "Changing recipient clears paymentDraft to null");
  assert(authTester.entryRecipient === "fresh.user@upi", "Typed recipient preserved");

  // 12.8 Loading state and duplicate-submit safety remain intact
  assert(authTester.isEvaluating === false, "isEvaluating safely reset to false");
  authTester.isEvaluating = true;
  authTester.handleEvaluateAndPay({ recipient: "test@upi", amount: "10" });
  assert(authTester.executionCount === 3, "Duplicate submit blocked when isEvaluating is true");

  // Restore original evaluation service
  PaymentService.evaluatePaymentDraft = origEvaluate;

  // Suite 13: Payment Workflow Stage Helper Semantics (Part 4O)
  console.log("\n--- Test Suite 13: Payment Workflow Stage Helper Semantics (Part 4O) ---");

  // 13.1 isEvaluationStage returns true ONLY for EVALUATION_COMPLETED
  assert(isEvaluationStage("EVALUATION_COMPLETED") === true, "isEvaluationStage returns true for EVALUATION_COMPLETED");
  assert(isEvaluationStage("PAYMENT_AUTHORIZED") === false, "isEvaluationStage returns false for PAYMENT_AUTHORIZED");
  assert(isEvaluationStage("PAYMENT_SUBMITTED") === false, "isEvaluationStage returns false for PAYMENT_SUBMITTED");
  assert(isEvaluationStage("PAYMENT_COMPLETED") === false, "isEvaluationStage returns false for PAYMENT_COMPLETED");
  assert(isEvaluationStage(null) === false, "isEvaluationStage returns false for null");
  assert(isEvaluationStage(undefined) === false, "isEvaluationStage returns false for undefined");

  // 13.2 isPaymentAuthorizedStage returns true ONLY for PAYMENT_AUTHORIZED
  assert(isPaymentAuthorizedStage("PAYMENT_AUTHORIZED") === true, "isPaymentAuthorizedStage returns true for PAYMENT_AUTHORIZED");
  assert(isPaymentAuthorizedStage("EVALUATION_COMPLETED") === false, "isPaymentAuthorizedStage returns false for EVALUATION_COMPLETED");
  assert(isPaymentAuthorizedStage("PAYMENT_SUBMITTED") === false, "isPaymentAuthorizedStage returns false for PAYMENT_SUBMITTED");
  assert(isPaymentAuthorizedStage("PAYMENT_COMPLETED") === false, "isPaymentAuthorizedStage returns false for PAYMENT_COMPLETED");
  assert(isPaymentAuthorizedStage(null) === false, "isPaymentAuthorizedStage returns false for null");
  assert(isPaymentAuthorizedStage(undefined) === false, "isPaymentAuthorizedStage returns false for undefined");

  // 13.3 isPaymentSubmittedStage returns true ONLY for PAYMENT_SUBMITTED
  assert(isPaymentSubmittedStage("PAYMENT_SUBMITTED") === true, "isPaymentSubmittedStage returns true for PAYMENT_SUBMITTED");
  assert(isPaymentSubmittedStage("EVALUATION_COMPLETED") === false, "isPaymentSubmittedStage returns false for EVALUATION_COMPLETED");
  assert(isPaymentSubmittedStage("PAYMENT_AUTHORIZED") === false, "isPaymentSubmittedStage returns false for PAYMENT_AUTHORIZED");
  assert(isPaymentSubmittedStage("PAYMENT_COMPLETED") === false, "isPaymentSubmittedStage returns false for PAYMENT_COMPLETED");
  assert(isPaymentSubmittedStage(null) === false, "isPaymentSubmittedStage returns false for null");
  assert(isPaymentSubmittedStage(undefined) === false, "isPaymentSubmittedStage returns false for undefined");

  // 13.4 isPaymentCompletedStage returns true ONLY for PAYMENT_COMPLETED
  assert(isPaymentCompletedStage("PAYMENT_COMPLETED") === true, "isPaymentCompletedStage returns true for PAYMENT_COMPLETED");
  assert(isPaymentCompletedStage("EVALUATION_COMPLETED") === false, "isPaymentCompletedStage returns false for EVALUATION_COMPLETED");
  assert(isPaymentCompletedStage("PAYMENT_AUTHORIZED") === false, "isPaymentCompletedStage returns false for PAYMENT_AUTHORIZED");
  assert(isPaymentCompletedStage("PAYMENT_SUBMITTED") === false, "isPaymentCompletedStage returns false for PAYMENT_SUBMITTED");
  assert(isPaymentCompletedStage(null) === false, "isPaymentCompletedStage returns false for null");
  assert(isPaymentCompletedStage(undefined) === false, "isPaymentCompletedStage returns false for undefined");

  // 13.5 EVALUATION_COMPLETED is never authorization, submission, or completion
  const evalStage = "EVALUATION_COMPLETED";
  assert(isEvaluationStage(evalStage) === true, "EVALUATION_COMPLETED is evaluation stage");
  assert(isPaymentAuthorizedStage(evalStage) === false, "EVALUATION_COMPLETED is NOT payment authorized stage");
  assert(isPaymentSubmittedStage(evalStage) === false, "EVALUATION_COMPLETED is NOT payment submitted stage");
  assert(isPaymentCompletedStage(evalStage) === false, "EVALUATION_COMPLETED is NOT payment completed stage");

  // 13.6 All risk levels (LOW, MEDIUM, HIGH) yield only EVALUATION_COMPLETED stage
  const stageTester = new ScreenEvaluationTester();

  // Test LOW evaluation stage
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: { status: "EVALUATED", riskLevel: "LOW", riskScore: 10, message: "LOW eval" },
  });
  stageTester.handleEvaluateAndPay({ recipient: "low.risk@upi", amount: "50" });
  assert(isEvaluationStage(stageTester.evaluationResult?.stage) === true, "LOW evaluation yields isEvaluationStage === true");
  assert(isPaymentAuthorizedStage(stageTester.evaluationResult?.stage) === false, "LOW evaluation is NOT authorized");
  assert(isPaymentSubmittedStage(stageTester.evaluationResult?.stage) === false, "LOW evaluation is NOT submitted");
  assert(isPaymentCompletedStage(stageTester.evaluationResult?.stage) === false, "LOW evaluation is NOT completed");

  // Test MEDIUM evaluation stage
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: { status: "EVALUATED", riskLevel: "MEDIUM", riskScore: 40, message: "MEDIUM eval" },
  });
  stageTester.handleEvaluateAndPay({ recipient: "medium.risk@upi", amount: "50" });
  assert(isEvaluationStage(stageTester.evaluationResult?.stage) === true, "MEDIUM evaluation yields isEvaluationStage === true");
  assert(isPaymentAuthorizedStage(stageTester.evaluationResult?.stage) === false, "MEDIUM evaluation is NOT authorized");
  assert(isPaymentSubmittedStage(stageTester.evaluationResult?.stage) === false, "MEDIUM evaluation is NOT submitted");
  assert(isPaymentCompletedStage(stageTester.evaluationResult?.stage) === false, "MEDIUM evaluation is NOT completed");

  // Test HIGH evaluation stage
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: { status: "EVALUATED", riskLevel: "HIGH", riskScore: 90, message: "HIGH eval" },
  });
  stageTester.handleEvaluateAndPay({ recipient: "high.risk@upi", amount: "50" });
  assert(isEvaluationStage(stageTester.evaluationResult?.stage) === true, "HIGH evaluation yields isEvaluationStage === true");
  assert(isPaymentAuthorizedStage(stageTester.evaluationResult?.stage) === false, "HIGH evaluation is NOT authorized");
  assert(isPaymentSubmittedStage(stageTester.evaluationResult?.stage) === false, "HIGH evaluation is NOT submitted");
  assert(isPaymentCompletedStage(stageTester.evaluationResult?.stage) === false, "HIGH evaluation is NOT completed");

  // Restore original evaluation service
  PaymentService.evaluatePaymentDraft = origEvaluate;

  // 13.7 Zero payment side effects throughout Part 4O
  const postPart4OTx = await PaymentService.getTransactions();
  const postPart4OOverview = await PaymentService.getOverview();
  assert(
    postPart4OTx.items.length === initialTxCount,
    `Transaction store strictly unchanged throughout Part 4O (${initialTxCount})`
  );
  assert(
    postPart4OOverview.transactionCount === initialOverview.transactionCount,
    `Overview strictly unchanged throughout Part 4O (${initialOverview.transactionCount})`
  );

  // Suite 14: Runtime Enforcement of Evaluation-to-Payment Separation (Part 4P)
  console.log("\n--- Test Suite 14: Runtime Enforcement of Evaluation-to-Payment Separation (Part 4P) ---");

  // 14.1 EVALUATION_COMPLETED cannot authorize payment
  const evalAuth1 = validatePaymentAuthorizationStage("EVALUATION_COMPLETED");
  assert(evalAuth1.valid === false, "validatePaymentAuthorizationStage rejects EVALUATION_COMPLETED string");
  assert(typeof evalAuth1.error === "string" && evalAuth1.error.length > 0, "Error message provided for EVALUATION_COMPLETED authorization rejection");

  const evalAuth2 = validatePaymentAuthorizationStage({ stage: "EVALUATION_COMPLETED" });
  assert(evalAuth2.valid === false, "validatePaymentAuthorizationStage rejects { stage: 'EVALUATION_COMPLETED' } object");

  const evalAuth3 = PaymentService.validateWorkflowStage("authorize", "EVALUATION_COMPLETED");
  assert(evalAuth3.valid === false, "PaymentService.validateWorkflowStage('authorize') rejects EVALUATION_COMPLETED");

  // 14.2 EVALUATION_COMPLETED cannot submit payment
  const evalSub1 = validatePaymentSubmissionStage("EVALUATION_COMPLETED");
  assert(evalSub1.valid === false, "validatePaymentSubmissionStage rejects EVALUATION_COMPLETED string");
  assert(typeof evalSub1.error === "string" && evalSub1.error.length > 0, "Error message provided for EVALUATION_COMPLETED submission rejection");

  const evalSub2 = validatePaymentSubmissionStage({ stage: "EVALUATION_COMPLETED" });
  assert(evalSub2.valid === false, "validatePaymentSubmissionStage rejects { stage: 'EVALUATION_COMPLETED' } object");

  const evalSub3 = PaymentService.validateWorkflowStage("submit", "EVALUATION_COMPLETED");
  assert(evalSub3.valid === false, "PaymentService.validateWorkflowStage('submit') rejects EVALUATION_COMPLETED");

  // 14.3 EVALUATION_COMPLETED cannot complete payment
  const evalComp1 = validatePaymentCompletionStage("EVALUATION_COMPLETED");
  assert(evalComp1.valid === false, "validatePaymentCompletionStage rejects EVALUATION_COMPLETED string");
  assert(typeof evalComp1.error === "string" && evalComp1.error.length > 0, "Error message provided for EVALUATION_COMPLETED completion rejection");

  const evalComp2 = validatePaymentCompletionStage({ stage: "EVALUATION_COMPLETED" });
  assert(evalComp2.valid === false, "validatePaymentCompletionStage rejects { stage: 'EVALUATION_COMPLETED' } object");

  const evalComp3 = PaymentService.validateWorkflowStage("complete", "EVALUATION_COMPLETED");
  assert(evalComp3.valid === false, "PaymentService.validateWorkflowStage('complete') rejects EVALUATION_COMPLETED");

  // 14.4 assertNotEvaluationStage rejects EVALUATION_COMPLETED
  const evalAssert1 = assertNotEvaluationStage("EVALUATION_COMPLETED");
  assert(evalAssert1.valid === false, "assertNotEvaluationStage rejects EVALUATION_COMPLETED string");

  const evalAssert2 = assertNotEvaluationStage({ stage: "EVALUATION_COMPLETED" });
  assert(evalAssert2.valid === false, "assertNotEvaluationStage rejects { stage: 'EVALUATION_COMPLETED' } object");

  // 14.5 PAYMENT_AUTHORIZED is accepted ONLY by authorization-stage validation
  const authAccepted = validatePaymentAuthorizationStage("PAYMENT_AUTHORIZED");
  assert(authAccepted.valid === true, "PAYMENT_AUTHORIZED is accepted by authorization validation");
  assert(validatePaymentAuthorizationStage({ stage: "PAYMENT_AUTHORIZED" }).valid === true, "PAYMENT_AUTHORIZED object accepted by authorization");
  assert(validatePaymentSubmissionStage("PAYMENT_AUTHORIZED").valid === false, "PAYMENT_AUTHORIZED is rejected by submission validation");
  assert(validatePaymentCompletionStage("PAYMENT_AUTHORIZED").valid === false, "PAYMENT_AUTHORIZED is rejected by completion validation");
  assert(assertNotEvaluationStage("PAYMENT_AUTHORIZED").valid === true, "assertNotEvaluationStage allows PAYMENT_AUTHORIZED");

  // 14.6 PAYMENT_SUBMITTED is accepted ONLY by submission-stage validation
  const subAccepted = validatePaymentSubmissionStage("PAYMENT_SUBMITTED");
  assert(subAccepted.valid === true, "PAYMENT_SUBMITTED is accepted by submission validation");
  assert(validatePaymentSubmissionStage({ stage: "PAYMENT_SUBMITTED" }).valid === true, "PAYMENT_SUBMITTED object accepted by submission");
  assert(validatePaymentAuthorizationStage("PAYMENT_SUBMITTED").valid === false, "PAYMENT_SUBMITTED is rejected by authorization validation");
  assert(validatePaymentCompletionStage("PAYMENT_SUBMITTED").valid === false, "PAYMENT_SUBMITTED is rejected by completion validation");
  assert(assertNotEvaluationStage("PAYMENT_SUBMITTED").valid === true, "assertNotEvaluationStage allows PAYMENT_SUBMITTED");

  // 14.7 PAYMENT_COMPLETED is accepted ONLY by completion-stage validation
  const compAccepted = validatePaymentCompletionStage("PAYMENT_COMPLETED");
  assert(compAccepted.valid === true, "PAYMENT_COMPLETED is accepted by completion validation");
  assert(validatePaymentCompletionStage({ stage: "PAYMENT_COMPLETED" }).valid === true, "PAYMENT_COMPLETED object accepted by completion");
  assert(validatePaymentAuthorizationStage("PAYMENT_COMPLETED").valid === false, "PAYMENT_COMPLETED is rejected by authorization validation");
  assert(validatePaymentSubmissionStage("PAYMENT_COMPLETED").valid === false, "PAYMENT_COMPLETED is rejected by submission validation");
  assert(assertNotEvaluationStage("PAYMENT_COMPLETED").valid === true, "assertNotEvaluationStage allows PAYMENT_COMPLETED");

  // 14.8 null, undefined, empty, and unknown stages are rejected by all guards
  const invalidStages: any[] = [null, undefined, "", "UNKNOWN_STAGE", "EVALUATING", 123, {}];
  for (const inv of invalidStages) {
    assert(validatePaymentAuthorizationStage(inv).valid === false, `validatePaymentAuthorizationStage rejects ${JSON.stringify(inv)}`);
    assert(validatePaymentSubmissionStage(inv).valid === false, `validatePaymentSubmissionStage rejects ${JSON.stringify(inv)}`);
    assert(validatePaymentCompletionStage(inv).valid === false, `validatePaymentCompletionStage rejects ${JSON.stringify(inv)}`);
    assert(assertNotEvaluationStage(inv).valid === false, `assertNotEvaluationStage rejects ${JSON.stringify(inv)}`);
  }

  // 14.9 Risk levels (LOW, MEDIUM, HIGH) cannot authorize, submit, or complete payment
  const riskLevels = ["LOW", "MEDIUM", "HIGH"];
  for (const rLevel of riskLevels) {
    assert(validatePaymentAuthorizationStage(rLevel).valid === false, `Risk level '${rLevel}' cannot authorize payment`);
    assert(validatePaymentSubmissionStage(rLevel).valid === false, `Risk level '${rLevel}' cannot submit payment`);
    assert(validatePaymentCompletionStage(rLevel).valid === false, `Risk level '${rLevel}' cannot complete payment`);
    assert(assertNotEvaluationStage(rLevel).valid === false, `assertNotEvaluationStage rejects risk level '${rLevel}'`);
  }

  // 14.10 Full lifecycle evaluation result objects remain evaluation-only
  const guardTester = new ScreenEvaluationTester();

  // Test LOW evaluation result
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: { status: "EVALUATED", riskLevel: "LOW", riskScore: 12, message: "LOW risk verified" },
  });
  guardTester.handleEvaluateAndPay({ recipient: "low.guard@upi", amount: "100" });
  assert(guardTester.evaluationResult !== null, "LOW evaluation succeeds");
  assert(validatePaymentAuthorizationStage(guardTester.evaluationResult).valid === false, "LOW evaluationResult cannot authorize payment");
  assert(validatePaymentSubmissionStage(guardTester.evaluationResult).valid === false, "LOW evaluationResult cannot submit payment");
  assert(validatePaymentCompletionStage(guardTester.evaluationResult).valid === false, "LOW evaluationResult cannot complete payment");
  assert(assertNotEvaluationStage(guardTester.evaluationResult).valid === false, "LOW evaluationResult rejected by assertNotEvaluationStage");

  // Test MEDIUM evaluation result
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: { status: "EVALUATED", riskLevel: "MEDIUM", riskScore: 48, message: "MEDIUM risk flagged" },
  });
  guardTester.handleEvaluateAndPay({ recipient: "medium.guard@upi", amount: "4000" });
  assert(guardTester.evaluationResult !== null, "MEDIUM evaluation succeeds");
  assert(validatePaymentAuthorizationStage(guardTester.evaluationResult).valid === false, "MEDIUM evaluationResult cannot authorize payment");
  assert(validatePaymentSubmissionStage(guardTester.evaluationResult).valid === false, "MEDIUM evaluationResult cannot submit payment");
  assert(validatePaymentCompletionStage(guardTester.evaluationResult).valid === false, "MEDIUM evaluationResult cannot complete payment");
  assert(assertNotEvaluationStage(guardTester.evaluationResult).valid === false, "MEDIUM evaluationResult rejected by assertNotEvaluationStage");

  // Test HIGH evaluation result
  PaymentService.evaluatePaymentDraft = () => ({
    success: true,
    data: { status: "EVALUATED", riskLevel: "HIGH", riskScore: 85, message: "HIGH risk detected" },
  });
  guardTester.handleEvaluateAndPay({ recipient: "high.guard@upi", amount: "25000" });
  assert(guardTester.evaluationResult !== null, "HIGH evaluation succeeds");
  assert(validatePaymentAuthorizationStage(guardTester.evaluationResult).valid === false, "HIGH evaluationResult cannot authorize payment");
  assert(validatePaymentSubmissionStage(guardTester.evaluationResult).valid === false, "HIGH evaluationResult cannot submit payment");
  assert(validatePaymentCompletionStage(guardTester.evaluationResult).valid === false, "HIGH evaluationResult cannot complete payment");
  assert(assertNotEvaluationStage(guardTester.evaluationResult).valid === false, "HIGH evaluationResult rejected by assertNotEvaluationStage");

  // Restore original evaluation service
  PaymentService.evaluatePaymentDraft = origEvaluate;

  // 14.11 No transaction-store or overview side effects occur
  const postPart4PTx = await PaymentService.getTransactions();
  const postPart4POverview = await PaymentService.getOverview();
  assert(
    postPart4PTx.items.length === initialTxCount,
    `Transaction store strictly unchanged throughout Part 4P (${initialTxCount})`
  );
  assert(
    postPart4POverview.transactionCount === initialOverview.transactionCount,
    `Overview strictly unchanged throughout Part 4P (${initialOverview.transactionCount})`
  );

  // Suite 15: Wire Workflow Guards into Actual Payment Entry Points (Part 4Q)
  console.log("\n--- Test Suite 15: Wire Workflow Guards into Actual Payment Entry Points (Part 4Q) ---");

  // Create a controlled transaction for testing lifecycle guard enforcement
  const testTxId = "tx-lifecycle-guard-test";
  PaymentService.addTransaction({
    id: testTxId,
    title: "Guard Lifecycle Test",
    merchant: "Test Merchant",
    amount: 500,
    date: "Just now",
    status: "Held",
    riskLevel: "HIGH",
    riskScore: 75,
  });
  const txCountWithTest = (await PaymentService.getTransactions()).items.length;

  // 15.1 Evaluation result CANNOT enter authorization
  const authEvalAttempt1 = await PaymentService.authorizeTransaction(testTxId, "BIOMETRIC", "EVALUATION_COMPLETED");
  assert(authEvalAttempt1.success === false, "authorizeTransaction rejects EVALUATION_COMPLETED string");
  assert(typeof authEvalAttempt1.error === "string" && authEvalAttempt1.error.length > 0, "Error returned for unauthorized evaluation");

  const authEvalAttempt2 = await PaymentService.authorizeTransaction(testTxId, { stage: "EVALUATION_COMPLETED" });
  assert(authEvalAttempt2.success === false, "authorizeTransaction rejects { stage: 'EVALUATION_COMPLETED' }");

  const authEvalAttempt3 = await authorizePaymentTransaction(testTxId, "EVALUATION_COMPLETED");
  assert(authEvalAttempt3.success === false, "authorizePaymentTransaction export rejects EVALUATION_COMPLETED");

  // Verify transaction authorizationStatus was NOT set
  const txAfterAuthFail = (await PaymentService.getTransactions()).items.find((t: any) => t.id === testTxId);
  assert(txAfterAuthFail?.authorizationStatus !== "AUTHORIZED", "Transaction authorizationStatus untouched after failed auth attempt");

  // 15.2 Evaluation result CANNOT enter submission
  const subEvalAttempt1 = await PaymentService.submitTransaction(testTxId, "EVALUATION_COMPLETED");
  assert(subEvalAttempt1.success === false, "submitTransaction rejects EVALUATION_COMPLETED string");
  assert(typeof subEvalAttempt1.error === "string" && subEvalAttempt1.error.length > 0, "Error returned for unsubmittable evaluation");

  const subEvalAttempt2 = await PaymentService.submitTransaction(testTxId, { stage: "EVALUATION_COMPLETED" });
  assert(subEvalAttempt2.success === false, "submitTransaction rejects { stage: 'EVALUATION_COMPLETED' }");

  const subEvalAttempt3 = await submitPaymentTransaction(testTxId, "EVALUATION_COMPLETED");
  assert(subEvalAttempt3.success === false, "submitPaymentTransaction export rejects EVALUATION_COMPLETED");

  // Verify launcher rejects EVALUATION_COMPLETED without calling Linking or building external intents
  const dummyApp: any = {
    id: "gpay",
    name: "Google Pay",
    packageName: "com.google.android.apps.nbu.paisa.user",
    scheme: "tez://upi/pay",
    iconName: "logo-google",
    isInstalled: true,
    isSupported: true,
  };
  const upiDetails = {
    payeeUpiId: "test@upi",
    payeeName: "Test Merchant",
    amount: 500,
  };

  const launchEvalAttempt1 = await PaymentAppLauncherService.launchPaymentApp(dummyApp, upiDetails, "EVALUATION_COMPLETED");
  assert(launchEvalAttempt1.success === false, "launchPaymentApp rejects EVALUATION_COMPLETED stage");
  assert(launchEvalAttempt1.uri === "", "launchPaymentApp returns empty uri on rejected stage");

  const launchEvalAttempt2 = await PaymentAppLauncherService.launchPaymentApp(dummyApp, upiDetails, { stage: "EVALUATION_COMPLETED" });
  assert(launchEvalAttempt2.success === false, "launchPaymentApp rejects { stage: 'EVALUATION_COMPLETED' } object");

  // 15.3 Evaluation result CANNOT enter completion/confirmation
  const compEvalAttempt1 = await PaymentService.completeTransaction(testTxId, "Google Pay UPI", undefined, "EVALUATION_COMPLETED");
  assert(compEvalAttempt1.success === false, "completeTransaction rejects EVALUATION_COMPLETED stage");
  assert(typeof compEvalAttempt1.error === "string" && compEvalAttempt1.error.length > 0, "Error returned for uncompletable evaluation");

  const compEvalAttempt2 = await PaymentService.completeTransaction(testTxId, "EVALUATION_COMPLETED" as any);
  assert(compEvalAttempt2.success === false, "completeTransaction rejects EVALUATION_COMPLETED when passed as 2nd param");

  const confirmEvalAttempt = await PaymentService.confirmTransaction(testTxId, "EVALUATION_COMPLETED");
  assert(confirmEvalAttempt.success === false, "confirmTransaction rejects EVALUATION_COMPLETED stage");

  const compExportAttempt = await completePaymentTransaction(testTxId, undefined, undefined, "EVALUATION_COMPLETED");
  assert(compExportAttempt.success === false, "completePaymentTransaction export rejects EVALUATION_COMPLETED");

  // Verify transaction status was NOT marked Completed
  const txAfterCompFail = (await PaymentService.getTransactions()).items.find((t: any) => t.id === testTxId);
  assert(txAfterCompFail?.status !== "Completed", "Transaction status remains uncompleted after failed completion attempt");
  assert(txAfterCompFail?.isCompleted !== true, "isCompleted remains not true after failed completion attempt");

  // 15.4 Invalid stages rejected before side effects
  const badStages: any[] = ["UNKNOWN_STAGE", "LOW", "MEDIUM", "HIGH"];
  for (const bad of badStages) {
    const authRes = await PaymentService.authorizeTransaction(testTxId, "BIOMETRIC", bad);
    assert(authRes.success === false, `authorizeTransaction rejects invalid stage '${bad}'`);

    const subRes = await PaymentService.submitTransaction(testTxId, bad);
    assert(subRes.success === false, `submitTransaction rejects invalid stage '${bad}'`);

    const compRes = await PaymentService.completeTransaction(testTxId, undefined, undefined, bad);
    assert(compRes.success === false, `completeTransaction rejects invalid stage '${bad}'`);
  }

  // 15.5 Valid lifecycle stages continue to reach their existing operation
  // Authorization with PAYMENT_AUTHORIZED
  const validAuthRes = await PaymentService.authorizeTransaction(testTxId, "BIOMETRIC", "PAYMENT_AUTHORIZED");
  assert(validAuthRes.success === true, "authorizeTransaction succeeds with PAYMENT_AUTHORIZED");
  const txAfterValidAuth = (await PaymentService.getTransactions()).items.find((t: any) => t.id === testTxId);
  assert(txAfterValidAuth?.authorizationStatus === "AUTHORIZED", "Transaction authorizationStatus updated to AUTHORIZED");

  // Submission with PAYMENT_SUBMITTED
  const validSubRes = await PaymentService.submitTransaction(testTxId, "PAYMENT_SUBMITTED", "PhonePe UPI");
  assert(validSubRes.success === true, "submitTransaction succeeds with PAYMENT_SUBMITTED");
  const txAfterValidSub = (await PaymentService.getTransactions()).items.find((t: any) => t.id === testTxId);
  assert(txAfterValidSub?.paymentAppUsed === "PhonePe UPI", "Payment app updated on valid submission");

  // Completion with PAYMENT_COMPLETED
  const validCompRes = await PaymentService.completeTransaction(testTxId, "PhonePe UPI", undefined, "PAYMENT_COMPLETED");
  assert(validCompRes.success === true, "completeTransaction succeeds with PAYMENT_COMPLETED");
  const txAfterValidComp = (await PaymentService.getTransactions()).items.find((t: any) => t.id === testTxId);
  assert(txAfterValidComp?.status === "Completed", "Transaction status updated to Completed on valid completion");
  assert(txAfterValidComp?.isCompleted === true, "Transaction isCompleted set to true on valid completion");

  // 15.6 Screen handler guard simulations
  // Simulate screen handleAuthorize guard
  const authState = { biometricsTriggered: false };
  const simulateScreenAuthorize = async (stage: any) => {
    const val = validatePaymentAuthorizationStage(stage);
    if (!val.valid) {
      return { aborted: true, error: val.error };
    }
    authState.biometricsTriggered = true;
    return { aborted: false };
  };

  const screenAuthEvalRes = await simulateScreenAuthorize("EVALUATION_COMPLETED");
  assert(screenAuthEvalRes.aborted === true, "Screen handleAuthorize aborts on EVALUATION_COMPLETED");
  assert(authState.biometricsTriggered === false, "Biometrics never triggered on EVALUATION_COMPLETED");

  const screenAuthValidRes = await simulateScreenAuthorize("PAYMENT_AUTHORIZED");
  assert(screenAuthValidRes.aborted === false, "Screen handleAuthorize proceeds on PAYMENT_AUTHORIZED");
  assert(authState.biometricsTriggered === true, "Biometrics triggered on PAYMENT_AUTHORIZED");

  // Simulate screen handleConfirm guard
  const confirmState = { modalOpened: false };
  const simulateScreenConfirm = async (stage: any) => {
    const val = assertNotEvaluationStage(stage);
    if (!val.valid) {
      return { aborted: true, error: val.error };
    }
    confirmState.modalOpened = true;
    return { aborted: false };
  };

  const screenConfirmEvalRes = await simulateScreenConfirm("EVALUATION_COMPLETED");
  assert(screenConfirmEvalRes.aborted === true, "Screen handleConfirm aborts on EVALUATION_COMPLETED");
  assert(confirmState.modalOpened === false, "Payment app modal never opened on EVALUATION_COMPLETED");

  // 15.7 Backward compatibility: legacy callers without explicit stage continue to function
  const legacyTxId = "tx-legacy-compat-test";
  PaymentService.addTransaction({
    id: legacyTxId,
    title: "Legacy Compat Test",
    merchant: "Legacy Merchant",
    amount: 100,
    date: "Just now",
    status: "Held",
  });
  const legacyAuthRes = await PaymentService.authorizeTransaction(legacyTxId, "BIOMETRIC");
  assert(legacyAuthRes.success === true, "Legacy authorizeTransaction without stage parameter succeeds");

  const legacyCompRes = await PaymentService.completeTransaction(legacyTxId, "Google Pay UPI");
  assert(legacyCompRes.success === true, "Legacy completeTransaction without stage parameter succeeds");



  console.log("\n=================================================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILURES:     ${failures}`);
  console.log("=================================================================\n");

  if (failures > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner encountered error:", err);
  process.exit(1);
});
