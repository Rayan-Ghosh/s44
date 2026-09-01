import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";

export interface AiScanBannerProps {
  isAnalyzing: boolean;
  onAnalysisComplete?: () => void;
  style?: ViewStyle;
}

const SCAN_STEPS = [
  { icon: "search-outline", label: "Inspecting transaction details & metadata" },
  { icon: "finger-print-outline", label: "Checking behavioral & recipient patterns" },
  { icon: "shield-checkmark-outline", label: "Synthesizing multi-layer risk models" },
];

export const AiScanBanner: React.FC<AiScanBannerProps> = ({
  isAnalyzing,
  onAnalysisComplete,
  style,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(!isAnalyzing);

  // Animations
  const scanSweep = useRef(new Animated.Value(0)).current;
  const stepOpacity = useRef(new Animated.Value(1)).current;
  const pulseGlow = useRef(new Animated.Value(0.4)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isAnalyzing) {
      setIsComplete(true);
      return;
    }

    setIsComplete(false);
    setCurrentStepIndex(0);

    // Continuous subtle glowing pulse
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseGlow, {
          toValue: 1,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulseGlow, {
          toValue: 0.4,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );
    pulseLoop.start();

    // Laser scan sweep animation
    const sweepLoop = Animated.loop(
      Animated.timing(scanSweep, {
        toValue: 1,
        duration: 750,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: false,
      })
    );
    sweepLoop.start();

    // Step progression (3 steps of ~380ms each = ~1140ms total)
    const step1Timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(stepOpacity, { toValue: 0, duration: 100, useNativeDriver: false }),
        Animated.timing(stepOpacity, { toValue: 1, duration: 150, useNativeDriver: false }),
      ]).start();
      setCurrentStepIndex(1);
    }, 380);

    const step2Timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(stepOpacity, { toValue: 0, duration: 100, useNativeDriver: false }),
        Animated.timing(stepOpacity, { toValue: 1, duration: 150, useNativeDriver: false }),
      ]).start();
      setCurrentStepIndex(2);
    }, 760);

    const completeTimer = setTimeout(() => {
      setIsComplete(true);
      sweepLoop.stop();
      pulseLoop.stop();
      if (onAnalysisComplete) {
        onAnalysisComplete();
      }
    }, 1180);

    return () => {
      clearTimeout(step1Timer);
      clearTimeout(step2Timer);
      clearTimeout(completeTimer);
      sweepLoop.stop();
      pulseLoop.stop();
    };
  }, [isAnalyzing, onAnalysisComplete, scanSweep, pulseGlow, stepOpacity]);

  if (!isAnalyzing && isComplete) {
    return null;
  }

  const currentStep = SCAN_STEPS[currentStepIndex] || SCAN_STEPS[0];

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }, style]}>
      {/* Top Header Row */}
      <View style={styles.topRow}>
        <View style={styles.badgeRow}>
          <Animated.View
            style={[
              styles.liveIndicator,
              {
                opacity: pulseGlow,
                transform: [
                  {
                    scale: pulseGlow.interpolate({
                      inputRange: [0.4, 1],
                      outputRange: [0.85, 1.15],
                    }),
                  },
                ],
              },
            ]}
          />
          <Text style={styles.badgeText}>AI RISK ANALYSIS IN PROGRESS</Text>
        </View>
        <Text style={styles.stepProgressText}>
          {currentStepIndex + 1}/{SCAN_STEPS.length}
        </Text>
      </View>

      {/* Step Description */}
      <Animated.View style={[styles.stepRow, { opacity: stepOpacity }]}>
        <Ionicons name={currentStep.icon as any} size={14} color={colors.brand} style={styles.stepIcon} />
        <Text style={styles.stepLabel}>{currentStep.label}...</Text>
      </Animated.View>

      {/* Scanning Beam Track */}
      <View style={styles.scanTrack}>
        <Animated.View
          style={[
            styles.scanBeam,
            {
              left: scanSweep.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "80%"],
              }),
              opacity: pulseGlow.interpolate({
                inputRange: [0.4, 1],
                outputRange: [0.6, 1],
              }),
            },
          ]}
        />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(0, 102, 204, 0.06)",
    borderColor: "rgba(0, 102, 204, 0.25)",
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveIndicator: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.brand,
  },
  badgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: "800",
    color: colors.brand,
    letterSpacing: 0.6,
  },
  stepProgressText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: "700",
    color: colors.brand,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 3,
  },
  stepIcon: {
    marginRight: 6,
  },
  stepLabel: {
    ...typography.small,
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  scanTrack: {
    height: 2,
    backgroundColor: "rgba(0, 102, 204, 0.15)",
    borderRadius: 1,
    marginTop: 6,
    overflow: "hidden",
    position: "relative",
  },
  scanBeam: {
    width: "25%",
    height: "100%",
    backgroundColor: colors.brand,
    borderRadius: 1,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
  },
});
