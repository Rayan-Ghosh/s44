import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Animated,
  Easing,
} from "react-native";
import { useRoute, useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii, shadows } from "../theme/layout";
import { Header } from "../components/common/Header";
import { Card } from "../components/common/Card";
import { TextInput } from "../components/common/TextInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { RiskGauge } from "../components/common/RiskGauge";
import { StaggerRevealCard } from "../components/common/StaggerRevealCard";
import { AnimatedAmount } from "../components/common/AnimatedAmount";
import { AiScanBanner } from "../components/common/AiScanBanner";
import { RiskContributionBar, ContributionItem } from "../components/common/RiskContributionBar";
import { Button } from "../components/common/Button";
import { FloatingToast, ToastConfig } from "../components/common/FloatingToast";
import { ChoosePaymentAppModal } from "../components/payment/ChoosePaymentAppModal";
import { QrScannerModal } from "../components/payment/QrScannerModal";
import { Camera } from "expo-camera";
import * as Contacts from "expo-contacts";
import { applyScannedQrToForm } from "../utils/qr-scanner-helper";
import { applySelectedContactToForm } from "../utils/contact-picker-helper";
import { getRecipientType, RecipientType } from "../utils/recipient-type";
import { resolveRecipient } from "../services/recipient-resolution-service";
import { useAuth } from "../context/AuthContext";
import { useGuardian } from "../context/GuardianContext";
import { GuardianService } from "../services/guardian-service";
import { BiometricService } from "../services/biometric-service";
import {
  PaymentService,
  UserTransaction,
  UserPaymentOverview,
  EMPTY_PAYMENT_OVERVIEW,
  isTransactionTerminal,
  isTransactionPayable,
  PaymentDraft,
  PaymentWorkflowStage,
  validatePaymentAuthorizationStage,
  validatePaymentSubmissionStage,
  validatePaymentCompletionStage,
  assertNotEvaluationStage,
} from "../services/payment-service";
import {
  getRiskLevelFromScore,
  getStatusBadgeProps,
  validateAndLogRiskState,
  RiskLevel,
} from "../utils/risk-scoring";

export interface EvaluationDisplayResult {
  stage: PaymentWorkflowStage;
  riskLevel?: RiskLevel;
  riskScore?: number;
  reasons?: string[];
  summary?: string;
  message?: string;
  status?: string;
  isAuthorized: false;
  isApproved: false;
  isCompleted: false;
  isSubmitted: false;
}

const NewPaymentHighlightCard: React.FC<{
  children: React.ReactNode;
  isNew: boolean;
}> = ({ children, isNew }) => {
  const pulseAnim = useRef(new Animated.Value(isNew ? 0 : 1)).current;

  useEffect(() => {
    if (isNew) {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: false,
        }),
        Animated.delay(1200),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [isNew, pulseAnim]);

  if (!isNew) return <>{children}</>;

  const borderColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.brand],
  });

  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.015],
  });

  return (
    <Animated.View
      style={{
        transform: [{ scale }],
        borderWidth: 1,
        borderColor,
        borderRadius: radii.md,
      }}
    >
      {children}
    </Animated.View>
  );
};

