import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "destructive" | "positive" | "warning" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  loading = false,
  disabled = false,
  style,
  textStyle,
  accessibilityLabel,
}) => {
  const getContainerStyle = (): ViewStyle => {
    let bg: string = colors.btnPrimaryBg;
    let border: string = "transparent";
    let borderWidth = 0;

    switch (variant) {
      case "secondary":
        bg = colors.btnSecondaryBg;
        border = colors.btnSecondaryBorder;
        borderWidth = 1;
        break;
      case "destructive":
        bg = colors.btnDangerBg;
        break;
      case "positive":
        bg = colors.btnPositiveBg;
        break;
      case "warning":
        bg = colors.btnWarningBg;
        break;
      case "outline":
        bg = "transparent";
        border = colors.border;
        borderWidth = 1;
        break;
      case "ghost":
        bg = "transparent";
        break;
      case "primary":
      default:
        bg = colors.btnPrimaryBg;
        break;
    }

    const minHeight = size === "sm" ? 38 : size === "lg" ? 52 : 44;
    const paddingHorizontal = size === "sm" ? spacing.xs : spacing.sm;

    return {
      backgroundColor: bg,
      borderColor: border,
      borderWidth,
      minHeight,
      paddingHorizontal,
      opacity: disabled ? 0.5 : 1,
    };
  };

  const getTextColor = (): string => {
    switch (variant) {
      case "secondary":
        return colors.btnSecondaryText;
      case "destructive":
        return colors.btnDangerText;
      case "positive":
        return colors.btnPositiveText;
      case "warning":
        return colors.btnWarningText;
      case "outline":
      case "ghost":
        return colors.textPrimary;
      case "primary":
      default:
        return colors.btnPrimaryText;
    }
  };

  const textColor = getTextColor();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.base, getContainerStyle(), style]}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <View style={styles.content}>
          {icon && iconPosition === "left" && (
            <Ionicons
              name={icon}
              size={size === "sm" ? 15 : 16}
              color={textColor}
              style={styles.iconLeft}
            />
          )}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit={true}
            style={[
              styles.text,
              {
                color: textColor,
                fontSize: size === "sm" ? 12 : size === "lg" ? 15 : 13,
              },
              textStyle,
            ]}
          >
            {label}
          </Text>
          {icon && iconPosition === "right" && (
            <Ionicons
              name={icon}
              size={size === "sm" ? 15 : 16}
              color={textColor}
              style={styles.iconRight}
            />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    ...typography.bodySemibold,
    textAlign: "center",
  },
  iconLeft: {
    marginRight: spacing.sm,
  },
  iconRight: {
    marginLeft: spacing.sm,
  },
});
