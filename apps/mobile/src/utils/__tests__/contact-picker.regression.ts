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

import {
  extractFirstPhoneNumber,
  cleanPhoneNumber,
  applySelectedContactToForm,
  handleContactSelectionOutcome,
  PaymentFormFields,
  ContactFormApplyResult,
} from "../contact-picker-helper";

const { PaymentService } = require("../../services/payment-service");

/**
 * AVARAN PAY — Frontend Part 4C: Contact Picker Input Contract Regression Tests
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
  console.log("AVARAN PAY PART 4C: CONTACT PICKER INPUT REGRESSION");
  console.log("=================================================================\n");

  console.log("--- Test Suite 1: Phone Number Extraction & Cleaning ---");
  {
    // Clean formatted numbers
    assert(cleanPhoneNumber("+91 98765 43210") === "+919876543210", "Cleans international format with spaces");
    assert(cleanPhoneNumber("(022) 2456-7890") === "02224567890", "Cleans parentheses and dashes");
    assert(cleanPhoneNumber("+1-202-555-0123") === "+12025550123", "Cleans US format with hyphens");
    assert(cleanPhoneNumber("9876543210") === "9876543210", "Preserves plain 10-digit number");
    assert(cleanPhoneNumber("   9876543210   ") === "9876543210", "Trims extraneous whitespace");

    // Invalid or unusable phone numbers
    assert(cleanPhoneNumber("") === null, "Rejects empty string");
    assert(cleanPhoneNumber("   ") === null, "Rejects whitespace-only string");
    assert(cleanPhoneNumber("---") === null, "Rejects punctuation-only string");
    assert(cleanPhoneNumber("12") === null, "Rejects string with fewer than 3 digits");
    assert(cleanPhoneNumber(null) === null, "Rejects null");
    assert(cleanPhoneNumber(undefined) === null, "Rejects undefined");

    // Extraction from various contact object shapes
    const legacyContact = {
      name: "Rahul Sharma",
      phoneNumbers: [{ number: "+91 98765 43210", label: "mobile" }],
    };
    assert(extractFirstPhoneNumber(legacyContact) === "+919876543210", "Extracts from legacy phoneNumbers array");

    const nextContact = {
      name: "Priya Patel",
      phones: [{ number: "98765-12345", label: "work" }],
    };
    assert(extractFirstPhoneNumber(nextContact) === "9876512345", "Extracts from next phones array");

    const digitsOnlyContact = {
      phoneNumbers: [{ digits: "9988776655" }],
    };
    assert(extractFirstPhoneNumber(digitsOnlyContact) === "9988776655", "Extracts digits field when number is absent");

    const multiPhoneContact = {
      phoneNumbers: [
        { number: "+91 98111 22334", label: "primary" },
        { number: "+91 98222 33445", label: "secondary" },
      ],
    };
    assert(extractFirstPhoneNumber(multiPhoneContact) === "+919811122334", "Extracts first usable phone number");

    const directPropertyContact = {
      name: "Anita",
      phoneNumber: "+91 90000 11111",
    };
    assert(extractFirstPhoneNumber(directPropertyContact) === "+919000011111", "Extracts from phoneNumber property");
  }

  console.log("\n--- Test Suite 2: Selected Contact with Phone Number Populates ONLY Recipient ---");
  {
    const initialForm: PaymentFormFields = {
      recipient: "",
      amount: "500",
      note: "Dinner split",
    };
    const contact = {
      name: "Aditi Rao",
      phoneNumbers: [{ number: "+91 98765 43210" }],
    };

    const res: ContactFormApplyResult = applySelectedContactToForm(initialForm, contact);

    assert(res.success === true, "Contact selection application succeeds");
    if (res.success) {
      assert(res.updatedForm.recipient === "+919876543210", "Recipient field is populated with phone number");
      assert(res.updatedForm.amount === "500", "Existing amount field remains strictly unchanged");
      assert(res.updatedForm.note === "Dinner split", "Existing note field remains strictly unchanged");
      assert(!res.updatedForm.recipient.includes("@"), "Does NOT assume phone number is UPI ID or append handle");
    }
  }

  console.log("\n--- Test Suite 3: Existing Amount Remains Unchanged When Recipient Overwritten ---");
  {
    const initialForm: PaymentFormFields = {
      recipient: "existing@upi",
      amount: "1250.75",
      note: "Rent contribution",
    };
    const contact = {
      phones: [{ number: "9123456789" }],
    };

    const res = applySelectedContactToForm(initialForm, contact);
    assert(res.success === true, "Apply succeeds for replacement");
    if (res.success) {
      assert(res.updatedForm.recipient === "9123456789", "Recipient replaced cleanly");
      assert(res.updatedForm.amount === "1250.75", "Existing decimal amount strictly preserved");
      assert(res.updatedForm.note === "Rent contribution", "Existing note strictly preserved");
    }
  }

  console.log("\n--- Test Suite 4: Existing Note Remains Unchanged ---");
  {
    const initialForm: PaymentFormFields = {
      recipient: "",
      amount: "",
      note: "Grocery reimbursement - September",
    };
    const contact = {
      phoneNumbers: [{ number: "+91 99887 76655" }],
    };

    const res = applySelectedContactToForm(initialForm, contact);
    assert(res.success === true, "Apply succeeds");
    if (res.success) {
      assert(res.updatedForm.recipient === "+919988776655", "Recipient populated");
      assert(res.updatedForm.amount === "", "Empty amount preserved");
      assert(res.updatedForm.note === "Grocery reimbursement - September", "Existing long note preserved");
    }
  }

  console.log("\n--- Test Suite 5: Contact Without Usable Phone Leaves Form Unchanged ---");
  {
    const initialForm: PaymentFormFields = {
      recipient: "initial@bank",
      amount: "300",
      note: "Movie ticket",
    };

    // Contact with empty phone array
    const emptyPhonesContact = { name: "Ghost User", phoneNumbers: [] };
    const res1 = applySelectedContactToForm(initialForm, emptyPhonesContact);
    assert(res1.success === false, "Fails when phone numbers array is empty");
    assert(res1.updatedForm.recipient === "initial@bank", "Recipient unchanged on missing phone");
    assert(res1.updatedForm.amount === "300", "Amount unchanged on missing phone");
    assert(res1.updatedForm.note === "Movie ticket", "Note unchanged on missing phone");
    if (!res1.success) {
      assert(res1.error === "Selected contact has no usable phone number", "Provides clear concise error message");
    }

    // Contact with invalid phone strings
    const invalidPhonesContact = {
      name: "Bad Phone User",
      phoneNumbers: [{ number: "   " }, { number: "---" }],
    };
    const res2 = applySelectedContactToForm(initialForm, invalidPhonesContact);
    assert(res2.success === false, "Fails when phone numbers contain only invalid punctuation");
    assert(res2.updatedForm.recipient === "initial@bank", "Recipient unchanged on invalid phone");

    // Contact with null object
    const res3 = applySelectedContactToForm(initialForm, null);
    assert(res3.success === false, "Fails gracefully when null contact passed");
    assert(res3.updatedForm.recipient === "initial@bank", "Recipient unchanged on null contact");
  }

  console.log("\n--- Test Suite 6: User Cancellation Leaves Form Unchanged ---");
  {
    const initialForm: PaymentFormFields = {
      recipient: "user@okaxis",
      amount: "750",
      note: "Electricity bill",
    };

    // User taps cancel in native contact picker (returns null or undefined)
    const cancelOutcome1 = handleContactSelectionOutcome(initialForm, null);
    assert("cancelled" in cancelOutcome1 && cancelOutcome1.cancelled === true, "Identifies cancelled selection");
    assert(cancelOutcome1.updatedForm.recipient === "user@okaxis", "Recipient untouched on user cancel");
    assert(cancelOutcome1.updatedForm.amount === "750", "Amount untouched on user cancel");
    assert(cancelOutcome1.updatedForm.note === "Electricity bill", "Note untouched on user cancel");

    const cancelOutcome2 = handleContactSelectionOutcome(initialForm, undefined);
    assert("cancelled" in cancelOutcome2 && cancelOutcome2.cancelled === true, "Identifies undefined outcome as cancelled");
    assert(cancelOutcome2.updatedForm.recipient === "user@okaxis", "Recipient untouched on undefined");
  }

  console.log("\n--- Test Suite 7: Permission Denied Simulation Leaves Form Unchanged ---");
  {
    const initialForm: PaymentFormFields = {
      recipient: "merchant@upi",
      amount: "100",
      note: "Coffee",
    };

    // Simulated permission handler logic
    const handlePickWithPermission = (
      form: PaymentFormFields,
      permissionResponse: { granted: boolean; status: string }
    ): { form: PaymentFormFields; toastDispatched: string | null } => {
      if (!permissionResponse.granted) {
        return {
          form: { ...form },
          toastDispatched: "Contacts permission is required to select a contact",
        };
      }
      return { form, toastDispatched: null };
    };

    const denied = handlePickWithPermission(initialForm, { granted: false, status: "denied" });
    assert(denied.form.recipient === "merchant@upi", "Form recipient unchanged on permission denied");
    assert(denied.form.amount === "100", "Form amount unchanged on permission denied");
    assert(denied.form.note === "Coffee", "Form note unchanged on permission denied");
    assert(denied.toastDispatched === "Contacts permission is required to select a contact", "Warning toast dispatched on permission denied");

    const undetermined = handlePickWithPermission(initialForm, { granted: false, status: "undetermined" });
    assert(undetermined.form.recipient === "merchant@upi", "Form recipient unchanged on permission dismissed");
    assert(undetermined.toastDispatched !== null, "Warning toast dispatched on permission dismissed");
  }

  console.log("\n--- Test Suite 8: Zero Transaction / Payment Lifecycle Side Effects ---");
  {
    // Snapshot initial state
    const beforeTx = await PaymentService.getTransactions(1, "all");
    const countBefore = beforeTx.total;

    // Spy on createTransaction, createPaymentDraft, evaluatePaymentDraft
    let createCalled = false;
    let draftCalled = false;
    let evalCalled = false;
    const origCreate = PaymentService.createTransaction;
    const origDraft = PaymentService.createPaymentDraft;
    const origEval = PaymentService.evaluatePaymentDraft;

    PaymentService.createTransaction = () => { createCalled = true; return { success: false, error: "Called" }; };
    PaymentService.createPaymentDraft = () => { draftCalled = true; return { success: false, error: "Called" }; };
    PaymentService.evaluatePaymentDraft = () => { evalCalled = true; return { success: false, error: "Called" }; };

    const currentForm: PaymentFormFields = {
      recipient: "",
      amount: "500",
      note: "Test note",
    };
    const contact = {
      phoneNumbers: [{ number: "+91 98765 00000" }],
    };

    const res = applySelectedContactToForm(currentForm, contact);
    assert(res.success === true, "Contact apply was successful");

    assert(!createCalled, "PaymentService.createTransaction was NOT called");
    assert(!draftCalled, "PaymentService.createPaymentDraft was NOT called");
    assert(!evalCalled, "PaymentService.evaluatePaymentDraft was NOT called");

    const afterTx = await PaymentService.getTransactions(1, "all");
    assert(afterTx.total === countBefore, "No transaction inserted into PaymentService");

    // Restore
    PaymentService.createTransaction = origCreate;
    PaymentService.createPaymentDraft = origDraft;
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
