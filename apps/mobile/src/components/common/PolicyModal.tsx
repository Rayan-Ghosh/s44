import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { AvaranLogo } from "./AvaranLogo";
import { Button } from "./Button";

export type PolicyType = "terms" | "privacy";

interface PolicyModalProps {
  visible: boolean;
  type: PolicyType;
  onClose: () => void;
}

export const PolicyModal: React.FC<PolicyModalProps> = ({
  visible,
  type,
  onClose,
}) => {
  const { width, height } = useWindowDimensions();
  const isLargeScreen = width >= 640;

  const isTerms = type === "terms";
  const title = isTerms ? "Terms of Service" : "Privacy Policy";
  const subtitle = isTerms
    ? "AVARAN UPI FRAUD SHIELD USER AGREEMENT"
    : "AVARAN DATA PROTECTION & PRIVACY CHARTER";

  if (!visible) {
    return null;
  }

  const modalHeight = isLargeScreen
    ? Math.min(Math.max(height * 0.85, 480), 760)
    : undefined;

  const modalBody = (
    <View
      style={[
        styles.modalContainer,
        isLargeScreen && styles.modalContainerDesktop,
        isLargeScreen && { height: modalHeight },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleCol}>
          <View style={styles.brandHeaderRow}>
            <AvaranLogo size="sm" showText={false} />
            <Text style={styles.headerSubtitle}>{subtitle}</Text>
          </View>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>

        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close policy dialog"
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Badge & Version */}
      <View style={styles.versionBar}>
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark" size={12} color={colors.brand} />
          <Text style={styles.badgeText}>OFFICIAL COMPLIANCE DOCUMENT</Text>
        </View>
        <Text style={styles.versionText}>Version 2.4 • August 2026</Text>
      </View>

      {/* Scrollable Policy Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
      >
        {isTerms ? <TermsOfServiceContent /> : <PrivacyPolicyContent />}
      </ScrollView>

      {/* Footer Bar */}
      <View style={styles.footerBar}>
        <Text style={styles.footerSecurityNote}>
          <Ionicons name="lock-closed" size={12} color={colors.brand} /> End-to-End Cryptographic Protection
        </Text>
        <Button
          label="I Understand & Close"
          onPress={onClose}
          variant="primary"
          size="md"
          style={styles.footerBtn}
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
      statusBarTranslucent={true}
    >
      <View
        style={[
          styles.modalOverlay,
          isLargeScreen && styles.modalOverlayCentered,
        ]}
      >
        {isLargeScreen ? (
          <>
            {/* Backdrop touchable to close on click outside */}
            <TouchableOpacity
              style={styles.backdropCover}
              onPress={onClose}
              activeOpacity={1}
              accessibilityRole="button"
              accessibilityLabel="Close modal backdrop"
            />
            {modalBody}
          </>
        ) : (
          <SafeAreaView
            style={styles.safeAreaFull}
            edges={["top", "bottom", "left", "right"]}
          >
            {modalBody}
          </SafeAreaView>
        )}
      </View>
    </Modal>
  );
};

const TermsOfServiceContent: React.FC = () => (
  <View style={styles.contentContainer}>
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>1. Acceptance of Terms</Text>
      <Text style={styles.sectionBody}>
        By creating an account, downloading, or accessing the Avaran application, you agree to be bound by these Terms of Service, all applicable laws, and financial security regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this service.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>2. Account Responsibilities</Text>
      <Text style={styles.sectionBody}>
        You are responsible for maintaining the confidentiality of your account credentials, passcodes, and biometric authentication mechanisms. You agree to immediately notify Avaran of any unauthorized access, suspicious activity, or compromise of your linked devices.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>3. Payment Protection Services</Text>
      <Text style={styles.sectionBody}>
        Avaran delivers pre-execution payment risk analysis, heuristic evaluation, and automated intervention safeguards for UPI and connected digital wallets. Protection systems operate in real time to intercept high-risk transfers before funds leave your banking institution.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>4. Fraud Detection</Text>
      <Text style={styles.sectionBody}>
        Our proprietary 4-signal fusion engine analyzes transaction patterns, device integrity indicators, behavioral pressure markers, and live call coercion signals to detect fraud, social engineering scams, impersonation schemes, and unauthorized remote access attempts.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>5. Trusted Contact Feature</Text>
      <Text style={styles.sectionBody}>
        When you configure a Guardian (Trusted Contact), you authorize Avaran to route critical security alerts and high-risk transaction verification requests to your designated guardian. Guardian approvals operate with a cryptographic timeout to prevent coerced transfers.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>6. User Responsibilities</Text>
      <Text style={styles.sectionBody}>
        You agree to provide accurate and verifiable identity details, maintain updated contact information, grant necessary local operating permissions for fraud telemetry, and refrain from utilizing Avaran for any unlawful or deceptive financial activities.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>7. Data Usage</Text>
      <Text style={styles.sectionBody}>
        Telemetry gathered during active payment evaluation is processed strictly for the purposes of calculating risk scores, mitigating active attacks, improving fraud classification models, and dispatching authorized security alerts in full accordance with our Privacy Policy.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>8. Privacy and Security</Text>
      <Text style={styles.sectionBody}>
        All biometric authentications, cryptographic tokens, and sensitive identifiers are isolated within hardware-backed security enclaves (Android Keystore / iOS Secure Enclave) and transmitted using TLS 1.3 encryption. Avaran never stores or transmits raw banking PINs.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>9. Limitations of Service</Text>
      <Text style={styles.sectionBody}>
        Avaran provides preventative security guidance, intervention workflows, and intelligence tools. While designed to drastically reduce fraud risk, Avaran is not a banking provider or insurance underwriter and does not guarantee immunity from transactions explicitly overridden or authorized by the account holder.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>10. Changes to Terms</Text>
      <Text style={styles.sectionBody}>
        Avaran reserves the right to revise these Terms of Service at any time to reflect security enhancements, product features, or regulatory standards. Continued use of the platform following updates constitutes full acceptance of the revised Terms.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>11. Contact Information</Text>
      <Text style={styles.sectionBody}>
        For inquiries regarding these Terms of Service, legal compliance, or institutional partnership governance, please contact our team at support@avaran.security or legal@avaran.security.
      </Text>
    </View>
  </View>
);

