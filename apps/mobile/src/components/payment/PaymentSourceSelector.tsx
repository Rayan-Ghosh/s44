import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { PaymentInputSource } from "../../types/transaction";

interface SourceOption {
  id: PaymentInputSource;
  label: string;
  sublabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: number;
}

interface PaymentSourceSelectorProps {
  activeSource: PaymentInputSource;
  onSelectSource: (source: PaymentInputSource) => void;
  pendingRequestsCount?: number;
}

export const PaymentSourceSelector: React.FC<PaymentSourceSelectorProps> = ({
  activeSource,
  onSelectSource,
  pendingRequestsCount = 0,
}) => {
  const sources: SourceOption[] = [
    {
      id: "QR",
      label: "Scan QR",
      sublabel: "Camera scan",
      icon: "qr-code-outline",
    },
    {
      id: "UPI_ID",
      label: "UPI ID",
      sublabel: "VPA handle",
      icon: "at-outline",
    },
    {
      id: "MOBILE",
      label: "Mobile",
      sublabel: "Phone number",
      icon: "call-outline",
    },
    {
      id: "PAYMENT_REQUEST",
      label: "Requests",
      sublabel: "Collect links",
      icon: "receipt-outline",
      badge: pendingRequestsCount,
    },
  ];

  return (
    <View
      style={styles.container}
      accessibilityRole="tablist"
      accessibilityLabel="Payment Source Selector"
      testID="payment-source-selector"
    >
      {sources.map((item) => {
        const isActive = activeSource === item.id;
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onSelectSource(item.id)}
            style={[styles.tab, isActive && styles.tabActive]}
            activeOpacity={0.75}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`Select ${item.label} payment source`}
            testID={`payment-source-tab-${item.id.toLowerCase()}`}
          >
            <View style={styles.iconWrapper}>
              <Ionicons
                name={item.icon}
                size={18}
                color={isActive ? colors.brand : colors.textMuted}
              />
              {typeof item.badge === "number" && item.badge > 0 && (
                <View style={styles.badgePill} testID="request-badge-pill">
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              )}
            </View>
            <Text
              style={[styles.tabLabel, isActive && styles.tabLabelActive]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    padding: 3,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
    ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
  },
  tabActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.brand,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  iconWrapper: {
    position: "relative",
    marginBottom: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: typography.caption.fontSize,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  tabLabelActive: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  badgePill: {
    position: "absolute",
    top: -4,
    right: -10,
    backgroundColor: colors.threat,
    borderRadius: radii.full,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: colors.textInverse,
    fontSize: 9,
    fontWeight: "700",
  },
});
