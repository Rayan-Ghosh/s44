import React, { useState, useEffect, useCallback, useMemo } from "react";
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
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii, shadows } from "../theme/layout";
import { Header } from "../components/common/Header";
import { StatusBadge } from "../components/common/StatusBadge";
import { RiskGauge } from "../components/common/RiskGauge";
import { RiskContributionBar, ContributionItem } from "../components/common/RiskContributionBar";
import { RiskTimeline } from "../components/common/RiskTimeline";
import { Button } from "../components/common/Button";
import { FloatingToast, ToastConfig } from "../components/common/FloatingToast";
import { ChoosePaymentAppModal } from "../components/payment/ChoosePaymentAppModal";
import { useAuth } from "../context/AuthContext";
import { useGuardian } from "../context/GuardianContext";
import {
  PaymentService,
  UserTransaction,
  UserPaymentOverview,
  EMPTY_PAYMENT_OVERVIEW,
} from "../services/payment-service";

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

  const [overview, setOverview] = useState<UserPaymentOverview>(EMPTY_PAYMENT_OVERVIEW);
  const [transactions, setTransactions] = useState<UserTransaction[]>([]);
  const [filter, setFilter] = useState<"all" | "review" | "safe">("all");
  const [selectedTx, setSelectedTx] = useState<UserTransaction | null>(null);
  const [awaitingGuardian, setAwaitingGuardian] = useState(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isActing, setIsActing] = useState<boolean>(false);

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

      // Check if a specific transaction ID was requested via navigation parameters
      const requestedId = route.params?.selectedTxId;
      if (requestedId && txnData.items.length > 0) {
        const found = txnData.items.find(
          (t) => t.id === requestedId || String(t.id) === String(requestedId)
        );
        if (found) {
          setSelectedTx(found);
          return;
        }
      }

      if (!selectedTx && txnData.items.length > 0) {
        const firstRisk = txnData.items.find(
          (t) => t.status === "Risk detected" || t.status === "Held"
        );
        if (firstRisk) setSelectedTx(firstRisk);
        else setSelectedTx(txnData.items[0]);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [session?.userId, selectedTx, route.params?.selectedTxId]);

  useEffect(() => {
    loadPayments();

    // Subscribe to real-time updates from centralized PaymentService
    const unsubscribe = PaymentService.subscribe((updatedOverview, updatedTxns) => {
      setOverview(updatedOverview);
      setTransactions(updatedTxns);

      // Keep selectedTx synchronized with latest status
      setSelectedTx((prev) => {
        if (!prev) return null;
        const fresh = updatedTxns.find((t) => t.id === prev.id);
        return fresh || prev;
      });
    });

    return unsubscribe;
  }, [loadPayments]);

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
      if (!selectedTx || !items.some((t) => t.id === selectedTx.id)) {
        setSelectedTx(items[0]);
      }
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

  const handleConfirm = async (txId: string) => {
    if (isActing) return;
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
    { key: "safe", label: "Completed / Safe", count: safeCount, isAlert: false },
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
              {overview?.transactionCount ?? allCount} transactions · ₹{(overview?.totalAmountThisMonth ?? 0).toLocaleString("en-IN")} this month
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
                  <Text style={styles.detailAmount}>
                    ₹{(selectedTx?.amount ?? 0).toLocaleString("en-IN")}
                  </Text>
                  <Text style={styles.detailMeta}>
                    Method: {selectedTx.paymentAppUsed || selectedTx.paymentMethod} · {selectedTx.date}
                  </Text>
                  <Text style={styles.detailRef}>Ref ID: TXN-{selectedTx.id}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedTx(null)}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close payment details"
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* RISK ASSESSMENT SECTION */}
              <View style={styles.assessmentSection}>
                <Text style={styles.assessmentHeading}>
                  {isCurrentActiveTx ? "AVARAN RISK ASSESSMENT" : "PRE-TRANSACTION RISK ASSESSMENT"}
                </Text>
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
                />

                {/* WHY WAS THIS PAYMENT FLAGGED / ANALYSIS */}
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

                {/* HISTORICAL TRUSTED APPROVAL AUDIT (READ-ONLY) */}
                {!isCurrentActiveTx && (
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
                )}

                {/* RISK CONTRIBUTION HORIZONTAL VISUALIZATION */}
                <RiskContributionBar contributions={getDynamicContributions(selectedTx)} />

                {/* RISK ASSESSMENT TIMELINE */}
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

                {/* CURRENT PAYMENT ACTIONS vs HISTORICAL SETTLED BANNER */}
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
                    ) : (
                      /* Active Confirmation Buttons */
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
                    )}

                    {!awaitingGuardian && paymentOutcome !== "EXPIRED" && (
                      <TouchableOpacity
                        style={[
                          styles.cancelActionBtn,
                          isActing && styles.cancelActionBtnDisabled,
                        ]}
                        onPress={() => handleCancel(selectedTx.id)}
                        disabled={isActing}
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
              </View>
            </View>
          )}

          {/* 4. COMPLETED TRANSACTION HISTORY LIST */}
          <Text style={styles.listHeading}>COMPLETED PAYMENT HISTORY</Text>

          <View style={styles.paymentList}>
            {visibleTransactions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="file-tray-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyText}>No transactions found for this filter.</Text>
              </View>
            ) : (
              visibleTransactions.map((item, idx) => {
                const isRisk = item.status === "Risk detected" || item.status === "Held";
                const isSelected = selectedTx?.id === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.txnCard,
                      isRisk && styles.txnCardRisk,
                      isSelected && styles.txnCardSelected,
                      idx === visibleTransactions.length - 1 && styles.txnCardLast,
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
                      <Text
                        style={[
                          styles.txnAmount,
                          isRisk && { color: colors.threatText },
                        ]}
                      >
                        ₹{(item?.amount ?? 0).toLocaleString("en-IN")}
                      </Text>
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
                      />
                    </View>
                  </TouchableOpacity>
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
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  detailCardActive: {
    borderColor: colors.brand,
    borderWidth: 1.5,
  },
  detailCardReadOnly: {
    borderColor: colors.border,
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
    paddingHorizontal: spacing.md,
    ...shadows.sm,
  },
  txnCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  txnCardRisk: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.threat,
  },
  txnCardSelected: {
    backgroundColor: colors.surfaceSecondary,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
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
    width: 34,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  txnIconBoxRisk: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.borderLight,
  },
  txnTextCol: {
    flex: 1,
  },
  txnMerchant: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
  },
  txnMeta: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  txnRight: {
    alignItems: "flex-end",
    gap: 3,
  },
  txnAmount: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
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
});
