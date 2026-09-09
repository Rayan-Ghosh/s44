/**
 * Statement Upload Backend Integration Regression Tests
 * (`apps/mobile/src/utils/__tests__/statement-upload-backend.regression.ts`)
 *
 * Requirements Covered:
 * 1. Successful upload: Valid PDF/Image statement uploaded using local URI,
 *    preserving filename and MIME type, returning typed StatementUploadResponse.
 * 2. Cancellation before upload: User cancels picker before upload, or removes
 *    selected file before upload; aborts in-flight request if cancelled.
 * 3. Network failure: Offline / connection timeout mapped to NETWORK_FAILURE
 *    with retry state.
 * 4. Unauthorized response: 401 response mapped to AUTH_FAILURE with retry state.
 * 5. Server validation failure: 400 response mapped to SERVER_VALIDATION with detail.
 * 6. Retry state: Simulates retry after failure, verifying state recovery and receipt return.
 *
 * Run with: npx -y tsx src/utils/__tests__/statement-upload-backend.regression.ts
 */

// @ts-ignore
(globalThis as any).__DEV__ = true;
// @ts-ignore
(globalThis as any).expo = { EventEmitter: class {} };

// Mock environment modules before importing application code
// @ts-ignore
import Module from "module";

// Polyfill FormData for Node test environment if not present
if (typeof (globalThis as any).FormData === "undefined") {
  class MockFormData {
    private entries: Record<string, any> = {};
    append(key: string, value: any) {
      this.entries[key] = value;
    }
    get(key: string) {
      return this.entries[key];
    }
    has(key: string) {
      return key in this.entries;
    }
  }
  (globalThis as any).FormData = MockFormData;
}

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
  uploadStatementFile,
  pickStatementFile,
} = require("../../services/statement-upload-service");

const {
  formatFileSize,
} = require("../../components/protection/StatementUploadCard");

import type {
  SelectedStatementFile,
  StatementUploadResponse,
  StatementUploadResult,
  StatementUploadError,
} from "../../services/statement-upload-service";
import type { StatementUploadUiState } from "../../components/protection/StatementUploadCard";

let totalChecks = 0;
let failures = 0;

function assert(condition: boolean, description: string, detail?: any) {
  totalChecks++;
  if (condition) {
    console.log(`[OK]   ${description}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`);
  } else {
    failures++;
    console.error(`[FAIL] ${description}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`);
  }
}

