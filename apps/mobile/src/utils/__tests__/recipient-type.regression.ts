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

import { getRecipientType, isRecipientValid, getRecipientTypeHint, RecipientType } from "../recipient-type";
const { PaymentService } = require("../../services/payment-service");

/**
 * AVARAN PAY — Frontend Part 4F: Recipient Type Detection Regression Tests
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
  console.log("AVARAN PAY PART 4F: RECIPIENT TYPE DETECTION REGRESSION SUITE");
  console.log("=================================================================\n");

  // Suite 1: Valid UPI IDs
  console.log("--- Test Suite 1: Valid UPI IDs ---");
  const validUpiCases = [
    "user@upi",
    "alice.smith@okhdfcbank",
    "merchant_store@icici",
    "shop-online@okaxis",
    "9876543210@paytm", // Mobile number formatted as UPI ID
    "test.user.123@ybl",
    "aditya@barodampay",
    "  spaced.user@upi  ", // Surrounding whitespace should be trimmed
  ];

  for (const upi of validUpiCases) {
    const result = getRecipientType(upi);
    assert(result === "UPI_ID", `Expected "${upi}" to be classified as UPI_ID, got "${result}"`);
    assert(isRecipientValid(upi) === true, `isRecipientValid("${upi}") must be true`);
  }

  // Suite 2: Valid Indian Mobile Numbers (10-digit without country code)
  console.log("\n--- Test Suite 2: Valid 10-Digit Indian Mobile Numbers ---");
  const validTenDigitMobiles = [
    "9876543210",
    "8123456789",
    "7000000000",
    "6999999999",
    "  9876543210  ", // Surrounding whitespace
  ];

  for (const mobile of validTenDigitMobiles) {
    const result = getRecipientType(mobile);
    assert(result === "MOBILE_NUMBER", `Expected "${mobile}" to be classified as MOBILE_NUMBER, got "${result}"`);
    assert(isRecipientValid(mobile) === true, `isRecipientValid("${mobile}") must be true`);
  }

  // Suite 3: Valid Indian Mobile Numbers with +91 Prefix
  console.log("\n--- Test Suite 3: Valid Indian Mobile Numbers with +91 Prefix ---");
  const validPlus91Mobiles = [
    "+919876543210",
    "+918123456789",
    "+917000000000",
    "+916999999999",
    "+91 9876543210", // Optional separator
    "+91-9876543210",
    "  +919876543210  ",
  ];

  for (const mobile of validPlus91Mobiles) {
    const result = getRecipientType(mobile);
    assert(result === "MOBILE_NUMBER", `Expected "${mobile}" to be classified as MOBILE_NUMBER, got "${result}"`);
    assert(isRecipientValid(mobile) === true, `isRecipientValid("${mobile}") must be true`);
  }

  // Suite 4: Valid Indian Mobile Numbers with 91 Prefix
  console.log("\n--- Test Suite 4: Valid Indian Mobile Numbers with 91 Prefix ---");
  const valid91Mobiles = [
    "919876543210",
    "918123456789",
    "917000000000",
    "916999999999",
    "91 9876543210", // Optional separator
    "91-9876543210",
    "  919876543210  ",
  ];

  for (const mobile of valid91Mobiles) {
    const result = getRecipientType(mobile);
    assert(result === "MOBILE_NUMBER", `Expected "${mobile}" to be classified as MOBILE_NUMBER, got "${result}"`);
    assert(isRecipientValid(mobile) === true, `isRecipientValid("${mobile}") must be true`);
  }

  // Suite 5: Empty and Whitespace-Only Inputs
  console.log("\n--- Test Suite 5: Empty and Whitespace-Only Inputs ---");
  const emptyInputs: any[] = [
    "",
    "   ",
    "\t\n",
    null,
    undefined,
  ];

  for (const emptyVal of emptyInputs) {
    const result = getRecipientType(emptyVal);
    assert(result === "UNKNOWN", `Expected empty/whitespace input to return UNKNOWN, got "${result}"`);
    assert(isRecipientValid(emptyVal) === false, `isRecipientValid on empty input must return false`);
  }

  // Suite 6: Invalid UPI-Like Inputs
  console.log("\n--- Test Suite 6: Invalid UPI-Like Inputs ---");
  const invalidUpiCases = [
    "user@",             // Missing handle
    "@upi",              // Missing username
    "user@@upi",         // Multiple @
    "user@upi@axis",     // Multiple handles
    "user name@upi",     // Space in username
    "user@up i",         // Space in handle
    "user!special@upi",  // Invalid character
    "user#name@upi",     // Invalid character
    "user$@okaxis",      // Invalid character
    "@",                 // Only @
  ];

  for (const inv of invalidUpiCases) {
    const result = getRecipientType(inv);
    assert(result === "UNKNOWN", `Expected invalid UPI "${inv}" to return UNKNOWN, got "${result}"`);
    assert(isRecipientValid(inv) === false, `isRecipientValid("${inv}") must be false`);
  }

  // Suite 7: Invalid Mobile Numbers
  console.log("\n--- Test Suite 7: Invalid Mobile Numbers ---");
  const invalidMobiles = [
    "1234567890",    // Starts with 1 (not 6-9)
    "2345678901",    // Starts with 2
    "5987654321",    // Starts with 5
    "09876543210",   // Starts with 0 (11 digits)
    "98765",         // Too short (5 digits)
    "9876543210123", // Too long (13 digits)
    "+911234567890", // Invalid prefix digit (starts with 1)
    "+19876543210",  // US country code (+1)
    "+449876543210", // UK country code (+44)
    "98765abcde",    // Contains alphabets
    "98765-4321",    // Incomplete
  ];

  for (const inv of invalidMobiles) {
    const result = getRecipientType(inv);
    assert(result === "UNKNOWN", `Expected invalid mobile "${inv}" to return UNKNOWN, got "${result}"`);
    assert(isRecipientValid(inv) === false, `isRecipientValid("${inv}") must be false`);
  }

  // Suite 8: Arbitrary Text
  console.log("\n--- Test Suite 8: Arbitrary Text ---");
  const arbitraryTexts = [
    "Aditya Ranjan",
    "Starbucks Coffee",
    "Electricity Bill",
    "http://example.com",
    "random string of words",
    "INV-2026-001",
    "123.456",
  ];

  for (const text of arbitraryTexts) {
    const result = getRecipientType(text);
    assert(result === "UNKNOWN", `Expected arbitrary text "${text}" to return UNKNOWN, got "${result}"`);
    assert(isRecipientValid(text) === false, `isRecipientValid("${text}") must be false`);
  }

  // Suite 9: Input Immutability & No Appending '@upi'
  console.log("\n--- Test Suite 9: Input Immutability & No Conversion ---");
  const originalInputs = [
    "9876543210",
    "+919876543210",
    "merchant@upi",
    "  user@okaxis  ",
  ];

  for (const input of originalInputs) {
    const originalCopy = input.slice();
    const detectedType = getRecipientType(input);
    assert(input === originalCopy, `Input string must not be mutated in-place (was "${originalCopy}", is "${input}")`);
    assert(!input.includes("@upi") || originalCopy.includes("@upi"), `Do not append @upi to input`);
  }

  // Verify mobile number is never rewritten to append @upi
  const mobileInput = "9876543210";
  const typeOfMobile = getRecipientType(mobileInput);
  assert(typeOfMobile === "MOBILE_NUMBER", "Mobile number returns MOBILE_NUMBER");
  assert(mobileInput === "9876543210", "Original mobile string remains exactly 9876543210 without @upi appended");

  // Suite 10: Zero Payment Lifecycle Side-Effects
  console.log("\n--- Test Suite 10: Zero Payment Lifecycle Side-Effects ---");
  const initialOverview = await PaymentService.getOverview();
  const initialTransactions = await PaymentService.getTransactions();
  const initialTxCount = initialTransactions.items.length;

  // Run detection on several valid and invalid values
  getRecipientType("9876543210");
  getRecipientType("+919876543210");
  getRecipientType("user@upi");
  getRecipientType("invalid-input");
  getRecipientType("");

  const postOverview = await PaymentService.getOverview();
  const postTransactions = await PaymentService.getTransactions();

  assert(
    postTransactions.items.length === initialTxCount,
    `Transaction store count must remain unchanged (was ${initialTxCount}, now ${postTransactions.items.length})`
  );
  assert(
    postOverview.transactionCount === initialOverview.transactionCount,
    `Overview transactionCount must remain unchanged (was ${initialOverview.transactionCount}, now ${postOverview.transactionCount})`
  );

  // Suite 11: Subtle Recipient Type Hint (Part 4G)
  console.log("\n--- Test Suite 11: Subtle Recipient Type Hint (Part 4G) ---");

  // 11.1 Valid UPI ID shows "UPI ID detected"
  const upiHint = getRecipientTypeHint("alice@okhdfcbank");
  assert(upiHint === "UPI ID detected", `Valid UPI ID must show "UPI ID detected", got "${upiHint}"`);

  const merchantUpiHint = getRecipientTypeHint("merchant@upi");
  assert(merchantUpiHint === "UPI ID detected", `Valid UPI ID merchant@upi must show "UPI ID detected", got "${merchantUpiHint}"`);

  // 11.2 Valid Indian mobile numbers show "Mobile number detected"
  const mobile10Hint = getRecipientTypeHint("9876543210");
  assert(mobile10Hint === "Mobile number detected", `10-digit mobile must show "Mobile number detected", got "${mobile10Hint}"`);

  const mobilePlus91Hint = getRecipientTypeHint("+919876543210");
  assert(mobilePlus91Hint === "Mobile number detected", `+91 mobile must show "Mobile number detected", got "${mobilePlus91Hint}"`);

  const mobile91Hint = getRecipientTypeHint("919876543210");
  assert(mobile91Hint === "Mobile number detected", `91 mobile must show "Mobile number detected", got "${mobile91Hint}"`);

  // 11.3 Empty & whitespace inputs show no hint (null)
  assert(getRecipientTypeHint("") === null, `Empty input must show no hint (null)`);
  assert(getRecipientTypeHint("   ") === null, `Whitespace input must show no hint (null)`);
  assert(getRecipientTypeHint(null) === null, `Null input must show no hint (null)`);
  assert(getRecipientTypeHint(undefined) === null, `Undefined input must show no hint (null)`);

  // 11.4 Invalid inputs show no hint (null)
  assert(getRecipientTypeHint("user@") === null, `Incomplete UPI user@ must show no hint`);
  assert(getRecipientTypeHint("@upi") === null, `Incomplete UPI @upi must show no hint`);
  assert(getRecipientTypeHint("user@@upi") === null, `Malformed UPI user@@upi must show no hint`);
  assert(getRecipientTypeHint("1234567890") === null, `Invalid mobile 1234567890 must show no hint`);
  assert(getRecipientTypeHint("98765") === null, `Short number 98765 must show no hint`);
  assert(getRecipientTypeHint("John Doe") === null, `Arbitrary text "John Doe" must show no hint`);
  assert(getRecipientTypeHint("https://paytm.com") === null, `URL text must show no hint`);

  // 11.5 Editing state simulation: UPI -> Mobile -> UNKNOWN -> Valid UPI
  let simulatedInput = "user@upi";
  let currentHint = getRecipientTypeHint(simulatedInput);
  assert(currentHint === "UPI ID detected", `Initial simulated input user@upi has UPI hint`);

  // User edits input to a mobile number
  simulatedInput = "9876543210";
  currentHint = getRecipientTypeHint(simulatedInput);
  assert(currentHint === "Mobile number detected", `Editing to 9876543210 updates hint to "Mobile number detected"`);

  // User edits to an incomplete/invalid string
  simulatedInput = "98765abc";
  currentHint = getRecipientTypeHint(simulatedInput);
  assert(currentHint === null, `Editing to invalid "98765abc" removes hint (null)`);

  // User clears input
  simulatedInput = "";
  currentHint = getRecipientTypeHint(simulatedInput);
  assert(currentHint === null, `Clearing input removes hint (null)`);

  // User types valid UPI again
  simulatedInput = "shop@icici";
  currentHint = getRecipientTypeHint(simulatedInput);
  assert(currentHint === "UPI ID detected", `Typing shop@icici updates hint to "UPI ID detected"`);

  // 11.6 Input remains completely unmutated throughout hint evaluation
  const unmutatedInput = "9876543210";
  const hintResult = getRecipientTypeHint(unmutatedInput);
  assert(hintResult === "Mobile number detected", `Mobile hint verified`);
  assert(unmutatedInput === "9876543210", `Original recipient string remains unmutated (no @upi appended)`);

  // 11.7 Zero payment lifecycle side-effects during hint evaluation
  const finalOverview = await PaymentService.getOverview();
  const finalTransactions = await PaymentService.getTransactions();
  assert(
    finalTransactions.items.length === initialTxCount,
    `Transaction store count strictly unchanged after hint checks (${initialTxCount})`
  );
  assert(
    finalOverview.transactionCount === initialOverview.transactionCount,
    `Overview transactionCount strictly unchanged after hint checks (${initialOverview.transactionCount})`
  );

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
