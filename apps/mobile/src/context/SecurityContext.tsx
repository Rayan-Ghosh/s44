import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { PaymentRiskEvaluation, FinalOutcome, TransactionInput } from "../types/transaction";
import { CallSnapshot } from "../types/voice";
import { SecurityAlert } from "../types/alert";
import { HistoryItem } from "../types/history";
import { TransactionService, DEFAULT_HELD_PAYMENT } from "../services/transaction-service";
import { VoiceService } from "../services/voice-service";
import { AlertsService, INITIAL_ALERTS } from "../services/alerts-service";
import { HistoryService, INITIAL_HISTORY } from "../services/history-service";
import { RiskService } from "../services/risk-service";
import { PaymentService } from "../services/payment-service";

interface SecurityContextType {
  protectionActive: boolean;
  toggleProtection: () => void;
  heldPayment: PaymentRiskEvaluation;
  setScenario: (amount: number, isNewRecipient: boolean, isNewDevice: boolean) => Promise<void>;
  submitPaymentDecision: (outcome: FinalOutcome) => Promise<void>;
  activeCall: CallSnapshot;
  isSimulatingCall: boolean;
  startCallSimulation: () => void;
  advanceCallSimulation: () => void;
  dismissCallAlert: () => void;
  endCallSimulation: () => void;
  reportCallScam: () => void;
  alerts: SecurityAlert[];
  markAlertRead: (id: string) => void;
  history: HistoryItem[];
  runFullProtectionDemo: (onNavigateToPayment?: () => void) => Promise<void>;
  resetDemo: () => void;
  isDemoRunning: boolean;
  demoStepIndex: number;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [protectionActive, setProtectionActive] = useState<boolean>(true);
  const [heldPayment, setHeldPayment] = useState<PaymentRiskEvaluation>({
    transaction: DEFAULT_HELD_PAYMENT,
    risk: {
      riskScore: 88,
      riskLevel: "HIGH",
      decision: "CONFIRM_OR_CANCEL",
      detectors: [],
      reasons: [],
      contributionsPct: {},
    },
    outcome: "pending",
    evaluatedAt: new Date().toISOString(),
  });

  const [activeCall, setActiveCall] = useState<CallSnapshot>(VoiceService.getInitialSnapshot());
  const [isSimulatingCall, setIsSimulatingCall] = useState<boolean>(false);
  const [callStep, setCallStep] = useState<number>(0);
  const [alerts, setAlerts] = useState<SecurityAlert[]>(INITIAL_ALERTS);
  const [history, setHistory] = useState<HistoryItem[]>(INITIAL_HISTORY);
  const [isDemoRunning, setIsDemoRunning] = useState<boolean>(false);
  const [demoStepIndex, setDemoStepIndex] = useState<number>(0);

  // Initialize payment evaluation on mount
  useEffect(() => {
    TransactionService.getHeldPayment().then(setHeldPayment);
  }, []);

  const toggleProtection = useCallback(() => {
    setProtectionActive((prev) => !prev);
  }, []);

  const setScenario = useCallback(async (amount: number, isNewRecipient: boolean, isNewDevice: boolean) => {
    const tx: TransactionInput = {
      id: Date.now(),
      amount,
      recipientName: isNewRecipient ? "Unknown Merchant" : "Rohit Verma",
      recipientHandle: isNewRecipient ? "newmerchant@upi" : "rohit.verma@okaxis",
      isNewRecipient,
      deviceLabel: isNewDevice ? "OnePlus 11 (Unrecognized)" : "Pixel 8 Pro (Primary)",
      isNewDevice,
      location: isNewDevice ? "New Delhi, India" : "Bengaluru, India",
      paymentMethod: "UPI FastPay",
      timestamp: new Date().toISOString(),
    };
    const risk = await RiskService.evaluateTransactionRisk(tx);
    setHeldPayment({
      transaction: tx,
      risk,
      outcome: "pending",
      evaluatedAt: new Date().toISOString(),
    });

    // Synchronize into shared central PaymentService
    PaymentService.addTransaction({
      id: String(tx.id),
      title: tx.recipientName,
      merchant: tx.recipientName,
      amount: tx.amount,
      date: "Today · Just now",
      timestamp: tx.timestamp,
      paymentMethod: tx.paymentMethod,
      status: risk.riskLevel === "HIGH" ? "Risk detected" : "Safe",
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore,
      riskFactors: risk.reasons.map((r, i) => ({
        factor_type: "transaction",
        factor_name: `factor_${i}`,
        contribution: Math.round(100 / (risk.reasons.length || 1)),
        explanation: r,
      })),
      reasons: risk.reasons,
    });
  }, []);

