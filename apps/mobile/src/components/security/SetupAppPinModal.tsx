import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { useBiometrics } from "../../context/BiometricContext";

interface SetupAppPinModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SetupAppPinModal: React.FC<SetupAppPinModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const { setupPin, isPinConfigured } = useBiometrics();
  const [step, setStep] = useState<1 | 2>(1);
  const [firstPin, setFirstPin] = useState<string>("");
  const [confirmPin, setConfirmPin] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const activePin = step === 1 ? firstPin : confirmPin;

  const handleKeyPress = async (val: string) => {
    if (activePin.length >= 6) return;
    const next = activePin + val;
    setError(null);

    if (step === 1) {
      setFirstPin(next);
      if (next.length === 6) {
        // Move to step 2 after a brief delay
        setTimeout(() => {
          setStep(2);
        }, 150);
      }
    } else {
      setConfirmPin(next);
      if (next.length === 6) {
        if (next !== firstPin) {
          setError("PINs do not match. Please start over.");
          setTimeout(() => {
            setStep(1);
            setFirstPin("");
            setConfirmPin("");
          }, 800);
        } else {
          // Success: save PIN
          const res = await setupPin(next);
          if (res.success) {
            Alert.alert("Success", "6-digit App PIN configured successfully.");
            handleResetAndClose();
            if (onSuccess) onSuccess();
          } else {
            setError(res.error || "Failed to configure PIN.");
          }
        }
      }
    }
  };

  const handleBackspace = () => {
    setError(null);
    if (step === 1) {
      if (firstPin.length > 0) setFirstPin(firstPin.slice(0, -1));
    } else {
      if (confirmPin.length > 0) {
        setConfirmPin(confirmPin.slice(0, -1));
      } else {
        // Go back to step 1
        setStep(1);
      }
    }
  };

  const handleResetAndClose = () => {
    setStep(1);
    setFirstPin("");
    setConfirmPin("");
    setError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleResetAndClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Close Header */}
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>
              {isPinConfigured ? "CHANGE APP PIN" : "SET UP APP PIN"}
            </Text>
            <TouchableOpacity onPress={handleResetAndClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.iconCircle}>
            <Ionicons name="keypad" size={28} color={colors.brand} />
          </View>

          <Text style={styles.stepTitle}>
            {step === 1 ? "Enter New 6-Digit PIN" : "Confirm 6-Digit PIN"}
          </Text>
          <Text style={styles.stepSubtitle}>
            {step === 1
              ? "Choose a 6-digit numeric PIN to unlock Avaran"
              : "Re-enter your 6-digit PIN to confirm"}
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.threat} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Dots Indicator */}
          <View style={styles.pinDotsRow}>
            {[0, 1, 2, 3, 4, 5].map((idx) => {
              const isFilled = activePin.length > idx;
              return (
                <View
                  key={idx}
                  style={[styles.pinDot, isFilled && styles.pinDotFilled]}
                />
              );
            })}
          </View>

          {/* Keypad */}
          <View style={styles.keypadGrid}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "cancel", "0", "back"].map(
              (key) => {
                if (key === "cancel") {
                  return (
                    <TouchableOpacity
                      key="cancel"
                      style={styles.keypadButtonSpecial}
                      onPress={handleResetAndClose}
                    >
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                  );
                }
                if (key === "back") {
                  return (
                    <TouchableOpacity
                      key="back"
                      style={styles.keypadButtonSpecial}
                      onPress={handleBackspace}
                      disabled={activePin.length === 0}
                    >
                      <Ionicons
                        name="backspace-outline"
                        size={22}
                        color={activePin.length > 0 ? colors.textPrimary : colors.textMuted}
                      />
                    </TouchableOpacity>
                  );
                }

                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.keypadButton}
                    onPress={() => handleKeyPress(key)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.keypadText}>{key}</Text>
                  </TouchableOpacity>
                );
              }
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    ...shadows.lg,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontFamily: typography.brandTitle.fontFamily,
    fontSize: 13,
    color: colors.textSecondary,
    letterSpacing: 2,
    fontWeight: "600",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  stepTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  stepSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12.5,
    marginBottom: spacing.lg,
    textAlign: "center",
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
  keypadGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: 260,
    marginBottom: spacing.sm,
  },
  keypadButton: {
    width: 70,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  keypadButtonSpecial: {
    width: 70,
    height: 56,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  keypadText: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  cancelText: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: "500",
  },
});
