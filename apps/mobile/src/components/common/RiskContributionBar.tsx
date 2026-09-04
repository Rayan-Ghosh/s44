import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";

export interface ContributionItem {
  label: string;
  percentage: number;
  color: string;
}

interface RiskContributionBarProps {
  contributions?: ContributionItem[];
}

const DEFAULT_CONTRIBUTIONS: ContributionItem[] = [
  { label: "Transaction Patterns", percentage: 31, color: colors.textPrimary },
  { label: "Behavioural Profile", percentage: 25, color: colors.textSecondary },
  { label: "Device Trust", percentage: 20, color: colors.caution },
  { label: "Recipient History", percentage: 14, color: colors.threat },
  { label: "Other Factors", percentage: 10, color: colors.textMuted },
];

export const RiskContributionBar: React.FC<RiskContributionBarProps> = ({
  contributions = DEFAULT_CONTRIBUTIONS,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Risk contribution</Text>

      {/* Individual horizontal bars per factor */}
      {contributions.map((item, index) => (
        <View key={index} style={styles.factorRow}>
          <View style={styles.factorLabelRow}>
            <Text style={styles.factorLabel}>{item.label}</Text>
            <Text style={[styles.factorPercent, { color: item.color }]}>{item.percentage}%</Text>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${item.percentage}%`,
                  backgroundColor: item.color,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heading: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  factorRow: {
    marginBottom: spacing.md,
  },
  factorLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  factorLabel: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
    flexShrink: 1,
  },
  factorPercent: {
    ...typography.smallSemibold,
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 0,
    textAlign: "right",
    minWidth: 38,
  },
  barTrack: {
    height: 6,
    backgroundColor: colors.borderLight,
    borderRadius: radii.full,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: radii.full,
  },
});
