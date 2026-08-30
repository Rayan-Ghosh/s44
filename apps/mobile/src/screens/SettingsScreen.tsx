import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii } from "../theme/layout";
import { Header } from "../components/common/Header";
import { Button } from "../components/common/Button";
import { StatusBadge } from "../components/common/StatusBadge";
import { useSecurity } from "../context/SecurityContext";
import { useBiometrics } from "../context/BiometricContext";
import { useAppHealth } from "../context/AppHealthContext";

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { protectionActive, toggleProtection, resetDemo } = useSecurity();
  const { isBiometricsEnabled, setBiometricsEnabled, biometricStatus } = useBiometrics();
  const { metrics, simulateFreeze } = useAppHealth();

  const [callMonitorEnabled, setCallMonitorEnabled] = useState<boolean>(true);
  const [upiGuardEnabled, setUpiGuardEnabled] = useState<boolean>(true);
  const [pushNotifsEnabled, setPushNotifsEnabled] = useState<boolean>(true);

  const handleReset = () => {
    resetDemo();
    Alert.alert("Demo Reset", "All demo states, payments, calls, and alerts have been restored to initial state.");
  };

  return (
    <View style={styles.screen}>
      <Header
        showBack
        onBack={() => navigation.goBack()}
        title="SETTINGS"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Protection Toggles */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>REAL-TIME GUARDS</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Master Protection</Text>
                <Text style={styles.rowSubtitle}>Active defense shield across all vectors</Text>
              </View>
              <Switch
                value={protectionActive}
                onValueChange={toggleProtection}
                trackColor={{ false: colors.borderLight, true: colors.safeSurface }}
                thumbColor={protectionActive ? colors.safe : colors.textMuted}
              />
            </View>

            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Voice Call Phishing Scanner</Text>
                <Text style={styles.rowSubtitle}>Acoustic & social engineering detection</Text>
              </View>
              <Switch
                value={callMonitorEnabled}
                onValueChange={setCallMonitorEnabled}
                trackColor={{ false: colors.borderLight, true: colors.safeSurface }}
                thumbColor={callMonitorEnabled ? colors.safe : colors.textMuted}
              />
            </View>

            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>UPI & Transfer Guardian</Text>
                <Text style={styles.rowSubtitle}>Intercepts anomalous & novel recipient transfers</Text>
              </View>
              <Switch
                value={upiGuardEnabled}
                onValueChange={setUpiGuardEnabled}
                trackColor={{ false: colors.borderLight, true: colors.safeSurface }}
                thumbColor={upiGuardEnabled ? colors.safe : colors.textMuted}
              />
            </View>

            <View style={styles.rowNoBorder}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Biometric Launch Lock</Text>
                <Text style={styles.rowSubtitle}>
                  {biometricStatus.displayName} verification on app launch
                </Text>
              </View>
              <Switch
                value={isBiometricsEnabled}
                onValueChange={setBiometricsEnabled}
                trackColor={{ false: colors.borderLight, true: colors.safeSurface }}
                thumbColor={isBiometricsEnabled ? colors.safe : colors.textMuted}
              />
            </View>
          </View>
        </View>

        {/* App Health & Watchdog Diagnostics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>APP HEALTH & THREAD WATCHDOG</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Health Status</Text>
              <StatusBadge
                label={metrics.status}
                status={metrics.status === "HEALTHY" ? "low" : metrics.status === "DEGRADED" ? "medium" : "high"}
              />
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Event Loop Lag</Text>
              <Text style={styles.infoValue}>{metrics.eventLoopLagMs} ms</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Render Frame Rate</Text>
              <Text style={styles.infoValue}>{metrics.fps} FPS</Text>
            </View>
            <View style={styles.infoRowNoBorder}>
              <Text style={styles.infoLabel}>Active Watchdog</Text>
              <Text style={[styles.infoValue, { color: colors.safe }]}>250ms Heartbeat Active</Text>
            </View>

            <Button
              label="Simulate 2.2s Thread Freeze"
              onPress={() => simulateFreeze(2200)}
              variant="outline"
              size="md"
              icon="pulse"
              style={{ marginTop: spacing.md }}
            />
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
          <View style={styles.card}>
            <View style={styles.rowNoBorder}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>High-Threat Push Alerts</Text>
                <Text style={styles.rowSubtitle}>Immediate warnings for phone scam interception</Text>
              </View>
              <Switch
                value={pushNotifsEnabled}
                onValueChange={setPushNotifsEnabled}
                trackColor={{ false: colors.borderLight, true: colors.safeSurface }}
                thumbColor={pushNotifsEnabled ? colors.safe : colors.textMuted}
              />
            </View>
          </View>
        </View>

        {/* Privacy & Data Minimization Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRIVACY & DATA MINIMIZATION</Text>
          <View style={styles.card}>
            <View style={styles.privacyItem}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textPrimary} style={styles.privacyIcon} />
              <View style={styles.privacyContent}>
                <Text style={styles.privacyTitle}>Zero Audio Cloud Retention</Text>
                <Text style={styles.privacyDesc}>
                  Voice streams are analyzed ephemerally in RAM. Raw audio is never permanently stored on servers.
                </Text>
              </View>
            </View>

            <View style={styles.privacyItem}>
              <Ionicons name="finger-print-outline" size={20} color={colors.textPrimary} style={styles.privacyIcon} />
              <View style={styles.privacyContent}>
                <Text style={styles.privacyTitle}>Pseudonymized Hardware IDs</Text>
                <Text style={styles.privacyDesc}>
                  Device hardware identifiers are one-way hashed with salted SHA-256 tokens.
                </Text>
              </View>
            </View>

            <View style={styles.privacyItemNoBorder}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.textPrimary} style={styles.privacyIcon} />
              <View style={styles.privacyContent}>
                <Text style={styles.privacyTitle}>Zero Financial Credential Storage</Text>
                <Text style={styles.privacyDesc}>
                  UPI PINs, passwords, and banking credentials are never requested or inspected by Avaran.
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* About & Demo Controller */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DEMO & SYSTEM</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Engine Version</Text>
              <Text style={styles.infoValue}>Avaran S40 (v1.0.0)</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Platform Build</Text>
              <Text style={styles.infoValue}>Expo React Native (Android + iOS)</Text>
            </View>
            <View style={styles.infoRowNoBorder}>
              <Text style={styles.infoLabel}>Environment</Text>
              <Text style={styles.infoValue}>Deterministic Offline / API Ready</Text>
            </View>

            <Button
              label="Reset Demo State"
              onPress={handleReset}
              variant="outline"
              size="md"
              icon="refresh"
              style={{ marginTop: spacing.md }}
            />
          </View>
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
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  rowNoBorder: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  rowInfo: {
    flex: 1,
    paddingRight: spacing.md,
  },
  rowTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
  },
  rowSubtitle: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  privacyItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  privacyItemNoBorder: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.md,
  },
  privacyIcon: {
    marginRight: spacing.md,
    marginTop: 2,
  },
  privacyContent: {
    flex: 1,
  },
  privacyTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
  },
  privacyDesc: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  infoRowNoBorder: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    ...typography.small,
    color: colors.textMuted,
  },
  infoValue: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
  },
});