  const submitPaymentDecision = useCallback(
    async (outcome: FinalOutcome) => {
      setHeldPayment((prev) => ({
        ...prev,
        outcome,
      }));

      const txIdStr = String(heldPayment.transaction.id);
      if (outcome === "confirmed") {
        PaymentService.confirmTransaction(txIdStr);
      } else if (outcome === "cancelled") {
        PaymentService.cancelTransaction(txIdStr);
      } else if (outcome === "reported") {
        PaymentService.reportTransaction(txIdStr);
      }

      // Add to History
      const newHistoryItem: HistoryItem = {
        id: `payment-${Date.now()}`,
        type: "payment",
        amount: heldPayment.transaction.amount,
        recipientName: heldPayment.transaction.recipientName,
        recipientHandle: heldPayment.transaction.recipientHandle,
        timestamp: new Date().toISOString(),
        formattedTime: "Just now",
        riskScore: heldPayment.risk.riskScore,
        riskLevel: heldPayment.risk.riskLevel,
        status:
          outcome === "confirmed"
            ? "Approved by User"
            : outcome === "cancelled"
            ? "Cancelled"
            : outcome === "reported"
            ? "Reported & Blocked"
            : "Pending",
        actionTaken: outcome as any,
      };
      setHistory((prev) => [newHistoryItem, ...prev]);

      // If reported or cancelled, generate alert
      if (outcome === "reported" || outcome === "cancelled") {
        const newAlert: SecurityAlert = {
          id: `alert-${Date.now()}`,
          category: "payment",
          severity: heldPayment.risk.riskLevel,
          title: outcome === "reported" ? "Fraudulent payment blocked & reported" : "Suspicious payment cancelled",
          description: `₹${heldPayment.transaction.amount.toLocaleString("en-IN")} to ${heldPayment.transaction.recipientHandle}`,
          amount: `₹${heldPayment.transaction.amount.toLocaleString("en-IN")}`,
          timestamp: "Just now",
          isRead: false,
          whatHappened: `You decided to ${outcome} payment to ${heldPayment.transaction.recipientName}.`,
          whyFlagged: heldPayment.risk.reasons,
          whatYouShouldDo: [
            "Your bank's fraud monitoring unit has logged this incident.",
            "Funds remain secure in your primary account.",
          ],
        };
        setAlerts((prev) => [newAlert, ...prev]);
      }
    },
    [heldPayment]
  );

  const startCallSimulation = useCallback(() => {
    setIsSimulatingCall(true);
    setCallStep(1);
    setActiveCall(VoiceService.getActiveCallSnapshot(1));
  }, []);

  const advanceCallSimulation = useCallback(() => {
    setCallStep((prev) => {
      const next = Math.min(prev + 1, 4);
      setActiveCall(VoiceService.getActiveCallSnapshot(next));
      return next;
    });
  }, []);

  const dismissCallAlert = useCallback(() => {
    setActiveCall((prev) => ({
      ...prev,
      alert: {
        ...prev.alert,
        triggered: false,
      },
    }));
  }, []);

  const endCallSimulation = useCallback(() => {
    setIsSimulatingCall(false);
    setActiveCall((prev) => ({
      ...prev,
      status: "disconnected",
    }));

    const newCallHistory: HistoryItem = {
      id: `call-${Date.now()}`,
      type: "call",
      callerName: activeCall.caller.displayName,
      callerNumber: activeCall.caller.phoneNumber,
      durationSec: activeCall.durationSec || 32,
      timestamp: new Date().toISOString(),
      formattedTime: "Just now",
      riskScore: activeCall.riskScore,
      riskLevel: activeCall.riskLevel,
      status: "Call Ended",
      detectedPattern: activeCall.detectedPatterns.join(", ") || "Standard Call",
      actionTaken: "ended",
    };
    setHistory((prev) => [newCallHistory, ...prev]);
  }, [activeCall]);

