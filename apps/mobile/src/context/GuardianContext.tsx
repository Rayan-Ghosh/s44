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
import { GuardianService, GuardianRequestDto } from "../services/guardian-service";
import { PaymentService, UserTransaction } from "../services/payment-service";
import { useAuth } from "./AuthContext";

// A 2-minute hold, matching the backend's real expiry (spec §6.3) — the UI
// previously used a hardcoded 60s that didn't match what the server actually
// enforced.
const HOLD_SECONDS = 120;
const POLL_INTERVAL_MS = 3000;

const toGuardianRequest = (
  dto: GuardianRequestDto,
  fallback?: Partial<Pick<GuardianRequest, "merchant" | "paymentMethod" | "riskLevel">>
): GuardianRequest => ({
  id: String(dto.id),
  transactionId: String(dto.transactionId),
  merchant: fallback?.merchant || "Recipient",
  amount: dto.transactionAmount,
  paymentMethod: fallback?.paymentMethod || "UPI",
  riskScore: dto.riskScore ?? 75,
  riskLevel: fallback?.riskLevel || (dto.riskScore && dto.riskScore >= 75 ? "HIGH" : "MEDIUM"),
  reasons: dto.riskReasons,
  status: (dto.outcome || "PENDING") as GuardianStatus,
  createdAt: new Date(dto.requestedAt).getTime(),
  expiresAt: new Date(dto.expiresAt).getTime(),
  resolvedAt: dto.resolvedAt ? new Date(dto.resolvedAt).getTime() : undefined,
});

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------
interface GuardianContextType {
  trustedContacts: TrustedContact[];
  isLoadingContacts: boolean;
  loadContacts: (userId: number) => Promise<void>;
  addContact: (
    userId: number,
    contact: Omit<TrustedContact, "id" | "addedAt">
  ) => Promise<{ success: boolean; error?: string }>;
  removeContact: (userId: number, contactId: string) => Promise<void>;

  isTrustedFeatureEnabled: boolean;
  toggleTrustedFeature: () => boolean;
  setTrustedFeatureEnabled: (enabled: boolean) => void;

  activeRequest: GuardianRequest | null;
  pendingRequests: GuardianRequest[];
  countdown: number;
  paymentOutcome: "APPROVED" | "REJECTED" | "EXPIRED" | null;

  initiateGuardianRequest: (tx: UserTransaction) => Promise<void>;
  respondToRequest: (requestId: string, decision: "APPROVED" | "REJECTED") => Promise<void>;
  clearPaymentOutcome: () => void;

  notificationBadge: number;
  clearNotificationBadge: () => void;

  approvalCard: GuardianRequest | null;
  openApprovalCard: (request: GuardianRequest) => void;
  closeApprovalCard: () => void;
}

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
  countdown: HOLD_SECONDS,
  paymentOutcome: null,
  initiateGuardianRequest: async () => {},
  respondToRequest: async () => {},
  clearPaymentOutcome: () => {},
  notificationBadge: 0,
  clearNotificationBadge: () => {},
  approvalCard: null,
  openApprovalCard: () => {},
  closeApprovalCard: () => {},
});

