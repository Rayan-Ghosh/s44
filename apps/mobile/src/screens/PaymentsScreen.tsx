import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii, shadows } from "../theme/layout";
import { Header } from "../components/common/Header";
import { StatusBadge } from "../components/common/StatusBadge";
import { RiskGauge } from "../components/common/RiskGauge";
import { RiskContributionBar } from "../components/common/RiskContributionBar";
import { RiskTimeline } from "../components/common/RiskTimeline";
import { Button } from "../components/common/Button";
import { useAuth } from "../context/AuthContext";
import { useGuardian } from "../context/GuardianContext";
import {
  PaymentService,
  UserTransaction,
  UserPaymentOverview,
  SEED_PAYMENT_OVERVIEW,
} from "../services/payment-service";

export const PaymentsScreen: React.FC = () => {
  const { session } = useAuth();
  const {
    trustedContacts,
    isTrustedFeatureEnabled,
    initiateGuardianRequest,
    activeRequest,
    countdown,
    paymentOutcome,
    clearPaymentOutcome,
  } = useGuardian();

  const [overview, setOverview] = useState<UserPaymentOverview>(SEED_PAYMENT_OVERVIEW);
  const [transactions, setTransactions] = useState<UserTransaction[]>([]);
  const [filter, setFilter] = useState<"all" | "review" | "safe">("all");
  const [selectedTx, setSelectedTx] = useState<UserTransaction | null>(null);
  const [awaitingGuardian, setAwaitingGuardian] = useState(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isActing, setIsActing] = useState<boolean>(false);

  const loadPayments = useCallback(async () => {
    try {
      const userId = session?.userId || 1;
      const [ovData, txnData] = await Promise.all([
        PaymentService.getOverview(userId),
        PaymentService.getTransactions(userId, filter),
      ]);
      setOverview(ovData);
      setTransactions(txnData.items);

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
  }, [session?.userId, filter, selectedTx]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // Watch for guardian decision and update UI accordingly
  useEffect(() => {
    if (!awaitingGuardian || !paymentOutcome) return;

    if (paymentOutcome === "APPROVED") {
      setAwaitingGuardian(false);
      Alert.alert(
        "Payment Approved",
        "Your trusted contact approved this payment."
      );
      setSelectedTx(null);
      loadPayments();
      clearPaymentOutcome();
    } else if (paymentOutcome === "REJECTED") {
      setAwaitingGuardian(false);
      Alert.alert(
        "Payment Rejected",
        "Your trusted contact rejected this payment."
      );
      loadPayments();
      clearPaymentOutcome();
    } else if (paymentOutcome === "EXPIRED") {
      setAwaitingGuardian(false);
      // Keep paymentOutcome as "EXPIRED" so the inline message stays visible.
      // User dismisses by tapping another transaction or refreshing.
      loadPayments();
    }
  }, [paymentOutcome, awaitingGuardian, loadPayments, clearPaymentOutcome]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadPayments();
  };

  const handleConfirm = async (txId: string) => {
    // HIGH-RISK payments require guardian approval ONLY IF trusted feature is enabled
    if (selectedTx && selectedTx.riskLevel === "HIGH" && isTrustedFeatureEnabled) {
      if (trustedContacts.length === 0) {
        Alert.alert(
          "No Trusted Contact",
          "Add a trusted contact first in the Trusted tab to enable guardian approvals for high-risk payments."
        );
        return;
      }
      // Intercept: dispatch guardian approval request instead of confirming directly
      initiateGuardianRequest(selectedTx);
      setAwaitingGuardian(true);
      return;
    }

    // Low/Medium risk or when Trusted Feature is OFF — confirm directly
    setIsActing(true);
    const res = await PaymentService.confirmTransaction(txId);
    setIsActing(false);
    if (res.success) {
      Alert.alert(
        "Payment Confirmed",
        "You confirmed this payment was legitimate. Your feedback has been recorded."
      );
      setSelectedTx(null);
      loadPayments();
    } else {
      Alert.alert("Action Failed", res.error || "Unable to confirm payment.");
    }
  };

  const handleReport = async (txId: string) => {
    setIsActing(true);
    const res = await PaymentService.reportTransaction(txId);
    setIsActing(false);
    if (res.success) {
      Alert.alert(
        "Fraud Reported",
        "Payment blocked. Fraud protection operations has been alerted to safeguard your account."
      );
      setSelectedTx(null);
      loadPayments();
    } else {
      Alert.alert("Action Failed", res.error || "Unable to report fraud.");
    }
  };

  const handleCancel = async (txId: string) => {
    setIsActing(true);
    const res = await PaymentService.cancelTransaction(txId);
    setIsActing(false);
    if (res.success) {
      Alert.alert("Payment Cancelled", "This transaction was successfully cancelled.");
      setSelectedTx(null);
      loadPayments();
    } else {
      Alert.alert("Action Failed", res.error || "Unable to cancel transaction.");
    }
  };

  return (
    <View style={styles.screen}>
      <Header />

      {/* Screen Title & Summary in body */}
      <View style={styles.titleSection}>
        <Text style={styles.screenHeading}>Payments</Text>
        <Text style={styles.screenSubtitle}>
          {overview?.transactionCount ?? 0} transactions · ₹{(overview?.totalAmountThisMonth ?? 0).toLocaleString("en-IN")} this month
        </Text>
      </View>

      {/* Filter Tabs: ALL | NEEDS REVIEW | SAFE */}
      <View style={styles.filterRow}>
        {(
          [
            { key: "all", label: "All" },
            {
              key: "review",
              label: `Needs Review (${overview?.needsReviewCount ?? 0})`,
            },
            { key: "safe", label: "Safe" },
          ] as const
        ).map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterBtnText, filter === f.key && styles.filterBtnTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
          {/* PAYMENT DETAILS & AVARAN RISK ASSESSMENT CARD */}
          {selectedTx && (
            <View style={styles.detailCard}>
              <View style={styles.detailTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailHeading}>PAYMENT DETAILS</Text>
                  <Text style={styles.detailMerchant}>{selectedTx.merchant}</Text>
                  <Text style={styles.detailAmount}>
                    ₹{(selectedTx?.amount ?? 0).toLocaleString("en-IN")}
                  </Text>
                  <Text style={styles.detailMeta}>
                    Method: {selectedTx.paymentMethod} · {selectedTx.date}
                  </Text>
                  <Text style={styles.detailRef}>Ref ID: TXN-{selectedTx.id}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedTx(null)}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* RISK ASSESSMENT SECTION */}
              <View style={styles.assessmentSection}>
                <Text style={styles.assessmentHeading}>AVARAN RISK ASSESSMENT</Text>
                <RiskGauge
                  score={selectedTx.riskScore || (selectedTx.riskLevel === "HIGH" ? 87 : 12)}
                  riskLevel={selectedTx.riskLevel || (selectedTx.status === "Risk detected" ? "HIGH" : "LOW")}
                  size="md"
                />

                {/* WHY WAS THIS PAYMENT FLAGGED? */}
                <View style={styles.reasonsContainer}>
                  <Text style={styles.reasonsTitle}>Why was this payment flagged?</Text>
                  {selectedTx.reasons && selectedTx.reasons.length > 0 ? (
                    selectedTx.reasons.map((r, i) => (
                      <View key={i} style={styles.reasonBulletRow}>
                        <Ionicons name="alert-circle" size={14} color={colors.threat} style={{ marginRight: 6, marginTop: 2 }} />
                        <Text style={styles.reasonBulletText}>{r}</Text>
                      </View>
                    ))
                  ) : (
                    <>
                      <View style={styles.reasonBulletRow}>
                        <Ionicons name="alert-circle" size={14} color={colors.threat} style={{ marginRight: 6, marginTop: 2 }} />
                        <Text style={styles.reasonBulletText}>
                          Transaction amount is 7.2× higher than your normal average.
                        </Text>
                      </View>
                      <View style={styles.reasonBulletRow}>
                        <Ionicons name="alert-circle" size={14} color={colors.threat} style={{ marginRight: 6, marginTop: 2 }} />
                        <Text style={styles.reasonBulletText}>
                          This recipient has never received money from you before.
                        </Text>
                      </View>
                      <View style={styles.reasonBulletRow}>
                        <Ionicons name="alert-circle" size={14} color={colors.threat} style={{ marginRight: 6, marginTop: 2 }} />
                        <Text style={styles.reasonBulletText}>
                          Payment originated from a newly registered device.
                        </Text>
                      </View>
                      <View style={styles.reasonBulletRow}>
                        <Ionicons name="alert-circle" size={14} color={colors.threat} style={{ marginRight: 6, marginTop: 2 }} />
                        <Text style={styles.reasonBulletText}>
                          Transaction timing is unusual for your account.
                        </Text>
                      </View>
                    </>
                  )}
                </View>

                {/* RISK CONTRIBUTION HORIZONTAL VISUALIZATION */}
                <RiskContributionBar />

                {/* RISK ASSESSMENT TIMELINE */}
                <View style={styles.timelineBox}>
                  <Text style={styles.timelineHeading}>Assessment timeline</Text>
                  <RiskTimeline
                    steps={[
                      { label: "Payment initiated", detail: selectedTx.date || "Just now" },
                      { label: "Signal collection", detail: "Device, location, amount, recipient" },
                      { label: "Feature engineering", detail: "Behavioral + transactional patterns" },
                      { label: "Rule engine check", detail: "Velocity, amount, blacklist rules" },
                      { label: "ML risk scoring", detail: "XGBoost fraud classifier" },
                      { label: "Anomaly detection", detail: "IsolationForest behavioral model" },
                      {
                        label: `Final decision — ${(selectedTx.riskLevel || "LOW")} risk`,
                        detail: `Score: ${selectedTx.riskScore || 12}/100`,
                        isHighlighted: (selectedTx.riskLevel === "HIGH"),
                      },
                    ]}
                  />
                </View>

                {/* USER CONFIRMATION ACTIONS */}
                {selectedTx.status === "Risk detected" || selectedTx.status === "Held" ? (
                  <View style={styles.decisionBlock}>
                    {/* Guardian awaiting state */}
                    {awaitingGuardian && activeRequest ? (
                      <View style={styles.guardianWaitBlock}>
                        <View style={styles.guardianWaitHeader}>
                          <Ionicons name="hourglass-outline" size={16} color={colors.caution} />
                          <Text style={styles.guardianWaitTitle}>Awaiting Guardian Approval</Text>
                        </View>
                        <Text style={styles.guardianWaitSub}>
                          Sent to your trusted contact. Waiting for their response.
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
                          No response. Payment rejected. Try again later.
                        </Text>
                      </View>
                    ) : (
                      /* Default action buttons */
                      <View style={styles.actionRow}>
                        <Button
                          label="I RECOGNIZE THIS PAYMENT"
                          onPress={() => handleConfirm(selectedTx.id)}
                          loading={isActing}
                          variant="primary"
                          size="md"
                          style={{ flex: 1 }}
                        />
                        <Button
                          label="REPORT AS FRAUD"
                          onPress={() => handleReport(selectedTx.id)}
                          loading={isActing}
                          variant="destructive"
                          size="md"
                          style={{ flex: 1 }}
                        />
                      </View>
                    )}

                    {!awaitingGuardian && paymentOutcome !== "EXPIRED" && (
                      <TouchableOpacity
                        style={styles.cancelActionBtn}
                        onPress={() => handleCancel(selectedTx.id)}
                      >
                        <Text style={styles.cancelActionText}>Cancel payment</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <View style={styles.settledBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.safe} />
                    <Text style={styles.settledText}>
                      Transaction status: {selectedTx.status}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          <Text style={styles.listHeading}>TRANSACTION HISTORY</Text>

          {/* Payments List */}
          <View style={styles.paymentList}>
            {transactions.length === 0 ? (
              <Text style={styles.emptyText}>No transactions match the selected filter.</Text>
            ) : (
              transactions.map((item, idx) => {
                const isRisk = item.status === "Risk detected" || item.status === "Held";
                const isSelected = selectedTx?.id === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.txnCard,
                      isRisk && styles.txnCardRisk,
                      isSelected && styles.txnCardSelected,
                      idx === transactions.length - 1 && styles.txnCardLast,
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
                          name={isRisk ? "warning" : "card-outline"}
                          size={18}
                          color={isRisk ? colors.threat : colors.brand}
                        />
                      </View>
                      <View style={styles.txnTextCol}>
                        <Text style={styles.txnMerchant}>{item.merchant}</Text>
                        <Text style={styles.txnMeta}>
                          {item.paymentMethod} · {item.date}
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
                            ? `HIGH RISK · ${item.riskScore || 87}/100`
                            : item.status === "Reported"
                            ? "Reported"
                            : "Safe"
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
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  titleSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.surface,
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
    marginBottom: spacing.xs,
  },
  filterRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  filterBtn: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  filterBtnActive: {
    backgroundColor: colors.btnPrimaryBg,
    borderColor: colors.btnPrimaryBg,
  },
  filterBtnText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
    fontSize: 11,
    textTransform: "none",
    letterSpacing: 0.2,
  },
  filterBtnTextActive: {
    color: colors.btnPrimaryText,
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
  detailTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  detailHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.6,
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
  },
  cancelActionBtn: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  cancelActionText: {
    ...typography.smallSemibold,
    color: colors.textMuted,
    fontSize: 13,
  },
  settledBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.safeSurface,
    borderWidth: 1,
    borderColor: colors.safeBorder,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  settledText: {
    ...typography.smallSemibold,
    color: colors.safeText,
    fontSize: 13,
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
  emptyText: {
    ...typography.small,
    color: colors.textMuted,
    paddingVertical: spacing.lg,
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
    lineHeight: 17,
  },
  countdownRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: 2,
  },
  countdownNum: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  countdownLabel: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
  },
  expiredBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  expiredText: {
    ...typography.smallSemibold,
    color: colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
});
