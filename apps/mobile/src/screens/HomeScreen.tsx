import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii, shadows } from "../theme/layout";
import { Header } from "../components/common/Header";
import { StatusBadge } from "../components/common/StatusBadge";
import { RiskGauge } from "../components/common/RiskGauge";
import { useAuth } from "../context/AuthContext";
import { useGuardian } from "../context/GuardianContext";
import { useAlertBadge } from "../context/AlertBadgeContext";
import {
  PaymentService,
  UserPaymentOverview,
  UserTransaction,
  SEED_PAYMENT_OVERVIEW,
} from "../services/payment-service";
import { AlertService, SecurityAlert } from "../services/alert-service";
import { NotificationDropdown } from "../components/guardian/NotificationDropdown";
import { GuardianApprovalCard } from "../components/guardian/GuardianApprovalCard";

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const {
    pendingRequests,
    notificationBadge,
    openApprovalCard,
    closeApprovalCard,
    approvalCard,
    respondToRequest,
    clearNotificationBadge,
  } = useGuardian();

  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);

  const [overview, setOverview] = useState<UserPaymentOverview>(SEED_PAYMENT_OVERVIEW);
  const [recentTxns, setRecentTxns] = useState<UserTransaction[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const userId = session?.userId || 1;
      const [ovData, txnData, alertData] = await Promise.all([
        PaymentService.getOverview(userId),
        PaymentService.getTransactions(userId, "all", 5, 0),
        AlertService.getAlerts(),
      ]);
      setOverview(ovData);
      setRecentTxns(txnData.items);
      setAlerts(alertData);
    } catch (e: any) {
      setError("Unable to sync latest financial protection data.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [session?.userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const userName = session?.name ? session.name.split(" ")[0] : "Rahul";
  const unreadAlerts = alerts.filter((a) => !a.isRead);
  const suspiciousTx = recentTxns.find((t) => t.status === "Risk detected" || t.status === "Held");

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <View style={styles.screen}>
      <Header />

      {/* Notification dropdown (modal overlay, positioned near bell) */}
      <NotificationDropdown
        visible={notifDropdownOpen}
        requests={pendingRequests}
        onSelectRequest={(req) => {
          openApprovalCard(req);
          setNotifDropdownOpen(false);
        }}
        onDismiss={() => setNotifDropdownOpen(false)}
      />

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Syncing Avaran security shield...</Text>
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
          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="cloud-offline-outline" size={16} color={colors.textMuted} />
              <Text style={styles.errorBannerText}>{error}</Text>
              <TouchableOpacity onPress={loadData} style={styles.retryBtn}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Greeting */}
          <View style={styles.greetingRow}>
            <Text style={styles.greetingTitle}>
              {getGreeting()}, {userName}
            </Text>
            <TouchableOpacity
              style={styles.notificationBtn}
              activeOpacity={0.7}
              accessibilityLabel="Notifications"
              accessibilityRole="button"
              onPress={() => {
                clearNotificationBadge();
                setNotifDropdownOpen((v) => !v);
              }}
            >
              <Ionicons
                name="notifications-outline"
                size={22}
                color={notificationBadge > 0 ? colors.threat : colors.textSecondary}
              />
              {notificationBadge > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{notificationBadge}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Guardian approval card (shown when guardian taps a notification) */}
          {approvalCard && (
            <GuardianApprovalCard
              request={approvalCard}
              onConfirm={() => respondToRequest(approvalCard.id, "APPROVED")}
              onReject={() => respondToRequest(approvalCard.id, "REJECTED")}
              onDismiss={closeApprovalCard}
            />
          )}

          {/* Protection Status Banner */}
          <View
            style={[
              styles.protectionBanner,
              overview.protectionStatus === "ATTENTION REQUIRED" && styles.protectionBannerAttention,
            ]}
          >
            <Ionicons
              name={overview.protectionStatus === "PROTECTED" ? "shield-checkmark" : "warning"}
              size={18}
              color={overview.protectionStatus === "PROTECTED" ? colors.safe : colors.caution}
            />
            <Text
              style={[
                styles.protectionText,
                overview.protectionStatus === "ATTENTION REQUIRED" && styles.protectionTextAttention,
              ]}
            >
              {overview.protectionStatus === "PROTECTED"
                ? "Protected — Your payments are being monitored."
                : "Attention required — 1 transaction needs review."}
            </Text>
          </View>

          {/* PAYMENT OVERVIEW */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>PAYMENT OVERVIEW</Text>
              <TouchableOpacity onPress={() => navigation.navigate("Payments")}>
                <Text style={styles.seeAllText}>View all</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.overviewCard}>
              <Text style={styles.overviewLabel}>Total this month</Text>
              <Text style={styles.totalAmount}>
                ₹{(overview?.totalAmountThisMonth ?? 0).toLocaleString("en-IN")}
              </Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{overview?.transactionCount ?? 0}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.safe }]}>{overview?.safeCount ?? 0}</Text>
                  <Text style={styles.statLabel}>Safe</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.threat }]}>{overview?.needsReviewCount ?? 0}</Text>
                  <Text style={styles.statLabel}>Needs attention</Text>
                </View>
              </View>
            </View>
          </View>

          {/* CURRENT RISK STATUS */}
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>CURRENT RISK STATUS</Text>
            <View style={styles.riskCard}>
              <RiskGauge
                score={Math.round(overview?.currentRiskScore ?? 0)}
                riskLevel={overview?.currentRiskLevel || "LOW"}
                size="md"
              />
            </View>
          </View>

          {/* NEEDS YOUR ATTENTION */}
          {suspiciousTx ? (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>NEEDS YOUR ATTENTION</Text>

              <TouchableOpacity
                style={styles.attentionCard}
                onPress={() => navigation.navigate("Payments")}
                activeOpacity={0.85}
              >
                <View style={styles.attentionTop}>
                  <View style={styles.attentionIconBox}>
                    <Ionicons name="warning" size={18} color={colors.threat} />
                  </View>
                  <View style={styles.attentionTextCol}>
                    <Text style={styles.attentionMerchant}>{suspiciousTx.merchant}</Text>
                    <Text style={styles.attentionAmount}>
                      ₹{(suspiciousTx?.amount ?? 0).toLocaleString("en-IN")}
                    </Text>
                  </View>
                  <StatusBadge label="HIGH RISK" status="high" dot={false} />
                </View>

                <View style={styles.attentionBottom}>
                  <Text style={styles.riskScoreText}>
                    Risk score: {suspiciousTx.riskScore || 87}/100
                  </Text>
                  <View style={styles.reviewBtn}>
                    <Text style={styles.reviewBtnText}>Review Payment →</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* RECENT PAYMENTS */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>RECENT PAYMENTS</Text>
              <TouchableOpacity onPress={() => navigation.navigate("Payments")}>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.paymentListCard}>
              {recentTxns.length === 0 ? (
                <Text style={styles.emptyText}>No recent transactions recorded.</Text>
              ) : (
                recentTxns.map((item, idx) => {
                  const isRisk = item.status === "Risk detected" || item.status === "Held";
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.paymentItem,
                        idx === recentTxns.length - 1 && styles.paymentItemNoBorder,
                      ]}
                      onPress={() => navigation.navigate("Payments")}
                      activeOpacity={0.8}
                    >
                      <View style={styles.paymentItemLeft}>
                        <Text style={styles.paymentMerchant}>{item.merchant}</Text>
                        <Text style={styles.paymentDate}>{item.date} · {item.paymentMethod}</Text>
                      </View>
                      <View style={styles.paymentItemRight}>
                        <Text
                          style={[
                            styles.paymentAmount,
                            isRisk && { color: colors.threatText },
                          ]}
                        >
                          ₹{(item?.amount ?? 0).toLocaleString("en-IN")}
                        </Text>
                        <StatusBadge
                          label={
                            isRisk
                              ? "Needs review"
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
          </View>

          {/* SECURITY ALERTS */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>SECURITY ALERTS</Text>
              <TouchableOpacity onPress={() => navigation.navigate("Protection")}>
                <Text style={styles.seeAllText}>View center</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.alertSummaryCard}>
              <Ionicons
                name={unreadAlerts.length > 0 ? "notifications-circle" : "checkmark-circle"}
                size={20}
                color={unreadAlerts.length > 0 ? colors.threat : colors.safe}
              />
              <View style={styles.alertTextCol}>
                <Text style={styles.alertSummaryTitle}>
                  {unreadAlerts.length > 0
                    ? `${unreadAlerts.length} Security Alert${unreadAlerts.length > 1 ? "s" : ""}`
                    : "All Security Alerts Resolved"}
                </Text>
                <Text style={styles.alertSummarySub}>
                  {unreadAlerts.length > 0
                    ? "Unusual activity flagged for review."
                    : "No active payment threats detected."}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.viewAlertsBtn}
                onPress={() => navigation.navigate("Protection")}
              >
                <Text style={styles.viewAlertsBtnText}>VIEW</Text>
              </TouchableOpacity>
            </View>
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
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  errorBannerText: {
    ...typography.small,
    color: colors.textSecondary,
    flex: 1,
    fontSize: 13,
  },
  retryBtn: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  retryBtnText: {
    ...typography.smallSemibold,
    fontWeight: "700",
    color: colors.brand,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  greetingTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "700",
    flex: 1,
  },
  notificationBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },
  protectionBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  protectionBannerAttention: {
    borderLeftWidth: 3,
    borderLeftColor: colors.caution,
  },
  protectionText: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 13,
    flex: 1,
  },
  protectionTextAttention: {
    color: colors.textPrimary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  sectionHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.6,
    fontSize: 11,
  },
  seeAllText: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 13,
  },
  overviewCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.sm,
  },
  overviewLabel: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 13,
  },
  totalAmount: {
    ...typography.amountLarge,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.borderLight,
  },
  riskCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    ...shadows.sm,
  },
  attentionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.threat,
    padding: spacing.lg,
    ...shadows.sm,
  },
  attentionTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  attentionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  attentionTextCol: {
    flex: 1,
  },
  attentionMerchant: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 15,
  },
  attentionAmount: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 17,
    marginTop: 1,
  },
  attentionBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
  },
  riskScoreText: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: "600",
    fontSize: 13,
  },
  reviewBtn: {
    backgroundColor: colors.btnPrimaryBg,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  reviewBtnText: {
    ...typography.smallSemibold,
    color: colors.btnPrimaryText,
    fontSize: 12,
  },
  paymentListCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    ...shadows.sm,
  },
  paymentItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  paymentItemNoBorder: {
    borderBottomWidth: 0,
  },
  paymentItemLeft: {
    flex: 1,
  },
  paymentMerchant: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
  },
  paymentDate: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  paymentItemRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  paymentAmount: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.xl,
    textAlign: "center",
  },
  alertSummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  alertTextCol: {
    flex: 1,
  },
  alertSummaryTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
  },
  alertSummarySub: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  viewAlertsBtn: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.sm,
  },
  viewAlertsBtnText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 10,
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: colors.threat,
    borderRadius: radii.full,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  bellBadgeText: {
    color: colors.textInverse,
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 11,
  },
});
