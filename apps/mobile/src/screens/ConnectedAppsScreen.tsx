import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii, shadows } from "../theme/layout";
import { Header } from "../components/common/Header";
import { StatusBadge } from "../components/common/StatusBadge";

interface EcosystemApp {
  id: string;
  name: string;
  category: string;
  status: "Protected" | "Available";
  iconName: any;
}

const APPS_LIST: EcosystemApp[] = [
  {
    id: "gpay",
    name: "Google Pay (UPI)",
    category: "Real-time Interception",
    status: "Protected",
    iconName: "logo-google",
  },
  {
    id: "phonepe",
    name: "PhonePe",
    category: "Real-time Interception",
    status: "Protected",
    iconName: "wallet-outline",
  },
  {
    id: "paytm",
    name: "Paytm Payments",
    category: "Wallet & UPI Protection",
    status: "Protected",
    iconName: "card-outline",
  },
  {
    id: "bhim",
    name: "BHIM UPI",
    category: "National UPI Gateway",
    status: "Protected",
    iconName: "swap-horizontal-outline",
  },
  {
    id: "bank",
    name: "Primary Banking App",
    category: "Account Transfer Guard",
    status: "Protected",
    iconName: "business-outline",
  },
];

export const ConnectedAppsScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const handleAppPress = (app: EcosystemApp) => {
    Alert.alert(
      app.name,
      `Status: ${app.status}\nProtection: ${app.category}\n\nAvaran evaluates all outgoing payment intents from this application in real time before UPI PIN confirmation.`
    );
  };

  return (
    <View style={styles.screen}>
      <Header
        title="CONNECTED APPS"
        showBack
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHeader}>CONNECTED PAYMENT APPLICATIONS</Text>

        <View style={styles.listCard}>
          {APPS_LIST.map((app, idx) => (
            <TouchableOpacity
              key={app.id}
              style={[
                styles.appItem,
                idx === APPS_LIST.length - 1 && styles.appItemNoBorder,
              ]}
              onPress={() => handleAppPress(app)}
              activeOpacity={0.8}
            >
              <View style={styles.appLeft}>
                <View style={styles.appIconBox}>
                  <Ionicons name={app.iconName} size={18} color={colors.textPrimary} />
                </View>
                <View style={styles.appTextCol}>
                  <Text style={styles.appName}>{app.name}</Text>
                  <Text style={styles.appCategory}>{app.category}</Text>
                </View>
              </View>
              <StatusBadge
                label={app.status}
                status={app.status === "Protected" ? "low" : "neutral"}
              />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.disclaimerText}>
          Avaran operates as an automated risk intelligence layer underneath payment applications. Transactions are evaluated in real time before funds leave your account.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
  },
  sectionHeader: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    letterSpacing: 0.6,
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    ...shadows.sm,
  },
  appItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  appItemNoBorder: {
    borderBottomWidth: 0,
  },
  appLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  appIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  appTextCol: {
    flex: 1,
  },
  appName: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
  },
  appCategory: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  disclaimerText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    marginTop: spacing.xl,
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
});
