import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { StatusBadge } from "../common/StatusBadge";
import { Button } from "../common/Button";
import { RiskGauge } from "../common/RiskGauge";
import { AiScanBanner } from "../common/AiScanBanner";
import { PaymentEvaluationData } from "../../services/payment-service";
import { PaymentRiskEvaluationState } from "../../types/transaction";

interface PaymentRiskEvaluationCardProps {
  evaluationState: PaymentRiskEvaluationState;
  onRetry: () => void;
  onEditDetails?: () => void;
}

export const PaymentRiskEvaluationCard: React.FC<PaymentRiskEvaluationCardProps> = ({
  evaluationState,
  onRetry,
  onEditDetails,
}) => {
  const { status, data, error, expiresAt } = evaluationState;

  // ── 1. LOADING / ANALYZING STATE ────────────────────────────────────────────
  if (status === "ANALYZING") {
    return (
      <View
        style={styles.loadingContainer}
        accessibilityRole="summary"
        accessibilityLabel="Analyzing payment risk"
        testID="risk-evaluation-loading"
      >
        <AiScanBanner isAnalyzing={true} />
        <View style={styles.loadingInfoBox}>
          <ActivityIndicator size="small" color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.loadingTitle}>Evaluating Security Signals</Text>
            <Text style={styles.loadingSubtitle}>
              Authoritative ML fusion engine scoring anomaly, recipient, and device telemetry...
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // ── 2. ERROR STATE ─────────────────────────────────────────────────────────
  if (status === "ERROR") {
    return (
      <View
        style={styles.errorContainer}
        accessibilityRole="alert"
        accessibilityLabel="Risk evaluation error"
        testID="risk-evaluation-error"
      >
        <View style={styles.errorHeader}>
          <Ionicons name="alert-circle" size={24} color={colors.threat} />
          <View style={{ flex: 1 }}>
            <Text style={styles.errorTitle}>Risk Evaluation Unavailable</Text>
            <Text style={styles.errorSubtitle}>
              {error || "Unable to reach authoritative risk scoring engine."}
            </Text>
          </View>
        </View>

        <View style={styles.errorActionsRow}>
          <Button
            label="RETRY EVALUATION"
            icon="refresh"
            variant="primary"
            size="sm"
            onPress={onRetry}
            testID="retry-risk-evaluation-btn"
          />
          {onEditDetails && (
            <Button
              label="EDIT DETAILS"
              variant="outline"
              size="sm"
              onPress={onEditDetails}
            />
          )}
        </View>
      </View>
    );
  }

  // ── 3. EXPIRED STATE ───────────────────────────────────────────────────────
  if (status === "EXPIRED") {
    return (
      <View
        style={styles.expiredContainer}
        accessibilityRole="alert"
        accessibilityLabel="Risk evaluation expired"
        testID="risk-evaluation-expired"
      >
        <View style={styles.expiredHeader}>
          <Ionicons name="time-outline" size={22} color={colors.caution} />
          <View style={{ flex: 1 }}>
            <Text style={styles.expiredTitle}>Risk Evaluation Expired</Text>
            <Text style={styles.expiredSubtitle}>
              Security parameters and anomaly factors have expired. Re-evaluation is required.
            </Text>
          </View>
        </View>

        <Button
          label="RE-ANALYZE PAYMENT"
          icon="refresh"
          variant="primary"
          size="sm"
          onPress={onRetry}
          testID="re-evaluate-btn"
          style={{ marginTop: spacing.xs }}
        />
      </View>
    );
  }

  // ── 4. EVALUATED STATE ─────────────────────────────────────────────────────
  if (status === "EVALUATED" && data) {
    const riskLevel = data.risk_level;
    const isLow = riskLevel === "LOW";
    const isMedium = riskLevel === "MEDIUM";
    const isHigh = riskLevel === "HIGH";

    const accentColor = isHigh ? colors.threat : isMedium ? colors.caution : colors.safe;

    const riskHeaderLabel = isHigh
      ? "HIGH RISK · HOLD FOR SAFETY"
      : isMedium
      ? "MEDIUM RISK · WARN / CAUTION"
      : "LOW RISK · ALLOW / NORMAL";

    const bannerMessage = isHigh
      ? "Significant anomaly or suspicious pattern detected. Payment held for safety."
      : isMedium
      ? "Unusual activity detected. Review details with caution before proceeding."
      : "Verified safe payment signature. Routine habitual activity.";

    return (
      <View
        style={[styles.evaluatedContainer, { borderColor: accentColor }]}
        accessibilityRole="summary"
        accessibilityLabel={`Risk evaluation summary: ${riskLevel} risk`}
        testID="risk-evaluation-result"
      >
        {/* Risk Banner Header */}
        <View style={[styles.riskBannerHeader, { backgroundColor: accentColor + "18" }]}>
          <Ionicons
            name={isHigh ? "alert-circle" : isMedium ? "warning-outline" : "checkmark-circle"}
            size={20}
            color={accentColor}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.riskBannerTitle, { color: accentColor }]}>
              {riskHeaderLabel}
            </Text>
            <Text style={styles.riskBannerMessage}>{bannerMessage}</Text>
          </View>
          <StatusBadge
            label={data.stage || "EVALUATION_COMPLETED"}
            status={isHigh ? "high" : isMedium ? "medium" : "low"}
            dot={true}
          />
        </View>

        {/* Circular Risk Gauge */}
        <View style={styles.gaugeContainer} testID="risk-evaluation-gauge">
          <RiskGauge
            score={data.risk_score}
            riskLevel={riskLevel}
            size="md"
            showLabel={true}
          />
        </View>

        {/* Evaluation Summary Grid */}
        <View style={styles.summaryGrid} testID="risk-evaluation-summary-grid">
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Payee</Text>
            <Text style={styles.summaryValue} numberOfLines={1}>
              {data.recipient?.normalized || "Unknown"}
            </Text>
          </View>

          {data.recipient?.display_name && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Resolved Name</Text>
              <View style={styles.resolvedBadgeRow}>
                <Text style={styles.summaryValue}>{data.recipient.display_name}</Text>
                <StatusBadge label="RESOLVED" status="resolved" dot={false} />
              </View>
            </View>
          )}

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Evaluated Amount</Text>
            <Text style={[styles.summaryValue, { color: colors.brand, fontWeight: "800" }]}>
              ₹{(data.amount || 0).toFixed(2)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Decision</Text>
            <Text style={[styles.summaryValue, { color: accentColor, fontWeight: "700" }]}>
              {data.decision}
            </Text>
          </View>

          {data.evaluation_id && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Evaluation ID</Text>
              <Text style={styles.evalIdText} numberOfLines={1}>
                {data.evaluation_id}
              </Text>
            </View>
          )}
        </View>

        {/* Plain-Language Reasons / Analysis Factors */}
        {data.plain_language_reasons && data.plain_language_reasons.length > 0 && (
          <View style={styles.reasonsBox} testID="risk-reasons-list">
            <Text style={styles.reasonsTitle}>Analysis Factors</Text>
            {data.plain_language_reasons.map((reason: string, idx: number) => (
              <View key={idx} style={styles.reasonBulletRow}>
                <Ionicons
                  name={isHigh ? "alert-circle" : isMedium ? "warning-outline" : "checkmark"}
                  size={14}
                  color={accentColor}
                  style={{ marginTop: 2 }}
                />
                <Text style={styles.reasonText}>{reason}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Feature Contribution Breakdown (SHAP Contributions) */}
        {data.risk_contributions_pct &&
          Object.keys(data.risk_contributions_pct).length > 0 && (
            <View style={styles.contributionsBox} testID="risk-contributions-list">
              <Text style={styles.contributionsTitle}>Anomaly Weight Breakdown</Text>
              {Object.entries(data.risk_contributions_pct).map(([factor, pct], idx) => {
                const cleanFactorName = factor
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase());
                const percentVal = Math.round(Number(pct));
                return (
                  <View key={idx} style={styles.contributionRow}>
                    <View style={styles.factorNameRow}>
                      <Text style={styles.factorNameText}>{cleanFactorName}</Text>
                      <Text style={styles.factorPctText}>{percentVal}%</Text>
                    </View>
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${Math.min(100, Math.max(0, percentVal))}%`,
                            backgroundColor: accentColor,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

        {/* Strict Advisory Phase Disclaimer */}
        <View style={styles.disclaimerRow} testID="risk-evaluation-disclaimer">
          <Ionicons
            name="information-circle-outline"
            size={14}
            color={colors.textSecondary}
            style={{ marginRight: 5, flexShrink: 0 }}
          />
          <Text style={styles.disclaimerText}>
            ADVISORY RISK EVALUATION ONLY. NO PAYMENT AUTHORIZED, SUBMITTED, OR SETTLED.
          </Text>
        </View>

        {/* Action Controls */}
        <View style={styles.actionsRow}>
          <Button
            label="RE-ANALYZE"
            icon="refresh"
            variant="outline"
            size="sm"
            onPress={onRetry}
            testID="re-analyze-btn"
            style={{ flex: 1 }}
          />
          {onEditDetails && (
            <Button
              label="EDIT DETAILS"
              icon="create-outline"
              variant="secondary"
              size="sm"
              onPress={onEditDetails}
              testID="edit-from-evaluation-btn"
              style={{ flex: 1 }}
            />
          )}
        </View>
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  loadingContainer: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginVertical: spacing.xs,
    gap: spacing.sm,
  },
  loadingInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  loadingTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  loadingSubtitle: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  errorContainer: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.threat,
    padding: spacing.md,
    marginVertical: spacing.xs,
    gap: spacing.sm,
  },
  errorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  errorTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.threat,
  },
  errorSubtitle: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  errorActionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  expiredContainer: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.caution,
    padding: spacing.md,
    marginVertical: spacing.xs,
    gap: spacing.sm,
  },
  expiredHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  expiredTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.caution,
  },
  expiredSubtitle: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  evaluatedContainer: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1.5,
    padding: spacing.md,
    marginVertical: spacing.xs,
    gap: spacing.sm,
  },
  riskBannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  riskBannerTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: "800",
  },
  riskBannerMessage: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 1,
    lineHeight: 15,
  },
  gaugeContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
  },
  summaryGrid: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 6,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  resolvedBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  evalIdText: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  reasonsBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 4,
  },
  reasonsTitle: {
    fontSize: typography.caption.fontSize,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  reasonBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  reasonText: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  contributionsBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  contributionsTitle: {
    fontSize: typography.caption.fontSize,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  contributionRow: {
    gap: 2,
  },
  factorNameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  factorNameText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  factorPctText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.full,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: radii.full,
  },
  disclaimerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.xs,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disclaimerText: {
    fontSize: 9.5,
    color: colors.textSecondary,
    fontWeight: "600",
    letterSpacing: 0.2,
    flex: 1,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
