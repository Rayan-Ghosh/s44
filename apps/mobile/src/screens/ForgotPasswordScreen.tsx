import React, { useState, useRef, useEffect } from "react";
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
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii } from "../theme/layout";
import { AvaranLogo } from "../components/common/AvaranLogo";
import { TextInput } from "../components/common/TextInput";
import { Button } from "../components/common/Button";
import { useAuth } from "../context/AuthContext";

export const ForgotPasswordScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { requestPasswordReset, isLoading } = useAuth();

  const [identifier, setIdentifier] = useState<string>("");
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

  const handleSubmit = async () => {
    setErrorMessage("");
    const cleanId = identifier.trim();
    if (!cleanId) {
      setErrorMessage("Please enter your registered email or mobile number.");
      return;
    }

    const res = await requestPasswordReset(cleanId);
    if (res.success) {
      navigation.navigate("ResetPasswordOtp", {
        identifier: cleanId,
        maskedContact: res.maskedContact || cleanId,
        resendCooldownSeconds: res.resendCooldownSeconds ?? 30,
        isLiveDelivery: res.isLiveDelivery ?? false,
        devTestCode: res.devTestCode,
      });
    } else {
      setErrorMessage(res.error || "Failed to initiate recovery. Please try again.");
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
              >
                <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <AvaranLogo size="sm" showText={false} />
            </View>

            {/* Header */}
            <View style={styles.welcomeSection}>
              <Text style={styles.welcomeTitle}>Forgot Password</Text>
              <Text style={styles.welcomeSubtitle}>
                Enter your registered email address or mobile number to recover your account securely.
              </Text>
            </View>

            {/* Error Box */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.threat} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Input Form */}
            <View style={styles.formGroup}>
              <TextInput
                label="Registered email or mobile number"
                placeholder="e.g. rahul@example.com or +91 98765 43210"
                value={identifier}
                onChangeText={(text) => {
                  setIdentifier(text);
                  if (errorMessage) setErrorMessage("");
                }}
                icon="mail-outline"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            {/* Submit Button */}
            <Button
              label={isLoading ? "Verifying..." : "CONTINUE"}
              onPress={handleSubmit}
              loading={isLoading}
              disabled={isLoading}
              variant="primary"
              size="lg"
              icon="arrow-forward"
              iconPosition="right"
              style={styles.submitBtn}
            />

            {/* Return to Login */}
            <TouchableOpacity
              style={styles.switchModeLink}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Text style={styles.switchModeText}>
                Remember your password? <Text style={styles.switchModeBold}>Log In</Text>
              </Text>
            </TouchableOpacity>

            {/* Footer */}
            <View style={styles.footerNote}>
              <Ionicons name="shield-checkmark" size={14} color={colors.brand} />
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
});
