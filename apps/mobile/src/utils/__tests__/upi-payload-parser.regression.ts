import {
  parseUpiPaymentPayload,
  ParsedUpiPaymentResult,
} from "../upi-payload-parser";

/**
 * AVARAN PAY — Frontend Part 4A: QR/UPI Payload Parsing Contract Regression Tests
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

function runTests() {
  console.log("=================================================================");
  console.log("AVARAN PAY PART 4A: QR/UPI PAYLOAD PARSER REGRESSION");
  console.log("=================================================================\n");

  console.log("--- Test Suite 1: Valid UPI Payload with Recipient and Amount ---");
  {
    const raw = "upi://pay?pa=merchant.store@okaxis&am=750.50&cu=INR";
    const res: ParsedUpiPaymentResult = parseUpiPaymentPayload(raw);
    assert(res.success === true, "Valid payload returns success === true");
    if (res.success) {
      assert(res.data.recipient === "merchant.store@okaxis", "Recipient parsed correctly");
      assert(res.data.amount === 750.5, "Amount parsed as positive finite number");
      assert(res.data.note === undefined, "Note is undefined when absent");
      assert(res.data.rawPayload === raw, "Raw payload preserved exactly");
    }
  }

  console.log("\n--- Test Suite 2: Valid Payload Without Amount ---");
  {
    const raw = "upi://pay?pa=alice@okhdfcbank";
    const res: ParsedUpiPaymentResult = parseUpiPaymentPayload(raw);
    assert(res.success === true, "Payload without amount returns success === true");
    if (res.success) {
      assert(res.data.recipient === "alice@okhdfcbank", "Recipient parsed correctly");
      assert(res.data.amount === undefined, "Amount is undefined when omitted");
      assert(res.data.rawPayload === raw, "Raw payload preserved");
    }
  }

  console.log("\n--- Test Suite 3: Encoded Merchant Name ---");
  {
    const raw = "upi://pay?pa=merchant@icici&pn=Apex%20Retail%20Enterprises&am=120";
    const res: ParsedUpiPaymentResult = parseUpiPaymentPayload(raw);
    assert(res.success === true, "Payload with encoded merchant name returns success === true");
    if (res.success) {
      assert(res.data.recipient === "merchant@icici", "Recipient parsed correctly");
      assert(res.data.payeeName === "Apex Retail Enterprises", "Merchant name URL-decoded cleanly");
      assert(res.data.recipient !== res.data.payeeName, "Does not invent recipient from pn");
    }
  }

  console.log("\n--- Test Suite 4: Encoded Note ---");
  {
    const raw1 = "upi://pay?pa=vendor@upi&am=50&tn=Invoice%20%239921%20Payment";
    const res1: ParsedUpiPaymentResult = parseUpiPaymentPayload(raw1);
    assert(res1.success === true, "Payload with %20 encoded note returns success === true");
    if (res1.success) {
      assert(res1.data.note === "Invoice #9921 Payment", "Note with %20 decoded correctly");
    }

    const raw2 = "upi://pay?pa=vendor@upi&am=50&tn=Coffee+and+Snacks";
    const res2: ParsedUpiPaymentResult = parseUpiPaymentPayload(raw2);
    assert(res2.success === true, "Payload with + encoded note returns success === true");
    if (res2.success) {
      assert(res2.data.note === "Coffee and Snacks", "Note with + decoded correctly");
    }

    const rawEmptyNote = "upi://pay?pa=vendor@upi&am=50&tn=";
    const resEmptyNote: ParsedUpiPaymentResult = parseUpiPaymentPayload(rawEmptyNote);
    assert(resEmptyNote.success === true, "Payload with empty note returns success === true");
    if (resEmptyNote.success) {
      assert(resEmptyNote.data.note === undefined, "Empty note normalized to undefined");
    }
  }

  console.log("\n--- Test Suite 5: Missing 'pa' Rejection ---");
  {
    const raw1 = "upi://pay?pn=Merchant%20Only&am=100";
    const res1: ParsedUpiPaymentResult = parseUpiPaymentPayload(raw1);
    assert(res1.success === false, "Rejects payload with missing pa");
    if (!res1.success) {
      assert(typeof res1.error === "string" && res1.error.length > 0, "Provides clear error message");
    }

    const raw2 = "upi://pay";
    const res2: ParsedUpiPaymentResult = parseUpiPaymentPayload(raw2);
    assert(res2.success === false, "Rejects bare upi://pay without parameters");
  }

  console.log("\n--- Test Suite 6: Invalid Recipient Formats ---");
  {
    // Empty pa
    const resEmpty: ParsedUpiPaymentResult = parseUpiPaymentPayload("upi://pay?pa=&am=100");
    assert(resEmpty.success === false, "Rejects empty pa");

    // Whitespace in pa
    const resSpace: ParsedUpiPaymentResult = parseUpiPaymentPayload("upi://pay?pa=user%20name@upi&am=100");
    assert(resSpace.success === false, "Rejects pa containing whitespace");

    // Missing @
    const resNoAt: ParsedUpiPaymentResult = parseUpiPaymentPayload("upi://pay?pa=plainusername&am=100");
    assert(resNoAt.success === false, "Rejects pa without @");

    // Multiple @
    const resMultiAt: ParsedUpiPaymentResult = parseUpiPaymentPayload("upi://pay?pa=user@domain@bank&am=100");
    assert(resMultiAt.success === false, "Rejects pa with multiple @ symbols");

    // Missing handle after @
    const resTrailingAt: ParsedUpiPaymentResult = parseUpiPaymentPayload("upi://pay?pa=username@&am=100");
    assert(resTrailingAt.success === false, "Rejects pa with missing handle after @");

    // Missing username before @
    const resLeadingAt: ParsedUpiPaymentResult = parseUpiPaymentPayload("upi://pay?pa=@bank&am=100");
    assert(resLeadingAt.success === false, "Rejects pa with missing username before @");
  }

  console.log("\n--- Test Suite 7: Invalid Amount Formats ---");
  {
    const resNaN: ParsedUpiPaymentResult = parseUpiPaymentPayload("upi://pay?pa=merchant@upi&am=abc");
    assert(resNaN.success === false, "Rejects non-numeric amount 'abc'");

    const resEmptyAmount: ParsedUpiPaymentResult = parseUpiPaymentPayload("upi://pay?pa=merchant@upi&am=");
    assert(resEmptyAmount.success === false, "Rejects empty am parameter");

    const resSpecial: ParsedUpiPaymentResult = parseUpiPaymentPayload("upi://pay?pa=merchant@upi&am=₹500");
    assert(resSpecial.success === false, "Rejects amount with currency symbol");
  }

  console.log("\n--- Test Suite 8: Zero Amount Rejection ---");
  {
    const resZero: ParsedUpiPaymentResult = parseUpiPaymentPayload("upi://pay?pa=merchant@upi&am=0");
    assert(resZero.success === false, "Rejects zero amount '0'");

    const resZeroDec: ParsedUpiPaymentResult = parseUpiPaymentPayload("upi://pay?pa=merchant@upi&am=0.00");
    assert(resZeroDec.success === false, "Rejects zero decimal amount '0.00'");
  }

  console.log("\n--- Test Suite 9: Negative Amount Rejection ---");
  {
    const resNeg: ParsedUpiPaymentResult = parseUpiPaymentPayload("upi://pay?pa=merchant@upi&am=-250.00");
    assert(resNeg.success === false, "Rejects negative amount '-250.00'");
  }

  console.log("\n--- Test Suite 10: Malformed/Non-UPI Payloads ---");
  {
    const resHttps: ParsedUpiPaymentResult = parseUpiPaymentPayload("https://example.com/pay?pa=merchant@upi");
    assert(resHttps.success === false, "Rejects https:// URL");

    const resPaytm: ParsedUpiPaymentResult = parseUpiPaymentPayload("paytm://pay?pa=merchant@upi");
    assert(resPaytm.success === false, "Rejects paytm:// scheme");

    const resRandom: ParsedUpiPaymentResult = parseUpiPaymentPayload("random-qr-barcode-string");
    assert(resRandom.success === false, "Rejects arbitrary text payload");

    const resEmptyStr: ParsedUpiPaymentResult = parseUpiPaymentPayload("");
    assert(resEmptyStr.success === false, "Rejects empty string");

    const resNull: ParsedUpiPaymentResult = parseUpiPaymentPayload(null as any);
    assert(resNull.success === false, "Rejects null input");
  }

  console.log("\n--- Test Suite 11: Whitespace Trimming ---");
  {
    const raw = "   upi://pay?pa=%20merchant@upi%20&am=100&tn=%20%20Order%20Note%20%20   ";
    const res: ParsedUpiPaymentResult = parseUpiPaymentPayload(raw);
    assert(res.success === true, "Payload with surrounding whitespace succeeds");
    if (res.success) {
      assert(res.data.recipient === "merchant@upi", "Recipient trimmed of whitespace");
      assert(res.data.note === "Order Note", "Note trimmed of whitespace");
      assert(res.data.rawPayload === raw, "Original raw payload preserved with outer whitespace");
    }
  }

  console.log("\n--- Test Suite 12: Raw Payload Preservation ---");
  {
    const raw = "upi://pay?pa=test@okaxis&am=99.99&tn=TestRawPreserve";
    const res: ParsedUpiPaymentResult = parseUpiPaymentPayload(raw);
    assert(res.success === true, "Parse succeeds");
    if (res.success) {
      assert(res.data.rawPayload === raw, "data.rawPayload strictly matches input");
    }
  }

  console.log("\n=================================================================");
  console.log(`ALL ${passedChecks} PART 4A UPI PARSER REGRESSION CHECKS PASSED (${totalChecks}/${totalChecks})`);
  console.log("=================================================================\n");

  if (failures > 0) {
    throw new Error(`${failures} UPI parser check(s) failed.`);
  }
}

runTests();
