import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { Button } from "../common/Button";
import { StatusBadge } from "../common/StatusBadge";
import { GuardianRequest } from "../../types/guardian";
import { getStatusBadgeProps } from "../../utils/risk-scoring";

interface GuardianApprovalCardProps {
  request: GuardianRequest;
  onConfirm: () => Promise<{ success: boolean; error?: string } | void> | void;
  onReject: () => Promise<{ success: boolean; error?: string } | void> | void;
  onDismiss: () => void;
}

export const GuardianApprovalCard: React.FC<GuardianApprovalCardProps> = ({
  request,
  onConfirm,
  onReject,
  onDismiss,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const remaining = Math.max(0, Math.floor((request.expiresAt - Date.now()) / 1000));
    return remaining;
  });
  const [decided, setDecided] = useState(false);
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeAction, setActiveAction] = useState<"APPROVING" | "REJECTING" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActionInProgressRef = useRef(false);

  // Keep local countdown in sync with expiresAt
  useEffect(() => {
    if (decided) return;

    intervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.floor((request.expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        clearInterval(intervalRef.current!);
      }
    }, 500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [request.expiresAt, decided]);

  const handleConfirm = async () => {
    if (decided || isSubmitting || isActionInProgressRef.current) return;
    isActionInProgressRef.current = true;
    setIsSubmitting(true);
    setActiveAction("APPROVING");
    setErrorMessage(null);

    try {
      const result = await onConfirm();
      if (result && typeof result === "object" && (result as any).success === false) {
        setErrorMessage((result as any).error || "Failed to approve payment. Please try again.");
        setIsSubmitting(false);
        setActiveAction(null);
        isActionInProgressRef.current = false;
        return;
      }

      setDecided(true);
      setDecision("APPROVED");
      if (intervalRef.current) clearInterval(intervalRef.current);

      // Brief visual confirmation before card closes
      setTimeout(() => {
        onDismiss();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to approve payment. Please try again.");
      setIsSubmitting(false);
      setActiveAction(null);
      isActionInProgressRef.current = false;
    }
  };

  const handleReject = async () => {
    if (decided || isSubmitting || isActionInProgressRef.current) return;
    isActionInProgressRef.current = true;
    setIsSubmitting(true);
    setActiveAction("REJECTING");
    setErrorMessage(null);

    try {
      const result = await onReject();
      if (result && typeof result === "object" && (result as any).success === false) {
        setErrorMessage((result as any).error || "Failed to reject payment. Please try again.");
        setIsSubmitting(false);
        setActiveAction(null);
        isActionInProgressRef.current = false;
        return;
      }

      setDecided(true);
      setDecision("REJECTED");
      if (intervalRef.current) clearInterval(intervalRef.current);

      // Brief visual confirmation before card closes
      setTimeout(() => {
        onDismiss();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to reject payment. Please try again.");
      setIsSubmitting(false);
      setActiveAction(null);
      isActionInProgressRef.current = false;
    }
  };

  const isExpired = secondsLeft === 0 && !decided;
  const isUrgent = secondsLeft <= 15 && secondsLeft > 0;

  const countdownColor = isExpired
    ? colors.textMuted
    : isUrgent
    ? colors.threat
    : colors.caution;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="shield-outline" size={16} color={colors.threat} />
          <Text style={styles.headerLabel}>GUARDIAN APPROVAL REQUESTED</Text>
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          disabled={isSubmitting}
          style={[styles.dismissBtn, isSubmitting && { opacity: 0.5 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Payment Details */}
      <View style={styles.detailsRow}>
        <View style={styles.detailsLeft}>
          {request.senderName ? (
            <Text style={styles.senderSub}>
              From: <Text style={{ color: colors.brand, fontWeight: "700" }}>{request.senderName}</Text>
            </Text>
          ) : null}
          <Text style={styles.merchantName}>{request.merchant}</Text>
          <Text style={styles.amount}>₹{request.amount.toLocaleString("en-IN")}</Text>
          <Text style={styles.method}>{request.paymentMethod}</Text>
        </View>
        <StatusBadge
          label={`${request.riskLevel} RISK · ${Math.round(request.riskScore)}/100`}
          status={getStatusBadgeProps(request.riskLevel).status}
        />
      </View>

      {/* Flags */}
      {request.reasons && request.reasons.length > 0 && (
        <View style={styles.flagsBox}>
          <Text style={styles.flagsLabel}>WHY FLAGGED</Text>
          {request.reasons.slice(0, 3).map((reason, i) => (
            <View key={i} style={styles.flagRow}>
              <Ionicons
                name="alert-circle"
                size={13}
                color={colors.threat}
                style={{ marginRight: 6, marginTop: 1 }}
              />
              <Text style={styles.flagText}>{reason}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Countdown */}
      {!decided && !isExpired && (
        <View style={styles.countdownRow}>
          <Ionicons name="time-outline" size={14} color={countdownColor} />
          <Text style={[styles.countdownText, { color: countdownColor }]}>
            {isUrgent ? "⚠ " : ""}{secondsLeft}s remaining to decide
          </Text>
        </View>
      )}
      {isExpired && (
        <View style={styles.countdownRow}>
          <Ionicons name="time-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.countdownText, { color: colors.textMuted }]}>
            Approval window expired
          </Text>
        </View>
      )}

      {/* Error state */}
      {errorMessage && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={15} color={colors.threat} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {/* Decision result */}
      {decided && decision && (
        <View
          style={[
            styles.resultBanner,
            decision === "APPROVED" ? styles.resultApproved : styles.resultRejected,
          ]}
        >
          <Ionicons
            name={decision === "APPROVED" ? "checkmark-circle" : "close-circle"}
            size={16}
            color={decision === "APPROVED" ? colors.safe : colors.threat}
          />
          <Text
            style={[
              styles.resultText,
              { color: decision === "APPROVED" ? colors.safeText : colors.threatText },
            ]}
          >
            {decision === "APPROVED" ? "Payment approved by family guardian." : "Payment rejected and blocked by guardian."}
          </Text>
        </View>
      )}

      {/* Actions */}
      {!decided && !isExpired && (
        <View style={styles.actionsRow}>
          <Button
            label={isSubmitting && activeAction === "APPROVING" ? "APPROVING..." : "CONFIRM PAYMENT"}
            onPress={handleConfirm}
            variant="positive"
            size="md"
            style={{ flex: 1 }}
            icon="checkmark"
            disabled={isSubmitting}
            loading={isSubmitting && activeAction === "APPROVING"}
          />
          <Button
            label={isSubmitting && activeAction === "REJECTING" ? "REJECTING..." : "REJECT PAYMENT"}
            onPress={handleReject}
            variant="destructive"
            size="md"
            style={{ flex: 1 }}
            icon="close"
            disabled={isSubmitting}
            loading={isSubmitting && activeAction === "REJECTING"}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.threatBorder,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  headerLabel: {
    ...typography.caption,
    color: colors.threat,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  dismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    marginBottom: spacing.md,
  },
  detailsLeft: {
    flex: 1,
    gap: 2,
    paddingRight: spacing.md,
  },
  senderSub: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 2,
  },
  merchantName: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  amount: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 22,
    marginTop: 2,
  },
  method: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  flagsBox: {
    backgroundColor: colors.threatSurface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.threatBorder,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  flagsLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  flagRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 2,
  },
  flagText: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  countdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: spacing.md,
  },
  countdownText: {
    ...typography.smallSemibold,
    fontSize: 12,
    fontWeight: "700",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.threatSurface,
    borderColor: colors.threatBorder,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.small,
    color: colors.threat,
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  resultBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  resultApproved: {
    backgroundColor: colors.safeSurface,
    borderColor: colors.safeBorder,
  },
  resultRejected: {
    backgroundColor: colors.threatSurface,
    borderColor: colors.threatBorder,
  },
  resultText: {
    ...typography.smallSemibold,
    fontSize: 13,
  },
});
