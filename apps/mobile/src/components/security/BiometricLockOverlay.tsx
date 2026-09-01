import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { useBiometrics } from "../../context/BiometricContext";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../common/Button";
import { AvaranLogo } from "../common/AvaranLogo";
import { AppLockService } from "../../services/app-lock-service";

export const BiometricLockOverlay: React.FC = () => {
  const { isAuthenticated, logout } = useAuth();
  const {
    isLocked,
    isAuthenticating,
    isPinConfigured,
    biometricStatus,
    authError,
    unlockWithBiometrics,
    unlockWithPin,
  } = useBiometrics();

  const [mode, setMode] = useState<"biometric" | "pin">("biometric");
  const [enteredPin, setEnteredPin] = useState<string>("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [lockoutTimer, setLockoutTimer] = useState<number>(0);

  // Check lockout on render and mode switch
  useEffect(() => {
    let interval: any = null;
    const checkLockout = async () => {
      const status = await AppLockService.isLockedOut();
      if (status.lockedOut) {
        setLockoutTimer(status.remainingSeconds);
      } else {
        setLockoutTimer(0);
      }
    };

    if (isLocked) {
      checkLockout();
      interval = setInterval(() => {
        setLockoutTimer((prev) => {
          if (prev <= 1) {
            checkLockout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLocked, mode]);

  // Handle numeric key press
  const handleKeyPress = async (val: string) => {
    if (lockoutTimer > 0) return;
    if (enteredPin.length >= 6) return;

    const nextPin = enteredPin + val;
    setEnteredPin(nextPin);
    setPinError(null);

    if (nextPin.length === 6) {
      const res = await unlockWithPin(nextPin);
      if (!res.success) {
        setEnteredPin("");
        setPinError(res.error || "Incorrect PIN. Please try again.");
        if (res.lockoutRemainingSeconds) {
          setLockoutTimer(res.lockoutRemainingSeconds);
        }
      } else {
        setEnteredPin("");
        setPinError(null);
      }
    }
  };

  const handleBackspace = () => {
    if (lockoutTimer > 0) return;
    if (enteredPin.length > 0) {
      setEnteredPin(enteredPin.slice(0, -1));
      setPinError(null);
    }
  };

  if (!isAuthenticated || !isLocked) {
    return null;
  }

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
          {mode === "biometric" ? (
            <>
              <View style={styles.iconCircle}>
                <Ionicons
                  name={(biometricStatus.iconName as any) || "finger-print-outline"}
                  size={36}
                  color={colors.brand}
                />
              </View>

              <Text style={styles.cardTitle}>App Locked</Text>
              <Text style={styles.cardSubtitle}>
                Verify your identity to access Avaran
              </Text>

              {authError ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.threat} />
                  <Text style={styles.errorText}>{authError}</Text>
                </View>
              ) : null}

              <View style={styles.actionContainer}>
                <Button
                  label={isAuthenticating ? "Verifying..." : "Unlock securely"}
                  onPress={unlockWithBiometrics}
                  loading={isAuthenticating}
                  variant="primary"
                  size="lg"
                  icon={(biometricStatus.iconName as any) || "finger-print-outline"}
                  style={{ width: "100%" }}
                />

                {isPinConfigured ? (
                  <Button
                    label="Use 6-Digit PIN Instead"
                    onPress={() => {
                      setMode("pin");
                      setPinError(null);
                      setEnteredPin("");
                    }}
                    variant="outline"
                    size="md"
                    icon="keypad-outline"
                    style={{ width: "100%", marginTop: spacing.xs }}
                  />
                ) : null}
              </View>
            </>
          ) : (
            <>
              <View style={styles.iconCircle}>
                <Ionicons name="keypad-outline" size={32} color={colors.brand} />
              </View>

              <Text style={styles.cardTitle}>Enter App PIN</Text>
              <Text style={styles.cardSubtitle}>
                Enter your 6-digit application unlock PIN
              </Text>

              {lockoutTimer > 0 ? (
                <View style={styles.errorBox}>
                  <Ionicons name="lock-closed" size={16} color={colors.threat} />
                  <Text style={styles.errorText}>
                    Temporarily locked for {lockoutTimer}s due to failed attempts
                  </Text>
                </View>
              ) : (pinError || authError) ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.threat} />
                  <Text style={styles.errorText}>{pinError || authError}</Text>
                </View>
              ) : null}

              {/* PIN Dots Indicator */}
              <View style={styles.pinDotsRow}>
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const isFilled = enteredPin.length > idx;
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.pinDot,
                        isFilled && styles.pinDotFilled,
                        lockoutTimer > 0 && styles.pinDotDisabled,
                      ]}
                    />
                  );
                })}
              </View>

              {/* Numeric Keypad */}
              <View style={styles.keypadGrid}>
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "switch", "0", "back"].map(
                  (key) => {
                    if (key === "switch") {
                      return (
                        <TouchableOpacity
                          key="switch"
                          style={styles.keypadButtonSpecial}
                          onPress={() => {
                            setMode("biometric");
                            setEnteredPin("");
                            setPinError(null);
                          }}
                        >
                          <Ionicons
                            name={(biometricStatus.iconName as any) || "finger-print-outline"}
                            size={22}
                            color={colors.brand}
                          />
                        </TouchableOpacity>
                      );
                    }
                    if (key === "back") {
                      return (
                        <TouchableOpacity
                          key="back"
                          style={styles.keypadButtonSpecial}
                          onPress={handleBackspace}
                          disabled={lockoutTimer > 0 || enteredPin.length === 0}
                        >
                          <Ionicons
                            name="backspace-outline"
                            size={22}
                            color={enteredPin.length > 0 ? colors.textPrimary : colors.textMuted}
                          />
                        </TouchableOpacity>
                      );
                    }

                    return (
                      <TouchableOpacity
                        key={key}
                        style={[
                          styles.keypadButton,
                          lockoutTimer > 0 && styles.keypadButtonDisabled,
                        ]}
                        onPress={() => handleKeyPress(key)}
                        disabled={lockoutTimer > 0 || isAuthenticating}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.keypadText,
                            lockoutTimer > 0 && styles.keypadTextDisabled,
                          ]}
                        >
                          {key}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                )}
              </View>

              <TouchableOpacity
                style={styles.switchModeButton}
                onPress={() => {
                  setMode("biometric");
                  setEnteredPin("");
                  setPinError(null);
                }}
              >
                <Text style={styles.switchModeText}>Switch to Biometrics</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Security Badge Footnote */}
        <View style={styles.footnoteRow}>
          <Ionicons name="shield-checkmark" size={13} color={colors.textMuted} />
          <Text style={styles.footnoteText}>
            Protected by Local Application Shield
          </Text>
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
  brandTitle: {
    fontFamily: typography.brandTitle.fontFamily,
    color: colors.textPrimary,
    letterSpacing: 4.5,
    fontWeight: "600",
    fontSize: 16.5,
    textTransform: "uppercase",
  },
  lockCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    ...shadows.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
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
    fontSize: 13.5,
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
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    width: "100%",
    gap: spacing.xs,
  },
  errorText: {
    ...typography.small,
    color: colors.threat,
    fontSize: 12.5,
    flex: 1,
  },
  pinDotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: "transparent",
  },
  pinDotFilled: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  pinDotDisabled: {
    borderColor: colors.textMuted,
    opacity: 0.5,
  },
  keypadGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: 260,
    marginBottom: spacing.md,
  },
  keypadButton: {
    width: 70,
    height: 60,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  keypadButtonDisabled: {
    opacity: 0.4,
  },
  keypadButtonSpecial: {
    width: 70,
    height: 60,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  keypadText: {
    fontSize: 22,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  keypadTextDisabled: {
    color: colors.textMuted,
  },
  switchModeButton: {
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
  switchModeText: {
    ...typography.small,
    color: colors.brand,
    fontWeight: "600",
  },
  actionContainer: {
    width: "100%",
    alignItems: "center",
    gap: spacing.sm,
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
    fontSize: 11.5,
    letterSpacing: 0.3,
  },
});
