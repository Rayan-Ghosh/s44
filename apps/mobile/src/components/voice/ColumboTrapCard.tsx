import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";

export interface ColumboTrapCardProps {
  prompt: string;
  scamCategories?: string[];
  languageDetected?: string;
  onCallerHungUp?: () => void;
  style?: ViewStyle;
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  hi: "Hindi (हिंदी)",
  bn: "Bengali (বাংলা)",
  te: "Telugu (తెలుగు)",
  ta: "Tamil (தமிழ்)",
  mr: "Marathi (मराठी)",
};

export const ColumboTrapCard: React.FC<ColumboTrapCardProps> = ({
  prompt,
  scamCategories = [],
  languageDetected = "en",
  onCallerHungUp,
  style,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  const primaryCategory = scamCategories[0] || "COERCIVE_IMPERSONATION";
  const formattedCategory = primaryCategory.replace(/_/g, " ").toUpperCase();
  const langLabel = LANGUAGE_LABELS[languageDetected] || languageDetected.toUpperCase();

  return (
    <View style={[styles.card, style]}>
      {/* Header Banner */}
      <View style={styles.header}>
        <View style={styles.iconBadge}>
          <Ionicons name="chatbox-ellipses" size={18} color={colors.brand} />
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>COLUMBO COUNTER-INQUIRY</Text>
          <Text style={styles.headerSubtitle}>
            Adversarial prompt designed to break scammer script
          </Text>
        </View>
      </View>

      {/* Tags row */}
      <View style={styles.tagsRow}>
        <View style={styles.tagBadge}>
          <Ionicons name="warning-outline" size={11} color={colors.threat} />
          <Text style={styles.tagTextThreat}>{formattedCategory}</Text>
        </View>
        <View style={styles.tagBadgeNeutral}>
          <Ionicons name="language-outline" size={11} color={colors.textSecondary} />
          <Text style={styles.tagTextNeutral}>{langLabel}</Text>
        </View>
      </View>

      {/* Quote / Question Box */}
      <View style={styles.quoteBox}>
        <View style={styles.quoteBar} />
        <View style={styles.quoteContent}>
          <Text style={styles.quoteLabel}>READ THIS ALOUD TO CALLER:</Text>
          <Text style={styles.quoteText}>{`"${prompt}"`}</Text>
        </View>
      </View>

      {/* Explanatory note */}
      <View style={styles.adviceRow}>
        <Ionicons name="shield-checkmark" size={14} color={colors.brand} />
        <Text style={styles.adviceText}>
          Genuine officials will answer calmly without hesitation. Scammers cannot provide authentic case records and usually hang up.
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.copyButton, isCopied && styles.copyButtonActive]}
          onPress={handleCopy}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Copy counter-question"
        >
          <Ionicons
            name={isCopied ? "checkmark-circle" : "copy-outline"}
            size={16}
            color={isCopied ? colors.brand : colors.textPrimary}
          />
          <Text style={[styles.copyButtonText, isCopied && styles.copyButtonTextActive]}>
            {isCopied ? "Copied to Clipboard" : "Copy Question"}
          </Text>
        </TouchableOpacity>

        {onCallerHungUp && (
          <TouchableOpacity
            style={styles.hungUpButton}
            onPress={onCallerHungUp}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Caller hung up"
          >
            <Ionicons name="call-outline" size={15} color={colors.threat} />
            <Text style={styles.hungUpButtonText}>Caller Hung Up</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.brandBorder,
    padding: spacing.md,
    marginVertical: spacing.sm,
    ...shadows.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: colors.brandSurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.brandBorder,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    ...typography.caption,
    fontWeight: "800",
    color: colors.brandDark,
    letterSpacing: 0.8,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  tagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.threatSurface,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.threatBorder,
  },
  tagTextThreat: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: "700",
    color: colors.threat,
    letterSpacing: 0.4,
  },
  tagBadgeNeutral: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  tagTextNeutral: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  quoteBox: {
    flexDirection: "row",
    backgroundColor: colors.brandSurface,
    borderRadius: radii.lg,
    padding: spacing.sm + 2,
    marginVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.brandBorder,
  },
  quoteBar: {
    width: 3,
    backgroundColor: colors.brand,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  quoteContent: {
    flex: 1,
  },
  quoteLabel: {
    ...typography.caption,
    fontSize: 9,
    fontWeight: "800",
    color: colors.brandDark,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  quoteText: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    fontStyle: "italic",
  },
  adviceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    marginVertical: spacing.xs,
    paddingHorizontal: 2,
  },
  adviceText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.xs + 2,
  },
  copyButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.surfaceSecondary,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyButtonActive: {
    backgroundColor: colors.brandSurface,
    borderColor: colors.brandBorder,
  },
  copyButtonText: {
    ...typography.caption,
    fontWeight: "700",
    fontSize: 11,
    color: colors.textPrimary,
  },
  copyButtonTextActive: {
    color: colors.brandDark,
  },
  hungUpButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.threatBorder,
    backgroundColor: colors.threatSurface,
  },
  hungUpButtonText: {
    ...typography.caption,
    fontWeight: "700",
    fontSize: 11,
    color: colors.threat,
  },
});
