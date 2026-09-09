import { NativeModules, NativeEventEmitter, DeviceEventEmitter, PermissionsAndroid, Platform } from "react-native";

/**
 * Call guard native event types.
 *
 * Emitted by CallGuardModule / LiveCallAudioService on Android.
 * In non-Android or web environments, safe fallbacks are used.
 */
export type CallGuardEventType =
  | "call_started"
  | "call_stopped"
  | "audio_capture_started"
  | "audio_capture_stopped"
  | "audio_capture_unavailable"
  | "audio_capture_error"
  | "audio_buffer_ready";

export interface CallGuardBaseEvent {
  type: CallGuardEventType;
  timestamp: number;
  sessionId?: string;
}

export interface CallStartedEvent extends CallGuardBaseEvent {
  type: "call_started";
}

export interface CallStoppedEvent extends CallGuardBaseEvent {
  type: "call_stopped";
}

export interface AudioCaptureStartedEvent extends CallGuardBaseEvent {
  type: "audio_capture_started";
}

export interface AudioCaptureStoppedEvent extends CallGuardBaseEvent {
  type: "audio_capture_stopped";
}

export interface AudioCaptureUnavailableEvent extends CallGuardBaseEvent {
  type: "audio_capture_unavailable";
  errorCode?: string;
  error?: string;
}

export interface AudioCaptureErrorEvent extends CallGuardBaseEvent {
  type: "audio_capture_error";
  errorCode?: string;
  error: string;
}

export interface AudioBufferReadyEvent extends CallGuardBaseEvent {
  type: "audio_buffer_ready";
  bufferSize: number;
  sampleRateHz?: number;
  channelCount?: number;
  audioFormat?: string;
  durationMs?: number;
  source?: string;
}

export type CallGuardEvent =
  | CallStartedEvent
  | CallStoppedEvent
  | AudioCaptureStartedEvent
  | AudioCaptureStoppedEvent
  | AudioCaptureUnavailableEvent
  | AudioCaptureErrorEvent
  | AudioBufferReadyEvent;

export type CallGuardEventListener<T extends CallGuardEvent = CallGuardEvent> = (event: T) => void;

export const VALID_CALL_GUARD_EVENT_TYPES: ReadonlySet<CallGuardEventType> = new Set<CallGuardEventType>([
  "call_started",
  "call_stopped",
  "audio_capture_started",
  "audio_capture_stopped",
  "audio_capture_unavailable",
  "audio_capture_error",
  "audio_buffer_ready",
]);

/**
 * Validates and normalizes raw native event payloads.
 * Strictly guarantees that no sensitive fields (raw PCM bytes, auth tokens,
 * payment data, guardian info, or fabricated scores) can leak through.
 */
