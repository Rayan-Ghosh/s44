import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Animated,
  Easing,
} from "react-native";
import { useRoute, useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii, shadows } from "../theme/layout";
import { Header } from "../components/common/Header";
import { StatusBadge } from "../components/common/StatusBadge";
import { RiskGauge } from "../components/common/RiskGauge";
import { StaggerRevealCard } from "../components/common/StaggerRevealCard";
import { AnimatedAmount } from "../components/common/AnimatedAmount";
import { AiScanBanner } from "../components/common/AiScanBanner";
import { RiskContributionBar, ContributionItem } from "../components/common/RiskContributionBar";
import { RiskTimeline } from "../components/common/RiskTimeline";
import { Button } from "../components/common/Button";
import { FloatingToast, ToastConfig } from "../components/common/FloatingToast";
import { ChoosePaymentAppModal } from "../components/payment/ChoosePaymentAppModal";
import { useAuth } from "../context/AuthContext";
import { useGuardian } from "../context/GuardianContext";
import { BiometricService } from "../services/biometric-service";
import {
  PaymentService,
  UserTransaction,
  UserPaymentOverview,
  EMPTY_PAYMENT_OVERVIEW,
} from "../services/payment-service";

const NewPaymentHighlightCard: React.FC<{
  children: React.ReactNode;
  isNew: boolean;
}> = ({ children, isNew }) => {
  const pulseAnim = useRef(new Animated.Value(isNew ? 0 : 1)).current;

  useEffect(() => {
    if (isNew) {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: false,
        }),
        Animated.delay(1200),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [isNew, pulseAnim]);

  if (!isNew) return <>{children}</>;

  const borderColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.brand],
  });

  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.015],
  });

  return (
    <Animated.View
      style={{
        transform: [{ scale }],
        borderWidth: 1,
        borderColor,
        borderRadius: radii.md,
      }}
    >
      {children}
    </Animated.View>
  );
};

