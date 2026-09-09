/**
 * Regression Test Suite for Statement Upload Service
 * (`apps/mobile/src/utils/__tests__/statement-upload.regression.ts`)
 *
 * Part 2B: Mobile Statement Document Selection & Validation.
 *
 * Covers:
 * 1. Valid PDF selection
 * 2. Valid image selection (JPEG, PNG, WebP)
 * 3. Unsupported file type rejection (CSV, DOCX, MP4, etc.)
 * 4. Oversized file rejection (> 10MB default or custom limit)
 * 5. Empty file (0 bytes) rejection
 * 6. User cancellation handling (canceled: true, or empty assets)
 * 7. Picker exception / failure handling
 */

// @ts-ignore
(globalThis as any).__DEV__ = true;
// @ts-ignore
(globalThis as any).expo = { EventEmitter: class {} };

// @ts-ignore
import Module from "module";

// @ts-ignore
const origRequire = Module.prototype.require;
// @ts-ignore
Module.prototype.require = function (id: string, ...args: any[]) {
  if (id === "react-native") {
    return {
      Platform: { OS: "android", select: (objs: any) => objs?.android ?? objs?.default },
      StyleSheet: { create: (styles: any) => styles },
      View: () => null,
      Text: () => null,
      TouchableOpacity: () => null,
      ActivityIndicator: () => null,
    };
  }
  if (id === "expo-constants") {
    return {
      __esModule: true,
      default: { expoConfig: { extra: { apiUrl: "http://127.0.0.1:8000" } } },
      expoConfig: { extra: { apiUrl: "http://127.0.0.1:8000" } },
    };
  }
  if (id === "expo-document-picker") {
    return {
      getDocumentAsync: async () => ({ canceled: true }),
    };
  }
  if (id === "expo-device") {
    return {
      modelName: "Test Device",
      osName: "Android",
    };
  }
  if (id === "expo-secure-store") {
    return {
      getItemAsync: async () => null,
      setItemAsync: async () => null,
    };
  }
  if (id === "@expo/vector-icons") {
    return {
      Ionicons: () => null,
    };
  }
  return origRequire.apply(this, [id, ...args]);
};

const {
  pickStatementFile,
  validateStatementFile,
  detectStatementFileType,
  extractFileExtension,
  resolveCanonicalMimeType,
  DEFAULT_MAX_STATEMENT_FILE_SIZE_BYTES,
  SUPPORTED_STATEMENT_EXTENSIONS,
  SUPPORTED_STATEMENT_MIME_TYPES,
} = require("../../services/statement-upload-service");

import type { StatementPickerResult } from "../../services/statement-upload-service";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`[OK]   ${message}`);
}

