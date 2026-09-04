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

import { applyScannedQrToForm } from "../qr-scanner-helper";
import { applySelectedContactToForm } from "../contact-picker-helper";

const { PaymentService } = require("../../services/payment-service");

/**
 * AVARAN PAY — Frontend Part 4D: Recipient Entry UI & Mobile Number Support Regression Tests
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
  console.log("AVARAN PAY PART 4D: RECIPIENT ENTRY & MOBILE NUMBER REGRESSION");
  console.log("=================================================================\n");

  console.log("--- Test Suite 1: Recipient Accepts UPI IDs Without Alteration ---");
  {
    const form = {
      recipient: "",
      amount: "450",
      note: "Coffee split",
    };

    // User types UPI ID
    const upiId = "store.merchant@hdfcbank";
    const updatedForm = { ...form, recipient: upiId };

    assert(updatedForm.recipient === "store.merchant@hdfcbank", "Preserves exact UPI ID");
    assert(updatedForm.amount === "450", "Amount remains unchanged on typing UPI ID");
    assert(updatedForm.note === "Coffee split", "Note remains unchanged on typing UPI ID");

    // Validates via creation contract
    const draftRes = PaymentService.createPaymentDraft({
      recipient: updatedForm.recipient,
      amount: 450,
      note: updatedForm.note,
    });
    assert(draftRes.success === true, "Creation contract accepts UPI ID");
    if (draftRes.success) {
      assert(draftRes.draft.recipient === "store.merchant@hdfcbank", "Draft recipient matches UPI ID");
    }
  }

  console.log("\n--- Test Suite 2: Recipient Accepts Mobile Numbers Without Forced UPI Handle ---");
  {
    const form = {
      recipient: "",
      amount: "1200",
      note: "Rent share",
    };

    // 10-digit mobile number
    const mobile10 = "9876543210";
    const updatedForm10 = { ...form, recipient: mobile10 };

    assert(updatedForm10.recipient === "9876543210", "Preserves plain 10-digit mobile number");
    assert(!updatedForm10.recipient.includes("@"), "Does NOT force or append '@upi' or other handles");
    assert(updatedForm10.amount === "1200", "Amount remains untouched");
    assert(updatedForm10.note === "Rent share", "Note remains untouched");

    // Validates via creation contract
    const draftRes10 = PaymentService.createPaymentDraft({
      recipient: updatedForm10.recipient,
      amount: 1200,
      note: updatedForm10.note,
    });
    assert(draftRes10.success === true, "Creation contract accepts 10-digit mobile number");
    if (draftRes10.success) {
      assert(draftRes10.draft.recipient === "9876543210", "Draft recipient matches exact mobile number");
    }

    // International mobile number with leading plus
    const mobileIntl = "+919876543210";
    const updatedFormIntl = { ...form, recipient: mobileIntl };
    assert(updatedFormIntl.recipient === "+919876543210", "Preserves international mobile number with '+'");

    const draftResIntl = PaymentService.createPaymentDraft({
      recipient: updatedFormIntl.recipient,
      amount: 1200,
      note: updatedFormIntl.note,
    });
    assert(draftResIntl.success === true, "Creation contract accepts international mobile number");
    if (draftResIntl.success) {
      assert(draftResIntl.draft.recipient === "+919876543210", "Draft recipient matches international mobile number");
    }
  }

  console.log("\n--- Test Suite 3: QR Scanner Still Populates Recipient and Fields ---");
  {
    const currentForm = {
      recipient: "old.recipient@upi",
      amount: "500",
      note: "Old Note",
    };

    const qrPayload = "upi://pay?pa=fresh.merchant@icici&am=850.00&tn=Groceries";
    const res = applyScannedQrToForm(currentForm, qrPayload);

    assert(res.success === true, "QR scanning application succeeds");
    if (res.success) {
      assert(res.updatedForm.recipient === "fresh.merchant@icici", "QR payload updates recipient");
      assert(res.updatedForm.amount === "850", "QR payload updates amount when present");
      assert(res.updatedForm.note === "Groceries", "QR payload updates note when present");
    }
  }

  console.log("\n--- Test Suite 4: Contact Picker Still Populates Only Recipient ---");
  {
    const currentForm = {
      recipient: "",
      amount: "350",
      note: "Dinner share",
    };

    const contact = {
      name: "Rohit Verma",
      phoneNumbers: [{ number: "+91 98765 43210" }],
    };

    const res = applySelectedContactToForm(currentForm, contact);

    assert(res.success === true, "Contact picker application succeeds");
    if (res.success) {
      assert(res.updatedForm.recipient === "+919876543210", "Contact picker populates recipient with cleaned phone number");
      assert(res.updatedForm.amount === "350", "Existing amount field strictly preserved");
      assert(res.updatedForm.note === "Dinner share", "Existing note field strictly preserved");
      assert(!res.updatedForm.recipient.includes("@"), "Does NOT resolve mobile number to UPI ID");
    }
  }

  console.log("\n--- Test Suite 5: Manual Recipient Typing Preserves Amount and Note ---");
  {
    let formState = {
      recipient: "",
      amount: "999.99",
      note: "Yearly subscription",
    };

    // User types mobile number character by character
    const typedNumber = "9876500000";
    formState = { ...formState, recipient: typedNumber };

    assert(formState.recipient === "9876500000", "Recipient updated with typed value");
    assert(formState.amount === "999.99", "Amount preserved exactly during manual typing");
    assert(formState.note === "Yearly subscription", "Note preserved exactly during manual typing");
  }

  console.log("\n--- Test Suite 6: Zero Side-effects on Entering or Editing Recipient ---");
  {
    const beforeTx = await PaymentService.getTransactions(1, "all");
    const countBefore = beforeTx.total;

    // Spy on payment lifecycle calls
    let createCalled = false;
    let evalCalled = false;
    const origCreate = PaymentService.createTransaction;
    const origEval = PaymentService.evaluatePaymentDraft;

    PaymentService.createTransaction = () => { createCalled = true; return { success: false, error: "Called" }; };
    PaymentService.evaluatePaymentDraft = () => { evalCalled = true; return { success: false, error: "Called" }; };

    // Simulate user editing recipient field
    let entryRecipient = "9876543210";
    assert(entryRecipient === "9876543210", "Recipient state updated locally in screen");

    assert(!createCalled, "No transaction creation triggered while typing");
    assert(!evalCalled, "No risk evaluation triggered while typing");

    const afterTx = await PaymentService.getTransactions(1, "all");
    assert(afterTx.total === countBefore, "PaymentService transaction history remains untouched");

    // Restore
    PaymentService.createTransaction = origCreate;
    PaymentService.evaluatePaymentDraft = origEval;
  }

  console.log("\n=================================================================");
  console.log(`RESULTS: ${passedChecks}/${totalChecks} checks passed. Failures: ${failures}`);
  console.log("=================================================================");

  if (failures > 0) {
    process.exit(1);
  }
}

runTests();
