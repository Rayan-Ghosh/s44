import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii, shadows } from "../theme/layout";
import { Button } from "../components/common/Button";
import { AvaranLogo } from "../components/common/AvaranLogo";
import { ServerEndpointModal } from "../components/profile/ServerEndpointModal";

export const LandingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [isServerModalVisible, setIsServerModalVisible] = useState<boolean>(false);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand Header */}
        <View style={styles.brandRow}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <AvaranLogo size="sm" showText={false} />
            <Text style={styles.brandName}>AVARAN</Text>
          </View>
          <TouchableOpacity
            onPress={() => setIsServerModalVisible(true)}
            style={styles.serverIconBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Configure Backend Server"
          >
            <Ionicons name="server-outline" size={18} color={colors.brand} />
          </TouchableOpacity>
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.pillBadge}>
            <Ionicons name="shield-checkmark" size={12} color={colors.brand} />
            <Text style={styles.pillText}>UPI FRAUD-RISK SHIELD</Text>
          </View>

          <Text style={styles.heroTitle}>
            Protect every payment{"\n"}before it's too late.
          </Text>

          <Text style={styles.heroDesc}>
            Avaran evaluates payments in the moment before confirmation — detecting fraud patterns, device anomalies, and social engineering pressure across your connected payment apps.
          </Text>

          {/* Primary CTA */}
          <Button
            label="GET STARTED"
            onPress={() => navigation.navigate("CreateAccount")}
            variant="primary"
            size="lg"
            icon="arrow-forward"
            iconPosition="right"
            style={styles.ctaBtn}
          />

          {/* Secondary Link */}
          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => navigation.navigate("Login")}
            activeOpacity={0.7}
          >
            <Text style={styles.loginLinkText}>
              Already have an account? <Text style={styles.loginLinkBold}>Log In</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Comprehensive Protection */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>COMPREHENSIVE PROTECTION</Text>

          <View style={styles.capabilityCard}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.textPrimary} />
            </View>
            <View style={styles.cardTextCol}>
              <Text style={styles.cardTitle}>Payment Protection</Text>
              <Text style={styles.cardDesc}>
                Detects and holds suspicious payments before funds leave your account.
              </Text>
            </View>
          </View>

          <View style={styles.capabilityCard}>
            <View style={styles.iconCircle}>
              <Ionicons name="pulse-outline" size={20} color={colors.textPrimary} />
            </View>
            <View style={styles.cardTextCol}>
              <Text style={styles.cardTitle}>Risk Detection</Text>
              <Text style={styles.cardDesc}>
                4-signal fusion analyzing transaction, device, behavioral, and voice factors.
              </Text>
            </View>
          </View>

          <View style={styles.capabilityCard}>
            <View style={styles.iconCircle}>
              <Ionicons name="call-outline" size={20} color={colors.textPrimary} />
            </View>
            <View style={styles.cardTextCol}>
              <Text style={styles.cardTitle}>Call Protection</Text>
              <Text style={styles.cardDesc}>
                Warns against urgency, impersonation, and coercion during active calls.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
      <ServerEndpointModal
        visible={isServerModalVisible}
        onClose={() => setIsServerModalVisible(false)}
        onEndpointSaved={() => setIsServerModalVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xxl,
  },
  brandName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: 1.2,
    marginLeft: spacing.sm,
  },
  serverIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  heroSection: {
    marginBottom: spacing.xxl,
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.full,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    alignSelf: "flex-start",
    gap: 6,
    marginBottom: spacing.lg,
  },
  pillText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.6,
  },
  heroTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    fontSize: 30,
    lineHeight: 38,
    marginBottom: spacing.md,
  },
  heroDesc: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  ctaBtn: {
    width: "100%",
    marginBottom: spacing.md,
  },
  loginLink: {
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  loginLinkText: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
  },
  loginLinkBold: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.6,
    fontSize: 11,
    marginBottom: spacing.md,
  },
  capabilityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  cardTextCol: {
    flex: 1,
  },
  cardTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 15,
  },
  cardDesc: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },
});
