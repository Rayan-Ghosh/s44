import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput as RNTextInput,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii } from "../theme/layout";
import { AvaranLogo } from "../components/common/AvaranLogo";
import { Button } from "../components/common/Button";
import { useAuth } from "../context/AuthContext";

export const OtpVerificationScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { verifyOtp, resendOtp, isLoading } = useAuth();

  const userId = route.params?.userId || 0;
  const maskedContact = route.params?.maskedContact || "your registered contact";
  const isLiveDelivery = route.params?.isLiveDelivery ?? false;
  const [devCode, setDevCode] = useState<string>(route.params?.devTestCode || "");

  // 6-digit OTP state array
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successNotice, setSuccessNotice] = useState<string>("");
  const [cooldown, setCooldown] = useState<number>(30);
  const [isResending, setIsResending] = useState<boolean>(false);

  // Refs for 6 inputs
  const inputRefs = useRef<(RNTextInput | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  // Smooth entrance animation
  const enterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enterAnim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [enterAnim]);

  // Resend countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // Auto focus first input slot on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  const handleDigitChange = (value: string, index: number) => {
    if (errorMessage) setErrorMessage("");
    if (successNotice) setSuccessNotice("");

    // Handle multi-character paste (e.g. 6 digits pasted at once)
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length > 1) {
      const newDigits = [...otpDigits];
      for (let i = 0; i < 6; i++) {
        newDigits[i] = cleaned[i] || "";
      }
      setOtpDigits(newDigits);
      const nextIndex = Math.min(cleaned.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    const singleDigit = cleaned.slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = singleDigit;
    setOtpDigits(newDigits);

    // Auto advance focus to next input slot
    if (singleDigit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === "Backspace") {
      if (!otpDigits[index] && index > 0) {
        // Move to previous input and clear it
        const newDigits = [...otpDigits];
        newDigits[index - 1] = "";
        setOtpDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      } else {
        const newDigits = [...otpDigits];
        newDigits[index] = "";
        setOtpDigits(newDigits);
      }
    }
  };

  const autofillDevCode = (code: string) => {
    if (!code || code.length !== 6) return;
    const digits = code.split("");
    setOtpDigits(digits);
    inputRefs.current[5]?.focus();
  };

  const fullOtp = otpDigits.join("");
  const isOtpComplete = fullOtp.length === 6 && /^\d{6}$/.test(fullOtp);

  const handleVerify = async () => {
    if (!isOtpComplete || isLoading) return;
    setErrorMessage("");
    setSuccessNotice("");

    const res = await verifyOtp(userId, fullOtp);
    if (!res.success) {
      setErrorMessage(res.error || "Invalid verification code. Please check and try again.");
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setErrorMessage("");
    setSuccessNotice("");
    setIsResending(true);

    try {
      const res = await resendOtp(userId);
      if (res.success) {
        setSuccessNotice(
          res.isLiveDelivery
            ? "A new 6-digit verification code has been sent."
            : "A new 6-digit verification code has been generated."
        );
        setCooldown(res.resendCooldownSeconds ?? 30);
        if (res.devTestCode) {
          setDevCode(res.devTestCode);
        }
        setOtpDigits(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      } else {
        setErrorMessage(res.error || "Unable to resend code. Please wait a moment.");
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Animated.View
        style={{
          flex: 1,
          opacity: enterAnim,
          transform: [
            {
              translateX: enterAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [24, 0],
              }),
            },
          ],
        }}
      >
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Top Bar: Back + Logo */}
            <View style={styles.topNavRow}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => navigation.goBack()}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <AvaranLogo size="sm" showText={false} />
            </View>

            {/* Header Message - Honest & Accurate */}
            <View style={styles.headerSection}>
              <View style={styles.iconCircle}>
                <Ionicons name="shield-checkmark-outline" size={28} color={colors.brand} />
              </View>
              <Text style={styles.title}>Account Verification</Text>
              <Text style={styles.subtitle}>
                {isLiveDelivery ? (
                  <>
                    Enter the 6-digit verification code sent to{"\n"}
                    <Text style={styles.contactHighlight}>{maskedContact}</Text>
                  </>
                ) : (
                  <>
                    Enter the 6-digit verification code for{"\n"}
                    <Text style={styles.contactHighlight}>{maskedContact}</Text>
                  </>
                )}
              </Text>
            </View>

            {/* Error Banner */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.threat} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Success Notice */}
            {successNotice ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={18} color={colors.safe} />
                <Text style={styles.successText}>{successNotice}</Text>
              </View>
            ) : null}

            {/* 6-Slot OTP Input Container */}
            <View style={styles.otpContainer}>
              {otpDigits.map((digit, index) => {
                const isFocused = focusedIndex === index;
                const isFilled = digit.length > 0;
                return (
                  <View
                    key={index}
                    style={[
                      styles.otpSlot,
                      isFocused && styles.otpSlotFocused,
                      isFilled && styles.otpSlotFilled,
                      !!errorMessage && styles.otpSlotError,
                    ]}
                  >
                    <RNTextInput
                      ref={(ref) => {
                        inputRefs.current[index] = ref;
                      }}
                      style={styles.otpInput}
                      value={digit}
                      onChangeText={(val) => handleDigitChange(val, index)}
                      onKeyPress={(e) => handleKeyPress(e, index)}
                      onFocus={() => setFocusedIndex(index)}
                      keyboardType="number-pad"
                      maxLength={6}
                      selectTextOnFocus
                      autoComplete="one-time-code"
                      textContentType="oneTimeCode"
                      underlineColorAndroid="transparent"
                    />
                  </View>
                );
              })}
            </View>

            {/* Resend Cooldown Section */}
            <View style={styles.resendSection}>
              {cooldown > 0 ? (
                <Text style={styles.cooldownText}>
                  Resend code in{" "}
                  <Text style={styles.cooldownSeconds}>
                    0:{cooldown < 10 ? `0${cooldown}` : cooldown}
                  </Text>
                </Text>
              ) : (
                <TouchableOpacity
                  onPress={handleResend}
                  disabled={isResending}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Resend verification code"
                >
                  <Text style={styles.resendLinkText}>
                    {isResending ? "Generating new code..." : "Resend verification code"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Submit Action */}
            <Button
              label={isLoading ? "Verifying..." : "VERIFY & ACTIVATE"}
              onPress={handleVerify}
              loading={isLoading}
              disabled={!isOtpComplete || isLoading}
              variant="primary"
              size="lg"
              icon="arrow-forward"
              iconPosition="right"
              style={styles.submitBtn}
            />

            {/* Development/Sandbox Helper Pill (Never exposed in production) */}
            {devCode ? (
              <TouchableOpacity
                style={styles.devPill}
                onPress={() => autofillDevCode(devCode)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Fill dev code"
              >
                <Ionicons name="code-slash" size={13} color={colors.textSecondary} />
                <Text style={styles.devPillText}>
                  Sandbox Code: <Text style={styles.devPillCode}>{devCode}</Text> (Tap to fill)
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Security Guarantee Note */}
            <View style={styles.footerNote}>
              <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
              <Text style={styles.footerNoteText}>Encrypted authentication & verification</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    flexGrow: 1,
  },
  topNavRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  headerSection: {
    marginBottom: spacing.xl,
    alignItems: "flex-start",
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 6,
    lineHeight: 21,
  },
  contactHighlight: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.threatSurface,
    borderWidth: 1,
    borderColor: colors.threatBorder,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  errorText: {
    ...typography.small,
    color: colors.threat,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.safeSurface,
    borderWidth: 1,
    borderColor: colors.safeBorder,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  successText: {
    ...typography.small,
    color: colors.safe,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: spacing.lg,
    gap: 8,
  },
  otpSlot: {
    flex: 1,
    height: 56,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web"
      ? ({
          transition: "border-color 0.15s ease",
        } as any)
      : {}),
  },
  otpSlotFocused: {
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  otpSlotFilled: {
    borderColor: colors.textSecondary,
  },
  otpSlotError: {
    borderColor: colors.threat,
  },
  otpInput: {
    width: "100%",
    height: "100%",
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
    backgroundColor: "transparent",
    ...(Platform.OS === "web"
      ? ({
          outlineStyle: "none",
          outlineWidth: 0,
          backgroundColor: "transparent",
          boxShadow: "none",
        } as any)
      : {}),
  },
  resendSection: {
    alignItems: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  cooldownText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 13,
  },
  cooldownSeconds: {
    fontWeight: "700",
    color: colors.textSecondary,
  },
  resendLinkText: {
    ...typography.small,
    color: colors.brand,
    fontWeight: "700",
    fontSize: 13.5,
    textDecorationLine: "underline",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  submitBtn: {
    marginTop: spacing.xs,
  },
  devPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: spacing.lg,
    gap: 6,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  devPillText: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
  },
  devPillCode: {
    fontWeight: "700",
    color: colors.textPrimary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  footerNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.xl,
  },
  footerNoteText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
  },
});
