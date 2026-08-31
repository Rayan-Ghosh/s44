import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { StatusBadge } from "../common/StatusBadge";
import { RiskLevel } from "../../types/risk";

export interface TransactionCardItem {
  id: string;
  recipient: string;
  recipientHandle?: string;
  amount: number;
  riskScore: number;
  riskLevel: RiskLevel;
  timestamp: string;
  device?: string;
  status: "Flagged & Held" | "Approved" | "Cancelled" | "Reported" | "Completed" | "Pending";
}

interface TransactionCardProps {
  item: TransactionCardItem;
  onPress?: () => void;
  onReview?: () => void;
}

export const TransactionCard: React.FC<TransactionCardProps> = ({
  item,
  onPress,
  onReview,
}) => {
  const isHigh = item.riskLevel === "HIGH";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.card, isHigh && styles.cardHigh]}
      disabled={!onPress}
    >
      <View style={styles.headerRow}>
        <View style={styles.leftMeta}>
          <Text style={styles.txnId}>{item.id}</Text>
          <Text style={styles.timeText}>{item.timestamp}</Text>
        </View>
        <StatusBadge
          label={`${item.riskLevel} · ${item.riskScore}`}
          status={item.riskLevel.toLowerCase() as any}
        />
      </View>

      <View style={styles.mainRow}>
        <View style={styles.infoCol}>
          <Text style={styles.recipientName}>{item.recipient}</Text>
          {item.recipientHandle && (
            <Text style={styles.recipientHandle}>{item.recipientHandle}</Text>
          )}
          {item.device && <Text style={styles.deviceText}>Device: {item.device}</Text>}
        </View>

        <View style={styles.amountCol}>
          <Text style={styles.amountText}>₹{(item?.amount ?? 0).toLocaleString("en-IN")}</Text>
          <Text style={styles.statusLabel}>{item.status}</Text>
        </View>
      </View>

      {onReview && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.reviewButton}
            onPress={onReview}
            activeOpacity={0.8}
          >
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.brand} />
            <Text style={styles.reviewButtonText}>Review Risk Breakdown</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.brand} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  cardHigh: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.threat,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  leftMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  txnId: {
    ...typography.caption,
    fontFamily: "monospace",
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 11,
  },
  timeText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  mainRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  infoCol: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  recipientName: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
  },
  recipientHandle: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  deviceText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  amountCol: {
    alignItems: "flex-end",
  },
  amountText: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  statusLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  actionRow: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
  },
  reviewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 4,
  },
  reviewButtonText: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 11,
  },
});
