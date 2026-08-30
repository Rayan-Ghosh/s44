import { NativeModules, Platform } from "react-native";

/**
 * Bridges to CallGuardModule.kt (apps/mobile/android/.../telemetry/), which
 * starts/stops LiveCallAudioService's real on-device speech detection —
 * live speech -> Android's SpeechRecognizer -> apps/api's real classifier
 * -> FraudOverlayManager. Android-only: there's no iOS/web implementation
 * of this native module, so every export here safely no-ops elsewhere.
 *
 * Deliberately manual (a button, not automatic-on-call-answer): confirmed
 * via live device testing that SpeechRecognizer only gets genuine
 * microphone access while the app is foregrounded — the exact condition
 * that's true whenever a user could actually tap this button.
 */
const { CallGuardModule } = NativeModules as {
  CallGuardModule?: {
    startDetection(): Promise<boolean>;
    stopDetection(): Promise<boolean>;
  };
};

export const isCallGuardAvailable = (): boolean =>
  Platform.OS === "android" && !!CallGuardModule;

export const startCallDetection = async (): Promise<{ success: boolean; error?: string }> => {
  if (!isCallGuardAvailable()) {
    return { success: false, error: "Live call detection is only available on Android." };
  }
  try {
    await CallGuardModule!.startDetection();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "Unable to start call detection." };
  }
};

export const stopCallDetection = async (): Promise<{ success: boolean; error?: string }> => {
  if (!isCallGuardAvailable()) {
    return { success: false, error: "Live call detection is only available on Android." };
  }
  try {
    await CallGuardModule!.stopDetection();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "Unable to stop call detection." };
  }
};
