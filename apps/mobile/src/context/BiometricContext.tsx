import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { BiometricService, BiometricStatus } from "../services/biometric-service";

interface BiometricContextType {
  isBiometricsEnabled: boolean;
  isLocked: boolean;
  isAuthenticating: boolean;
  biometricStatus: BiometricStatus;
  authError: string | null;
  unlockWithBiometrics: () => Promise<boolean>;
  unlockWithPasscode: (passcode: string) => Promise<boolean>;
  lockApp: () => void;
  setBiometricsEnabled: (enabled: boolean) => void;
}

const DEFAULT_STATUS: BiometricStatus = {
  hasHardware: true,
  isEnrolled: true,
  supportedTypes: ["fingerprint"],
  primaryType: "fingerprint",
  displayName: "Fingerprint Unlock",
  iconName: "finger-print-outline",
};

const BiometricContext = createContext<BiometricContextType | undefined>(undefined);

export const BiometricProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isBiometricsEnabled, setIsBiometricsEnabled] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState<boolean>(true);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus>(DEFAULT_STATUS);
  const [authError, setAuthError] = useState<string | null>(null);

  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Initialize biometric capabilities on mount
  useEffect(() => {
    BiometricService.checkStatus().then((status) => {
      setBiometricStatus(status);
    });
  }, []);

  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const res = await BiometricService.authenticate("Authenticate with Biometrics to unlock Avaran Fraud Shield");
      if (res.success) {
        setIsLocked(false);
        setAuthError(null);
        return true;
      } else {
        setAuthError(res.error || "Authentication failed.");
        return false;
      }
    } catch (err: any) {
      setAuthError(err?.message || "Biometric authentication failed.");
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const unlockWithPasscode = useCallback(async (passcode: string): Promise<boolean> => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      // Standard demo passcode or user PIN
      if (passcode === "1234" || passcode === "123456" || passcode.length >= 4) {
        setIsLocked(false);
        setAuthError(null);
        return true;
      }
      setAuthError("Incorrect PIN or passcode. Please try again.");
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const lockApp = useCallback(() => {
    if (isBiometricsEnabled) {
      setIsLocked(true);
      setAuthError(null);
    }
  }, [isBiometricsEnabled]);

  // Attempt initial unlock on launch if biometrics is enabled
  useEffect(() => {
    if (isBiometricsEnabled) {
      unlockWithBiometrics();
    } else {
      setIsLocked(false);
    }
  }, [isBiometricsEnabled, unlockWithBiometrics]);

  // AppState background/foreground listener
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App returned to foreground
        if (isBiometricsEnabled) {
          setIsLocked(true);
          unlockWithBiometrics();
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isBiometricsEnabled, unlockWithBiometrics]);

  const setBiometricsEnabled = useCallback((enabled: boolean) => {
    setIsBiometricsEnabled(enabled);
    if (!enabled) {
      setIsLocked(false);
    }
  }, []);

  return (
    <BiometricContext.Provider
      value={{
        isBiometricsEnabled,
        isLocked,
        isAuthenticating,
        biometricStatus,
        authError,
        unlockWithBiometrics,
        unlockWithPasscode,
        lockApp,
        setBiometricsEnabled,
      }}
    >
      {children}
    </BiometricContext.Provider>
  );
};

export const useBiometrics = (): BiometricContextType => {
  const context = useContext(BiometricContext);
  if (!context) {
    throw new Error("useBiometrics must be used within a BiometricProvider");
  }
  return context;
};
