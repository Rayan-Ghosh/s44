/**
 * Statement Upload Card Component
 * (`apps/mobile/src/components/protection/StatementUploadCard.tsx`)
 *
 * Part 2B: Mobile Statement Document Upload Integration.
 *
 * Presents an interactive card for selecting, validating, reviewing, uploading,
 * and tracking bank/UPI statement documents (PDF or images up to 10MB) to calibrate
 * the user's behavioral fraud baseline.
 *
 * STATES SUPPORTED:
 * - idle: Initial standby ready for user to choose a file.
 * - selecting: Active file picker UI in progress with loader.
 * - selected: Valid file chosen; displays name, format badge, formatted size, upload trigger, and remove/change controls.
 * - uploading: Active network upload in progress with progress indicator and abort control.
 * - uploaded: Statement file uploaded to backend; displays processing status (RECEIVED, PROCESSING, COMPLETED, FAILED) and allows manual status refresh.
 * - cancelled: User dismissed file picker without selecting, or cancelled upload.
 * - error: Format validation error, picker failure, or backend upload failure with retry prompt.
 */

import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { StatusBadge } from "../common/StatusBadge";
import { Button } from "../common/Button";
import {
  pickStatementFile,
  uploadStatementFile,
  getStatementProcessingStatus,
  SelectedStatementFile,
  StatementPickerErrorCode,
  StatementPickerOptions,
  StatementUploadOptions,
  StatementUploadResponse,
  StatementUploadError,
  StatementProcessingStatus,
  StatementStatusResponse,
  StatementStatusOptions,
} from "../../services/statement-upload-service";

export type StatementUploadUiState =
  | "idle"
  | "selecting"
  | "selected"
  | "uploading"
  | "uploaded"
  | "cancelled"
  | "error";

export interface StatementUploadCardProps {
  /** Current user's id — the statement is uploaded to
   * POST /api/v1/users/{userId}/statement/upload (the personalized
   * transaction-pattern engine's endpoint; see statement-upload-service.ts
   * and apps/api/app/services/statement_parser_service.py). */
  userId: number;
  /** Optional container style */
  style?: ViewStyle;
  /** Callback fired when a valid statement file is successfully selected */
  onFileSelected?: (file: SelectedStatementFile) => void;
  /** Callback fired when the user removes the currently selected file */
  onFileRemoved?: () => void;
  /** Callback fired when the statement is successfully uploaded to the backend */
  onUploadSuccess?: (receipt: StatementUploadResponse) => void;
  /** Callback fired when statement upload encounters an error */
  onUploadError?: (error: StatementUploadError) => void;
  /** Callback fired when statement processing status is retrieved or refreshed */
  onStatusChange?: (status: StatementStatusResponse) => void;
  /** Optional custom picker function for headless / unit test environments */
  pickerFn?: StatementPickerOptions["pickerFn"];
  /** Optional custom upload function for headless / unit test environments */
  uploadFn?: StatementUploadOptions["uploadFn"];
  /** Optional custom status function for headless / unit test environments */
  statusFn?: StatementStatusOptions["statusFn"];
  /** Optional initial selected file */
  initialFile?: SelectedStatementFile | null;
  /** Optional initial upload receipt */
  initialReceipt?: StatementUploadResponse | null;
  /** Optional initial processing status */
  initialStatus?: StatementStatusResponse | null;
  /** Whether to automatically upload the file immediately upon selection (default: false) */
  autoUpload?: boolean;
}

