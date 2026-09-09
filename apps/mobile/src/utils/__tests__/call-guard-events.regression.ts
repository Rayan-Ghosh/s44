/**
 * Regression Test Suite: Part 4 - Native Call-Audio Event Bridge
 *
 * Verifies:
 * 1. Event payload typing and strict schema validation
 * 2. Sensitive data stripping (no auth tokens, payment data, guardian info, or fabricated scores)
 * 3. Supported event subscription and dispatch mechanism
 * 4. Safe behavior when native module is unavailable (web preview / non-Android)
 * 5. Duplicate subscription prevention
 * 6. Listener cleanup via unsubscribe function and removeCallGuardListener
 * 7. Call start/stop and audio capture start/stop event handling
 * 8. Audio capture unavailable and error handling
 * 9. Audio buffer ready metadata handling without streaming raw audio
 * 10. Strict invariant: No fabricated acoustic scores or altered simulation state
 */

import {
  CallGuardEventType,
  CallGuardEvent,
  VALID_CALL_GUARD_EVENT_TYPES,
  normalizeCallGuardEvent,
  isCallGuardAvailable,
  startCallDetection,
  stopCallDetection,
  subscribeToCallGuardEvents,
  subscribeToCallGuardEvent,
  removeCallGuardListener,
  getActiveCallGuardListenerCount,
  __emitCallGuardEventForTesting,
  __resetCallGuardBridgeForTesting,
} from "../../services/call-guard";
import { SIMULATION_TRANSCRIPT, DEFAULT_CALLER } from "../../services/voice-service";
import { safeNormalizeVoiceAnalysis } from "../../types/voice";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    passed++;
    console.log(`  [OK]   ${testName}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${testName}`);
  }
}

function runSection(title: string, fn: () => void) {
  console.log(`\n=================================================================`);
  console.log(`${title}`);
  console.log(`=================================================================\n`);
  fn();
}

// -----------------------------------------------------------------------------
// PART 4-1: Event Payload Typing and Validation
// -----------------------------------------------------------------------------
runSection("PART 4-1: Event Payload Typing & Normalization", () => {
  assert(VALID_CALL_GUARD_EVENT_TYPES.has("call_started"), "call_started is recognized");
  assert(VALID_CALL_GUARD_EVENT_TYPES.has("call_stopped"), "call_stopped is recognized");
  assert(VALID_CALL_GUARD_EVENT_TYPES.has("audio_capture_started"), "audio_capture_started is recognized");
  assert(VALID_CALL_GUARD_EVENT_TYPES.has("audio_capture_stopped"), "audio_capture_stopped is recognized");
  assert(VALID_CALL_GUARD_EVENT_TYPES.has("audio_capture_unavailable"), "audio_capture_unavailable is recognized");
  assert(VALID_CALL_GUARD_EVENT_TYPES.has("audio_capture_error"), "audio_capture_error is recognized");
  assert(VALID_CALL_GUARD_EVENT_TYPES.has("audio_buffer_ready"), "audio_buffer_ready is recognized");

  // Invalid event types rejected
  assert(normalizeCallGuardEvent(null) === null, "null input returns null");
  assert(normalizeCallGuardEvent(undefined) === null, "undefined input returns null");
  assert(normalizeCallGuardEvent("invalid_string") === null, "string input returns null");
  assert(normalizeCallGuardEvent({ type: "unknown_scam_event" }) === null, "unrecognized type rejected");
  assert(normalizeCallGuardEvent({ type: "fraud_overlay_triggered" }) === null, "non-lifecycle type rejected");

  // Valid normalization
  const normStarted = normalizeCallGuardEvent({
    type: "call_started",
    timestamp: 1700000000000,
    sessionId: "sess-123",
  });
  assert(normStarted !== null, "call_started normalizes cleanly");
  assert(normStarted?.type === "call_started", "type is call_started");
  assert(normStarted?.timestamp === 1700000000000, "timestamp preserved");
  assert(normStarted?.sessionId === "sess-123", "sessionId preserved");

  // Default timestamp if missing or non-numeric
  const normNoTime = normalizeCallGuardEvent({ type: "call_stopped" });
  assert(typeof normNoTime?.timestamp === "number" && normNoTime.timestamp > 0, "default timestamp assigned");

  // Error payload
  const normErr = normalizeCallGuardEvent({
    type: "audio_capture_error",
    timestamp: 1700000001000,
    sessionId: "sess-err",
    errorCode: "REC_ERR",
    error: "Microphone busy",
  });
  assert(normErr?.type === "audio_capture_error", "audio_capture_error type correct");
  assert((normErr as any)?.errorCode === "REC_ERR", "errorCode preserved");
  assert((normErr as any)?.error === "Microphone busy", "error string preserved");

  // Audio buffer ready payload
  const normBuf = normalizeCallGuardEvent({
    type: "audio_buffer_ready",
    timestamp: 1700000002000,
    bufferSize: 2048,
  });
  assert(normBuf?.type === "audio_buffer_ready", "audio_buffer_ready type correct");
  assert((normBuf as any)?.bufferSize === 2048, "bufferSize preserved");
});

