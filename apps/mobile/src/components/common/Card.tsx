import React from "react";
import { View, StyleSheet, ViewStyle, TouchableOpacity } from "react-native";
import { colors } from "../../theme/colors";
import { radii, spacing, shadows } from "../../theme/layout";

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: "default" | "raised" | "sunken" | "threat" | "caution" | "safe" | "brand";
  onPress?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  variant = "default",
  onPress,
}) => {
  const getCardStyle = (): ViewStyle => {
    switch (variant) {
      case "raised":
        return {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          ...shadows.md,
        };
      case "sunken":
        return {
          backgroundColor: colors.surfaceSecondary,
          borderColor: colors.borderLight,
        };
      case "threat":
        return {
          backgroundColor: colors.surface,
          borderColor: colors.threatBorder,
          ...shadows.sm,
        };
      case "caution":
        return {
          backgroundColor: colors.surface,
          borderColor: colors.cautionBorder,
          ...shadows.sm,
        };
      case "safe":
        return {
          backgroundColor: colors.surface,
          borderColor: colors.safeBorder,
          ...shadows.sm,
        };
      case "brand":
        return {
          backgroundColor: colors.surface,
          borderColor: colors.brandBorder,
          ...shadows.sm,
        };
      case "default":
      default:
        return {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          ...shadows.sm,
        };
    }
  };

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={[styles.container, getCardStyle(), style]}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, getCardStyle(), style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginVertical: spacing.xs,
  },
});
