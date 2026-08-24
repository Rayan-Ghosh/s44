import React, { useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { useAppHealth } from "../../context/AppHealthContext";

export const WatchdogToast: React.FC = () => {
  const { recentFreezeIncident, dismissFreezeAlert } = useAppHealth();

  useEffect(() => {
    if (recentFreezeIncident) {
      const timer = setTimeout(() => {
        dismissFreezeAlert();
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [recentFreezeIncident, dismissFreezeAlert]);

  if (!recentFreezeIncident) {
    return null;
  }

  return (
    <View style={styles.toastContainer}>
      <View style={styles.card}>
        <View style={styles.iconBox}>
          <Ionicons name="pulse" size={16} color={colors.caution} />
        </View>

        <View style={styles.textCol}>
          <Text style={styles.title}>
            UI Thread Lag Detected ({Math.round(recentFreezeIncident.durationMs)}ms)
          </Text>
          <Text style={styles.desc}>
            Watchdog recovered responsiveness gracefully.
          </Text>
        </View>

        <TouchableOpacity
          onPress={dismissFreezeAlert}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    position: "absolute",
    top: 50,
    left: spacing.md,
    right: spacing.md,
    zIndex: 9999,
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.caution,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    ...shadows.md,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.cautionSurface,
    borderWidth: 1,
    borderColor: colors.cautionBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
  },
  title: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  desc: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
});
