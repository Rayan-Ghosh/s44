import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { TextInput } from "../common/TextInput";
import { Button } from "../common/Button";
import { validateUpiIdInput, validateAmountInput } from "../../utils/recipient-type";

interface UpiIdPaymentFormProps {
  onPreparePayment: (params: {
    recipient: string;
    amount: number;
    note?: string;
    recipientName?: string;
  }) => void;
  isLoading?: boolean;
  initialRecipient?: string;
  initialAmount?: string;
  initialNote?: string;
}

export const UpiIdPaymentForm: React.FC<UpiIdPaymentFormProps> = ({
  onPreparePayment,
  isLoading = false,
  initialRecipient = "",
  initialAmount = "",
  initialNote = "",
}) => {
  const [upiId, setUpiId] = useState<string>(initialRecipient);
  const [amount, setAmount] = useState<string>(initialAmount);
  const [note, setNote] = useState<string>(initialNote);

  const [upiError, setUpiError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  const handleUpiChange = (val: string) => {
    setUpiId(val);
    if (upiError) setUpiError(null);
  };

  const handleAmountChange = (val: string) => {
    setAmount(val);
    if (amountError) setAmountError(null);
  };

  const handleNoteChange = (val: string) => {
    setNote(val);
  };

  const handleSubmit = () => {
    const upiResult = validateUpiIdInput(upiId);
    const amountResult = validateAmountInput(amount);

    let hasError = false;

    if (!upiResult.valid) {
      setUpiError(upiResult.error || "Invalid UPI ID");
      hasError = true;
    } else {
      setUpiError(null);
    }

    if (!amountResult.valid) {
      setAmountError(amountResult.error || "Invalid amount");
      hasError = true;
    } else {
      setAmountError(null);
    }

    if (hasError) return;

    onPreparePayment({
      recipient: upiResult.normalized!,
      amount: amountResult.amount!,
      note: note.trim() || undefined,
    });
  };

  return (
    <View
      style={styles.container}
      accessibilityLabel="UPI ID payment form"
      testID="upi-id-payment-form"
    >
      <View style={styles.formHeader}>
        <Ionicons name="at-circle-outline" size={20} color={colors.brand} />
        <Text style={styles.formTitle}>Pay via UPI ID (VPA)</Text>
      </View>
      <Text style={styles.formSubtitle}>
        Enter any verified Virtual Payment Address (e.g. merchant@upi or name@bank)
      </Text>

      {/* UPI ID Input */}
      <View style={styles.inputWrapper}>
        <TextInput
          label="UPI ID / VPA"
          placeholder="e.g. merchant@upi, user@oksbi"
          icon="at-outline"
          value={upiId}
          onChangeText={handleUpiChange}
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={styles.textInputContainer}
          testID="upi-id-input"
        />
        {upiError && (
          <View style={styles.errorRow} testID="upi-id-error">
            <Ionicons name="alert-circle-outline" size={13} color={colors.threat} />
            <Text style={styles.errorText}>{upiError}</Text>
          </View>
        )}
      </View>

      {/* Amount Input */}
      <View style={styles.inputWrapper}>
        <TextInput
          label="Amount (₹)"
          placeholder="0.00"
          prefix="₹"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={handleAmountChange}
          containerStyle={styles.textInputContainer}
          testID="upi-amount-input"
        />
        {amountError && (
          <View style={styles.errorRow} testID="upi-amount-error">
            <Ionicons name="alert-circle-outline" size={13} color={colors.threat} />
            <Text style={styles.errorText}>{amountError}</Text>
          </View>
        )}
      </View>

      {/* Note Input */}
      <TextInput
        label="Payment Note (Optional)"
        placeholder="e.g. Rent, Freelance invoice, Grocery"
        icon="document-text-outline"
        value={note}
        onChangeText={handleNoteChange}
        containerStyle={styles.textInputContainer}
        testID="upi-note-input"
      />

      {/* Action Button */}
      <Button
        label="PREPARE PAYMENT"
        icon="shield-checkmark-outline"
        variant="primary"
        size="md"
        loading={isLoading}
        disabled={isLoading}
        onPress={handleSubmit}
        style={styles.submitBtn}
        testID="prepare-upi-payment-btn"
      />
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
  inputWrapper: {
    marginBottom: spacing.xs,
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
  submitBtn: {
    marginTop: spacing.sm,
  },
});
