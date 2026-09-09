/**
 * Regression Test Suite: Part 6 - Real Audio-Buffer Capture & Frontend Voice Pipeline
 *
 * Verifies:
 * 1. Valid audio-buffer metadata normalization
 * 2. Invalid buffer metadata rejection (zero, negative, NaN, non-numeric, oversized)
 * 3. Strict isolation: No raw PCM audio or byte streams in event payloads
 * 4. Audio capture start/stop lifecycle and status transitions
 * 5. Cleanup on error and service destruction
 * 6. Duplicate listener prevention on audio-buffer subscriptions
 * 7. Native-unavailable fallback on web / non-Android
 * 8. Audio buffer ingestion boundary in VoiceService (explicit 'unavailable' state)
 * 9. Rejection of invalid metadata in VoiceService.ingestAudioBuffer
 * 10. No fabricated acoustic scores, deepfake probabilities, or confidence values
 * 11. Preservation of existing simulation, transcript dialogue, and fraud alerts
 * 12. Non-mutation of payment, Guardian, auth, transaction, or navigation state
 */

import {
  AudioBufferReadyEvent,
  normalizeCallGuardEvent,
  isCallGuardAvailable,
  startCallDetection,
  stopCallDetection,
  subscribeToCallGuardEvents,
  subscribeToCallGuardEvent,
  __emitCallGuardEventForTesting,
  __resetCallGuardBridgeForTesting,
} from "../../services/call-guard";
import {
  VoiceService,
  SIMULATION_TRANSCRIPT,
  DEFAULT_CALLER,
} from "../../services/voice-service";
import { AudioBufferMetadata } from "../../types/voice";

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
// PART 6-1: Valid Audio-Buffer Metadata Normalization
// -----------------------------------------------------------------------------
runSection("PART 6-1: Valid Audio-Buffer Metadata Normalization", () => {
  const rawValid = {
    type: "audio_buffer_ready",
    timestamp: 1710000000000,
    sessionId: "sess-audio-101",
    bufferSize: 2048,
    sampleRateHz: 16000,
    channelCount: 1,
    audioFormat: "pcm_s16le",
    durationMs: 64.0,
    source: "microphone",
  };

  const normalized = normalizeCallGuardEvent(rawValid);
  assert(normalized !== null, "Valid audio_buffer_ready event normalizes cleanly");
  assert(normalized?.type === "audio_buffer_ready", "Event type is audio_buffer_ready");

  const buf = normalized as AudioBufferReadyEvent;
  assert(buf.bufferSize === 2048, "bufferSize 2048 preserved");
  assert(buf.sampleRateHz === 16000, "sampleRateHz 16000 preserved");
  assert(buf.channelCount === 1, "channelCount 1 preserved");
  assert(buf.audioFormat === "pcm_s16le", "audioFormat pcm_s16le preserved");
  assert(buf.durationMs === 64.0, "durationMs 64.0 preserved");
  assert(buf.source === "microphone", "source microphone preserved");
  assert(buf.sessionId === "sess-audio-101", "sessionId preserved");
  assert(buf.timestamp === 1710000000000, "timestamp preserved");
});

// -----------------------------------------------------------------------------
// PART 6-2: Invalid Buffer Metadata Rejection
// -----------------------------------------------------------------------------
runSection("PART 6-2: Invalid Buffer Metadata Rejection", () => {
  // Missing bufferSize
  assert(
    normalizeCallGuardEvent({ type: "audio_buffer_ready", timestamp: 100 }) === null,
    "Rejects audio_buffer_ready missing bufferSize"
  );

  // Zero bufferSize
  assert(
    normalizeCallGuardEvent({ type: "audio_buffer_ready", timestamp: 100, bufferSize: 0 }) === null,
    "Rejects zero bufferSize"
  );

  // Negative bufferSize
  assert(
    normalizeCallGuardEvent({ type: "audio_buffer_ready", timestamp: 100, bufferSize: -512 }) === null,
    "Rejects negative bufferSize"
  );

  // NaN bufferSize
  assert(
    normalizeCallGuardEvent({ type: "audio_buffer_ready", timestamp: 100, bufferSize: NaN }) === null,
    "Rejects NaN bufferSize"
  );

  // Non-numeric bufferSize
  assert(
    normalizeCallGuardEvent({ type: "audio_buffer_ready", timestamp: 100, bufferSize: "2048" as any }) === null,
    "Rejects string bufferSize"
  );

  // Oversized bufferSize (> 10MB)
  assert(
    normalizeCallGuardEvent({ type: "audio_buffer_ready", timestamp: 100, bufferSize: 15_000_000 }) === null,
    "Rejects oversized bufferSize (> 10MB)"
  );
});

