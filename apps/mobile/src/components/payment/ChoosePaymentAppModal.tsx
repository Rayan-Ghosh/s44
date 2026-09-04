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
  Linking,
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
import {
  UserTransaction,
  PaymentWorkflowStage,
  validatePaymentSubmissionStage,
  validatePaymentCompletionStage,
  PaymentService,
} from "../../services/payment-service";
import {
  GlobalUpiReturnManager,
  UPI_RETURN_PROMPT_MESSAGE,
  validateManualConfirmationEligibility,
} from "../../utils/upi-return-handler";

interface ChoosePaymentAppModalProps {
  visible: boolean;
  transaction: UserTransaction | null;
  onClose: () => void;
  onPaymentCompleted: (transactionId: string, stage?: any, options?: any) => Promise<{ success: boolean; error?: string } | any> | any;
  onShowToast: (message: string, type?: "info" | "success" | "warning") => void;
  workflowStage?: PaymentWorkflowStage | { stage?: any } | string | null;
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
  workflowStage,
}) => {
  const [appOptions, setAppOptions] = useState<CombinedPaymentAppOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [launchingAppId, setLaunchingAppId] = useState<string | null>(null);
  const [isAwaitingReturn, setIsAwaitingReturn] = useState<boolean>(false);
  const [selectedApp, setSelectedApp] = useState<CombinedPaymentAppOption | null>(null);
  const [isConfirmingCompletion, setIsConfirmingCompletion] = useState<boolean>(false);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const hasLaunchedExternalAppRef = useRef<boolean>(false);
  const isConfirmingRef = useRef<boolean>(false);

  // Sync with ConnectedAppsService & device installed apps
  useEffect(() => {
    if (!visible) {
      isConfirmingRef.current = false;
      GlobalUpiReturnManager.clearAwaitingReturn();
      return;
    }

    setIsAwaitingReturn(false);
    setLaunchingAppId(null);
    setSelectedApp(null);
    hasLaunchedExternalAppRef.current = false;
    isConfirmingRef.current = false;
    setIsLoading(true);

    // PART 3: Build the selectable list from ConnectedAppsService only.
    // KNOWN_PAYMENT_APPS is now only used for the actual UPI URI launch scheme (fallback).
    // The user sees ONLY apps they have configured in Profile → Connected Apps.
    const refreshAppList = async (connectedList: ConnectedApp[]) => {
      // Get device-detected apps for install status cross-reference
      const detected = await PaymentAppLauncherService.getAvailablePaymentApps(true);

      // Filter connected list to UPI-type apps only (banking type has no UPI scheme)
      const upiConnected = connectedList.filter(
        (a) => a.type === "upi" && a.scheme
      );

      if (upiConnected.length === 0) {
        // No connected UPI apps at all — show empty state
        setAppOptions([]);
        setIsLoading(false);
        return;
      }

      const combined: CombinedPaymentAppOption[] = upiConnected.map((connApp) => {
        // Match against device-detected apps for install status
        const devApp = detected.find((d) => d.id === connApp.id);
        // On web, treat as installed (for demo purposes); on native check device
        const isInstalled = devApp ? devApp.isInstalled : Platform.OS === "web";
        const isEnabledInProfile = connApp.isProtected;
        const isReadyToPay = isEnabledInProfile && isInstalled;

        let statusLabel: "READY TO PAY" | "DISABLED" | "NOT INSTALLED" = "READY TO PAY";
        if (!isEnabledInProfile) {
          statusLabel = "DISABLED";
        } else if (!isInstalled) {
          statusLabel = "NOT INSTALLED";
        }

        return {
          id: connApp.id,
          name: connApp.name,
          packageName: connApp.packageName || devApp?.packageName || "",
          scheme: connApp.scheme || devApp?.scheme || "upi://pay",
          iconName: connApp.iconName,
          isInstalled,
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

  // AppState, Linking deep-link, and Web window focus/visibility listeners to detect return safely
  useEffect(() => {
    if (!visible || !transaction) return;

    const processReturn = (incomingUrl?: string | null) => {
      // Must be awaiting return for this transaction
      if (!GlobalUpiReturnManager.isAwaiting(String(transaction.id))) {
        return;
      }

      const returnOutcome = GlobalUpiReturnManager.handleAppReturn(incomingUrl, transaction);
      if (returnOutcome.handled && returnOutcome.shouldPromptUser) {
        setIsAwaitingReturn(true);
        onShowToast(returnOutcome.message || UPI_RETURN_PROMPT_MESSAGE, "info");
      }
    };

    const appStateSub = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      const isComingFromBackground =
        appStateRef.current.match(/inactive|background/) && nextAppState === "active";
      appStateRef.current = nextAppState;

      if (
        isComingFromBackground &&
        (hasLaunchedExternalAppRef.current || GlobalUpiReturnManager.isAwaiting(String(transaction.id)))
      ) {
        processReturn(null);
      }
    });

    const linkingSub = Linking.addEventListener("url", (event: { url: string }) => {
      if (event?.url) {
        processReturn(event.url);
      }
    });

    Linking.getInitialURL()
      .then((initialUrl) => {
        if (initialUrl) {
          processReturn(initialUrl);
        }
      })
      .catch(() => {
        // Ignore initial url read error
      });

    let handleVisibilityChange: (() => void) | undefined;
    let handleWindowFocus: (() => void) | undefined;

    if (Platform.OS === "web" && typeof document !== "undefined") {
      handleVisibilityChange = () => {
        if (
          !document.hidden &&
          (hasLaunchedExternalAppRef.current || GlobalUpiReturnManager.isAwaiting(String(transaction.id)))
        ) {
          processReturn(null);
        }
      };
      handleWindowFocus = () => {
        if (
          hasLaunchedExternalAppRef.current ||
          GlobalUpiReturnManager.isAwaiting(String(transaction.id))
        ) {
          processReturn(null);
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("focus", handleWindowFocus);
    }

    return () => {
      appStateSub.remove();
      linkingSub.remove();
      if (Platform.OS === "web" && typeof document !== "undefined") {
        if (handleVisibilityChange) {
          document.removeEventListener("visibilitychange", handleVisibilityChange);
        }
        if (handleWindowFocus) {
          window.removeEventListener("focus", handleWindowFocus);
        }
      }
    };
  }, [visible, transaction, onShowToast]);

  if (!transaction) return null;

  const upiDetails: UPIPaymentDetails = {
    payeeUpiId: transaction.paymentMethod?.includes("@")
      ? transaction.paymentMethod
      : `${transaction.merchant.toLowerCase().replace(/[^a-z0-9]/g, "")}@upi`,
    payeeName: transaction.merchant,
    amount: transaction.amount,
    currency: "INR",
    transactionNote: `AVARAN Protected Transfer - Ref TXN-${transaction.id}`,
    transactionRef: `TXN-${transaction.id}`,
  };

  const handleSelectApp = async (app: CombinedPaymentAppOption) => {
    if (launchingAppId !== null || !transaction) {
      return;
    }

    if (workflowStage !== undefined) {
      const stageValidation = validatePaymentSubmissionStage(workflowStage);
      if (!stageValidation.valid) {
        onShowToast(stageValidation.error || "Cannot submit payment from this stage", "warning");
        return;
      }
    }

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
    onShowToast(`Submitting payment to ${app.name}...`, "info");

    const stageToSend: PaymentWorkflowStage =
      (typeof workflowStage === "string" ? workflowStage : workflowStage?.stage) || "PAYMENT_SUBMITTED";

    // 1. Submit transaction to backend before launching external UPI app
    const submitResult = await PaymentService.submitTransaction(
      String(transaction.id),
      stageToSend,
      app.name
    );

    if (!submitResult.success) {
      setLaunchingAppId(null);
      setSelectedApp(null);
      onShowToast(submitResult.error || "Failed to submit payment to server", "warning");
      return;
    }

    // 2. Only after successful backend submission response, launch external UPI app
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
      upiDetails,
      stageToSend
    );

    setLaunchingAppId(null);

    if (result.success) {
      hasLaunchedExternalAppRef.current = true;
      GlobalUpiReturnManager.startAwaitingReturn(String(transaction.id));
      setIsAwaitingReturn(true);
      onShowToast(`${app.name} opened. Complete payment and return to AVARAN.`, "success");
    } else {
      onShowToast(result.error || `Unable to open ${app.name}`, "warning");
    }
  };

  const handleClose = () => {
    if (isConfirmingCompletion || isConfirmingRef.current) return;
    GlobalUpiReturnManager.clearAwaitingReturn();
    onClose();
  };

  const handleConfirmCompletion = async () => {
    if (isConfirmingCompletion || isConfirmingRef.current || !transaction) return;

    const hasActiveContext =
      isAwaitingReturn && GlobalUpiReturnManager.isAwaiting(String(transaction.id));

    const eligibility = validateManualConfirmationEligibility(transaction, {
      hasActiveContext,
      stage: workflowStage || "PAYMENT_COMPLETED",
    });

    if (!eligibility.eligible) {
      onShowToast(eligibility.error || "Cannot complete payment from this stage", "warning");
      return;
    }

    if (!GlobalUpiReturnManager.startConfirming(String(transaction.id))) {
      return;
    }

    isConfirmingRef.current = true;
    setIsConfirmingCompletion(true);

    try {
      const res = await onPaymentCompleted(
        String(transaction.id),
        "PAYMENT_COMPLETED",
        { hasActiveContext: true }
      );

      if (res && typeof res === "object" && (res as any).success === false) {
        onShowToast((res as any).error || "Failed to confirm payment on server", "warning");
        setIsConfirmingCompletion(false);
        isConfirmingRef.current = false;
        GlobalUpiReturnManager.finishConfirming(String(transaction.id));
        return;
      }

      GlobalUpiReturnManager.finishConfirming(String(transaction.id));
      GlobalUpiReturnManager.clearAwaitingReturn();
      setIsAwaitingReturn(false);
      onShowToast("✓ Payment verified & marked as completed", "success");
      onClose();
    } catch (err: any) {
      onShowToast(err?.message || "Failed to confirm payment", "warning");
      setIsConfirmingCompletion(false);
      isConfirmingRef.current = false;
      GlobalUpiReturnManager.finishConfirming(String(transaction.id));
    } finally {
      setIsConfirmingCompletion(false);
      isConfirmingRef.current = false;
      GlobalUpiReturnManager.finishConfirming(String(transaction?.id));
    }
  };

  const handleCancelCompletion = () => {
    if (isConfirmingCompletion || isConfirmingRef.current) return;
    GlobalUpiReturnManager.clearAwaitingReturn();
    setIsAwaitingReturn(false);
    onShowToast("Payment incomplete. You can retry or choose another app.", "info");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
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
                  onPress={handleClose}
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
                      style={[
                        styles.completeBtn,
                        isConfirmingCompletion && styles.completeBtnDisabled,
                      ]}
                      onPress={handleConfirmCompletion}
                      disabled={isConfirmingCompletion}
                      activeOpacity={0.8}
                    >
                      {isConfirmingCompletion ? (
                        <ActivityIndicator size="small" color={colors.btnPrimaryText} style={{ marginRight: 6 }} />
                      ) : (
                        <Ionicons name="checkmark-done" size={16} color={colors.btnPrimaryText} style={{ marginRight: 6 }} />
                      )}
                      <Text style={styles.completeBtnText}>
                        {isConfirmingCompletion ? "VERIFYING PAYMENT..." : "YES — PAYMENT COMPLETED"}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.notCompletedBtn,
                        isConfirmingCompletion && styles.btnDisabled,
                      ]}
                      onPress={handleCancelCompletion}
                      disabled={isConfirmingCompletion}
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
                      <Text style={styles.loadingText}>Verifying connected payment apps...</Text>
                    </View>
                  ) : appOptions.length === 0 ? (
                    /* PART 3: Empty state — no UPI apps connected in Profile */
                    <View style={styles.emptyAppsState}>
                      <Ionicons name="link-outline" size={28} color={colors.textMuted} />
                      <Text style={styles.emptyAppsTitle}>No payment apps connected</Text>
                      <Text style={styles.emptyAppsSub}>
                        Go to{" "}
                        <Text style={{ fontWeight: "700", color: colors.brand }}>
                          Profile → Connected Apps
                        </Text>
                        {" "}to add a UPI payment app.
                      </Text>
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
  // PART 3: Empty state styles when no UPI apps are connected in Profile
  emptyAppsState: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  emptyAppsTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyAppsSub: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
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
  completeBtnDisabled: {
    opacity: 0.6,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