  const reportCallScam = useCallback(() => {
    setIsSimulatingCall(false);
    setActiveCall((prev) => ({
      ...prev,
      status: "disconnected",
    }));

    const newCallHistory: HistoryItem = {
      id: `call-${Date.now()}`,
      type: "call",
      callerName: activeCall.caller.displayName,
      callerNumber: activeCall.caller.phoneNumber,
      durationSec: activeCall.durationSec || 45,
      timestamp: new Date().toISOString(),
      formattedTime: "Just now",
      riskScore: 91,
      riskLevel: "HIGH",
      status: "Scam Intercepted & Reported",
      detectedPattern: "Authority Impersonation, Remote Access & OTP Solicitation",
      actionTaken: "reported",
    };
    setHistory((prev) => [newCallHistory, ...prev]);

    const newAlert: SecurityAlert = {
      id: `alert-call-${Date.now()}`,
      category: "voice",
      severity: "HIGH",
      title: "Voice Phishing Scam Intercepted",
      description: `Reported scam call from ${activeCall.caller.phoneNumber}`,
      timestamp: "Just now",
      isRead: false,
      whatHappened: "A voice social engineering call attempted to solicit credentials and remote desktop access.",
      whyFlagged: [
        "Matched high-threat police impersonation script",
        "Demanded AnyDesk installation",
        "Attempted OTP interception",
      ],
      whatYouShouldDo: [
        "Scammer phone number has been blacklisted on Avaran network",
        "No OTP was compromised",
      ],
    };
    setAlerts((prev) => [newAlert, ...prev]);
  }, [activeCall]);

  const markAlertRead = useCallback((id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isRead: true } : a))
    );
  }, []);

  const runFullProtectionDemo = useCallback(
    async (onNavigateToPayment?: () => void) => {
      setIsDemoRunning(true);
      setDemoStepIndex(1);

      // Step 1: Start call simulation
      setIsSimulatingCall(true);
      setCallStep(1);
      setActiveCall(VoiceService.getActiveCallSnapshot(1));

      await new Promise((resolve) => setTimeout(resolve, 2000));
      setDemoStepIndex(2);
      setCallStep(2);
      setActiveCall(VoiceService.getActiveCallSnapshot(2));

      await new Promise((resolve) => setTimeout(resolve, 2500));
      setDemoStepIndex(3);
      setCallStep(4);
      setActiveCall(VoiceService.getActiveCallSnapshot(4));

      await new Promise((resolve) => setTimeout(resolve, 2500));
      // Intercept payment
      setDemoStepIndex(4);
      await setScenario(49000, true, true);
      if (onNavigateToPayment) {
        onNavigateToPayment();
      }
      setIsDemoRunning(false);
    },
    [setScenario]
  );

  const resetDemo = useCallback(() => {
    setProtectionActive(true);
    setIsSimulatingCall(false);
    setCallStep(0);
    setActiveCall(VoiceService.getInitialSnapshot());
    setAlerts(INITIAL_ALERTS);
    setHistory(INITIAL_HISTORY);
    setIsDemoRunning(false);
    setDemoStepIndex(0);
    TransactionService.getHeldPayment().then(setHeldPayment);
  }, []);

  return (
    <SecurityContext.Provider
      value={{
        protectionActive,
        toggleProtection,
        heldPayment,
        setScenario,
        submitPaymentDecision,
        activeCall,
        isSimulatingCall,
        startCallSimulation,
        advanceCallSimulation,
        dismissCallAlert,
        endCallSimulation,
        reportCallScam,
        alerts,
        markAlertRead,
        history,
        runFullProtectionDemo,
        resetDemo,
        isDemoRunning,
        demoStepIndex,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
};

export const useSecurity = (): SecurityContextType => {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error("useSecurity must be used within a SecurityProvider");
  }
  return context;
};