export const PaymentsScreen: React.FC = () => {
  const { width } = useWindowDimensions();
  const route = useRoute<any>();
  const { session } = useAuth();
  const {
    activeRequest,
    countdown,
    paymentOutcome,
    clearPaymentOutcome,
    initiateGuardianRequest,
    syncActiveRequestForTransaction,
    isTrustedFeatureEnabled,
    trustedContacts,
  } = useGuardian();

  const isFocused = useIsFocused();
  const [overview, setOverview] = useState<UserPaymentOverview>(EMPTY_PAYMENT_OVERVIEW);
  const [transactions, setTransactions] = useState<UserTransaction[]>([]);
  const [filter, setFilter] = useState<"all" | "review" | "safe">("all");
  const [selectedTx, setSelectedTx] = useState<UserTransaction | null>(null);
  const [awaitingGuardian, setAwaitingGuardian] = useState(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isActing, setIsActing] = useState<boolean>(false);
  const [isAuthorizing, setIsAuthorizing] = useState<boolean>(false);

  // Risk Score Result Reveal & List Stagger Animation States (run once on first view)
  const hasPlayedRevealRef = useRef(false);
  const hasPlayedListStaggerRef = useRef(false);
  const hasInitialSelectionDoneRef = useRef(false);
  const [isAiScanning, setIsAiScanning] = useState<boolean>(true);

  // New Payment Detection Tracking
  const [newlyDetectedIds, setNewlyDetectedIds] = useState<Set<string>>(new Set());
  const knownTxIdsRef = useRef<Set<string>>(new Set());

  // AVARAN PAY Quick Payment Entry Form (Frontend-only state)
  const [entryRecipient, setEntryRecipient] = useState<string>("");
  const [entryAmount, setEntryAmount] = useState<string>("");
  const [entryNote, setEntryNote] = useState<string>("");
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<EvaluationDisplayResult | null>(null);
  const [isScannerVisible, setIsScannerVisible] = useState<boolean>(false);
  const formVersionRef = useRef<number>(0);

  const handleRecipientChange = (value: string) => {
    setEntryRecipient(value);
    setPaymentDraft(null);
    setEvaluationResult(null);
    formVersionRef.current += 1;
  };

  const handleAmountChange = (value: string) => {
    setEntryAmount(value);
    setPaymentDraft(null);
    setEvaluationResult(null);
    formVersionRef.current += 1;
  };

  const handleNoteChange = (value: string) => {
    setEntryNote(value);
    setPaymentDraft(null);
    setEvaluationResult(null);
    formVersionRef.current += 1;
  };

  // Pure recipient-type detection for entry input (local, non-disruptive, preserves input exactly)
  const recipientType: RecipientType = useMemo(() => getRecipientType(entryRecipient), [entryRecipient]);

  const handleOpenScanner = async () => {
    try {
      const permission = await Camera.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showToast("Camera permission is required to scan QR codes", "warning");
        return;
      }
      setIsScannerVisible(true);
    } catch {
      showToast("Camera permission is required to scan QR codes", "warning");
    }
  };

  const handleQrScan = (rawPayload: string) => {
    setIsScannerVisible(false);
    const result = applyScannedQrToForm(
      { recipient: entryRecipient, amount: entryAmount, note: entryNote },
      rawPayload
    );

    if (!result.success) {
      showToast(result.error, "warning");
      return;
    }

    setEntryRecipient(result.updatedForm.recipient);
    if (result.updatedForm.amount) {
      setEntryAmount(result.updatedForm.amount);
    }
    if (result.updatedForm.note) {
      setEntryNote(result.updatedForm.note);
    }
    setPaymentDraft(null);
    setEvaluationResult(null);
    formVersionRef.current += 1;
    showToast("QR code scanned successfully", "success");
  };

  const handlePickContact = async () => {
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (!permission.granted) {
        showToast("Contacts permission is required to select a contact", "warning");
        return;
      }

      let contact: any = null;
      if (typeof (Contacts as any).Contact?.presentPicker === "function") {
        contact = await (Contacts as any).Contact.presentPicker();
      } else if (typeof (Contacts as any).presentContactPickerAsync === "function") {
        contact = await (Contacts as any).presentContactPickerAsync();
      }

      if (!contact) {
        return;
      }

      if (!contact.phones && !contact.phoneNumbers && typeof contact.getPhones === "function") {
        try {
          contact = {
            ...contact,
            phones: await contact.getPhones(),
          };
        } catch {
          // fallback to raw contact
        }
      }

      const result = applySelectedContactToForm(
        { recipient: entryRecipient, amount: entryAmount, note: entryNote },
        contact
      );

      if (!result.success) {
        showToast(result.error, "warning");
        return;
      }

      setEntryRecipient(result.updatedForm.recipient);
      setPaymentDraft(null);
      setEvaluationResult(null);
      formVersionRef.current += 1;
      showToast("Contact selected successfully", "success");
    } catch {
      showToast("Contacts permission is required to select a contact", "warning");
    }
  };

  const handleEvaluateAndPay = () => {
    if (isEvaluating) return;
    setIsEvaluating(true);
    setPaymentDraft(null);
    setEvaluationResult(null);
    const evaluationVersion = ++formVersionRef.current;
    try {
      const resolution = resolveRecipient({ originalValue: entryRecipient });
      if (!resolution.success) {
        if (resolution.reason === "RESOLUTION_UNAVAILABLE") {
          showToast("Mobile number verification is not available yet", "warning");
        } else {
          showToast("Enter a valid UPI ID or mobile number", "warning");
        }
        return;
      }

      const parsedAmount = entryAmount.trim() === "" ? NaN : Number(entryAmount);
      const draftResult = PaymentService.createPaymentDraft({
        recipient: resolution.resolvedRecipient,
        amount: parsedAmount,
        note: entryNote,
      });

      if (!draftResult.success) {
        showToast(draftResult.error, "warning");
        return;
      }

      const draft = draftResult.draft;

      const evalResult = PaymentService.evaluatePaymentDraft({ draft });
      if (!evalResult.success) {
        showToast(evalResult.error, "warning");
        return;
      }

      // Race-condition guard: if form inputs were modified while evaluation was in flight, discard
      if (formVersionRef.current !== evaluationVersion) {
        return;
      }

      setPaymentDraft(draft);
      const evalData = evalResult.data;
      const derivedRiskLevel: RiskLevel | undefined =
        evalData.riskLevel ||
        (typeof evalData.riskScore === "number" ? getRiskLevelFromScore(evalData.riskScore) : undefined);

      setEvaluationResult({
        stage: "EVALUATION_COMPLETED",
        riskLevel: derivedRiskLevel,
        riskScore: typeof evalData.riskScore === "number" ? evalData.riskScore : undefined,
        reasons: Array.isArray(evalData.reasons) ? evalData.reasons : undefined,
        summary: typeof evalData.summary === "string" ? evalData.summary : undefined,
        message: typeof evalData.message === "string" ? evalData.message : undefined,
        status: typeof evalData.status === "string" ? evalData.status : undefined,
        isAuthorized: false,
        isApproved: false,
        isCompleted: false,
        isSubmitted: false,
      });
      showToast(evalResult.data.message, "info");
    } catch (err: any) {
      showToast(err?.message || "Unable to evaluate payment draft", "warning");
    } finally {
      setIsEvaluating(false);
    }
  };

  // Mark list stagger as completed after initial reveal
  useEffect(() => {
    if (isFocused && !isLoading && !hasPlayedListStaggerRef.current) {
      const timer = setTimeout(() => {
        hasPlayedListStaggerRef.current = true;
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isFocused, isLoading]);

  // Trigger the reveal animation when Payments page is first focused and data is ready
  useEffect(() => {
    if (isFocused && !isLoading && selectedTx && !hasPlayedRevealRef.current) {
      const timer = setTimeout(() => {
        hasPlayedRevealRef.current = true;
      }, 2200);
      return () => clearTimeout(timer);
    }
  }, [isFocused, isLoading, selectedTx]);

  // Modals & Toast State
  const [toastConfig, setToastConfig] = useState<ToastConfig | null>(null);
  const [isChooseAppModalVisible, setIsChooseAppModalVisible] = useState<boolean>(false);

  const showToast = (message: string, type: "info" | "success" | "warning" = "success") => {
    setToastConfig({ message, type });
  };

  const loadPayments = useCallback(async () => {
    try {
      const userId = session?.userId || 1;
      const [ovData, txnData] = await Promise.all([
        PaymentService.getOverview(userId),
        PaymentService.getTransactions(userId, "all"),
      ]);
      setOverview(ovData);
      setTransactions(txnData.items);

      // Auto-select on initial load only once (does not override user's manual close)
      if (!hasInitialSelectionDoneRef.current && txnData.items.length > 0) {
        hasInitialSelectionDoneRef.current = true;
        txnData.items.forEach((t) => knownTxIdsRef.current.add(t.id));

        const requestedId = route.params?.selectedTxId;
        if (requestedId) {
          const found = txnData.items.find(
            (t) => t.id === requestedId || String(t.id) === String(requestedId)
          );
          if (found) {
            setSelectedTx(found);
            return;
          }
        }

        const firstRisk = txnData.items.find(
          (t) => t.status === "Risk detected" || t.status === "Held"
        );
        if (firstRisk) setSelectedTx(firstRisk);
        else setSelectedTx(txnData.items[0]);
      } else if (knownTxIdsRef.current.size > 0) {
        // Detect newly added transaction
        const brandNew = new Set<string>();
        txnData.items.forEach((t) => {
          if (!knownTxIdsRef.current.has(t.id)) {
            brandNew.add(t.id);
            knownTxIdsRef.current.add(t.id);
          }
        });
        if (brandNew.size > 0) {
          setNewlyDetectedIds(brandNew);
          setTimeout(() => setNewlyDetectedIds(new Set()), 3000);
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [session?.userId, route.params?.selectedTxId]);

  useEffect(() => {
    loadPayments();

    // Subscribe to real-time updates from centralized PaymentService
    const unsubscribe = PaymentService.subscribe((updatedOverview, updatedTxns) => {
      setOverview(updatedOverview);
      setTransactions(updatedTxns);

      // Detect newly added transactions in real-time stream
      if (knownTxIdsRef.current.size > 0) {
        const brandNew = new Set<string>();
        updatedTxns.forEach((t) => {
          if (!knownTxIdsRef.current.has(t.id)) {
            brandNew.add(t.id);
            knownTxIdsRef.current.add(t.id);
          }
        });
        if (brandNew.size > 0) {
          setNewlyDetectedIds(brandNew);
          setTimeout(() => setNewlyDetectedIds(new Set()), 3000);
        }
      }

      // Keep selectedTx synchronized with latest status or deselect if no longer matching filter
      setSelectedTx((prev) => {
        if (!prev) return null;
        const fresh = updatedTxns.find((t) => t.id === prev.id);
        if (!fresh) return null;

        // If in "review" tab and this item is now completed/approved, auto-shift to next review item or close
        if (
          filter === "review" &&
          (fresh.isCompleted ||
            fresh.status === "Approved by you" ||
            fresh.status === "Safe" ||
            fresh.status === "Completed" ||
            fresh.status === "Blocked" ||
            fresh.status === "Reported")
        ) {
          const nextReview = updatedTxns.find(
            (t) => t.status === "Risk detected" || t.status === "Held"
          );
          return nextReview || null;
        }

        return fresh;
      });
    });

    return unsubscribe;
  }, [loadPayments, filter]);

  // If navigation param selectedTxId changes, switch selection
  useEffect(() => {
    const requestedId = route.params?.selectedTxId;
    if (requestedId) {
      PaymentService.getTransactions(session?.userId || 1, "all").then((data) => {
        const found = data.items.find(
          (t) => t.id === requestedId || String(t.id) === String(requestedId)
        );
        if (found) {
          setSelectedTx(found);
        }
      });
    }
  }, [route.params?.selectedTxId, session?.userId]);

  // Sync active guardian request when viewing an active held/risk transaction (HIGH risk only)
  useEffect(() => {
    const isHigh =
      selectedTx?.riskLevel === "HIGH" ||
      (typeof selectedTx?.riskScore === "number" && (selectedTx?.riskScore ?? 0) >= 61);
    if (
      selectedTx &&
      !selectedTx.isCompleted &&
      isHigh &&
      (selectedTx.status === "Risk detected" || selectedTx.status === "Held")
    ) {
      syncActiveRequestForTransaction(selectedTx);
    }
  }, [selectedTx?.id, selectedTx?.status, selectedTx?.riskLevel, selectedTx?.riskScore, syncActiveRequestForTransaction]);

  // Filtered transactions computed dynamically from centralized state
  const visibleTransactions = useMemo(() => {
    if (filter === "review") {
      return transactions.filter((t) => t.status === "Risk detected" || t.status === "Held");
    }
    if (filter === "safe") {
      return transactions.filter(
        (t) => t.status === "Safe" || t.status === "Approved by you" || t.status === "Completed"
      );
    }
    return transactions;
  }, [transactions, filter]);

  const handleSelectFilter = (newFilter: "all" | "review" | "safe") => {
    setFilter(newFilter);
    let items = transactions;
    if (newFilter === "review") {
      items = transactions.filter((t) => t.status === "Risk detected" || t.status === "Held");
    } else if (newFilter === "safe") {
      items = transactions.filter(
        (t) => t.status === "Safe" || t.status === "Approved by you" || t.status === "Completed"
      );
    }
    if (items.length > 0) {
      setSelectedTx(items[0]);
    }
  };

  // Watch for guardian decision and update UI accordingly
  useEffect(() => {
    if (!paymentOutcome) return;

    if (paymentOutcome === "APPROVED") {
      showToast("✓ Trusted contact approved your payment", "success");
      loadPayments();
    } else if (paymentOutcome === "REJECTED") {
      showToast("⚠ Payment rejected by trusted contact", "warning");
      loadPayments();
    } else if (paymentOutcome === "EXPIRED") {
      showToast("Guardian approval window expired. Payment cancelled.", "info");
      loadPayments();
    }
  }, [paymentOutcome, loadPayments]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadPayments();
  };

  const handleAuthorize = async (
    txId: string,
    stage?: PaymentWorkflowStage | { stage?: any } | string | null
  ) => {
    if (isAuthorizing || isActing || !selectedTx) return;

    if (stage !== undefined) {
      const validation = validatePaymentAuthorizationStage(stage);
      if (!validation.valid) {
        showToast(validation.error || "Cannot authorize payment from this stage", "warning");
        return;
      }
    }

    setIsAuthorizing(true);
    try {
      const authResult = await BiometricService.authenticate(
        "Verify your identity to authorize high-risk payment"
      );
      if (!authResult.success) {
        setIsAuthorizing(false);
        showToast("Verification was not completed. Your payment remains pending.", "info");
        return;
      }

      const res = await PaymentService.authorizeTransaction(
        txId,
        authResult.isFallback ? "DEVICE_CREDENTIAL" : "BIOMETRIC",
        stage || "PAYMENT_AUTHORIZED"
      );
      setIsAuthorizing(false);

      if (res.success) {
        let contacts = trustedContacts;
        if (contacts.length === 0 && session?.userId) {
          contacts = await GuardianService.getTrustedContacts(session.userId);
        }

        const isHighRisk =
          selectedTx.riskLevel === "HIGH" ||
          (typeof selectedTx.riskScore === "number" && selectedTx.riskScore >= 61);

        const updatedSelected: UserTransaction = {
          ...selectedTx,
          authorizationStatus: "AUTHORIZED",
          status: isHighRisk && isTrustedFeatureEnabled && contacts.length > 0 ? "Held" : selectedTx.status,
        };
        setSelectedTx(updatedSelected);

        // If high risk and Trusted contact is active, route through Guardian approval flow
        if (isHighRisk && isTrustedFeatureEnabled && contacts.length > 0) {
          showToast("✓ Identity Verified. Awaiting approval from your Trusted Contact...", "info");
          setAwaitingGuardian(true);
          await initiateGuardianRequest(updatedSelected);
          await loadPayments();
          return;
        }

        showToast("✓ Identity Verified. Completing your secure payment...", "success");
        await loadPayments();
        setIsChooseAppModalVisible(true);
      } else {
        showToast(res.error || "Authorization failed. Please try again.", "warning");
      }
    } catch {
      setIsAuthorizing(false);
      showToast("Verification error. Your payment remains pending.", "warning");
    }
  };

  const handleConfirm = async (
    txId: string,
    stage?: PaymentWorkflowStage | { stage?: any } | string | null
  ) => {
    if (isActing || isAuthorizing) return;
    if (!selectedTx) return;

    if (stage !== undefined) {
      const validation = assertNotEvaluationStage(stage);
      if (!validation.valid) {
        showToast(validation.error || "Cannot proceed with payment from evaluation stage", "warning");
        return;
      }
    }

    if (isTransactionTerminal(selectedTx)) {
      showToast("This payment has already been completed or finalized", "info");
      return;
    }

    const isHighRisk =
      selectedTx.riskLevel === "HIGH" ||
      (typeof selectedTx.riskScore === "number" && selectedTx.riskScore >= 61);

    let contacts = trustedContacts;
    if (contacts.length === 0 && session?.userId) {
      contacts = await GuardianService.getTrustedContacts(session.userId);
    }

    // High-Risk Biometric Authorization Check
    if (
      isHighRisk &&
      selectedTx.authorizationRequired !== false &&
      selectedTx.authorizationStatus !== "AUTHORIZED"
    ) {
      await handleAuthorize(selectedTx.id);
      return;
    }

    // If high risk and Trusted contact is active, route through Guardian approval flow
    if (isHighRisk && isTrustedFeatureEnabled && contacts.length > 0) {
      setAwaitingGuardian(true);
      await initiateGuardianRequest(selectedTx);
      showToast("Awaiting approval from your Trusted Contact...", "info");
      await loadPayments();
      return;
    }

    // Otherwise (low/medium risk or guardian disabled), open payment app selector directly
    setIsChooseAppModalVisible(true);
  };

  const handleReport = async (txId: string) => {
    if (isActing) return;
    if (!selectedTx) return;

    if (selectedTx.status === "Reported") {
      showToast("This transaction has already been reported", "info");
      return;
    }

    setIsActing(true);
    const res = await PaymentService.reportTransaction(txId);
    setIsActing(false);
    if (res.success) {
      showToast("⚠ Fraud report submitted. Payment blocked.", "warning");
      await loadPayments();
    } else {
      showToast(res.error || "Unable to complete this action", "warning");
    }
  };

  const handleCancel = async (txId: string) => {
    if (isActing) return;
    if (!selectedTx) return;

    if (isTransactionTerminal(selectedTx)) {
      showToast("This payment is completed and cannot be cancelled", "info");
      return;
    }

    setIsActing(true);
    const res = await PaymentService.cancelTransaction(txId);
    setIsActing(false);
    if (res.success) {
      showToast("Payment cancelled successfully", "info");
      await loadPayments();
    } else {
      showToast(res.error || "Unable to complete this action", "warning");
    }
  };

  const handlePaymentCompleted = async (
    txId: string,
    stage?: PaymentWorkflowStage | { stage?: any } | string | null,
    options?: { hasActiveContext?: boolean }
  ): Promise<{ success: boolean; error?: string }> => {
    if (stage !== undefined) {
      const validation = validatePaymentCompletionStage(stage);
      if (!validation.valid) {
        showToast(validation.error || "Invalid workflow stage for payment completion", "warning");
        return { success: false, error: validation.error };
      }
    }

    const trustedAudit = selectedTx?.trustedApproval?.required
      ? {
          required: true,
          contactName: selectedTx.trustedApproval.contactName || trustedContacts[0]?.name || "Your trusted contact",
          decision: "Approved" as const,
          decisionTime: "Just now",
        }
      : { required: false };

    const res = await PaymentService.completeTransaction(
      txId,
      "Google Pay UPI",
      trustedAudit,
      stage || "PAYMENT_COMPLETED",
      options
    );
    if (res.success) {
      showToast("✓ Payment completed and recorded in transaction history", "success");
      await loadPayments();
    } else {
      showToast(res.error || "Unable to complete payment on server", "warning");
    }
    return res;
  };

  const getDynamicContributions = (tx: UserTransaction): ContributionItem[] => {
    if (tx.riskLevel === "HIGH" || (typeof tx.riskScore === "number" && tx.riskScore >= 61)) {
      return [
        { label: "Transaction Patterns", percentage: 45, color: colors.threat },
        { label: "Recipient History", percentage: 30, color: colors.caution },
        { label: "Device Trust", percentage: 25, color: colors.textSecondary },
      ];
    }
    if (tx.riskLevel === "MEDIUM" || (typeof tx.riskScore === "number" && tx.riskScore >= 31)) {
      return [
        { label: "Transaction Baseline", percentage: 25, color: colors.caution },
        { label: "Recipient Verification", percentage: 20, color: colors.caution },
        { label: "Device Trust", percentage: 10, color: colors.safe },
      ];
    }
    return [
      { label: "Transaction Patterns", percentage: 4, color: colors.safe },
      { label: "Behavioural Profile", percentage: 2, color: colors.safe },
      { label: "Device Trust", percentage: 2, color: colors.safe },
      { label: "Recipient History", percentage: 0, color: colors.safe },
      { label: "Other Factors", percentage: 0, color: colors.textMuted },
    ];
  };

  const isCurrentActiveTx = Boolean(selectedTx && isTransactionPayable(selectedTx) && !isTransactionTerminal(selectedTx));

  const allCount = transactions.length;
  const reviewCount = transactions.filter((t) => isTransactionPayable(t)).length;
  const safeCount = transactions.filter((t) => isTransactionTerminal(t)).length;

  const filterTabs = [
    { key: "all", label: "All", count: allCount, isAlert: false },
    {
      key: "review",
      label: "Needs Review",
      count: reviewCount,
      isAlert: reviewCount > 0,
    },
    { key: "safe", label: "Completed", count: safeCount, isAlert: false },
  ] as const;

  return (
    <View style={styles.screen}>
      <Header />

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Loading payment records...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={[colors.brand]}
              tintColor={colors.brand}
            />
          }
        >
          {/* 1. Transaction Summary Header */}
          <View style={styles.titleSection}>
            <Text style={styles.screenHeading}>AVARAN PAY</Text>
            <Text style={styles.screenSubtitle}>
              {overview?.transactionCount ?? allCount} transactions ·{" "}
              <AnimatedAmount
                amount={overview?.totalAmountThisMonth ?? 0}
                prefix="₹"
                style={styles.screenSubtitleAmount}
                duration={900}
                animateOnlyOnce={hasPlayedRevealRef.current}
              />
              {" "}this month
            </Text>
          </View>

          {/* AVARAN PAY Entry Card */}
          <Card variant="default" style={styles.entryCard}>
            <View style={styles.entryCardHeader}>
              <Text style={styles.entryCardTitle}>Pay someone new</Text>
              <Text style={styles.entryCardSubtitle}>
                Enter UPI ID, mobile number or scan a QR
              </Text>
            </View>

            {/* Recipient Input (Primary visual focus) */}
            <TextInput
              placeholder="UPI ID or mobile number"
              icon="person-outline"
              value={entryRecipient}
              onChangeText={handleRecipientChange}
              containerStyle={styles.recipientInputContainer}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Subtle recipient-type helper hint (only shown when recognized) */}
            {recipientType !== "UNKNOWN" && (
              <Text
                style={styles.recipientTypeHint}
                accessibilityRole="text"
              >
                {recipientType === "UPI_ID" ? "UPI ID detected" : "Mobile number detected"}
              </Text>
            )}

            {/* Secondary Actions: SCAN QR & CONTACTS */}
            <View style={styles.secondaryActionsRow}>
              <TouchableOpacity
                onPress={handleOpenScanner}
                style={styles.secondaryActionBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Scan QR code"
              >
                <Ionicons name="qr-code-outline" size={15} color={colors.textSecondary} />
                <Text style={styles.secondaryActionBtnText}>SCAN QR</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePickContact}
                style={styles.secondaryActionBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Choose recipient from contacts"
              >
                <Ionicons name="people-outline" size={15} color={colors.textSecondary} />
                <Text style={styles.secondaryActionBtnText}>CONTACTS</Text>
              </TouchableOpacity>
            </View>

            {/* Amount Field */}
            <TextInput
              label="Amount (₹)"
              placeholder="0.00"
              prefix="₹"
              keyboardType="decimal-pad"
              value={entryAmount}
              onChangeText={handleAmountChange}
              containerStyle={styles.amountInputContainer}
            />

            {/* Payment Note (Visually secondary) */}
            <TextInput
              label="Payment Note (Optional)"
              placeholder="e.g. Consulting fee, Grocery store"
              icon="document-text-outline"
              value={entryNote}
              onChangeText={handleNoteChange}
              containerStyle={styles.noteInputContainer}
            />

            {/* Primary Action Button */}
            <Button
              label="EVALUATE & PAY"
              icon="shield-checkmark"
              variant="primary"
              size="md"
              loading={isEvaluating}
              disabled={isEvaluating}
              onPress={handleEvaluateAndPay}
              style={styles.evaluateBtn}
            />

            {/* Evaluation Result Section (Informational only) */}
            {evaluationResult && (
              <View
                style={styles.evaluationResultCard}
                accessibilityRole="summary"
                accessibilityLabel="Payment evaluation result"
                testID="evaluation-result-section"
              >
                {/* Header Row */}
                <View style={styles.evalHeaderRow}>
                  <View style={styles.evalHeaderLeft}>
                    <Ionicons name="shield-checkmark-outline" size={16} color={colors.brand} />
                    <Text style={styles.evalHeaderTitle}>Pre-Payment Evaluation</Text>
                  </View>
                  {(() => {
                    const evaluatedLevel: RiskLevel | null =
                      evaluationResult.riskLevel ||
                      (typeof evaluationResult.riskScore === "number"
                        ? getRiskLevelFromScore(evaluationResult.riskScore)
                        : null);

                    if (evaluatedLevel) {
                      const badge = getStatusBadgeProps(evaluatedLevel);
                      return <StatusBadge label={badge.label} status={badge.status} />;
                    }
                    return <StatusBadge label="EVALUATION UNAVAILABLE" status="neutral" />;
                  })()}
                </View>

                {/* Risk Score & Gauge (if available) */}
                {(() => {
                  const evaluatedLevel: RiskLevel | null =
                    evaluationResult.riskLevel ||
                    (typeof evaluationResult.riskScore === "number"
                      ? getRiskLevelFromScore(evaluationResult.riskScore)
                      : null);

                  if (typeof evaluationResult.riskScore === "number" && evaluatedLevel) {
                    return (
                      <View style={styles.evalGaugeRow}>
                        <RiskGauge
                          score={evaluationResult.riskScore}
                          riskLevel={evaluatedLevel}
                          size="sm"
                        />
                        <View style={styles.evalGaugeDetails}>
                          <Text style={styles.evalScoreLabel}>Risk Score</Text>
                          <Text style={styles.evalScoreValue}>{evaluationResult.riskScore}/100</Text>
                          <Text style={styles.evalLevelDescription}>
                            {evaluatedLevel === "HIGH"
                              ? "High risk detected — caution advised"
                              : evaluatedLevel === "MEDIUM"
                              ? "Moderate risk advisory notice"
                              : "Standard verified low-risk signature"}
                          </Text>
                        </View>
                      </View>
                    );
                  }
                  return null;
                })()}

                {/* Risk Reasons / Summary */}
                {evaluationResult.reasons && evaluationResult.reasons.length > 0 ? (
                  <View style={styles.evalReasonsContainer}>
                    <Text style={styles.evalReasonsTitle}>Evaluation Factors</Text>
                    {evaluationResult.reasons.map((reason, idx) => {
                      const evaluatedLevel: RiskLevel | null =
                        evaluationResult.riskLevel ||
                        (typeof evaluationResult.riskScore === "number"
                          ? getRiskLevelFromScore(evaluationResult.riskScore)
                          : null);

                      return (
                        <View key={idx} style={styles.evalReasonRow}>
                          <Ionicons
                            name={
                              evaluatedLevel === "HIGH"
                                ? "alert-circle"
                                : evaluatedLevel === "MEDIUM"
                                ? "warning"
                                : "checkmark-circle"
                            }
                            size={13}
                            color={
                              evaluatedLevel === "HIGH"
                                ? colors.threat
                                : evaluatedLevel === "MEDIUM"
                                ? colors.caution
                                : colors.safe
                            }
                            style={{ marginRight: 6, marginTop: 2 }}
                          />
                          <Text style={styles.evalReasonText}>{reason}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : evaluationResult.summary ? (
                  <Text style={styles.evalSummaryText}>{evaluationResult.summary}</Text>
                ) : evaluationResult.message ? (
                  <Text style={styles.evalSummaryText}>{evaluationResult.message}</Text>
                ) : null}

                {/* Informational State Disclaimer */}
                <View style={styles.evalDisclaimerRow}>
                  <Ionicons
                    name="information-circle-outline"
                    size={14}
                    color={colors.textSecondary}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={styles.evalDisclaimerText}>
                    Pre-payment evaluation only. Not an authorization or approval. No transaction has been created or submitted.
                  </Text>
                </View>
              </View>
            )}
          </Card>

          {/* 2. Filter Tabs: ALL | NEEDS REVIEW | COMPLETED / SAFE */}
          <View style={styles.filterSection}>
            <View style={styles.filterTrack}>
              {filterTabs.map((f) => {
                const isActive = filter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => handleSelectFilter(f.key)}
                    style={[
                      styles.filterTab,
                      isActive && styles.filterTabActive,
                      ...(Platform.OS === "web" ? [{ cursor: "pointer", userSelect: "none" } as any] : []),
                    ]}
                    activeOpacity={0.75}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                      {f.label}
                    </Text>
                    <View
                      style={[
                        styles.countPill,
                        isActive ? styles.countPillActive : styles.countPillInactive,
                        f.isAlert && !isActive && styles.countPillAlert,
                      ]}
                    >
                      <Text
                        style={[
                          styles.countPillText,
                          isActive ? styles.countPillTextActive : styles.countPillTextInactive,
                          f.isAlert && !isActive && styles.countPillTextAlert,
                        ]}
                      >
                        {f.count}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 3. PAYMENT DETAILS & RISK ASSESSMENT CARD */}
          {selectedTx && (
            <View style={[styles.detailCard, isCurrentActiveTx ? styles.detailCardActive : styles.detailCardReadOnly]}>
              <View style={styles.detailTopRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.detailBadgeRow}>
                    <Text style={styles.detailHeading}>
                      {isCurrentActiveTx ? "CURRENT PAYMENT IN PROGRESS" : "COMPLETED TRANSACTION RECORD"}
                    </Text>
                    {!isCurrentActiveTx && (
                      <View style={styles.readOnlyTag}>
                        <Ionicons name="lock-closed" size={11} color={colors.textMuted} style={{ marginRight: 3 }} />
                        <Text style={styles.readOnlyTagText}>READ-ONLY AUDIT</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.detailMerchant}>{selectedTx.merchant}</Text>
                  <AnimatedAmount
                    amount={selectedTx?.amount ?? 0}
                    prefix="₹"
                    style={styles.detailAmount}
                    duration={900}
                    animateOnlyOnce={hasPlayedRevealRef.current}
                  />
                  <Text style={styles.detailMeta}>
                    Method: {selectedTx.paymentAppUsed || selectedTx.paymentMethod} · {selectedTx.date}
                  </Text>
                  <Text style={styles.detailRef}>Ref ID: TXN-{selectedTx.id}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedTx(null)}
                  style={styles.closeBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Close payment details"
                >
                  <Ionicons name="close" size={18} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* RISK ASSESSMENT SECTION */}
              <View style={styles.assessmentSection}>
                <Text style={styles.assessmentHeading}>
                  {isCurrentActiveTx ? "AVARAN RISK ASSESSMENT" : "PRE-TRANSACTION RISK ASSESSMENT"}
                </Text>

                {/* AI SCANNING / ANALYSIS ANIMATION BANNER */}
                <AiScanBanner
                  isAnalyzing={isAiScanning && !hasPlayedRevealRef.current}
                  onAnalysisComplete={() => {
                    setIsAiScanning(false);
                  }}
                />

                {(() => {
                  const dtScore = selectedTx.riskScore ?? 0;
                  const dtLevel = selectedTx.riskLevel || getRiskLevelFromScore(dtScore);
                  validateAndLogRiskState({
                    component: "PaymentsScreen:DetailCard",
                    transactionId: selectedTx.id,
                    riskScore: dtScore,
                    riskLevel: dtLevel,
                  });
                  return (
                    <RiskGauge
                      score={dtScore}
                      riskLevel={dtLevel}
                      size="md"
                      enableRevealAnimation={!hasPlayedRevealRef.current}
                    />
                  );
                })()}

                {/* 1. WHY WAS THIS PAYMENT FLAGGED / ANALYSIS FACTORS */}
                <StaggerRevealCard
                  index={0}
                  baseDelay={1350}
                  staggerInterval={120}
                  hasPlayed={hasPlayedRevealRef.current}
                >
                  <View style={styles.reasonsContainer}>
                    <Text style={styles.reasonsTitle}>
                      {selectedTx.riskLevel === "HIGH"
                        ? "Why was this payment flagged?"
                        : selectedTx.riskLevel === "MEDIUM"
                        ? "Risk Advisory Notice"
                        : "Risk analysis & signature"}
                    </Text>
                    {selectedTx.reasons && selectedTx.reasons.length > 0 ? (
                      selectedTx.reasons.map((r, i) => (
                        <View key={i} style={styles.reasonBulletRow}>
                          <Ionicons
                            name={
                              selectedTx.riskLevel === "HIGH"
                                ? "alert-circle"
                                : selectedTx.riskLevel === "MEDIUM"
                                ? "warning"
                                : "checkmark-circle"
                            }
                            size={14}
                            color={
                              selectedTx.riskLevel === "HIGH"
                                ? colors.threat
                                : selectedTx.riskLevel === "MEDIUM"
                                ? colors.caution
                                : colors.safe
                            }
                            style={{ marginRight: 6, marginTop: 2 }}
                          />
                          <Text style={styles.reasonBulletText}>{r}</Text>
                        </View>
                      ))
                    ) : (
                      <View style={styles.reasonBulletRow}>
                        <Ionicons name="checkmark-circle" size={14} color={colors.safe} style={{ marginRight: 6, marginTop: 2 }} />
                        <Text style={styles.reasonBulletText}>
                          Standard verified transaction signature.
                        </Text>
                      </View>
                    )}
                  </View>
                </StaggerRevealCard>

                {/* 2. HISTORICAL TRUSTED APPROVAL AUDIT (READ-ONLY) */}
                {!isCurrentActiveTx && (
                  <StaggerRevealCard
                    index={1}
                    baseDelay={1350}
                    staggerInterval={120}
                    hasPlayed={hasPlayedRevealRef.current}
                  >
                    <View style={styles.auditCard}>
                      <View style={styles.auditHeader}>
                        <Ionicons name="shield-checkmark" size={16} color={colors.brand} />
                        <Text style={styles.auditTitle}>Trusted Contact Approval Record</Text>
                      </View>
                      <View style={styles.auditRow}>
                        <Text style={styles.auditLabel}>Trusted Approval Required:</Text>
                        <Text style={styles.auditValue}>
                          {selectedTx.trustedApproval?.required ? "Yes" : "No (Safe Baseline)"}
                        </Text>
                      </View>
                      {selectedTx.trustedApproval?.required && (
                        <>
                          <View style={styles.auditRow}>
                            <Text style={styles.auditLabel}>Trusted Contact:</Text>
                            <Text style={styles.auditValue}>
                              {selectedTx.trustedApproval.contactName || trustedContacts[0]?.name || "Your trusted contact"}
                            </Text>
                          </View>
                          <View style={styles.auditRow}>
                            <Text style={styles.auditLabel}>Decision:</Text>
                            <Text style={[styles.auditValue, { color: colors.safeText, fontWeight: "700" }]}>
                              {selectedTx.trustedApproval.decision || "Approved"}
                            </Text>
                          </View>
                          <View style={styles.auditRow}>
                            <Text style={styles.auditLabel}>Timestamp:</Text>
                            <Text style={styles.auditValue}>
                              {selectedTx.trustedApproval.decisionTime || selectedTx.date}
                            </Text>
                          </View>
                        </>
                      )}
                      <View style={styles.auditRow}>
                        <Text style={styles.auditLabel}>Payment Gateway Used:</Text>
                        <Text style={styles.auditValue}>
                          {selectedTx.paymentAppUsed || selectedTx.paymentMethod}
                        </Text>
                      </View>
                    </View>
                  </StaggerRevealCard>
                )}

                {/* 3. RISK CONTRIBUTION HORIZONTAL VISUALIZATION */}
                <StaggerRevealCard
                  index={2}
                  baseDelay={1350}
                  staggerInterval={120}
                  hasPlayed={hasPlayedRevealRef.current}
                >
                  <RiskContributionBar contributions={getDynamicContributions(selectedTx)} />
                </StaggerRevealCard>

                {/* 4. CURRENT PAYMENT ACTIONS vs HISTORICAL SETTLED BANNER */}
                <StaggerRevealCard
                  index={3}
                  baseDelay={1350}
                  staggerInterval={120}
                  hasPlayed={hasPlayedRevealRef.current}
                >
                  {isCurrentActiveTx ? (
                    <View style={styles.decisionBlock}>
                      {/* 1. Guardian Waiting State (Active hold / countdown) */}
                      {((selectedTx.riskLevel === "HIGH" || (typeof selectedTx.riskScore === "number" && selectedTx.riskScore >= 61)) && isTrustedFeatureEnabled && (trustedContacts.length > 0 || selectedTx.status === "Held") && !isTransactionTerminal(selectedTx) && selectedTx.status !== "Approved by you" && selectedTx.authorizationStatus === "AUTHORIZED" && !paymentOutcome) ||
                      (((awaitingGuardian && activeRequest) || (activeRequest && activeRequest.status === "PENDING" && String(activeRequest.transactionId) === String(selectedTx.id) && !paymentOutcome)) && !paymentOutcome) ? (
                        <View style={styles.guardianWaitBlock}>
                          <View style={styles.guardianWaitHeader}>
                            <View style={styles.guardianWaitHeaderLeft}>
                              <View style={styles.guardianWaitIconBox}>
                                <Ionicons name="hourglass-outline" size={18} color={colors.caution} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.guardianWaitTitle}>Waiting for trusted contact approval</Text>
                                <Text style={styles.guardianWaitSub}>
                                  Approval is required from your trusted contact before this transfer can proceed.
                                </Text>
                              </View>
                            </View>
                            {(() => {
                              const waitLevel = selectedTx.riskLevel || getRiskLevelFromScore(selectedTx.riskScore ?? 0);
                              const waitBadge = getStatusBadgeProps(waitLevel);
                              return <StatusBadge label={waitBadge.label} status={waitBadge.status} />;
                            })()}
                          </View>

                          <View style={styles.guardianWaitDetails}>
                            <View style={styles.guardianWaitAmountRow}>
                              <Text style={styles.guardianWaitAmount}>
                                ₹{(selectedTx.amount ?? 0).toLocaleString("en-IN")}
                              </Text>
                              <Text style={styles.guardianWaitMerchant}>
                                To: {selectedTx.merchant}
                              </Text>
                            </View>
                            <Text style={styles.guardianWaitNotice}>
                              Sent to {trustedContacts[0]?.name || "your trusted contact"}. Your payment will automatically update once reviewed.
                            </Text>
                          </View>

                          <View style={styles.countdownRow}>
                            <Ionicons
                              name="time-outline"
                              size={15}
                              color={countdown <= 15 ? colors.threat : colors.caution}
                            />
                            <Text
                              style={[
                                styles.countdownNum,
                                { color: countdown <= 15 ? colors.threat : colors.caution },
                              ]}
                            >
                              {countdown}s
                            </Text>
                            <Text style={styles.countdownLabel}>remaining to approve</Text>
                          </View>
                        </View>
                      ) : paymentOutcome === "APPROVED" || selectedTx.status === "Approved by you" ? (
                        /* 2. Guardian Approved State */
                        <View style={styles.approvedCard}>
                          <View style={styles.approvedHeader}>
                            <View style={styles.approvedIconBox}>
                              <Ionicons name="checkmark-circle" size={22} color={colors.safe} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.approvedTitle}>Trusted contact approved your payment</Text>
                              <Text style={styles.approvedSubtitle}>
                                ₹{(selectedTx.amount ?? 0).toLocaleString("en-IN")} payment to {selectedTx.merchant} is authorized and verified.
                              </Text>
                            </View>
                          </View>
                          <View style={styles.actionRow}>
                            <Button
                              label="PROCEED TO PAY"
                              icon="arrow-forward-circle"
                              onPress={() => setIsChooseAppModalVisible(true)}
                              variant="primary"
                              size="md"
                              style={styles.actionBtn}
                            />
                          </View>
                        </View>
                      ) : paymentOutcome === "REJECTED" ? (
                        /* 3. Guardian Rejected State */
                        <View style={styles.rejectedCard}>
                          <View style={styles.rejectedHeader}>
                            <View style={styles.rejectedIconBox}>
                              <Ionicons name="close-circle" size={22} color={colors.threat} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.rejectedTitle}>Payment rejected by trusted contact</Text>
                              <Text style={styles.rejectedSubtitle}>
                                Your trusted contact declined this transaction of ₹{(selectedTx.amount ?? 0).toLocaleString("en-IN")} due to security risk. This payment cannot continue.
                              </Text>
                            </View>
                          </View>
                        </View>
                      ) : paymentOutcome === "EXPIRED" ? (
                        /* 4. Guardian Expired State */
                        <View style={styles.expiredBlock}>
                          <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.expiredTitle}>Guardian approval window expired</Text>
                            <Text style={styles.expiredText}>
                              The 2-minute review window timed out. Payment cancelled for security.
                            </Text>
                          </View>
                        </View>
                      ) : (
                        /* 5. Active Confirmation Actions (Unified layout for Low, Medium, and High risk) */
                        <View style={{ width: "100%" }}>
                          {selectedTx.authorizationStatus === "AUTHORIZED" && (
                            <View style={styles.authVerifiedBanner}>
                              <Ionicons name="checkmark-circle" size={15} color={colors.safe} />
                              <Text style={styles.authVerifiedText}>
                                Biometric Identity Verified · Signature Valid
                              </Text>
                            </View>
                          )}
                          <View style={styles.actionRow}>
                            <Button
                              label={isAuthorizing ? "Verifying..." : "CONFIRM & CHOOSE APP"}
                              icon="arrow-forward-circle"
                              onPress={() => handleConfirm(selectedTx.id)}
                              loading={isActing || isAuthorizing}
                              disabled={isActing || isAuthorizing}
                              variant="primary"
                              size="md"
                              style={styles.actionBtn}
                            />
                            <Button
                              label="CANCEL"
                              icon="close-circle-outline"
                              onPress={() => handleCancel(selectedTx.id)}
                              loading={isActing}
                              disabled={isActing || isAuthorizing}
                              variant="outline"
                              size="md"
                              style={styles.actionBtn}
                            />
                          </View>
                        </View>
                      )}

                      {!awaitingGuardian && paymentOutcome !== "EXPIRED" && (
                        <TouchableOpacity
                          style={[
                            styles.cancelActionBtn,
                            isActing && styles.cancelActionBtnDisabled,
                          ]}
                          onPress={() => handleCancel(selectedTx.id)}
                          disabled={isActing || isAuthorizing}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel payment"
                        >
                          <Ionicons name="close-circle-outline" size={15} color={colors.textMuted} style={{ marginRight: 5 }} />
                          <Text style={styles.cancelActionText}>Cancel payment</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    /* Completed Historical Settled Banner (Read-Only) */
                    <View style={styles.settledCard}>
                      <View style={styles.settledIconBoxSafe}>
                        <Ionicons name="checkmark" size={20} color={colors.safe} />
                      </View>
                      <View style={styles.settledTextCol}>
                        <Text style={[styles.settledTitle, { color: colors.safeText }]}>
                          PAYMENT COMPLETED & RECORDED
                        </Text>
                        <Text style={styles.settledSubtitle}>
                          This is a secure historical transaction record. No further actions required.
                        </Text>
                      </View>
                    </View>
                  )}
                </StaggerRevealCard>
              </View>
            </View>
          )}

          {/* 4. TRANSACTION LIST */}
          <Text style={styles.listHeading}>
            {filter === "review"
              ? "TRANSACTIONS REQUIRING REVIEW"
              : filter === "safe"
              ? "COMPLETED PAYMENT HISTORY"
              : "ALL TRANSACTIONS"}
          </Text>

          <View style={styles.paymentList}>
            {visibleTransactions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="file-tray-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyText}>
                  {filter === "review"
                    ? "No transactions currently require review. All payments are verified."
                    : filter === "safe"
                    ? "No completed transactions recorded."
                    : "No transactions found."}
                </Text>
              </View>
            ) : (
              visibleTransactions.map((item, idx) => {
                const isRisk = item.status === "Risk detected" || item.status === "Held";
                const isSelected = selectedTx?.id === item.id;
                const isNewlyDetected = newlyDetectedIds.has(item.id);
                const isLast = idx === visibleTransactions.length - 1;
                return (
                  <StaggerRevealCard
                    key={item.id}
                    index={idx}
                    baseDelay={hasPlayedRevealRef.current ? 0 : 1350}
                    staggerInterval={80}
                    hasPlayed={hasPlayedListStaggerRef.current}
                  >
                    <NewPaymentHighlightCard isNew={isNewlyDetected}>
                      <TouchableOpacity
                        style={[
                          styles.txnCard,
                          isRisk && !isSelected && styles.txnCardRisk,
                          isSelected && styles.txnCardSelected,
                          isSelected && isRisk && styles.txnCardSelectedRisk,
                          isLast && styles.txnCardLast,
                        ]}
                        onPress={() => {
                          setSelectedTx(item);
                          if (paymentOutcome) clearPaymentOutcome();
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={styles.txnLeft}>
                          <View
                            style={[
                              styles.txnIconBox,
                              isRisk && styles.txnIconBoxRisk,
                              isSelected && styles.txnIconBoxSelected,
                            ]}
                          >
                            <Ionicons
                              name={isRisk ? "warning" : "checkmark-circle"}
                              size={18}
                              color={isRisk ? colors.threat : colors.safe}
                            />
                          </View>
                          <View style={styles.txnTextCol}>
                            <Text style={styles.txnMerchant}>{item.merchant}</Text>
                            <Text style={styles.txnMeta}>
                              {item.paymentAppUsed || item.paymentMethod} · {item.date}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.txnRight}>
                          <AnimatedAmount
                            amount={item?.amount ?? 0}
                            prefix="₹"
                            style={[
                              styles.txnAmount,
                              isRisk && { color: colors.threat },
                            ]}
                            animateOnlyOnce={hasPlayedListStaggerRef.current}
                            duration={600}
                          />
                          {(() => {
                            const itemLevel = item.riskLevel || getRiskLevelFromScore(item.riskScore ?? 0);
                            return (
                              <StatusBadge
                                label={
                                  isRisk
                                    ? `${itemLevel} RISK`
                                    : item.status === "Reported"
                                    ? "Reported"
                                    : item.status === "Blocked"
                                    ? "Blocked"
                                    : "Completed"
                                }
                                status={
                                  isRisk
                                    ? (itemLevel === "HIGH" ? "high" : itemLevel === "MEDIUM" ? "medium" : "low")
                                    : item.status === "Reported"
                                    ? "escalated"
                                    : "low"
                                }
                                dot={false}
                              />
                            );
                          })()}
                        </View>
                      </TouchableOpacity>
                    </NewPaymentHighlightCard>
                  </StaggerRevealCard>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {/* Choose Installed Payment App Modal (Only enabled connected apps) */}
      <ChoosePaymentAppModal
        visible={isChooseAppModalVisible}
        transaction={selectedTx}
        onClose={() => setIsChooseAppModalVisible(false)}
        onPaymentCompleted={handlePaymentCompleted}
        onShowToast={showToast}
      />

      {/* QR Scanner Modal for AVARAN PAY */}
      <QrScannerModal
        visible={isScannerVisible}
        onClose={() => setIsScannerVisible(false)}
        onScan={handleQrScan}
      />

      {/* Floating Toast notification */}
      <FloatingToast config={toastConfig} onDismiss={() => setToastConfig(null)} />
    </View>
  );
};

const styles = StyleSheet.create({
  recipientInputContainer: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs + 2,
  },
  recipientTypeHint: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: -2,
    marginBottom: spacing.xs + 2,
    paddingHorizontal: 2,
  },
  secondaryActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs + 2,
  },
  secondaryActionBtn: {
    flex: 1,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    gap: 6,
    ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
  },
  secondaryActionBtnText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  amountInputContainer: {
    marginVertical: spacing.xs,
  },
  noteInputContainer: {
    marginVertical: spacing.xs,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  titleSection: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs,
  },
  entryCard: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.borderLight,
    borderWidth: 1,
    borderRadius: radii.lg,
    ...shadows.sm,
  },
  entryCardHeader: {
    marginBottom: spacing.sm,
  },
  entryCardTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  entryCardSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
    marginBottom: spacing.xs,
  },
  evaluateBtn: {
    marginTop: spacing.md,
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
  },
  screenSubtitleAmount: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  filterSection: {
    marginBottom: spacing.md,
  },
  filterTrack: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 4,
  },
  filterTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    gap: 6,
  },
  filterTabActive: {
    backgroundColor: colors.btnPrimaryBg,
    ...shadows.sm,
  },
  filterTabText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
    fontSize: 12,
    textTransform: "none",
    letterSpacing: 0.1,
  },
  filterTabTextActive: {
    color: colors.btnPrimaryText,
    fontWeight: "700",
  },
  countPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.full,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  countPillActive: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  countPillInactive: {
    backgroundColor: colors.borderLight,
  },
  countPillAlert: {
    backgroundColor: colors.threatSurface,
    borderWidth: 1,
    borderColor: colors.threatBorder,
  },
  countPillText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: "700",
  },
  countPillTextActive: {
    color: colors.btnPrimaryText,
  },
  countPillTextInactive: {
    color: colors.textSecondary,
  },
  countPillTextAlert: {
    color: colors.threatText,
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
    paddingBottom: spacing.xxxl * 2,
  },
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1.2,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.lg,
  },
  detailCardActive: {
    borderColor: "rgba(23, 107, 91, 0.35)",
    ...shadows.hero,
  },
  detailCardReadOnly: {
    borderColor: colors.borderLight,
    ...shadows.md,
  },
  detailTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  detailBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  detailHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.6,
  },
  readOnlyTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  readOnlyTagText: {
    ...typography.caption,
    fontSize: 9,
    fontWeight: "700",
    color: colors.textMuted,
  },
  detailMerchant: {
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 2,
  },
  detailAmount: {
    ...typography.amountLarge,
    color: colors.textPrimary,
    marginVertical: 4,
  },
  detailMeta: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 13,
  },
  detailRef: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
    textTransform: "none",
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  assessmentSection: {
    marginTop: spacing.md,
  },
  assessmentHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  reasonsContainer: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    padding: spacing.md,
    marginVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  reasonsTitle: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  reasonBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 2,
  },
  reasonBulletText: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  auditCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  auditHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  auditTitle: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  auditRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  auditLabel: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
  },
  auditValue: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 12,
  },
  decisionBlock: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    width: "100%",
    alignItems: "center",
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
  },
  cancelActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    marginTop: 2,
    ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
  },
  cancelActionBtnDisabled: {
    opacity: 0.5,
  },
  cancelActionText: {
    ...typography.smallSemibold,
    color: colors.textMuted,
    fontSize: 13,
  },
  settledCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.safeSurface,
    borderWidth: 1,
    borderColor: colors.safeBorder,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  settledIconBoxSafe: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  settledTextCol: {
    flex: 1,
  },
  settledTitle: {
    ...typography.bodySemibold,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  settledSubtitle: {
    ...typography.small,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  listHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    letterSpacing: 0.6,
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  paymentList: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.sm,
  },
  txnCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  txnCardRisk: {
    backgroundColor: "rgba(163,61,53,0.025)",
  },
  txnCardSelected: {
    backgroundColor: colors.surfaceSecondary,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
    paddingLeft: spacing.lg - 3,
  },
  txnCardSelectedRisk: {
    backgroundColor: "rgba(163,61,53,0.05)",
    borderLeftWidth: 3,
    borderLeftColor: colors.threat,
    paddingLeft: spacing.lg - 3,
  },
  txnCardLast: {
    borderBottomWidth: 0,
  },
  txnLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  txnIconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  txnIconBoxRisk: {
    backgroundColor: "rgba(163,61,53,0.07)",
    borderColor: colors.threatBorder,
  },
  txnIconBoxSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  txnTextCol: {
    flex: 1,
  },
  txnMerchant: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 13.5,
    lineHeight: 18,
  },
  txnMeta: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  txnRight: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
    paddingLeft: spacing.xs,
  },
  txnAmount: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 14,
    letterSpacing: -0.2,
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  emptyText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: "center",
  },
  guardianWaitBlock: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.cautionBorder,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
    ...shadows.md,
  },
  guardianWaitHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  guardianWaitHeaderLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    flex: 1,
  },
  guardianWaitIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.cautionSurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.cautionBorder,
    marginTop: 1,
  },
  guardianWaitTitle: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  guardianWaitSub: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  guardianWaitDetails: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 3,
  },
  guardianWaitAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  guardianWaitAmount: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  },
  guardianWaitMerchant: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  guardianWaitNotice: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  countdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.cautionSurface,
    borderRadius: radii.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    alignSelf: "flex-start",
  },
  countdownNum: {
    ...typography.smallSemibold,
    fontWeight: "800",
    fontSize: 13,
  },
  countdownLabel: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 11,
  },
  approvedCard: {
    backgroundColor: colors.safeSurface,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.safeBorder,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
    ...shadows.sm,
  },
  approvedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  approvedIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  approvedTitle: {
    ...typography.bodySemibold,
    color: colors.safeText,
    fontSize: 14,
    fontWeight: "700",
  },
  approvedSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  rejectedCard: {
    backgroundColor: colors.threatSurface,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.threatBorder,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
    ...shadows.sm,
  },
  rejectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rejectedIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(220, 38, 38, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  rejectedTitle: {
    ...typography.bodySemibold,
    color: colors.threatText,
    fontSize: 14,
    fontWeight: "700",
  },
  rejectedSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  expiredBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  expiredTitle: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  expiredText: {
    ...typography.small,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  authRequiredCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    ...shadows.sm,
  },
  authRequiredHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  authBadgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.threatSurface,
    borderWidth: 1,
    borderColor: colors.threatBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  authRequiredTitle: {
    ...typography.smallSemibold,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  authRequiredSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  authVerifiedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.safeSurface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.safeBorder,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  authVerifiedText: {
    ...typography.smallSemibold,
    color: colors.safeText,
    fontSize: 12,
  },
  evaluationResultCard: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  evalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  evalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  evalHeaderTitle: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  evalGaugeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  evalGaugeDetails: {
    flex: 1,
    justifyContent: "center",
  },
  evalScoreLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  evalScoreValue: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 1,
  },
  evalLevelDescription: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  evalReasonsContainer: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: 6,
  },
  evalReasonsTitle: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  evalReasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  evalReasonText: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  evalSummaryText: {
    ...typography.small,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  evalDisclaimerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  evalDisclaimerText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 14,
    flex: 1,
  },
});
