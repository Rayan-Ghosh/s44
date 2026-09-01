import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import {
  BiometricService,
  BiometricStatus,
  BIOMETRIC_INACTIVITY_THRESHOLD_MS,
  getStoredBiometricPreference,
  setStoredBiometricPreference,
} from "../services/biometric-service";

import { AppLockService } from "../services/app-lock-service";

interface BiometricContextType {
  isBiometricsEnabled: boolean;
  isLocked: boolean;
  isAuthenticating: boolean;
  isPinConfigured: boolean;
  biometricStatus: BiometricStatus;
  authError: string | null;
  unlockWithBiometrics: () => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<{ success: boolean; error?: string; lockoutRemainingSeconds?: number }>;
  setupPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
  removePin: () => Promise<void>;
  lockApp: () => void;
  unlockApp: () => void;
  toggleBiometricsWithAuth: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  requireBiometricAuth: (reason?: string) => Promise<boolean>;
  setBiometricsEnabled: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
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
  const [isBiometricsEnabled, setIsBiometricsEnabledState] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [isPinConfigured, setIsPinConfigured] = useState<boolean>(false);
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus>(DEFAULT_STATUS);
  const [authError, setAuthError] = useState<string | null>(null);

  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastBackgroundTimestamp = useRef<number | null>(null);
  const isInitialized = useRef<boolean>(false);

  // Initialize preference, PIN status, and device biometric capabilities on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const [savedPref, status, pinConfigured] = await Promise.all([
        getStoredBiometricPreference(),
        BiometricService.checkStatus(),
        AppLockService.isPinConfigured(),
      ]);
      if (!isMounted) return;

      setIsBiometricsEnabledState(savedPref);
      setBiometricStatus(status);
      setIsPinConfigured(pinConfigured);

      // If biometrics or PIN is configured, initiate locked state on cold start
      if (savedPref || pinConfigured) {
        setIsLocked(true);
        AppLockService.lockApplication();
        if (savedPref) {
          BiometricService.authenticate("Authenticate with Biometrics to unlock Avaran").then((res) => {
            if (isMounted) {
              if (res.success) {
                setIsLocked(false);
                AppLockService.unlockApplication();
                setAuthError(null);
              } else {
                setAuthError(res.error || null);
              }
            }
          });
        }
      }
      isInitialized.current = true;
    })();

    // Listen to AppLockService lock events
    const unsub = AppLockService.addLockStateListener((locked) => {
      if (isMounted) {
        setIsLocked(locked);
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const res = await BiometricService.authenticate("Authenticate with Biometrics to unlock Avaran");
      if (res.success) {
        setIsLocked(false);
        AppLockService.unlockApplication();
        setAuthError(null);
        return true;
      } else {
        setAuthError(res.error || "Authentication failed. Please try again.");
        return false;
      }
    } catch (err: any) {
      setAuthError(err?.message || "Biometric authentication failed.");
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const unlockWithPin = useCallback(
    async (pin: string): Promise<{ success: boolean; error?: string; lockoutRemainingSeconds?: number }> => {
      setIsAuthenticating(true);
      setAuthError(null);
      try {
        const res = await AppLockService.verifyPin(pin);
        if (res.success) {
          setIsLocked(false);
          AppLockService.unlockApplication();
          setAuthError(null);
          return { success: true };
        } else {
          setAuthError(res.error || "Incorrect PIN");
          return res;
        }
      } catch (err: any) {
        const errMsg = err?.message || "PIN verification failed.";
        setAuthError(errMsg);
        return { success: false, error: errMsg };
      } finally {
        setIsAuthenticating(false);
      }
    },
    []
  );

  const setupPin = useCallback(async (pin: string): Promise<{ success: boolean; error?: string }> => {
    const res = await AppLockService.setupPin(pin);
    if (res.success) {
      setIsPinConfigured(true);
    }
    return res;
  }, []);

  const removePin = useCallback(async (): Promise<void> => {
    await AppLockService.removePin();
    setIsPinConfigured(false);
  }, []);

  const lockApp = useCallback(() => {
    if (isBiometricsEnabled || isPinConfigured) {
      setIsLocked(true);
      AppLockService.lockApplication();
      setAuthError(null);
    }
  }, [isBiometricsEnabled, isPinConfigured]);

  const unlockApp = useCallback(() => {
    setIsLocked(false);
    AppLockService.unlockApplication();
    setAuthError(null);
  }, []);

  // AppState background/foreground inactivity listener
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (
        appState.current === "active" &&
        (nextAppState === "background" || nextAppState === "inactive")
      ) {
        // App went to background — record timestamp
        lastBackgroundTimestamp.current = Date.now();
      } else if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App returned to foreground — check inactivity duration
        if (lastBackgroundTimestamp.current !== null) {
          const elapsed = Date.now() - lastBackgroundTimestamp.current;
          lastBackgroundTimestamp.current = null;

          if ((isBiometricsEnabled || isPinConfigured) && elapsed >= BIOMETRIC_INACTIVITY_THRESHOLD_MS) {
            setIsLocked(true);
            AppLockService.lockApplication();
            setAuthError(null);
            if (isBiometricsEnabled) {
              unlockWithBiometrics();
            }
          }
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isBiometricsEnabled, isPinConfigured, unlockWithBiometrics]);

  /**
   * Verified toggle: requires native biometric authentication before enabling or disabling.
   */
  const toggleBiometricsWithAuth = useCallback(
    async (targetEnabled: boolean): Promise<{ success: boolean; error?: string }> => {
      setIsAuthenticating(true);
      try {
        const promptMsg = targetEnabled
          ? "Authenticate with Biometrics to enable App Lock"
          : "Authenticate with Biometrics to disable App Lock";

        const res = await BiometricService.authenticate(promptMsg);
        if (res.success) {
          setIsBiometricsEnabledState(targetEnabled);
          if (!targetEnabled && !isPinConfigured) {
            setIsLocked(false);
            AppLockService.unlockApplication();
          }
          await setStoredBiometricPreference(targetEnabled);
          return { success: true };
        }
        return {
          success: false,
          error: res.error || "Authentication required to modify Biometric App Lock.",
        };
      } finally {
        setIsAuthenticating(false);
      }
    },
    [isPinConfigured]
  );

  /**
   * Re-authenticates the user before executing high-security actions.
   */
  const requireBiometricAuth = useCallback(
    async (reason: string = "Authenticate to confirm sensitive action"): Promise<boolean> => {
      if (!isBiometricsEnabled) {
        return true;
      }
      const res = await BiometricService.authenticate(reason);
      return res.success;
    },
    [isBiometricsEnabled]
  );

  return (
    <BiometricContext.Provider
      value={{
        isBiometricsEnabled,
        isLocked,
        isAuthenticating,
        isPinConfigured,
        biometricStatus,
        authError,
        unlockWithBiometrics,
        unlockWithPin,
        setupPin,
        removePin,
        lockApp,
        unlockApp,
        toggleBiometricsWithAuth,
        requireBiometricAuth,
        setBiometricsEnabled: toggleBiometricsWithAuth,
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
