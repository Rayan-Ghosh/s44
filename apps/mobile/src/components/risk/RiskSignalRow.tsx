import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { StatusBadge } from "../common/StatusBadge";

interface RiskSignal {
  name: string;
  level: "LOW" | "MEDIUM" | "HIGH";
  detail?: string;
}

interface RiskSignalRowProps {
  signals?: RiskSignal[];
}

const DEFAULT_SIGNALS: RiskSignal[] = [
  { name: "Transaction", level: "HIGH", detail: "12x normal amount to new merchant" },
  { name: "Device", level: "HIGH", detail: "Unfamiliar hardware fingerprint" },
  { name: "Behavior", level: "MEDIUM", detail: "Elevated transaction velocity" },
  { name: "Voice", level: "HIGH", detail: "High-urgency call preceding payment" },
];

export const RiskSignalRow: React.FC<RiskSignalRowProps> = ({ signals = DEFAULT_SIGNALS }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>RISK SIGNALS</Text>
      <View style={styles.list}>
        {signals.map((sig, idx) => (
          <View key={idx} style={styles.row}>
            <View style={styles.left}>
              <Text style={styles.signalName}>{sig.name}</Text>
              {sig.detail ? <Text style={styles.signalDetail}>{sig.detail}</Text> : null}
            </View>
            <StatusBadge label={sig.level} status={sig.level === "HIGH" ? "high" : sig.level === "MEDIUM" ? "medium" : "low"} />
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
  },
  title: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    letterSpacing: 0.8,
  },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  left: {
    flex: 1,
    paddingRight: spacing.md,
  },
  signalName: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
  },
  signalDetail: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
