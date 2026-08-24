import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii } from "../theme/layout";
import { Header } from "../components/common/Header";
import { AlertItem } from "../components/alerts/AlertItem";
import { useSecurity } from "../context/SecurityContext";

export const AlertsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { alerts, markAlertRead } = useSecurity();
  const [filter, setFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");

  const filteredAlerts = alerts.filter((a) => {
    if (filter === "ALL") return true;
    return a.severity === filter;
  });

  const handleSelectAlert = (alert: any) => {
    markAlertRead(alert.id);
    navigation.navigate("AlertDetail", { alert });
  };

  return (
    <View style={styles.screen}>
      <Header
        title="ALERTS"
        showBack
        onBack={() => navigation.goBack()}
      />

      <View style={styles.filterRow}>
        <TouchableOpacity
          onPress={() => setFilter("ALL")}
          style={[styles.filterChip, filter === "ALL" && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, filter === "ALL" && styles.filterChipTextActive]}>
            All ({alerts.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilter("HIGH")}
          style={[styles.filterChip, filter === "HIGH" && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, filter === "HIGH" && styles.filterChipTextActive]}>
            High Threat ({alerts.filter((a) => a.severity === "HIGH").length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilter("MEDIUM")}
          style={[styles.filterChip, filter === "MEDIUM" && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, filter === "MEDIUM" && styles.filterChipTextActive]}>
            Medium ({alerts.filter((a) => a.severity === "MEDIUM").length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilter("LOW")}
          style={[styles.filterChip, filter === "LOW" && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, filter === "LOW" && styles.filterChipTextActive]}>
            Low ({alerts.filter((a) => a.severity === "LOW").length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredAlerts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Inbox Clear</Text>
            <Text style={styles.emptyText}>No alerts matching this filter.</Text>
          </View>
        ) : (
          filteredAlerts.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onPress={() => handleSelectAlert(alert)}
            />
          ))
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
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  filterChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginRight: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.btnPrimaryBg,
    borderColor: colors.btnPrimaryBg,
  },
  filterChipText: {
    ...typography.smallSemibold,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
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
});
