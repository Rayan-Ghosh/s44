import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii, shadows } from "../theme/layout";
import { Button } from "../components/common/Button";
import { AvaranLogo } from "../components/common/AvaranLogo";

export const LandingScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  // Progressive Entrance Animation States
  const brandAnim = useRef(new Animated.Value(0)).current;
  const badgeAnim = useRef(new Animated.Value(0)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const descAnim = useRef(new Animated.Value(0)).current;
  const ctaAnim = useRef(new Animated.Value(0)).current;
  const loginAnim = useRef(new Animated.Value(0)).current;
  const sectionHeadingAnim = useRef(new Animated.Value(0)).current;
  const cardAnim1 = useRef(new Animated.Value(0)).current;
  const cardAnim2 = useRef(new Animated.Value(0)).current;
  const cardAnim3 = useRef(new Animated.Value(0)).current;

  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;

    const createEntranceStep = (
      anim: Animated.Value,
      delay: number,
      duration: number
    ) => {
      return Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]);
    };

    Animated.parallel([
      createEntranceStep(brandAnim, 0, 320),
      createEntranceStep(badgeAnim, 90, 320),
      createEntranceStep(titleAnim, 180, 340),
      createEntranceStep(descAnim, 270, 340),
      createEntranceStep(ctaAnim, 360, 320),
      createEntranceStep(loginAnim, 440, 300),
      createEntranceStep(sectionHeadingAnim, 520, 300),
      createEntranceStep(cardAnim1, 580, 340),
      createEntranceStep(cardAnim2, 680, 340),
      createEntranceStep(cardAnim3, 780, 340),
    ]).start();
  }, [
    brandAnim,
    badgeAnim,
    titleAnim,
    descAnim,
    ctaAnim,
    loginAnim,
    sectionHeadingAnim,
    cardAnim1,
    cardAnim2,
    cardAnim3,
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Brand Header */}
        <Animated.View
          style={[
            styles.brandRow,
            {
              opacity: brandAnim,
              transform: [
                {
                  translateY: brandAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <AvaranLogo size="sm" showText={false} />
          <Text style={styles.brandName}>AVARAN</Text>
        </Animated.View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          {/* 2. Fraud Shield Badge */}
          <Animated.View
            style={[
              styles.pillBadge,
              {
                opacity: badgeAnim,
                transform: [
                  {
                    translateY: badgeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Ionicons name="shield-checkmark" size={12} color={colors.brand} />
            <Text style={styles.pillText}>UPI FRAUD-RISK SHIELD</Text>
          </Animated.View>

          {/* 3. Main Heading */}
          <Animated.Text
            style={[
              styles.heroTitle,
              {
                opacity: titleAnim,
                transform: [
                  {
                    translateY: titleAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            Protect every payment{"\n"}before it's too late.
          </Animated.Text>

          {/* 4. Description */}
          <Animated.Text
            style={[
              styles.heroDesc,
              {
                opacity: descAnim,
                transform: [
                  {
                    translateY: descAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            Avaran evaluates payments in the moment before confirmation — detecting fraud patterns, device anomalies, and social engineering pressure across your connected payment apps.
          </Animated.Text>

          {/* 5. Primary CTA */}
          <Animated.View
            style={{
              opacity: ctaAnim,
              transform: [
                {
                  translateY: ctaAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            }}
          >
            <Button
              label="GET STARTED"
              onPress={() => navigation.navigate("CreateAccount")}
              variant="primary"
              size="lg"
              icon="arrow-forward"
              iconPosition="right"
              style={styles.ctaBtn}
            />
          </Animated.View>

          {/* 6. Secondary Login Link */}
          <Animated.View
            style={{
              opacity: loginAnim,
              transform: [
                {
                  translateY: loginAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [6, 0],
                  }),
                },
              ],
            }}
          >
            <TouchableOpacity
              style={styles.loginLink}
              onPress={() => navigation.navigate("Login")}
              activeOpacity={0.7}
            >
              <Text style={styles.loginLinkText}>
                Already have an account? <Text style={styles.loginLinkBold}>Log In</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* 7. Comprehensive Protection Cards */}
        <View style={styles.protectionSection}>
          <Animated.Text
            style={[
              styles.sectionHeading,
              {
                opacity: sectionHeadingAnim,
                transform: [
                  {
                    translateY: sectionHeadingAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [6, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            COMPREHENSIVE PROTECTION
          </Animated.Text>

          {/* Card 1: Payment Protection */}
          <Animated.View
            style={[
              styles.capabilityCard,
              {
                opacity: cardAnim1,
                transform: [
                  {
                    translateY: cardAnim1.interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  },
                  {
                    scale: cardAnim1.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.98, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.textPrimary} />
            </View>
            <View style={styles.cardTextCol}>
              <Text style={styles.cardTitle}>Payment Protection</Text>
              <Text style={styles.cardDesc}>
                Detects and holds suspicious payments before funds leave your account.
              </Text>
            </View>
          </Animated.View>

          {/* Card 2: Risk Detection */}
          <Animated.View
            style={[
              styles.capabilityCard,
              {
                opacity: cardAnim2,
                transform: [
                  {
                    translateY: cardAnim2.interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  },
                  {
                    scale: cardAnim2.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.98, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="pulse-outline" size={18} color={colors.textPrimary} />
            </View>
            <View style={styles.cardTextCol}>
              <Text style={styles.cardTitle}>Risk Detection</Text>
              <Text style={styles.cardDesc}>
                4-signal fusion analyzing transaction, device, behavioral, and voice factors.
              </Text>
            </View>
          </Animated.View>

          {/* Card 3: Call Protection */}
          <Animated.View
            style={[
              styles.capabilityCard,
              {
                opacity: cardAnim3,
                transform: [
                  {
                    translateY: cardAnim3.interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  },
                  {
                    scale: cardAnim3.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.98, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="call-outline" size={18} color={colors.textPrimary} />
            </View>
            <View style={styles.cardTextCol}>
              <Text style={styles.cardTitle}>Call Protection</Text>
              <Text style={styles.cardDesc}>
                Warns against urgency, impersonation, and coercion during active calls.
              </Text>
            </View>
          </Animated.View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  brandName: {
    fontFamily: typography.brandTitle.fontFamily,
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  heroSection: {
    marginBottom: spacing.lg,
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.full,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    alignSelf: "flex-start",
    gap: 6,
    marginBottom: spacing.md,
  },
  pillText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.6,
  },
  heroTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    fontSize: 27,
    lineHeight: 35,
    marginBottom: spacing.sm,
  },
  heroDesc: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  ctaBtn: {
    width: "100%",
    marginBottom: spacing.sm,
  },
  loginLink: {
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  loginLinkText: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 13.5,
  },
  loginLinkBold: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  protectionSection: {
    marginTop: spacing.xs,
  },
  sectionHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.6,
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  capabilityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  cardTextCol: {
    flex: 1,
  },
  cardTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 18,
  },
  cardDesc: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
});
