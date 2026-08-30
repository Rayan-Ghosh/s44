import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/layout";

export interface TimelineStep {
  label: string;
  detail?: string;
  isHighlighted?: boolean;
}

interface RiskTimelineProps {
  steps: TimelineStep[];
}

export const RiskTimeline: React.FC<RiskTimelineProps> = ({ steps }) => {
  return (
    <View style={styles.container}>
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        const dotColor = step.isHighlighted ? colors.threat : colors.brand;
        return (
          <View key={idx} style={styles.row}>
            {/* Left: dot + vertical connector line */}
            <View style={styles.trackCol}>
              <View style={[styles.dot, { backgroundColor: dotColor }]} />
              {!isLast && <View style={styles.line} />}
            </View>

            {/* Right: text */}
            <View style={[styles.textCol, isLast && styles.textColLast]}>
              <Text
                style={[
                  styles.stepLabel,
                  step.isHighlighted && { color: colors.threatText, fontWeight: "700" },
                ]}
              >
                {step.label}
              </Text>
              {step.detail ? (
                <Text style={styles.stepDetail}>{step.detail}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.xs,
  },
  row: {
    flexDirection: "row",
    minHeight: 34,
  },
  trackCol: {
    width: 20,
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  line: {
    flex: 1,
    width: 1.5,
    backgroundColor: colors.borderLight,
    marginVertical: 2,
  },
  textCol: {
    flex: 1,
    paddingBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  textColLast: {
    paddingBottom: 0,
  },
  stepLabel: {
    ...typography.smallMedium,
    color: colors.textPrimary,
    fontSize: 13,
  },
  stepDetail: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
});
