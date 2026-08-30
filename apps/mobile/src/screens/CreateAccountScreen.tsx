import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
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
  const [termsAccepted, setTermsAccepted] = useState<boolean>(true);

  // Policy Modal state
  const [activePolicy, setActivePolicy] = useState<PolicyType | null>(null);

  const [errorMessage, setErrorMessage] = useState<string>("");

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
    if (!signupPassword || signupPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
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

    if (!res.success) {
      setErrorMessage(res.error || "Signup failed. Please try again.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
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
              Join Avaran to protect your UPI and wallet payments
            </Text>
          </View>

          {/* Error Banner */}
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.threat} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Form Fields */}
          <TextInput
            label="Full Name"
            placeholder="e.g. Rahul Sharma"
            value={fullName}
            onChangeText={setFullName}
            icon="person-outline"
            autoCapitalize="words"
          />

          <TextInput
            label="Mobile Number"
            placeholder="e.g. +91 98765 43210"
            value={mobileNumber}
            onChangeText={setMobileNumber}
            icon="call-outline"
            keyboardType="phone-pad"
          />

          <TextInput
            label="Email Address"
            placeholder="e.g. rahul@example.com"
            value={signupEmail}
            onChangeText={setSignupEmail}
            icon="mail-outline"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            label="Password"
            placeholder="Create a strong password (min. 6 characters)"
            value={signupPassword}
            onChangeText={setSignupPassword}
            icon="lock-closed-outline"
            isPassword
          />

          <TextInput
            label="Confirm Password"
            placeholder="Re-enter password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            icon="lock-closed-outline"
            isPassword
          />

          {/* Terms & Privacy Agreement Row */}
          <View style={styles.termsRow}>
            <TouchableOpacity
              style={styles.checkboxTouchable}
              onPress={() => setTermsAccepted((v) => !v)}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              accessibilityLabel="I agree to Terms of Service and Privacy Policy checkbox"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={termsAccepted ? "checkbox" : "square-outline"}
                size={20}
                color={termsAccepted ? colors.brand : colors.textMuted}
              />
            </TouchableOpacity>

            <View style={styles.termsTextContainer}>
              <Text style={styles.termsText}>
                I agree to the{" "}
                <Text
                  style={[
                    styles.termsLink,
                    Platform.OS === "web" && ({ cursor: "pointer" } as any),
                  ]}
                  onPress={() => setActivePolicy("terms")}
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
                  onPress={() => setActivePolicy("privacy")}
                  accessibilityRole="link"
                  accessibilityLabel="Open Privacy Policy"
                >
                  Privacy Policy
                </Text>
              </Text>
            </View>
          </View>

          {/* Submit CTA */}
          <Button
            label={isLoading ? "Creating Account..." : "CREATE ACCOUNT"}
            onPress={handleSignup}
            loading={isLoading}
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
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    flexGrow: 1,
  },
  topNavRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xxl,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  welcomeSection: {
    marginBottom: spacing.xl,
  },
  welcomeTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    fontSize: 28,
  },
  welcomeSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 15,
    marginTop: 6,
    lineHeight: 22,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  errorText: {
    ...typography.small,
    color: colors.threat,
    flex: 1,
    fontSize: 13,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.md,
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
