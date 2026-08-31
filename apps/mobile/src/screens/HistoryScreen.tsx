import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii } from "../theme/layout";
import { Header } from "../components/common/Header";
import { Badge } from "../components/common/Badge";
import { useSecurity } from "../context/SecurityContext";
import { HistoryItem, PaymentHistoryItem, CallHistoryItem } from "../types/history";

export const HistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { history } = useSecurity();
  const [tab, setTab] = useState<"ALL" | "PAYMENTS" | "CALLS">("ALL");

  const filteredHistory = history.filter((item) => {
    if (tab === "ALL") return true;
    if (tab === "PAYMENTS") return item.type === "payment";
    if (tab === "CALLS") return item.type === "call";
    return true;
  });

  return (
    <View style={styles.screen}>
      <Header
        title="HISTORY"
        showBack
        onBack={() => navigation.goBack()}
      />

      <View style={styles.tabContainer}>
        <TouchableOpacity
          onPress={() => setTab("ALL")}
          style={[styles.tabBtn, tab === "ALL" && styles.tabBtnActive]}
        >
          <Text style={[styles.tabText, tab === "ALL" && styles.tabTextActive]}>
            All ({history.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setTab("PAYMENTS")}
          style={[styles.tabBtn, tab === "PAYMENTS" && styles.tabBtnActive]}
        >
          <Text style={[styles.tabText, tab === "PAYMENTS" && styles.tabTextActive]}>
            Payments ({history.filter((i) => i.type === "payment").length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setTab("CALLS")}
          style={[styles.tabBtn, tab === "CALLS" && styles.tabBtnActive]}
        >
          <Text style={[styles.tabText, tab === "CALLS" && styles.tabTextActive]}>
            Calls ({history.filter((i) => i.type === "call").length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredHistory.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Records</Text>
            <Text style={styles.emptyText}>No activity records for this filter.</Text>
          </View>
        ) : (
          filteredHistory.map((item) => {
            const isPayment = item.type === "payment";
            const payment = isPayment ? (item as PaymentHistoryItem) : null;
            const call = !isPayment ? (item as CallHistoryItem) : null;

            return (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                activeOpacity={0.8}
                onPress={() => navigation.navigate("HistoryDetail", { item })}
              >
                <View style={styles.topRow}>
                  <View style={styles.typeBadge}>
                    <Ionicons
                      name={isPayment ? "card-outline" : "call-outline"}
                      size={16}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.typeText}>{isPayment ? "PAYMENT" : "CALL"}</Text>
                  </View>
                  <Text style={styles.timeText}>{item.formattedTime}</Text>
                </View>

                <View style={styles.mainRow}>
                  <View style={styles.infoCol}>
                    <Text style={styles.primaryText}>
                      {isPayment
                        ? `₹${(payment?.amount ?? 0).toLocaleString("en-IN")}`
                        : call?.callerName || "Unknown Caller"}
                    </Text>
                    <Text style={styles.secondaryText}>
                      {isPayment
                        ? payment?.recipientName || payment?.recipientHandle
                        : call?.callerNumber}
                    </Text>
                  </View>

                  <View style={styles.riskCol}>
                    <Badge
                      label={`${item.riskLevel} · ${item.riskScore}`}
                      riskLevel={item.riskLevel}
                      size="sm"
                    />
                    <Text style={styles.statusLabel}>{item.status}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: "center",
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginHorizontal: 3,
  },
  tabBtnActive: {
    backgroundColor: colors.btnPrimaryBg,
    borderColor: colors.btnPrimaryBg,
  },
  tabText: {
    ...typography.smallSemibold,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.btnPrimaryText,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
  },
  emptyState: {
    paddingVertical: spacing.xxxl,
    alignItems: "center",
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  typeText: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: 4,
    fontWeight: "700",
  },
  timeText: {
    ...typography.small,
    color: colors.textMuted,
  },
  mainRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  infoCol: {
    flex: 1,
  },
  primaryText: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 17,
  },
  secondaryText: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  riskCol: {
    alignItems: "flex-end",
  },
  statusLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
    textTransform: "none",
    fontSize: 11,
  },
});