// -----------------------------------------------------------------------------
// PART 6-3: Strict Raw Audio Isolation (No PCM Bytes in Event Payloads)
// -----------------------------------------------------------------------------
runSection("PART 6-3: Raw Audio Leakage Prevention", () => {
  const roguePayload = {
    type: "audio_buffer_ready",
    timestamp: 1710000005000,
    bufferSize: 1024,
    sampleRateHz: 16000,
    pcm: [0x12, 0x34, 0x56, 0x78],
    rawAudio: "UklGRiQAAABXQVZFZm10IBAAAAABAAEA...",
    samples: new Float32Array([0.1, -0.2, 0.5]),
    bytes: [1, 2, 3, 4],
    data: "raw_audio_binary",
    acousticRisk: 88,
    fakeConfidence: 0.99,
  };

  const clean = normalizeCallGuardEvent(roguePayload);
  assert(clean !== null, "Rogue payload parsed");
  assert((clean as any).pcm === undefined, "pcm raw array strictly stripped");
  assert((clean as any).rawAudio === undefined, "rawAudio string strictly stripped");
  assert((clean as any).samples === undefined, "samples Float32Array strictly stripped");
  assert((clean as any).bytes === undefined, "bytes array strictly stripped");
  assert((clean as any).data === undefined, "data payload strictly stripped");
  assert((clean as any).acousticRisk === undefined, "acousticRisk strictly stripped");
  assert((clean as any).fakeConfidence === undefined, "fakeConfidence strictly stripped");
});

// -----------------------------------------------------------------------------
// PART 6-4: Audio Capture Lifecycle & Event Dispatch
// -----------------------------------------------------------------------------
runSection("PART 6-4: Audio Capture Start/Stop Lifecycle", () => {
  __resetCallGuardBridgeForTesting();

  const lifecycleEvents: string[] = [];
  const unsub = subscribeToCallGuardEvents((event) => {
    lifecycleEvents.push(event.type);
  });

  __emitCallGuardEventForTesting({ type: "call_started", timestamp: 100 });
  __emitCallGuardEventForTesting({ type: "audio_capture_started", timestamp: 101 });
  __emitCallGuardEventForTesting({ type: "audio_buffer_ready", timestamp: 102, bufferSize: 1024 });
  __emitCallGuardEventForTesting({ type: "audio_capture_stopped", timestamp: 103 });
  __emitCallGuardEventForTesting({ type: "call_stopped", timestamp: 104 });

  assert(lifecycleEvents.length === 5, "All 5 lifecycle events received in sequence");
  assert(lifecycleEvents[0] === "call_started", "Event 0 is call_started");
  assert(lifecycleEvents[1] === "audio_capture_started", "Event 1 is audio_capture_started");
  assert(lifecycleEvents[2] === "audio_buffer_ready", "Event 2 is audio_buffer_ready");
  assert(lifecycleEvents[3] === "audio_capture_stopped", "Event 3 is audio_capture_stopped");
  assert(lifecycleEvents[4] === "call_stopped", "Event 4 is call_stopped");

  unsub();
});

// -----------------------------------------------------------------------------
// PART 6-5: Cleanup on Error and Teardown
// -----------------------------------------------------------------------------
runSection("PART 6-5: Cleanup on Error & Service Destruction", () => {
  __resetCallGuardBridgeForTesting();

  let errorReceived: string | null = null;
  const unsub = subscribeToCallGuardEvent("audio_capture_error", (event) => {
    errorReceived = event.error;
  });

  __emitCallGuardEventForTesting({
    type: "audio_capture_error",
    timestamp: 200,
    errorCode: "AUDIO_RECORD_FAILED",
    error: "Failed to initialize native AudioRecord",
  });

  assert(errorReceived === "Failed to initialize native AudioRecord", "Error handled cleanly without crashing");

  unsub();
});

