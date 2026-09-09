import React, { useState, useEffect } from "react";
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
import { VoiceSignalBreakdown } from "../components/voice/VoiceSignalBreakdown";
import { Button } from "../components/common/Button";
import { useSecurity } from "../context/SecurityContext";
import {
  isCallGuardAvailable,
  startCallDetection,
  stopCallDetection,
  subscribeToCallGuardEvents,
  CallGuardEvent,
} from "../services/call-guard";
import { VoiceService } from "../services/voice-service";
import { safeNormalizeVoiceAnalysis } from "../types/voice";

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

  const analysis = safeNormalizeVoiceAnalysis(
    activeCall.analysis || {
      riskScore: activeCall.riskScore,
      riskLevel: activeCall.riskLevel,
      transcriptAnalysis: {
        status: "available",
        riskScore: activeCall.riskScore,
        riskLevel: activeCall.riskLevel,
        detectedPatterns: activeCall.detectedPatterns,
        matchedPhrases: [],
      },
      acousticAnalysis: null,
    }
  );

  const [isRealDetectionActive, setIsRealDetectionActive] = useState(false);
  const [realDetectionError, setRealDetectionError] = useState<string | null>(null);
  const [isTogglingDetection, setIsTogglingDetection] = useState(false);
  const [nativeCaptureStatus, setNativeCaptureStatus] = useState<
    "idle" | "capturing" | "unavailable" | "error"
  >("idle");
  const [hasReceivedAudioBuffer, setHasReceivedAudioBuffer] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToCallGuardEvents((event: CallGuardEvent) => {
      switch (event.type) {
        case "call_started":
        case "audio_capture_started":
          setIsRealDetectionActive(true);
          setNativeCaptureStatus("capturing");
          setRealDetectionError(null);
          break;
        case "call_stopped":
        case "audio_capture_stopped":
          setIsRealDetectionActive(false);
          setNativeCaptureStatus("idle");
          setHasReceivedAudioBuffer(false);
          break;
        case "audio_capture_unavailable":
          setIsRealDetectionActive(false);
          setNativeCaptureStatus("unavailable");
          setHasReceivedAudioBuffer(false);
          setRealDetectionError(event.error || "Native audio capture is unavailable on this device.");
          break;
        case "audio_capture_error":
          setIsRealDetectionActive(false);
          setNativeCaptureStatus("error");
          setHasReceivedAudioBuffer(false);
          setRealDetectionError(event.error || "An error occurred during native audio capture.");
          break;
        case "audio_buffer_ready":
          setHasReceivedAudioBuffer(true);
          VoiceService.ingestAudioBuffer({
            sessionId: event.sessionId,
            timestamp: event.timestamp,
            bufferSize: event.bufferSize,
            sampleRateHz: event.sampleRateHz,
            channelCount: event.channelCount,
            audioFormat: event.audioFormat,
            durationMs: event.durationMs,
            source: event.source,
          });
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleToggleRealDetection = async () => {
    setIsTogglingDetection(true);
    setRealDetectionError(null);
    const result = isRealDetectionActive ? await stopCallDetection() : await startCallDetection();
    if (result.success) {
      setIsRealDetectionActive((prev) => !prev);
    } else {
      setRealDetectionError(result.error || "Something went wrong.");
    }
    setIsTogglingDetection(false);
  };

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
        {/* Real live call detection — genuine mic + on-device speech
            recognition + the real backend classifier. Keep this app open
            on screen while a call plays nearby for this to work; see
            docs/SECURITY.md and telemetry/LiveCallAudioService.kt for why
            it must be foregrounded rather than fully automatic. */}
        <View style={styles.realDetectionCard}>
          <View style={styles.realDetectionHeader}>
            <Ionicons
              name={isRealDetectionActive ? "radio" : "mic-outline"}
              size={20}
              color={isRealDetectionActive ? colors.threat : colors.textPrimary}
            />
            <Text style={styles.realDetectionTitle}>Real Live Call Detection</Text>
          </View>
          <Text style={styles.realDetectionDesc}>
            {isCallGuardAvailable()
              ? "Uses your phone's real microphone, on-device speech recognition, and the real fraud classifier — not a script. Keep this screen open while a call plays nearby."
              : "Only available on Android — this build can't access the microphone this way."}
          </Text>
          {nativeCaptureStatus === "capturing" && (
            <View style={styles.nativeActiveIndicator}>
              <View style={styles.liveIndicator} />
              <Text style={styles.nativeActiveText}>
                {hasReceivedAudioBuffer
                  ? "Native speech capture active · Audio buffer received"
                  : "Native speech capture active"}
              </Text>
            </View>
          )}
          {realDetectionError && (
            <Text style={styles.realDetectionErrorText}>{realDetectionError}</Text>
          )}
          {/* Always rendered — never disappears — even when the native
              module isn't present (web preview, Expo Go, or a build that
              predates it). Disabled + relabeled instead of hidden, so the
              control is never mistaken for a removed feature. Tapping it
              is still the ONLY way real listening ever starts. */}
          <Button
            label={
              !isCallGuardAvailable()
                ? "Not Available On This Build"
                : isTogglingDetection
                ? "Please wait…"
                : isRealDetectionActive
                ? "Hang Up"
                : "Detect Current Call"
            }
            onPress={handleToggleRealDetection}
            variant={isRealDetectionActive ? "destructive" : "primary"}
            size="md"
            icon={isRealDetectionActive ? "call-outline" : "mic"}
            disabled={isTogglingDetection || !isCallGuardAvailable()}
            style={{ marginTop: spacing.sm, width: "100%" }}
          />
        </View>

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

        {/* Active Risk Score & Multi-Modal Analysis Breakdown */}
        {isSimulatingCall && (
          <View style={styles.riskSection}>
            <RiskScoreBadge
              score={analysis.riskScore}
              level={analysis.riskLevel}
              size="lg"
            />
            <VoiceSignalBreakdown analysis={analysis} />
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
  realDetectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  realDetectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  realDetectionTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 15,
  },
  realDetectionDesc: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  realDetectionErrorText: {
    ...typography.small,
    color: colors.threat,
    marginTop: spacing.xs,
  },
  nativeActiveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  nativeActiveText: {
    ...typography.caption,
    color: colors.threat,
    fontWeight: "700",
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
