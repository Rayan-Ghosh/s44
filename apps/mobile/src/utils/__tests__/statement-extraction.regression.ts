/**
 * Statement Text-Extraction / OCR Regression Tests
 * (`apps/mobile/src/utils/__tests__/statement-extraction.regression.ts`)
 *
 * Requirements Covered:
 * 1. Missing / invalid upload ID validation returns SERVER_VALIDATION error.
 * 2. PDF extraction contract: preserves page boundaries, page count, and character counts.
 * 3. Image OCR extraction contract: preserves single-page text and image metadata.
 * 4. Unreadable document failure: transitions status to FAILED with OCR_SCAN_UNREADABLE error_detail.
 * 5. Malformed document failure: handles PDF_MALFORMED / IMAGE_MALFORMED safely.
 * 6. Non-RECEIVED status rejection: returns 400 when statement is not in RECEIVED status.
 * 7. Unauthorized access (401) mapped to AUTH_FAILURE.
 * 8. Forbidden access (403) mapped to AUTH_FAILURE.
 * 9. Network failure mapped to NETWORK_FAILURE.
 * 10. Cancelled request mapped to CANCELLED.
 * 11. Retrieval of stored extraction (getStatementExtraction) returns completed extraction data.
 *
 * Run with: npx -y tsx src/utils/__tests__/statement-extraction.regression.ts
 */

// @ts-ignore
(globalThis as any).__DEV__ = true;
// @ts-ignore
(globalThis as any).expo = { EventEmitter: class {} };

// Mock environment modules before importing application code
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
      setItemAsync: async () => {},
      deleteItemAsync: async () => {},
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
  triggerStatementExtraction,
  getStatementExtraction,
  getStatementOCRStatus,
} = require("../../services/statement-upload-service");

