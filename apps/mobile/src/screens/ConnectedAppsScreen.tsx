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
import { FloatingToast, ToastConfig } from "../components/common/FloatingToast";
import { ConnectedAppsService, ConnectedApp } from "../services/connected-apps-service";
import { AddPaymentAppModal } from "../components/profile/AddPaymentAppModal";

export const ConnectedAppsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [apps, setApps] = useState<ConnectedApp[]>(ConnectedAppsService.getApps());
  const [toastConfig, setToastConfig] = useState<ToastConfig | null>(null);
  const [isAddModalVisible, setIsAddModalVisible] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = ConnectedAppsService.subscribe((updatedApps) => {
      setApps(updatedApps);
    });
    return unsubscribe;
  }, []);

  const handleToggle = (app: ConnectedApp, value: boolean) => {
    ConnectedAppsService.toggleAppProtection(app.id, value);
    setToastConfig({
      message: value
        ? `✓ ${app.name} enabled for payment protection`
        : `${app.name} paused (disabled in payment selector)`,
      type: value ? "success" : "info",
    });
  };

  const handleRemove = (app: ConnectedApp) => {
    Alert.alert(
      "Remove Payment App",
      `Are you sure you want to disconnect ${app.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            ConnectedAppsService.removeApp(app.id);
            setToastConfig({
              message: `${app.name} removed from connected apps`,
              type: "info",
            });
          },
        },
      ]
    );
  };

  const handleAppPress = (app: ConnectedApp) => {
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
        <View style={styles.headerRow}>
          <Text style={styles.sectionHeader}>CONNECTED PAYMENT APPLICATIONS</Text>
          <TouchableOpacity
            style={styles.addAppHeaderBtn}
            onPress={() => setIsAddModalVisible(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add Payment App"
          >
            <Ionicons name="add" size={14} color={colors.btnPrimaryText} style={{ marginRight: 2 }} />
            <Text style={styles.addAppHeaderBtnText}>ADD PAYMENT APP</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionDesc}>
          Applications enabled here will appear in your live payment selector when completing verified transactions.
        </Text>

        <View style={styles.listCard}>
          {apps.map((app, idx) => (
            <View
              key={app.id}
              style={[
                styles.appItem,
                idx === apps.length - 1 && styles.appItemNoBorder,
              ]}
            >
              <TouchableOpacity
                style={styles.appLeft}
                onPress={() => handleAppPress(app)}
                activeOpacity={0.7}
              >
                <View style={styles.appIconBox}>
                  <Ionicons name={app.iconName} size={18} color={colors.textPrimary} />
                </View>
                <View style={styles.appTextCol}>
                  <Text style={styles.appName}>{app.name}</Text>
                  <Text style={styles.appCategory}>{app.category}</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.appRight}>
                <StatusBadge
                  label={app.isProtected ? "ENABLED" : "DISABLED"}
                  status={app.isProtected ? "low" : "neutral"}
                />
                <Switch
                  value={app.isProtected}
                  onValueChange={(val) => handleToggle(app, val)}
                  trackColor={{ false: colors.borderLight, true: colors.safeSurface }}
                  thumbColor={app.isProtected ? colors.safe : colors.textMuted}
                  style={styles.switch}
                />
                {app.isCustomAdded && (
                  <TouchableOpacity
                    onPress={() => handleRemove(app)}
                    style={styles.removeBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={`Remove ${app.name}`}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Big Add Button at bottom */}
        <TouchableOpacity
          style={styles.addAppBigBtn}
          onPress={() => setIsAddModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.btnPrimaryBg} style={{ marginRight: 6 }} />
          <Text style={styles.addAppBigBtnText}>+ ADD PAYMENT APP</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Add Payment App Modal */}
      <AddPaymentAppModal
        visible={isAddModalVisible}
        connectedApps={apps}
        onClose={() => setIsAddModalVisible(false)}
        onAppAdded={(appName) => {
          setToastConfig({
            message: `✓ ${appName} successfully connected & enabled`,
            type: "success",
          });
        }}
      />

      {/* Floating Toast Notification */}
      <FloatingToast config={toastConfig} onDismiss={() => setToastConfig(null)} />
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  sectionHeader: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.6,
    fontSize: 11,
  },
  sectionDesc: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  addAppHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.btnPrimaryBg,
    borderRadius: radii.sm,
    paddingVertical: 5,
    paddingHorizontal: 8,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  addAppHeaderBtnText: {
    ...typography.caption,
    color: colors.btnPrimaryText,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.4,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    ...shadows.sm,
  },
  appItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.sm,
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
    borderRadius: radii.md,
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
    fontSize: 11,
    marginTop: 2,
  },
  appRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  switch: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
  removeBtn: {
    padding: 4,
    marginLeft: 2,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  addAppBigBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderStyle: "dashed",
    paddingVertical: 14,
    marginTop: spacing.lg,
    ...shadows.sm,
    ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
  },
  addAppBigBtnText: {
    ...typography.bodySemibold,
    color: colors.btnPrimaryBg,
    fontSize: 13,
    fontWeight: "700",
  },
});
