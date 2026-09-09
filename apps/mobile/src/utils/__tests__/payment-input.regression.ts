// @ts-ignore
(globalThis as any).__DEV__ = true;
// @ts-ignore
(globalThis as any).expo = { EventEmitter: class {} };

// Mock 'react-native' module in Node's require cache before loading payment services
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

// Now import target utilities and services
const {
  validateUpiIdInput,
  validateMobileNumberInput,
  validateAmountInput,
} = require("../recipient-type");

const {
  PaymentService,
} = require("../../services/payment-service");

const {
  PaymentRequestService,
} = require("../../services/payment-request-service");

const {
  parseUpiPaymentPayload,
} = require("../upi-payload-parser");

const {
  PAYMENT_INPUT_SOURCES,
} = require("../../types/transaction");

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[OK]   ${message}`);
}

async function runTests() {
  console.log("=================================================================");
  console.log("AVARAN PAY: PAYMENT INPUT PHASE REGRESSION SUITE");
  console.log("=================================================================");

  // ── SUITE 1: Payment Source Selector Constants ──────────────────────────────
  console.log("\n--- Test Suite 1: Payment Input Source Options ---");
  {
    assert(Array.isArray(PAYMENT_INPUT_SOURCES), "PAYMENT_INPUT_SOURCES is an array");
    assert(PAYMENT_INPUT_SOURCES.length === 4, "Supports exactly 4 payment intake sources");
    assert(PAYMENT_INPUT_SOURCES.includes("QR"), "Includes 'QR' source");
    assert(PAYMENT_INPUT_SOURCES.includes("UPI_ID"), "Includes 'UPI_ID' source");
    assert(PAYMENT_INPUT_SOURCES.includes("MOBILE"), "Includes 'MOBILE' source");
    assert(PAYMENT_INPUT_SOURCES.includes("PAYMENT_REQUEST"), "Includes 'PAYMENT_REQUEST' source");
  }

  // ── SUITE 2: UPI ID Validation ──────────────────────────────────────────────
  console.log("\n--- Test Suite 2: UPI ID Form Validation ---");
  {
    // Empty & Whitespace
    assert(validateUpiIdInput("").valid === false, "Rejects empty UPI ID string");
    assert(validateUpiIdInput("   ").valid === false, "Rejects whitespace-only UPI ID string");
    assert(validateUpiIdInput(null).valid === false, "Rejects null UPI ID");
    assert(validateUpiIdInput(undefined).valid === false, "Rejects undefined UPI ID");

    // Format errors
    const spaceRes = validateUpiIdInput("user name@upi");
    assert(spaceRes.valid === false, "Rejects UPI ID containing spaces");
    assert(spaceRes.error!.includes("spaces"), "Provides clear error message regarding spaces");

    const noAtRes = validateUpiIdInput("usernamenoat");
    assert(noAtRes.valid === false, "Rejects UPI ID missing '@'");
    assert(noAtRes.error!.includes("@"), "Error guides user to include '@'");

    const multiAtRes = validateUpiIdInput("user@ok@axis");
    assert(multiAtRes.valid === false, "Rejects UPI ID containing multiple '@'");

    const invalidCharRes = validateUpiIdInput("user!#$@upi");
    assert(invalidCharRes.valid === false, "Rejects UPI ID with invalid special characters");

    // Valid handles
    const v1 = validateUpiIdInput("merchant@upi");
    assert(v1.valid === true, "Accepts standard merchant@upi");
    assert(v1.normalized === "merchant@upi", "Normalizes to lowercase");

    const v2 = validateUpiIdInput("  Rahul.Sharma-99_ok@okhdfcbank  ");
    assert(v2.valid === true, "Accepts handles with dots, hyphens, and underscores");
    assert(v2.normalized === "rahul.sharma-99_ok@okhdfcbank", "Trims and lowercases input");

    const v3 = validateUpiIdInput("9876543210@paytm");
    assert(v3.valid === true, "Accepts numeric prefix VPA (phone@paytm)");
  }

  // ── SUITE 3: Mobile Number Validation ───────────────────────────────────────
  console.log("\n--- Test Suite 3: Mobile Number Form Validation ---");
  {
    // Empty & Whitespace
    assert(validateMobileNumberInput("").valid === false, "Rejects empty mobile string");
    assert(validateMobileNumberInput("   ").valid === false, "Rejects whitespace mobile string");
    assert(validateMobileNumberInput(null).valid === false, "Rejects null mobile input");

    // Non-digits
    const nonDigitRes = validateMobileNumberInput("98765abcde");
    assert(nonDigitRes.valid === false, "Rejects non-numeric characters in mobile");
    assert(nonDigitRes.error!.includes("digits"), "Error mentions digits only");

    // Length mismatch
    const shortRes = validateMobileNumberInput("98765");
    assert(shortRes.valid === false, "Rejects short mobile number");
    assert(shortRes.error!.includes("10-digit"), "Error mentions 10-digit requirement");

    const longRes = validateMobileNumberInput("9876543210123");
    assert(longRes.valid === false, "Rejects overly long mobile number");

    // Invalid starting digit
    const leadRes = validateMobileNumberInput("5876543210");
    assert(leadRes.valid === false, "Rejects mobile number not starting with 6-9");
    assert(leadRes.error!.includes("6, 7, 8, or 9"), "Error explains valid starting digits");

    // Valid formats with normalization
    const clean1 = validateMobileNumberInput("9876543210");
    assert(clean1.valid === true, "Accepts standard 10-digit Indian mobile");
    assert(clean1.normalized === "9876543210", "Preserves 10 digits");

    const clean2 = validateMobileNumberInput("+91 98765 43210");
    assert(clean2.valid === true, "Accepts mobile with '+91' and internal spaces");
    assert(clean2.normalized === "9876543210", "Strips +91 and spaces");

    const clean3 = validateMobileNumberInput("91-9876543210");
    assert(clean3.valid === true, "Accepts mobile with '91-' prefix");
    assert(clean3.normalized === "9876543210", "Strips 91- prefix");

    const clean4 = validateMobileNumberInput("09876543210");
    assert(clean4.valid === true, "Accepts mobile with leading trunk '0'");
    assert(clean4.normalized === "9876543210", "Strips leading '0'");
  }

  // ── SUITE 4: Amount Validation ──────────────────────────────────────────────
  console.log("\n--- Test Suite 4: Amount Validation ---");
  {
    assert(validateAmountInput("").valid === false, "Rejects empty amount string");
    assert(validateAmountInput("   ").valid === false, "Rejects whitespace amount string");
    assert(validateAmountInput("abc").valid === false, "Rejects alphabetic amount string");
    assert(validateAmountInput(NaN).valid === false, "Rejects NaN amount");
    assert(validateAmountInput(0).valid === false, "Rejects 0 amount");
    assert(validateAmountInput("0").valid === false, "Rejects '0' amount string");
    assert(validateAmountInput(-50).valid === false, "Rejects negative number amount");
    assert(validateAmountInput("-50").valid === false, "Rejects negative amount string");
    assert(validateAmountInput(2000000).valid === false, "Rejects amount exceeding ₹10,00,000 safety bound");

    const validNum = validateAmountInput(150.75);
    assert(validNum.valid === true, "Accepts numeric float amount");
    assert(validNum.amount === 150.75, "Preserves float amount");

    const validStr = validateAmountInput("  2500  ");
    assert(validStr.valid === true, "Accepts and parses string amount");
    assert(validStr.amount === 2500, "Parses string to numeric 2500");
  }

  // ── SUITE 5: QR Code Parsing & Intake ───────────────────────────────────────
  console.log("\n--- Test Suite 5: QR Code Parsing & Intake ---");
  {
    const qrPayload = "upi://pay?pa=store@icici&pn=General%20Store&am=350&cu=INR&tn=Snacks";
    const parseResult = parseUpiPaymentPayload(qrPayload);
    assert(parseResult.success === true, "Parses valid upi://pay URI");
    assert(parseResult.data.recipient === "store@icici", "Extracts payee address from pa");
    assert(parseResult.data.payeeName === "General Store", "Extracts payee name from pn");
    assert(parseResult.data.amount === 350, "Extracts amount from am");
    assert(parseResult.data.note === "Snacks", "Extracts note from tn");

    // Invalid QR payload
    const invalidQr = "https://not-a-upi-qr.com/pay";
    assert(parseUpiPaymentPayload(invalidQr).success === false, "Rejects non-UPI QR payloads");
  }

  // ── SUITE 6: Payment Request Service (Loading, Empty, Error, Acceptance) ────
  console.log("\n--- Test Suite 6: Payment Request Service ---");
  {
    // Fetch default pending requests
    const res = await PaymentRequestService.getPendingRequests();
    assert(!res.error, "getPendingRequests succeeds with no error");
    assert(res.requests.length >= 3, "Contains seeded pending payment requests");

    const firstReq = res.requests[0];
    assert(Boolean(firstReq.id), "Request has unique id");
    assert(Boolean(firstReq.requesterName), "Request has requesterName");
    assert(Boolean(firstReq.upiId), "Request has upiId");
    assert(firstReq.amount > 0, "Request has positive amount");
    assert(firstReq.status === "PENDING", "Request is initially PENDING");

    // Simulate incoming request
    const simulated = PaymentRequestService.simulateIncomingRequest({
      requesterName: "Test Requester",
      upiId: "test@upi",
      amount: 999,
      note: "Test split",
    });
    assert(simulated.requesterName === "Test Requester", "Simulated request created");

    const afterSim = await PaymentRequestService.getPendingRequests();
    assert(
      afterSim.requests.some((r: any) => r.id === simulated.id),
      "Simulated request appears in pending list"
    );

    // Accept request
    PaymentRequestService.markRequestAccepted(simulated.id);
    const afterAccept = await PaymentRequestService.getPendingRequests();
    assert(
      !afterAccept.requests.some((r: any) => r.id === simulated.id),
      "Accepted request removed from pending list"
    );

    // Error state test
    PaymentRequestService.setSimulateFailure(true);
    const failRes = await PaymentRequestService.getPendingRequests();
    assert(Boolean(failRes.error), "Simulate failure returns error message");
    assert(failRes.requests.length === 0, "Error returns empty array");

    // Retry recovery test
    const retryRes = await PaymentRequestService.getPendingRequests();
    assert(!retryRes.error, "Subsequent retry request recovers cleanly");
    assert(retryRes.requests.length > 0, "Retry returns pending requests");

    // Empty state test
    PaymentRequestService.clearRequests();
    const emptyRes = await PaymentRequestService.getPendingRequests();
    assert(!emptyRes.error, "Empty fetch has no error");
    assert(emptyRes.requests.length === 0, "Empty list returned when requests cleared");

    // Reset default requests
    PaymentRequestService.resetDefaultRequests();
  }

  // ── SUITE 7: Unified Shared Payment-Preparation Flow ────────────────────────
  console.log("\n--- Test Suite 7: Unified Shared Payment-Preparation Flow ---");
  {
    // 1. Preparation via UPI ID
    const upiPrep = PaymentService.preparePaymentInput({
      source: "UPI_ID",
      recipient: "merchant@okhdfcbank",
      amount: "1500.50",
      note: "Office supplies",
    });
    assert(upiPrep.success === true, "preparePaymentInput succeeds for UPI_ID");
    assert(upiPrep.draft.source === "UPI_ID", "Draft source is UPI_ID");
    assert(upiPrep.draft.recipient === "merchant@okhdfcbank", "Draft recipient is normalized");
    assert(upiPrep.draft.recipientType === "UPI_ID", "Draft recipientType is UPI_ID");
    assert(upiPrep.draft.amount === 1500.5, "Draft amount is parsed float 1500.5");
    assert(upiPrep.draft.note === "Office supplies", "Draft note preserved");
    assert(upiPrep.draft.status === "PREPARED", "Draft status is PREPARED");
    assert(Boolean(upiPrep.draft.preparedAt), "Draft preparedAt is set");

    // 2. Preparation via Mobile Number
    const mobilePrep = PaymentService.preparePaymentInput({
      source: "MOBILE",
      recipient: "+91 98765 43210",
      recipientName: "Rahul Sharma",
      amount: 450,
      note: "Chai bill",
    });
    assert(mobilePrep.success === true, "preparePaymentInput succeeds for MOBILE");
    assert(mobilePrep.draft.source === "MOBILE", "Draft source is MOBILE");
    assert(mobilePrep.draft.recipient === "9876543210", "Draft recipient is normalized mobile");
    assert(mobilePrep.draft.recipientType === "PHONE", "Draft recipientType is PHONE");
    assert(mobilePrep.draft.recipientName === "Rahul Sharma", "Draft preserves recipientName");
    assert(mobilePrep.draft.amount === 450, "Draft amount is 450");

    // 3. Preparation via QR Code
    const qrPrep = PaymentService.preparePaymentInput({
      source: "QR",
      recipient: "swiggy@icici",
      recipientName: "Swiggy India",
      amount: "650",
      note: "Food Order #1234",
      qrPayload: "upi://pay?pa=swiggy@icici&pn=Swiggy&am=650",
    });
    assert(qrPrep.success === true, "preparePaymentInput succeeds for QR");
    assert(qrPrep.draft.source === "QR", "Draft source is QR");
    assert(qrPrep.draft.recipient === "swiggy@icici", "Draft recipient is swiggy@icici");
    assert(qrPrep.draft.qrPayload!.includes("upi://pay"), "Draft preserves qrPayload");

    // 4. Preparation via Payment Request
    const reqPrep = PaymentService.preparePaymentInput({
      source: "PAYMENT_REQUEST",
      recipient: "bses.yamuna@sbi",
      recipientName: "BSES Electricity",
      amount: 1240,
      note: "Electricity Bill CA#1029384",
      requestId: "req-003",
    });
    assert(reqPrep.success === true, "preparePaymentInput succeeds for PAYMENT_REQUEST");
    assert(reqPrep.draft.source === "PAYMENT_REQUEST", "Draft source is PAYMENT_REQUEST");
    assert(reqPrep.draft.recipient === "bses.yamuna@sbi", "Draft recipient is bses.yamuna@sbi");
    assert(reqPrep.draft.requestId === "req-003", "Draft preserves requestId");

    // Rejection checks
    const badUpi = PaymentService.preparePaymentInput({
      source: "UPI_ID",
      recipient: "invalid-upi-no-at",
      amount: 100,
    });
    assert(badUpi.success === false, "Rejects invalid UPI ID in preparation");

    const badMobile = PaymentService.preparePaymentInput({
      source: "MOBILE",
      recipient: "123",
      amount: 100,
    });
    assert(badMobile.success === false, "Rejects invalid mobile number in preparation");

    const badAmt = PaymentService.preparePaymentInput({
      source: "UPI_ID",
      recipient: "valid@upi",
      amount: -10,
    });
    assert(badAmt.success === false, "Rejects negative amount in preparation");
  }

  // ── SUITE 8: Phase Boundary Invariants ──────────────────────────────────────
  console.log("\n--- Test Suite 8: Phase Boundary & Safety Invariants ---");
  {
    const prep = PaymentService.preparePaymentInput({
      source: "UPI_ID",
      recipient: "test@upi",
      amount: 500,
    });
    assert(prep.success === true, "Preparation succeeds");

    const draft = prep.draft;
    // Strictly verify no execution / settlement properties exist on the draft
    assert((draft as any).id === undefined, "Draft has no transaction ID");
    assert((draft as any).riskScore === undefined, "Draft has no riskScore");
    assert((draft as any).riskLevel === undefined, "Draft has no riskLevel");
    assert((draft as any).canonicalStatus === undefined, "Draft has no canonicalStatus");
    assert((draft as any).isCompleted === undefined, "Draft has no isCompleted field");
    assert((draft as any).isAuthorized === undefined, "Draft has no isAuthorized field");
    assert((draft as any).isSubmitted === undefined, "Draft has no isSubmitted field");

    // Confirm that the status is strictly PREPARED
    assert(draft.status === "PREPARED", "Draft status is PREPARED only");

    // Verify transaction history store was untouched
    const txns = await PaymentService.getTransactions(1, "all");
    const found = txns.items.some((t: any) => t.merchant === "test@upi" || t.id === "test@upi");
    assert(!found, "No fake or real transaction was inserted into transaction store");
  }

  console.log("\n=================================================================");
  console.log("ALL PAYMENT INPUT REGRESSION TESTS PASSED (100%)");
  console.log("=================================================================\n");
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
