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

export const ResetPasswordOtpScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { verifyPasswordResetOtp, requestPasswordReset, isLoading } = useAuth();

  const identifier = route.params?.identifier || "";
  const maskedContact = route.params?.maskedContact || identifier;
  const isLiveDelivery = route.params?.isLiveDelivery ?? false;
  const [devCode, setDevCode] = useState<string>(route.params?.devTestCode || "");

  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successNotice, setSuccessNotice] = useState<string>("");
  const [cooldown, setCooldown] = useState<number>(route.params?.resendCooldownSeconds ?? 30);
  const [isResending, setIsResending] = useState<boolean>(false);

  const inputRefs = useRef<(RNTextInput | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  const enterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enterAnim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [enterAnim]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleDigitChange = (text: string, index: number) => {
    setErrorMessage("");

    if (text.length > 1) {
      const cleanDigits = text.replace(/[^0-9]/g, "").slice(0, 6);
      if (cleanDigits.length > 0) {
        const newArr = [...otpDigits];
        for (let i = 0; i < 6; i++) {
          newArr[i] = cleanDigits[i] || "";
        }
        setOtpDigits(newArr);
        const nextFocus = Math.min(cleanDigits.length, 5);
        inputRefs.current[nextFocus]?.focus();
        setFocusedIndex(nextFocus);
        return;
      }
    }

    const cleanChar = text.replace(/[^0-9]/g, "").slice(-1);
    const newArr = [...otpDigits];
    newArr[index] = cleanChar;
    setOtpDigits(newArr);

    if (cleanChar && index < 5) {
      inputRefs.current[index + 1]?.focus();
      setFocusedIndex(index + 1);
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === "Backspace") {
      if (!otpDigits[index] && index > 0) {
        const newArr = [...otpDigits];
        newArr[index - 1] = "";
        setOtpDigits(newArr);
        inputRefs.current[index - 1]?.focus();
        setFocusedIndex(index - 1);
      }
    }
  };

  const handleVerify = async () => {
    setErrorMessage("");
    const otp = otpDigits.join("");
    if (otp.length < 6) {
      setErrorMessage("Please enter all 6 digits of the recovery code.");
      return;
    }

    const res = await verifyPasswordResetOtp(identifier, otp);
    if (res.success && res.resetToken) {
      navigation.navigate("NewPassword", {
        resetToken: res.resetToken,
      });
    } else {
      setErrorMessage(res.error || "Verification failed. Please check your recovery code.");
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setErrorMessage("");
    setSuccessNotice("");

    const res = await requestPasswordReset(identifier);
    setIsResending(false);

    if (res.success) {
      setCooldown(res.resendCooldownSeconds ?? 30);
      if (res.devTestCode) {
        setDevCode(res.devTestCode);
      }
      setSuccessNotice("A fresh recovery code has been generated.");
    } else {
      setErrorMessage(res.error || "Failed to resend recovery code. Please try again.");
    }
  };

  const isComplete = otpDigits.every((d) => d.length === 1);

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
            {/* Top Bar */}
            <View style={styles.topNavRow}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => navigation.goBack()}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <AvaranLogo size="sm" showText={false} />
            </View>

            {/* Header */}
            <View style={styles.headerSection}>
              <View style={styles.iconCircle}>
                <Ionicons name="key-outline" size={26} color={colors.brand} />
              </View>
              <Text style={styles.title}>Verify Your Identity</Text>
              <Text style={styles.subtitle}>
                {isLiveDelivery
                  ? `Enter the 6-digit recovery code sent to ${maskedContact}`
                  : `Enter the 6-digit verification code generated for ${maskedContact}`}
              </Text>
            </View>

            {/* Dev Sandbox Badge */}
            {devCode ? (
              <View style={styles.devSandboxCard}>
                <View style={styles.devSandboxHeader}>
                  <Ionicons name="flask-outline" size={14} color={colors.caution} />
                  <Text style={styles.devSandboxTitle}>SANDBOX SIMULATION</Text>
                </View>
                <Text style={styles.devSandboxText}>
                  Development mode is active. Your test recovery code is:{" "}
                  <Text style={styles.devCodeBold}>{devCode}</Text>
                </Text>
                <TouchableOpacity
                  style={styles.fillCodeBtn}
                  onPress={() => {
                    const digits = devCode.split("").slice(0, 6);
                    setOtpDigits(digits);
                    setErrorMessage("");
                  }}
                >
                  <Text style={styles.fillCodeText}>Auto-fill test code</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Error Box */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.threat} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Success Notice */}
            {successNotice ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
                <Text style={styles.successText}>{successNotice}</Text>
              </View>
            ) : null}

            {/* 6 OTP Input Boxes */}
            <View style={styles.otpRow}>
              {otpDigits.map((digit, idx) => {
                const isFocused = focusedIndex === idx;
                const isFilled = digit.length > 0;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.otpBox,
                      isFocused && styles.otpBoxFocused,
                      isFilled && styles.otpBoxFilled,
                      errorMessage && styles.otpBoxError,
                    ]}
                  >
                    <RNTextInput
                      ref={(el) => {
                        inputRefs.current[idx] = el;
                      }}
                      style={styles.otpInput}
                      value={digit}
                      onChangeText={(text) => handleDigitChange(text, idx)}
                      onKeyPress={(e) => handleKeyPress(e, idx)}
                      onFocus={() => setFocusedIndex(idx)}
                      keyboardType="number-pad"
                      maxLength={6}
                      selectTextOnFocus
                      caretHidden={Platform.OS === "android"}
                    />
                  </View>
                );
              })}
            </View>

            {/* Submit Button */}
            <Button
              label={isLoading ? "Verifying..." : "VERIFY CODE"}
              onPress={handleVerify}
              loading={isLoading}
              disabled={isLoading || !isComplete}
              variant="primary"
              size="lg"
              icon="checkmark-circle-outline"
              iconPosition="right"
              style={styles.submitBtn}
            />

            {/* Resend Action */}
            <View style={styles.resendContainer}>
              <TouchableOpacity
                onPress={handleResend}
                disabled={cooldown > 0 || isResending}
                activeOpacity={0.7}
                style={styles.resendBtn}
              >
                <Ionicons
                  name="refresh-outline"
                  size={15}
                  color={cooldown > 0 ? colors.textMuted : colors.brand}
                />
                <Text
                  style={[
                    styles.resendText,
                    cooldown > 0 ? styles.resendTextDisabled : styles.resendTextActive,
                  ]}
                >
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend recovery code"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Footer Note */}
            <View style={styles.footerNote}>
              <Ionicons name="lock-closed" size={14} color={colors.brand} />
              <Text style={styles.footerNoteText}>Protected by Avaran Recovery Guard</Text>
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
  },
  headerSection: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
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
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
  devSandboxCard: {
    backgroundColor: "#FDF9F0",
    borderWidth: 1,
    borderColor: "#EBDDBA",
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  devSandboxHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  devSandboxTitle: {
    ...typography.smallBold,
    color: colors.caution,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  devSandboxText: {
    ...typography.small,
    color: colors.textPrimary,
    fontSize: 12.5,
    lineHeight: 18,
  },
  devCodeBold: {
    fontWeight: "700",
    letterSpacing: 2,
    color: colors.brand,
  },
  fillCodeBtn: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingVertical: 2,
  },
  fillCodeText: {
    ...typography.smallBold,
    color: colors.brand,
    fontSize: 12,
    textDecorationLine: "underline",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
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
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  successText: {
    ...typography.small,
    color: colors.brand,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xl,
    gap: 8,
  },
  otpBox: {
    flex: 1,
    height: 54,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxFocused: {
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  otpBoxFilled: {
    borderColor: colors.textPrimary,
    backgroundColor: colors.surfaceSecondary,
  },
  otpBoxError: {
    borderColor: colors.threat,
  },
  otpInput: {
    width: "100%",
    height: "100%",
    textAlign: "center",
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
  },
  submitBtn: {
    marginBottom: spacing.lg,
  },
  resendContainer: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  resendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  resendText: {
    ...typography.smallBold,
    fontSize: 13,
  },
  resendTextActive: {
    color: colors.brand,
  },
  resendTextDisabled: {
    color: colors.textMuted,
  },
  footerNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.lg,
  },
  footerNoteText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
  },
});