const PrivacyPolicyContent: React.FC = () => (
  <View style={styles.contentContainer}>
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>1. Information We Collect</Text>
      <Text style={styles.sectionBody}>
        We collect only the minimum telemetry and identity parameters essential to execute real-time fraud mitigation, verify account access, and facilitate secure Guardian emergency interventions.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>2. Account Information</Text>
      <Text style={styles.sectionBody}>
        During registration and onboarding, we collect your Full Name, registered Mobile Phone Number, and verified Email Address to establish cryptographic identity sessions and deliver high-priority security notifications.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>3. Payment Information</Text>
      <Text style={styles.sectionBody}>
        When evaluating transactions, we analyze payee handle/VPA metadata, amount values, merchant categories, and velocity patterns strictly at the time of payment review. We never record, process, or transmit UPI PINs or debit card credentials.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>4. Device and Usage Information</Text>
      <Text style={styles.sectionBody}>
        We examine device security indicators including operating system integrity, active phone call state (to recognize scammer pressure or coercion during payments), screen-sharing detection, and network security parameters.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>5. How Information Is Used</Text>
      <Text style={styles.sectionBody}>
        Collected parameters are evaluated locally and via encrypted API pipelines to calculate instantaneous fraud risk scores, trigger safety countdown timers, and provide explainable risk signal breakdowns.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>6. Fraud Prevention</Text>
      <Text style={styles.sectionBody}>
        Risk signals are fused to detect impersonation attacks, remote access scams, suspicious QR code manipulations, and fraudulent requests before money leaves your account.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>7. Trusted Contact Data</Text>
      <Text style={styles.sectionBody}>
        If you register a Guardian, their name, relationship, and verified phone number are securely stored to transmit emergency SMS/push verification requests during intercepted high-risk payment attempts.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>8. Data Security</Text>
      <Text style={styles.sectionBody}>
        We enforce military-grade AES-256 encryption at rest and TLS 1.3 encryption in transit. Authentication tokens are cryptographically signed, and biometric operations remain exclusively on your local hardware enclave.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>9. Data Sharing</Text>
      <Text style={styles.sectionBody}>
        Avaran does not sell, lease, or monetize user data. Information is shared strictly with authorized payment switch infrastructure or law enforcement authorities only when compelled by valid legal mandate.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>10. User Rights</Text>
      <Text style={styles.sectionBody}>
        You maintain full rights to review your stored account data, view transaction risk histories, modify Guardian permissions, and request complete account and data deletion at any time from the Profile settings.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>11. Data Retention</Text>
      <Text style={styles.sectionBody}>
        Fraud audit telemetry is retained for compliance and security audit logs in adherence with statutory financial retention cycles and is systematically purged thereafter.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>12. Changes to This Policy</Text>
      <Text style={styles.sectionBody}>
        We may periodically revise this Privacy Policy to align with evolving regulatory frameworks or security technologies. Material changes will be highlighted through in-app notifications.
      </Text>
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionHeading}>13. Contact Information</Text>
      <Text style={styles.sectionBody}>
        For privacy inquiries, data subject access requests, or to contact our Data Protection Officer, please reach out to privacy@avaran.security or dpo@avaran.security.
      </Text>
    </View>
  </View>
);

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
    padding: spacing.md,
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
    ...(Platform.OS === "web" ? ({ cursor: "default" } as any) : {}),
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
    maxWidth: 680,
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  headerTitleCol: {
    flex: 1,
    marginRight: spacing.md,
  },
  brandHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  versionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  badgeText: {
    ...typography.caption,
    color: colors.brand,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  versionText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.background,
    ...(Platform.OS === "web"
      ? ({
          overflowY: "auto",
        } as any)
      : {}),
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  contentContainer: {
    gap: spacing.lg,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.sm,
  },
  sectionHeading: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: spacing.xs,
  },
  sectionBody: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  footerBar: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: spacing.sm,
  },
  footerSecurityNote: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 11,
  },
  footerBtn: {
    width: "100%",
  },
});
