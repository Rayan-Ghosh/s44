import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { Button } from "../common/Button";

interface HelpSupportModalProps {
  visible: boolean;
  onClose: () => void;
  onShowToast: (message: string, type?: "info" | "success" | "warning") => void;
  onTriggerTestAlert?: () => void;
}

export const HelpSupportModal: React.FC<HelpSupportModalProps> = ({
  visible,
  onClose,
  onShowToast,
  onTriggerTestAlert,
}) => {
  const { width, height } = useWindowDimensions();
  const isLargeScreen = width >= 640;

  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  if (!visible) return null;

  const handleCallSupport = () => {
    onShowToast("Connecting to Avaran 24/7 Security Helpline: 1800-AVARAN-CARE", "info");
    if (Platform.OS !== "web") {
      Linking.openURL("tel:1800282726").catch(() => {});
    }
  };

  const handleEmailSupport = () => {
    onShowToast("Opening email to support@avaran.security", "info");
    if (Platform.OS !== "web") {
      Linking.openURL("mailto:support@avaran.security").catch(() => {});
    }
  };

  const handleReportProblem = () => {
    onShowToast("Security report form submitted to fraud analysis center", "success");
  };

  const handleTestAlert = () => {
    if (onTriggerTestAlert) {
      onTriggerTestAlert();
    }
    onShowToast("Test security alert dispatched to notification center", "success");
  };

  const faqs = [
    {
      q: "How does Avaran hold payments before UPI PIN?",
      a: "Avaran evaluates your payment context synchronously at the intent phase. If 4-signal fusion detects high threat signals (e.g. pressure markers, active call coercion, new unverified payee), an automated hold countdown is activated while the money is safely in your account.",
    },
    {
      q: "How do Trusted Contact (Guardian) approvals work?",
      a: "When high-risk payments exceed your preset threshold or severe anomaly scores occur, a dual-approval token is dispatched to your Guardian. The payment cannot proceed until they review the risk breakdown and approve.",
    },
    {
      q: "How does Acoustic Call Protection detect scams?",
      a: "Avaran runs on-device acoustic feature extraction to identify patterns characteristic of social engineering, police/tax authority impersonation, and remote desktop installation pressure. Zero raw audio is ever recorded or transmitted.",
    },
    {
      q: "Is my bank UPI PIN stored by Avaran?",
      a: "Never. Avaran operates strictly as an independent fraud intelligence layer and never sees, intercepts, or stores your UPI PIN, banking passwords, or card CVVs.",
    },
  ];

  const modalContent = (
    <View
      style={[
        styles.modalContainer,
        isLargeScreen && styles.modalContainerDesktop,
        isLargeScreen && { maxHeight: Math.min(height * 0.88, 760) },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <Ionicons name="help-buoy-outline" size={18} color={colors.brand} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Help & Support</Text>
            <Text style={styles.headerSub}>Avaran 24/7 Security Intelligence Support</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close help dialog"
        >
          <Ionicons name="close" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Body Scroll */}
      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Emergency Contacts Card */}
        <View style={styles.emergencyCard}>
          <Text style={styles.sectionLabel}>DIRECT SECURITY CONTACTS</Text>

          <TouchableOpacity style={styles.contactRow} onPress={handleCallSupport} activeOpacity={0.7}>
            <View style={styles.contactIconCircle}>
              <Ionicons name="call" size={16} color={colors.brand} />
            </View>
            <View style={styles.contactTextCol}>
              <Text style={styles.contactTitle}>24/7 Fraud Emergency Helpline</Text>
              <Text style={styles.contactSub}>1800-AVARAN-CARE (Toll-Free)</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactRowNoBorder} onPress={handleEmailSupport} activeOpacity={0.7}>
            <View style={styles.contactIconCircle}>
              <Ionicons name="mail" size={16} color={colors.brand} />
            </View>
            <View style={styles.contactTextCol}>
              <Text style={styles.contactTitle}>Security Operations Center</Text>
              <Text style={styles.contactSub}>support@avaran.security</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Quick Diagnostic Actions */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>DIAGNOSTICS & ACTIONS</Text>

          <TouchableOpacity style={styles.actionRow} onPress={handleReportProblem} activeOpacity={0.7}>
            <View style={styles.actionLeft}>
              <Ionicons name="flag-outline" size={18} color={colors.textPrimary} />
              <Text style={styles.actionLabel}>Report a Problem or Suspicious Merchant</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionRowNoBorder} onPress={handleTestAlert} activeOpacity={0.7}>
            <View style={styles.actionLeft}>
              <Ionicons name="notifications-outline" size={18} color={colors.brand} />
              <Text style={styles.actionLabel}>Dispatch Test Security Alert</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* FAQs */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>FREQUENTLY ASKED QUESTIONS</Text>

          {faqs.map((faq, idx) => {
            const isExpanded = expandedFaq === idx;
            return (
              <View
                key={faq.q}
                style={[
                  styles.faqItem,
                  idx === faqs.length - 1 && styles.faqItemNoBorder,
                ]}
              >
                <TouchableOpacity
                  style={styles.faqHeader}
                  onPress={() => setExpandedFaq(isExpanded ? null : idx)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.faqQuestion}>{faq.q}</Text>
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <Text style={styles.faqAnswer}>{faq.a}</Text>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Button
          label="Close"
          onPress={onClose}
          variant="primary"
          size="md"
          style={{ width: "100%" }}
        />
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType={isLargeScreen ? "fade" : "slide"}
      transparent={true}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.modalOverlay,
          isLargeScreen && styles.modalOverlayCentered,
        ]}
      >
        {isLargeScreen ? (
          <>
            <TouchableOpacity
              style={styles.backdropCover}
              onPress={onClose}
              activeOpacity={1}
            />
            {modalContent}
          </>
        ) : (
          <SafeAreaView style={styles.safeAreaFull} edges={["top", "bottom", "left", "right"]}>
            {modalContent}
          </SafeAreaView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.background,
    ...(Platform.OS === "web"
      ? ({
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 99999,
        } as any)
      : {}),
  },
  modalOverlayCentered: {
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  backdropCover: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    zIndex: 1,
  },
  safeAreaFull: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  modalContainerDesktop: {
    width: "92%",
    maxWidth: 620,
    height: "88%",
    backgroundColor: colors.background,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.lg,
    overflow: "hidden",
    zIndex: 10,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
        } as any)
      : {}),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 18,
  },
  headerSub: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  scrollBody: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  emergencyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  contactRowNoBorder: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  contactIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  contactTextCol: {
    flex: 1,
  },
  contactTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
  },
  contactSub: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  actionRowNoBorder: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  actionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  actionLabel: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 13,
  },
  faqItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  faqItemNoBorder: {
    paddingVertical: spacing.md,
    borderBottomWidth: 0,
  },
  faqHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  faqQuestion: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 13,
    flex: 1,
  },
  faqAnswer: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
});
