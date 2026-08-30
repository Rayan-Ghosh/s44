import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { RiskLevel } from "../../types/risk";

interface RiskScoreBadgeProps {
  score: number;
  level: RiskLevel;
  size?: "sm" | "md" | "lg";
}

export const RiskScoreBadge: React.FC<RiskScoreBadgeProps> = ({
  score,
  level,
  size = "md",
}) => {
  const isHigh = level === "HIGH";
  const isMedium = level === "MEDIUM";

  const theme = isHigh
    ? { bg: colors.threatSurface, border: colors.threatBorder, text: colors.threatText, main: colors.threat }
    : isMedium
    ? { bg: colors.cautionSurface, border: colors.cautionBorder, text: colors.cautionText, main: colors.caution }
    : { bg: colors.safeSurface, border: colors.safeBorder, text: colors.safeText, main: colors.safe };

  if (size === "lg") {
    return (
      <View style={styles.largeContainer}>
        <View style={styles.largeTopRow}>
          <Text style={[styles.largeScore, { color: theme.main }]}>{score}</Text>
          <Text style={styles.largeMax}>/100</Text>
        </View>
        <View style={[styles.levelPill, { backgroundColor: theme.main }]}>
          <Text style={styles.levelPillText}>{level} RISK</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.badge}>
      <Text style={[styles.scoreText, { color: theme.main }]}>
        {score} / 100 · {level}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  scoreText: {
    ...typography.smallSemibold,
    letterSpacing: 0.2,
  },
  largeContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  largeTopRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: spacing.xs,
  },
  largeScore: {
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: -1,
  },
  largeMax: {
    ...typography.h3,
    color: colors.textMuted,
    marginLeft: spacing.xs,
  },
  levelPill: {
    borderRadius: radii.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  levelPillText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
});
