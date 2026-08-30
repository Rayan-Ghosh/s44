import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { TextInput } from "../common/TextInput";
import { Button } from "../common/Button";

interface EditProfileModalProps {
  visible: boolean;
  initialName: string;
  initialPhone: string;
  initialEmail: string;
  onClose: () => void;
  onSave: (data: { name: string; phone: string; email: string }) => Promise<boolean>;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  visible,
  initialName,
  initialPhone,
  initialEmail,
  onClose,
  onSave,
}) => {
  const { width, height } = useWindowDimensions();
  const isLargeScreen = width >= 640;

  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setPhone(initialPhone);
      setEmail(initialEmail);
      setErrorMsg("");
    }
  }, [visible, initialName, initialPhone, initialEmail]);

  if (!visible) return null;

  const handleSave = async () => {
    setErrorMsg("");
    if (!name.trim()) {
      setErrorMsg("Name cannot be empty.");
      return;
    }
    if (!phone.trim()) {
      setErrorMsg("Please enter a valid mobile number.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    setIsSaving(true);
    try {
      const success = await onSave({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
      });
      if (success) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const modalContent = (
    <View
      style={[
        styles.modalContainer,
        isLargeScreen && styles.modalContainerDesktop,
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <Ionicons name="person-outline" size={18} color={colors.brand} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Edit Profile</Text>
            <Text style={styles.headerSub}>Update your account contact identity</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
        >
          <Ionicons name="close" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Body Form */}
      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {errorMsg ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={colors.threat} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <TextInput
          label="Full Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Rahul Sharma"
          icon="person-outline"
          autoCapitalize="words"
        />

        <TextInput
          label="Mobile Number"
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. +91 98765 43210"
          icon="call-outline"
          keyboardType="phone-pad"
        />

        <TextInput
          label="Email Address"
          value={email}
          onChangeText={setEmail}
          placeholder="e.g. rahul@example.com"
          icon="mail-outline"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <View style={styles.securityNoteRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.brand} />
          <Text style={styles.securityNoteText}>
            Changes are cryptographically synchronized with your Avaran device token.
          </Text>
        </View>
      </ScrollView>

      {/* Footer Actions */}
      <View style={styles.footer}>
        <Button
          label="Cancel"
          onPress={onClose}
          variant="secondary"
          size="md"
          style={styles.actionBtn}
        />
        <Button
          label={isSaving ? "Saving..." : "Save Changes"}
          onPress={handleSave}
          loading={isSaving}
          variant="primary"
          size="md"
          style={styles.actionBtn}
        />
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType={isLargeScreen ? "fade" : "slide"}
      transparent={true}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.modalOverlay,
          isLargeScreen && styles.modalOverlayCentered,
        ]}
      >
        {isLargeScreen ? (
          <>
            <TouchableOpacity
              style={styles.backdropCover}
              onPress={onClose}
              activeOpacity={1}
            />
            {modalContent}
          </>
        ) : (
          <SafeAreaView style={styles.safeAreaFull} edges={["top", "bottom", "left", "right"]}>
            {modalContent}
          </SafeAreaView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.background,
    ...(Platform.OS === "web"
      ? ({
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 99999,
        } as any)
      : {}),
  },
  modalOverlayCentered: {
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  backdropCover: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    zIndex: 1,
  },
  safeAreaFull: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  modalContainerDesktop: {
    width: "92%",
    maxWidth: 520,
    backgroundColor: colors.background,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.lg,
    overflow: "hidden",
    zIndex: 10,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
        } as any)
      : {}),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 18,
  },
  headerSub: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  scrollBody: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.xl,
    gap: spacing.xs,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.threatSurface,
    borderWidth: 1,
    borderColor: colors.threatBorder,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  errorText: {
    ...typography.small,
    color: colors.threat,
    fontSize: 12,
    flex: 1,
  },
  securityNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  securityNoteText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: spacing.md,
  },
  actionBtn: {
    flex: 1,
  },
});
