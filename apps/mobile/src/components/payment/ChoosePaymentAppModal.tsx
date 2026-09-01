import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Platform,
  ActivityIndicator,
  AppState,
  AppStateStatus,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import {
  PaymentAppLauncherService,
  TargetPaymentApp,
  UPIPaymentDetails,
} from "../../services/payment-app-launcher-service";
import {
  ConnectedAppsService,
  ConnectedApp,
} from "../../services/connected-apps-service";
import { UserTransaction } from "../../services/payment-service";

interface ChoosePaymentAppModalProps {
  visible: boolean;
  transaction: UserTransaction | null;
  onClose: () => void;
  onPaymentCompleted: (transactionId: string) => void;
  onShowToast: (message: string, type?: "info" | "success" | "warning") => void;
}

interface CombinedPaymentAppOption {
  id: string;
  name: string;
  packageName: string;
  scheme: string;
  iconName: "logo-google" | "wallet-outline" | "card-outline" | "swap-horizontal-outline" | "business-outline";
  isInstalled: boolean;
  isEnabledInProfile: boolean;
  isReadyToPay: boolean;
  statusLabel: "READY TO PAY" | "DISABLED" | "NOT INSTALLED";
}

export const ChoosePaymentAppModal: React.FC<ChoosePaymentAppModalProps> = ({
  visible,
  transaction,
  onClose,
  onPaymentCompleted,
  onShowToast,
}) => {
  const [appOptions, setAppOptions] = useState<CombinedPaymentAppOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [launchingAppId, setLaunchingAppId] = useState<string | null>(null);
  const [isAwaitingReturn, setIsAwaitingReturn] = useState<boolean>(false);
  const [selectedApp, setSelectedApp] = useState<CombinedPaymentAppOption | null>(null);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const hasLaunchedExternalAppRef = useRef<boolean>(false);

  // Sync with ConnectedAppsService & device installed apps
  useEffect(() => {
    if (!visible) return;

    setIsAwaitingReturn(false);
    setLaunchingAppId(null);
    setSelectedApp(null);
    hasLaunchedExternalAppRef.current = false;
    setIsLoading(true);

    const refreshAppList = async (connectedList: ConnectedApp[]) => {
      const detected = await PaymentAppLauncherService.getAvailablePaymentApps(true);

      const combined: CombinedPaymentAppOption[] = detected.map((devApp) => {
        const matchingConfig = connectedList.find((c) => c.id === devApp.id);
        const isEnabledInProfile = matchingConfig ? matchingConfig.isProtected : true;
        const isInstalled = devApp.isInstalled;
        const isReadyToPay = isEnabledInProfile && isInstalled;

        let statusLabel: "READY TO PAY" | "DISABLED" | "NOT INSTALLED" = "READY TO PAY";
        if (!isEnabledInProfile) {
          statusLabel = "DISABLED";
        } else if (!isInstalled) {
          statusLabel = "NOT INSTALLED";
        }

        return {
          ...devApp,
          isEnabledInProfile,
          isReadyToPay,
          statusLabel,
        };
      });

      setAppOptions(combined);
      setIsLoading(false);
    };

    refreshAppList(ConnectedAppsService.getApps());

    const unsubConnected = ConnectedAppsService.subscribe((updated) => {
      refreshAppList(updated);
    });

    return () => {
      unsubConnected();
    };
  }, [visible]);

  // AppState listener to detect return from external payment application
  useEffect(() => {
    if (!visible) return;

    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active" &&
        hasLaunchedExternalAppRef.current
      ) {
        // User returned to AVARAN from the external payment application
        setIsAwaitingReturn(true);
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [visible]);

  if (!transaction) return null;

  const upiDetails: UPIPaymentDetails = {
    payeeUpiId: `${transaction.merchant.toLowerCase().replace(/[^a-z0-9]/g, "")}@upi`,
    payeeName: transaction.merchant,
    amount: transaction.amount,
    currency: "INR",
    transactionNote: `AVARAN Protected Transfer - Ref TXN-${transaction.id}`,
    transactionRef: `TXN-${transaction.id}`,
  };

  const handleSelectApp = async (app: CombinedPaymentAppOption) => {
    if (!app.isEnabledInProfile) {
      onShowToast(`${app.name} is paused in Connected Apps. Enable in Profile.`, "info");
      return;
    }

    if (!app.isInstalled) {
      onShowToast(`${app.name} is not installed on this device`, "info");
      return;
    }

    setLaunchingAppId(app.id);
    setSelectedApp(app);
    onShowToast(`Opening ${app.name}...`, "info");

    const result = await PaymentAppLauncherService.launchPaymentApp(
      {
        id: app.id,
        name: app.name,
        packageName: app.packageName,
        scheme: app.scheme,
        iconName: app.iconName,
        isInstalled: app.isInstalled,
        isSupported: true,
      },
      upiDetails
    );

    setLaunchingAppId(null);

    if (result.success) {
      hasLaunchedExternalAppRef.current = true;
      setIsAwaitingReturn(true);
      onShowToast(`${app.name} opened. Complete payment and return to AVARAN.`, "success");
    } else {
      onShowToast(result.error || `Unable to open ${app.name}`, "warning");
    }
  };

  const handleConfirmCompletion = () => {
    onPaymentCompleted(transaction.id);
    onShowToast("✓ Payment verified & marked as completed", "success");
    onClose();
  };

  const handleCancelCompletion = () => {
    setIsAwaitingReturn(false);
    onShowToast("Payment incomplete. You can retry or choose another app.", "info");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.modalCard}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={styles.headerLeft}>
                  <View style={styles.iconBox}>
                    <Ionicons name="shield-checkmark" size={20} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>
                      {isAwaitingReturn ? "Confirm Payment Status" : "Choose Connected Payment App"}
                    </Text>
                    <Text style={styles.modalSub}>
                      {isAwaitingReturn
                        ? `Returned from ${selectedApp?.name || "Payment App"}`
                        : `Pay ₹${transaction.amount.toLocaleString("en-IN")} to ${transaction.merchant}`}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Body: Awaiting Return vs List of Apps */}
              {isAwaitingReturn ? (
                <View style={styles.returnBox}>
                  <View style={styles.returnIconCircle}>
                    <Ionicons name="checkmark-circle-outline" size={36} color={colors.brand} />
                  </View>
                  <Text style={styles.returnHeading}>Did you complete the payment?</Text>
                  <Text style={styles.returnSub}>
                    AVARAN recorded the transfer attempt to {transaction.merchant} (₹{transaction.amount.toLocaleString("en-IN")}).
                  </Text>

                  <View style={styles.returnActionsRow}>
                    <TouchableOpacity
                      style={styles.completeBtn}
                      onPress={handleConfirmCompletion}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark-done" size={16} color={colors.btnPrimaryText} style={{ marginRight: 6 }} />
                      <Text style={styles.completeBtnText}>YES — PAYMENT COMPLETED</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.notCompletedBtn}
                      onPress={handleCancelCompletion}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.notCompletedBtnText}>NO — PAYMENT NOT COMPLETED</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.appListContainer}>
                  <Text style={styles.sectionHeading}>CONNECTED & ACTIVE PAYMENT APPS</Text>

                  {isLoading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color={colors.brand} />
                      <Text style={styles.loadingText}>Verifying installed payment apps...</Text>
                    </View>
                  ) : (
                    <ScrollView style={styles.appsScroll} showsVerticalScrollIndicator={false}>
                      {appOptions.map((app) => {
                        const isLaunching = launchingAppId === app.id;
                        const isClickable = app.isReadyToPay;

                        return (
                          <TouchableOpacity
                            key={app.id}
                            style={[
                              styles.appRow,
                              !isClickable && styles.appRowDisabled,
                              ...(Platform.OS === "web" && isClickable ? [{ cursor: "pointer" } as any] : []),
                            ]}
                            onPress={() => handleSelectApp(app)}
                            disabled={!isClickable || isLaunching}
                            activeOpacity={0.7}
                          >
                            <View style={styles.appLeft}>
                              <View
                                style={[
                                  styles.appIconCircle,
                                  !isClickable && styles.appIconCircleDisabled,
                                ]}
                              >
                                <Ionicons
                                  name={app.iconName}
                                  size={20}
                                  color={isClickable ? colors.brand : colors.textMuted}
                                />
                              </View>
                              <View style={styles.appTextCol}>
                                <Text
                                  style={[
                                    styles.appName,
                                    !isClickable && styles.appNameDisabled,
                                  ]}
                                >
                                  {app.name}
                                </Text>
                                <Text style={styles.appProtectedTag}>
                                  {!app.isEnabledInProfile
                                    ? "Paused in Profile → Connected Apps"
                                    : app.isInstalled
                                    ? "Protected & Connected"
                                    : "Not installed on device"}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.appRight}>
                              {isLaunching ? (
                                <ActivityIndicator size="small" color={colors.brand} />
                              ) : (
                                <View
                                  style={[
                                    styles.badgePill,
                                    app.statusLabel === "READY TO PAY"
                                      ? styles.badgePillReady
                                      : app.statusLabel === "DISABLED"
                                      ? styles.badgePillDisabled
                                      : styles.badgePillOffline,
                                  ]}
                                >
                                  <View
                                    style={[
                                      styles.badgeDot,
                                      app.statusLabel === "READY TO PAY"
                                        ? styles.badgeDotReady
                                        : app.statusLabel === "DISABLED"
                                        ? styles.badgeDotDisabled
                                        : styles.badgeDotOffline,
                                    ]}
                                  />
                                  <Text
                                    style={[
                                      styles.badgeText,
                                      app.statusLabel === "READY TO PAY"
                                        ? styles.badgeTextReady
                                        : app.statusLabel === "DISABLED"
                                        ? styles.badgeTextDisabled
                                        : styles.badgeTextOffline,
                                    ]}
                                  >
                                    {app.statusLabel}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
    ...(Platform.OS === "web"
      ? ({
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
        } as any)
      : {}),
  },
  modalCard: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...shadows.lg,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  modalSub: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  appListContainer: {
    marginTop: spacing.md,
  },
  sectionHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    letterSpacing: 0.6,
    fontSize: 10,
    marginBottom: spacing.sm,
  },
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  loadingText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
  },
  appsScroll: {
    maxHeight: 300,
  },
  appRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    borderRadius: radii.md,
  },
  appRowDisabled: {
    opacity: 0.5,
  },
  appLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  appIconCircle: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  appIconCircleDisabled: {
    backgroundColor: colors.surface,
  },
  appTextCol: {
    flex: 1,
  },
  appName: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  appNameDisabled: {
    color: colors.textMuted,
  },
  appProtectedTag: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textTransform: "none",
  },
  appRight: {
    alignItems: "flex-end",
  },
  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  badgePillReady: {
    backgroundColor: colors.safe,
    borderColor: colors.safeDark,
  },
  badgePillDisabled: {
    backgroundColor: colors.caution,
    borderColor: colors.caution,
  },
  badgePillOffline: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.borderLight,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeDotReady: {
    backgroundColor: colors.textInverse,
  },
  badgeDotDisabled: {
    backgroundColor: colors.textInverse,
  },
  badgeDotOffline: {
    backgroundColor: colors.textMuted,
  },
  badgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: "700",
  },
  badgeTextReady: {
    color: colors.textInverse,
  },
  badgeTextDisabled: {
    color: colors.textInverse,
  },
  badgeTextOffline: {
    color: colors.textMuted,
  },
  returnBox: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  returnIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(23, 23, 23, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  returnHeading: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  returnSub: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: "center",
    maxWidth: "90%",
    marginBottom: spacing.md,
  },
  returnActionsRow: {
    width: "100%",
    gap: spacing.sm,
  },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.btnPrimaryBg,
    borderRadius: radii.md,
    paddingVertical: 12,
    width: "100%",
    ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
  },
  completeBtnText: {
    ...typography.bodySemibold,
    color: colors.btnPrimaryText,
    fontWeight: "700",
    fontSize: 14,
  },
  notCompletedBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.md,
    paddingVertical: 11,
    width: "100%",
    ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
  },
  notCompletedBtnText: {
    ...typography.smallSemibold,
    color: colors.textSecondary,
    fontSize: 13,
  },
});
