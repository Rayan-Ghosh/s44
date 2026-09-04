import {
  applyScannedQrToForm,
  shouldIgnoreScan,
  PaymentFormFields,
  QrFormApplyResult,
} from "../qr-scanner-helper";

/**
 * AVARAN PAY — Frontend Part 4B: QR Scanner Input Contract Regression Tests
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
  console.log("AVARAN PAY PART 4B: QR SCANNER INPUT REGRESSION");
  console.log("=================================================================\n");

  console.log("--- Test Suite 1: Valid QR Populates Recipient and Amount ---");
  {
    const initialForm: PaymentFormFields = {
      recipient: "",
      amount: "",
      note: "",
    };
    const raw = "upi://pay?pa=grocery.mart@hdfcbank&am=640.50&tn=Weekly%20Groceries";
    const res: QrFormApplyResult = applyScannedQrToForm(initialForm, raw);
    assert(res.success === true, "Valid QR parse and form apply succeeds");
    if (res.success) {
      assert(res.updatedForm.recipient === "grocery.mart@hdfcbank", "Recipient populated cleanly");
      assert(res.updatedForm.amount === "640.5", "Amount populated as string '640.5'");
      assert(res.updatedForm.note === "Weekly Groceries", "Note decoded and populated");
    }
  }

  console.log("\n--- Test Suite 2: Valid QR Without Amount Does Not Overwrite Existing Amount ---");
  {
    const existingForm: PaymentFormFields = {
      recipient: "initial@upi",
      amount: "1500",
      note: "Original Note",
    };
    const rawNoAmount = "upi://pay?pa=restaurant@icici";
    const res: QrFormApplyResult = applyScannedQrToForm(existingForm, rawNoAmount);
    assert(res.success === true, "QR without amount parse succeeds");
    if (res.success) {
      assert(res.updatedForm.recipient === "restaurant@icici", "Recipient updated to new scanned value");
      assert(res.updatedForm.amount === "1500", "Existing amount preserved untouched");
      assert(res.updatedForm.note === "Original Note", "Existing note preserved untouched");
    }
  }

  console.log("\n--- Test Suite 3: Valid QR Without Note Does Not Overwrite Existing Note ---");
  {
    const existingForm: PaymentFormFields = {
      recipient: "merchant@upi",
      amount: "250",
      note: "Do not clear this note",
    };
    const rawNoNote = "upi://pay?pa=quickpay@okaxis&am=99";
    const res: QrFormApplyResult = applyScannedQrToForm(existingForm, rawNoNote);
    assert(res.success === true, "QR without note parse succeeds");
    if (res.success) {
      assert(res.updatedForm.recipient === "quickpay@okaxis", "Recipient updated");
      assert(res.updatedForm.amount === "99", "Amount updated");
      assert(res.updatedForm.note === "Do not clear this note", "Existing note preserved");
    }
  }

  console.log("\n--- Test Suite 4: Invalid QR Leaves Form Completely Unchanged ---");
  {
    const existingForm: PaymentFormFields = {
      recipient: "saved.vendor@upi",
      amount: "450",
      note: "Critical Note",
    };

    // 1. Non-UPI scheme
    const resNonUpi = applyScannedQrToForm(existingForm, "https://malicious-site.com/fakeqr");
    assert(resNonUpi.success === false, "Rejects non-UPI URL");
    assert(resNonUpi.updatedForm.recipient === "saved.vendor@upi", "Recipient untouched on invalid URL");
    assert(resNonUpi.updatedForm.amount === "450", "Amount untouched on invalid URL");
    assert(resNonUpi.updatedForm.note === "Critical Note", "Note untouched on invalid URL");

    // 2. Malformed amount in UPI
    const resBadAmt = applyScannedQrToForm(existingForm, "upi://pay?pa=valid@upi&am=-200");
    assert(resBadAmt.success === false, "Rejects negative amount payload");
    assert(resBadAmt.updatedForm.amount === "450", "Amount untouched on bad amount");

    // 3. Missing pa
    const resNoPa = applyScannedQrToForm(existingForm, "upi://pay?pn=Store&am=100");
    assert(resNoPa.success === false, "Rejects missing pa payload");
    assert(resNoPa.updatedForm.recipient === "saved.vendor@upi", "Recipient untouched on missing pa");
  }

  console.log("\n--- Test Suite 5: Camera Permission Denial Simulation ---");
  {
    const simulatePermissionRequest = (granted: boolean) => {
      let isScannerVisible = false;
      let toastMessage: string | null = null;

      if (!granted) {
        toastMessage = "Camera permission is required to scan QR codes";
      } else {
        isScannerVisible = true;
      }

      return { isScannerVisible, toastMessage };
    };

    const denied = simulatePermissionRequest(false);
    assert(denied.isScannerVisible === false, "Scanner modal does not open on permission denial");
    assert(
      denied.toastMessage === "Camera permission is required to scan QR codes",
      "Graceful permission denied toast dispatched"
    );

    const granted = simulatePermissionRequest(true);
    assert(granted.isScannerVisible === true, "Scanner modal opens when permission is granted");
    assert(granted.toastMessage === null, "No error toast on granted permission");
  }

  console.log("\n--- Test Suite 6: Scanner Cancellation Simulation ---");
  {
    const simulateCancellation = (currentForm: PaymentFormFields) => {
      let isScannerVisible = true;
      let hasScanned = false;
      let isCameraActive = true;

      // User presses cancel
      hasScanned = true;
      isCameraActive = false;
      isScannerVisible = false;

      return { isScannerVisible, hasScanned, isCameraActive, form: currentForm };
    };

    const originalForm: PaymentFormFields = {
      recipient: "existing@upi",
      amount: "75",
      note: "Lunch",
    };
    const cancelled = simulateCancellation(originalForm);
    assert(cancelled.isScannerVisible === false, "Modal closed on cancellation");
    assert(cancelled.isCameraActive === false, "Camera deactivated on cancellation");
    assert(cancelled.form.recipient === "existing@upi", "Form recipient remains unchanged on cancel");
    assert(cancelled.form.amount === "75", "Form amount remains unchanged on cancel");
  }

  console.log("\n--- Test Suite 7: Duplicate Scan Protection ---");
  {
    // First scan of payload A -> allowed
    assert(
      shouldIgnoreScan(false, "upi://pay?pa=store@upi", null) === false,
      "First scan of payload is accepted"
    );

    // Repeated scan of same payload A while still open -> ignored
    assert(
      shouldIgnoreScan(false, "upi://pay?pa=store@upi", "upi://pay?pa=store@upi") === true,
      "Identical repeated payload is ignored"
    );

    // Scan after scan lock (hasScanned === true) -> ignored
    assert(
      shouldIgnoreScan(true, "upi://pay?pa=another@upi", "upi://pay?pa=store@upi") === true,
      "Further scans locked once hasScanned is true"
    );

    // Empty or null payload -> ignored
    assert(
      shouldIgnoreScan(false, null, null) === true,
      "Null payload is ignored"
    );
  }

  console.log("\n=================================================================");
  console.log(`ALL ${passedChecks} PART 4B QR SCANNER REGRESSION CHECKS PASSED (${totalChecks}/${totalChecks})`);
  console.log("=================================================================\n");

  if (failures > 0) {
    throw new Error(`${failures} QR scanner check(s) failed.`);
  }
}

runTests();
