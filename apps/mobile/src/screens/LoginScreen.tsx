import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
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
import { useAuth } from "../context/AuthContext";

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { login, signup, isLoading } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");

  // Log in form state
  const [identifier, setIdentifier] = useState<string>("rahul@example.com");
  const [password, setPassword] = useState<string>("password123");

  // Create account form state
  const [fullName, setFullName] = useState<string>("");
  const [mobileNumber, setMobileNumber] = useState<string>("");
  const [signupEmail, setSignupEmail] = useState<string>("");
  const [signupPassword, setSignupPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [termsAccepted, setTermsAccepted] = useState<boolean>(true);

  const [errorMessage, setErrorMessage] = useState<string>("");

  const handleLogin = async () => {
    setErrorMessage("");
    const res = await login({ identifier, password });
    if (!res.success) {
      setErrorMessage(res.error || "Login failed. Please verify your credentials.");
    }
  };

  const handleSignup = async () => {
    setErrorMessage("");
    const res = await signup({
      fullName,
      mobileNumber,
      email: signupEmail,
      password: signupPassword,
      confirmPassword,
      termsAccepted,
    });
    if (!res.success) {
      setErrorMessage(res.error || "Signup failed.");
    }
  };

  const handleForgotPassword = () => {
    Alert.alert(
      "Password Recovery",
      "A secure verification link has been sent to your registered email address or mobile number."
    );
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
            >
              <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <AvaranLogo size="sm" showText={false} />
          </View>

          {/* Welcome Message */}
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeTitle}>
              {mode === "login" ? "Welcome back" : "Create Account"}
            </Text>
            <Text style={styles.welcomeSubtitle}>
              {mode === "login"
                ? "Secure access to your Avaran account"
                : "Join Avaran to protect your UPI and wallet payments"}
            </Text>
          </View>

          {/* Mode Switcher */}
          <View style={styles.tabSwitcher}>
            <TouchableOpacity
              style={[styles.tabBtn, mode === "login" && styles.tabBtnActive]}
              onPress={() => {
                setMode("login");
                setErrorMessage("");
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabBtnText, mode === "login" && styles.tabBtnTextActive]}>
                LOG IN
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, mode === "signup" && styles.tabBtnActive]}
              onPress={() => {
                setMode("signup");
                setErrorMessage("");
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabBtnText, mode === "signup" && styles.tabBtnTextActive]}>
                CREATE ACCOUNT
              </Text>
            </TouchableOpacity>
          </View>

          {/* Error */}
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.threat} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Form */}
          {mode === "login" ? (
            <>
              <TextInput
                label="Email or mobile number"
                placeholder="e.g. rahul@example.com or +91 98765 43210"
                value={identifier}
                onChangeText={setIdentifier}
                icon="person-outline"
                autoCapitalize="none"
              />

              <TextInput
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                icon="lock-closed-outline"
                isPassword
              />

              <TouchableOpacity
                onPress={handleForgotPassword}
                style={styles.forgotBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>

              <Button
                label={isLoading ? "Logging in..." : "LOG IN"}
                onPress={handleLogin}
                loading={isLoading}
                variant="primary"
                size="lg"
                icon="arrow-forward"
                iconPosition="right"
                style={styles.submitBtn}
              />

              <TouchableOpacity
                style={styles.switchModeLink}
                onPress={() => {
                  setMode("signup");
                  setErrorMessage("");
                }}
              >
                <Text style={styles.switchModeText}>
                  Don't have an account? <Text style={styles.switchModeBold}>Create Account</Text>
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput
                label="Full Name"
                placeholder="e.g. Rahul Sharma"
                value={fullName}
                onChangeText={setFullName}
                icon="person-outline"
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
                placeholder="Create a strong password"
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

              <TouchableOpacity
                style={styles.termsRow}
                onPress={() => setTermsAccepted((v) => !v)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={termsAccepted ? "checkbox" : "square-outline"}
                  size={20}
                  color={termsAccepted ? colors.brand : colors.textMuted}
                />
                <Text style={styles.termsText}>
                  I agree to the <Text style={styles.termsLink}>Terms of Service</Text> and{" "}
                  <Text style={styles.termsLink}>Privacy Policy</Text>
                </Text>
              </TouchableOpacity>

              <Button
                label={isLoading ? "Creating Account..." : "CREATE ACCOUNT"}
                onPress={handleSignup}
                loading={isLoading}
                variant="primary"
                size="lg"
                style={styles.submitBtn}
              />

              <TouchableOpacity
                style={styles.switchModeLink}
                onPress={() => {
                  setMode("login");
                  setErrorMessage("");
                }}
              >
                <Text style={styles.switchModeText}>
                  Already have an account? <Text style={styles.switchModeBold}>Log In</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Footer */}
          <View style={styles.footerNote}>
            <Ionicons name="shield-checkmark" size={14} color={colors.brand} />
            <Text style={styles.footerNoteText}>Protected by Avaran Fraud Shield</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  tabSwitcher: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    padding: 3,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderRadius: radii.sm,
  },
  tabBtnActive: {
    backgroundColor: colors.surface,
  },
  tabBtnText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.4,
  },
  tabBtnTextActive: {
    color: colors.textPrimary,
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
  forgotBtn: {
    alignSelf: "flex-end",
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  forgotText: {
    ...typography.small,
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 13,
  },
  submitBtn: {
    marginTop: spacing.md,
  },
  switchModeLink: {
    alignItems: "center",
    marginTop: spacing.xl,
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
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  termsText: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  termsLink: {
    color: colors.textPrimary,
    fontWeight: "600",
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
