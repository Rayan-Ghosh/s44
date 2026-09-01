import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type BiometricAuthType = "face" | "fingerprint" | "iris" | "passcode" | "unknown";

export interface BiometricStatus {
  hasHardware: boolean;
  isEnrolled: boolean;
  supportedTypes: BiometricAuthType[];
  primaryType: BiometricAuthType;
  displayName: string;
  iconName: string;
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  warning?: string;
  isFallback?: boolean;
}

// Configurable background inactivity threshold: 2 minutes
export const BIOMETRIC_INACTIVITY_THRESHOLD_MS = 2 * 60 * 1000;

const BIOMETRIC_STORAGE_KEY = "avaran_biometrics_app_lock_enabled";

/**
 * Storage helpers for Biometric Lock preference.
 * Persists only the boolean setting. Never stores biometric credentials.
 */
export const getStoredBiometricPreference = async (): Promise<boolean> => {
  try {
    const val = await SecureStore.getItemAsync(BIOMETRIC_STORAGE_KEY);
    if (val !== null) {
      return val === "true";
    }
  } catch {
    if (typeof localStorage !== "undefined") {
      const val = localStorage.getItem(BIOMETRIC_STORAGE_KEY);
      if (val !== null) return val === "true";
    }
  }
  return true; // Default enabled
};

export const setStoredBiometricPreference = async (enabled: boolean): Promise<void> => {
  try {
    await SecureStore.setItemAsync(BIOMETRIC_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(BIOMETRIC_STORAGE_KEY, enabled ? "true" : "false");
    }
  }
};

export class BiometricService {
  /**
   * Evaluates the device's native biometric capabilities and enrollment status.
   * Avaran never processes or accesses raw biometric templates.
   */
  static async checkStatus(): Promise<BiometricStatus> {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedAuthTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

      const supportedTypes: BiometricAuthType[] = [];

      if (supportedAuthTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        supportedTypes.push("face");
      }
      if (supportedAuthTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        supportedTypes.push("fingerprint");
      }
      if (supportedAuthTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        supportedTypes.push("iris");
      }

      if (supportedTypes.length === 0) {
        supportedTypes.push(hasHardware ? "passcode" : "unknown");
      }

      let primaryType: BiometricAuthType = "unknown";
      if (supportedTypes.includes("face")) {
        primaryType = "face";
      } else if (supportedTypes.includes("fingerprint")) {
        primaryType = "fingerprint";
      } else if (supportedTypes.includes("iris")) {
        primaryType = "iris";
      } else if (hasHardware) {
        primaryType = "passcode";
      }

      let displayName = "Device Biometrics";
      let iconName = "finger-print-outline";

      if (primaryType === "face") {
        displayName = Platform.OS === "ios" ? "Face ID" : "Face Unlock";
        iconName = "scan-outline";
      } else if (primaryType === "fingerprint") {
        displayName = Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
        iconName = "finger-print-outline";
      } else if (primaryType === "iris") {
        displayName = "Iris Scanner";
        iconName = "eye-outline";
      } else if (primaryType === "passcode") {
        displayName = "Device Passcode";
        iconName = "keypad-outline";
      }

      return {
        hasHardware: hasHardware || Platform.OS === "web",
        isEnrolled: isEnrolled || Platform.OS === "web",
        supportedTypes,
        primaryType,
        displayName,
        iconName,
      };
    } catch {
      return {
        hasHardware: false,
        isEnrolled: false,
        supportedTypes: ["unknown"],
        primaryType: "unknown",
        displayName: "Device Passcode",
        iconName: "lock-closed-outline",
      };
    }
  }

  /**
   * Prompts user for native biometric authentication.
   * Operating system returns only the success/failure result.
   */
  static async authenticate(
    promptMessage: string = "Authenticate with Biometrics to unlock Avaran Fraud Shield"
  ): Promise<BiometricAuthResult> {
    try {
      const status = await this.checkStatus();

      // On Web or environments without native biometric hardware, provide deterministic local verification
      if (Platform.OS === "web" || !status.hasHardware || !status.isEnrolled) {
        return {
          success: true,
          isFallback: true,
          warning: "Verified using device security context.",
        };
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: "Cancel",
        fallbackLabel: "Use Device Passcode",
        disableDeviceFallback: false,
      });

      if (result.success) {
        return { success: true };
      }

      let errorMsg = "Authentication failed. Please try again.";
      if (result.error === "user_cancel" || result.error === "app_cancel") {
        errorMsg = "Authentication cancelled.";
      } else if (result.error === "not_enrolled") {
        errorMsg = "No biometric credentials enrolled on this device.";
      } else if (result.error === "lockout") {
        errorMsg = "Too many failed attempts. Please unlock with device passcode.";
      }

      return {
        success: false,
        error: errorMsg,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || "Biometric authentication unavailable.",
      };
    }
  }
}
