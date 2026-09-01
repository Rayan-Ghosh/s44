import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii, shadows } from "../theme/layout";
import { Header } from "../components/common/Header";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/common/Button";
import { HistoryItem, PaymentHistoryItem, CallHistoryItem } from "../types/history";
import { getRiskLevelFromScore } from "../utils/risk-scoring";

export const HistoryDetailScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const item: HistoryItem = route.params?.item;

  if (!item) {
    return (
      <View style={styles.screen}>
        <Header showBack onBack={() => navigation.goBack()} title="RECORD DETAIL" />
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Record not found.</Text>
        </View>
      </View>
    );
  }

  const isPayment = item.type === "payment";
  const payment = isPayment ? (item as PaymentHistoryItem) : null;
  const call = !isPayment ? (item as CallHistoryItem) : null;
  const itemLevel = item.riskLevel || getRiskLevelFromScore(item.riskScore);

  return (
    <View style={styles.screen}>
      <Header
        showBack
        onBack={() => navigation.goBack()}
        title={isPayment ? "PAYMENT RECORD" : "CALL RECORD"}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Hero Card */}
        <View style={styles.card}>
          <View style={styles.topRow}>
            <StatusBadge
              label={`${itemLevel} RISK · ${item.riskScore}/100`}
              status={itemLevel === "HIGH" ? "high" : itemLevel === "MEDIUM" ? "medium" : "low"}
            />
            <Text style={styles.statusPill}>{item.status}</Text>
          </View>

          <Text style={styles.primaryValue}>
            {isPayment
              ? `₹${(payment?.amount ?? 0).toLocaleString("en-IN")}`
              : call?.callerName || "Unknown Caller"}
          </Text>

          <Text style={styles.secondaryValue}>
            {isPayment ? payment?.recipientHandle || "N/A" : call?.callerNumber || "N/A"}
          </Text>
        </View>

        {/* Detailed Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AUDIT PARTICULARS</Text>
          <View style={styles.detailGrid}>
            <View style={styles.row}>
              <Text style={styles.label}>Event Type</Text>
              <Text style={styles.value}>{(item.type || "").toUpperCase()}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Recorded Timestamp</Text>
              <Text style={styles.value}>{item.timestamp || "N/A"}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Risk Engine Decision</Text>
              <Text style={styles.value}>
                {(item.riskScore ?? 0) >= 75 ? "Confirm / Cancel Flag" : "Standard Allow"}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>User Action</Text>
              <Text style={styles.value}>{(item.actionTaken || "").toUpperCase()}</Text>
            </View>

            {!isPayment && call && (
              <View style={styles.row}>
                <Text style={styles.label}>Detected Pattern</Text>
                <Text style={[styles.value, { color: colors.threatText }]}>
                  {call.detectedPattern}
                </Text>
              </View>
            )}
          </View>
        </View>

        <Button
          label="Back to History"
          onPress={() => navigation.goBack()}
          variant="outline"
          size="lg"
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  statusPill: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  primaryValue: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  secondaryValue: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 0.8,
    fontWeight: "800",
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  detailGrid: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  label: {
    ...typography.small,
    color: colors.textMuted,
  },
  value: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "right",
  },
});
