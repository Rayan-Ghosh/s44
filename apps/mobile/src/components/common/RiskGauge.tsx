import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";

interface RiskGaugeProps {
  score: number; // 0 - 100
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  /**
   * Increment this value to explicitly restart the animation from 0,
   * even when `score` has not changed. Tied to the post-login splash
   * clearing in HomeScreen.
   */
  animationTrigger?: number;
  /**
   * When true, the risk status badge and explanation text animate in
   * as a staggered reveal AFTER the circular gauge completes.
   * Defaults to false so the Payments page is completely unchanged.
   */
  enableRevealAnimation?: boolean;
}

// ─── Animation timing constants ────────────────────────────────────────────
const GAUGE_DURATION = 1350;    // circular stroke + number count (ms)
const BADGE_DELAY    = 1100;    // badge reveal starts after 81% of gauge (ms)
const INFO_DELAY     = 1300;    // explanation reveal starts after badge (ms)
const REVEAL_DURATION = 280;    // duration of each reveal fade-in (ms)
// ───────────────────────────────────────────────────────────────────────────

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  score,
  riskLevel,
  showLabel = true,
  size = "md",
  animationTrigger = 0,
  enableRevealAnimation = false,
}) => {
  // Color is derived solely from the authoritative `riskLevel` prop — never
  // re-derived from `score` independently. The two used to be OR'd together
  // (`score >= 61 || riskLevel === "HIGH"`), which meant a stale/differently
  // sourced `score` could paint the gauge red even when the trusted
  // `riskLevel` said otherwise (or vice versa). See utils/risk-scoring.ts.
  const getRiskColor = () => {
    if (riskLevel === "HIGH") return colors.threat;
    if (riskLevel === "MEDIUM") return colors.caution;
    return colors.safe;
  };

  const clampedScore = Math.max(0, Math.min(100, score));
  const activeColor = getRiskColor();

  // Circular gauge dimensions
  const dims =
    size === "sm"
      ? { outer: 80, stroke: 6, fontSize: 22, labelSize: 9 }
      : size === "lg"
      ? { outer: 140, stroke: 10, fontSize: 36, labelSize: 12 }
      : { outer: 110, stroke: 8, fontSize: 28, labelSize: 11 };

  const radius = (dims.outer - dims.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = dims.outer / 2;

  // ── Gauge animation (circular stroke + synchronized number) ───────────
  const animValue = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(0);
  const [dashOffset, setDashOffset] = useState(circumference);

  // ── Reveal animations (badge + explanation) ───────────────────────────
  const initialReveal = enableRevealAnimation ? 0 : 1;
  const badgeOpacity    = useRef(new Animated.Value(initialReveal)).current;
  const badgeTranslateY = useRef(new Animated.Value(enableRevealAnimation ? 8 : 0)).current;
  const infoOpacity     = useRef(new Animated.Value(initialReveal)).current;
  const infoTranslateY  = useRef(new Animated.Value(enableRevealAnimation ? 8 : 0)).current;

  // Track previous animation inputs to prevent duplicate animations
  const lastScoreRef = useRef<number | null>(null);
  const lastTriggerRef = useRef<number>(animationTrigger);

  useEffect(() => {
    const isNewTrigger = lastTriggerRef.current !== animationTrigger;
    const isNewScore = lastScoreRef.current !== clampedScore;

    lastTriggerRef.current = animationTrigger;
    lastScoreRef.current = clampedScore;

    // If score and trigger haven't changed, keep gauge at current position
    if (!isNewTrigger && !isNewScore && lastScoreRef.current !== null) {
      animValue.setValue(clampedScore);
      setDisplayScore(clampedScore);
      setDashOffset(circumference - (clampedScore / 100) * circumference);
      return;
    }

    // ── 1. Reset gauge ──────────────────────────────────────────────────
    animValue.setValue(0);
    setDisplayScore(0);
    setDashOffset(circumference);

    // ── 2. Reset reveal elements (only when reveal mode is on) ──────────
    if (enableRevealAnimation) {
      badgeOpacity.setValue(0);
      badgeTranslateY.setValue(8);
      infoOpacity.setValue(0);
      infoTranslateY.setValue(8);
    } else {
      badgeOpacity.setValue(1);
      badgeTranslateY.setValue(0);
      infoOpacity.setValue(1);
      infoTranslateY.setValue(0);
    }

    // ── 3. Gauge animation (stroke + synchronized number) ───────────────
    const listenerId = animValue.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
      setDashOffset(circumference - (value / 100) * circumference);
    });

    const gaugeAnim = Animated.timing(animValue, {
      toValue: clampedScore,
      duration: GAUGE_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    gaugeAnim.start();

    // ── 4. Staggered reveal (badge then explanation) ─────────────────────
    let badgeAnim: Animated.CompositeAnimation | null = null;
    let infoAnim: Animated.CompositeAnimation | null = null;

    if (enableRevealAnimation) {
      const revealEasing = Easing.out(Easing.cubic);

      badgeAnim = Animated.sequence([
        Animated.delay(BADGE_DELAY),
        Animated.parallel([
          Animated.timing(badgeOpacity, {
            toValue: 1,
            duration: REVEAL_DURATION,
            easing: revealEasing,
            useNativeDriver: false,
          }),
          Animated.timing(badgeTranslateY, {
            toValue: 0,
            duration: REVEAL_DURATION,
            easing: revealEasing,
            useNativeDriver: false,
          }),
        ]),
      ]);

      infoAnim = Animated.sequence([
        Animated.delay(INFO_DELAY),
        Animated.parallel([
          Animated.timing(infoOpacity, {
            toValue: 1,
            duration: REVEAL_DURATION,
            easing: revealEasing,
            useNativeDriver: false,
          }),
          Animated.timing(infoTranslateY, {
            toValue: 0,
            duration: REVEAL_DURATION,
            easing: revealEasing,
            useNativeDriver: false,
          }),
        ]),
      ]);

      badgeAnim.start();
      infoAnim.start();
    }

    return () => {
      animValue.removeListener(listenerId);
      gaugeAnim.stop();
      badgeAnim?.stop();
      infoAnim?.stop();
    };
  }, [clampedScore, circumference, animationTrigger]);

  return (
    <View style={styles.container}>
      <View style={styles.gaugeRow}>
        {/* Circular SVG gauge */}
        <View style={[styles.svgContainer, { width: dims.outer, height: dims.outer }]}>
          <View style={{ transform: [{ rotate: "-90deg" }] }}>
            <Svg width={dims.outer} height={dims.outer} viewBox={`0 0 ${dims.outer} ${dims.outer}`}>
              {/* Background track */}
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={colors.borderLight}
                strokeWidth={dims.stroke}
                fill="none"
              />
              {/* Animated Progress arc */}
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={activeColor}
                strokeWidth={dims.stroke}
                fill="none"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
              />
            </Svg>
          </View>
          {/* Score text in center (synchronized with animation) */}
          <View style={styles.centerLabel}>
            <Text style={[styles.scoreNumber, { color: activeColor, fontSize: dims.fontSize }]}>
              {displayScore}
            </Text>
            <Text style={[styles.scoreScale, { fontSize: dims.labelSize - 1 }]}>/100</Text>
          </View>
        </View>

        {/* Risk level badge and explanation */}
        {showLabel && (
          <View style={styles.infoCol}>
            {/* Badge — fades in with upward motion after gauge fills */}
            <Animated.View
              style={{
                opacity: badgeOpacity,
                transform: [{ translateY: badgeTranslateY }],
              }}
            >
              <View style={[styles.levelBadge, { backgroundColor: activeColor }]}>
                <Text style={styles.levelBadgeText}>{riskLevel} RISK</Text>
              </View>
            </Animated.View>

            {/* Explanation — fades in after badge (staggered) */}
            <Animated.View
              style={{
                opacity: infoOpacity,
                transform: [{ translateY: infoTranslateY }],
              }}
            >
              <Text style={styles.riskExplanation}>
                {riskLevel === "LOW"
                  ? "All payments within normal parameters."
                  : riskLevel === "MEDIUM"
                  ? "Some activity flagged for review."
                  : "Action required on held transactions."}
              </Text>
            </Animated.View>
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
