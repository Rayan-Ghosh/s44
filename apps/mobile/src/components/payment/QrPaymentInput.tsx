import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { TextInput } from "../common/TextInput";
import { Button } from "../common/Button";
import { parseUpiPaymentPayload, ParsedUpiPaymentData } from "../../utils/upi-payload-parser";
import { validateAmountInput } from "../../utils/recipient-type";

interface QrPaymentInputProps {
  onPreparePayment: (params: {
    recipient: string;
    amount: number;
    note?: string;
    recipientName?: string;
    qrPayload?: string;
  }) => void;
  onLaunchScanner: () => void;
  scannedPayload?: string;
  isLoading?: boolean;
}

export const QrPaymentInput: React.FC<QrPaymentInputProps> = ({
  onPreparePayment,
  onLaunchScanner,
  scannedPayload,
  isLoading = false,
}) => {
  const [rawPayload, setRawPayload] = useState<string>(scannedPayload || "");
  const [parsedData, setParsedData] = useState<ParsedUpiPaymentData | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  // Synchronize when a new QR is scanned from modal
  useEffect(() => {
    if (scannedPayload) {
      setRawPayload(scannedPayload);
      handleParsePayload(scannedPayload);
    }
  }, [scannedPayload]);

  const handleParsePayload = (payload: string) => {
    const trimmed = payload.trim();
    if (!trimmed) {
      setParsedData(null);
      setParseError(null);
      return;
    }

    const result = parseUpiPaymentPayload(trimmed);
    if (!result.success) {
      setParsedData(null);
      setParseError(result.error);
      return;
    }

    setParseError(null);
    setParsedData(result.data);
    if (typeof result.data.amount === "number" && result.data.amount > 0) {
      setAmount(String(result.data.amount));
    }
    if (result.data.note) {
      setNote(result.data.note);
    }
  };

  const handlePayloadChange = (text: string) => {
    setRawPayload(text);
    handleParsePayload(text);
  };

  const handleSubmit = () => {
    if (!parsedData) {
      setParseError("Please scan or enter a valid UPI QR code");
      return;
    }

    const amountResult = validateAmountInput(amount);
    if (!amountResult.valid) {
      setAmountError(amountResult.error || "Invalid amount");
      return;
    }
    setAmountError(null);

    onPreparePayment({
      recipient: parsedData.recipient,
      amount: amountResult.amount!,
      note: note.trim() || undefined,
      recipientName: parsedData.payeeName || undefined,
      qrPayload: rawPayload,
    });
  };

  return (
    <View
      style={styles.container}
      accessibilityLabel="QR code payment form"
      testID="qr-payment-input"
    >
      <View style={styles.formHeader}>
        <Ionicons name="qr-code-outline" size={20} color={colors.brand} />
        <Text style={styles.formTitle}>Scan UPI QR Code</Text>
      </View>
      <Text style={styles.formSubtitle}>
        Scan any merchant or personal BharatQR / UPI QR code
      </Text>

      {/* Primary Scanner Action */}
      <TouchableOpacity
        onPress={onLaunchScanner}
        style={styles.scannerHeroBtn}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Open camera to scan QR code"
        testID="launch-qr-scanner-btn"
      >
        <View style={styles.scannerIconCircle}>
          <Ionicons name="camera" size={26} color={colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.scannerHeroTitle}>Open Camera Scanner</Text>
          <Text style={styles.scannerHeroSub}>Tap to scan physical or on-screen QR</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      {/* Or Paste / Enter payload directly */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR ENTER / PASTE UPI QR URI</Text>
        <View style={styles.dividerLine} />
      </View>

      <TextInput
        placeholder="upi://pay?pa=merchant@upi&pn=Store&am=250"
        icon="link-outline"
        value={rawPayload}
        onChangeText={handlePayloadChange}
        autoCapitalize="none"
        autoCorrect={false}
        containerStyle={styles.textInputContainer}
        testID="qr-raw-payload-input"
      />

      {parseError && (
        <View style={styles.errorRow} testID="qr-parse-error">
          <Ionicons name="alert-circle-outline" size={13} color={colors.threat} />
          <Text style={styles.errorText}>{parseError}</Text>
        </View>
      )}

      {/* Parsed Scanned QR Summary Card */}
      {parsedData && (
        <View style={styles.parsedCard} testID="qr-parsed-summary">
          <View style={styles.parsedHeader}>
            <Ionicons name="checkmark-circle" size={16} color={colors.safe} />
            <Text style={styles.parsedTitle}>QR Verified</Text>
          </View>

          <View style={styles.parsedRow}>
            <Text style={styles.parsedLabel}>Payee:</Text>
            <Text style={styles.parsedValue}>
              {parsedData.payeeName || "UPI Merchant"} ({parsedData.recipient})
            </Text>
          </View>

          {/* Amount field (pre-filled if present in QR, editable otherwise) */}
          <View style={{ marginTop: spacing.sm }}>
            <TextInput
              label="Amount (₹)"
              placeholder="0.00"
              prefix="₹"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={(val) => {
                setAmount(val);
                if (amountError) setAmountError(null);
              }}
              containerStyle={styles.textInputContainer}
              testID="qr-amount-input"
            />
            {amountError && (
              <View style={styles.errorRow} testID="qr-amount-error">
                <Ionicons name="alert-circle-outline" size={13} color={colors.threat} />
                <Text style={styles.errorText}>{amountError}</Text>
              </View>
            )}
          </View>

          {/* Note */}
          <TextInput
            label="Payment Note (Optional)"
            placeholder="e.g. Counter #3, Coffee"
            icon="document-text-outline"
            value={note}
            onChangeText={setNote}
            containerStyle={styles.textInputContainer}
            testID="qr-note-input"
          />

          <Button
            label="PREPARE PAYMENT"
            icon="shield-checkmark-outline"
            variant="primary"
            size="md"
            loading={isLoading}
            disabled={isLoading}
            onPress={handleSubmit}
            style={styles.submitBtn}
            testID="prepare-qr-payment-btn"
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xs,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: spacing.xs,
  },
  formTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  formSubtitle: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 16,
  },
  scannerHeroBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderStyle: "dashed",
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  scannerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  scannerHeroTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  scannerHeroSub: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  textInputContainer: {
    marginBottom: spacing.xs,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    marginBottom: spacing.xs,
    gap: 4,
  },
  errorText: {
    fontSize: typography.caption.fontSize,
    color: colors.threat,
    fontWeight: "500",
  },
  parsedCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  parsedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.xs,
  },
  parsedTitle: {
    fontSize: typography.caption.fontSize,
    fontWeight: "700",
    color: colors.safe,
  },
  parsedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.xs,
  },
  parsedLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
  },
  parsedValue: {
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
    color: colors.textPrimary,
    flex: 1,
  },
  submitBtn: {
    marginTop: spacing.sm,
  },
});
