import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii } from "../theme/layout";
import { AvaranLogo } from "../components/common/AvaranLogo";
import { TextInput } from "../components/common/TextInput";
import { Button } from "../components/common/Button";
import { PolicyModal, PolicyType } from "../components/common/PolicyModal";
import { useAuth } from "../context/AuthContext";

export const CreateAccountScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { signup, isLoading } = useAuth();

  // Create account form state
  const [fullName, setFullName] = useState<string>("");
  const [mobileNumber, setMobileNumber] = useState<string>("");
  const [signupEmail, setSignupEmail] = useState<string>("");
  const [signupPassword, setSignupPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState<boolean>(false);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);

  // Policy Modal state
  const [activePolicy, setActivePolicy] = useState<PolicyType | null>(null);

  const [errorMessage, setErrorMessage] = useState<string>("");

  // Real-time password requirement analysis
  const hasMinLength = signupPassword.length >= 10;
  const hasUppercase = /[A-Z]/.test(signupPassword);
  const hasLowercase = /[a-z]/.test(signupPassword);
  const hasNumber = /[0-9]/.test(signupPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(signupPassword);

  const isPasswordValid =
    hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;

  // Real-time confirm password check
  const passwordsMatch =
    signupPassword.length > 0 &&
    confirmPassword.length > 0 &&
    signupPassword === confirmPassword;
  const confirmPasswordMismatch =
    confirmPasswordTouched &&
    confirmPassword.length > 0 &&
    signupPassword !== confirmPassword;

  // Calculate password strength indicator
  const getPasswordStrength = () => {
    if (!signupPassword) return { score: 0, label: "", color: colors.borderLight };
    let score = 0;
    if (hasMinLength) score++;
    if (hasUppercase) score++;
    if (hasLowercase) score++;
    if (hasNumber) score++;
    if (hasSpecial) score++;
    if (signupPassword.length >= 14) score++;

    if (score <= 2) return { score: 1, label: "Weak", color: colors.threat };
    if (score <= 4) return { score: 2, label: "Medium", color: colors.caution };
    return { score: 3, label: "Strong", color: colors.safe };
  };

  const passwordStrength = getPasswordStrength();

  // Overall form validity
  const isFormValid =
    fullName.trim().length > 0 &&
    mobileNumber.trim().length >= 6 &&
    signupEmail.trim().includes("@") &&
    isPasswordValid &&
    passwordsMatch &&
    termsAccepted;

  // Smooth page transition animation
  const enterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enterAnim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [enterAnim]);

  // Ensure Create Account form always starts completely fresh and empty whenever opened
  useFocusEffect(
    useCallback(() => {
      setFullName("");
      setMobileNumber("");
      setSignupEmail("");
      setSignupPassword("");
      setConfirmPassword("");
      setConfirmPasswordTouched(false);
      setTermsAccepted(false);
      setErrorMessage("");
    }, [])
  );

  const handleSignup = async () => {
    setErrorMessage("");

    // Client-side validations
    if (!fullName.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (!mobileNumber.trim()) {
      setErrorMessage("Please enter your mobile number.");
      return;
    }
    if (!signupEmail.trim() || !signupEmail.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!hasMinLength) {
      setErrorMessage("Password must be at least 10 characters long.");
      return;
    }
    if (!hasUppercase) {
      setErrorMessage("Password must contain at least one uppercase letter.");
      return;
    }
    if (!hasLowercase) {
      setErrorMessage("Password must contain at least one lowercase letter.");
      return;
    }
    if (!hasNumber) {
      setErrorMessage("Password must contain at least one number.");
      return;
    }
    if (!hasSpecial) {
      setErrorMessage("Password must contain at least one special character.");
      return;
    }
    if (signupPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    if (!termsAccepted) {
      setErrorMessage("Please accept the Terms of Service & Privacy Policy.");
      return;
    }

    const res = await signup({
      fullName: fullName.trim(),
      mobileNumber: mobileNumber.trim(),
      email: signupEmail.trim(),
      password: signupPassword,
      confirmPassword,
      termsAccepted,
    });

    if (res.success) {
      if (res.pendingVerification && res.userId) {
        navigation.navigate("OtpVerification", {
          userId: res.userId,
          maskedContact: res.maskedContact || mobileNumber.trim(),
          phone: mobileNumber.trim(),
          email: signupEmail.trim(),
          isLiveDelivery: res.isLiveDelivery,
          devTestCode: res.devTestCode,
        });
      }
    } else {
      setErrorMessage(res.error || "Signup failed. Please try again.");
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
              accessibilityLabel="Go back to landing screen"
            >
              <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <AvaranLogo size="sm" showText={false} />
          </View>

          {/* Header Message */}
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeTitle}>Create Account</Text>
            <Text style={styles.welcomeSubtitle}>
              Set up your Avaran protection profile to monitor transactions
            </Text>
          </View>

          {/* Error Banner */}
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.threat} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Group 1: Personal Details */}
          <View style={styles.formGroupSection}>
            <Text style={styles.groupSectionTitle}>Personal Information</Text>

            <TextInput
              label="Full Name"
              placeholder="e.g. Rahul Sharma"
              value={fullName}
              onChangeText={(text) => {
                setFullName(text);
                if (errorMessage) setErrorMessage("");
              }}
              icon="person-outline"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
            />

            <TextInput
              label="Mobile Number"
              placeholder="e.g. +91 98765 43210"
              value={mobileNumber}
              onChangeText={(text) => {
                setMobileNumber(text);
                if (errorMessage) setErrorMessage("");
              }}
              icon="call-outline"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
            />

            <TextInput
              label="Email Address"
              placeholder="e.g. rahul@example.com"
              value={signupEmail}
              onChangeText={(text) => {
                setSignupEmail(text);
                if (errorMessage) setErrorMessage("");
              }}
              icon="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="off"
              textContentType="none"
            />
          </View>

          {/* Group 2: Security & Password */}
          <View style={[styles.formGroupSection, { marginTop: spacing.md }]}>
            <Text style={styles.groupSectionTitle}>Security & Credentials</Text>

            <TextInput
              label="Password"
              placeholder="Create a strong password (min. 10 characters)"
              value={signupPassword}
              onChangeText={(text) => {
                setSignupPassword(text);
                if (errorMessage) setErrorMessage("");
              }}
              icon="lock-closed-outline"
              isPassword
              autoComplete="new-password"
              textContentType="newPassword"
            />

            {/* Password Strength Indicator */}
            {signupPassword.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBarsRow}>
                  <View
                    style={[
                      styles.strengthBar,
                      {
                        backgroundColor:
                          passwordStrength.score >= 1
                            ? passwordStrength.color
                            : colors.borderLight,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.strengthBar,
                      {
                        backgroundColor:
                          passwordStrength.score >= 2
                            ? passwordStrength.color
                            : colors.borderLight,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.strengthBar,
                      {
                        backgroundColor:
                          passwordStrength.score >= 3
                            ? passwordStrength.color
                            : colors.borderLight,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>
                  Password strength: <Text style={{ fontWeight: "700" }}>{passwordStrength.label}</Text>
                </Text>
              </View>
            )}

            {/* Password Requirements Checklist */}
            {signupPassword.length > 0 && (
              <View style={styles.checklistCard}>
                <Text style={styles.checklistHeader}>Password must contain:</Text>
                <View style={styles.checklistItem}>
                  <Ionicons
                    name={hasMinLength ? "checkmark-circle" : "ellipse-outline"}
                    size={14}
                    color={hasMinLength ? colors.safe : colors.textMuted}
                  />
                  <Text style={[styles.checklistText, hasMinLength && styles.checklistTextMet]}>
                    At least 10 characters
                  </Text>
                </View>
                <View style={styles.checklistItem}>
                  <Ionicons
                    name={hasUppercase ? "checkmark-circle" : "ellipse-outline"}
                    size={14}
                    color={hasUppercase ? colors.safe : colors.textMuted}
                  />
                  <Text style={[styles.checklistText, hasUppercase && styles.checklistTextMet]}>
                    One uppercase letter (A-Z)
                  </Text>
                </View>
                <View style={styles.checklistItem}>
                  <Ionicons
                    name={hasLowercase ? "checkmark-circle" : "ellipse-outline"}
                    size={14}
                    color={hasLowercase ? colors.safe : colors.textMuted}
                  />
                  <Text style={[styles.checklistText, hasLowercase && styles.checklistTextMet]}>
                    One lowercase letter (a-z)
                  </Text>
                </View>
                <View style={styles.checklistItem}>
                  <Ionicons
                    name={hasNumber ? "checkmark-circle" : "ellipse-outline"}
                    size={14}
                    color={hasNumber ? colors.safe : colors.textMuted}
                  />
                  <Text style={[styles.checklistText, hasNumber && styles.checklistTextMet]}>
                    One number (0-9)
                  </Text>
                </View>
                <View style={styles.checklistItem}>
                  <Ionicons
                    name={hasSpecial ? "checkmark-circle" : "ellipse-outline"}
                    size={14}
                    color={hasSpecial ? colors.safe : colors.textMuted}
                  />
                  <Text style={[styles.checklistText, hasSpecial && styles.checklistTextMet]}>
                    One special character (!@#$%^&*)
                  </Text>
                </View>
              </View>
            )}

            <TextInput
              label="Confirm Password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setConfirmPasswordTouched(true);
                if (errorMessage) setErrorMessage("");
              }}
              onFocus={() => {
                if (confirmPassword.length > 0) {
                  setConfirmPasswordTouched(true);
                }
              }}
              icon="lock-closed-outline"
              isPassword
              autoComplete="new-password"
              textContentType="newPassword"
            />

            {/* Confirm Password Mismatch Message */}
            {confirmPasswordMismatch && (
              <View style={styles.inlineErrorRow}>
                <Ionicons name="alert-circle-outline" size={13} color={colors.threat} />
                <Text style={styles.inlineErrorText}>Passwords do not match</Text>
              </View>
            )}
          </View>

          {/* Terms & Privacy Agreement Row */}
          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setTermsAccepted((v) => !v)}
            activeOpacity={0.8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: termsAccepted }}
            accessibilityLabel="I agree to Terms of Service and Privacy Policy checkbox"
          >
            <View style={styles.checkboxTouchable}>
              <Ionicons
                name={termsAccepted ? "checkbox" : "square-outline"}
                size={20}
                color={termsAccepted ? colors.brand : colors.textMuted}
              />
            </View>

            <View style={styles.termsTextContainer}>
              <Text style={styles.termsText}>
                I agree to the{" "}
                <Text
                  style={[
                    styles.termsLink,
                    Platform.OS === "web" && ({ cursor: "pointer" } as any),
                  ]}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    setActivePolicy("terms");
                  }}
                  accessibilityRole="link"
                  accessibilityLabel="Open Terms of Service"
                >
                  Terms of Service
                </Text>
                {" and "}
                <Text
                  style={[
                    styles.termsLink,
                    Platform.OS === "web" && ({ cursor: "pointer" } as any),
                  ]}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    setActivePolicy("privacy");
                  }}
                  accessibilityRole="link"
                  accessibilityLabel="Open Privacy Policy"
                >
                  Privacy Policy
                </Text>
              </Text>
            </View>
          </TouchableOpacity>

          {/* Submit CTA */}
          <Button
            label={isLoading ? "Creating Account..." : "CREATE ACCOUNT"}
            onPress={handleSignup}
            loading={isLoading}
            disabled={!isFormValid || isLoading}
            variant="primary"
            size="lg"
            icon="arrow-forward"
            iconPosition="right"
            style={styles.submitBtn}
          />

          {/* Link to Login */}
          <TouchableOpacity
            style={styles.switchModeLink}
            onPress={() => navigation.navigate("Login")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Already have an account? Log In"
          >
            <Text style={styles.switchModeText}>
              Already have an account? <Text style={styles.switchModeBold}>Log In</Text>
            </Text>
          </TouchableOpacity>

          {/* Footer Note */}
          <View style={styles.footerNote}>
            <Ionicons name="shield-checkmark" size={14} color={colors.brand} />
            <Text style={styles.footerNoteText}>Protected by Avaran Fraud Shield</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </Animated.View>

      {/* Interactive Policy Modal */}
      <PolicyModal
        visible={activePolicy !== null}
        type={activePolicy || "terms"}
        onClose={() => setActivePolicy(null)}
      />
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
  welcomeSection: {
    marginBottom: spacing.lg,
  },
  welcomeTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    fontSize: 27,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  welcomeSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
    lineHeight: 20,
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
  formGroupSection: {
    marginBottom: spacing.xs,
  },
  groupSectionTitle: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  strengthContainer: {
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  strengthBarsRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 4,
  },
  strengthBar: {
    flex: 1,
    height: 3.5,
    borderRadius: 2,
  },
  strengthLabel: {
    ...typography.caption,
    fontSize: 11.5,
  },
  checklistCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.md,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    marginTop: 2,
    marginBottom: spacing.xs + 2,
    gap: 3.5,
  },
  checklistHeader: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
    marginBottom: 2,
  },
  checklistItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checklistText: {
    ...typography.caption,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  checklistTextMet: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
  inlineErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
    marginBottom: spacing.xs,
  },
  inlineErrorText: {
    ...typography.small,
    color: colors.threat,
    fontSize: 12,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  checkboxTouchable: {
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  termsTextContainer: {
    flex: 1,
  },
  termsText: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  termsLink: {
    color: colors.textPrimary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  submitBtn: {
    marginTop: spacing.md,
  },
  switchModeLink: {
    alignItems: "center",
    marginTop: spacing.xl,
    paddingVertical: spacing.xs,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  switchModeText: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
  },
  switchModeBold: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  footerNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.xxl,
  },
  footerNoteText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
  },
});
