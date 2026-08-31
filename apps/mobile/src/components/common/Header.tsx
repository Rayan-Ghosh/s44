import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { AvaranLogo } from "./AvaranLogo";

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    label?: string;
    onPress: () => void;
    color?: string;
    backgroundColor?: string;
    isActive?: boolean;
  };
}

export const Header: React.FC<HeaderProps> = ({
  title = "AVARAN",
  showBack = false,
  onBack,
  rightAction,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: Math.max(insets.top, Platform.OS === "android" ? 10 : 6) },
      ]}
    >
      <View style={styles.inner}>
        {/* Left */}
        <View style={styles.left}>
          {showBack ? (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.brandContainer}>
              <AvaranLogo size="sm" showText={false} style={{ marginRight: spacing.sm }} />
              <Text style={styles.brandTitle}>AVARAN</Text>
            </View>
          )}
        </View>

        {/* Center / Screen Title for back screens */}
        {showBack && title && title !== "AVARAN" ? (
          <Text style={styles.screenTitle}>{title}</Text>
        ) : null}

        {/* Right - Only if rightAction explicitly provided, otherwise empty spacing */}
        <View style={styles.right}>
          {rightAction ? (
            <TouchableOpacity
              onPress={rightAction.onPress}
              style={[
                styles.actionButton,
                rightAction.backgroundColor ? { backgroundColor: rightAction.backgroundColor } : null,
                rightAction.isActive !== undefined
                  ? {
                      backgroundColor: rightAction.isActive
                        ? colors.brandSurface
                        : colors.surfaceSecondary,
                      borderColor: rightAction.isActive
                        ? colors.brandBorder
                        : colors.borderLight,
                      borderWidth: 1,
                    }
                  : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={rightAction.label || "Action"}
            >
              <Ionicons
                name={rightAction.icon}
                size={18}
                color={
                  rightAction.color ||
                  (rightAction.isActive !== undefined
                    ? rightAction.isActive
                      ? colors.brand
                      : colors.textMuted
                    : colors.textSecondary)
                }
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.rightPlaceholder} />
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm + 2,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 36,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  shieldIcon: {
    width: 26,
    height: 26,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  screenTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: 0.4,
  },
  backButton: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  rightPlaceholder: {
    width: 26,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
});
