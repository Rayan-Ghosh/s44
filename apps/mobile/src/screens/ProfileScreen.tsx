import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
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
import { useBiometrics } from "../context/BiometricContext";
import { getApiBaseUrl } from "../services/api-client";

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { session, logout } = useAuth();
  const { isBiometricsEnabled, setBiometricsEnabled, biometricStatus } = useBiometrics();

  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(true);
  const [callProtectionEnabled, setCallProtectionEnabled] = useState<boolean>(true);

  const handleSignOut = async () => {
    if (Platform.OS === "web") {
      const confirmed = typeof window !== "undefined" ? window.confirm("Are you sure you want to log out of Avaran?") : true;
      if (confirmed) {
        await logout();
      }
    } else {
      Alert.alert(
        "Log Out",
        "Are you sure you want to log out of Avaran?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Log Out",
            style: "destructive",
            onPress: async () => {
              await logout();
            },
          },
        ]
      );
    }
  };

  const handleInfo = (title: string, message: string) => {
    Alert.alert(title, message);
  };

  const handleServerConfig = () => {
    const current = getApiBaseUrl();
    Alert.alert(
      "API Server Configuration",
      `Active Base URL:\n${current}\n\nEvaluator options:\n1. Android Emulator: http://10.0.2.2:8000\n2. Physical Phone (Wi-Fi): http://<PC_IP>:8000\n3. Public Cloud: https://your-api.com\n\nSet EXPO_PUBLIC_API_URL during build or launch.`,
      [{ text: "OK", style: "default" }]
    );
  };

  const connectedApps = [
    { name: "Google Pay", icon: "logo-google" as const },
    { name: "PhonePe", icon: "wallet-outline" as const },
    { name: "Paytm", icon: "card-outline" as const },
    { name: "BHIM UPI", icon: "swap-horizontal-outline" as const },
  ];

  return (
    <View style={styles.screen}>
      <Header
        title="AVARAN"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Card */}
        <View style={styles.userCard}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={24} color={colors.brand} />
          </View>
          <View style={styles.userTextCol}>
            <Text style={styles.userName}>{session?.name || "Rahul Sharma"}</Text>
            <Text style={styles.userPhone}>{session?.phone || "+91 98765 43210"}</Text>
            <Text style={styles.userEmail}>{session?.email || "rahul@example.com"}</Text>
          </View>
        </View>

        {/* Connected Apps Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>CONNECTED APPS</Text>
            <TouchableOpacity onPress={() => navigation.navigate("ConnectedApps")}>
              <Text style={styles.seeAllText}>Manage</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            {connectedApps.map((app, idx) => (
              <View
                key={app.name}
                style={[
                  styles.appRow,
                  idx === connectedApps.length - 1 && styles.appRowNoBorder,
                ]}
              >
                <View style={styles.appLeft}>
                  <View style={styles.appIconCircle}>
                    <Ionicons name={app.icon} size={16} color={colors.textPrimary} />
                  </View>
                  <Text style={styles.appName}>{app.name}</Text>
                </View>
                <StatusBadge label="Protected" status="low" />
              </View>
            ))}
          </View>
        </View>

        {/* Security Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>SECURITY CONTROLS</Text>

          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <Text style={styles.toggleLabel}>Biometric Launch Lock</Text>
                <Text style={styles.toggleSub}>{biometricStatus.displayName} · Hardware Enrolled</Text>
              </View>
              <Switch
                value={isBiometricsEnabled}
                onValueChange={setBiometricsEnabled}
                trackColor={{ false: colors.borderLight, true: colors.safeSurface }}
                thumbColor={isBiometricsEnabled ? colors.safe : colors.textMuted}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <Text style={styles.toggleLabel}>Security Alerts</Text>
                <Text style={styles.toggleSub}>Real-time notification on threats</Text>
              </View>
              <Switch
                value={alertsEnabled}
                onValueChange={setAlertsEnabled}
                trackColor={{ false: colors.borderLight, true: colors.safeSurface }}
                thumbColor={alertsEnabled ? colors.safe : colors.textMuted}
              />
            </View>

            <View style={styles.toggleRowNoBorder}>
              <View style={styles.toggleTextCol}>
                <Text style={styles.toggleLabel}>Call Protection</Text>
                <Text style={styles.toggleSub}>On-device acoustic fraud detection</Text>
              </View>
              <Switch
                value={callProtectionEnabled}
                onValueChange={setCallProtectionEnabled}
                trackColor={{ false: colors.borderLight, true: colors.safeSurface }}
                thumbColor={callProtectionEnabled ? colors.safe : colors.textMuted}
              />
            </View>
          </View>
        </View>

        {/* Integrations & Devices */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>TRUSTED DEVICES</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.navRowNoBorder}
              onPress={() =>
                handleInfo(
                  "Trusted Devices",
                  "Primary Device: Google Pixel 8 Pro (Active · Hardware Token Hashed)"
                )
              }
              activeOpacity={0.7}
            >
              <View>
                <Text style={styles.navLabel}>Google Pixel 8 Pro</Text>
                <Text style={styles.navSub}>Primary device · Registered hardware token</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Support & Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>SUPPORT & LEGAL</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.navRow}
              onPress={() =>
                handleInfo("Help & Support", "Avaran 24/7 Security Helpline: 1800-AVARAN-CARE")
              }
              activeOpacity={0.7}
            >
              <Text style={styles.navLabel}>Help & Support</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navRow}
              onPress={() =>
                handleInfo(
                  "Privacy",
                  "Zero raw audio storage. On-device feature extraction and end-to-end cryptographic hashing."
                )
              }
              activeOpacity={0.7}
            >
              <Text style={styles.navLabel}>Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navRow}
              onPress={handleServerConfig}
              activeOpacity={0.7}
            >
              <View>
                <Text style={styles.navLabel}>Server Endpoint</Text>
                <Text style={styles.navSub}>{getApiBaseUrl()}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navRowNoBorder}
              onPress={() =>
                handleInfo(
                  "Terms",
                  "Avaran real-time UPI and digital wallet fraud protection agreement."
                )
              }
              activeOpacity={0.7}
            >
              <Text style={styles.navLabel}>Terms of Service</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Log Out Button */}
        <View style={styles.section}>
          <Button
            label="LOG OUT"
            onPress={handleSignOut}
            variant="destructive"
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
    gap: spacing.md,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  userTextCol: {
    flex: 1,
  },
  userName: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 17,
  },
  userPhone: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 1,
  },
  userEmail: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  sectionHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    letterSpacing: 0.6,
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  seeAllText: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    ...shadows.sm,
  },
  appRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  appRowNoBorder: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  appLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  appIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  toggleRowNoBorder: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  toggleTextCol: {
    flex: 1,
    paddingRight: spacing.md,
  },
  toggleLabel: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
  },
  toggleSub: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  navRowNoBorder: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  navLabel: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
  },
  navSub: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
