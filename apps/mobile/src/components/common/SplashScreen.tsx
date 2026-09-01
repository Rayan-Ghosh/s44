import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { AvaranSvgIcon } from "./AvaranSvgIcon";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface SplashScreenProps {
  onFinish?: () => void;
  minDurationMs?: number;
}

const STATUS_MESSAGES = [
  "INITIALIZING SENTINEL CORE...",
  "CALIBRATING RISK SENSORS...",
  "VERIFYING TRANSACTION ENCLAVE...",
  "AVARAN SHIELD ACTIVE",
];

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  minDurationMs = 2400,
}) => {
  // Animation Values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.86)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringScale1 = useRef(new Animated.Value(0.9)).current;
  const ringOpacity1 = useRef(new Animated.Value(0)).current;
  const ringScale2 = useRef(new Animated.Value(0.85)).current;
  const ringOpacity2 = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const screenFadeOut = useRef(new Animated.Value(1)).current;

  const [statusIndex, setStatusIndex] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    // 1. Entrance animation (Logo fade in + smooth spring scale)
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Ambient breathing loop on the logo
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.04,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    // 3. Ambient pulsing halo rings around the logo
    const ring1Loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ringOpacity1, {
            toValue: 0.35,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity1, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(ringScale1, {
          toValue: 1.45,
          duration: 1600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    const ring2Loop = Animated.loop(
      Animated.sequence([
        Animated.delay(400),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(ringOpacity2, {
              toValue: 0.25,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(ringOpacity2, {
              toValue: 0,
              duration: 1000,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(ringScale2, {
            toValue: 1.6,
            duration: 1600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    ring1Loop.start();
    ring2Loop.start();

    // 4. Progress bar animation from 0% to 100%
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: minDurationMs - 400,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start();

    // Cycle status messages
    const stepTime = (minDurationMs - 600) / STATUS_MESSAGES.length;
    const interval = setInterval(() => {
      setStatusIndex((prev) => {
        if (prev < STATUS_MESSAGES.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, stepTime);

    // 5. Smooth exit transition after minDurationMs
    const timer = setTimeout(() => {
      Animated.timing(screenFadeOut, {
        toValue: 0,
        duration: 450,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setIsFinished(true);
        pulseLoop.stop();
        ring1Loop.stop();
        ring2Loop.stop();
        if (onFinish) {
          onFinish();
        }
      });
    }, minDurationMs);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
      pulseLoop.stop();
      ring1Loop.stop();
      ring2Loop.stop();
    };
  }, [minDurationMs]);

  if (isFinished) {
    return null;
  }

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: screenFadeOut,
        },
      ]}
      pointerEvents="auto"
    >
      {/* Background radial accent glow */}
      <View style={styles.glowBackdrop} />

      <View style={styles.contentCenter}>
        {/* Animated Rings & Logo Emblem */}
        <View style={styles.logoWrapper}>
          {/* Pulsing ring 1 */}
          <Animated.View
            style={[
              styles.pulseRing,
              {
                opacity: ringOpacity1,
                transform: [{ scale: ringScale1 }],
              },
            ]}
          />
          {/* Pulsing ring 2 */}
          <Animated.View
            style={[
              styles.pulseRing,
              styles.pulseRingSecondary,
              {
                opacity: ringOpacity2,
                transform: [{ scale: ringScale2 }],
              },
            ]}
          />

          {/* Logo Card with Entrance Scale & Ambient Pulse */}
          <Animated.View
            style={[
              styles.logoCard,
              {
                opacity: fadeAnim,
                transform: [{ scale: Animated.multiply(scaleAnim, pulseAnim) }],
              },
            ]}
          >
            <AvaranSvgIcon size={84} color={colors.textPrimary} />
          </Animated.View>
        </View>

        {/* Brand Title & Tagline */}
        <Animated.View style={[styles.titleBlock, { opacity: fadeAnim }]}>
          <Text style={styles.brandTitle}>AVARAN</Text>
          <View style={styles.badgeRow}>
            <View style={styles.liveDot} />
            <Text style={styles.brandTagline}>FRAUD DEFENSE PROTOCOL</Text>
          </View>
        </Animated.View>

        {/* Loading Progress Section */}
        <Animated.View style={[styles.loadingSection, { opacity: fadeAnim }]}>
          {/* Sleek hairline progress bar */}
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressBarWidth,
                },
              ]}
            />
          </View>

          {/* Dynamic Status Text */}
          <Text style={styles.statusText}>{STATUS_MESSAGES[statusIndex]}</Text>
        </Animated.View>
      </View>

      {/* Footer Security Badge */}
      <Animated.View style={[styles.footerBlock, { opacity: fadeAnim }]}>
        <Text style={styles.footerShieldText}>
          SECURE UPI INTERCEPTION & THREAT INTELLIGENCE
        </Text>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    backgroundColor: colors.background, // #F3F2EF
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
  },
  glowBackdrop: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: colors.surfaceSecondary,
    opacity: 0.7,
  },
  contentCenter: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    width: "100%",
    maxWidth: 420,
  },
  logoWrapper: {
    width: 170,
    height: 170,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxl,
  },
  pulseRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1.5,
    borderColor: colors.brand || "#176B5B",
  },
  pulseRingSecondary: {
    borderColor: colors.borderLight,
  },
  logoCard: {
    width: 128,
    height: 128,
    borderRadius: 36,
    backgroundColor: colors.surface,
    borderWidth: 1.2,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 6,
  },
  titleBlock: {
    alignItems: "center",
    marginBottom: spacing.xxxl,
  },
  brandTitle: {
    fontFamily: typography.brandTitle.fontFamily,
    fontSize: 26,
    fontWeight: "600",
    color: colors.textPrimary,
    letterSpacing: 8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.full,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand || "#176B5B",
  },
  brandTagline: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  loadingSection: {
    width: "78%",
    alignItems: "center",
  },
  progressTrack: {
    width: "100%",
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.divider,
    overflow: "hidden",
    marginBottom: spacing.sm,
  },
  progressBar: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: colors.brand || "#176B5B",
  },
  statusText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  footerBlock: {
    position: "absolute",
    bottom: 36,
    alignItems: "center",
  },
  footerShieldText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.9,
  },
});