async function runTests() {
  console.log("\n=================================================================");
  console.log("STATEMENT UPLOAD SERVICE REGRESSION TESTS");
  console.log("=================================================================\n");

  // -------------------------------------------------------------
  // PART 1: Helper Functions & Constants
  // -------------------------------------------------------------
  console.log("--- PART 1: Constants & Helpers ---");
  assert(DEFAULT_MAX_STATEMENT_FILE_SIZE_BYTES === 10 * 1024 * 1024, "Default max size is 10 MB");
  assert(SUPPORTED_STATEMENT_EXTENSIONS.includes(".pdf"), "Extensions include .pdf");
  assert(SUPPORTED_STATEMENT_EXTENSIONS.includes(".jpg"), "Extensions include .jpg");
  assert(SUPPORTED_STATEMENT_EXTENSIONS.includes(".png"), "Extensions include .png");
  assert(SUPPORTED_STATEMENT_MIME_TYPES.includes("application/pdf"), "MIMEs include application/pdf");

  assert(extractFileExtension("statement.PDF") === ".pdf", "extractFileExtension lowercases .pdf");
  assert(extractFileExtension("receipt.jpeg") === ".jpeg", "extractFileExtension gets .jpeg");
  assert(extractFileExtension("no_extension") === "", "extractFileExtension handles missing extension");

  assert(detectStatementFileType("application/pdf", "doc.pdf") === "pdf", "Detects PDF from MIME and ext");
  assert(detectStatementFileType(null, "doc.pdf") === "pdf", "Detects PDF from filename alone");
  assert(detectStatementFileType("image/png", null) === "image", "Detects Image from MIME alone");
  assert(detectStatementFileType(null, "photo.jpg") === "image", "Detects Image from .jpg ext");
  assert(detectStatementFileType("text/csv", "data.csv") === null, "Rejects CSV as null");
  assert(detectStatementFileType("application/msword", "doc.doc") === null, "Rejects Word as null");

  // -------------------------------------------------------------
  // PART 2: Valid PDF Selection
  // -------------------------------------------------------------
  console.log("\n--- PART 2: Valid PDF Selection ---");
  const mockPdfAsset = {
    uri: "file:///data/user/0/com.avaran.security/cache/august_statement.pdf",
    name: "august_statement.pdf",
    size: 2.4 * 1024 * 1024, // 2.4 MB
    mimeType: "application/pdf",
    lastModified: 1725883200000,
  };

  const pdfVal = validateStatementFile(mockPdfAsset);
  assert(pdfVal.valid === true, "PDF asset passes validation");
  if (pdfVal.valid) {
    assert(pdfVal.file.fileType === "pdf", "fileType is 'pdf'");
    assert(pdfVal.file.name === "august_statement.pdf", "Preserves filename");
    assert(pdfVal.file.extension === ".pdf", "Extension is .pdf");
    assert(pdfVal.file.mimeType === "application/pdf", "MIME is application/pdf");
    assert(pdfVal.file.size === 2.4 * 1024 * 1024, "Preserves size");
    assert(pdfVal.file.uri === mockPdfAsset.uri, "Preserves local URI");
  }

  // Pick function integration with mock picker
  const pdfPickerResult = await pickStatementFile({
    pickerFn: async () => ({
      canceled: false,
      assets: [mockPdfAsset],
    }),
  });
  assert(pdfPickerResult.status === "success", "pickStatementFile returns success for valid PDF");
  if (pdfPickerResult.status === "success") {
    assert(pdfPickerResult.file.fileType === "pdf", "Returned file has fileType pdf");
    assert(pdfPickerResult.file.uri.endsWith("august_statement.pdf"), "Returned file URI matches");
  }

  // -------------------------------------------------------------
  // PART 3: Valid Image Selection (JPEG, PNG, WebP)
  // -------------------------------------------------------------
  console.log("\n--- PART 3: Valid Image Selection ---");
  const imageAssets = [
    { name: "passbook_page1.jpg", mime: "image/jpeg", ext: ".jpg" },
    { name: "passbook_page2.jpeg", mime: "image/jpeg", ext: ".jpeg" },
    { name: "upi_receipt.png", mime: "image/png", ext: ".png" },
    { name: "statement_scan.webp", mime: "image/webp", ext: ".webp" },
  ];

  for (const img of imageAssets) {
    const asset = {
      uri: `file:///data/cache/${img.name}`,
      name: img.name,
      size: 1.2 * 1024 * 1024,
      mimeType: img.mime,
      lastModified: Date.now(),
    };
    const val = validateStatementFile(asset);
    assert(val.valid === true, `Image ${img.name} passes validation`);
    if (val.valid) {
      assert(val.file.fileType === "image", `${img.name} categorized as 'image'`);
      assert(val.file.extension === img.ext, `${img.name} has extension ${img.ext}`);
    }

    const pickerRes = await pickStatementFile({
      pickerFn: async () => ({
        canceled: false,
        assets: [asset],
      }),
    });
    assert(pickerRes.status === "success", `pickStatementFile succeeds for ${img.name}`);
  }

  // -------------------------------------------------------------
  // PART 4: Unsupported File Types Rejection
  // -------------------------------------------------------------
  console.log("\n--- PART 4: Unsupported File Types ---");
  const unsupportedFiles = [
    { name: "statement.csv", mime: "text/csv" },
    { name: "statement.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    { name: "audit.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    { name: "video_proof.mp4", mime: "video/mp4" },
    { name: "archive.zip", mime: "application/zip" },
    { name: "script.exe", mime: "application/x-msdownload" },
  ];

  for (const badFile of unsupportedFiles) {
    const asset = {
      uri: `file:///data/cache/${badFile.name}`,
      name: badFile.name,
      size: 500 * 1024,
      mimeType: badFile.mime,
      lastModified: Date.now(),
    };
    const val = validateStatementFile(asset);
    assert(val.valid === false, `Rejects unsupported file: ${badFile.name}`);
    if (!val.valid) {
      assert(val.code === "UNSUPPORTED_TYPE", `Error code is UNSUPPORTED_TYPE for ${badFile.name}`);
      assert(val.error.includes("Unsupported file format"), `Helpful error message for ${badFile.name}`);
    }

    const res = await pickStatementFile({
      pickerFn: async () => ({
        canceled: false,
        assets: [asset],
      }),
    });
    assert(res.status === "error", `pickStatementFile returns error status for ${badFile.name}`);
    if (res.status === "error") {
      assert(res.code === "UNSUPPORTED_TYPE", `Status code matches UNSUPPORTED_TYPE`);
    }
  }

  // -------------------------------------------------------------
  // PART 5: Oversized File Rejection
  // -------------------------------------------------------------
  console.log("\n--- PART 5: Oversized File Rejection ---");
  const oversizedAsset = {
    uri: "file:///data/cache/massive_scan.pdf",
    name: "massive_scan.pdf",
    size: 15 * 1024 * 1024, // 15 MB (exceeds default 10 MB)
    mimeType: "application/pdf",
    lastModified: Date.now(),
  };

  const overVal = validateStatementFile(oversizedAsset);
  assert(overVal.valid === false, "Oversized file (15MB) rejected under default 10MB limit");
  if (!overVal.valid) {
    assert(overVal.code === "OVERSIZED_FILE", "Error code is OVERSIZED_FILE");
    assert(overVal.error.includes("exceeds the maximum allowed size"), "Error details maximum allowed size");
  }

  const overRes = await pickStatementFile({
    pickerFn: async () => ({
      canceled: false,
      assets: [oversizedAsset],
    }),
  });
  assert(overRes.status === "error" && overRes.code === "OVERSIZED_FILE", "Picker result returns OVERSIZED_FILE");

  // Custom limit check: 2 MB limit with 3 MB file
  const customLimitVal = validateStatementFile(
    { ...oversizedAsset, size: 3 * 1024 * 1024 },
    2 * 1024 * 1024 // 2 MB
  );
  assert(customLimitVal.valid === false, "Custom limit 2MB rejects 3MB file");
  if (!customLimitVal.valid) {
    assert(customLimitVal.code === "OVERSIZED_FILE", "Custom limit sets OVERSIZED_FILE");
  }

  // -------------------------------------------------------------
  // PART 6: Empty File Rejection (0 bytes)
  // -------------------------------------------------------------
  console.log("\n--- PART 6: Empty File Rejection ---");
  const emptyAsset = {
    uri: "file:///data/cache/empty_statement.pdf",
    name: "empty_statement.pdf",
    size: 0,
    mimeType: "application/pdf",
  };

  const emptyVal = validateStatementFile(emptyAsset);
  assert(emptyVal.valid === false, "Empty 0-byte file rejected");
  if (!emptyVal.valid) {
    assert(emptyVal.code === "EMPTY_FILE", "Error code is EMPTY_FILE");
    assert(emptyVal.error.includes("is empty (0 bytes)"), "Helpful message indicating 0 bytes");
  }

  // -------------------------------------------------------------
  // PART 7: User Cancellation
  // -------------------------------------------------------------
  console.log("\n--- PART 7: User Cancellation Handling ---");
  // 7a. DocumentPicker returns canceled: true
  const cancelRes1 = await pickStatementFile({
    pickerFn: async () => ({
      canceled: true,
      assets: null,
    }),
  });
  assert(cancelRes1.status === "cancelled", "Handled canceled: true with status 'cancelled'");

  // 7b. DocumentPicker returns empty assets array
  const cancelRes2 = await pickStatementFile({
    pickerFn: async () => ({
      canceled: false,
      assets: [],
    }),
  });
  assert(cancelRes2.status === "cancelled", "Handled empty assets array with status 'cancelled'");

  // -------------------------------------------------------------
  // PART 8: Invalid URI & Picker Error Handling
  // -------------------------------------------------------------
  console.log("\n--- PART 8: Exception / Invalid URI Handling ---");
  const invalidUriVal = validateStatementFile({
    name: "valid.pdf",
    mimeType: "application/pdf",
    uri: "",
  });
  assert(invalidUriVal.valid === false, "Rejects asset with empty URI");
  if (!invalidUriVal.valid) {
    assert(invalidUriVal.code === "INVALID_SELECTION", "Code is INVALID_SELECTION");
  }

  const exceptionRes = await pickStatementFile({
    pickerFn: async () => {
      throw new Error("System file picker process crashed");
    },
  });
  assert(exceptionRes.status === "error", "Exceptions caught gracefully with status 'error'");
  if (exceptionRes.status === "error") {
    assert(exceptionRes.code === "PICKER_FAILED", "Code is PICKER_FAILED");
    assert(exceptionRes.error.includes("System file picker process crashed"), "Preserves exception message");
  }

  console.log("\n=================================================================");
  console.log("ALL STATEMENT UPLOAD REGRESSION CHECKS PASSED");
  console.log("=================================================================\n");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
