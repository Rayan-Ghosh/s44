import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  Easing,
  Modal,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii, shadows } from "../theme/layout";
import { AvaranLogo } from "../components/common/AvaranLogo";
import { TextInput } from "../components/common/TextInput";
import { Button } from "../components/common/Button";
import { useAuth } from "../context/AuthContext";

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { login, requestDeviceTransfer, verifyDeviceTransfer, isLoading } = useAuth();

  // Log in form state
  const [identifier, setIdentifier] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Device Transfer Modal State
  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);
  const [transferUserId, setTransferUserId] = useState<number | null>(null);
  const [transferMaskedContact, setTransferMaskedContact] = useState<string>("");
  const [transferOtp, setTransferOtp] = useState<string>("");
  const [transferStep, setTransferStep] = useState<"PROMPT" | "OTP">("PROMPT");
  const [transferError, setTransferError] = useState<string>("");
  const [isTransferBusy, setIsTransferBusy] = useState<boolean>(false);
  const [resendSeconds, setResendSeconds] = useState<number>(30);
  const [devTestCode, setDevTestCode] = useState<string | null>(null);

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

  // Resend countdown timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (showTransferModal && transferStep === "OTP" && resendSeconds > 0) {
      timer = setInterval(() => {
        setResendSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showTransferModal, transferStep, resendSeconds]);

  const handleLogin = async () => {
    setErrorMessage("");
    if (!identifier.trim()) {
      setErrorMessage("Please enter your email address or mobile number.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    const res = await login({ identifier: identifier.trim(), password });
    if (res.requiresDeviceTransfer && res.userId) {
      setTransferUserId(res.userId);
      setTransferMaskedContact(res.maskedContact || "your registered number");
      setTransferStep("PROMPT");
      setTransferError("");
      setShowTransferModal(true);
      return;
    }

    if (!res.success) {
      setErrorMessage(res.error || "Login failed. Please verify your credentials.");
    }
  };

  const handleInitiateTransfer = async () => {
    if (!transferUserId) return;
    setIsTransferBusy(true);
    setTransferError("");

    const res = await requestDeviceTransfer(transferUserId, password);
    setIsTransferBusy(false);

    if (res.success) {
      setTransferStep("OTP");
      setTransferOtp("");
      setResendSeconds(res.resendCooldownSeconds ?? 30);
      setDevTestCode(res.devTestCode || null);
    } else {
      setTransferError(res.error || "Failed to initiate device transfer.");
    }
  };

  const handleVerifyTransfer = async () => {
    if (!transferUserId) return;
    if (transferOtp.trim().length !== 6) {
      setTransferError("Please enter the 6-digit transfer code.");
      return;
    }

    setIsTransferBusy(true);
    setTransferError("");

    const res = await verifyDeviceTransfer(transferUserId, transferOtp.trim());
    setIsTransferBusy(false);

    if (res.success) {
      setShowTransferModal(false);
    } else {
      setTransferError(res.error || "Invalid transfer code. Please try again.");
    }
  };

  const handleForgotPassword = () => {
    navigation.navigate("ForgotPassword");
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
              >
                <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <AvaranLogo size="sm" showText={false} />
            </View>

            {/* Welcome Message */}
            <View style={styles.welcomeSection}>
              <Text style={styles.welcomeTitle}>Welcome back</Text>
              <Text style={styles.welcomeSubtitle}>
                Secure access to your Avaran protection account
              </Text>
            </View>

            {/* Error Banner with smooth animation */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.threat} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Form Group */}
            <View style={styles.formGroup}>
              <TextInput
                label="Email or mobile number"
                placeholder="e.g. rahul@example.com or +91 98765 43210"
                value={identifier}
                onChangeText={(text) => {
                  setIdentifier(text);
                  if (errorMessage) setErrorMessage("");
                }}
                icon="person-outline"
                autoCapitalize="none"
                autoComplete="username"
              />

              <TextInput
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (errorMessage) setErrorMessage("");
                }}
                icon="lock-closed-outline"
                isPassword
                autoComplete="current-password"
              />

              <View style={styles.forgotRow}>
                <TouchableOpacity
                  onPress={handleForgotPassword}
                  style={styles.forgotBtn}
                  activeOpacity={0.6}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Forgot password"
                >
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Primary CTA */}
            <Button
              label={isLoading ? "Logging in..." : "LOG IN"}
              onPress={handleLogin}
              loading={isLoading}
              disabled={isLoading}
              variant="primary"
              size="lg"
              icon="arrow-forward"
              iconPosition="right"
              style={styles.submitBtn}
            />

            {/* Switch to Create Account */}
            <TouchableOpacity
              style={styles.switchModeLink}
              onPress={() => navigation.navigate("CreateAccount")}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Don't have an account? Create Account"
            >
              <Text style={styles.switchModeText}>
                Don't have an account? <Text style={styles.switchModeBold}>Create Account</Text>
              </Text>
            </TouchableOpacity>

            {/* Footer Note */}
            <View style={styles.footerNote}>
              <Ionicons name="shield-checkmark" size={14} color={colors.brand} />
              <Text style={styles.footerNoteText}>Protected by Avaran Single-Device Shield</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      {/* DEVICE TRANSFER MODAL */}
      <Modal
        visible={showTransferModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTransferModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.transferCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.badgeIconWrap}>
                <Ionicons name="phone-portrait-outline" size={24} color={colors.brand} />
              </View>
              <TouchableOpacity
                onPress={() => setShowTransferModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalTitle}>Device Transfer Required</Text>
            <Text style={styles.modalSubtitle}>
              This account is currently secured to another device. Avaran accounts are bound to a single trusted device for protection against unauthorized access.
            </Text>

            {transferError ? (
              <View style={styles.transferErrorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.threat} />
                <Text style={styles.transferErrorText}>{transferError}</Text>
              </View>
            ) : null}

            {transferStep === "PROMPT" ? (
              <View style={styles.modalActions}>
                <Button
                  label={isTransferBusy ? "Requesting..." : "Transfer to this Device"}
                  onPress={handleInitiateTransfer}
                  loading={isTransferBusy}
                  variant="primary"
                  size="lg"
                  icon="shield-checkmark-outline"
                  style={{ width: "100%" }}
                />
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowTransferModal(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.otpSection}>
                <Text style={styles.otpPrompt}>
                  Enter the 6-digit code for {transferMaskedContact}:
                </Text>

                {devTestCode ? (
                  <View style={styles.devSandboxBox}>
                    <Ionicons name="code-working" size={14} color={colors.textSecondary} />
                    <Text style={styles.devSandboxText}>
                      Dev Code: <Text style={{ fontWeight: "700" }}>{devTestCode}</Text>
                    </Text>
                  </View>
                ) : null}

                <TextInput
                  placeholder="000000"
                  value={transferOtp}
                  onChangeText={setTransferOtp}
                  keyboardType="numeric"
                  maxLength={6}
                  autoFocus
                  style={styles.otpInput}
                />

                <Button
                  label={isTransferBusy ? "Authorizing..." : "Authorize & Bind Device"}
                  onPress={handleVerifyTransfer}
                  loading={isTransferBusy}
                  variant="primary"
                  size="lg"
                  icon="checkmark-circle-outline"
                  style={{ width: "100%", marginTop: spacing.sm }}
                />

                <TouchableOpacity
                  style={[styles.resendBtn, resendSeconds > 0 && { opacity: 0.5 }]}
                  disabled={resendSeconds > 0 || isTransferBusy}
                  onPress={handleInitiateTransfer}
                >
                  <Text style={styles.resendText}>
                    {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
  formGroup: {
    marginBottom: spacing.sm,
  },
  forgotRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  forgotBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  forgotText: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: "600",
    fontSize: 13,
  },
  submitBtn: {
    marginTop: spacing.sm,
  },
  switchModeLink: {
    alignItems: "center",
    marginTop: spacing.xl,
    paddingVertical: spacing.xs,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  transferCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.xl,
    ...shadows.lg,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  badgeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  modalTitle: {
    ...typography.h2,
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    ...typography.body,
    fontSize: 13.5,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: spacing.lg,
  },
  transferErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.threatSurface,
    borderWidth: 1,
    borderColor: colors.threatBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  transferErrorText: {
    ...typography.small,
    color: colors.threat,
    fontSize: 12.5,
    flex: 1,
  },
  modalActions: {
    alignItems: "center",
    gap: spacing.sm,
  },
  cancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cancelBtnText: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 13.5,
  },
  otpSection: {
    width: "100%",
  },
  otpPrompt: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  devSandboxBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    gap: 6,
  },
  devSandboxText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
  },
  otpInput: {
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 8,
  },
  resendBtn: {
    alignSelf: "center",
    marginTop: spacing.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  resendText: {
    ...typography.smallSemibold,
    color: colors.textSecondary,
    fontSize: 13,
  },
});
