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
  const { login, isLoading } = useAuth();

  // Log in form state
  const [identifier, setIdentifier] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

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
    if (!res.success) {
      setErrorMessage(res.error || "Login failed. Please verify your credentials.");
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
            <Text style={styles.welcomeTitle}>Welcome back</Text>
            <Text style={styles.welcomeSubtitle}>
              Secure access to your Avaran account
            </Text>
          </View>

          {/* Error */}
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.threat} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Form */}
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
            onPress={() => navigation.navigate("CreateAccount")}
            activeOpacity={0.7}
          >
            <Text style={styles.switchModeText}>
              Don't have an account? <Text style={styles.switchModeBold}>Create Account</Text>
            </Text>
          </TouchableOpacity>

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
