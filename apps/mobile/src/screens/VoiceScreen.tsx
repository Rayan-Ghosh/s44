import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii, shadows } from "../theme/layout";
import { Header } from "../components/common/Header";
import { CallStatusIndicator } from "../components/voice/CallStatusIndicator";
import { CallTranscriptView } from "../components/voice/CallTranscriptView";
import { FraudWarningBanner } from "../components/voice/FraudWarningBanner";
import { RiskScoreBadge } from "../components/risk/RiskScoreBadge";
import { Button } from "../components/common/Button";
import { useSecurity } from "../context/SecurityContext";

export const VoiceScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const {
    activeCall,
    isSimulatingCall,
    startCallSimulation,
    advanceCallSimulation,
    dismissCallAlert,
    endCallSimulation,
    reportCallScam,
  } = useSecurity();

  const isDisconnected = activeCall.status === "disconnected";

  return (
    <View style={styles.screen}>
      <Header
        title="VOICE SHIELD"
        showBack
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Call Status Indicator */}
        <CallStatusIndicator
          status={activeCall.status}
          caller={activeCall.caller}
          durationSec={activeCall.durationSec}
        />

        {/* Simulation Controls when Standby / Disconnected */}
        {!isSimulatingCall && (
          <View style={styles.standbyCard}>
            <View style={styles.standbyIcon}>
              <Ionicons
                name={isDisconnected ? "checkmark-circle" : "shield-checkmark"}
                size={32}
                color={colors.brand}
              />
            </View>
            <Text style={styles.standbyTitle}>
              {isDisconnected ? "Call Terminated & Logged" : "Voice Guardian Standby"}
            </Text>
            <Text style={styles.standbyDesc}>
              {isDisconnected
                ? "Incident recorded in History and Alerts inbox. Security team notified."
                : "Avaran runs on-device acoustic and linguistic NLP to detect phone scams and remote-access fraud in real time."}
            </Text>
            <Button
              label={isDisconnected ? "Simulate Another Scam Call" : "Simulate Incoming Phishing Call"}
              onPress={startCallSimulation}
              variant="primary"
              size="lg"
              icon="call"
              style={{ marginTop: spacing.md, width: "100%" }}
            />
          </View>
        )}

        {/* Live Call Analysis Controls */}
        {isSimulatingCall && (
          <View style={styles.analysisControls}>
            <View style={styles.analysisHeader}>
              <View style={styles.analysisBadge}>
                <View style={styles.liveIndicator} />
                <Text style={styles.analysisHeaderText}>LIVE CALL ANALYSIS</Text>
              </View>
              <TouchableOpacity
                onPress={advanceCallSimulation}
                style={styles.nextPhaseBtn}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Advance to next analysis phase"
              >
                <Text style={styles.nextPhaseBtnText}>Advance Analysis →</Text>
              </TouchableOpacity>
            </View>

            {/* Threat Indicators as chips */}
            {activeCall.detectedPatterns.length > 0 && (
              <View style={styles.threatChips}>
                {activeCall.detectedPatterns.map((pattern) => (
                  <View key={pattern} style={styles.threatChip}>
                    <Text style={styles.threatChipText}>
                      {pattern.replace(/_/g, " ")}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Active Risk Score Badge */}
        {isSimulatingCall && (
          <View style={styles.riskSection}>
            <RiskScoreBadge
              score={activeCall.riskScore}
              level={activeCall.riskLevel}
              size="lg"
            />
          </View>
        )}

        {/* Fraud Warning Banner */}
        {isSimulatingCall && activeCall.alert.triggered && (
          <FraudWarningBanner
            alert={activeCall.alert}
            detectedPatterns={activeCall.detectedPatterns}
            onDismiss={dismissCallAlert}
            onEndCall={endCallSimulation}
            onReportScam={reportCallScam}
          />
        )}

        {/* Live Conversation Transcript */}
        {isSimulatingCall && (
          <CallTranscriptView transcript={activeCall.transcript} />
        )}

        {/* End Call / Report Actions if Alert is dismissed but call is still active */}
        {isSimulatingCall && !activeCall.alert.triggered && (
          <View style={styles.manualActions}>
            <Button
              label="End Call"
              onPress={endCallSimulation}
              variant="destructive"
              size="md"
              icon="call-outline"
              style={{ marginBottom: spacing.sm }}
            />
            <Button
              label="Report Suspicious Call"
              onPress={reportCallScam}
              variant="secondary"
              size="md"
              icon="shield-outline"
            />
          </View>
        )}

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
  },
  standbyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    marginVertical: spacing.md,
    ...shadows.sm,
  },
  standbyIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  standbyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: "center",
  },
  standbyDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
    lineHeight: 22,
  },
  analysisControls: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: spacing.xs,
    ...shadows.sm,
  },
  analysisHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  analysisBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  liveIndicator: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.threat,
    marginRight: spacing.xs,
  },
  analysisHeaderText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "800",
  },
  nextPhaseBtn: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  nextPhaseBtnText: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
  },
  threatChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing.sm,
  },
  threatChip: {
    backgroundColor: colors.chipBg,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  threatChipText: {
    ...typography.caption,
    color: colors.chipText,
    fontSize: 10,
    textTransform: "none",
    fontWeight: "700",
  },
  riskSection: {
    marginVertical: spacing.sm,
  },
  manualActions: {
    marginTop: spacing.lg,
  },
});
