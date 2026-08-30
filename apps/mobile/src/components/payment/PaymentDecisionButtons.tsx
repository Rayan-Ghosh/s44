import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { FinalOutcome } from "../../types/transaction";

interface PaymentDecisionButtonsProps {
  onDecision: (outcome: FinalOutcome) => void;
  disabled?: boolean;
}

export const PaymentDecisionButtons: React.FC<PaymentDecisionButtonsProps> = ({
  onDecision,
  disabled = false,
}) => {
  const [submitting, setSubmitting] = useState<FinalOutcome | null>(null);

  const handleDecision = useCallback(
    (outcome: FinalOutcome) => {
      if (submitting !== null || disabled) return;
      setSubmitting(outcome);
      // Give the UI a single frame to reflect the disabled state before propagating
      setTimeout(() => {
        onDecision(outcome);
      }, 50);
    },
    [submitting, disabled, onDecision]
  );

  const isAnySubmitting = submitting !== null || disabled;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>YOUR DECISION</Text>

      {/* Confirm it's me */}
      <TouchableOpacity
        style={[
          styles.decisionBtn,
          styles.confirmBtn,
          isAnySubmitting && styles.btnDisabled,
        ]}
        onPress={() => handleDecision("confirmed")}
        disabled={isAnySubmitting}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Confirm this payment is from me"
        accessibilityState={{ disabled: isAnySubmitting }}
      >
        {submitting === "confirmed" ? (
          <ActivityIndicator size="small" color={colors.safe} />
        ) : (
          <Ionicons name="checkmark-circle" size={20} color={colors.safe} />
        )}
        <View style={styles.btnTextCol}>
          <Text style={styles.btnLabel}>
            Confirm it's me
          </Text>
          <Text style={styles.btnSubtext}>I recognise this payment and approve it</Text>
        </View>
      </TouchableOpacity>

      {/* Cancel payment */}
      <TouchableOpacity
        style={[
          styles.decisionBtn,
          styles.cancelBtn,
          isAnySubmitting && styles.btnDisabled,
        ]}
        onPress={() => handleDecision("cancelled")}
        disabled={isAnySubmitting}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Cancel this payment"
        accessibilityState={{ disabled: isAnySubmitting }}
      >
        {submitting === "cancelled" ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Ionicons name="close-circle" size={20} color={colors.textMuted} />
        )}
        <View style={styles.btnTextCol}>
          <Text style={styles.btnLabel}>Cancel payment</Text>
          <Text style={styles.btnSubtext}>Stop this transfer — funds stay in my account</Text>
        </View>
      </TouchableOpacity>

      {/* Report suspicious */}
      <TouchableOpacity
        style={[
          styles.decisionBtn,
          styles.reportBtn,
          isAnySubmitting && styles.btnDisabled,
        ]}
        onPress={() => handleDecision("reported")}
        disabled={isAnySubmitting}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Report this payment as suspicious fraud"
        accessibilityState={{ disabled: isAnySubmitting }}
      >
        {submitting === "reported" ? (
          <ActivityIndicator size="small" color={colors.threat} />
        ) : (
          <Ionicons name="warning" size={20} color={colors.threat} />
        )}
        <View style={styles.btnTextCol}>
          <Text style={styles.btnLabel}>
            Report suspicious
          </Text>
          <Text style={styles.btnSubtext}>Block payment and alert your bank's fraud team</Text>
        </View>
      </TouchableOpacity>

      {/* Protected by Avaran footer */}
      <View style={styles.footer}>
        <Ionicons name="shield-checkmark" size={12} color={colors.brand} />
        <Text style={styles.footerText}>Protected by Avaran — your decision is final</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  decisionBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginVertical: spacing.xs,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  confirmBtn: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cancelBtn: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reportBtn: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnTextCol: {
    flex: 1,
    marginLeft: spacing.md,
  },
  btnLabel: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
  },
  btnSubtext: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  footerText: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: 4,
    textTransform: "none",
    fontSize: 11,
  },
});

