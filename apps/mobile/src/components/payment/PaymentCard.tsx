import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { TransactionInput } from "../../types/transaction";

interface PaymentCardProps {
  transaction: TransactionInput;
  headline?: string;
}

export const PaymentCard: React.FC<PaymentCardProps> = ({
  transaction,
  headline = "Payment requires your attention",
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.topBanner}>
        <Ionicons name="alert-circle" size={20} color={colors.threat} />
        <Text style={styles.headline}>{headline}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.amount}>₹{transaction.amount.toLocaleString("en-IN")}</Text>

        <View style={styles.detailsGrid}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>To:</Text>
            <View style={styles.recipientBlock}>
              <Text style={styles.recipientName}>{transaction.recipientName}</Text>
              <Text style={styles.recipientHandle}>{transaction.recipientHandle}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Device:</Text>
            <Text style={styles.detailValue}>{transaction.deviceLabel}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location:</Text>
            <Text style={styles.detailValue}>{transaction.location}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Method:</Text>
            <Text style={styles.detailValue}>{transaction.paymentMethod}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginVertical: spacing.sm,
  },
  topBanner: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headline: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    marginLeft: spacing.xs,
  },
  body: {
    padding: spacing.lg,
    alignItems: "center",
  },
  amount: {
    fontSize: 38,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginVertical: spacing.xs,
  },
  detailsGrid: {
    width: "100%",
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.xs,
  },
  detailLabel: {
    ...typography.small,
    color: colors.textMuted,
    width: 80,
  },
  detailValue: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "right",
  },
  recipientBlock: {
    flex: 1,
    alignItems: "flex-end",
  },
  recipientName: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
  },
  recipientHandle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