// -----------------------------------------------------------------------------
// PART 4-2: Sensitive Data Stripping & Acoustic Non-Fabrication
// -----------------------------------------------------------------------------
runSection("PART 4-2: Sensitive Data Stripping & Score Isolation", () => {
  const roguePayload = {
    type: "call_started",
    timestamp: 1700000005000,
    sessionId: "sess-secure",
    authToken: "Bearer secret-token-xyz",
    paymentAmount: 50000,
    guardianPin: "9999",
    userContact: "+919876543210",
    rawPcmData: [0x12, 0x34, 0x56],
    acousticScore: 92,
    fabricatedRiskScore: 95,
  };

  const clean = normalizeCallGuardEvent(roguePayload);
  assert(clean !== null, "Rogue payload processed");
  assert((clean as any).authToken === undefined, "authToken strictly stripped");
  assert((clean as any).paymentAmount === undefined, "paymentAmount strictly stripped");
  assert((clean as any).guardianPin === undefined, "guardianPin strictly stripped");
  assert((clean as any).userContact === undefined, "userContact strictly stripped");
  assert((clean as any).rawPcmData === undefined, "raw PCM audio strictly stripped");
  assert((clean as any).acousticScore === undefined, "acousticScore strictly stripped");
  assert((clean as any).fabricatedRiskScore === undefined, "fabricatedRiskScore strictly stripped");

  // Audio events must never alter domain acoustic analysis
  const initialAnalysis = safeNormalizeVoiceAnalysis(null);
  assert(initialAnalysis.hasAcousticData === false, "initial hasAcousticData is false");
  assert(initialAnalysis.acousticAnalysis?.riskScore == null, "initial acoustic score is strictly null");
});

// -----------------------------------------------------------------------------
// PART 4-3: Supported Event Subscription & Dispatch
// -----------------------------------------------------------------------------
runSection("PART 4-3: Event Subscription & Dispatch", () => {
  __resetCallGuardBridgeForTesting();
  assert(getActiveCallGuardListenerCount() === 0, "initial listener count is 0");

  const receivedEvents: CallGuardEvent[] = [];
  const listener = (event: CallGuardEvent) => {
    receivedEvents.push(event);
  };

  const unsubscribe = subscribeToCallGuardEvents(listener);
  assert(getActiveCallGuardListenerCount() === 1, "listener registered (count = 1)");

  // Dispatch events
  __emitCallGuardEventForTesting({
    type: "call_started",
    timestamp: 1000,
    sessionId: "sess-test",
  });
  __emitCallGuardEventForTesting({
    type: "audio_capture_started",
    timestamp: 1001,
    sessionId: "sess-test",
  });

  assert(receivedEvents.length === 2, "listener received both dispatched events");
  assert(receivedEvents[0].type === "call_started", "first event is call_started");
  assert(receivedEvents[1].type === "audio_capture_started", "second event is audio_capture_started");

  // Clean up
  unsubscribe();
  assert(getActiveCallGuardListenerCount() === 0, "listener unsubscribed (count = 0)");

  // Further dispatches should not be received
  __emitCallGuardEventForTesting({
    type: "call_stopped",
    timestamp: 1002,
  });
  assert(receivedEvents.length === 2, "no new events received after unsubscribe");
});

// -----------------------------------------------------------------------------
// PART 4-4: Type-Specific Event Subscription
// -----------------------------------------------------------------------------
runSection("PART 4-4: Type-Specific Subscription", () => {
  __resetCallGuardBridgeForTesting();

  const stopEvents: string[] = [];
  const unsubStop = subscribeToCallGuardEvent("call_stopped", (event) => {
    stopEvents.push(event.type);
  });

  __emitCallGuardEventForTesting({ type: "call_started", timestamp: 101 });
  __emitCallGuardEventForTesting({ type: "audio_capture_started", timestamp: 102 });
  __emitCallGuardEventForTesting({ type: "call_stopped", timestamp: 103 });

  assert(stopEvents.length === 1, "only subscribed event type received");
  assert(stopEvents[0] === "call_stopped", "received event is strictly call_stopped");

  unsubStop();
  assert(getActiveCallGuardListenerCount() === 0, "type-specific listener cleaned up");
});

// -----------------------------------------------------------------------------
// PART 4-5: Duplicate Subscription Prevention
// -----------------------------------------------------------------------------
runSection("PART 4-5: Duplicate Subscription Prevention", () => {
  __resetCallGuardBridgeForTesting();

  let callCount = 0;
  const singleListener = () => {
    callCount++;
  };

  // Register identical reference twice
  const unsub1 = subscribeToCallGuardEvents(singleListener);
  const unsub2 = subscribeToCallGuardEvents(singleListener);

  assert(getActiveCallGuardListenerCount() === 1, "duplicate listener prevented from incrementing count");

  __emitCallGuardEventForTesting({ type: "call_started", timestamp: 200 });
  assert(callCount === 1, "listener invoked exactly once per event");

  unsub1();
  assert(getActiveCallGuardListenerCount() === 0, "unsubscribing removes the listener");
});