/**
 * Formats byte counts into human-readable strings (e.g. "2.45 MB", "512 KB").
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const StatementUploadCard: React.FC<StatementUploadCardProps> = ({
  userId,
  style,
  onFileSelected,
  onFileRemoved,
  onUploadSuccess,
  onUploadError,
  onStatusChange,
  pickerFn,
  uploadFn,
  statusFn,
  initialFile = null,
  initialReceipt = null,
  initialStatus = null,
  autoUpload = false,
}) => {
  const [uiState, setUiState] = useState<StatementUploadUiState>(
    initialStatus || initialReceipt
      ? "uploaded"
      : initialFile
      ? "selected"
      : "idle"
  );
  const [selectedFile, setSelectedFile] = useState<SelectedStatementFile | null>(
    initialFile
  );
  const [uploadReceipt, setUploadReceipt] =
    useState<StatementUploadResponse | null>(initialReceipt);
  const [processingStatus, setProcessingStatus] =
    useState<StatementStatusResponse | null>(
      initialStatus ||
        (initialReceipt
          ? {
              upload_id: initialReceipt.upload_id,
              user_id: initialReceipt.user_id,
              filename: initialReceipt.filename,
              status:
                (initialReceipt.status as StatementProcessingStatus) ||
                "RECEIVED",
              message: initialReceipt.message,
              created_at: initialReceipt.uploaded_at,
              updated_at: initialReceipt.uploaded_at,
              error_detail: null,
            }
          : null)
    );
  const [isRefreshingStatus, setIsRefreshingStatus] = useState<boolean>(false);
  const [statusErrorMessage, setStatusErrorMessage] = useState<string | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<StatementPickerErrorCode | null>(
    null
  );
  const [uploadError, setUploadError] = useState<StatementUploadError | null>(
    null
  );

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleUpload = useCallback(
    async (fileToUpload?: SelectedStatementFile) => {
      const file = fileToUpload || selectedFile;
      if (!file) return;

      setUiState("uploading");
      setErrorMessage(null);
      setErrorCode(null);
      setUploadError(null);
      setStatusErrorMessage(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const result = await uploadStatementFile(file, {
          endpoint: `/api/v1/users/${userId}/statement/upload`,
          signal: controller.signal,
          uploadFn,
        });

        if (result.success) {
          setUploadReceipt(result.data);
          const initialProg: StatementStatusResponse = {
            upload_id: result.data.upload_id,
            user_id: result.data.user_id,
            filename: result.data.filename,
            status:
              (result.data.status as StatementProcessingStatus) || "RECEIVED",
            message: result.data.message,
            created_at: result.data.uploaded_at,
            updated_at: result.data.uploaded_at,
            error_detail: null,
          };
          setProcessingStatus(initialProg);
          setUiState("uploaded");
          onUploadSuccess?.(result.data);
          onStatusChange?.(initialProg);
        } else {
          setUploadError(result.error);
          setErrorMessage(result.error.message);
          setUiState("error");
          onUploadError?.(result.error);
        }
      } catch (err: any) {
        const fallbackError: StatementUploadError = {
          type: "UNKNOWN_ERROR",
          message: err?.message || "Failed to upload bank statement.",
        };
        setUploadError(fallbackError);
        setErrorMessage(fallbackError.message);
        setUiState("error");
        onUploadError?.(fallbackError);
      } finally {
        abortControllerRef.current = null;
      }
    },
    [selectedFile, userId, uploadFn, onUploadSuccess, onUploadError, onStatusChange]
  );

  const handleRefreshStatus = useCallback(async () => {
    const uploadId =
      processingStatus?.upload_id || uploadReceipt?.upload_id;
    if (!uploadId) return;

    setIsRefreshingStatus(true);
    setStatusErrorMessage(null);

    try {
      const result = await getStatementProcessingStatus(uploadId, {
        statusFn,
      });

      if (result.success) {
        setProcessingStatus(result.data);
        onStatusChange?.(result.data);
      } else {
        setStatusErrorMessage(result.error.message);
      }
    } catch (err: any) {
      setStatusErrorMessage(
        err?.message || "Failed to refresh processing status."
      );
    } finally {
      setIsRefreshingStatus(false);
    }
  }, [processingStatus, uploadReceipt, statusFn, onStatusChange]);

  const handlePickFile = useCallback(async () => {
    setUiState("selecting");
    setErrorMessage(null);
    setErrorCode(null);
    setUploadError(null);
    setStatusErrorMessage(null);

    try {
      const result = await pickStatementFile({
        pickerFn,
      });

      if (result.status === "success") {
        setSelectedFile(result.file);
        setUploadReceipt(null);
        setProcessingStatus(null);
        onFileSelected?.(result.file);

        if (autoUpload) {
          await handleUpload(result.file);
        } else {
          setUiState("selected");
        }
      } else if (result.status === "cancelled") {
        setUiState("cancelled");
      } else {
        // status === "error"
        setErrorMessage(result.error);
        setErrorCode(result.code);
        setUiState("error");
      }
    } catch (err) {
      setErrorMessage(
        (err as Error)?.message || "Unexpected file picker error."
      );
      setErrorCode("PICKER_FAILED");
      setUiState("error");
    }
  }, [pickerFn, onFileSelected, autoUpload, handleUpload]);

  const handleCancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Return to selected state so user can choose to re-upload or remove
    setUiState("selected");
  }, []);

  const handleRemoveFile = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSelectedFile(null);
    setUploadReceipt(null);
    setProcessingStatus(null);
    setUploadError(null);
    setStatusErrorMessage(null);
    setUiState("idle");
    setErrorMessage(null);
    setErrorCode(null);
    onFileRemoved?.();
  }, [onFileRemoved]);

  const handleReset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSelectedFile(null);
    setUploadReceipt(null);
    setProcessingStatus(null);
    setUploadError(null);
    setStatusErrorMessage(null);
    setUiState("idle");
    setErrorMessage(null);
    setErrorCode(null);
  }, []);

  return (
    <View style={[styles.card, style]} testID="statement-upload-card">
      {/* ------------------------------------------------------------- */}
      {/* STATE 1: IDLE                                                 */}
      {/* ------------------------------------------------------------- */}
      {uiState === "idle" && (
        <View style={styles.stateContent} testID="statement-state-idle">
          <View style={styles.topRow}>
            <View style={styles.iconBox}>
              <Ionicons
                name="document-text-outline"
                size={22}
                color={colors.brand}
              />
            </View>
            <View style={styles.titleCol}>
              <Text style={styles.titleText}>Upload Bank Statement</Text>
              <Text style={styles.subText}>
                PDF or image (JPEG, PNG, WebP up to 10 MB) to calibrate your
                90-day behavioral baseline.
              </Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Button
              label="CHOOSE STATEMENT FILE"
              icon="cloud-upload-outline"
              variant="primary"
              size="md"
              onPress={handlePickFile}
              accessibilityLabel="Choose statement file from storage"
            />
          </View>
        </View>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STATE 2: SELECTING (Picker Loader)                            */}
      {/* ------------------------------------------------------------- */}
      {uiState === "selecting" && (
        <View
          style={styles.stateContentCenter}
          testID="statement-state-selecting"
        >
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={styles.selectingText}>Opening document picker...</Text>
        </View>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STATE 3: SELECTED (File Chosen, Ready to Upload)              */}
      {/* ------------------------------------------------------------- */}
      {uiState === "selected" && selectedFile && (
        <View style={styles.stateContent} testID="statement-state-selected">
          <View style={styles.selectedHeaderRow}>
            <View style={styles.selectedLeft}>
              <View style={styles.selectedIconBox}>
                <Ionicons
                  name={
                    selectedFile.fileType === "pdf"
                      ? "document-text"
                      : "image"
                  }
                  size={20}
                  color={colors.brand}
                />
              </View>
              <View style={styles.selectedMetaCol}>
                <Text style={styles.selectedFileName} numberOfLines={1}>
                  {selectedFile.name}
                </Text>
                <View style={styles.metaBadgeRow}>
                  <StatusBadge
                    label={
                      selectedFile.fileType === "pdf"
                        ? "PDF STATEMENT"
                        : "IMAGE STATEMENT"
                    }
                    status="low"
                    dot={false}
                  />
                  <Text style={styles.fileSizeText}>
                    {formatFileSize(selectedFile.size)}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleRemoveFile}
              style={styles.trashBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Remove selected statement"
              testID="statement-btn-remove"
            >
              <Ionicons name="trash-outline" size={18} color={colors.threat} />
            </TouchableOpacity>
          </View>

          <View style={styles.readyBanner}>
            <Ionicons name="checkmark-circle" size={16} color={colors.safe} />
            <Text style={styles.readyBannerText}>
              File verified and ready for secure upload.
            </Text>
          </View>

          <View style={styles.primaryActionRow}>
            <Button
              label="UPLOAD STATEMENT"
              icon="cloud-upload"
              variant="primary"
              size="md"
              onPress={() => handleUpload()}
              accessibilityLabel="Upload statement file to backend"
              testID="statement-btn-upload"
            />
          </View>

          <View style={styles.buttonGroupRow}>
            <Button
              label="CHANGE FILE"
              icon="swap-horizontal"
              variant="secondary"
              size="sm"
              onPress={handlePickFile}
              style={{ flex: 1 }}
              accessibilityLabel="Change selected statement file"
            />
            <Button
              label="REMOVE"
              icon="trash-outline"
              variant="ghost"
              size="sm"
              onPress={handleRemoveFile}
              style={{ flex: 0.8 }}
              accessibilityLabel="Remove file"
            />
          </View>
        </View>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STATE 4: UPLOADING (Network In-Flight)                         */}
      {/* ------------------------------------------------------------- */}
      {uiState === "uploading" && selectedFile && (
        <View style={styles.stateContent} testID="statement-state-uploading">
          <View style={styles.selectedHeaderRow}>
            <View style={styles.selectedLeft}>
              <View style={styles.selectedIconBox}>
                <Ionicons
                  name={
                    selectedFile.fileType === "pdf"
                      ? "document-text"
                      : "image"
                  }
                  size={20}
                  color={colors.brand}
                />
              </View>
              <View style={styles.selectedMetaCol}>
                <Text style={styles.selectedFileName} numberOfLines={1}>
                  {selectedFile.name}
                </Text>
                <Text style={styles.fileSizeText}>
                  {formatFileSize(selectedFile.size)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.uploadingBox}>
            <ActivityIndicator size="small" color={colors.brand} />
            <View style={styles.uploadingTextCol}>
              <Text style={styles.uploadingTitle}>
                Uploading statement to secure server...
              </Text>
              <Text style={styles.uploadingSub}>
                Preserving document metadata & establishing behavioral baseline
              </Text>
            </View>
          </View>

          <View style={styles.buttonGroupRow}>
            <Button
              label="CANCEL UPLOAD"
              variant="ghost"
              size="sm"
              onPress={handleCancelUpload}
              style={{ flex: 1 }}
              accessibilityLabel="Cancel in-flight statement upload"
              testID="statement-btn-cancel-upload"
            />
          </View>
        </View>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STATE 5: UPLOADED (Processing Lifecycle & Status Refresh)     */}
      {/* ------------------------------------------------------------- */}
      {uiState === "uploaded" && (processingStatus || uploadReceipt) && (
        <View style={styles.stateContent} testID="statement-state-uploaded">
          {/* Status-aware Header */}
          <View style={styles.successHeaderRow}>
            <View
              style={[
                styles.statusIconBox,
                processingStatus?.status === "COMPLETED"
                  ? styles.statusSafeBox
                  : processingStatus?.status === "FAILED"
                  ? styles.statusThreatBox
                  : processingStatus?.status === "PROCESSING"
                  ? styles.statusProcessingBox
                  : styles.statusReceivedBox,
              ]}
            >
              <Ionicons
                name={
                  processingStatus?.status === "COMPLETED"
                    ? "checkmark-circle"
                    : processingStatus?.status === "FAILED"
                    ? "alert-circle"
                    : processingStatus?.status === "PROCESSING"
                    ? "hourglass-outline"
                    : "document-text"
                }
                size={22}
                color={
                  processingStatus?.status === "COMPLETED"
                    ? colors.safe
                    : processingStatus?.status === "FAILED"
                    ? colors.threat
                    : colors.brand
                }
              />
            </View>
            <View style={styles.titleCol}>
              <Text style={styles.titleText}>
                {processingStatus?.status === "COMPLETED"
                  ? "Statement Processing Completed"
                  : processingStatus?.status === "FAILED"
                  ? "Statement Processing Failed"
                  : processingStatus?.status === "PROCESSING"
                  ? "Processing Statement..."
                  : "Statement Received"}
              </Text>
              <Text style={styles.subText}>
                {processingStatus?.message ||
                  uploadReceipt?.message ||
                  "File received for baseline processing."}
              </Text>
            </View>
          </View>

          {/* Details Card */}
          <View style={styles.receiptCard}>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Tracking ID</Text>
              <Text style={styles.receiptValue} numberOfLines={1}>
                {processingStatus?.upload_id || uploadReceipt?.upload_id}
              </Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Processing Status</Text>
              <StatusBadge
                label={processingStatus?.status || uploadReceipt?.status || "RECEIVED"}
                status={
                  processingStatus?.status === "COMPLETED"
                    ? "low"
                    : processingStatus?.status === "FAILED"
                    ? "high"
                    : processingStatus?.status === "PROCESSING"
                    ? "medium"
                    : "low"
                }
                dot={true}
              />
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Document</Text>
              <Text style={styles.receiptValue} numberOfLines={1}>
                {processingStatus?.filename || uploadReceipt?.filename}
              </Text>
            </View>
            {uploadReceipt?.size_bytes ? (
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Size</Text>
                <Text style={styles.receiptValue}>
                  {formatFileSize(uploadReceipt.size_bytes)}
                </Text>
              </View>
            ) : null}
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Last Updated</Text>
              <Text style={styles.receiptValue}>
                {processingStatus?.updated_at ||
                  processingStatus?.created_at ||
                  uploadReceipt?.uploaded_at}
              </Text>
            </View>
          </View>

          {/* Completed banner */}
          {processingStatus?.status === "COMPLETED" && (
            <View style={styles.readyBanner}>
              <Ionicons name="shield-checkmark" size={16} color={colors.safe} />
              <Text style={styles.readyBannerText}>
                Behavioral baseline calibration complete. Shields updated.
              </Text>
            </View>
          )}

          {/* Failure banner with error detail */}
          {processingStatus?.status === "FAILED" && (
            <View style={styles.errorBox}>
              <View style={styles.errorIconWrap}>
                <Ionicons name="alert-circle" size={18} color={colors.threat} />
              </View>
              <View style={styles.errorTextCol}>
                <Text style={styles.errorTitle}>Processing Error</Text>
                <Text style={styles.errorDescription}>
                  {processingStatus.error_detail ||
                    "Statement document could not be processed."}
                </Text>
              </View>
            </View>
          )}

          {/* Status refresh error notification if present */}
          {statusErrorMessage && (
            <View style={styles.statusErrorNotification}>
              <Ionicons name="warning-outline" size={15} color={colors.caution} />
              <Text style={styles.statusErrorText}>{statusErrorMessage}</Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.buttonGroupRow}>
            <Button
              label={isRefreshingStatus ? "REFRESHING..." : "REFRESH STATUS"}
              icon="refresh"
              variant="secondary"
              size="sm"
              loading={isRefreshingStatus}
              onPress={handleRefreshStatus}
              style={{ flex: 1.2 }}
              accessibilityLabel="Refresh statement processing status"
              testID="statement-btn-refresh-status"
            />
            <Button
              label="NEW STATEMENT"
              icon="cloud-upload-outline"
              variant="ghost"
              size="sm"
              onPress={handleReset}
              style={{ flex: 1 }}
              accessibilityLabel="Upload another bank statement"
            />
          </View>
        </View>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STATE 6: CANCELLED                                            */}
      {/* ------------------------------------------------------------- */}
      {uiState === "cancelled" && (
        <View style={styles.stateContent} testID="statement-state-cancelled">
          <View style={styles.topRow}>
            <View style={styles.cancelledIconBox}>
              <Ionicons
                name="close-circle-outline"
                size={22}
                color={colors.textMuted}
              />
            </View>
            <View style={styles.titleCol}>
              <Text style={styles.titleText}>Selection Cancelled</Text>
              <Text style={styles.subText}>
                No statement file was chosen. You can select a document whenever
                you're ready.
              </Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Button
              label="CHOOSE STATEMENT FILE"
              icon="cloud-upload-outline"
              variant="secondary"
              size="md"
              onPress={handlePickFile}
              accessibilityLabel="Choose statement file"
            />
          </View>
        </View>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STATE 7: ERROR (Picker Failure or Upload Error with Retry)    */}
      {/* ------------------------------------------------------------- */}
      {uiState === "error" && (
        <View style={styles.stateContent} testID="statement-state-error">
          <View style={styles.errorBox}>
            <View style={styles.errorIconWrap}>
              <Ionicons name="alert-circle" size={20} color={colors.threat} />
            </View>
            <View style={styles.errorTextCol}>
              <Text style={styles.errorTitle}>
                {uploadError
                  ? uploadError.type === "AUTH_FAILURE"
                    ? "Authentication Required"
                    : uploadError.type === "NETWORK_FAILURE"
                    ? "Network Connection Error"
                    : uploadError.type === "SERVER_VALIDATION"
                    ? "Server Validation Error"
                    : uploadError.type === "SERVER_ERROR"
                    ? "Server Processing Error"
                    : uploadError.type === "CANCELLED"
                    ? "Upload Cancelled"
                    : "Upload Failed"
                  : errorCode === "OVERSIZED_FILE"
                  ? "File Size Exceeded"
                  : errorCode === "UNSUPPORTED_TYPE"
                  ? "Unsupported Format"
                  : errorCode === "EMPTY_FILE"
                  ? "Empty File Selected"
                  : "Unable to Select File"}
              </Text>
              <Text style={styles.errorDescription}>
                {errorMessage ||
                  "An error occurred while processing the statement document."}
              </Text>
            </View>
          </View>

          <View style={styles.buttonGroupRow}>
            {selectedFile && uploadError ? (
              <>
                <Button
                  label="RETRY UPLOAD"
                  icon="refresh"
                  variant="destructive"
                  size="sm"
                  onPress={() => handleUpload()}
                  style={{ flex: 1 }}
                  accessibilityLabel="Retry statement upload"
                  testID="statement-btn-retry"
                />
                <Button
                  label="CHANGE FILE"
                  variant="secondary"
                  size="sm"
                  onPress={handlePickFile}
                  style={{ flex: 1 }}
                  accessibilityLabel="Choose another statement file"
                />
                <Button
                  label="CANCEL"
                  variant="ghost"
                  size="sm"
                  onPress={handleReset}
                  style={{ flex: 0.7 }}
                  accessibilityLabel="Dismiss error and reset"
                />
              </>
            ) : (
              <>
                <Button
                  label="TRY AGAIN"
                  icon="refresh"
                  variant="destructive"
                  size="sm"
                  onPress={handlePickFile}
                  style={{ flex: 1 }}
                  accessibilityLabel="Try choosing statement file again"
                />
                <Button
                  label="CANCEL"
                  variant="ghost"
                  size="sm"
                  onPress={handleReset}
                  style={{ flex: 0.8 }}
                  accessibilityLabel="Dismiss error and return to idle"
                />
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1.2,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.sm,
  },
  stateContent: {
    gap: spacing.md,
  },
  stateContentCenter: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  selectingText: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 13,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: radii.lg,
    backgroundColor: colors.brandSurface,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusIconBox: {
    width: 42,
    height: 42,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusSafeBox: {
    backgroundColor: colors.safeSurface,
    borderColor: colors.safeBorder,
  },
  statusThreatBox: {
    backgroundColor: colors.threatSurface,
    borderColor: colors.threatBorder,
  },
  statusProcessingBox: {
    backgroundColor: "rgba(23, 107, 91, 0.15)",
    borderColor: colors.brandBorder,
  },
  statusReceivedBox: {
    backgroundColor: colors.brandSurface,
    borderColor: colors.brandBorder,
  },
  cancelledIconBox: {
    width: 42,
    height: 42,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  successHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  titleText: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  subText: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  actionRow: {
    marginTop: spacing.xs,
  },
  primaryActionRow: {
    marginTop: spacing.xs,
  },
  selectedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  selectedLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  selectedIconBox: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.brandSurface,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  selectedMetaCol: {
    flex: 1,
    gap: 3,
  },
  selectedFileName: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  metaBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  fileSizeText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  trashBtn: {
    padding: spacing.xs,
    borderRadius: radii.sm,
  },
  readyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    backgroundColor: colors.safeSurface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.safeBorder,
  },
  readyBannerText: {
    ...typography.smallSemibold,
    color: colors.safeText,
    fontSize: 12,
    flex: 1,
  },
  uploadingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.brandSurface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.brandBorder,
  },
  uploadingTextCol: {
    flex: 1,
    gap: 2,
  },
  uploadingTitle: {
    ...typography.bodySemibold,
    color: colors.brand,
    fontSize: 13,
    fontWeight: "700",
  },
  uploadingSub: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  receiptCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.xs + 2,
  },
  receiptRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  receiptLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  receiptValue: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 12,
    flexShrink: 1,
  },
  statusErrorNotification: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "rgba(224, 138, 0, 0.1)",
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(224, 138, 0, 0.3)",
  },
  statusErrorText: {
    ...typography.caption,
    color: colors.cautionText,
    fontSize: 11,
    flex: 1,
  },
  buttonGroupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.threatSurface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.threatBorder,
  },
  errorIconWrap: {
    marginTop: 1,
  },
  errorTextCol: {
    flex: 1,
    gap: 2,
  },
  errorTitle: {
    ...typography.bodySemibold,
    color: colors.threatText,
    fontSize: 13.5,
    fontWeight: "700",
  },
  errorDescription: {
    ...typography.small,
    color: colors.threatText,
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.9,
  },
});
