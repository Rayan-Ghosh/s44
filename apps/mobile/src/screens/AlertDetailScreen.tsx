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
import { SecurityAlert } from "../types/alert";

export const AlertDetailScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const alert: SecurityAlert = route.params?.alert;

  if (!alert) {
    return (
      <View style={styles.screen}>
        <Header showBack onBack={() => navigation.goBack()} title="ALERT DETAIL" />
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Alert not found.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        showBack
        onBack={() => navigation.goBack()}
        title="ALERT DETAIL"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Card */}
        <View
          style={[
            styles.heroCard,
            alert.severity === "HIGH" ? styles.heroCardHigh : styles.heroCardNormal,
          ]}
        >
          <View style={styles.badgeRow}>
            <StatusBadge label={alert.severity} status={alert.severity === "HIGH" ? "high" : "low"} />
            <Text style={styles.categoryText}>{alert.timestamp}</Text>
          </View>
          <Text style={styles.heroTitle}>{alert.title}</Text>
          <Text style={styles.heroDesc}>{alert.description}</Text>
          {alert.amount && <Text style={styles.heroAmount}>{alert.amount}</Text>}
        </View>

        {/* Section 1: WHAT HAPPENED */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WHAT HAPPENED</Text>
          <View style={styles.card}>
            <Text style={styles.bodyText}>{alert.whatHappened}</Text>
          </View>
        </View>

        {/* Section 2: WHY AVARAN FLAGGED IT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WHY AVARAN FLAGGED IT</Text>
          <View style={styles.card}>
            {alert.whyFlagged.map((item, idx) => (
              <View key={idx} style={styles.bulletRow}>
                <Ionicons name="alert-circle" size={16} color={colors.threat} style={styles.bulletIcon} />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Section 3: WHAT YOU SHOULD DO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WHAT YOU SHOULD DO</Text>
          <View style={styles.card}>
            {alert.whatYouShouldDo.map((item, idx) => (
              <View key={idx} style={styles.bulletRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.brand} style={styles.bulletIcon} />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionButtons}>
          <Button
            label="Dismiss Alert"
            onPress={() => navigation.goBack()}
            variant="outline"
            size="lg"
          />
        </View>
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
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  heroCardHigh: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.threat,
  },
  heroCardNormal: {
    borderColor: colors.border,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  categoryText: {
    ...typography.small,
    color: colors.textMuted,
  },
  heroTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 22,
  },
  heroDesc: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontSize: 14,
  },
  heroAmount: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  bodyText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
    fontSize: 14,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: spacing.xs,
  },
  bulletIcon: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  bulletText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 20,
    fontSize: 13,
  },
  actionButtons: {
    marginTop: spacing.lg,
  },
});