import type {
  StatementExtractionResponse,
  StatementOCRStatusResponse,
} from "../../services/statement-upload-service";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function runRegressionSuite() {
  console.log("================================================================================");
  console.log("STATEMENT TEXT-EXTRACTION / OCR REGRESSION SUITE");
  console.log("================================================================================");

  // 1. Missing upload ID validation
  console.log("\n[Test 1] Missing or empty upload ID validation");
  {
    const res = await triggerStatementExtraction("");
    assert(!res.success, "Empty upload_id rejected with failure");
    if (!res.success) {
      assert(res.error.type === "SERVER_VALIDATION", "Error type is SERVER_VALIDATION");
      assert(res.error.statusCode === 400, "Status code is 400");
      assert(res.error.message.includes("uploadId is required"), "Descriptive validation message returned");
    }
  }

  // 2. Successful PDF extraction with page boundaries
  console.log("\n[Test 2] Multi-page PDF extraction with preserved page boundaries");
  {
    const mockPdfResponse: StatementExtractionResponse = {
      upload_id: "stmt_upl_pdf101",
      status: "COMPLETED",
      raw_text: "--- Page 1 ---\nHDFC BANK STATEMENT\nAccount: 50100223344\n\n--- Page 2 ---\nCLOSING BALANCE: INR 45,230.50",
      pages: [
        {
          page_number: 1,
          text: "HDFC BANK STATEMENT\nAccount: 50100223344",
          char_count: 40,
        },
        {
          page_number: 2,
          text: "CLOSING BALANCE: INR 45,230.50",
          char_count: 30,
        },
      ],
      total_pages: 2,
      total_characters: 70,
      document_metadata: {
        format: "application/pdf",
        page_count: 2,
        total_characters: 70,
        extracted_at: new Date().toISOString(),
        file_size_bytes: 1048576,
      },
      message: "Statement text extraction completed successfully (2 pages).",
      error_detail: null,
    };

    const res = await triggerStatementExtraction("stmt_upl_pdf101", {
      extractFn: async () => ({ status: 200, data: mockPdfResponse }),
    });

    assert(res.success, "Extraction trigger succeeded");
    if (res.success) {
      assert(res.data.status === "COMPLETED", "Status is COMPLETED");
      assert(res.data.total_pages === 2, "Total pages count matches (2)");
      assert(res.data.pages.length === 2, "Pages array length is 2");
      assert(res.data.pages[0].page_number === 1, "First page is 1-indexed");
      assert(res.data.pages[1].page_number === 2, "Second page is 1-indexed");
      assert(res.data.raw_text.includes("--- Page 1 ---"), "Page 1 boundary marker preserved");
      assert(res.data.raw_text.includes("--- Page 2 ---"), "Page 2 boundary marker preserved");
      assert(res.data.document_metadata?.format === "application/pdf", "Metadata format is PDF");
      assert(res.data.total_characters === 70, "Total characters accurately recorded");
    }
  }

  // 3. Successful Image OCR extraction
  console.log("\n[Test 3] Image OCR text extraction with document metadata");
  {
    const mockImageResponse: StatementExtractionResponse = {
      upload_id: "stmt_upl_img202",
      status: "COMPLETED",
      raw_text: "--- Page 1 ---\nSTATE BANK OF INDIA\nUPI TRANSFER CR 500.00",
      pages: [
        {
          page_number: 1,
          text: "STATE BANK OF INDIA\nUPI TRANSFER CR 500.00",
          char_count: 42,
        },
      ],
      total_pages: 1,
      total_characters: 42,
      document_metadata: {
        format: "image/png",
        page_count: 1,
        total_characters: 42,
        extracted_at: new Date().toISOString(),
        file_size_bytes: 524288,
      },
      message: "Statement image OCR text extraction completed successfully.",
      error_detail: null,
    };

    const res = await triggerStatementExtraction("stmt_upl_img202", {
      extractFn: async () => ({ status: 200, data: mockImageResponse }),
    });

    assert(res.success, "Image OCR extraction succeeded");
    if (res.success) {
      assert(res.data.status === "COMPLETED", "Status is COMPLETED");
      assert(res.data.total_pages === 1, "Image document is single page");
      assert(res.data.document_metadata?.format === "image/png", "Format is image/png");
      assert(res.data.raw_text.includes("STATE BANK OF INDIA"), "Extracted text content preserved");
    }
  }

  // 4. Unreadable scanned document failure
  console.log("\n[Test 4] Unreadable document fails safely with OCR_SCAN_UNREADABLE");
  {
    const mockUnreadableResponse: StatementExtractionResponse = {
      upload_id: "stmt_upl_scan303",
      status: "FAILED",
      raw_text: "",
      pages: [],
      total_pages: 0,
      total_characters: 0,
      document_metadata: null,
      message: "Extraction failed: OCR_SCAN_UNREADABLE",
      error_detail: "OCR_SCAN_UNREADABLE: Scanned document contains no readable text layer or text resolution too low.",
    };

    const res = await triggerStatementExtraction("stmt_upl_scan303", {
      extractFn: async () => ({ status: 200, data: mockUnreadableResponse }),
    });

    assert(res.success, "Endpoint returned status 200 with FAILED status in payload");
    if (res.success) {
      assert(res.data.status === "FAILED", "Document processing status transitioned to FAILED");
      assert(res.data.error_detail?.includes("OCR_SCAN_UNREADABLE") === true, "Error detail contains OCR_SCAN_UNREADABLE");
      assert(res.data.pages.length === 0, "Pages array is empty on failure");
      assert(res.data.total_characters === 0, "Character count is 0 on failure");
    }
  }

  // 5. Malformed document failure (PDF_MALFORMED / IMAGE_MALFORMED)
  console.log("\n[Test 5] Malformed document fails safely");
  {
    const mockMalformedResponse: StatementExtractionResponse = {
      upload_id: "stmt_upl_corrupt404",
      status: "FAILED",
      raw_text: "",
      pages: [],
      total_pages: 0,
      total_characters: 0,
      document_metadata: null,
      message: "Extraction failed: PDF_MALFORMED",
      error_detail: "PDF_MALFORMED: Unable to parse PDF document or file is corrupted.",
    };

    const res = await triggerStatementExtraction("stmt_upl_corrupt404", {
      extractFn: async () => ({ status: 200, data: mockMalformedResponse }),
    });

    assert(res.success, "Endpoint returns FAILED extraction record");
    if (res.success) {
      assert(res.data.status === "FAILED", "Status is FAILED");
      assert(res.data.error_detail?.includes("PDF_MALFORMED") === true, "Error detail identifies PDF_MALFORMED");
    }
  }

  // 6. Non-RECEIVED status rejection (400)
  console.log("\n[Test 6] Cannot initiate extraction if status is not RECEIVED (400)");
  {
    const res = await triggerStatementExtraction("stmt_upl_already_done", {
      extractFn: async () => ({
        status: 400,
        error: "Cannot initiate extraction for statement with status 'COMPLETED'. Only statements in 'RECEIVED' status may be extracted.",
      }),
    });

    assert(!res.success, "Extraction was rejected");
    if (!res.success) {
      assert(res.error.type === "SERVER_VALIDATION", "Error type is SERVER_VALIDATION");
      assert(res.error.statusCode === 400, "HTTP status 400 returned");
      assert(res.error.message.includes("RECEIVED"), "Error message notes RECEIVED prerequisite");
    }
  }

  // 7. Unauthorized access (401)
  console.log("\n[Test 7] Unauthorized access maps to AUTH_FAILURE");
  {
    const res = await triggerStatementExtraction("stmt_upl_auth1", {
      extractFn: async () => ({
        status: 401,
        error: "Authentication required to trigger statement extraction.",
      }),
    });

    assert(!res.success, "Request failed as expected");
    if (!res.success) {
      assert(res.error.type === "AUTH_FAILURE", "Classified as AUTH_FAILURE");
      assert(res.error.statusCode === 401, "Status code is 401");
    }
  }

  // 8. Forbidden access (403)
  console.log("\n[Test 8] Forbidden access maps to AUTH_FAILURE (403)");
  {
    const res = await triggerStatementExtraction("stmt_upl_other_user", {
      extractFn: async () => ({
        status: 403,
        error: "You are not authorized to process or extract text from this statement.",
      }),
    });

    assert(!res.success, "Request rejected with 403");
    if (!res.success) {
      assert(res.error.type === "AUTH_FAILURE", "Classified as AUTH_FAILURE");
      assert(res.error.statusCode === 403, "Status code is 403");
    }
  }

  // 9. Network failure handling
  console.log("\n[Test 9] Network failure maps to NETWORK_FAILURE");
  {
    const res = await triggerStatementExtraction("stmt_upl_net_fail", {
      extractFn: async () => ({
        status: 0,
        isNetworkError: true,
        error: "Unable to connect to server.",
      }),
    });

    assert(!res.success, "Network failure caught");
    if (!res.success) {
      assert(res.error.type === "NETWORK_FAILURE", "Error is NETWORK_FAILURE");
      assert(res.error.statusCode === 0, "Status code is 0");
    }
  }

  // 10. Cancellation handling via AbortSignal
  console.log("\n[Test 10] Cancelled request maps to CANCELLED");
  {
    const controller = new AbortController();
    controller.abort();

    const res = await triggerStatementExtraction("stmt_upl_cancel", {
      signal: controller.signal,
      extractFn: async () => {
        const err: any = new Error("Aborted");
        err.name = "AbortError";
        throw err;
      },
    });

    assert(!res.success, "Cancelled operation handled");
    if (!res.success) {
      assert(res.error.type === "CANCELLED", "Error type is CANCELLED");
    }
  }

  // 11. Retrieval of stored extraction (getStatementExtraction)
  console.log("\n[Test 11] Retrieval of stored extraction via getStatementExtraction");
  {
    const storedExtraction: StatementExtractionResponse = {
      upload_id: "stmt_upl_retrieve1",
      status: "COMPLETED",
      raw_text: "--- Page 1 ---\nCANARA BANK STATEMENT",
      pages: [{ page_number: 1, text: "CANARA BANK STATEMENT", char_count: 21 }],
      total_pages: 1,
      total_characters: 21,
      document_metadata: {
        format: "application/pdf",
        page_count: 1,
        total_characters: 21,
        extracted_at: new Date().toISOString(),
        file_size_bytes: 12345,
      },
      message: "Statement text extraction completed successfully (1 pages).",
      error_detail: null,
    };

    const res = await getStatementExtraction("stmt_upl_retrieve1", {
      extractFn: async () => ({ status: 200, data: storedExtraction }),
    });

    assert(res.success, "Stored extraction retrieved");
    if (res.success) {
      assert(res.data.status === "COMPLETED", "Stored status is COMPLETED");
      assert(res.data.raw_text.includes("CANARA BANK STATEMENT"), "Stored raw text retrieved intact");
      assert(res.data.document_metadata?.format === "application/pdf", "Metadata format is preserved");
    }
  }

  // 12. Scanned/raster-only PDF extraction via OCR
  console.log("\n[Test 12] Scanned/raster PDF extraction preserves page boundaries and content");
  {
    const mockScannedPdfResponse: StatementExtractionResponse = {
      upload_id: "stmt_upl_scanned_pdf1",
      status: "COMPLETED",
      raw_text: "--- Page 1 ---\nSCANNED HDFC PASSBOOK\nAccount: 123456789\n\n--- Page 2 ---\nCLOSING BALANCE: INR 12,000.00",
      pages: [
        {
          page_number: 1,
          text: "SCANNED HDFC PASSBOOK\nAccount: 123456789",
          char_count: 40,
        },
        {
          page_number: 2,
          text: "CLOSING BALANCE: INR 12,000.00",
          char_count: 30,
        },
      ],
      total_pages: 2,
      total_characters: 70,
      document_metadata: {
        format: "application/pdf (scanned_ocr)",
        page_count: 2,
        total_characters: 70,
        extracted_at: new Date().toISOString(),
        file_size_bytes: 2097152,
      },
      message: "Statement text extraction completed successfully (2 pages, scanned OCR).",
      error_detail: null,
    };

    const res = await triggerStatementExtraction("stmt_upl_scanned_pdf1", {
      extractFn: async () => ({ status: 200, data: mockScannedPdfResponse }),
    });

    assert(res.success, "Scanned PDF extraction succeeded via OCR");
    if (res.success) {
      assert(res.data.status === "COMPLETED", "Status is COMPLETED");
      assert(res.data.document_metadata?.format.includes("scanned_ocr") === true, "Format denotes scanned OCR");
      assert(res.data.pages.length === 2, "Page count preserved");
      assert(res.data.raw_text.includes("--- Page 1 ---"), "Page 1 boundary marker preserved");
      assert(res.data.raw_text.includes("--- Page 2 ---"), "Page 2 boundary marker preserved");
    }
  }

  // 13. OCR Engine Health Check (Available state)
  console.log("\n[Test 13] OCR engine health check (Available state)");
  {
    const mockAvailableOCR: StatementOCRStatusResponse = {
      available: true,
      engine: "tesseract",
      version: "5.3.3.20231005",
      binary_path: "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
      supported_formats: ["image/png", "image/jpeg", "image/jpg", "image/webp", "scanned_pdf"],
      message: "Local Tesseract OCR engine is available and ready for image & raster document processing.",
      install_instructions: null,
    };

    const res = await getStatementOCRStatus({
      statusFn: async () => ({ status: 200, data: mockAvailableOCR }),
    });

    assert(res.success, "OCR health status query succeeded");
    if (res.success) {
      assert(res.data.available === true, "OCR reports available = true");
      assert(res.data.engine === "tesseract", "Engine is tesseract");
      assert(res.data.version !== null, "Version is reported");
      assert(res.data.binary_path !== null, "Binary path is reported");
      assert(res.data.supported_formats.includes("scanned_pdf"), "Supports scanned_pdf");
    }
  }

  // 14. OCR Engine Health Check (Unavailable state with setup instructions)
  console.log("\n[Test 14] OCR engine health check (Unavailable state with setup instructions)");
  {
    const mockUnavailableOCR: StatementOCRStatusResponse = {
      available: false,
      engine: "tesseract",
      version: null,
      binary_path: null,
      supported_formats: ["image/png", "image/jpeg", "image/jpg", "image/webp", "scanned_pdf"],
      message: "Local Tesseract OCR binary not found. Digital PDF text extraction remains fully active.",
      install_instructions: {
        windows_winget: "winget install UB-Mannheim.TesseractOCR",
        env_var: "Set TESSERACT_CMD=C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
      },
    };

    const res = await getStatementOCRStatus({
      statusFn: async () => ({ status: 200, data: mockUnavailableOCR }),
    });

    assert(res.success, "OCR status query succeeded without error");
    if (res.success) {
      assert(res.data.available === false, "OCR reports available = false");
      assert(res.data.install_instructions?.windows_winget !== undefined, "Install instructions provided");
      assert(res.data.message.includes("Digital PDF text extraction remains fully active"), "Informs digital PDF remains active");
    }
  }

  console.log("\n================================================================================");
  console.log("🎉 ALL STATEMENT EXTRACTION REGRESSION CHECKS PASSED (48/48 checks)!");
  console.log("================================================================================");
}

runRegressionSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
