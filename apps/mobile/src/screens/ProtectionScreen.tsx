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
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii, shadows } from "../theme/layout";
import { Header } from "../components/common/Header";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/common/Button";
import { useAuth } from "../context/AuthContext";
import {
  PaymentService,
  UserPaymentOverview,
  SEED_PAYMENT_OVERVIEW,
} from "../services/payment-service";
import { AlertService, SecurityAlert } from "../services/alert-service";

export const ProtectionScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { session } = useAuth();

  const [overview, setOverview] = useState<UserPaymentOverview>(SEED_PAYMENT_OVERVIEW);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [callAlertDismissed, setCallAlertDismissed] = useState<boolean>(false);

  const loadProtection = useCallback(async () => {
    try {
      const userId = session?.userId || 1;
      const [ovData, alertData] = await Promise.all([
        PaymentService.getOverview(userId),
        AlertService.getAlerts(),
      ]);
      setOverview(ovData);
      setAlerts(alertData);
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [session?.userId]);

  useEffect(() => {
    loadProtection();
  }, [loadProtection]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadProtection();
  };

  const handleReportCall = () => {
    Alert.alert(
      "Call Reported",
      "The suspicious caller has been flagged and reported to security intelligence."
    );
    setCallAlertDismissed(true);
  };

  const handleMarkCallSafe = () => {
    Alert.alert(
      "Marked as Safe",
      "You marked this caller as safe. Feedback recorded."
    );
    setCallAlertDismissed(true);
  };

  return (
    <View style={styles.screen}>
      <Header />

      {/* Screen Title & Subtitle in body */}
      <View style={styles.titleSection}>
        <Text style={styles.screenHeading}>Protection</Text>
        <Text style={styles.screenSubtitle}>Your Avaran protection is active.</Text>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Syncing security shields...</Text>
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
          {/* Active Protection Banner */}
          <View style={styles.statusBanner}>
            <View style={styles.statusIconBox}>
              <Ionicons name="shield-checkmark" size={22} color={colors.safe} />
            </View>
            <View style={styles.statusTextCol}>
              <Text style={styles.statusTitle}>All Protection Shields Active</Text>
              <Text style={styles.statusSub}>
                Real-time scoring active across connected payment apps.
              </Text>
            </View>
          </View>

          {/* THREE PROTECTION MODULES */}
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>PROTECTION MODULES</Text>

            {/* 1. Payment Protection */}
            <View style={styles.moduleCard}>
              <View style={styles.moduleTopRow}>
                <View style={styles.moduleLeft}>
                  <View style={styles.moduleIconCircle}>
                    <Ionicons name="card-outline" size={18} color={colors.textPrimary} />
                  </View>
                  <View>
                    <Text style={styles.moduleTitle}>Payment Protection</Text>
                    <Text style={styles.moduleDesc}>
                      Detects suspicious payments before completion.
                    </Text>
                  </View>
                </View>
                <StatusBadge label="ACTIVE" status="low" />
              </View>
            </View>

            {/* 2. Risk Detection */}
            <View style={styles.moduleCard}>
              <View style={styles.moduleTopRow}>
                <View style={styles.moduleLeft}>
                  <View style={styles.moduleIconCircle}>
                    <Ionicons name="pulse-outline" size={18} color={colors.textPrimary} />
                  </View>
                  <View>
                    <Text style={styles.moduleTitle}>Risk Detection</Text>
                    <Text style={styles.moduleDesc}>
                      Identifies unusual transaction, device and behavioral activity.
                    </Text>
                  </View>
                </View>
                <StatusBadge label="ACTIVE" status="low" />
              </View>
            </View>

            {/* 3. Call Protection */}
            <View style={styles.moduleCard}>
              <View style={styles.moduleTopRow}>
                <View style={styles.moduleLeft}>
                  <View style={styles.moduleIconCircle}>
                    <Ionicons name="call-outline" size={18} color={colors.textPrimary} />
                  </View>
                  <View>
                    <Text style={styles.moduleTitle}>Call Protection</Text>
                    <Text style={styles.moduleDesc}>
                      Helps identify potentially fraudulent calls.
                    </Text>
                  </View>
                </View>
                <StatusBadge label="ACTIVE" status="low" />
              </View>
            </View>
          </View>

          {/* CALL / SOCIAL ENGINEERING PROTECTION UI */}
          {!callAlertDismissed && (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>CALL / SOCIAL-ENGINEERING ALERT</Text>

              <View style={styles.scamCard}>
                <View style={styles.scamHeaderRow}>
                  <View style={styles.scamTitleCol}>
                    <View style={styles.scamIconTag}>
                      <Ionicons name="alert-circle" size={16} color={colors.threat} />
                      <Text style={styles.scamTagText}>Potential scam detected</Text>
                    </View>
                    <Text style={styles.callerName}>Unknown caller</Text>
                    <Text style={styles.callerTime}>Detected during active voice stream</Text>
                  </View>
                  <StatusBadge label="HIGH RISK" status="high" />
                </View>

                {/* Detected Indicators */}
                <View style={styles.indicatorsBox}>
                  <Text style={styles.indicatorsHeading}>SIGNAL ANALYSIS</Text>
                  <View style={styles.indicatorBullet}>
                    <Ionicons name="close-circle" size={14} color={colors.threat} />
                    <Text style={styles.indicatorText}>Requested OTP</Text>
                  </View>
                  <View style={styles.indicatorBullet}>
                    <Ionicons name="close-circle" size={14} color={colors.threat} />
                    <Text style={styles.indicatorText}>Requested banking information</Text>
                  </View>
                  <View style={styles.indicatorBullet}>
                    <Ionicons name="close-circle" size={14} color={colors.threat} />
                    <Text style={styles.indicatorText}>Claimed to be bank support</Text>
                  </View>
                  <View style={styles.indicatorBullet}>
                    <Ionicons name="close-circle" size={14} color={colors.threat} />
                    <Text style={styles.indicatorText}>Urgent financial request</Text>
                  </View>
                  <View style={styles.indicatorBullet}>
                    <Ionicons name="close-circle" size={14} color={colors.threat} />
                    <Text style={styles.indicatorText}>Threat/coercion language</Text>
                  </View>
                </View>

                {/* Actions */}
                <View style={styles.scamActionsRow}>
                  <Button
                    label="REPORT CALL"
                    onPress={handleReportCall}
                    variant="destructive"
                    size="md"
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="MARK AS SAFE"
                    onPress={handleMarkCallSafe}
                    variant="secondary"
                    size="md"
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            </View>
          )}

          {/* RECENT SECURITY ALERTS */}
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>RECENT SECURITY ALERTS</Text>

            <View style={styles.alertsCard}>
              {alerts.length === 0 ? (
                <Text style={styles.emptyText}>No recent alerts detected.</Text>
              ) : (
                alerts.map((a, idx) => (
                  <View
                    key={a.id}
                    style={[
                      styles.alertItem,
                      idx === alerts.length - 1 && styles.alertItemNoBorder,
                    ]}
                  >
                    <View style={styles.alertItemTop}>
                      <View style={styles.alertTitleRow}>
                        <Ionicons
                          name={
                            a.severity === "HIGH"
                              ? "alert-circle"
                              : "information-circle-outline"
                          }
                          size={16}
                          color={a.severity === "HIGH" ? colors.threat : colors.brand}
                        />
                        <Text style={styles.alertTitle}>{a.title}</Text>
                      </View>
                      <StatusBadge
                        label={a.severity}
                        status={a.severity === "HIGH" ? "high" : "low"}
                      />
                    </View>
                    <Text style={styles.alertDesc}>{a.description}</Text>
                    <View style={styles.alertFooter}>
                      <Text style={styles.alertTimestamp}>{a.timestamp}</Text>
                      {a.transactionId && (
                        <TouchableOpacity onPress={() => navigation.navigate("Payments")}>
                          <Text style={styles.viewRelatedLink}>View Payment →</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))
              )}
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
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  statusIconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTextCol: {
    flex: 1,
    gap: 2,
  },
  statusTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 15,
  },
  statusSub: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    letterSpacing: 0.6,
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  moduleCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  moduleTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  moduleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
    paddingRight: spacing.sm,
  },
  moduleIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
  },
  moduleDesc: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  scamCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.threat,
    padding: spacing.lg,
    ...shadows.sm,
  },
  scamHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  scamTitleCol: {
    flex: 1,
    gap: 2,
  },
  scamIconTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  scamTagText: {
    ...typography.caption,
    color: colors.threatText,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.4,
  },
  callerName: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 16,
  },
  callerTime: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
  },
  indicatorsBox: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    marginVertical: spacing.md,
  },
  indicatorsHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  indicatorBullet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginVertical: 3,
  },
  indicatorText: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 13,
  },
  scamActionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  alertsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    ...shadows.sm,
  },
  alertItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  alertItemNoBorder: {
    paddingVertical: spacing.md,
  },
  alertItemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  alertTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1,
  },
  alertTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 13,
  },
  alertDesc: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  alertFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  alertTimestamp: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 10,
  },
  viewRelatedLink: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 11,
  },
  emptyText: {
    ...typography.small,
    color: colors.textMuted,
    paddingVertical: spacing.lg,
    textAlign: "center",
  },
});
