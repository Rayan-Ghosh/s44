import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { ConnectedApp } from "../../services/integration-service";
import { StatusBadge } from "../common/StatusBadge";

interface ConnectedAppCardProps {
  app: ConnectedApp;
  onPress?: () => void;
}

export const ConnectedAppCard: React.FC<ConnectedAppCardProps> = ({ app, onPress }) => {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.8}
    >
      <View style={styles.topRow}>
        <View style={styles.iconBox}>
          <Ionicons
            name={app.iconName as any || "shield-checkmark-outline"}
            size={20}
            color={colors.textPrimary}
          />
        </View>
        <View style={styles.infoCol}>
          <Text style={styles.appName}>{app.name}</Text>
          <Text style={styles.appType}>{app.type}</Text>
        </View>
        <StatusBadge label={app.status} status="low" />
      </View>

      <View style={styles.footerRow}>
        <View style={styles.protectedByRow}>
          <Ionicons name="shield-checkmark" size={13} color={colors.brand} />
          <Text style={styles.protectedByText}>Protected by Avaran API</Text>
        </View>
        <Text style={styles.lastTxnText}>{app.lastProtectedTxn}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  infoCol: {
    flex: 1,
  },
  appName: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
  },
  appType: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.xs,
  },
  protectedByRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  protectedByText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textSecondary,
    fontSize: 11,
  },
  lastTxnText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
});
