import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { SecurityAlert } from "../../types/alert";
import { StatusBadge } from "../common/StatusBadge";

interface AlertCardProps {
  alert: SecurityAlert;
  onPress: () => void;
}

export const AlertCard: React.FC<AlertCardProps> = ({ alert, onPress }) => {
  const isHigh = alert.severity === "HIGH";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.card,
        isHigh && styles.highCard,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${alert.severity} alert: ${alert.title}`}
    >
      <View style={styles.topRow}>
        <StatusBadge
          label={alert.severity}
          status={alert.severity.toLowerCase() as any}
        />
        <Text style={styles.timestamp}>{alert.timestamp}</Text>
      </View>

      <View style={styles.bodyRow}>
        <View style={styles.iconBox}>
          <Ionicons
            name={
              alert.category === "payment"
                ? "card-outline"
                : alert.category === "voice"
                ? "call-outline"
                : "shield-outline"
            }
            size={18}
            color={isHigh ? colors.threat : colors.textPrimary}
          />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{alert.title}</Text>
          <Text style={styles.desc} numberOfLines={2}>
            {alert.description}
          </Text>
          {alert.amount && <Text style={styles.amount}>{alert.amount}</Text>}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  highCard: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.threat,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  textContainer: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  title: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 13,
  },
  desc: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
  },
  amount: {
    ...typography.caption,
    fontWeight: "800",
    color: colors.threatText,
    marginTop: 4,
    fontSize: 12,
  },
});
