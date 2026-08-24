import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";

export interface StatusBadgeProps {
  label: string;
  status?: "active" | "pending" | "escalated" | "resolved" | "high" | "medium" | "low" | "neutral";
  dot?: boolean;
  style?: ViewStyle;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  status = "neutral",
  dot = true,
  style,
}) => {
  const getTheme = () => {
    switch (status) {
      case "active":
      case "low":
      case "resolved":
        return {
          bg: colors.safeSurface,
          border: colors.safeBorder,
          text: colors.safeText,
          dotColor: colors.safe,
        };
      case "pending":
      case "medium":
        return {
          bg: colors.cautionSurface,
          border: colors.cautionBorder,
          text: colors.cautionText,
          dotColor: colors.caution,
        };
      case "high":
      case "escalated":
        return {
          bg: colors.threatSurface,
          border: colors.threatBorder,
          text: colors.threatText,
          dotColor: colors.threat,
        };
      case "neutral":
      default:
        return {
          bg: colors.surfaceSecondary,
          border: colors.border,
          text: colors.textSecondary,
          dotColor: colors.textMuted,
        };
    }
  };

  const theme = getTheme();

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: theme.bg, borderColor: theme.border },
        style,
      ]}
    >
      {dot && <View style={[styles.dot, { backgroundColor: theme.dotColor }]} />}
      <Text style={[styles.text, { color: theme.text }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  text: {
    ...typography.caption,
    fontWeight: "700",
    fontSize: 10,
    letterSpacing: 0.2,
  },
});