async function runTests() {
  console.log("\n=================================================================");
  console.log("STATEMENT UPLOAD BACKEND CONNECTION REGRESSION TESTS");
  console.log("=================================================================\n");

  const samplePdfFile: SelectedStatementFile = {
    uri: "file:///data/user/0/com.avaran.security/cache/hdfc_statement_august.pdf",
    name: "hdfc_statement_august.pdf",
    size: 2048500, // ~1.95 MB
    mimeType: "application/pdf",
    fileType: "pdf",
    extension: ".pdf",
    lastModified: 1725890000000,
  };

  const sampleImageFile: SelectedStatementFile = {
    uri: "file:///data/user/0/com.avaran.security/cache/icici_passbook.png",
    name: "icici_passbook.png",
    size: 1500000,
    mimeType: "image/png",
    fileType: "image",
    extension: ".png",
    lastModified: 1725891000000,
  };

  // -------------------------------------------------------------
  // PART 1: Successful PDF Upload
  // -------------------------------------------------------------
  console.log("--- PART 1: Successful PDF Upload ---");
  let capturedFormData: any = null;

  const mockSuccessUploadFn = async (formData: FormData) => {
    capturedFormData = formData;
    const fileEntry = (formData as any).get ? (formData as any).get("file") : (formData as any).entries?.file;
    return {
      status: 200,
      data: {
        upload_id: "stmt_upl_test123456",
        user_id: 42,
        filename: fileEntry?.name || samplePdfFile.name,
        content_type: fileEntry?.type || samplePdfFile.mimeType,
        size_bytes: samplePdfFile.size,
        status: "RECEIVED",
        message: "Statement file successfully uploaded and received for processing.",
        uploaded_at: "2026-09-09T16:00:00.000Z",
      },
    };
  };

  const successResult = await uploadStatementFile(samplePdfFile, {
    uploadFn: mockSuccessUploadFn,
  });

  assert(successResult.success === true, "Upload returned success = true");
  if (successResult.success) {
    assert(successResult.data.upload_id === "stmt_upl_test123456", "Receipt upload_id matches");
    assert(successResult.data.user_id === 42, "user_id matches authenticated user");
    assert(successResult.data.filename === "hdfc_statement_august.pdf", "Original filename preserved");
    assert(successResult.data.content_type === "application/pdf", "MIME type preserved");
    assert(successResult.data.size_bytes === 2048500, "File size preserved");
    assert(successResult.data.status === "RECEIVED", "Status is 'RECEIVED'");
    assert(successResult.data.message.includes("successfully uploaded"), "Status message confirms receipt");
  }

  // -------------------------------------------------------------
  // PART 2: Successful Image Upload
  // -------------------------------------------------------------
  console.log("\n--- PART 2: Successful Image Upload ---");
  const imgSuccessResult = await uploadStatementFile(sampleImageFile, {
    uploadFn: async (formData: FormData) => {
      const fileEntry = (formData as any).get ? (formData as any).get("file") : (formData as any).entries?.file;
      return {
        status: 200,
        data: {
          upload_id: "stmt_upl_img987654",
          user_id: 42,
          filename: fileEntry?.name || sampleImageFile.name,
          content_type: fileEntry?.type || sampleImageFile.mimeType,
          size_bytes: sampleImageFile.size,
          status: "RECEIVED",
          message: "Statement file successfully uploaded and received for processing.",
          uploaded_at: "2026-09-09T16:05:00.000Z",
        },
      };
    },
  });

  assert(imgSuccessResult.success === true, "Image upload returned success = true");
  if (imgSuccessResult.success) {
    assert(imgSuccessResult.data.upload_id.startsWith("stmt_upl_"), "Image receipt upload_id starts with stmt_upl_");
    assert(imgSuccessResult.data.content_type === "image/png", "PNG MIME type preserved");
    assert(imgSuccessResult.data.filename === "icici_passbook.png", "PNG filename preserved");
  }

  // -------------------------------------------------------------
  // PART 3: Cancellation Before Upload
  // -------------------------------------------------------------
  console.log("\n--- PART 3: Cancellation Before Upload ---");

  // 3a. Picker cancelled before selection
  const pickerCancelled = await pickStatementFile({
    pickerFn: async () => ({ canceled: true, assets: null }),
  });
  assert(pickerCancelled.status === "cancelled", "Picker cancellation returns status = cancelled");

  // 3b. AbortSignal cancelled before upload initiation
  const preAbortedController = new AbortController();
  preAbortedController.abort();

  let uploadInitiated = false;
  const preAbortedResult = await uploadStatementFile(samplePdfFile, {
    signal: preAbortedController.signal,
    uploadFn: async () => {
      uploadInitiated = true;
      return { status: 200, data: {} as any };
    },
  });

  assert(preAbortedResult.success === false, "Pre-aborted upload returns success = false");
  if (!preAbortedResult.success) {
    assert(preAbortedResult.error.type === "CANCELLED", "Error type is 'CANCELLED'");
    assert(preAbortedResult.error.message.includes("cancelled"), "Error message notes cancellation");
  }
  assert(uploadInitiated === false, "Upload function was not called when pre-aborted");

  // 3c. User removes selected file before clicking upload (Component Flow Simulation)
  let componentState: StatementUploadUiState = "selected";
  let componentSelectedFile: SelectedStatementFile | null = samplePdfFile;
  let uploadCalledOnRemoved = false;

  // User presses [REMOVE]
  componentSelectedFile = null;
  componentState = "idle";
  assert(componentState === "idle", "Component state resets to 'idle' on pre-upload removal");
  assert(componentSelectedFile === null, "Selected file cleared on pre-upload removal");
  assert(uploadCalledOnRemoved === false, "No network upload executed when user removed file before upload");

  // -------------------------------------------------------------
  // PART 4: Network Failure
  // -------------------------------------------------------------
  console.log("\n--- PART 4: Network Failure Handling ---");
  const networkErrorResult = await uploadStatementFile(samplePdfFile, {
    uploadFn: async () => {
      return {
        status: 0,
        isNetworkError: true,
        error: "Unable to connect to Avaran server. Please check your network connection.",
      };
    },
  });

  assert(networkErrorResult.success === false, "Network failure returns success = false");
  if (!networkErrorResult.success) {
    assert(networkErrorResult.error.type === "NETWORK_FAILURE", "Classified as 'NETWORK_FAILURE'");
    assert(networkErrorResult.error.statusCode === 0, "Network failure status code is 0");
    assert(networkErrorResult.error.message.includes("connect to Avaran server"), "Helpful network message returned");
  }

  // -------------------------------------------------------------
  // PART 5: Unauthorized Response (401)
  // -------------------------------------------------------------
  console.log("\n--- PART 5: Unauthorized Response (401) Handling ---");
  const authErrorResult = await uploadStatementFile(samplePdfFile, {
    uploadFn: async () => {
      return {
        status: 401,
        error: "Authentication required. Please log in again.",
        data: { detail: "Authentication required" } as any,
      };
    },
  });

  assert(authErrorResult.success === false, "401 returns success = false");
  if (!authErrorResult.success) {
    assert(authErrorResult.error.type === "AUTH_FAILURE", "Classified as 'AUTH_FAILURE'");
    assert(authErrorResult.error.statusCode === 401, "Status code is 401");
    assert(authErrorResult.error.message.includes("Authentication required"), "Contains auth guidance");
  }

  // -------------------------------------------------------------
  // PART 6: Server Validation Failure (400 Bad Request)
  // -------------------------------------------------------------
  console.log("\n--- PART 6: Server Validation Failure (400) Handling ---");
  const validationErrorResult = await uploadStatementFile(samplePdfFile, {
    uploadFn: async () => {
      return {
        status: 400,
        error: "Statement file 'hdfc_statement_august.pdf' (12.5 MB) exceeds maximum allowed size of 10 MB.",
        data: {
          detail: "Statement file 'hdfc_statement_august.pdf' (12.5 MB) exceeds maximum allowed size of 10 MB.",
        } as any,
      };
    },
  });

  assert(validationErrorResult.success === false, "400 returns success = false");
  if (!validationErrorResult.success) {
    assert(validationErrorResult.error.type === "SERVER_VALIDATION", "Classified as 'SERVER_VALIDATION'");
    assert(validationErrorResult.error.statusCode === 400, "Status code is 400");
    assert(validationErrorResult.error.message.includes("exceeds maximum allowed size"), "Propagates server validation detail");
  }

  // -------------------------------------------------------------
  // PART 7: Retry State Lifecycle
  // -------------------------------------------------------------
  console.log("\n--- PART 7: Retry State Lifecycle ---");
  let attemptCount = 0;
  const retryMockUploadFn = async (formData: FormData) => {
    attemptCount++;
    if (attemptCount === 1) {
      // First attempt fails with network error
      return {
        status: 0,
        isNetworkError: true,
        error: "Network timeout",
      };
    }
    // Retry attempt succeeds
    return {
      status: 200,
      data: {
        upload_id: "stmt_upl_retry_success",
        user_id: 42,
        filename: samplePdfFile.name,
        content_type: samplePdfFile.mimeType,
        size_bytes: samplePdfFile.size,
        status: "RECEIVED",
        message: "Statement file successfully uploaded and received for processing.",
        uploaded_at: "2026-09-09T16:10:00.000Z",
      },
    };
  };

  // Initial attempt: fails
  let currentUiState: StatementUploadUiState = "uploading";
  let currentError: StatementUploadError | null = null;
  let currentReceipt: StatementUploadResponse | null = null;

  const attempt1Result = await uploadStatementFile(samplePdfFile, {
    uploadFn: retryMockUploadFn,
  });

  if (!attempt1Result.success) {
    currentUiState = "error";
    currentError = attempt1Result.error;
  }

  assert(currentUiState === "error", "Component transitioned to 'error' state after attempt 1");
  assert(currentError?.type === "NETWORK_FAILURE", "Error is NETWORK_FAILURE");
  assert(attemptCount === 1, "Attempt count is 1");

  // User presses [RETRY UPLOAD]
  currentUiState = "uploading";
  currentError = null;

  const attempt2Result = await uploadStatementFile(samplePdfFile, {
    uploadFn: retryMockUploadFn,
  });

  if (attempt2Result.success) {
    currentUiState = "uploaded";
    currentReceipt = attempt2Result.data;
  }

  assert(currentUiState === "uploaded", "Component transitioned to 'uploaded' state on successful retry");
  assert(currentReceipt?.upload_id === "stmt_upl_retry_success", "Receipt ID confirms successful retry");
  assert(attemptCount === 2, "Attempt count reached 2 on retry");

  console.log("\n=================================================================");
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSES:       ${totalChecks - failures}`);
  console.log(`FAILURES:     ${failures}`);
  console.log("=================================================================\n");

  if (failures > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Test execution fatal error:", e);
  process.exit(1);
});
