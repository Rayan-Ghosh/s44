import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { Button } from "../common/Button";
import {
  PaymentRequestService,
  IncomingPaymentRequest,
} from "../../services/payment-request-service";

interface PaymentRequestListProps {
  onAcceptRequest: (request: IncomingPaymentRequest) => void;
  isPreparing?: boolean;
}

export const PaymentRequestList: React.FC<PaymentRequestListProps> = ({
  onAcceptRequest,
  isPreparing = false,
}) => {
  const [requests, setRequests] = useState<IncomingPaymentRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await PaymentRequestService.getPendingRequests();
      if (res.error) {
        setError(res.error);
        setRequests([]);
      } else {
        setRequests(res.requests);
      }
    } catch {
      setError("Failed to load incoming payment requests.");
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleSimulateRequest = () => {
    const newReq = PaymentRequestService.simulateIncomingRequest();
    setRequests((prev) => [newReq, ...prev]);
    setError(null);
  };

  const handleAccept = (req: IncomingPaymentRequest) => {
    setAcceptedId(req.id);
    PaymentRequestService.markRequestAccepted(req.id);
    onAcceptRequest(req);
  };

  return (
    <View
      style={styles.container}
      accessibilityLabel="Incoming payment requests"
      testID="payment-request-list"
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="receipt-outline" size={20} color={colors.brand} />
          <Text style={styles.headerTitle}>Incoming Payment Requests</Text>
        </View>
        <TouchableOpacity
          onPress={loadRequests}
          style={styles.refreshBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Refresh payment requests"
          testID="payment-request-refresh-btn"
        >
          <Ionicons name="refresh" size={16} color={colors.brand} />
        </TouchableOpacity>
      </View>

      <Text style={styles.headerSubtitle}>
        Collect requests sent to your UPI ID or mobile number
      </Text>

      {/* 1. LOADING STATE */}
      {isLoading && (
        <View style={styles.centerStateBox} testID="payment-request-loading">
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={styles.loadingText}>Checking for incoming payment requests...</Text>
        </View>
      )}

      {/* 2. ERROR STATE */}
      {!isLoading && error && (
        <View style={styles.errorCard} testID="payment-request-error">
          <Ionicons name="alert-circle" size={24} color={colors.threat} />
          <View style={{ flex: 1 }}>
            <Text style={styles.errorTitle}>Failed to load requests</Text>
            <Text style={styles.errorDetail}>{error}</Text>
          </View>
          <TouchableOpacity
            onPress={loadRequests}
            style={styles.retryBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Retry loading requests"
            testID="payment-request-retry-btn"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 3. EMPTY STATE */}
      {!isLoading && !error && requests.length === 0 && (
        <View style={styles.emptyCard} testID="payment-request-empty">
          <Ionicons name="mail-open-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Pending Payment Requests</Text>
          <Text style={styles.emptySub}>
            Incoming collect requests and payment links will appear here automatically.
          </Text>

          <View style={styles.emptyActionsRow}>
            <Button
              label="SIMULATE DEMO REQUEST"
              icon="add-circle-outline"
              variant="outline"
              size="sm"
              onPress={handleSimulateRequest}
              testID="simulate-request-btn"
            />
            <Button
              label="REFRESH"
              icon="refresh"
              variant="secondary"
              size="sm"
              onPress={loadRequests}
            />
          </View>
        </View>
      )}

      {/* 4. REQUESTS LIST */}
      {!isLoading && !error && requests.length > 0 && (
        <View style={styles.requestList}>
          {requests.map((req) => (
            <View
              key={req.id}
              style={styles.requestCard}
              testID={`payment-request-item-${req.id}`}
            >
              <View style={styles.cardTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.requesterName} numberOfLines={1}>
                    {req.requesterName}
                  </Text>
                  <Text style={styles.payeeHandle}>{req.upiId}</Text>
                </View>
                <View style={styles.amountBox}>
                  <Text style={styles.amountText}>₹{req.amount.toFixed(2)}</Text>
                  {req.sourceApp && (
                    <Text style={styles.sourceAppText}>{req.sourceApp}</Text>
                  )}
                </View>
              </View>

              {req.note && (
                <View style={styles.noteRow}>
                  <Ionicons name="document-text-outline" size={13} color={colors.textSecondary} />
                  <Text style={styles.noteText} numberOfLines={2}>
                    {req.note}
                  </Text>
                </View>
              )}

              <View style={styles.cardBottomRow}>
                <View style={styles.metaRow}>
                  <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.metaText}>{req.timestamp}</Text>
                </View>

                <Button
                  label="ACCEPT & PREPARE"
                  icon="shield-checkmark-outline"
                  variant="primary"
                  size="sm"
                  loading={isPreparing && acceptedId === req.id}
                  disabled={isPreparing}
                  onPress={() => handleAccept(req)}
                  testID={`accept-request-btn-${req.id}`}
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 16,
  },
  refreshBtn: {
    padding: 6,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
  },
  centerStateBox: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.threat,
    borderRadius: radii.md,
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  errorTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.threat,
  },
  errorDetail: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 2,
  },
  retryBtn: {
    backgroundColor: colors.threat,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  retryBtnText: {
    color: colors.textInverse,
    fontSize: typography.caption.fontSize,
    fontWeight: "700",
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  emptySub: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  emptyActionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  requestList: {
    gap: spacing.sm,
  },
  requestCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  requesterName: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  payeeHandle: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 1,
  },
  amountBox: {
    alignItems: "flex-end",
  },
  amountText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.brand,
  },
  sourceAppText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radii.xs,
  },
  noteText: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    fontStyle: "italic",
    flex: 1,
  },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