export const GuardianProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [isTrustedFeatureEnabled, setIsTrustedFeatureEnabled] = useState<boolean>(true);

  const [activeRequest, setActiveRequest] = useState<GuardianRequest | null>(null);
  const [pendingRequests, setPendingRequests] = useState<GuardianRequest[]>([]);
  const [countdown, setCountdown] = useState(HOLD_SECONDS);
  const [paymentOutcome, setPaymentOutcome] = useState<"APPROVED" | "REJECTED" | "EXPIRED" | null>(null);

  const [notificationBadge, setNotificationBadge] = useState(0);
  const [approvalCard, setApprovalCard] = useState<GuardianRequest | null>(null);

  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolvedRef = useRef<boolean>(false);
  const seenPendingIdsRef = useRef<Set<string>>(new Set());

  const clearTimers = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (activePollRef.current) {
      clearInterval(activePollRef.current);
      activePollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      if (pendingPollRef.current) clearInterval(pendingPollRef.current);
    };
  }, [clearTimers]);

  // -------------------------------------------------------------------------
  // Poll for pending requests visible to this user's own trusted contact
  // (the demo runs both "sender" and "guardian" roles on one device — a real
  // multi-device guardian would poll this same endpoint from their own app).
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (pendingPollRef.current) {
      clearInterval(pendingPollRef.current);
      pendingPollRef.current = null;
    }
    const contactId = trustedContacts[0]?.id ? parseInt(trustedContacts[0].id, 10) : null;
    if (!contactId || !isTrustedFeatureEnabled) {
      setPendingRequests([]);
      return;
    }

    const poll = async () => {
      const dtos = await GuardianService.getPendingRequests(contactId);
      const mapped = dtos.map((d) => toGuardianRequest(d));
      const newOnes = mapped.filter((r) => !seenPendingIdsRef.current.has(r.id));
      if (newOnes.length > 0) {
        Vibration.vibrate([0, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200]);
        setNotificationBadge((prev) => prev + newOnes.length);
      }
      mapped.forEach((r) => seenPendingIdsRef.current.add(r.id));
      setPendingRequests(mapped);
    };

    poll();
    pendingPollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pendingPollRef.current) {
        clearInterval(pendingPollRef.current);
        pendingPollRef.current = null;
      }
    };
  }, [trustedContacts, isTrustedFeatureEnabled]);

  const toggleTrustedFeature = useCallback(() => {
    let nextState = false;
    setIsTrustedFeatureEnabled((prev) => {
      nextState = !prev;
      return nextState;
    });

    if (activeRequest && activeRequest.status === "PENDING" && !resolvedRef.current) {
      resolvedRef.current = true;
      clearTimers();
      setActiveRequest((prev) => (prev ? { ...prev, status: "EXPIRED", resolvedAt: Date.now() } : null));
      setPaymentOutcome("EXPIRED");
      setNotificationBadge(0);
      setApprovalCard(null);
      setCountdown(HOLD_SECONDS);
    }

    return nextState;
  }, [activeRequest, clearTimers]);

  const setTrustedFeatureEnabled = useCallback((enabled: boolean) => {
    setIsTrustedFeatureEnabled(enabled);
  }, []);

  const loadContacts = useCallback(async (userId: number) => {
    setIsLoadingContacts(true);
    try {
      const contacts = await GuardianService.getTrustedContacts(userId);
      setTrustedContacts(contacts.slice(0, 1));
    } catch {
      setTrustedContacts([]);
    } finally {
      setIsLoadingContacts(false);
    }
  }, []);

  // Load once a session exists, regardless of which tab the user opens
  // first. Previously this only happened from TrustedScreen's own mount
  // effect — found live while testing: a HIGH-risk payment on Payments
  // silently skipped the Guardian hold entirely if the user hadn't visited
  // the Trusted tab yet in that session, even with a real saved contact,
  // because trustedContacts was still empty at decision time.
  const { session } = useAuth();
  useEffect(() => {
    if (session?.userId) {
      loadContacts(session.userId);
    }
  }, [session?.userId, loadContacts]);

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
    const res = await GuardianService.removeTrustedContact(userId, contactId);
    if (res.success) {
      setTrustedContacts((prev) => prev.filter((c) => c.id !== contactId));
    }

    if (activeRequest && activeRequest.status === "PENDING" && !resolvedRef.current) {
      resolvedRef.current = true;
      clearTimers();
      setActiveRequest((prev) => (prev ? { ...prev, status: "EXPIRED", resolvedAt: Date.now() } : null));
      setPaymentOutcome("EXPIRED");
      setNotificationBadge(0);
      setApprovalCard(null);
      setCountdown(HOLD_SECONDS);
    }
  }, [clearTimers, activeRequest]);

  // -------------------------------------------------------------------------
  // Initiate guardian request — real POST /api/v1/guardian/requests, then
  // poll the request's own status until it resolves or the hold expires.
  // -------------------------------------------------------------------------
  const initiateGuardianRequest = useCallback(
    async (tx: UserTransaction) => {
      if (activeRequest && activeRequest.status === "PENDING") return;

      clearTimers();
      resolvedRef.current = false;

      const txnId = parseInt(tx.id, 10);
      if (isNaN(txnId)) return;

      const contactId = trustedContacts[0]?.id ? parseInt(trustedContacts[0].id, 10) : undefined;
      const res = await GuardianService.createRequest(txnId, contactId);
      if (!res.success || !res.request) {
        setPaymentOutcome("EXPIRED");
        return;
      }

      const request = toGuardianRequest(res.request, {
        merchant: tx.merchant,
        paymentMethod: tx.paymentMethod,
        riskLevel: tx.riskLevel,
      });

      setActiveRequest(request);
      setCountdown(res.request.remainingSeconds || HOLD_SECONDS);
      setPaymentOutcome(null);
      setNotificationBadge((prev) => prev + 1);

      Vibration.vibrate([0, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200]);

      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
      }, 1000);

      // Poll the request's own status so an approval/rejection made from the
      // guardian side of the flow (or another device) is reflected here.
      activePollRef.current = setInterval(async () => {
        const latest = await GuardianService.getRequest(res.request!.id);
        if (!latest || resolvedRef.current) return;

        if (latest.outcome && latest.outcome !== "PENDING") {
          resolvedRef.current = true;
          clearTimers();
          const finalStatus: GuardianStatus = latest.outcome === "APPROVED" ? "APPROVED" : "REJECTED";
          setActiveRequest((prev) => (prev ? { ...prev, status: finalStatus, resolvedAt: Date.now() } : null));
          PaymentService.updateTransactionStatus(
            tx.id,
            latest.outcome === "APPROVED" ? "Approved by you" : "Blocked"
          );
          setPaymentOutcome(latest.outcome === "APPROVED" ? "APPROVED" : "REJECTED");
          setNotificationBadge(0);
          setApprovalCard(null);
          return;
        }

        if (latest.remainingSeconds <= 0) {
          resolvedRef.current = true;
          clearTimers();
          setActiveRequest((prev) => (prev ? { ...prev, status: "EXPIRED", resolvedAt: Date.now() } : null));
          PaymentService.updateTransactionStatus(tx.id, "Blocked");
          setPaymentOutcome("EXPIRED");
          setNotificationBadge(0);
          setApprovalCard(null);
        }
      }, POLL_INTERVAL_MS);
    },
    [activeRequest, clearTimers, trustedContacts]
  );

  // -------------------------------------------------------------------------
  // Respond to guardian request — real POST .../approve or .../reject.
  // -------------------------------------------------------------------------
  const respondToRequest = useCallback(
    async (requestId: string, decision: "APPROVED" | "REJECTED") => {
      const numId = parseInt(requestId, 10);
      if (isNaN(numId)) return;

      const res = decision === "APPROVED"
        ? await GuardianService.approve(numId)
        : await GuardianService.reject(numId);
      if (!res.success) return;

      if (!resolvedRef.current || activeRequest?.id === requestId) {
        resolvedRef.current = true;
        clearTimers();
        setActiveRequest((prev) =>
          prev && prev.id === requestId
            ? { ...prev, status: decision, resolvedAt: Date.now() }
            : prev
        );
        if (activeRequest?.id === requestId) {
          PaymentService.updateTransactionStatus(
            activeRequest.transactionId,
            decision === "APPROVED" ? "Approved by you" : "Blocked"
          );
          setPaymentOutcome(decision);
        }
      }

      setPendingRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: decision, resolvedAt: Date.now() } : r))
      );
      setNotificationBadge(0);
      setApprovalCard(null);
    },
    [activeRequest, clearTimers]
  );

  const clearPaymentOutcome = useCallback(() => {
    setPaymentOutcome(null);
    setActiveRequest(null);
    setCountdown(HOLD_SECONDS);
    resolvedRef.current = false;
  }, []);

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

export const useGuardian = (): GuardianContextType => useContext(GuardianContext);
