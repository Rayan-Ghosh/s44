import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { getApiBaseUrl, setApiBaseUrl, resetApiBaseUrl, ApiClient } from "../../services/api-client";

interface ServerEndpointModalProps {
  visible: boolean;
  onClose: () => void;
  onEndpointSaved: (newUrl: string) => void;
}

export const ServerEndpointModal: React.FC<ServerEndpointModalProps> = ({
  visible,
  onClose,
  onEndpointSaved,
}) => {
  const [url, setUrl] = useState<string>("");
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (visible) {
      setUrl(getApiBaseUrl());
      setTestResult(null);
    }
  }, [visible]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      setApiBaseUrl(url);
      const res = await ApiClient.get("/health");
      if (res.status === 200 || res.data) {
        setTestResult({ success: true, message: "Connection successful. Server is responsive." });
      } else {
        setTestResult({ success: false, message: res.error || "Server returned non-200 status." });
      }
    } catch {
      setTestResult({ success: false, message: "Unable to reach endpoint. Check IP / Wi-Fi." });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    setApiBaseUrl(url);
    const active = getApiBaseUrl();
    onEndpointSaved(active);
    onClose();
  };

  const handleReset = () => {
    resetApiBaseUrl();
    const active = getApiBaseUrl();
    setUrl(active);
    setTestResult({ success: true, message: "Reset to default endpoint." });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.modalCard}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={styles.headerLeft}>
                  <View style={styles.iconBox}>
                    <Ionicons name="server-outline" size={20} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>API Server Endpoint</Text>
                    <Text style={styles.modalSub}>Configure backend server URL</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Endpoint Input */}
              <View style={styles.body}>
                <Text style={styles.inputLabel}>SERVER BASE URL</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="link-outline" size={16} color={colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={url}
                    onChangeText={(val) => {
                      setUrl(val);
                      setTestResult(null);
                    }}
                    placeholder="http://localhost:8000"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>

                {/* Preset suggestions */}
                <Text style={styles.presetHeading}>QUICK PRESETS</Text>
                <View style={styles.presetRow}>
                  <TouchableOpacity
                    style={styles.presetChip}
                    onPress={() => setUrl("http://localhost:8000")}
                  >
                    <Text style={styles.presetChipText}>Localhost:8000</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.presetChip}
                    onPress={() => setUrl("http://10.0.2.2:8000")}
                  >
                    <Text style={styles.presetChipText}>Android (10.0.2.2)</Text>
                  </TouchableOpacity>
                </View>

                {/* Connection Test Result */}
                {testResult && (
                  <View
                    style={[
                      styles.testResultBox,
                      testResult.success ? styles.testResultSuccess : styles.testResultError,
                    ]}
                  >
                    <Ionicons
                      name={testResult.success ? "checkmark-circle" : "alert-circle"}
                      size={16}
                      color={testResult.success ? colors.safe : colors.threat}
                    />
                    <Text
                      style={[
                        styles.testResultText,
                        { color: testResult.success ? colors.safeText : colors.threatText },
                      ]}
                    >
                      {testResult.message}
                    </Text>
                  </View>
                )}
              </View>

              {/* Actions */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.testBtn}
                  onPress={handleTestConnection}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <Text style={styles.testBtnText}>Test Connection</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Text style={styles.saveBtnText}>Save Endpoint</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
                <Text style={styles.resetBtnText}>Reset to Default</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
    ...(Platform.OS === "web"
      ? ({
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
        } as any)
      : {}),
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  modalSub: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  body: {
    marginVertical: spacing.md,
  },
  inputLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    color: colors.textPrimary,
    ...typography.body,
    fontSize: 13,
  },
  presetHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  presetRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  presetChip: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  presetChipText: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 11,
  },
  testResultBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.md,
    borderWidth: 1,
  },
  testResultSuccess: {
    backgroundColor: colors.safeSurface,
    borderColor: colors.safeBorder,
  },
  testResultError: {
    backgroundColor: colors.threatSurface,
    borderColor: colors.threatBorder,
  },
  testResultText: {
    ...typography.small,
    fontSize: 12,
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  testBtn: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
  },
  testBtnText: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.btnPrimaryBg,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
  },
  saveBtnText: {
    ...typography.bodySemibold,
    color: colors.btnPrimaryText,
    fontSize: 13,
    fontWeight: "700",
  },
  resetBtn: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  resetBtnText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
  },
});
