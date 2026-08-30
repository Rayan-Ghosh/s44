import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { CallSnapshot } from "../types/voice";
import { SecurityAlert } from "../types/alert";
import { HistoryItem } from "../types/history";
import { VoiceService } from "../services/voice-service";
import { AlertsService } from "../services/alerts-service";
import { INITIAL_HISTORY } from "../services/history-service";
import { useAuth } from "./AuthContext";

interface SecurityContextType {
  protectionActive: boolean;
  toggleProtection: () => void;
  activeCall: CallSnapshot;
  isSimulatingCall: boolean;
  startCallSimulation: () => void;
  advanceCallSimulation: () => Promise<void>;
  dismissCallAlert: () => void;
  endCallSimulation: () => void;
  reportCallScam: () => void;
  alerts: SecurityAlert[];
  markAlertRead: (id: string) => void;
  history: HistoryItem[];
  resetDemo: () => void;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const [protectionActive, setProtectionActive] = useState<boolean>(true);

  const [activeCall, setActiveCall] = useState<CallSnapshot>(VoiceService.getInitialSnapshot());
  const [isSimulatingCall, setIsSimulatingCall] = useState<boolean>(false);
  const [callStep, setCallStep] = useState<number>(0);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  // history-service.ts is out of scope for the backend-wiring pass (no
  // matching backend endpoint exists yet) — it keeps its static seed data.
  const [history, setHistory] = useState<HistoryItem[]>(INITIAL_HISTORY);

  useEffect(() => {
    if (!session?.userId) return;
    AlertsService.getAlerts(session.userId).then(setAlerts);
  }, [session?.userId]);

  const toggleProtection = useCallback(() => {
    setProtectionActive((prev) => !prev);
  }, []);

  const startCallSimulation = useCallback(() => {
    setIsSimulatingCall(true);
    setCallStep(1);
    VoiceService.resetSession();
    VoiceService.getActiveCallSnapshot(1).then(setActiveCall);
  }, []);

  const advanceCallSimulation = useCallback(async () => {
    const next = Math.min(callStep + 1, 4);
    setCallStep(next);
    const snapshot = await VoiceService.getActiveCallSnapshot(next);
    setActiveCall(snapshot);
  }, [callStep]);

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
    VoiceService.resetSession();
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
    VoiceService.resetSession();
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
      riskScore: activeCall.riskScore,
      riskLevel: activeCall.riskLevel,
      status: "Scam Intercepted & Reported",
      detectedPattern: activeCall.detectedPatterns.join(", ") || "Social Engineering",
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
      whyFlagged: activeCall.reasons,
      whatYouShouldDo: [
        "Scammer phone number has been blacklisted on Avaran network",
        "No OTP was compromised",
      ],
    };
    setAlerts((prev) => [newAlert, ...prev]);
  }, [activeCall]);

  const markAlertRead = useCallback((id: string) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
  }, []);

  const resetDemo = useCallback(() => {
    setProtectionActive(true);
    setIsSimulatingCall(false);
    setCallStep(0);
    VoiceService.resetSession();
    setActiveCall(VoiceService.getInitialSnapshot());
    setHistory(INITIAL_HISTORY);
    if (session?.userId) {
      AlertsService.getAlerts(session.userId).then(setAlerts);
    }
  }, [session?.userId]);

  return (
    <SecurityContext.Provider
      value={{
        protectionActive,
        toggleProtection,
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
        resetDemo,
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
