import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Modal,
  Animated,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { StaggerRevealCard } from "../components/common/StaggerRevealCard";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii, shadows } from "../theme/layout";
import { Header } from "../components/common/Header";
import { Button } from "../components/common/Button";
import { TextInput } from "../components/common/TextInput";
import { useAuth } from "../context/AuthContext";
import { useBiometrics } from "../context/BiometricContext";
import { useGuardian } from "../context/GuardianContext";
import { TrustedContact } from "../types/guardian";

// ---------------------------------------------------------------------------
// Relationship options
// ---------------------------------------------------------------------------
const RELATIONSHIPS = ["Spouse", "Parent", "Sibling", "Child", "Friend", "Other"];

// ---------------------------------------------------------------------------
// Add Contact Form (inline panel)
// ---------------------------------------------------------------------------
interface AddContactFormProps {
  onSave: (contact: Omit<TrustedContact, "id" | "addedAt">) => void;
  onCancel: () => void;
  isSaving: boolean;
}

const AddContactForm: React.FC<AddContactFormProps> = ({
  onSave,
  onCancel,
  isSaving,
}) => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("Friend");
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  const validate = (): boolean => {
    const newErrors: { name?: string; phone?: string } = {};
    if (!name.trim()) newErrors.name = "Name is required.";
    if (!phone.trim()) {
      newErrors.phone = "Phone number is required.";
    } else if (!/^\+?[\d\s\-]{7,15}$/.test(phone.trim())) {
      newErrors.phone = "Enter a valid phone number.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({ name: name.trim(), phone: phone.trim(), relationship });
  };

  return (
    <View style={formStyles.card}>
      <View style={formStyles.cardHeader}>
        <Text style={formStyles.cardTitle}>Add Trusted Contact</Text>
        <TouchableOpacity
          onPress={onCancel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Cancel"
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={formStyles.formNote}>
        This person will receive guardian approval requests for your high-risk payments. (Maximum 1 contact)
      </Text>

      <TextInput
        label="Full Name"
        placeholder="e.g. Priya Sharma"
        value={name}
        onChangeText={setName}
        error={errors.name}
        icon="person-outline"
        autoCapitalize="words"
        autoCorrect={false}
        containerStyle={{ marginBottom: spacing.sm }}
      />

      <TextInput
        label="Phone Number"
        placeholder="e.g. +91 98765 43210"
        value={phone}
        onChangeText={setPhone}
        error={errors.phone}
        icon="call-outline"
        keyboardType="phone-pad"
        containerStyle={{ marginBottom: spacing.sm }}
      />

      {/* Relationship selector */}
      <Text style={formStyles.fieldLabel}>Relationship</Text>
      <View style={formStyles.pillRow}>
        {RELATIONSHIPS.map((rel) => (
          <TouchableOpacity
            key={rel}
            style={[
              formStyles.pill,
              relationship === rel && formStyles.pillActive,
            ]}
            onPress={() => setRelationship(rel)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                formStyles.pillText,
                relationship === rel && formStyles.pillTextActive,
              ]}
            >
              {rel}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={formStyles.formActions}>
        <Button
          label="Cancel"
          onPress={onCancel}
          variant="secondary"
          size="md"
          style={{ flex: 1 }}
        />
        <Button
          label="Save Contact"
          onPress={handleSave}
          variant="primary"
          size="md"
          loading={isSaving}
          style={{ flex: 1 }}
          icon="checkmark"
        />
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Contact Card
// ---------------------------------------------------------------------------
interface ContactCardProps {
  contact: TrustedContact;
  onRemove: (id: string) => void;
}

const ContactCard: React.FC<ContactCardProps> = ({ contact, onRemove }) => {
  const initials = contact.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleRemove = () => {
    if (Platform.OS === "web") {
      const confirmed =
        typeof window !== "undefined"
          ? window.confirm(
              `Remove trusted contact?\n\n${contact.name} will no longer receive guardian approval requests from you.`
            )
          : true;
      if (confirmed) {
        onRemove(contact.id);
      }
    } else {
      Alert.alert(
        "Remove trusted contact?",
        `${contact.name} will no longer receive guardian approval requests from you.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              onRemove(contact.id);
            },
          },
        ]
      );
    }
  };

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.avatar}>
        <Text style={cardStyles.avatarText}>{initials}</Text>
      </View>
      <View style={cardStyles.textCol}>
        <Text style={cardStyles.name}>{contact.name}</Text>
        <Text style={cardStyles.phone}>{contact.phone}</Text>
        <View style={cardStyles.tagRow}>
          <View style={cardStyles.tag}>
            <Text style={cardStyles.tagText}>{contact.relationship}</Text>
          </View>
          <Text style={cardStyles.addedAt}>Added {contact.addedAt}</Text>
        </View>
      </View>
      <Pressable
        onPress={handleRemove}
        style={({ pressed }) => [
          cardStyles.removeBtn,
          pressed && cardStyles.removeBtnPressed,
        ]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel={`Remove ${contact.name}`}
        accessibilityRole="button"
      >
        <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
export const TrustedScreen: React.FC = () => {
  const { session } = useAuth();
  const { requireBiometricAuth } = useBiometrics();
  const {
    trustedContacts,
    isTrustedFeatureEnabled,
    toggleTrustedFeature,
    isLoadingContacts,
    loadContacts,
    addContact,
    removeContact,
  } = useGuardian();

  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"active" | "inactive">("active");
  const [showInfoModal, setShowInfoModal] = useState(false);
  const infoModalAnim = useRef(new Animated.Value(0)).current;
  const isFocused = useIsFocused();
  const hasPlayedTrustedStaggerRef = useRef(false);

  const openInfoModal = () => {
    setShowInfoModal(true);
    Animated.timing(infoModalAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closeInfoModal = () => {
    Animated.timing(infoModalAnim, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setShowInfoModal(false));
  };

  useEffect(() => {
    if (isFocused && !isLoadingContacts && !hasPlayedTrustedStaggerRef.current) {
      const timer = setTimeout(() => {
        hasPlayedTrustedStaggerRef.current = true;
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isFocused, isLoadingContacts]);

  const userId = session?.userId ?? 1;

  useEffect(() => {
    loadContacts(userId);
  }, [loadContacts, userId]);

  // Auto-dismiss centered toast notification after 2 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadContacts(userId);
    setIsRefreshing(false);
  };

  const handleToggleFeature = () => {
    const newState = toggleTrustedFeature();
    setToastType(newState ? "active" : "inactive");
    setToastMessage(newState ? "Trusted feature activated" : "Trusted feature deactivated");
  };

  const handleSave = async (
    contact: Omit<TrustedContact, "id" | "addedAt">
  ) => {
    if (trustedContacts.length >= 1) {
      Alert.alert(
        "Limit Reached",
        "You can only have one trusted contact at a time. Remove the existing contact to add a new one."
      );
      return;
    }
    setIsSaving(true);
    const result = await addContact(userId, contact);
    setIsSaving(false);
    if (result.success) {
      setShowForm(false);
    } else {
      Alert.alert("Failed to Save", result.error || "Please try again.");
    }
  };

  const handleRemove = async (contactId: string) => {
    const verified = await requireBiometricAuth("Authenticate to remove Trusted Contact");
    if (!verified) {
      return;
    }
    await removeContact(userId, contactId);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header — clean standard header without hamburger */}
      <Header />

      {/* Centered Overlay / Toast (Appears in center, auto-dismisses after 5s) */}
      {toastMessage && (
        <View style={styles.centeredOverlayContainer} pointerEvents="box-none">
          <Pressable
            style={[
              styles.centeredToastCard,
              toastType === "active" ? styles.centeredToastActive : styles.centeredToastInactive,
            ]}
            onPress={() => setToastMessage(null)}
          >
            <View
              style={[
                styles.centeredToastIconWrap,
                toastType === "active" ? styles.centeredToastIconActive : styles.centeredToastIconInactive,
              ]}
            >
              <Ionicons
                name={toastType === "active" ? "shield-checkmark" : "shield-outline"}
                size={22}
                color={toastType === "active" ? colors.brand : colors.textMuted}
              />
            </View>
            <Text style={styles.centeredToastText}>{toastMessage}</Text>
          </Pressable>
        </View>
      )}

      {/* Title section */}
      <View style={styles.titleSection}>
        <View style={styles.titleRow}>
          <Text style={styles.screenHeading}>Trusted Contacts</Text>
          <TouchableOpacity
            onPress={openInfoModal}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.infoButton}
            accessibilityLabel="How it works"
            accessibilityRole="button"
          >
            <Ionicons name="information-circle-outline" size={22} color={colors.brand} />
          </TouchableOpacity>
        </View>
        <Text style={styles.screenSubtitle}>
          Guardian approvals for high-risk payments.
        </Text>
      </View>

      {isLoadingContacts && trustedContacts.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Loading contact...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={[colors.brand]}
              tintColor={colors.brand}
            />
          }
        >

          {/* Add form (inline) - only allowed when 0 contacts exist */}
          {showForm && trustedContacts.length === 0 && (
            <AddContactForm
              onSave={handleSave}
              onCancel={() => setShowForm(false)}
              isSaving={isSaving}
            />
          )}

          {/* Contacts section with Toggle Switch on heading */}
          <StaggerRevealCard
            index={0}
            baseDelay={60}
            hasPlayed={hasPlayedTrustedStaggerRef.current}
          >
            {trustedContacts.length > 0 ? (
              <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeading}>YOUR TRUSTED CONTACT</Text>
                {/* Toggle switch on right side of heading */}
                <View style={styles.toggleWrap}>
                  <Text
                    style={[
                      styles.toggleStatusLabel,
                      { color: isTrustedFeatureEnabled ? colors.brand : colors.textMuted },
                    ]}
                  >
                    {isTrustedFeatureEnabled ? "ON" : "OFF"}
                  </Text>
                  <Switch
                    value={isTrustedFeatureEnabled}
                    onValueChange={handleToggleFeature}
                    trackColor={{
                      false: colors.borderLight,
                      true: colors.safeSurface,
                    }}
                    thumbColor={isTrustedFeatureEnabled ? colors.safe : colors.textMuted}
                  />
                </View>
              </View>

              {/* Contact card section — visual reduced opacity when deactivated */}
              <View
                style={[
                  styles.contactsList,
                  !isTrustedFeatureEnabled && styles.contactsListDisabled,
                ]}
              >
                {trustedContacts.map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    onRemove={handleRemove}
                  />
                ))}
              </View>
            </View>
          ) : !showForm ? (
            /* Empty state */
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="people-outline" size={32} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No trusted contact yet</Text>
              <Text style={styles.emptySubtitle}>
                Add a trusted person who can approve or reject high-risk payments on your behalf.
              </Text>
              <Button
                label="Add Trusted Contact"
                onPress={() => setShowForm(true)}
                variant="primary"
                size="md"
                icon="add"
                style={{ marginTop: spacing.md }}
              />
            </View>
            ) : null}
          </StaggerRevealCard>
        </ScrollView>
      )}

      {/* Info Modal */}
      <Modal
        transparent
        visible={showInfoModal}
        animationType="none"
        onRequestClose={closeInfoModal}
        statusBarTranslucent
      >
        <Pressable style={styles.modalBackdrop} onPress={closeInfoModal}>
          <Animated.View
            style={[
              styles.infoModalCard,
              {
                opacity: infoModalAnim,
                transform: [
                  {
                    scale: infoModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.93, 1],
                    }),
                  },
                  {
                    translateY: infoModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <View style={styles.infoModalHeader}>
                <View style={styles.infoModalIconBox}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.brand} />
                </View>
                <Text style={styles.infoModalTitle}>How It Works</Text>
                <TouchableOpacity
                  onPress={closeInfoModal}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Divider */}
              <View style={styles.infoModalDivider} />

              {/* Message */}
              <Text style={styles.infoModalBody}>
                When a high-risk payment is detected, your trusted contact will receive a 2-minute approval request before the payment is processed.
              </Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  titleSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoButton: {
    padding: 2,
  },
  screenHeading: {
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
  },
  screenSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  centeredOverlayContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    paddingHorizontal: spacing.xxl,
    backgroundColor: "rgba(23, 23, 23, 0.25)",
  },
  centeredToastCard: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    maxWidth: 320,
    width: "100%",
    ...shadows.md,
  },
  centeredToastActive: {
    borderColor: colors.brandBorder,
  },
  centeredToastInactive: {
    borderColor: colors.border,
  },
  centeredToastIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  centeredToastIconActive: {
    backgroundColor: colors.brandSurface,
    borderColor: colors.brandBorder,
  },
  centeredToastIconInactive: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
  },
  centeredToastText: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 15,
    textAlign: "center",
    fontWeight: "700",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 13,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 15, 15, 0.45)",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  infoModalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
    ...shadows.lg,
  },
  infoModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  infoModalIconBox: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  infoModalTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  infoModalDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginBottom: spacing.md,
  },
  infoModalBody: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  infoText: {
    ...typography.small,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  infoTextDisabled: {
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  sectionHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    letterSpacing: 0.6,
    fontSize: 11,
  },
  toggleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  toggleStatusLabel: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  contactsList: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  contactsListDisabled: {
    opacity: 0.45,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.borderLight,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
});

const formStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  cardTitle: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  formNote: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: "600",
    marginBottom: spacing.sm,
    fontSize: 13,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  pillActive: {
    backgroundColor: colors.btnPrimaryBg,
    borderColor: colors.btnPrimaryBg,
  },
  pillText: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  pillTextActive: {
    color: colors.textInverse,
  },
  formActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  phone: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 2,
  },
  tag: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.xs,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  tagText: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "700",
  },
  addedAt: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 10,
  },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
    zIndex: 10,
    flexShrink: 0,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  removeBtnPressed: {
    backgroundColor: colors.backgroundSubtle,
    borderColor: colors.border,
  },
});