// -----------------------------------------------------------------------------
// PART 4-6: Native Unavailable / Web Preview Safe Fallback
// -----------------------------------------------------------------------------
runSection("PART 4-6: Native Unavailable / Web Preview Safe Fallback", () => {
  __resetCallGuardBridgeForTesting();

  // In node / web / test environment, isCallGuardAvailable returns false
  const available = isCallGuardAvailable();
  assert(available === false, "CallGuard is safely reported unavailable on web / non-Android");

  // startCallDetection returns safe failure, doesn't throw
  startCallDetection().then((startResult) => {
    assert(startResult?.success === false, "startCallDetection returns success: false");
    assert(typeof startResult?.error === "string", "startCallDetection provides clean error string");
  });

  // stopCallDetection returns safe failure, doesn't throw
  stopCallDetection().then((stopResult) => {
    assert(stopResult?.success === false, "stopCallDetection returns success: false");
    assert(typeof stopResult?.error === "string", "stopCallDetection provides clean error string");
  });

  // Subscribing when native is unavailable does not crash
  let unsub: any;
  try {
    unsub = subscribeToCallGuardEvents(() => {});
    assert(typeof unsub === "function", "subscribe returns valid cleanup function even when native unavailable");
    unsub();
  } catch (err) {
    assert(false, "subscribe threw error when native module unavailable");
  }
});

// -----------------------------------------------------------------------------
// PART 4-7: Audio Capture Unavailable and Error Handling
// -----------------------------------------------------------------------------
runSection("PART 4-7: Audio Capture Unavailable & Error Handling", () => {
  __resetCallGuardBridgeForTesting();

  const state: {
    lastStatus: "idle" | "capturing" | "unavailable" | "error";
    lastError: string | null;
  } = {
    lastStatus: "idle",
    lastError: null,
  };

  const unsub = subscribeToCallGuardEvents((event) => {
    switch (event.type) {
      case "call_started":
      case "audio_capture_started":
        state.lastStatus = "capturing";
        state.lastError = null;
        break;
      case "call_stopped":
      case "audio_capture_stopped":
        state.lastStatus = "idle";
        break;
      case "audio_capture_unavailable":
        state.lastStatus = "unavailable";
        state.lastError = event.error || "Capture unavailable";
        break;
      case "audio_capture_error":
        state.lastStatus = "error";
        state.lastError = event.error || "Capture error";
        break;
    }
  });

  // Test unavailable event
  __emitCallGuardEventForTesting({
    type: "audio_capture_unavailable",
    timestamp: 300,
    errorCode: "PERMISSION_DENIED",
    error: "Microphone permission is required to detect a live call.",
  });
  assert(state.lastStatus === "unavailable", "status transitioned to unavailable");
  assert(state.lastError === "Microphone permission is required to detect a live call.", "error message received");

  // Test error event
  __emitCallGuardEventForTesting({
    type: "audio_capture_error",
    timestamp: 301,
    errorCode: "AUDIO_RECORD_FAILED",
    error: "AudioRecord failed to initialize",
  });
  assert(state.lastStatus === "error", "status transitioned to error");
  assert(state.lastError === "AudioRecord failed to initialize", "error message received");

  // Recovery when capture starts
  __emitCallGuardEventForTesting({
    type: "audio_capture_started",
    timestamp: 302,
  });
  assert(state.lastStatus === "capturing", "status transitioned to capturing on start");
  assert(state.lastError === null, "error cleared when capturing starts");

  // Stop event resets to idle
  __emitCallGuardEventForTesting({
    type: "audio_capture_stopped",
    timestamp: 303,
  });
  assert(state.lastStatus === "idle", "status transitioned to idle on stop");

  unsub();
});

// -----------------------------------------------------------------------------
// PART 4-8: Simulation & Warning Behavior Preservation
// -----------------------------------------------------------------------------
runSection("PART 4-8: Simulation & Warning Behavior Preservation", () => {
  // SIMULATION_TRANSCRIPT must remain completely intact
  assert(Array.isArray(SIMULATION_TRANSCRIPT), "SIMULATION_TRANSCRIPT is intact array");
  assert(SIMULATION_TRANSCRIPT.length === 5, "Transcript has exactly 5 steps");
  assert(SIMULATION_TRANSCRIPT[2].text.includes("AnyDesk"), "AnyDesk prompt unchanged");
  assert(SIMULATION_TRANSCRIPT[4].text.includes("OTP"), "OTP prompt unchanged");

  // DEFAULT_CALLER unchanged
  assert(DEFAULT_CALLER.phoneNumber === "+91 1800 209 8888", "Caller phone number unchanged");
  assert(DEFAULT_CALLER.displayName === "Unknown / Toll-Free Support", "Caller name unchanged");
  assert(DEFAULT_CALLER.direction === "inbound", "Caller direction is inbound");
});

// -----------------------------------------------------------------------------
// Final Summary
// -----------------------------------------------------------------------------
console.log("\n" + "=".repeat(65));
console.log(`TOTAL CHECKS: ${passed + failed}`);
console.log(`PASSES:       ${passed}`);
console.log(`FAILURES:     ${failed}`);
console.log("=".repeat(65) + "\n");

if (failed > 0) {
  process.exit(1);
}
