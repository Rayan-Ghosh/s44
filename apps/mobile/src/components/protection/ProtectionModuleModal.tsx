import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Switch,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";

export interface ProtectionFeatureItem {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
}

interface ProtectionModuleModalProps {
  visible: boolean;
  onClose: () => void;
  moduleKey: "payment" | "risk" | "call";
  title: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  features: ProtectionFeatureItem[];
}

export const ProtectionModuleModal: React.FC<ProtectionModuleModalProps> = ({
  visible,
  onClose,
  title,
  desc,
  icon,
  isEnabled,
  onToggle,
  features,
}) => {
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
                    <Ionicons name={icon} size={20} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>{title}</Text>
                    <Text style={styles.modalSub}>{desc}</Text>
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

              {/* Status & Toggle Bar */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextCol}>
                  <Text style={styles.toggleLabel}>Module Status</Text>
                  <Text
                    style={[
                      styles.toggleStatus,
                      { color: isEnabled ? colors.safe : colors.textMuted },
                    ]}
                  >
                    {isEnabled ? "ACTIVE & MONITORING" : "DISABLED"}
                  </Text>
                </View>
                <Switch
                  value={isEnabled}
                  onValueChange={onToggle}
                  trackColor={{ false: colors.borderLight, true: colors.safe }}
                  thumbColor={colors.surface}
                />
              </View>

              <Text style={styles.sectionLabel}>CAPABILITIES & FEATURES</Text>

              {/* Feature Checklist */}
              <ScrollView style={styles.featureList} showsVerticalScrollIndicator={false}>
                {features.map((item, index) => (
                  <View key={index} style={styles.featureItem}>
                    <View style={styles.checkIconBox}>
                      <Ionicons
                        name={isEnabled ? "checkmark-circle" : "ellipse-outline"}
                        size={18}
                        color={isEnabled ? colors.safe : colors.textMuted}
                      />
                    </View>
                    <View style={styles.featureTextCol}>
                      <Text style={styles.featureTitle}>{item.title}</Text>
                      <Text style={styles.featureDesc}>{item.desc}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>

              {/* Footer button */}
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={onClose}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.doneBtnText}>Done</Text>
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
    maxHeight: "85%",
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
    fontSize: 17,
    fontWeight: "700",
  },
  modalSub: {
    ...typography.small,
    color: colors.textSecondary,
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
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    marginVertical: spacing.md,
  },
  toggleTextCol: {
    gap: 2,
  },
  toggleLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  toggleStatus: {
    ...typography.bodySemibold,
    fontSize: 13,
    fontWeight: "800",
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  featureList: {
    maxHeight: 220,
    marginBottom: spacing.md,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  checkIconBox: {
    marginTop: 2,
  },
  featureTextCol: {
    flex: 1,
  },
  featureTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  featureDesc: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  doneBtn: {
    backgroundColor: colors.btnPrimaryBg,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
    ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
  },
  doneBtnText: {
    ...typography.bodySemibold,
    color: colors.btnPrimaryText,
    fontWeight: "700",
    fontSize: 14,
  },
});
