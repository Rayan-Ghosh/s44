import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { TranscriptLine } from "../../types/voice";

interface CallTranscriptViewProps {
  transcript: TranscriptLine[];
}

export const CallTranscriptView: React.FC<CallTranscriptViewProps> = ({ transcript }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>LIVE CONVERSATION</Text>
      <View style={styles.box}>
        {transcript.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Monitoring call audio for social engineering patterns...</Text>
          </View>
        ) : (
          transcript.map((line) => {
            const isCaller = line.speaker === "caller";
            return (
              <View
                key={line.id}
                style={[
                  styles.bubbleRow,
                  isCaller ? styles.callerRow : styles.userRow,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    isCaller ? styles.callerBubble : styles.userBubble,
                  ]}
                >
                  <Text style={[styles.speakerLabel, isCaller ? styles.callerLabel : styles.userLabel]}>
                    {isCaller ? "CALLER" : "CUSTOMER"}
                  </Text>
                  <Text style={[styles.transcriptText, isCaller ? styles.callerText : styles.userText]}>
                    "{line.text}"
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
  },
  sectionHeader: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    letterSpacing: 0.8,
  },
  box: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  emptyState: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: "italic",
    textAlign: "center",
  },
  bubbleRow: {
    marginVertical: spacing.xs,
    width: "100%",
  },
  callerRow: {
    alignItems: "flex-start",
  },
  userRow: {
    alignItems: "flex-end",
  },
  bubble: {
    maxWidth: "88%",
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  callerBubble: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radii.xs,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  userBubble: {
    backgroundColor: colors.surface,
    borderTopRightRadius: radii.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speakerLabel: {
    ...typography.caption,
    marginBottom: 2,
    fontWeight: "700",
  },
  callerLabel: {
    color: colors.threat,
  },
  userLabel: {
    color: colors.textPrimary,
  },
  transcriptText: {
    ...typography.body,
    lineHeight: 20,
  },
  callerText: {
    color: colors.textPrimary,
  },
  userText: {
    color: colors.textPrimary,
  },
});
