import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { Vibration } from "react-native";
import { TrustedContact, GuardianRequest, GuardianStatus } from "../types/guardian";
import { GuardianService } from "../services/guardian-service";
import { PaymentService, UserTransaction } from "../services/payment-service";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------
interface GuardianContextType {
  // Trusted contacts (Maximum 1 contact allowed)
  trustedContacts: TrustedContact[];
  isLoadingContacts: boolean;
  loadContacts: (userId: number) => Promise<void>;
  addContact: (
    userId: number,
    contact: Omit<TrustedContact, "id" | "addedAt">
  ) => Promise<{ success: boolean; error?: string }>;
  removeContact: (userId: number, contactId: string) => Promise<void>;

  // Trusted Feature Toggle State
  isTrustedFeatureEnabled: boolean;
  toggleTrustedFeature: () => boolean;
  setTrustedFeatureEnabled: (enabled: boolean) => void;

  // Guardian request lifecycle
  activeRequest: GuardianRequest | null;  // request initiated by MAIN USER
  pendingRequests: GuardianRequest[];     // requests visible to GUARDIAN
  countdown: number;                      // seconds remaining (0-60)
  paymentOutcome: "APPROVED" | "REJECTED" | "EXPIRED" | null;

  initiateGuardianRequest: (tx: UserTransaction) => void;
  respondToRequest: (requestId: string, decision: "APPROVED" | "REJECTED") => void;
  clearPaymentOutcome: () => void;

  // Notification bell state (guardian's perspective)
  notificationBadge: number;
  clearNotificationBadge: () => void;

  // Guardian approval card (shown at top of screen when guardian taps notification)
  approvalCard: GuardianRequest | null;
  openApprovalCard: (request: GuardianRequest) => void;
  closeApprovalCard: () => void;
}

