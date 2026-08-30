import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import {
  ConnectedAppsService,
  SUPPORTED_CATALOG_APPS,
  ConnectedApp,
} from "../../services/connected-apps-service";

interface AddPaymentAppModalProps {
  visible: boolean;
  connectedApps: ConnectedApp[];
  onClose: () => void;
  onAppAdded: (appName: string) => void;
}

export const AddPaymentAppModal: React.FC<AddPaymentAppModalProps> = ({
  visible,
  connectedApps,
  onClose,
  onAppAdded,
}) => {
  const handleAdd = (catalogApp: typeof SUPPORTED_CATALOG_APPS[0]) => {
    ConnectedAppsService.addApp(catalogApp);
    onAppAdded(catalogApp.name);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.modalCard}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={styles.headerLeft}>
                  <View style={styles.iconBox}>
                    <Ionicons name="add-circle-outline" size={22} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>Add Payment App</Text>
                    <Text style={styles.modalSub}>Select a supported UPI or banking gateway</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Catalog list */}
              <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.sectionHeading}>SUPPORTED PAYMENT APPLICATIONS</Text>

                {SUPPORTED_CATALOG_APPS.map((catalogApp) => {
                  const isAlreadyAdded = connectedApps.some((c) => c.id === catalogApp.id && c.isProtected);
                  const isPaused = connectedApps.some((c) => c.id === catalogApp.id && !c.isProtected);

                  return (
                    <TouchableOpacity
                      key={catalogApp.id}
                      style={[
                        styles.catalogRow,
                        isAlreadyAdded && styles.catalogRowAdded,
                        ...(Platform.OS === "web" && !isAlreadyAdded ? [{ cursor: "pointer" } as any] : []),
                      ]}
                      onPress={() => !isAlreadyAdded && handleAdd(catalogApp)}
                      disabled={isAlreadyAdded}
                      activeOpacity={0.7}
                    >
                      <View style={styles.appLeft}>
                        <View style={styles.appIconCircle}>
                          <Ionicons
                            name={catalogApp.iconName}
                            size={20}
                            color={colors.textPrimary}
                          />
                        </View>
                        <View style={styles.appTextCol}>
                          <Text style={styles.appName}>{catalogApp.name}</Text>
                          <Text style={styles.appCategory}>{catalogApp.category}</Text>
                        </View>
                      </View>

                      <View style={styles.appRight}>
                        {isAlreadyAdded ? (
                          <View style={styles.connectedPill}>
                            <Ionicons name="checkmark-circle" size={14} color={colors.safe} />
                            <Text style={styles.connectedPillText}>CONNECTED</Text>
                          </View>
                        ) : isPaused ? (
                          <View style={styles.reconnectBtn}>
                            <Text style={styles.reconnectBtnText}>RE-ENABLE</Text>
                          </View>
                        ) : (
                          <View style={styles.addBtn}>
                            <Ionicons name="add" size={14} color={colors.btnPrimaryText} />
                            <Text style={styles.addBtnText}>CONNECT</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
    ...(Platform.OS === "web"
      ? ({
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
        } as any)
      : {}),
  },
  modalCard: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...shadows.lg,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  modalSub: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  bodyScroll: {
    marginTop: spacing.md,
  },
  sectionHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    letterSpacing: 0.6,
    fontSize: 10,
    marginBottom: spacing.sm,
  },
  catalogRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    borderRadius: radii.md,
  },
  catalogRowAdded: {
    opacity: 0.7,
  },
  appLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  appIconCircle: {
    width: 38,
    height: 38,
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
    fontWeight: "700",
  },
  appCategory: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textTransform: "none",
  },
  appRight: {
    alignItems: "flex-end",
  },
  connectedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.full,
    backgroundColor: colors.safeSurface,
    borderWidth: 1,
    borderColor: colors.safeBorder,
  },
  connectedPillText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: "700",
    color: colors.safeText,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.btnPrimaryBg,
  },
  addBtnText: {
    ...typography.smallSemibold,
    fontSize: 11,
    fontWeight: "700",
    color: colors.btnPrimaryText,
  },
  reconnectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  reconnectBtnText: {
    ...typography.smallSemibold,
    fontSize: 11,
    fontWeight: "700",
    color: colors.textPrimary,
  },
});
