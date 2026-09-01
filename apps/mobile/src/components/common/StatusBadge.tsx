import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, ViewStyle, Animated, Easing } from "react-native";
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
          bg: colors.safe,
          border: colors.safeDark,
          text: colors.textInverse,
          dotColor: colors.textInverse,
        };
      case "pending":
      case "medium":
        return {
          bg: colors.caution,
          border: colors.caution,
          text: colors.textInverse,
          dotColor: colors.textInverse,
        };
      case "high":
      case "escalated":
        return {
          bg: colors.threat,
          border: colors.threat,
          text: colors.textInverse,
          dotColor: colors.textInverse,
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
  const transitionAnim = useRef(new Animated.Value(1)).current;
  const prevStatusRef = useRef(status);
  const prevLabelRef = useRef(label);

  useEffect(() => {
    if (prevStatusRef.current !== status || prevLabelRef.current !== label) {
      prevStatusRef.current = status;
      prevLabelRef.current = label;

      // Subtle smooth cross-fade & scale transition on status change
      transitionAnim.setValue(0.4);
      Animated.timing(transitionAnim, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [status, label, transitionAnim]);

  return (
    <Animated.View
      style={[
        styles.badge,
        {
          backgroundColor: theme.bg,
          borderColor: theme.border,
          opacity: transitionAnim,
          transform: [
            {
              scale: transitionAnim.interpolate({
                inputRange: [0.4, 1],
                outputRange: [0.94, 1],
              }),
            },
          ],
        },
        style,
      ]}
    >
      {dot && <View style={[styles.dot, { backgroundColor: theme.dotColor }]} />}
      <Text style={[styles.text, { color: theme.text }]}>{label}</Text>
    </Animated.View>
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
