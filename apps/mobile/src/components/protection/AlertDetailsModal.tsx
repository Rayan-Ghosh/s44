import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { StatusBadge } from "../common/StatusBadge";
import { SecurityAlert } from "../../services/alert-service";

interface AlertDetailsModalProps {
  alert: SecurityAlert | null;
  visible: boolean;
  onClose: () => void;
  onResolve: (alertId: string) => void;
  onViewPayment?: (transactionId: string | number) => void;
}

export const AlertDetailsModal: React.FC<AlertDetailsModalProps> = ({
  alert,
  visible,
  onClose,
  onResolve,
  onViewPayment,
}) => {
  if (!alert) return null;

  const isHigh = alert.severity === "HIGH";
  const isResolved = alert.status === "RESOLVED";

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
                  <View
                    style={[
                      styles.iconBox,
                      isHigh && { backgroundColor: "rgba(239, 68, 68, 0.15)" },
                    ]}
                  >
                    <Ionicons
                      name={isHigh ? "alert-circle" : "shield-checkmark"}
                      size={20}
                      color={isHigh ? colors.threat : colors.brand}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>{alert.title}</Text>
                    <Text style={styles.modalSub}>{alert.timestamp}</Text>
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

              {/* Status & Severity Badges */}
              <View style={styles.badgeRow}>
                <StatusBadge
                  label={alert.severity}
                  status={isHigh ? "high" : "low"}
                />
                <StatusBadge
                  label={alert.status}
                  status={isResolved ? "low" : "high"}
                />
              </View>

              {/* Description Body */}
              <View style={styles.bodyBox}>
                <Text style={styles.descHeading}>SECURITY EVENT SUMMARY</Text>
                <Text style={styles.descText}>{alert.description}</Text>
              </View>

              {/* Related Transaction Link if applicable */}
              {alert.transactionId && onViewPayment && (
                <TouchableOpacity
                  style={styles.viewPaymentBtn}
                  onPress={() => {
                    onClose();
                    onViewPayment(alert.transactionId!);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="card-outline" size={16} color={colors.brand} />
                  <Text style={styles.viewPaymentText}>View Associated Payment Details →</Text>
                </TouchableOpacity>
              )}

              {/* Action buttons */}
              <View style={styles.actionRow}>
                {!isResolved && (
                  <TouchableOpacity
                    style={styles.resolveBtn}
                    onPress={() => {
                      onResolve(alert.id);
                      onClose();
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-circle-outline" size={16} color={colors.safeText} style={{ marginRight: 6 }} />
                    <Text style={styles.resolveBtnText}>Mark as Resolved</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.dismissBtn, isResolved && { flex: 1 }]}
                  onPress={onClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dismissBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
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
  badgeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  bodyBox: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.md,
  },
  descHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  descText: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 20,
  },
  viewPaymentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: radii.md,
    marginBottom: spacing.md,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  viewPaymentText: {
    ...typography.smallSemibold,
    color: colors.brand,
    fontSize: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  resolveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.safeSurface,
    borderWidth: 1,
    borderColor: colors.safeBorder,
    borderRadius: radii.md,
    paddingVertical: 11,
    ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
  },
  resolveBtnText: {
    ...typography.bodySemibold,
    color: colors.safeText,
    fontWeight: "700",
    fontSize: 13,
  },
  dismissBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
  },
  dismissBtnText: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 13,
  },
});
