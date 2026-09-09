import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { TextInput } from "../common/TextInput";
import { Button } from "../common/Button";
import { validateMobileNumberInput, validateAmountInput } from "../../utils/recipient-type";

interface MobilePaymentFormProps {
  onPreparePayment: (params: {
    recipient: string;
    amount: number;
    note?: string;
    recipientName?: string;
  }) => void;
  onPickContact?: () => Promise<void>;
  isLoading?: boolean;
  initialMobile?: string;
  initialAmount?: string;
  initialNote?: string;
  initialName?: string;
}

export const MobilePaymentForm: React.FC<MobilePaymentFormProps> = ({
  onPreparePayment,
  onPickContact,
  isLoading = false,
  initialMobile = "",
  initialAmount = "",
  initialNote = "",
  initialName = "",
}) => {
  const [mobile, setMobile] = useState<string>(initialMobile);
  const [recipientName, setRecipientName] = useState<string>(initialName);
  const [amount, setAmount] = useState<string>(initialAmount);
  const [note, setNote] = useState<string>(initialNote);

  const [mobileError, setMobileError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  const handleMobileChange = (val: string) => {
    setMobile(val);
    if (mobileError) setMobileError(null);
  };

  const handleAmountChange = (val: string) => {
    setAmount(val);
    if (amountError) setAmountError(null);
  };

  const handleNoteChange = (val: string) => {
    setNote(val);
  };

  const handleSubmit = () => {
    const mobileResult = validateMobileNumberInput(mobile);
    const amountResult = validateAmountInput(amount);

    let hasError = false;

    if (!mobileResult.valid) {
      setMobileError(mobileResult.error || "Invalid mobile number");
      hasError = true;
    } else {
      setMobileError(null);
    }

    if (!amountResult.valid) {
      setAmountError(amountResult.error || "Invalid amount");
      hasError = true;
    } else {
      setAmountError(null);
    }

    if (hasError) return;

    onPreparePayment({
      recipient: mobileResult.normalized!,
      amount: amountResult.amount!,
      note: note.trim() || undefined,
      recipientName: recipientName.trim() || undefined,
    });
  };

  return (
    <View
      style={styles.container}
      accessibilityLabel="Mobile number payment form"
      testID="mobile-payment-form"
    >
      <View style={styles.formHeader}>
        <Ionicons name="call-outline" size={20} color={colors.brand} />
        <Text style={styles.formTitle}>Pay via Mobile Number</Text>
      </View>
      <Text style={styles.formSubtitle}>
        Send directly to any Indian mobile number linked to UPI
      </Text>

      {/* Mobile Input with prefix */}
      <View style={styles.inputWrapper}>
        <View style={styles.inputWithActionRow}>
          <View style={{ flex: 1 }}>
            <TextInput
              label="10-digit Mobile Number"
              placeholder="98765 43210"
              prefix="+91"
              icon="call-outline"
              keyboardType="phone-pad"
              value={mobile}
              onChangeText={handleMobileChange}
              containerStyle={styles.textInputContainer}
              testID="mobile-number-input"
            />
          </View>
          {onPickContact && (
            <TouchableOpacity
              onPress={onPickContact}
              style={styles.contactPickerBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Select mobile number from contacts"
              testID="mobile-contacts-btn"
            >
              <Ionicons name="people-outline" size={16} color={colors.brand} />
              <Text style={styles.contactPickerBtnText}>CONTACTS</Text>
            </TouchableOpacity>
          )}
        </View>
        {mobileError && (
          <View style={styles.errorRow} testID="mobile-number-error">
            <Ionicons name="alert-circle-outline" size={13} color={colors.threat} />
            <Text style={styles.errorText}>{mobileError}</Text>
          </View>
        )}
      </View>

      {/* Optional Recipient Name */}
      <TextInput
        label="Recipient Name (Optional)"
        placeholder="e.g. Rahul Sharma"
        icon="person-outline"
        value={recipientName}
        onChangeText={setRecipientName}
        containerStyle={styles.textInputContainer}
        testID="mobile-name-input"
      />

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
          testID="mobile-amount-input"
        />
        {amountError && (
          <View style={styles.errorRow} testID="mobile-amount-error">
            <Ionicons name="alert-circle-outline" size={13} color={colors.threat} />
            <Text style={styles.errorText}>{amountError}</Text>
          </View>
        )}
      </View>

      {/* Note Input */}
      <TextInput
        label="Payment Note (Optional)"
        placeholder="e.g. Dinner share, Rent advance"
        icon="document-text-outline"
        value={note}
        onChangeText={handleNoteChange}
        containerStyle={styles.textInputContainer}
        testID="mobile-note-input"
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
        testID="prepare-mobile-payment-btn"
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
  inputWithActionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  contactPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    marginBottom: spacing.xs,
  },
  contactPickerBtnText: {
    fontSize: typography.caption.fontSize,
    fontWeight: "700",
    color: colors.brand,
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
