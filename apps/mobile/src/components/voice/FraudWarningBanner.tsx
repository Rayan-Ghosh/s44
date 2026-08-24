import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { Button } from "../common/Button";
import { DetectedPattern, FraudAlert } from "../../types/voice";
import { Badge } from "../common/Badge";

interface FraudWarningBannerProps {
  alert: FraudAlert;
  detectedPatterns: DetectedPattern[];
  onDismiss: () => void;
  onEndCall: () => void;
  onReportScam: () => void;
}

const PATTERN_LABELS: Record<DetectedPattern, string> = {
  AUTHORITY_IMPERSONATION: "Authority Impersonation",
  REMOTE_ACCESS_COERCION: "Remote Access Request",
  OTP_SOLICITATION: "OTP Solicitation",
  URGENT_LANGUAGE: "Urgent Language",
  FINANCIAL_CREDENTIAL_EXTRACTION: "Credential Extraction",
  SUSPICIOUS_CALL_PATTERN: "Suspicious Call Pattern",
};

export const FraudWarningBanner: React.FC<FraudWarningBannerProps> = ({
  alert,
  detectedPatterns,
  onDismiss,
  onEndCall,
  onReportScam,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="warning" size={24} color={colors.threat} />
        <Text style={styles.headerTitle}>FRAUD ALERT</Text>
      </View>

      <Text style={styles.explanation}>
        This call matches a known bank-impersonation pattern.
      </Text>

      <View style={styles.recommendationBox}>
        <Text style={styles.recommendationLabel}>RECOMMENDED:</Text>
        <Text style={styles.recommendationText}>
          Do not share OTP, PIN or CVV. End the call and verify through your bank's official number.
        </Text>
      </View>

      {detectedPatterns.length > 0 && (
        <View style={styles.patternsSection}>
          <Text style={styles.patternsHeader}>DETECTED SIGNALS</Text>
          <View style={styles.patternsWrap}>
            {detectedPatterns.map((p) => (
              <View key={p} style={styles.badgeWrapper}>
                <Badge label={PATTERN_LABELS[p] || p} variant="threat" size="sm" />
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <Button
          label="End call"
          onPress={onEndCall}
          variant="destructive"
          size="md"
          icon="call-outline"
          style={styles.actionButton}
        />
        <Button
          label="Report scam"
          onPress={onReportScam}
          variant="secondary"
          size="md"
          icon="shield-outline"
          style={styles.actionButton}
        />
        <Button
          label="Dismiss warning"
          onPress={onDismiss}
          variant="ghost"
          size="sm"
          style={styles.dismissButton}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.threat,
    padding: spacing.lg,
    marginVertical: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginLeft: spacing.xs,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  explanation: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    marginVertical: spacing.xs,
    lineHeight: 22,
  },
  recommendationBox: {
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginVertical: spacing.xs,
  },
  recommendationLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "800",
    marginBottom: 2,
    fontSize: 10,
  },
  recommendationText: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  patternsSection: {
    marginVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
  },
  patternsHeader: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    letterSpacing: 0.8,
  },
  patternsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  badgeWrapper: {
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  actions: {
    marginTop: spacing.sm,
  },
  actionButton: {
    marginVertical: spacing.xs,
  },
  dismissButton: {
    marginTop: spacing.xs,
  },
});