// ---------------------------------------------------------------------------
// Default context
// ---------------------------------------------------------------------------
const GuardianContext = createContext<GuardianContextType>({
  trustedContacts: [],
  isLoadingContacts: false,
  loadContacts: async () => {},
  addContact: async () => ({ success: true }),
  removeContact: async () => {},
  isTrustedFeatureEnabled: true,
  toggleTrustedFeature: () => true,
  setTrustedFeatureEnabled: () => {},
  activeRequest: null,
  pendingRequests: [],
  countdown: 60,
  paymentOutcome: null,
  initiateGuardianRequest: () => {},
  respondToRequest: () => {},
  clearPaymentOutcome: () => {},
  notificationBadge: 0,
  clearNotificationBadge: () => {},
  approvalCard: null,
  openApprovalCard: () => {},
  closeApprovalCard: () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export const GuardianProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [isTrustedFeatureEnabled, setIsTrustedFeatureEnabled] = useState<boolean>(true);

  const [activeRequest, setActiveRequest] = useState<GuardianRequest | null>(null);
  const [pendingRequests, setPendingRequests] = useState<GuardianRequest[]>([]);
  const [countdown, setCountdown] = useState(60);
  const [paymentOutcome, setPaymentOutcome] = useState<"APPROVED" | "REJECTED" | "EXPIRED" | null>(null);

  const [notificationBadge, setNotificationBadge] = useState(0);
  const [approvalCard, setApprovalCard] = useState<GuardianRequest | null>(null);

  // Refs to cancel timers when request is resolved before timeout
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to track if current request has already been resolved (prevent double-action)
  const resolvedRef = useRef<boolean>(false);

  // -------------------------------------------------------------------------
  // Timer helpers — declared first so all callbacks below can safely reference it
  // -------------------------------------------------------------------------
  const clearTimers = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (expiryTimeoutRef.current) {
      clearTimeout(expiryTimeoutRef.current);
      expiryTimeoutRef.current = null;
    }
  }, []);

  // Cleanup timers on provider unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  // -------------------------------------------------------------------------
  // Feature Toggle Helper
  // -------------------------------------------------------------------------
  const toggleTrustedFeature = useCallback(() => {
    let nextState = false;
    setIsTrustedFeatureEnabled((prev) => {
      nextState = !prev;
      return nextState;
    });

    // If turning OFF while a request is pending, clear the pending request safely
    if (activeRequest && activeRequest.status === "PENDING" && !resolvedRef.current) {
      resolvedRef.current = true;
      clearTimers();
      setActiveRequest((prev) =>
        prev ? { ...prev, status: "EXPIRED", resolvedAt: Date.now() } : null
      );
      setPendingRequests((prev) =>
        prev.map((r) =>
          r.status === "PENDING"
            ? { ...r, status: "EXPIRED", resolvedAt: Date.now() }
            : r
        )
      );
      setPaymentOutcome("EXPIRED");
      setNotificationBadge(0);
      setApprovalCard(null);
      setCountdown(60);
    }

    return nextState;
  }, [activeRequest, clearTimers]);

  const setTrustedFeatureEnabled = useCallback((enabled: boolean) => {
    setIsTrustedFeatureEnabled(enabled);
  }, []);

  // -------------------------------------------------------------------------
  // Contacts (Max 1 contact allowed)
  // -------------------------------------------------------------------------
  const loadContacts = useCallback(async (userId: number) => {
    setIsLoadingContacts(true);
    try {
      const contacts = await GuardianService.getTrustedContacts(userId);
      // Ensure only maximum 1 contact is retained
      setTrustedContacts(contacts.slice(0, 1));
    } finally {
      setIsLoadingContacts(false);
    }
  }, []);

  const addContact = useCallback(
    async (
      userId: number,
      contact: Omit<TrustedContact, "id" | "addedAt">
    ): Promise<{ success: boolean; error?: string }> => {
      if (trustedContacts.length >= 1) {
        return {
          success: false,
          error: "You can only have one trusted contact at a time. Please remove the existing contact first.",
        };
      }
      const res = await GuardianService.addTrustedContact(userId, contact);
      if (res.success && res.contact) {
        setTrustedContacts([res.contact!]);
        return { success: true };
      }
      return { success: false, error: res.error || "Failed to save contact." };
    },
    [trustedContacts]
  );

  const removeContact = useCallback(async (userId: number, contactId: string) => {
    await GuardianService.removeTrustedContact(userId, contactId);
    setTrustedContacts((prev) => prev.filter((c) => c.id !== contactId));

    // If a guardian request is still pending, cancel it safely — the removed
    // contact was acting as guardian and can no longer approve/reject.
    if (activeRequest && activeRequest.status === "PENDING" && !resolvedRef.current) {
      resolvedRef.current = true;
      clearTimers();
      setActiveRequest((prev) =>
        prev ? { ...prev, status: "EXPIRED", resolvedAt: Date.now() } : null
      );
      setPendingRequests((prev) =>
        prev.map((r) =>
          r.status === "PENDING"
            ? { ...r, status: "EXPIRED", resolvedAt: Date.now() }
            : r
        )
      );
      setPaymentOutcome("EXPIRED");
      setNotificationBadge(0);
      setApprovalCard(null);
      setCountdown(60);
    }
  }, [clearTimers, activeRequest]);

  // -------------------------------------------------------------------------
  // Initiate guardian request (called by MAIN USER on HIGH-RISK confirm)
  // -------------------------------------------------------------------------
  const initiateGuardianRequest = useCallback(
    (tx: UserTransaction) => {
      // If there's already an active request, don't create another
      if (activeRequest && activeRequest.status === "PENDING") return;

      clearTimers();
      resolvedRef.current = false;

      const now = Date.now();
      const request: GuardianRequest = {
        id: `greq-${now}`,
        transactionId: tx.id,
        merchant: tx.merchant,
        amount: tx.amount,
        paymentMethod: tx.paymentMethod,
        riskScore: tx.riskScore ?? 75,
        riskLevel: tx.riskLevel ?? "HIGH",
        reasons: tx.reasons,
        status: "PENDING",
        createdAt: now,
        expiresAt: now + 60000,
      };

      setActiveRequest(request);
      setPendingRequests((prev) => [request, ...prev]);
      setCountdown(60);
      setPaymentOutcome(null);

      // Show notification badge on guardian's bell
      setNotificationBadge(1);

      // Vibrate 5 times (200ms on, 200ms off pattern × 5)
      Vibration.vibrate([0, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200]);

      // Start 1-second countdown interval
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current!);
            countdownIntervalRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Auto-expire after exactly 60 seconds
      expiryTimeoutRef.current = setTimeout(() => {
        if (resolvedRef.current) return; // already resolved — do nothing
        resolvedRef.current = true;

        setActiveRequest((prev) =>
          prev ? { ...prev, status: "EXPIRED", resolvedAt: Date.now() } : null
        );
        setPendingRequests((prev) =>
          prev.map((r) =>
            r.id === request.id
              ? { ...r, status: "EXPIRED", resolvedAt: Date.now() }
              : r
          )
        );
        PaymentService.updateTransactionStatus(request.transactionId, "Blocked");
        setPaymentOutcome("EXPIRED");
        setNotificationBadge(0);
        setApprovalCard(null);
        clearTimers();
      }, 60000);
    },
    [activeRequest, clearTimers]
  );

  // -------------------------------------------------------------------------
  // Respond to guardian request (called by GUARDIAN via approval card)
  // -------------------------------------------------------------------------
  const respondToRequest = useCallback(
    (requestId: string, decision: "APPROVED" | "REJECTED") => {
      if (resolvedRef.current) return; // prevent double-action
      resolvedRef.current = true;

      clearTimers();

      const finalStatus: GuardianStatus = decision;

      setActiveRequest((prev) => {
        if (prev && prev.id === requestId) {
          const updated = { ...prev, status: finalStatus, resolvedAt: Date.now() };
          PaymentService.updateTransactionStatus(
            updated.transactionId,
            decision === "APPROVED" ? "Approved by you" : "Blocked"
          );
          return updated;
        }
        return prev;
      });

      setPendingRequests((prev) =>
        prev.map((r) =>
          r.id === requestId ? { ...r, status: finalStatus, resolvedAt: Date.now() } : r
        )
      );
      setPaymentOutcome(decision);
      setNotificationBadge(0);
      setApprovalCard(null);
    },
    [clearTimers]
  );

  const clearPaymentOutcome = useCallback(() => {
    setPaymentOutcome(null);
    setActiveRequest(null);
    setPendingRequests([]);
    setCountdown(60);
    resolvedRef.current = false;
  }, []);

  // -------------------------------------------------------------------------
  // Notification & approval card
  // -------------------------------------------------------------------------
  const clearNotificationBadge = useCallback(() => setNotificationBadge(0), []);

  const openApprovalCard = useCallback((request: GuardianRequest) => {
    setApprovalCard(request);
    setNotificationBadge(0);
  }, []);

  const closeApprovalCard = useCallback(() => {
    setApprovalCard(null);
  }, []);

  return (
    <GuardianContext.Provider
      value={{
        trustedContacts,
        isLoadingContacts,
        loadContacts,
        addContact,
        removeContact,
        isTrustedFeatureEnabled,
        toggleTrustedFeature,
        setTrustedFeatureEnabled,
        activeRequest,
        pendingRequests,
        countdown,
        paymentOutcome,
        initiateGuardianRequest,
        respondToRequest,
        clearPaymentOutcome,
        notificationBadge,
        clearNotificationBadge,
        approvalCard,
        openApprovalCard,
        closeApprovalCard,
      }}
    >
      {children}
    </GuardianContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export const useGuardian = (): GuardianContextType => useContext(GuardianContext);
