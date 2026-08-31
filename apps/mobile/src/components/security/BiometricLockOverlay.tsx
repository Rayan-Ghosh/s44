import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { useBiometrics } from "../../context/BiometricContext";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../common/Button";
import { TextInput } from "../common/TextInput";
import { AvaranLogo } from "../common/AvaranLogo";

export const BiometricLockOverlay: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const {
    isLocked,
    isAuthenticating,
    biometricStatus,
    authError,
    unlockWithBiometrics,
    unlockWithPasscode,
  } = useBiometrics();

  const [usePinFallback, setUsePinFallback] = useState<boolean>(false);
  const [pinCode, setPinCode] = useState<string>("");

  if (!isAuthenticated || !isLocked) {
    return null;
  }

  const handlePinSubmit = async () => {
    if (pinCode.trim().length >= 4) {
      await unlockWithPasscode(pinCode.trim());
    }
  };

  return (
    <Modal
      visible={isLocked}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Brand Header */}
        <View style={styles.brandRow}>
          <AvaranLogo size="sm" showText={false} />
          <Text style={styles.brandTitle}>AVARAN</Text>
        </View>

        {/* Lock Center Card */}
        <View style={styles.lockCard}>
          <View style={styles.iconCircle}>
            <Ionicons
              name={(biometricStatus.iconName as any) || "finger-print-outline"}
              size={36}
              color={colors.textPrimary}
            />
          </View>

          <Text style={styles.cardTitle}>App Locked</Text>
          <Text style={styles.cardSubtitle}>
            Biometric verification required to access payment protection telemetry and UPI fraud controls.
          </Text>

          {authError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={14} color={colors.threat} />
              <Text style={styles.errorText}>{authError}</Text>
            </View>
          ) : null}

          {!usePinFallback ? (
            <View style={styles.actionContainer}>
              <Button
                label={isAuthenticating ? "Verifying..." : `Unlock with ${biometricStatus.displayName}`}
                onPress={unlockWithBiometrics}
                loading={isAuthenticating}
                variant="primary"
                size="lg"
                icon={(biometricStatus.iconName as any) || "finger-print-outline"}
                style={{ width: "100%" }}
              />

              <TouchableOpacity
                style={styles.fallbackBtn}
                onPress={() => setUsePinFallback(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.fallbackText}>Use Device PIN / Passcode</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.pinContainer}>
              <TextInput
                label="Enter Device PIN or Password"
                placeholder="e.g. 1234"
                value={pinCode}
                onChangeText={setPinCode}
                icon="keypad-outline"
                isPassword
                keyboardType="numeric"
                autoFocus
              />

              <Button
                label="Confirm PIN"
                onPress={handlePinSubmit}
                loading={isAuthenticating}
                variant="primary"
                size="lg"
                style={{ width: "100%", marginTop: spacing.sm }}
              />

              <TouchableOpacity
                style={styles.fallbackBtn}
                onPress={() => {
                  setUsePinFallback(false);
                  unlockWithBiometrics();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.fallbackText}>Back to {biometricStatus.displayName}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Security Badge Footnote */}
        <View style={styles.footnoteRow}>
          <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
          <Text style={styles.footnoteText}>End-to-End Cryptographic Security</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  logoBox: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    letterSpacing: 1.5,
    fontWeight: "800",
    fontSize: 16,
  },
  lockCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    ...shadows.md,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  cardTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.threatSurface,
    borderWidth: 1,
    borderColor: colors.threatBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  errorText: {
    ...typography.small,
    color: colors.threat,
    fontSize: 12,
  },
  actionContainer: {
    width: "100%",
    alignItems: "center",
    gap: spacing.sm,
  },
  pinContainer: {
    width: "100%",
  },
  fallbackBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  fallbackText: {
    ...typography.smallSemibold,
    color: colors.textSecondary,
    fontSize: 13,
  },
  footnoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.sm,
  },
  footnoteText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.4,
  },
});
