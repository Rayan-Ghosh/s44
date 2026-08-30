import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { PaymentLinkService } from "../../services/payment-link-service";
import { UserTransaction } from "../../services/payment-service";
import { useAuth } from "../../context/AuthContext";

interface SimulatePaymentLinkModalProps {
  visible: boolean;
  onClose: () => void;
  onPaymentIntercepted: (tx: UserTransaction) => void;
  onShowToast: (message: string, type?: "info" | "success" | "warning") => void;
}

const PRESET_DEMO_LINKS = [
  {
    title: "🚨 High-Risk Suspicious Link",
    subtitle: "₹14,200 · Unknown handle + Urgent KYC note",
    badge: "HIGH RISK",
    badgeColor: colors.threat,
    url: "upi://pay?pa=unknown_merchant@fakeupi&pn=Unknown%20Merchant&am=14200&cu=INR&tn=Urgent%20KYC%20Verification%20Fee",
  },
  {
    title: "💳 Medium-Risk Large Transfer",
    subtitle: "₹4,500 · New contact transfer",
    badge: "MEDIUM RISK",
    badgeColor: colors.caution,
    url: "upi://pay?pa=vikram.sharma99@okaxis&pn=Vikram%20Sharma&am=4500&cu=INR&tn=Consulting%20Invoice",
  },
  {
    title: "✅ Safe Verified Merchant",
    subtitle: "₹650 · Swiggy India food order",
    badge: "SAFE",
    badgeColor: colors.safe,
    url: "upi://pay?pa=swiggy@icici&pn=Swiggy%20India&am=650&cu=INR&tn=Order%20Payment",
  },
];

export const SimulatePaymentLinkModal: React.FC<SimulatePaymentLinkModalProps> = ({
  visible,
  onClose,
  onPaymentIntercepted,
  onShowToast,
}) => {
  const [customUrl, setCustomUrl] = useState<string>("");
  const { session } = useAuth();

  const handleTrigger = async (url: string) => {
    if (!url.trim()) {
      onShowToast("Please enter a valid payment link or UPI URI", "info");
      return;
    }
    if (!session?.userId) {
      onShowToast("Please log in before simulating a payment link.", "info");
      return;
    }

    onShowToast("Analyzing payment security in real time...", "info");
    const parsed = PaymentLinkService.parsePaymentUrl(url);
    const newTx = await PaymentLinkService.createAndEvaluate(parsed, session.userId);
    if (!newTx) {
      onShowToast("Unable to reach the Avaran server to evaluate this link.", "warning");
      return;
    }

    onPaymentIntercepted(newTx);
    onShowToast(
      newTx.riskLevel === "HIGH"
        ? "🚨 High-risk payment link intercepted!"
        : "✓ Payment link analyzed successfully",
      newTx.riskLevel === "HIGH" ? "warning" : "success"
    );
    onClose();
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
                    <Ionicons name="link-outline" size={20} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>Live Demo: Payment Link Interception</Text>
                    <Text style={styles.modalSub}>Simulate incoming UPI / payment intent</Text>
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

              {/* Preset triggers */}
              <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.sectionHeading}>SELECT DEMO PRESET</Text>

                {PRESET_DEMO_LINKS.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.presetCard}
                    onPress={() => handleTrigger(item.url)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.presetTop}>
                      <Text style={styles.presetTitle}>{item.title}</Text>
                      <View style={[styles.badge, { backgroundColor: `${item.badgeColor}20`, borderColor: item.badgeColor }]}>
                        <Text style={[styles.badgeText, { color: item.badgeColor }]}>{item.badge}</Text>
                      </View>
                    </View>
                    <Text style={styles.presetSub}>{item.subtitle}</Text>
                    <Text style={styles.presetUrl} numberOfLines={1}>
                      {item.url}
                    </Text>
                  </TouchableOpacity>
                ))}

                {/* Custom URL Input */}
                <Text style={styles.sectionHeading}>OR PASTE CUSTOM UPI / PAYMENT URL</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    placeholder="upi://pay?pa=name@upi&pn=Merchant&am=100"
                    placeholderTextColor={colors.textMuted}
                    value={customUrl}
                    onChangeText={setCustomUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.triggerBtn}
                    onPress={() => handleTrigger(customUrl)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="arrow-forward" size={16} color={colors.btnPrimaryText} />
                  </TouchableOpacity>
                </View>
              </ScrollView>
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
    maxWidth: 520,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...shadows.lg,
    maxHeight: "85%",
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
  bodyScroll: {
    marginTop: spacing.md,
  },
  sectionHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    letterSpacing: 0.6,
    fontSize: 10,
    marginBottom: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  presetCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  presetTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  presetTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  badgeText: {
    ...typography.caption,
    fontSize: 9,
    fontWeight: "800",
  },
  presetSub: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
  },
  presetUrl: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 4,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingLeft: spacing.md,
    paddingRight: 4,
    marginVertical: spacing.xs,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    color: colors.textPrimary,
    ...typography.small,
    fontSize: 12,
  },
  triggerBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.btnPrimaryBg,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
});