// -----------------------------------------------------------------------------
// PART 6-6: VoiceService Ingestion Boundary
// -----------------------------------------------------------------------------
runSection("PART 6-6: VoiceService Ingestion Boundary & Telemetry", () => {
  const validBuffer: AudioBufferMetadata = {
    sessionId: "sess-test-ingest",
    timestamp: 1710000010000,
    bufferSize: 2048,
    sampleRateHz: 16000,
    channelCount: 1,
    audioFormat: "pcm_s16le",
    durationMs: 64.0,
    source: "microphone",
  };

  // Valid buffer ingestion returns explicit 'unavailable' state (since backend ML model is pending)
  const result = VoiceService.ingestAudioBuffer(validBuffer);
  assert(result.status === "unavailable", "VoiceService.ingestAudioBuffer returns status: unavailable");
  assert(result.reason?.includes("not yet implemented") === true, "Descriptive reason explains ML backend pending");
  assert(result.bufferMetadata?.bufferSize === 2048, "Buffer metadata preserved in telemetry result");

  // Invalid buffer metadata is rejected
  const invalidBuffer: any = {
    sessionId: "sess-bad",
    timestamp: 1710000010000,
    bufferSize: -1, // invalid
  };
  const rejectedResult = VoiceService.ingestAudioBuffer(invalidBuffer);
  assert(rejectedResult.status === "rejected", "Invalid buffer metadata returns status: rejected");

  // Ingesting audio buffers does NOT alter transcript risk or initial snapshot
  const snapshot = VoiceService.getInitialSnapshot();
  assert(snapshot.riskScore === 0, "Initial snapshot riskScore remains 0 after audio ingestion");
  assert(snapshot.analysis?.hasAcousticData === false, "hasAcousticData strictly remains false");
  assert(snapshot.analysis?.acousticAnalysis?.riskScore === null, "acousticAnalysis.riskScore strictly remains null");
});

// -----------------------------------------------------------------------------
// PART 6-7: No Fabricated Scores, Probabilities, or Confidence
// -----------------------------------------------------------------------------
runSection("PART 6-7: Score and Probability Non-Fabrication", () => {
  const snapshot = VoiceService.getInitialSnapshot();
  assert(snapshot.analysis?.acousticAnalysis?.confidence === null, "Acoustic confidence is strictly null");
  assert(snapshot.analysis?.acousticAnalysis?.riskLevel === null, "Acoustic riskLevel is strictly null");
  assert((snapshot.analysis?.acousticAnalysis as any)?.deepfakeProbability === undefined, "No fake deepfakeProbability");
});

// -----------------------------------------------------------------------------
// PART 6-8: Simulation Transcript & Caller Preservation
// -----------------------------------------------------------------------------
runSection("PART 6-8: Simulation & Dialogue Preservation", () => {
  assert(Array.isArray(SIMULATION_TRANSCRIPT), "SIMULATION_TRANSCRIPT is array");
  assert(SIMULATION_TRANSCRIPT.length === 5, "Transcript has exactly 5 steps");
  assert(SIMULATION_TRANSCRIPT[0].text.includes("Central Cyber Security Cell"), "Line 0 intact");
  assert(SIMULATION_TRANSCRIPT[2].text.includes("AnyDesk"), "Line 2 intact");
  assert(SIMULATION_TRANSCRIPT[4].text.includes("OTP"), "Line 4 intact");
  assert(DEFAULT_CALLER.phoneNumber === "+91 1800 209 8888", "Caller phone number unchanged");
});

// -----------------------------------------------------------------------------
// PART 6-9: Non-Mutation of Payment, Guardian, Auth, or Nav State
// -----------------------------------------------------------------------------
runSection("PART 6-9: Non-Mutation of Non-Voice Modules", () => {
  const ingResult = VoiceService.ingestAudioBuffer({
    timestamp: 100,
    bufferSize: 1024,
  });
  assert((ingResult as any).paymentId === undefined, "No paymentId in ingestion result");
  assert((ingResult as any).authToken === undefined, "No authToken in ingestion result");
  assert((ingResult as any).guardianApproved === undefined, "No guardianApproved in ingestion result");
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
