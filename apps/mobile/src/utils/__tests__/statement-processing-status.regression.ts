/**
 * Statement Processing Status Regression Tests
 * (`apps/mobile/src/utils/__tests__/statement-processing-status.regression.ts`)
 *
 * Requirements Covered:
 * 1. Status retrieval: Querying statement processing status returns typed StatementStatusResponse.
 * 2. Processing state: Handles intermediate PROCESSING status with appropriate messaging.
 * 3. Completed processing: Transitions to COMPLETED status and displays baseline calibration confirmation.
 * 4. Failed processing: Transitions to FAILED status with error_detail display.
 * 5. Unauthorized access: 401 response mapped to AUTH_FAILURE with authentication guidance.
 * 6. Network failure: Status query network timeout/disconnection mapped to NETWORK_FAILURE.
 * 7. Status refresh flow: Component status refresh updates state from PROCESSING to COMPLETED.
 *
 * Run with: npx -y tsx src/utils/__tests__/statement-processing-status.regression.ts
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
  getStatementProcessingStatus,
} = require("../../services/statement-upload-service");

import type {
  StatementStatusResponse,
  StatementStatusResult,
  StatementProcessingStatus,
} from "../../services/statement-upload-service";

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
  console.log("STATEMENT PROCESSING STATUS REGRESSION TESTS");
  console.log("=================================================================\n");

  const testUploadId = "stmt_upl_abc123456789";

  // -------------------------------------------------------------
  // PART 1: Status Retrieval (RECEIVED state)
  // -------------------------------------------------------------
  console.log("--- PART 1: Initial Status Retrieval (RECEIVED) ---");
  const receivedResult: StatementStatusResult = await getStatementProcessingStatus(testUploadId, {
    statusFn: async (uploadId: string) => {
      return {
        status: 200,
        data: {
          upload_id: uploadId,
          user_id: 1,
          filename: "hdfc_august.pdf",
          status: "RECEIVED" as StatementProcessingStatus,
          message: "Statement file successfully uploaded and received for processing.",
          created_at: "2026-09-09T16:00:00Z",
          updated_at: "2026-09-09T16:00:00Z",
          error_detail: null,
        },
      };
    },
  });

  assert(receivedResult.success === true, "Status query returned success = true");
  if (receivedResult.success) {
    assert(receivedResult.data.upload_id === testUploadId, "Returned matching upload_id");
    assert(receivedResult.data.status === "RECEIVED", "Processing status is 'RECEIVED'");
    assert(receivedResult.data.filename === "hdfc_august.pdf", "Filename matches");
    assert(receivedResult.data.error_detail === null, "error_detail is null for RECEIVED");
  }

  // -------------------------------------------------------------
  // PART 2: Processing State (PROCESSING)
  // -------------------------------------------------------------
  console.log("\n--- PART 2: Processing In-Progress (PROCESSING) ---");
  const processingResult: StatementStatusResult = await getStatementProcessingStatus(testUploadId, {
    statusFn: async (uploadId: string) => {
      return {
        status: 200,
        data: {
          upload_id: uploadId,
          user_id: 1,
          filename: "hdfc_august.pdf",
          status: "PROCESSING" as StatementProcessingStatus,
          message: "Statement document is currently being processed.",
          created_at: "2026-09-09T16:00:00Z",
          updated_at: "2026-09-09T16:01:00Z",
          error_detail: null,
        },
      };
    },
  });

  assert(processingResult.success === true, "Processing query returned success = true");
  if (processingResult.success) {
    assert(processingResult.data.status === "PROCESSING", "Status is 'PROCESSING'");
    assert(processingResult.data.message.includes("currently being processed"), "Message indicates active processing");
  }

  // -------------------------------------------------------------
  // PART 3: Completed Processing (COMPLETED)
  // -------------------------------------------------------------
  console.log("\n--- PART 3: Completed Processing (COMPLETED) ---");
  const completedResult: StatementStatusResult = await getStatementProcessingStatus(testUploadId, {
    statusFn: async (uploadId: string) => {
      return {
        status: 200,
        data: {
          upload_id: uploadId,
          user_id: 1,
          filename: "hdfc_august.pdf",
          status: "COMPLETED" as StatementProcessingStatus,
          message: "Statement processing completed successfully.",
          created_at: "2026-09-09T16:00:00Z",
          updated_at: "2026-09-09T16:02:00Z",
          error_detail: null,
        },
      };
    },
  });

  assert(completedResult.success === true, "Completed query returned success = true");
  if (completedResult.success) {
    assert(completedResult.data.status === "COMPLETED", "Status is 'COMPLETED'");
    assert(completedResult.data.message.includes("completed successfully"), "Message indicates completion");
    assert(completedResult.data.error_detail === null, "error_detail is null for COMPLETED");
  }

  // -------------------------------------------------------------
  // PART 4: Failed Processing (FAILED with error_detail)
  // -------------------------------------------------------------
  console.log("\n--- PART 4: Failed Processing (FAILED) ---");
  const failedResult: StatementStatusResult = await getStatementProcessingStatus(testUploadId, {
    statusFn: async (uploadId: string) => {
      return {
        status: 200,
        data: {
          upload_id: uploadId,
          user_id: 1,
          filename: "corrupted_scan.pdf",
          status: "FAILED" as StatementProcessingStatus,
          message: "Statement processing failed.",
          created_at: "2026-09-09T16:00:00Z",
          updated_at: "2026-09-09T16:01:30Z",
          error_detail: "SCAN_UNREADABLE: Resolution too low or password-locked PDF.",
        },
      };
    },
  });

  assert(failedResult.success === true, "Failed query returned success = true");
  if (failedResult.success) {
    assert(failedResult.data.status === "FAILED", "Status is 'FAILED'");
    assert(failedResult.data.error_detail !== null, "error_detail is populated");
    assert(Boolean(failedResult.data.error_detail?.includes("SCAN_UNREADABLE")), "error_detail conveys failure reason");
  }

  // -------------------------------------------------------------
  // PART 5: Unauthorized Access (401)
  // -------------------------------------------------------------
  console.log("\n--- PART 5: Unauthorized Access Handling ---");
  const unauthorizedResult: StatementStatusResult = await getStatementProcessingStatus(testUploadId, {
    statusFn: async () => {
      return {
        status: 401,
        error: "Authentication required. Please log in again to view statement status.",
        data: { detail: "Authentication required" } as any,
      };
    },
  });

  assert(unauthorizedResult.success === false, "Unauthorized query returns success = false");
  if (!unauthorizedResult.success) {
    assert(unauthorizedResult.error.type === "AUTH_FAILURE", "Classified as AUTH_FAILURE");
    assert(unauthorizedResult.error.statusCode === 401, "Status code is 401");
    assert(unauthorizedResult.error.message.includes("Authentication required"), "Contains auth guidance");
  }

  // -------------------------------------------------------------
  // PART 6: Network Failure
  // -------------------------------------------------------------
  console.log("\n--- PART 6: Network Failure Handling ---");
  const networkFailureResult: StatementStatusResult = await getStatementProcessingStatus(testUploadId, {
    statusFn: async () => {
      return {
        status: 0,
        isNetworkError: true,
        error: "Unable to connect to Avaran server. Please check your network connection.",
      };
    },
  });

  assert(networkFailureResult.success === false, "Network failure query returns success = false");
  if (!networkFailureResult.success) {
    assert(networkFailureResult.error.type === "NETWORK_FAILURE", "Classified as NETWORK_FAILURE");
    assert(networkFailureResult.error.statusCode === 0, "Status code is 0");
    assert(networkFailureResult.error.message.includes("check your network connection"), "Provides network guidance");
  }

  // -------------------------------------------------------------
  // PART 7: Status Refresh Flow (Component Lifecycle Simulation)
  // -------------------------------------------------------------
  console.log("\n--- PART 7: Status Refresh Flow (PROCESSING -> COMPLETED) ---");
  let currentStatus: StatementStatusResponse = {
    upload_id: testUploadId,
    user_id: 1,
    filename: "hdfc_august.pdf",
    status: "PROCESSING",
    message: "Statement document is currently being processed.",
    created_at: "2026-09-09T16:00:00Z",
    updated_at: "2026-09-09T16:01:00Z",
    error_detail: null,
  };

  assert(currentStatus.status === "PROCESSING", "Initial component status is PROCESSING");

  // User presses [REFRESH STATUS]
  let refreshCount = 0;
  const refreshStatusFn = async (uploadId: string) => {
    refreshCount++;
    return {
      status: 200,
      data: {
        upload_id: uploadId,
        user_id: 1,
        filename: "hdfc_august.pdf",
        status: "COMPLETED" as StatementProcessingStatus,
        message: "Statement processing completed successfully.",
        created_at: "2026-09-09T16:00:00Z",
        updated_at: "2026-09-09T16:03:00Z",
        error_detail: null,
      },
    };
  };

  const refreshResult = await getStatementProcessingStatus(testUploadId, {
    statusFn: refreshStatusFn,
  });

  if (refreshResult.success) {
    currentStatus = refreshResult.data;
  }

  assert(refreshCount === 1, "refreshStatusFn executed on button press");
  assert(currentStatus.status === "COMPLETED", "Component status successfully transitioned to COMPLETED");
  assert(currentStatus.message === "Statement processing completed successfully.", "Status message updated");
  assert(currentStatus.updated_at === "2026-09-09T16:03:00Z", "Updated timestamp reflects latest transition");

  // -------------------------------------------------------------
  // PART 8: Invalid / Empty Upload ID Validation
  // -------------------------------------------------------------
  console.log("\n--- PART 8: Empty / Invalid Upload ID Validation ---");
  const emptyIdResult = await getStatementProcessingStatus("   ");
  assert(emptyIdResult.success === false, "Empty upload ID returns success = false");
  if (!emptyIdResult.success) {
    assert(emptyIdResult.error.type === "SERVER_VALIDATION", "Error type is SERVER_VALIDATION");
    assert(emptyIdResult.error.message.includes("Invalid statement upload ID"), "Appropriate validation message");
  }

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
