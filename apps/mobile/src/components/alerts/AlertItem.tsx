import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { SecurityAlert } from "../../types/alert";
import { Badge } from "../common/Badge";

interface AlertItemProps {
  alert: SecurityAlert;
  onPress: () => void;
}

export const AlertItem: React.FC<AlertItemProps> = ({ alert, onPress }) => {
  const getCategoryIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (alert.category) {
      case "payment":
        return "card-outline";
      case "voice":
        return "call-outline";
      case "device":
        return "phone-portrait-outline";
      default:
        return "shield-outline";
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.container,
        alert.severity === "HIGH" && styles.highContainer,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${alert.severity} risk alert: ${alert.title}`}
    >
      <View style={styles.topRow}>
        <View style={styles.badgeWrapper}>
          <Badge label={alert.severity} riskLevel={alert.severity} size="sm" />
          <Text style={styles.timestamp}>{alert.timestamp}</Text>
        </View>
        {!alert.isRead && <View style={styles.unreadDot} />}
      </View>

      <View style={styles.contentRow}>
        <View
          style={[
            styles.iconBox,
            alert.severity === "HIGH"
              ? styles.iconBoxHigh
              : styles.iconBoxNormal,
          ]}
        >
          <Ionicons
            name={getCategoryIcon()}
            size={20}
            color={alert.severity === "HIGH" ? colors.threat : colors.textPrimary}
          />
        </View>

        <View style={styles.textBlock}>
          <Text style={styles.title}>{alert.title}</Text>
          <Text style={styles.description} numberOfLines={2}>
            {alert.description}
          </Text>
          {alert.amount && <Text style={styles.amount}>{alert.amount}</Text>}
        </View>

        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  highContainer: {
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
  badgeWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  timestamp: {
    ...typography.small,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.threat,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  iconBoxHigh: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  iconBoxNormal: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  textBlock: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  title: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
  },
  description: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  amount: {
    ...typography.smallSemibold,
    color: colors.threatText,
    marginTop: 4,
  },
});
