import React, { useState, useRef, useEffect } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii } from "../theme/layout";
import { AvaranLogo } from "../components/common/AvaranLogo";
import { TextInput } from "../components/common/TextInput";
import { Button } from "../components/common/Button";
import { useAuth } from "../context/AuthContext";

export const NewPasswordScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { resetPassword, isLoading } = useAuth();

  const resetToken = route.params?.resetToken || "";

  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [confirmTouched, setConfirmTouched] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const enterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enterAnim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [enterAnim]);

  // Real-time password requirement analysis
  const hasMinLength = password.length >= 10;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const isPasswordValid =
    hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;

  const passwordsMatch =
    password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const confirmMismatch =
    confirmTouched && confirmPassword.length > 0 && password !== confirmPassword;

  // Calculate password strength indicator
  const getPasswordStrength = () => {
    if (!password) return { score: 0, label: "", color: colors.borderLight };
    let score = 0;
    if (hasMinLength) score++;
    if (hasUppercase) score++;
    if (hasLowercase) score++;
    if (hasNumber) score++;
    if (hasSpecial) score++;
    if (password.length >= 14) score++;

    if (score <= 2) return { score: 1, label: "Weak", color: colors.threat };
    if (score <= 4) return { score: 2, label: "Medium", color: colors.caution };
    return { score: 3, label: "Strong", color: colors.safe };
  };

  const passwordStrength = getPasswordStrength();
  const isFormValid = isPasswordValid && passwordsMatch;

  const handleSubmit = async () => {
    setErrorMessage("");
    if (!isPasswordValid) {
      setErrorMessage("Please ensure your password satisfies all security requirements.");
      return;
    }
    if (!passwordsMatch) {
      setErrorMessage("Password and confirmation password do not match.");
      return;
    }

    const res = await resetPassword(resetToken, password);
    if (res.success) {
      Alert.alert(
        "Password Reset Successful",
        "Your password has been updated successfully. For your security, all active sessions have been revoked. Please sign in with your new password.",
        [
          {
            text: "Sign In",
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: "Login" }],
              });
            },
          },
        ],
        { cancelable: false }
      );
    } else {
      setErrorMessage(res.error || "Password reset failed. Please try again.");
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
            <View style={styles.welcomeSection}>
              <Text style={styles.welcomeTitle}>Create New Password</Text>
              <Text style={styles.welcomeSubtitle}>
                Choose a strong, unique password to secure your Avaran protection account.
              </Text>
            </View>

            {/* Error Box */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.threat} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Password Inputs */}
            <View style={styles.formGroup}>
              <TextInput
                label="New Password"
                placeholder="Create strong password"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (errorMessage) setErrorMessage("");
                }}
                icon="lock-closed-outline"
                isPassword
                autoComplete="new-password"
                textContentType="newPassword"
              />

              {/* Password Strength Indicator */}
              {password.length > 0 && (
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
                    {passwordStrength.label}
                  </Text>
                </View>
              )}

              {/* Password Requirements Checklist */}
              {password.length > 0 && (
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
                label="Confirm New Password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  setConfirmTouched(true);
                  if (errorMessage) setErrorMessage("");
                }}
                onFocus={() => {
                  if (confirmPassword.length > 0) {
                    setConfirmTouched(true);
                  }
                }}
                icon="lock-closed-outline"
                isPassword
                autoComplete="new-password"
                textContentType="newPassword"
              />

              {confirmMismatch && (
                <View style={styles.inlineErrorRow}>
                  <Ionicons name="alert-circle-outline" size={13} color={colors.threat} />
                  <Text style={styles.inlineErrorText}>Passwords do not match</Text>
                </View>
              )}
            </View>

            {/* Submit Button */}
            <Button
              label={isLoading ? "Updating..." : "RESET PASSWORD"}
              onPress={handleSubmit}
              loading={isLoading}
              disabled={isLoading || !isFormValid}
              variant="primary"
              size="lg"
              icon="checkmark-circle-outline"
              iconPosition="right"
              style={styles.submitBtn}
            />

            {/* Footer */}
            <View style={styles.footerNote}>
              <Ionicons name="shield-checkmark" size={14} color={colors.brand} />
              <Text style={styles.footerNoteText}>Protected by Argon2id & Single-Device Security</Text>
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
  welcomeSection: {
    marginBottom: spacing.lg,
  },
  welcomeTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  welcomeSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 6,
    lineHeight: 21,
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
    marginBottom: spacing.md,
  },
  strengthContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: -4,
    marginBottom: spacing.sm,
  },
  strengthBarsRow: {
    flexDirection: "row",
    flex: 1,
    gap: 4,
    marginRight: spacing.md,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    ...typography.caption,
    fontWeight: "600",
    fontSize: 12,
  },
  checklistCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 6,
  },
  checklistHeader: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
    marginBottom: 2,
  },
  checklistItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checklistText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12.5,
  },
  checklistTextMet: {
    color: colors.textPrimary,
  },
  inlineErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  inlineErrorText: {
    ...typography.small,
    color: colors.threat,
    fontSize: 12,
  },
  submitBtn: {
    marginTop: spacing.sm,
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
