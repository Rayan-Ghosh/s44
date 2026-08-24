import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";

interface RiskReasonsListProps {
  title?: string;
  reasons: string[];
}

export const RiskReasonsList: React.FC<RiskReasonsListProps> = ({
  title = "WHY AVARAN FLAGGED THIS",
  reasons,
}) => {
  if (!reasons || reasons.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.card}>
        {reasons.map((reason, idx) => (
          <View key={idx} style={styles.row}>
            <View style={styles.dot}>
              <Ionicons name="warning" size={14} color={colors.threat} />
            </View>
            <Text style={styles.reasonText}>{reason}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.sm,
  },
  title: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: spacing.xs,
  },
  dot: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  reasonText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 20,
  },
});
