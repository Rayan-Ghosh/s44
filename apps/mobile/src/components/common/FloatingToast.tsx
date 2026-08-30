import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";

export interface ToastConfig {
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  type?: "info" | "success" | "warning";
}

interface FloatingToastProps {
  config: ToastConfig | null;
  onDismiss?: () => void;
  duration?: number;
}

export const FloatingToast: React.FC<FloatingToastProps> = ({
  config,
  onDismiss,
  duration = 2000,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(15)).current;

  useEffect(() => {
    if (config) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -10,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (onDismiss) {
            onDismiss();
          }
        });
      }, duration);

      return () => clearTimeout(timer);
    } else {
      opacity.setValue(0);
      translateY.setValue(15);
    }
  }, [config, duration, onDismiss, opacity, translateY]);

  if (!config) {
    return null;
  }

  const iconName =
    config.icon ||
    (config.type === "warning"
      ? "alert-circle"
      : config.type === "info"
      ? "information-circle"
      : "checkmark-circle");

  const iconColor =
    config.type === "warning"
      ? colors.threat
      : config.type === "info"
      ? colors.textPrimary
      : colors.brand;

  return (
    <View style={styles.toastWrapper} pointerEvents="none">
      <Animated.View
        style={[
          styles.toastCard,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <Ionicons name={iconName} size={16} color={iconColor} />
        <Text style={styles.toastText}>{config.message}</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  toastWrapper: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    ...(Platform.OS === "web"
      ? ({
          position: "fixed",
          pointerEvents: "none",
        } as any)
      : {}),
  },
  toastCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.full,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    ...shadows.lg,
    maxWidth: "88%",
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(8px)",
        } as any)
      : {}),
  },
  toastText: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 13,
    letterSpacing: 0.2,
  },
});
