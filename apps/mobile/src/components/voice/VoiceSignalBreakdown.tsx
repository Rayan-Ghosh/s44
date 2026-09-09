import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { StatusBadge } from "../common/StatusBadge";
import {
  CombinedVoiceAnalysis,
  AcousticAnalysis,
  safeNormalizeVoiceAnalysis,
} from "../../types/voice";

export interface VoiceSignalBreakdownProps {
  analysis?: CombinedVoiceAnalysis | null;
  showSourceTag?: boolean;
  style?: ViewStyle;
}

const getRiskColor = (level?: string | null) => {
  if (level === "HIGH") return colors.threat;
  if (level === "MEDIUM") return colors.caution;
  return colors.safe;
};

export const getAcousticDisplay = (acoustic: AcousticAnalysis | null) => {
  const status = acoustic?.status || "unavailable";
  const hasValidScore =
    status === "available" &&
    typeof acoustic?.riskScore === "number" &&
    !Number.isNaN(acoustic.riskScore);

  if (hasValidScore) {
    return {
      isAvailable: true,
      score: acoustic!.riskScore,
      level: acoustic!.riskLevel || "LOW",
      statusLabel: acoustic!.riskLevel || "LOW",
      badgeStatus: (acoustic!.riskLevel === "HIGH"
        ? "high"
        : acoustic!.riskLevel === "MEDIUM"
        ? "medium"
        : "low") as "high" | "medium" | "low",
      subText: "Vocal stress and synthetic deepfake detection",
    };
  }

  if (status === "pending") {
    return {
      isAvailable: false,
      score: null,
      level: null,
      statusLabel: "PENDING",
      badgeStatus: "pending" as const,
      subText: "Acoustic analysis in progress...",
    };
  }

  if (status === "failed") {
    return {
      isAvailable: false,
      score: null,
      level: null,
      statusLabel: "FAILED",
      badgeStatus: "high" as const,
      subText: acoustic?.errorMessage || "Acoustic analysis failed to process audio",
    };
  }

  return {
    isAvailable: false,
    score: null,
    level: null,
    statusLabel: "UNAVAILABLE",
    badgeStatus: "neutral" as const,
    subText: acoustic?.reason
      ? `Acoustic analysis unavailable (${acoustic.reason})`
      : "Acoustic analysis unavailable (backend not implemented)",
  };
};

export const VoiceSignalBreakdown: React.FC<VoiceSignalBreakdownProps> = ({
  analysis,
  showSourceTag = true,
  style,
}) => {
  const safeAnalysis = safeNormalizeVoiceAnalysis(analysis);
  const acousticInfo = getAcousticDisplay(safeAnalysis.acousticAnalysis);
  const hasAcoustic = acousticInfo.isAvailable;

  return (
    <View style={[styles.container, style]}>
      {showSourceTag && (
        <View style={styles.sourceTagRow}>
          <Ionicons
            name={hasAcoustic ? "git-merge-outline" : "document-text-outline"}
            size={13}
            color={hasAcoustic ? colors.brand : colors.textSecondary}
          />
          <Text style={styles.sourceTagText}>
            {hasAcoustic
              ? "Combined Multi-Modal Voice Risk"
              : "Transcript-based score · Acoustic analysis unavailable"}
          </Text>
        </View>
      )}

      <View style={styles.breakdownCard}>
        <View style={styles.breakdownHeader}>
          <View style={styles.breakdownTitleRow}>
            <Ionicons name="analytics-outline" size={15} color={colors.textMuted} />
            <Text style={styles.breakdownTitle}>SIGNAL BREAKDOWN</Text>
          </View>
          <StatusBadge
            label={hasAcoustic ? "MULTI-MODAL" : "TRANSCRIPT ONLY"}
            status={hasAcoustic ? "low" : "medium"}
            dot={false}
          />
        </View>

        {/* Transcript Risk Stream */}
        <View style={styles.streamRow}>
          <View style={styles.streamIconContainer}>
            <Ionicons name="chatbubbles-outline" size={18} color={colors.brand} />
          </View>
          <View style={styles.streamDetails}>
            <View style={styles.streamTopLine}>
              <Text style={styles.streamName}>Transcript Analysis</Text>
              <Text
                style={[
                  styles.streamScore,
                  { color: getRiskColor(safeAnalysis.transcriptAnalysis.riskLevel) },
                ]}
              >
                {safeAnalysis.transcriptAnalysis.riskScore} / 100 ·{" "}
                {safeAnalysis.transcriptAnalysis.riskLevel}
              </Text>
            </View>
            <Text style={styles.streamSub}>
              {!hasAcoustic
                ? "Primary active signal (linguistic scam patterns)"
                : "Linguistic and conversation intent NLP"}
            </Text>
          </View>
        </View>

        <View style={styles.breakdownDivider} />

        {/* Acoustic Risk Stream */}
        <View style={styles.streamRow}>
          <View style={styles.streamIconContainer}>
            <Ionicons
              name={hasAcoustic ? "mic" : "mic-off-outline"}
              size={18}
              color={hasAcoustic ? colors.brand : colors.textMuted}
            />
          </View>
          <View style={styles.streamDetails}>
            <View style={styles.streamTopLine}>
              <Text style={styles.streamName}>Acoustic Analysis</Text>
              {hasAcoustic && typeof acousticInfo.score === "number" ? (
                <Text
                  style={[
                    styles.streamScore,
                    { color: getRiskColor(acousticInfo.level) },
                  ]}
                >
                  {acousticInfo.score} / 100 · {acousticInfo.level}
                </Text>
              ) : (
                <StatusBadge
                  label={acousticInfo.statusLabel}
                  status={acousticInfo.badgeStatus}
                  dot={false}
                />
              )}
            </View>
            <Text style={styles.streamSub}>{acousticInfo.subText}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  sourceTagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  sourceTagText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  breakdownCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.sm,
    ...shadows.sm,
  },
  breakdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  breakdownTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  breakdownTitle: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  streamRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  streamIconContainer: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  streamDetails: {
    flex: 1,
  },
  streamTopLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  streamName: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 13,
  },
  streamScore: {
    ...typography.smallSemibold,
    fontSize: 12,
  },
  streamSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    fontSize: 11,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.xs,
  },
});
