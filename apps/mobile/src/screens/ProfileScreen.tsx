import React, { useState, useEffect } from "react";
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
import { FloatingToast, ToastConfig } from "../components/common/FloatingToast";
import { PolicyModal, PolicyType } from "../components/common/PolicyModal";
import { EditProfileModal } from "../components/profile/EditProfileModal";
import { DeviceDetailsModal } from "../components/profile/DeviceDetailsModal";
import { HelpSupportModal } from "../components/profile/HelpSupportModal";
import { ServerEndpointModal } from "../components/profile/ServerEndpointModal";
import { useAuth } from "../context/AuthContext";
import { useBiometrics } from "../context/BiometricContext";
import { useSecurity } from "../context/SecurityContext";
import { ConnectedAppsService, ConnectedApp } from "../services/connected-apps-service";
import { getApiBaseUrl } from "../services/api-client";

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { session, updateProfile, logout } = useAuth();
  const { isBiometricsEnabled, setBiometricsEnabled, biometricStatus } = useBiometrics();
  const { alerts } = useSecurity();

  // Settings state
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(true);
  const [callProtectionEnabled, setCallProtectionEnabled] = useState<boolean>(true);

  // Connected apps state
  const [connectedApps, setConnectedApps] = useState<ConnectedApp[]>(ConnectedAppsService.getApps());

  // Modals & Toast state
  const [toastConfig, setToastConfig] = useState<ToastConfig | null>(null);
  const [isEditProfileVisible, setIsEditProfileVisible] = useState<boolean>(false);
  const [isDeviceDetailsVisible, setIsDeviceDetailsVisible] = useState<boolean>(false);
  const [isHelpSupportVisible, setIsHelpSupportVisible] = useState<boolean>(false);
  const [isServerModalVisible, setIsServerModalVisible] = useState<boolean>(false);
  const [activePolicyModal, setActivePolicyModal] = useState<PolicyType | null>(null);
  const [currentApiEndpoint, setCurrentApiEndpoint] = useState<string>(getApiBaseUrl());

  // Subscribe to connected apps updates
  useEffect(() => {
    const unsubscribe = ConnectedAppsService.subscribe((updatedApps) => {
      setConnectedApps(updatedApps);
    });
    return unsubscribe;
  }, []);

  const showToast = (message: string, type: "info" | "success" | "warning" = "success") => {
    setToastConfig({ message, type });
  };

  // Toggle Handlers with floating feedback
  const handleBiometricsToggle = (value: boolean) => {
    setBiometricsEnabled(value);
    showToast(
      value ? "Biometric Lock activated" : "Biometric Lock deactivated",
      value ? "success" : "info"
    );
  };

  const handleAlertsToggle = (value: boolean) => {
    setAlertsEnabled(value);
    showToast(
      value ? "Security Alerts activated" : "Security Alerts deactivated",
      value ? "success" : "info"
    );
  };

  const handleCallProtectionToggle = (value: boolean) => {
    setCallProtectionEnabled(value);
    showToast(
      value ? "Call Protection activated" : "Call Protection deactivated",
      value ? "success" : "info"
    );
  };

  const handleSaveProfile = async (data: { name: string; phone: string; email: string }) => {
    const res = await updateProfile(data);
    if (res.success) {
      showToast("Profile updated successfully", "success");
      return true;
    } else {
      showToast(res.error || "Failed to update profile", "warning");
      return false;
    }
  };

  const handleSignOut = async () => {
    if (Platform.OS === "web") {
      const confirmed = typeof window !== "undefined"
        ? window.confirm("Are you sure you want to log out of Avaran?")
        : true;
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

  const handleServerConfig = () => {
    const current = getApiBaseUrl();
    Alert.alert(
      "API Server Configuration",
      `Active Base URL:\n${current}\n\nEvaluator options:\n1. Android Emulator: http://10.0.2.2:8000\n2. Physical Phone (Wi-Fi): http://<PC_IP>:8000\n3. Public Cloud: https://your-api.com\n\nSet EXPO_PUBLIC_API_URL during build or launch.`,
      [{ text: "OK", style: "default" }]
    );
  };


  return (
    <View style={styles.screen}>
      <Header title="AVARAN" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Card (Clickable to Edit Profile) */}
        <TouchableOpacity
          style={styles.userCard}
          onPress={() => setIsEditProfileVisible(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Edit Profile"
        >
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={24} color={colors.brand} />
          </View>
          <View style={styles.userTextCol}>
            <View style={styles.userNameRow}>
              <Text style={styles.userName}>{session?.name || "Your Name"}</Text>
              <Ionicons name="pencil-outline" size={14} color={colors.textTertiary} />
            </View>
            <Text style={styles.userPhone}>{session?.phone || ""}</Text>
            <Text style={styles.userEmail}>{session?.email || ""}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </TouchableOpacity>

        {/* Connected Apps Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>CONNECTED APPS</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("ConnectedApps")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Manage connected applications"
            >
              <Text style={styles.seeAllText}>Manage</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            {connectedApps.map((app, idx) => (
              <TouchableOpacity
                key={app.id}
                style={[
                  styles.appRow,
                  idx === connectedApps.length - 1 && styles.appRowNoBorder,
                ]}
                onPress={() => navigation.navigate("ConnectedApps")}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Manage ${app.name} protection`}
              >
                <View style={styles.appLeft}>
                  <View style={styles.appIconCircle}>
                    <Ionicons name={app.iconName} size={17} color={colors.textPrimary} />
                  </View>
                  <View style={styles.appTextCol}>
                    <Text style={styles.appName}>{app.name}</Text>
                    <Text style={styles.appCategory}>{app.category}</Text>
                  </View>
                </View>
                <StatusBadge
                  label={app.status}
                  status={app.isProtected ? "low" : "neutral"}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Security Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>SECURITY CONTROLS</Text>

          <View style={styles.card}>
            {/* Biometric Launch Lock */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <Text style={styles.toggleLabel}>Device Biometric Lock</Text>
                <Text style={styles.toggleSub}>
                  {biometricStatus.displayName} · Hardware Enrolled
                </Text>
              </View>
              <Switch
                value={isBiometricsEnabled}
                onValueChange={handleBiometricsToggle}
                trackColor={{ false: colors.borderLight, true: colors.safeSurface }}
                thumbColor={isBiometricsEnabled ? colors.safe : colors.textMuted}
              />
            </View>

            {/* Security Alerts */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <Text style={styles.toggleLabel}>Security Alerts</Text>
                <Text style={styles.toggleSub}>Real-time notification on threats</Text>
              </View>
              <Switch
                value={alertsEnabled}
                onValueChange={handleAlertsToggle}
                trackColor={{ false: colors.borderLight, true: colors.safeSurface }}
                thumbColor={alertsEnabled ? colors.safe : colors.textMuted}
              />
            </View>

            {/* Call Protection */}
            <View style={styles.toggleRowNoBorder}>
              <View style={styles.toggleTextCol}>
                <Text style={styles.toggleLabel}>Call Protection</Text>
                <Text style={styles.toggleSub}>On-device acoustic fraud detection</Text>
              </View>
              <Switch
                value={callProtectionEnabled}
                onValueChange={handleCallProtectionToggle}
                trackColor={{ false: colors.borderLight, true: colors.safeSurface }}
                thumbColor={callProtectionEnabled ? colors.safe : colors.textMuted}
              />
            </View>
          </View>
        </View>

        {/* Trusted Devices Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>TRUSTED DEVICES</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.navRowNoBorder}
              onPress={() => setIsDeviceDetailsVisible(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="View Google Pixel 8 Pro device details"
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
            {/* Help & Support */}
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => setIsHelpSupportVisible(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Open Help and Support"
            >
              <Text style={styles.navLabel}>Help & Support</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {/* Privacy Policy */}
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => setActivePolicyModal("privacy")}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Open Privacy Policy"
            >
              <Text style={styles.navLabel}>Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {/* Server Endpoint */}
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => setIsServerModalVisible(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Configure API Server Endpoint"
            >
              <View>
                <Text style={styles.navLabel}>Server Endpoint</Text>
                <Text style={styles.navSub}>{currentApiEndpoint}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {/* Terms of Service */}
            <TouchableOpacity
              style={styles.navRowNoBorder}
              onPress={() => setActivePolicyModal("terms")}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Open Terms of Service"
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

      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={isEditProfileVisible}
        initialName={session?.name || "Your Name"}
        initialPhone={session?.phone || ""}
        initialEmail={session?.email || ""}
        onClose={() => setIsEditProfileVisible(false)}
        onSave={handleSaveProfile}
      />

      {/* Device Details Modal */}
      <DeviceDetailsModal
        visible={isDeviceDetailsVisible}
        onClose={() => setIsDeviceDetailsVisible(false)}
        onShowToast={showToast}
      />

      {/* Server Endpoint Modal */}
      <ServerEndpointModal
        visible={isServerModalVisible}
        onClose={() => setIsServerModalVisible(false)}
        onEndpointSaved={(newUrl) => {
          setCurrentApiEndpoint(newUrl);
          showToast(`Server endpoint updated: ${newUrl}`, "success");
        }}
      />

      {/* Help & Support Modal */}
      <HelpSupportModal
        visible={isHelpSupportVisible}
        onClose={() => setIsHelpSupportVisible(false)}
        onShowToast={showToast}
        onTriggerTestAlert={() => {
          // Trigger test alert notification
        }}
      />

      {/* Interactive Policy Modal */}
      <PolicyModal
        visible={activePolicyModal !== null}
        type={activePolicyModal || "privacy"}
        onClose={() => setActivePolicyModal(null)}
      />

      {/* Floating confirmation toast for toggle feedback */}
      <FloatingToast
        config={toastConfig}
        onDismiss={() => setToastConfig(null)}
      />
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
  userNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
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
    paddingVertical: spacing.md - 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  appRowNoBorder: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md - 1,
  },
  appLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md - 2,
    flex: 1,
    paddingRight: spacing.sm,
  },
  appIconCircle: {
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
    fontWeight: "700",
  },
  appCategory: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
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
