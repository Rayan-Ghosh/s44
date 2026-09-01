import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from "react-native";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/layout";
import { AvaranSvgIcon } from "./AvaranSvgIcon";
import { AvaranBrandName } from "./AvaranBrandName";

interface PostLoginSplashScreenProps {
  onFinish?: () => void;
  durationMs?: number;
}

export const PostLoginSplashScreen: React.FC<PostLoginSplashScreenProps> = ({
  onFinish,
  durationMs = 1900,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const screenFadeOut = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    // 1. Entrance animation (fade-in + smooth spring scale-up)
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 45,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Subtle ambient pulse on logo
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.03,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    // 3. Minimal progress bar filling
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: durationMs - 350,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start();

    // 4. Smooth fade-out exit transition
    const timer = setTimeout(() => {
      Animated.timing(screenFadeOut, {
        toValue: 0,
        duration: 380,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setIsDone(true);
        pulseLoop.stop();
        if (onFinish) {
          onFinish();
        }
      });
    }, durationMs);

    return () => {
      clearTimeout(timer);
      pulseLoop.stop();
    };
  }, [durationMs]);

  if (isDone) {
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
      <View style={styles.contentCenter}>
        {/* Animated Logo Emblem */}
        <Animated.View
          style={[
            styles.logoCard,
            {
              opacity: fadeAnim,
              transform: [{ scale: Animated.multiply(scaleAnim, pulseAnim) }],
            },
          ]}
        >
          <AvaranSvgIcon size={76} color={colors.textPrimary} />
        </Animated.View>

        {/* Cinzel AVARAN Typography */}
        <Animated.View style={[styles.brandRow, { opacity: fadeAnim }]}>
          <AvaranBrandName size={24} letterSpacing={6} />
        </Animated.View>

        {/* Minimal Progress Indicator */}
        <Animated.View style={[styles.indicatorContainer, { opacity: fadeAnim }]}>
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
        </Animated.View>
      </View>
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
  contentCenter: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 380,
  },
  logoCard: {
    width: 118,
    height: 118,
    borderRadius: 32,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 4,
    marginBottom: spacing.xl,
  },
  brandRow: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  indicatorContainer: {
    width: "60%",
    maxWidth: 180,
    alignItems: "center",
  },
  progressTrack: {
    width: "100%",
    height: 2.5,
    borderRadius: 2,
    backgroundColor: colors.divider,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: colors.brand || "#176B5B",
  },
});
