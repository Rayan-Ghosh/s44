import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { GuardianRequest } from "../../types/guardian";

interface NotificationDropdownProps {
  visible: boolean;
  requests: GuardianRequest[];
  onSelectRequest: (request: GuardianRequest) => void;
  onDismiss: () => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  visible,
  requests,
  onSelectRequest,
  onDismiss,
}) => {
  const pendingRequests = requests.filter((r) => r.status === "PENDING");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      {/* Backdrop — tapping outside dismisses */}
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        {/* Panel — stopPropagation so tapping inside doesn't close */}
        <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
          {/* Panel header */}
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Notifications</Text>
            {pendingRequests.length > 0 && (
              <View style={styles.badgePill}>
                <Text style={styles.badgePillText}>{pendingRequests.length}</Text>
              </View>
            )}
          </View>

          {/* Content */}
          {pendingRequests.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={24} color={colors.textMuted} />
              <Text style={styles.emptyText}>No new notifications</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {pendingRequests.map((req, idx) => (
                <TouchableOpacity
                  key={req.id}
                  style={[
                    styles.notifItem,
                    idx < pendingRequests.length - 1 && styles.notifItemBorder,
                  ]}
                  onPress={() => {
                    onSelectRequest(req);
                    onDismiss();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.notifIconBox}>
                    <Ionicons name="shield-outline" size={18} color={colors.threat} />
                  </View>
                  <View style={styles.notifTextCol}>
                    <Text style={styles.notifTitle} numberOfLines={1}>
                      Guardian Approval Needed
                    </Text>
                    <Text style={styles.notifSub} numberOfLines={1}>
                      ₹{req.amount.toLocaleString("en-IN")} · {req.merchant}
                    </Text>
                    <Text style={styles.notifMeta}>Tap to review</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 60, // offset below header area
    paddingRight: spacing.lg,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    width: 300,
    maxHeight: 360,
    overflow: "hidden",
    ...shadows.md,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  panelTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  badgePill: {
    backgroundColor: colors.threat,
    borderRadius: radii.full,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgePillText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 13,
  },
  list: {
    maxHeight: 300,
  },
  notifItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  notifItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  notifIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.threatSurface,
    borderWidth: 1,
    borderColor: colors.threatBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  notifTextCol: {
    flex: 1,
    gap: 1,
  },
  notifTitle: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  notifSub: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
  },
  notifMeta: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
});
