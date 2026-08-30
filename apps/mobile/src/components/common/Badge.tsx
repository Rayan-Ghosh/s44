import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { RiskLevel } from "../../types/risk";

interface BadgeProps {
  label: string;
  variant?: "safe" | "caution" | "threat" | "brand" | "neutral";
  riskLevel?: RiskLevel;
  size?: "sm" | "md";
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant,
  riskLevel,
  size = "md",
}) => {
  let resolvedVariant = variant || "neutral";
  if (riskLevel === "HIGH") resolvedVariant = "threat";
  else if (riskLevel === "MEDIUM") resolvedVariant = "caution";
  else if (riskLevel === "LOW") resolvedVariant = "safe";

  const getStyles = () => {
    switch (resolvedVariant) {
      case "threat":
        return {
          bg: colors.threatSurface,
          border: colors.threatBorder,
          text: colors.threatText,
        };
      case "caution":
        return {
          bg: colors.cautionSurface,
          border: colors.cautionBorder,
          text: colors.cautionText,
        };
      case "safe":
        return {
          bg: colors.safeSurface,
          border: colors.safeBorder,
          text: colors.safeText,
        };
      case "brand":
        return {
          bg: colors.brandSurface,
          border: colors.brandBorder,
          text: colors.brand,
        };
      default:
        return {
          bg: colors.backgroundSubtle,
          border: colors.border,
          text: colors.textSecondary,
        };
    }
  };

  const current = getStyles();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: current.bg,
          borderColor: current.border,
          paddingVertical: size === "sm" ? 2 : spacing.xs,
          paddingHorizontal: size === "sm" ? spacing.xs : spacing.sm,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: current.text,
            fontSize: size === "sm" ? 10 : 12,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.sm,
    borderWidth: 1,
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    ...typography.caption,
    fontWeight: "700",
  },
});