export const PaymentsScreen: React.FC = () => {
  const { width } = useWindowDimensions();
  const route = useRoute<any>();
  const { session } = useAuth();
  const {
    activeRequest,
    countdown,
    paymentOutcome,
    clearPaymentOutcome,
    initiateGuardianRequest,
    isTrustedFeatureEnabled,
    trustedContacts,
  } = useGuardian();

  const isFocused = useIsFocused();
  const [overview, setOverview] = useState<UserPaymentOverview>(EMPTY_PAYMENT_OVERVIEW);
  const [transactions, setTransactions] = useState<UserTransaction[]>([]);
  const [filter, setFilter] = useState<"all" | "review" | "safe">("all");
  const [selectedTx, setSelectedTx] = useState<UserTransaction | null>(null);
  const [awaitingGuardian, setAwaitingGuardian] = useState(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isActing, setIsActing] = useState<boolean>(false);
  const [isAuthorizing, setIsAuthorizing] = useState<boolean>(false);

  // Risk Score Result Reveal & List Stagger Animation States (run once on first view)
  const hasPlayedRevealRef = useRef(false);
  const hasPlayedListStaggerRef = useRef(false);
  const hasInitialSelectionDoneRef = useRef(false);
  const [isAiScanning, setIsAiScanning] = useState<boolean>(true);

  // New Payment Detection Tracking
  const [newlyDetectedIds, setNewlyDetectedIds] = useState<Set<string>>(new Set());
  const knownTxIdsRef = useRef<Set<string>>(new Set());

  // Mark list stagger as completed after initial reveal
  useEffect(() => {
    if (isFocused && !isLoading && !hasPlayedListStaggerRef.current) {
      const timer = setTimeout(() => {
        hasPlayedListStaggerRef.current = true;
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isFocused, isLoading]);

  // Trigger the reveal animation when Payments page is first focused and data is ready
  useEffect(() => {
    if (isFocused && !isLoading && selectedTx && !hasPlayedRevealRef.current) {
      const timer = setTimeout(() => {
        hasPlayedRevealRef.current = true;
      }, 2200);
      return () => clearTimeout(timer);
    }
  }, [isFocused, isLoading, selectedTx]);

  // Modals & Toast State
  const [toastConfig, setToastConfig] = useState<ToastConfig | null>(null);
  const [isChooseAppModalVisible, setIsChooseAppModalVisible] = useState<boolean>(false);

  const showToast = (message: string, type: "info" | "success" | "warning" = "success") => {
    setToastConfig({ message, type });
  };

  const loadPayments = useCallback(async () => {
    try {
      const userId = session?.userId || 1;
      const [ovData, txnData] = await Promise.all([
        PaymentService.getOverview(userId),
        PaymentService.getTransactions(userId, "all"),
      ]);
      setOverview(ovData);
      setTransactions(txnData.items);

      // Auto-select on initial load only once (does not override user's manual close)
      if (!hasInitialSelectionDoneRef.current && txnData.items.length > 0) {
        hasInitialSelectionDoneRef.current = true;
        txnData.items.forEach((t) => knownTxIdsRef.current.add(t.id));

        const requestedId = route.params?.selectedTxId;
        if (requestedId) {
          const found = txnData.items.find(
            (t) => t.id === requestedId || String(t.id) === String(requestedId)
          );
          if (found) {
            setSelectedTx(found);
            return;
          }
        }

        const firstRisk = txnData.items.find(
          (t) => t.status === "Risk detected" || t.status === "Held"
        );
        if (firstRisk) setSelectedTx(firstRisk);
        else setSelectedTx(txnData.items[0]);
      } else if (knownTxIdsRef.current.size > 0) {
        // Detect newly added transaction
        const brandNew = new Set<string>();
        txnData.items.forEach((t) => {
          if (!knownTxIdsRef.current.has(t.id)) {
            brandNew.add(t.id);
            knownTxIdsRef.current.add(t.id);
          }
        });
        if (brandNew.size > 0) {
          setNewlyDetectedIds(brandNew);
          setTimeout(() => setNewlyDetectedIds(new Set()), 3000);
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [session?.userId, route.params?.selectedTxId]);

  useEffect(() => {
    loadPayments();

    // Subscribe to real-time updates from centralized PaymentService
    const unsubscribe = PaymentService.subscribe((updatedOverview, updatedTxns) => {
      setOverview(updatedOverview);
      setTransactions(updatedTxns);

      // Detect newly added transactions in real-time stream
      if (knownTxIdsRef.current.size > 0) {
        const brandNew = new Set<string>();
        updatedTxns.forEach((t) => {
          if (!knownTxIdsRef.current.has(t.id)) {
            brandNew.add(t.id);
            knownTxIdsRef.current.add(t.id);
          }
        });
        if (brandNew.size > 0) {
          setNewlyDetectedIds(brandNew);
          setTimeout(() => setNewlyDetectedIds(new Set()), 3000);
        }
      }

      // Keep selectedTx synchronized with latest status or deselect if no longer matching filter
      setSelectedTx((prev) => {
        if (!prev) return null;
        const fresh = updatedTxns.find((t) => t.id === prev.id);
        if (!fresh) return null;

        // If in "review" tab and this item is now completed/approved, auto-shift to next review item or close
        if (
          filter === "review" &&
          (fresh.isCompleted ||
            fresh.status === "Approved by you" ||
            fresh.status === "Safe" ||
            fresh.status === "Completed" ||
            fresh.status === "Blocked" ||
            fresh.status === "Reported")
        ) {
          const nextReview = updatedTxns.find(
            (t) => t.status === "Risk detected" || t.status === "Held"
          );
          return nextReview || null;
        }

        return fresh;
      });
    });

    return unsubscribe;
  }, [loadPayments, filter]);

  // If navigation param selectedTxId changes, switch selection
  useEffect(() => {
    const requestedId = route.params?.selectedTxId;
    if (requestedId) {
      PaymentService.getTransactions(session?.userId || 1, "all").then((data) => {
        const found = data.items.find(
          (t) => t.id === requestedId || String(t.id) === String(requestedId)
        );
        if (found) {
          setSelectedTx(found);
        }
      });
    }
  }, [route.params?.selectedTxId, session?.userId]);

  // Filtered transactions computed dynamically from centralized state
  const visibleTransactions = useMemo(() => {
    if (filter === "review") {
      return transactions.filter((t) => t.status === "Risk detected" || t.status === "Held");
    }
    if (filter === "safe") {
      return transactions.filter(
        (t) => t.status === "Safe" || t.status === "Approved by you" || t.status === "Completed"
      );
    }
    return transactions;
  }, [transactions, filter]);

  const handleSelectFilter = (newFilter: "all" | "review" | "safe") => {
    setFilter(newFilter);
    let items = transactions;
    if (newFilter === "review") {
      items = transactions.filter((t) => t.status === "Risk detected" || t.status === "Held");
    } else if (newFilter === "safe") {
      items = transactions.filter(
        (t) => t.status === "Safe" || t.status === "Approved by you" || t.status === "Completed"
      );
    }
    if (items.length > 0) {
      setSelectedTx(items[0]);
    }
  };

  // Watch for guardian decision and update UI accordingly
  useEffect(() => {
    if (!awaitingGuardian || !paymentOutcome) return;

    if (paymentOutcome === "APPROVED") {
      setAwaitingGuardian(false);
      showToast("✓ Payment approved by your trusted contact", "success");
      setIsChooseAppModalVisible(true);
      loadPayments();
      clearPaymentOutcome();
    } else if (paymentOutcome === "REJECTED") {
      setAwaitingGuardian(false);
      showToast("⚠ Payment rejected & blocked by trusted contact", "warning");
      loadPayments();
      clearPaymentOutcome();
    } else if (paymentOutcome === "EXPIRED") {
      setAwaitingGuardian(false);
      showToast("Guardian request expired. Payment cancelled.", "info");
      loadPayments();
    }
  }, [paymentOutcome, awaitingGuardian, loadPayments, clearPaymentOutcome]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadPayments();
  };

  const handleAuthorize = async (txId: string) => {
    if (isAuthorizing || isActing) return;
    setIsAuthorizing(true);
    try {
      const authResult = await BiometricService.authenticate(
        "Verify your identity to authorize high-risk payment"
      );
      if (!authResult.success) {
        setIsAuthorizing(false);
        showToast("Verification was not completed. Your payment remains pending.", "info");
        return;
      }

      const res = await PaymentService.authorizeTransaction(
        txId,
        authResult.isFallback ? "DEVICE_CREDENTIAL" : "BIOMETRIC"
      );
      setIsAuthorizing(false);

      if (res.success) {
        showToast("✓ Identity Verified. Completing your secure payment...", "success");
        loadPayments();
        setIsChooseAppModalVisible(true);
      } else {
        showToast(res.error || "Authorization failed. Please try again.", "warning");
      }
    } catch {
      setIsAuthorizing(false);
      showToast("Verification error. Your payment remains pending.", "warning");
    }
  };

  const handleConfirm = async (txId: string) => {
    if (isActing || isAuthorizing) return;
    if (!selectedTx) return;

    if (
      selectedTx.isCompleted ||
      selectedTx.status === "Approved by you" ||
      selectedTx.status === "Safe" ||
      selectedTx.status === "Completed"
    ) {
      showToast("This payment has already been completed", "info");
      return;
    }

    const isHighRisk =
      selectedTx.riskLevel === "HIGH" ||
      (selectedTx.riskScore && selectedTx.riskScore >= 60) ||
      selectedTx.status === "Risk detected" ||
      selectedTx.status === "Held";

    // If high risk and Trusted contact is active, route through Guardian approval flow
    if (isHighRisk && isTrustedFeatureEnabled && trustedContacts.length > 0) {
      initiateGuardianRequest(selectedTx);
      setAwaitingGuardian(true);
      showToast("Awaiting approval from your Trusted Contact...", "info");
      return;
    }

    // High-Risk Biometric Authorization Check
    if (
      isHighRisk &&
      selectedTx.authorizationRequired !== false &&
      selectedTx.authorizationStatus !== "AUTHORIZED"
    ) {
      await handleAuthorize(selectedTx.id);
      return;
    }

    // Otherwise (low/medium risk or guardian disabled), open payment app selector directly
    setIsChooseAppModalVisible(true);
  };

  const handleReport = async (txId: string) => {
    if (isActing) return;
    if (!selectedTx) return;

    if (selectedTx.status === "Reported") {
      showToast("This transaction has already been reported", "info");
      return;
    }

    setIsActing(true);
    const res = await PaymentService.reportTransaction(txId);
    setIsActing(false);
    if (res.success) {
      showToast("⚠ Fraud report submitted. Payment blocked.", "warning");
      loadPayments();
    } else {
      showToast(res.error || "Unable to complete this action", "warning");
    }
  };

  const handleCancel = async (txId: string) => {
    if (isActing) return;
    if (!selectedTx) return;

    if (
      selectedTx.isCompleted ||
      selectedTx.status === "Blocked" ||
      selectedTx.status === "Approved by you" ||
      selectedTx.status === "Reported" ||
      selectedTx.status === "Completed"
    ) {
      showToast("This payment is completed and cannot be cancelled", "info");
      return;
    }

    setIsActing(true);
    const res = await PaymentService.cancelTransaction(txId);
    setIsActing(false);
    if (res.success) {
      showToast("Payment cancelled successfully", "info");
      loadPayments();
    } else {
      showToast(res.error || "Unable to complete this action", "warning");
    }
  };

  const handlePaymentCompleted = (txId: string) => {
    const trustedAudit = selectedTx?.trustedApproval?.required
      ? {
          required: true,
          contactName: selectedTx.trustedApproval.contactName || trustedContacts[0]?.name || "Your trusted contact",
          decision: "Approved" as const,
          decisionTime: "Just now",
        }
      : { required: false };

    PaymentService.completeTransaction(txId, "Google Pay UPI", trustedAudit);
    showToast("✓ Payment completed and recorded in transaction history", "success");
    loadPayments();
  };

  const getDynamicContributions = (tx: UserTransaction): ContributionItem[] => {
    if (tx.status === "Risk detected" || tx.status === "Held" || tx.riskLevel === "HIGH") {
      return [
        { label: "Transaction Patterns", percentage: 45, color: colors.threat },
        { label: "Recipient History", percentage: 30, color: colors.caution },
        { label: "Device Trust", percentage: 25, color: colors.textSecondary },
      ];
    }
    return [
      { label: "Transaction Patterns", percentage: 4, color: colors.safe },
      { label: "Behavioural Profile", percentage: 2, color: colors.safe },
      { label: "Device Trust", percentage: 2, color: colors.safe },
      { label: "Recipient History", percentage: 0, color: colors.safe },
      { label: "Other Factors", percentage: 0, color: colors.textMuted },
    ];
  };

  const isCurrentActiveTx =
    selectedTx &&
    !selectedTx.isCompleted &&
    selectedTx.status !== "Safe" &&
    selectedTx.status !== "Approved by you" &&
    selectedTx.status !== "Reported" &&
    selectedTx.status !== "Blocked" &&
    selectedTx.status !== "Completed";

  const allCount = transactions.length;
  const reviewCount = transactions.filter(
    (t) => t.status === "Risk detected" || t.status === "Held"
  ).length;
  const safeCount = transactions.filter(
    (t) => t.status === "Safe" || t.status === "Approved by you" || t.status === "Completed"
  ).length;

  const filterTabs = [
    { key: "all", label: "All", count: allCount, isAlert: false },
    {
      key: "review",
      label: "Needs Review",
      count: reviewCount,
      isAlert: reviewCount > 0,
    },
    { key: "safe", label: "Completed", count: safeCount, isAlert: false },
  ] as const;

  return (
    <View style={styles.screen}>
      <Header />

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Loading payment records...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={[colors.brand]}
              tintColor={colors.brand}
            />
          }
        >
          {/* 1. Transaction Summary Header */}
          <View style={styles.titleSection}>
            <Text style={styles.screenHeading}>Payments</Text>
            <Text style={styles.screenSubtitle}>
              {overview?.transactionCount ?? allCount} transactions ·{" "}
              <AnimatedAmount
                amount={overview?.totalAmountThisMonth ?? 0}
                prefix="₹"
                style={styles.screenSubtitleAmount}
                duration={900}
                animateOnlyOnce={hasPlayedRevealRef.current}
              />
              {" "}this month
            </Text>
          </View>

          {/* 2. Filter Tabs: ALL | NEEDS REVIEW | COMPLETED / SAFE */}
          <View style={styles.filterSection}>
            <View style={styles.filterTrack}>
              {filterTabs.map((f) => {
                const isActive = filter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => handleSelectFilter(f.key)}
                    style={[
                      styles.filterTab,
                      isActive && styles.filterTabActive,
                      ...(Platform.OS === "web" ? [{ cursor: "pointer", userSelect: "none" } as any] : []),
                    ]}
                    activeOpacity={0.75}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                      {f.label}
                    </Text>
                    <View
                      style={[
                        styles.countPill,
                        isActive ? styles.countPillActive : styles.countPillInactive,
                        f.isAlert && !isActive && styles.countPillAlert,
                      ]}
                    >
                      <Text
                        style={[
                          styles.countPillText,
                          isActive ? styles.countPillTextActive : styles.countPillTextInactive,
                          f.isAlert && !isActive && styles.countPillTextAlert,
                        ]}
                      >
                        {f.count}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 3. PAYMENT DETAILS & RISK ASSESSMENT CARD */}
          {selectedTx && (
            <View style={[styles.detailCard, isCurrentActiveTx ? styles.detailCardActive : styles.detailCardReadOnly]}>
              <View style={styles.detailTopRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.detailBadgeRow}>
                    <Text style={styles.detailHeading}>
                      {isCurrentActiveTx ? "CURRENT PAYMENT IN PROGRESS" : "COMPLETED TRANSACTION RECORD"}
                    </Text>
                    {!isCurrentActiveTx && (
                      <View style={styles.readOnlyTag}>
                        <Ionicons name="lock-closed" size={11} color={colors.textMuted} style={{ marginRight: 3 }} />
                        <Text style={styles.readOnlyTagText}>READ-ONLY AUDIT</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.detailMerchant}>{selectedTx.merchant}</Text>
                  <AnimatedAmount
                    amount={selectedTx?.amount ?? 0}
                    prefix="₹"
                    style={styles.detailAmount}
                    duration={900}
                    animateOnlyOnce={hasPlayedRevealRef.current}
                  />
                  <Text style={styles.detailMeta}>
                    Method: {selectedTx.paymentAppUsed || selectedTx.paymentMethod} · {selectedTx.date}
                  </Text>
                  <Text style={styles.detailRef}>Ref ID: TXN-{selectedTx.id}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedTx(null)}
                  style={styles.closeBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Close payment details"
                >
                  <Ionicons name="close" size={18} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* RISK ASSESSMENT SECTION */}
              <View style={styles.assessmentSection}>
                <Text style={styles.assessmentHeading}>
                  {isCurrentActiveTx ? "AVARAN RISK ASSESSMENT" : "PRE-TRANSACTION RISK ASSESSMENT"}
                </Text>

                {/* AI SCANNING / ANALYSIS ANIMATION BANNER */}
                <AiScanBanner
                  isAnalyzing={isAiScanning && !hasPlayedRevealRef.current}
                  onAnalysisComplete={() => {
                    setIsAiScanning(false);
                  }}
                />

                <RiskGauge
                  score={
                    selectedTx.isCompleted || selectedTx.status === "Approved by you" || selectedTx.status === "Safe" || selectedTx.status === "Completed"
                      ? selectedTx.riskScore || 8
                      : selectedTx.riskScore || (selectedTx.riskLevel === "HIGH" ? 78 : 12)
                  }
                  riskLevel={
                    selectedTx.isCompleted || selectedTx.status === "Approved by you" || selectedTx.status === "Safe" || selectedTx.status === "Completed"
                      ? selectedTx.riskLevel || "LOW"
                      : selectedTx.riskLevel || (selectedTx.status === "Risk detected" ? "HIGH" : "LOW")
                  }
                  size="md"
                  enableRevealAnimation={!hasPlayedRevealRef.current}
                />

                {/* 1. WHY WAS THIS PAYMENT FLAGGED / ANALYSIS FACTORS */}
                <StaggerRevealCard
                  index={0}
                  baseDelay={1350}
                  staggerInterval={120}
                  hasPlayed={hasPlayedRevealRef.current}
                >
                  <View style={styles.reasonsContainer}>
                    <Text style={styles.reasonsTitle}>
                      {isCurrentActiveTx ? "Why was this payment flagged?" : "Risk analysis before payment"}
                    </Text>
                    {selectedTx.reasons && selectedTx.reasons.length > 0 ? (
                      selectedTx.reasons.map((r, i) => (
                        <View key={i} style={styles.reasonBulletRow}>
                          <Ionicons
                            name={
                              selectedTx.isCompleted || selectedTx.status === "Approved by you" || selectedTx.status === "Safe" || selectedTx.status === "Completed"
                                ? "checkmark-circle"
                                : "alert-circle"
                            }
                            size={14}
                            color={
                              selectedTx.isCompleted || selectedTx.status === "Approved by you" || selectedTx.status === "Safe" || selectedTx.status === "Completed"
                                ? colors.safe
                                : colors.threat
                            }
                            style={{ marginRight: 6, marginTop: 2 }}
                          />
                          <Text style={styles.reasonBulletText}>{r}</Text>
                        </View>
                      ))
                    ) : (
                      <View style={styles.reasonBulletRow}>
                        <Ionicons name="checkmark-circle" size={14} color={colors.safe} style={{ marginRight: 6, marginTop: 2 }} />
                        <Text style={styles.reasonBulletText}>
                          Standard verified transaction signature.
                        </Text>
                      </View>
                    )}
                  </View>
                </StaggerRevealCard>

                {/* 2. HISTORICAL TRUSTED APPROVAL AUDIT (READ-ONLY) */}
                {!isCurrentActiveTx && (
                  <StaggerRevealCard
                    index={1}
                    baseDelay={1350}
                    staggerInterval={120}
                    hasPlayed={hasPlayedRevealRef.current}
                  >
                    <View style={styles.auditCard}>
                      <View style={styles.auditHeader}>
                        <Ionicons name="shield-checkmark" size={16} color={colors.brand} />
                        <Text style={styles.auditTitle}>Trusted Contact Approval Record</Text>
                      </View>
                      <View style={styles.auditRow}>
                        <Text style={styles.auditLabel}>Trusted Approval Required:</Text>
                        <Text style={styles.auditValue}>
                          {selectedTx.trustedApproval?.required ? "Yes" : "No (Safe Baseline)"}
                        </Text>
                      </View>
                      {selectedTx.trustedApproval?.required && (
                        <>
                          <View style={styles.auditRow}>
                            <Text style={styles.auditLabel}>Trusted Contact:</Text>
                            <Text style={styles.auditValue}>
                              {selectedTx.trustedApproval.contactName || trustedContacts[0]?.name || "Your trusted contact"}
                            </Text>
                          </View>
                          <View style={styles.auditRow}>
                            <Text style={styles.auditLabel}>Decision:</Text>
                            <Text style={[styles.auditValue, { color: colors.safeText, fontWeight: "700" }]}>
                              {selectedTx.trustedApproval.decision || "Approved"}
                            </Text>
                          </View>
                          <View style={styles.auditRow}>
                            <Text style={styles.auditLabel}>Timestamp:</Text>
                            <Text style={styles.auditValue}>
                              {selectedTx.trustedApproval.decisionTime || selectedTx.date}
                            </Text>
                          </View>
                        </>
                      )}
                      <View style={styles.auditRow}>
                        <Text style={styles.auditLabel}>Payment Gateway Used:</Text>
                        <Text style={styles.auditValue}>
                          {selectedTx.paymentAppUsed || selectedTx.paymentMethod}
                        </Text>
                      </View>
                    </View>
                  </StaggerRevealCard>
                )}

                {/* 3. RISK CONTRIBUTION HORIZONTAL VISUALIZATION */}
                <StaggerRevealCard
                  index={2}
                  baseDelay={1350}
                  staggerInterval={120}
                  hasPlayed={hasPlayedRevealRef.current}
                >
                  <RiskContributionBar contributions={getDynamicContributions(selectedTx)} />
                </StaggerRevealCard>

                {/* 4. RISK ASSESSMENT TIMELINE */}
                <StaggerRevealCard
                  index={3}
                  baseDelay={1350}
                  staggerInterval={120}
                  hasPlayed={hasPlayedRevealRef.current}
                >
                  <View style={styles.timelineBox}>
                    <Text style={styles.timelineHeading}>Assessment timeline</Text>
                    <RiskTimeline
                      steps={[
                        { label: "Payment initiated", detail: `${selectedTx.paymentMethod} · ${selectedTx.date || "Today"}` },
                        { label: "Signal collection", detail: "Device Keystore, Geolocation, Velocity" },
                        { label: "Feature engineering", detail: "Behavioral anomaly + Transaction delta" },
                        { label: "Rule engine check", detail: "UPI Intent Interception & Threat Matrix" },
                        { label: "ML risk scoring", detail: "XGBoost fraud classifier" },
                        { label: "Anomaly detection", detail: "IsolationForest behavioral model" },
                        {
                          label: `Final outcome — ${
                            selectedTx.isCompleted || selectedTx.status === "Approved by you" || selectedTx.status === "Safe" || selectedTx.status === "Completed"
                              ? "COMPLETED & SECURED"
                              : selectedTx.riskLevel === "HIGH"
                              ? "HIGH RISK (APPROVAL REQUIRED)"
                              : "READY TO PAY"
                          }`,
                          detail: `Status: ${selectedTx.status} · Score: ${
                            selectedTx.riskScore || 8
                          }/100`,
                          isHighlighted: Boolean(selectedTx.riskLevel === "HIGH" && isCurrentActiveTx),
                        },
                      ]}
                    />
                  </View>
                </StaggerRevealCard>

                {/* 5. CURRENT PAYMENT ACTIONS vs HISTORICAL SETTLED BANNER */}
                <StaggerRevealCard
                  index={4}
                  baseDelay={1350}
                  staggerInterval={120}
                  hasPlayed={hasPlayedRevealRef.current}
                >
                  {isCurrentActiveTx ? (
                    <View style={styles.decisionBlock}>
                      {/* Guardian awaiting state */}
                      {awaitingGuardian && activeRequest ? (
                        <View style={styles.guardianWaitBlock}>
                          <View style={styles.guardianWaitHeader}>
                            <Ionicons name="hourglass-outline" size={16} color={colors.caution} />
                            <Text style={styles.guardianWaitTitle}>Awaiting Guardian Approval</Text>
                          </View>
                          <Text style={styles.guardianWaitSub}>
                            Sent to your trusted contact ({trustedContacts[0]?.name || "your trusted contact"}). Waiting for approval.
                          </Text>
                          <View style={styles.countdownRow}>
                            <Text
                              style={[
                                styles.countdownNum,
                                { color: countdown <= 15 ? colors.threat : colors.caution },
                              ]}
                            >
                              {countdown}
                            </Text>
                            <Text style={styles.countdownLabel}>seconds remaining</Text>
                          </View>
                        </View>
                      ) : paymentOutcome === "EXPIRED" ? (
                        <View style={styles.expiredBlock}>
                          <Ionicons name="time-outline" size={15} color={colors.textMuted} />
                          <Text style={styles.expiredText}>
                            Guardian approval expired. Payment blocked for security.
                          </Text>
                        </View>
                      ) : selectedTx.riskLevel === "HIGH" &&
                        selectedTx.authorizationRequired !== false &&
                        selectedTx.authorizationStatus !== "AUTHORIZED" ? (
                        /* Secure High-Risk Biometric Authorization Card */
                        <View style={styles.authRequiredCard}>
                          <View style={styles.authRequiredHeader}>
                            <View style={styles.authBadgeIcon}>
                              <Ionicons name="shield-half" size={18} color={colors.threat} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.authRequiredTitle}>Security Verification Required</Text>
                              <Text style={styles.authRequiredSubtitle}>
                                This payment has been identified as high risk. Verify your identity to continue securely.
                              </Text>
                            </View>
                          </View>
                          <Button
                            label={isAuthorizing ? "Verifying..." : "Verify & Continue"}
                            icon="finger-print-outline"
                            onPress={() => handleAuthorize(selectedTx.id)}
                            loading={isAuthorizing}
                            disabled={isAuthorizing || isActing}
                            variant="primary"
                            size="md"
                            style={{ marginTop: spacing.xs }}
                          />
                          <View style={styles.actionRow}>
                            <Button
                              label="REPORT AS FRAUD"
                              icon="alert-circle"
                              onPress={() => handleReport(selectedTx.id)}
                              loading={isActing}
                              disabled={isActing || isAuthorizing}
                              variant="destructive"
                              size="md"
                              style={styles.actionBtn}
                            />
                          </View>
                        </View>
                      ) : (
                        /* Active Confirmation Buttons (Authorized or Standard) */
                        <>
                          {selectedTx.authorizationStatus === "AUTHORIZED" && (
                            <View style={styles.authVerifiedBanner}>
                              <Ionicons name="checkmark-circle" size={15} color={colors.safe} />
                              <Text style={styles.authVerifiedText}>Identity Verified with Biometrics</Text>
                            </View>
                          )}
                          <View style={styles.actionRow}>
                            <Button
                              label={width < 380 ? "CONFIRM" : width < 480 ? "CONFIRM PAYMENT" : "CONFIRM & CHOOSE APP"}
                              icon="checkmark-circle"
                              onPress={() => handleConfirm(selectedTx.id)}
                              loading={isActing}
                              disabled={isActing}
                              variant="primary"
                              size="md"
                              style={styles.actionBtn}
                            />
                            <Button
                              label={width < 360 ? "REPORT FRAUD" : "REPORT AS FRAUD"}
                              icon="alert-circle"
                              onPress={() => handleReport(selectedTx.id)}
                              loading={isActing}
                              disabled={isActing}
                              variant="destructive"
                              size="md"
                              style={styles.actionBtn}
                            />
                          </View>
                        </>
                      )}

                      {!awaitingGuardian && paymentOutcome !== "EXPIRED" && (
                        <TouchableOpacity
                          style={[
                            styles.cancelActionBtn,
                            isActing && styles.cancelActionBtnDisabled,
                          ]}
                          onPress={() => handleCancel(selectedTx.id)}
                          disabled={isActing || isAuthorizing}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel payment"
                        >
                          <Ionicons name="close-circle-outline" size={15} color={colors.textMuted} style={{ marginRight: 5 }} />
                          <Text style={styles.cancelActionText}>Cancel payment</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    /* Completed Historical Settled Banner (Read-Only) */
                    <View style={styles.settledCard}>
                      <View style={styles.settledIconBoxSafe}>
                        <Ionicons name="checkmark" size={20} color={colors.safe} />
                      </View>
                      <View style={styles.settledTextCol}>
                        <Text style={[styles.settledTitle, { color: colors.safeText }]}>
                          PAYMENT COMPLETED & RECORDED
                        </Text>
                        <Text style={styles.settledSubtitle}>
                          This is a secure historical transaction record. No further actions required.
                        </Text>
                      </View>
                    </View>
                  )}
                </StaggerRevealCard>
              </View>
            </View>
          )}

          {/* 4. TRANSACTION LIST */}
          <Text style={styles.listHeading}>
            {filter === "review"
              ? "TRANSACTIONS REQUIRING REVIEW"
              : filter === "safe"
              ? "COMPLETED PAYMENT HISTORY"
              : "ALL TRANSACTIONS"}
          </Text>

          <View style={styles.paymentList}>
            {visibleTransactions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="file-tray-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyText}>
                  {filter === "review"
                    ? "No transactions currently require review. All payments are verified."
                    : filter === "safe"
                    ? "No completed transactions recorded."
                    : "No transactions found."}
                </Text>
              </View>
            ) : (
              visibleTransactions.map((item, idx) => {
                const isRisk = item.status === "Risk detected" || item.status === "Held";
                const isSelected = selectedTx?.id === item.id;
                const isNewlyDetected = newlyDetectedIds.has(item.id);
                const isLast = idx === visibleTransactions.length - 1;
                return (
                  <StaggerRevealCard
                    key={item.id}
                    index={idx}
                    baseDelay={hasPlayedRevealRef.current ? 0 : 1350}
                    staggerInterval={80}
                    hasPlayed={hasPlayedListStaggerRef.current}
                  >
                    <NewPaymentHighlightCard isNew={isNewlyDetected}>
                      <TouchableOpacity
                        style={[
                          styles.txnCard,
                          isRisk && !isSelected && styles.txnCardRisk,
                          isSelected && styles.txnCardSelected,
                          isSelected && isRisk && styles.txnCardSelectedRisk,
                          isLast && styles.txnCardLast,
                        ]}
                        onPress={() => {
                          setSelectedTx(item);
                          if (paymentOutcome) clearPaymentOutcome();
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={styles.txnLeft}>
                          <View
                            style={[
                              styles.txnIconBox,
                              isRisk && styles.txnIconBoxRisk,
                              isSelected && styles.txnIconBoxSelected,
                            ]}
                          >
                            <Ionicons
                              name={isRisk ? "warning" : "checkmark-circle"}
                              size={18}
                              color={isRisk ? colors.threat : colors.safe}
                            />
                          </View>
                          <View style={styles.txnTextCol}>
                            <Text style={styles.txnMerchant}>{item.merchant}</Text>
                            <Text style={styles.txnMeta}>
                              {item.paymentAppUsed || item.paymentMethod} · {item.date}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.txnRight}>
                          <AnimatedAmount
                            amount={item?.amount ?? 0}
                            prefix="₹"
                            style={[
                              styles.txnAmount,
                              isRisk && { color: colors.threat },
                            ]}
                            animateOnlyOnce={hasPlayedListStaggerRef.current}
                            duration={600}
                          />
                          <StatusBadge
                            label={
                              isRisk
                                ? `ACTION REQUIRED`
                                : item.status === "Reported"
                                ? "Reported"
                                : item.status === "Blocked"
                                ? "Blocked"
                                : "Completed"
                            }
                            status={isRisk ? "high" : item.status === "Reported" ? "escalated" : "low"}
                            dot={false}
                          />
                        </View>
                      </TouchableOpacity>
                    </NewPaymentHighlightCard>
                  </StaggerRevealCard>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {/* Choose Installed Payment App Modal (Only enabled connected apps) */}
      <ChoosePaymentAppModal
        visible={isChooseAppModalVisible}
        transaction={selectedTx}
        onClose={() => setIsChooseAppModalVisible(false)}
        onPaymentCompleted={handlePaymentCompleted}
        onShowToast={showToast}
      />

      {/* Floating Toast notification */}
      <FloatingToast config={toastConfig} onDismiss={() => setToastConfig(null)} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  titleSection: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs,
  },
  screenHeading: {
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
  },
  screenSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  screenSubtitleAmount: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  filterSection: {
    marginBottom: spacing.md,
  },
  filterTrack: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 4,
  },
  filterTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    gap: 6,
  },
  filterTabActive: {
    backgroundColor: colors.btnPrimaryBg,
    ...shadows.sm,
  },
  filterTabText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
    fontSize: 12,
    textTransform: "none",
    letterSpacing: 0.1,
  },
  filterTabTextActive: {
    color: colors.btnPrimaryText,
    fontWeight: "700",
  },
  countPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.full,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  countPillActive: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  countPillInactive: {
    backgroundColor: colors.borderLight,
  },
  countPillAlert: {
    backgroundColor: colors.threatSurface,
    borderWidth: 1,
    borderColor: colors.threatBorder,
  },
  countPillText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: "700",
  },
  countPillTextActive: {
    color: colors.btnPrimaryText,
  },
  countPillTextInactive: {
    color: colors.textSecondary,
  },
  countPillTextAlert: {
    color: colors.threatText,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 13,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
  },
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1.2,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.lg,
  },
  detailCardActive: {
    borderColor: "rgba(23, 107, 91, 0.35)",
    ...shadows.hero,
  },
  detailCardReadOnly: {
    borderColor: colors.borderLight,
    ...shadows.md,
  },
  detailTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  detailBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  detailHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.6,
  },
  readOnlyTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  readOnlyTagText: {
    ...typography.caption,
    fontSize: 9,
    fontWeight: "700",
    color: colors.textMuted,
  },
  detailMerchant: {
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 2,
  },
  detailAmount: {
    ...typography.amountLarge,
    color: colors.textPrimary,
    marginVertical: 4,
  },
  detailMeta: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 13,
  },
  detailRef: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
    textTransform: "none",
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  assessmentSection: {
    marginTop: spacing.md,
  },
  assessmentHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  reasonsContainer: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    padding: spacing.md,
    marginVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  reasonsTitle: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  reasonBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 2,
  },
  reasonBulletText: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  auditCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  auditHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  auditTitle: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  auditRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  auditLabel: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
  },
  auditValue: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 12,
  },
  timelineBox: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    padding: spacing.md,
    marginVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  timelineHeading: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  decisionBlock: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    width: "100%",
    alignItems: "center",
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
  },
  cancelActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    marginTop: 2,
    ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
  },
  cancelActionBtnDisabled: {
    opacity: 0.5,
  },
  cancelActionText: {
    ...typography.smallSemibold,
    color: colors.textMuted,
    fontSize: 13,
  },
  settledCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.safeSurface,
    borderWidth: 1,
    borderColor: colors.safeBorder,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  settledIconBoxSafe: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  settledTextCol: {
    flex: 1,
  },
  settledTitle: {
    ...typography.bodySemibold,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  settledSubtitle: {
    ...typography.small,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  listHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    letterSpacing: 0.6,
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  paymentList: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.sm,
  },
  txnCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  txnCardRisk: {
    backgroundColor: "rgba(163,61,53,0.025)",
  },
  txnCardSelected: {
    backgroundColor: colors.surfaceSecondary,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
    paddingLeft: spacing.lg - 3,
  },
  txnCardSelectedRisk: {
    backgroundColor: "rgba(163,61,53,0.05)",
    borderLeftWidth: 3,
    borderLeftColor: colors.threat,
    paddingLeft: spacing.lg - 3,
  },
  txnCardLast: {
    borderBottomWidth: 0,
  },
  txnLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  txnIconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  txnIconBoxRisk: {
    backgroundColor: "rgba(163,61,53,0.07)",
    borderColor: colors.threatBorder,
  },
  txnIconBoxSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  txnTextCol: {
    flex: 1,
  },
  txnMerchant: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 13.5,
    lineHeight: 18,
  },
  txnMeta: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  txnRight: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
    paddingLeft: spacing.xs,
  },
  txnAmount: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 14,
    letterSpacing: -0.2,
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  emptyText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: "center",
  },
  guardianWaitBlock: {
    backgroundColor: colors.cautionSurface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cautionBorder,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  guardianWaitHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  guardianWaitTitle: {
    ...typography.smallSemibold,
    color: colors.cautionText,
    fontSize: 13,
    fontWeight: "700",
  },
  guardianWaitSub: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
  },
  countdownRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  countdownNum: {
    ...typography.h2,
    fontWeight: "800",
    fontSize: 22,
  },
  countdownLabel: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
  },
  expiredBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  expiredText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
  },
  authRequiredCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    ...shadows.sm,
  },
  authRequiredHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  authBadgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.threatSurface,
    borderWidth: 1,
    borderColor: colors.threatBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  authRequiredTitle: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  authRequiredSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  authVerifiedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.safeSurface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.safeBorder,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  authVerifiedText: {
    ...typography.smallSemibold,
    color: colors.safeText,
    fontSize: 12,
  },
});