export function normalizeCallGuardEvent(raw: any): CallGuardEvent | null {
  if (!raw || typeof raw !== "object") return null;

  const type = raw.type;
  if (!VALID_CALL_GUARD_EVENT_TYPES.has(type)) {
    return null;
  }

  const timestamp =
    typeof raw.timestamp === "number" && !isNaN(raw.timestamp)
      ? raw.timestamp
      : Date.now();

  const sessionId = typeof raw.sessionId === "string" ? raw.sessionId : undefined;
  const errorCode = typeof raw.errorCode === "string" ? raw.errorCode : undefined;
  const error = typeof raw.error === "string" ? raw.error : undefined;

  switch (type as CallGuardEventType) {
    case "call_started":
      return { type: "call_started", timestamp, ...(sessionId ? { sessionId } : {}) };
    case "call_stopped":
      return { type: "call_stopped", timestamp, ...(sessionId ? { sessionId } : {}) };
    case "audio_capture_started":
      return { type: "audio_capture_started", timestamp, ...(sessionId ? { sessionId } : {}) };
    case "audio_capture_stopped":
      return { type: "audio_capture_stopped", timestamp, ...(sessionId ? { sessionId } : {}) };
    case "audio_capture_unavailable":
      return {
        type: "audio_capture_unavailable",
        timestamp,
        ...(sessionId ? { sessionId } : {}),
        ...(errorCode ? { errorCode } : {}),
        ...(error ? { error } : {}),
      };
    case "audio_capture_error":
      return {
        type: "audio_capture_error",
        timestamp,
        ...(sessionId ? { sessionId } : {}),
        ...(errorCode ? { errorCode } : {}),
        error: error || "Unknown audio capture error",
      };
    case "audio_buffer_ready": {
      const rawSize = raw.bufferSize;
      // Strictly reject invalid, non-numeric, zero, or negative buffer sizes
      if (typeof rawSize !== "number" || isNaN(rawSize) || rawSize <= 0 || rawSize > 10_000_000) {
        return null;
      }

      const sampleRateHz =
        typeof raw.sampleRateHz === "number" && !isNaN(raw.sampleRateHz) && raw.sampleRateHz > 0
          ? raw.sampleRateHz
          : undefined;

      const channelCount =
        typeof raw.channelCount === "number" && !isNaN(raw.channelCount) && raw.channelCount > 0
          ? raw.channelCount
          : undefined;

      const durationMs =
        typeof raw.durationMs === "number" && !isNaN(raw.durationMs) && raw.durationMs >= 0
          ? raw.durationMs
          : undefined;

      const audioFormat = typeof raw.audioFormat === "string" ? raw.audioFormat : undefined;
      const source = typeof raw.source === "string" ? raw.source : undefined;

      return {
        type: "audio_buffer_ready",
        timestamp,
        bufferSize: Math.round(rawSize),
        ...(sessionId ? { sessionId } : {}),
        ...(sampleRateHz !== undefined ? { sampleRateHz } : {}),
        ...(channelCount !== undefined ? { channelCount } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(audioFormat ? { audioFormat } : {}),
        ...(source ? { source } : {}),
      };
    }
    default:
      return null;
  }
}

const { CallGuardModule } = (NativeModules || {}) as {
  CallGuardModule?: {
    startDetection(): Promise<boolean>;
    stopDetection(): Promise<boolean>;
    addListener?(eventName: string): void;
    removeListeners?(count: number): void;
  };
};

export const isCallGuardAvailable = (): boolean =>
  Platform.OS === "android" && !!CallGuardModule;

const listeners = new Set<CallGuardEventListener>();
let nativeSubscription: { remove: () => void } | null = null;

function handleRawNativeEvent(rawEvent: any): void {
  const normalized = normalizeCallGuardEvent(rawEvent);
  if (!normalized) return;

  const activeListeners = Array.from(listeners);
  for (const listener of activeListeners) {
    try {
      listener(normalized);
    } catch (err) {
      console.warn("[CallGuard] Error in event listener:", err);
    }
  }
}

function ensureNativeSubscription(): void {
  if (nativeSubscription || !isCallGuardAvailable()) return;

  try {
    if (CallGuardModule && typeof NativeEventEmitter === "function") {
      try {
        const emitter = new NativeEventEmitter(CallGuardModule as any);
        const sub = emitter.addListener("CallGuardEvent", handleRawNativeEvent);
        nativeSubscription = {
          remove: () => {
            try {
              sub.remove();
            } catch {
              // Safe cleanup
            }
          },
        };
        return;
      } catch {
        // Fall back to DeviceEventEmitter
      }
    }

    if (DeviceEventEmitter && typeof DeviceEventEmitter.addListener === "function") {
      const sub = DeviceEventEmitter.addListener("CallGuardEvent", handleRawNativeEvent);
      nativeSubscription = {
        remove: () => {
          try {
            sub.remove();
          } catch {
            // Safe cleanup
          }
        },
      };
    }
  } catch (err) {
    // Unsupported event subscription, safe no-op
    nativeSubscription = null;
  }
}

function teardownNativeSubscription(): void {
  if (nativeSubscription) {
    try {
      nativeSubscription.remove();
    } catch {
      // Safe cleanup
    }
    nativeSubscription = null;
  }
}

/**
 * Subscribes to all CallGuard lifecycle events.
 * Prevents duplicate subscriptions for the same listener reference.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeToCallGuardEvents(listener: CallGuardEventListener): () => void {
  if (typeof listener !== "function") {
    return () => {};
  }

  if (listeners.has(listener)) {
    return () => removeCallGuardListener(listener);
  }

  listeners.add(listener);
  ensureNativeSubscription();

  return () => {
    removeCallGuardListener(listener);
  };
}

/**
 * Removes a CallGuard event listener.
 * Cleans up the native subscription when no active listeners remain.
 */
export function removeCallGuardListener(listener: CallGuardEventListener): void {
  listeners.delete(listener);
  if (listeners.size === 0) {
    teardownNativeSubscription();
  }
}

/**
 * Subscribes to a specific CallGuard event type.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeToCallGuardEvent<T extends CallGuardEventType>(
  type: T,
  listener: (event: Extract<CallGuardEvent, { type: T }>) => void
): () => void {
  const filtered: CallGuardEventListener = (event) => {
    if (event.type === type) {
      listener(event as Extract<CallGuardEvent, { type: T }>);
    }
  };
  return subscribeToCallGuardEvents(filtered);
}

/**
 * Returns the count of active JS listeners.
 */
export function getActiveCallGuardListenerCount(): number {
  return listeners.size;
}

/**
 * For testing and verification: simulates a native event dispatch.
 */
export function __emitCallGuardEventForTesting(rawEvent: any): boolean {
  handleRawNativeEvent(rawEvent);
  return true;
}

/**
 * For testing: resets all registered listeners and native subscriptions.
 */
export function __resetCallGuardBridgeForTesting(): void {
  listeners.clear();
  teardownNativeSubscription();
}

const requestCallGuardPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== "android" || !PermissionsAndroid) {
    return false;
  }
  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
    ]);
    return (
      granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED &&
      granted[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch {
    return false;
  }
};

export const startCallDetection = async (): Promise<{ success: boolean; error?: string }> => {
  if (!isCallGuardAvailable()) {
    return { success: false, error: "Live call detection is only available on Android." };
  }
  const hasPermissions = await requestCallGuardPermissions();
  if (!hasPermissions) {
    return { success: false, error: "Microphone and phone-state permissions are required to detect a live call." };
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
