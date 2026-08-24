import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { CallStatus, CallerInfo } from "../../types/voice";

interface CallStatusIndicatorProps {
  status: CallStatus;
  caller: CallerInfo;
  durationSec: number;
}

export const CallStatusIndicator: React.FC<CallStatusIndicatorProps> = ({
  status,
  caller,
  durationSec,
}) => {
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isActive = status === "active" || status === "fraud_alert";

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.statusPill}>
          <View style={[styles.pulseDot, { backgroundColor: isActive ? colors.safe : colors.textMuted }]} />
          <Text style={styles.statusText}>
            {isActive ? "AVARAN PROTECTION ACTIVE" : status.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.timerText}>{formatTime(durationSec)}</Text>
      </View>

      <View style={styles.callerInfo}>
        <View style={styles.callerIconContainer}>
          <Ionicons
            name={isActive ? "call" : "call-outline"}
            size={24}
            color={isActive ? colors.threat : colors.textMuted}
          />
        </View>
        <View style={styles.callerDetails}>
          <Text style={styles.callerName}>{caller.displayName}</Text>
          <Text style={styles.callerNumber}>{caller.phoneNumber}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginVertical: spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundSubtle,
    borderRadius: radii.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  statusText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  timerText: {
    ...typography.smallSemibold,
    color: colors.textSecondary,
    fontWeight: "700",
    fontSize: 14,
  },
  callerInfo: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: spacing.xs,
  },
  callerIconContainer: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  callerDetails: {
    flex: 1,
  },
  callerName: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 16,
  },
  callerNumber: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
});
