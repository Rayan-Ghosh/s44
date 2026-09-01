import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
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
  selected?: boolean;
}

export const TransactionCard: React.FC<TransactionCardProps> = ({
  item,
  onPress,
  onReview,
  selected = false,
}) => {
  const isHigh = item.riskLevel === "HIGH";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.78}
      style={[
        styles.card,
        isHigh && styles.cardHigh,
        selected && styles.cardSelected,
      ]}
      disabled={!onPress}
    >
      {/* Main row: icon + info + amount */}
      <View style={styles.mainRow}>
        {/* Left icon identifier */}
        <View style={[styles.iconBox, isHigh && styles.iconBoxHigh]}>
          <Ionicons
            name={isHigh ? "warning" : "checkmark-circle"}
            size={17}
            color={isHigh ? colors.threat : colors.safe}
          />
        </View>

        {/* Merchant + meta */}
        <View style={styles.infoCol}>
          {/* Primary: merchant/recipient */}
          <Text style={styles.recipientName} numberOfLines={1}>{item.recipient}</Text>

          {/* Secondary: handle (if present) */}
          {item.recipientHandle && (
            <Text style={styles.recipientHandle}>{item.recipientHandle}</Text>
          )}

          {/* Supporting: timestamp + device */}
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{item.timestamp}</Text>
            {item.device && (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText}>{item.device}</Text>
              </>
            )}
          </View>
        </View>

        {/* Right: amount + status */}
        <View style={styles.amountCol}>
          <Text style={[styles.amountText, isHigh && { color: colors.threat }]}>
            ₹{(item?.amount ?? 0).toLocaleString("en-IN")}
          </Text>
          <StatusBadge
            label={
              item.riskLevel === "HIGH"
                ? "HIGH RISK"
                : item.riskLevel === "MEDIUM"
                ? "MEDIUM"
                : "SAFE"
            }
            status={item.riskLevel === "HIGH" ? "high" : item.riskLevel === "MEDIUM" ? "medium" : "low"}
            dot={false}
          />
        </View>
      </View>

      {/* Status row below (transaction status label) */}
      <View style={styles.statusRow}>
        <Text style={styles.txnId} numberOfLines={1}>Ref {item.id}</Text>
        <Text style={styles.statusLabel}>{item.status}</Text>
      </View>

      {/* Review action */}
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    marginVertical: spacing.xs,
    ...shadows.sm,
  },
  cardHigh: {
    borderColor: colors.threatBorder,
    backgroundColor: "rgba(163,61,53,0.025)",
  },
  cardSelected: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.brand,
    ...shadows.md,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: radii.sm + 2,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconBoxHigh: {
    backgroundColor: "rgba(163,61,53,0.07)",
    borderColor: colors.threatBorder,
  },
  infoCol: {
    flex: 1,
    paddingRight: spacing.xs,
  },
  recipientName: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 18,
  },
  recipientHandle: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  metaText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  metaDot: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  amountCol: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  amountText: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 14,
    letterSpacing: -0.2,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  txnId: {
    ...typography.caption,
    fontFamily: "monospace",
    color: colors.textMuted,
    fontSize: 10,
    flex: 1,
  },
  statusLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
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
