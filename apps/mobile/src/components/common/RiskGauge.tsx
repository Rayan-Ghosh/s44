import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";

interface RiskGaugeProps {
  score: number; // 0 - 100
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  score,
  riskLevel,
  showLabel = true,
  size = "md",
}) => {
  const getRiskColor = () => {
    if (score >= 61 || riskLevel === "HIGH") return colors.threat;
    if (score >= 31 || riskLevel === "MEDIUM") return colors.caution;
    return colors.safe;
  };

  const getRiskBg = () => {
    if (score >= 61 || riskLevel === "HIGH") return colors.threatSurface;
    if (score >= 31 || riskLevel === "MEDIUM") return colors.cautionSurface;
    return colors.safeSurface;
  };

  const clampedScore = Math.max(0, Math.min(100, score));
  const activeColor = getRiskColor();

  // Circular gauge dimensions
  const dims = size === "sm" ? { outer: 80, stroke: 6, fontSize: 22, labelSize: 9 }
    : size === "lg" ? { outer: 140, stroke: 10, fontSize: 36, labelSize: 12 }
    : { outer: 110, stroke: 8, fontSize: 28, labelSize: 11 };

  const radius = (dims.outer - dims.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (clampedScore / 100) * circumference;
  const dashOffset = circumference - progress;
  const center = dims.outer / 2;

  return (
    <View style={styles.container}>
      <View style={styles.gaugeRow}>
        {/* Circular SVG gauge */}
        <View style={[styles.svgContainer, { width: dims.outer, height: dims.outer }]}>
          <Svg width={dims.outer} height={dims.outer}>
            {/* Background track */}
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={colors.borderLight}
              strokeWidth={dims.stroke}
              fill="none"
            />
            {/* Progress arc */}
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={activeColor}
              strokeWidth={dims.stroke}
              fill="none"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              rotation="-90"
              origin={`${center}, ${center}`}
            />
          </Svg>
          {/* Score text in center */}
          <View style={styles.centerLabel}>
            <Text style={[styles.scoreNumber, { color: activeColor, fontSize: dims.fontSize }]}>
              {clampedScore}
            </Text>
            <Text style={[styles.scoreScale, { fontSize: dims.labelSize - 1 }]}>/100</Text>
          </View>
        </View>

        {/* Risk level badge and explanation */}
        {showLabel && (
          <View style={styles.infoCol}>
            <View style={[styles.levelBadge, { backgroundColor: activeColor }]}>
              <Text style={styles.levelBadgeText}>{riskLevel} RISK</Text>
            </View>
            <Text style={styles.riskExplanation}>
              {riskLevel === "LOW"
                ? "All payments within normal parameters."
                : riskLevel === "MEDIUM"
                ? "Some activity flagged for review."
                : "Action required on held transactions."}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginVertical: spacing.xs,
  },
  gaugeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  svgContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  centerLabel: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreNumber: {
    fontWeight: "800",
    lineHeight: 40,
  },
  scoreScale: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: -4,
  },
  infoCol: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  levelBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    alignSelf: "flex-start",
  },
  levelBadgeText: {
    ...typography.riskLabel,
    color: colors.textInverse,
  },
  riskExplanation: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
});
