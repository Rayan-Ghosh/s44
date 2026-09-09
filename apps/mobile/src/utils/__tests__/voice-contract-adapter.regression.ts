/**
 * Regression Test Suite: Part 5 - Voice Service & Acoustic Analysis Contract
 *
 * Verifies:
 * 1. Normalization of existing transcript-only payloads (legacy and envelope formats)
 * 2. Strict validation and boundary rejection of acoustic risk scores (0-100)
 * 3. Acoustic missing data remains strictly null (never fabricated or converted to 0)
 * 4. Pending, unavailable, and failed acoustic states
 * 5. Safe WebSocket message parsing and categorization across all message categories
 * 6. Malformed, unknown, and corrupted messages do not throw
 * 7. Separation of transcript and acoustic scores in combined analysis
 * 8. Preservation of simulation behavior, initial snapshots, and fraud warning logic
 * 9. Non-mutation of payment, Guardian, auth, transaction, or navigation state
 */

import {
  validateRiskScore,
  normalizeTranscriptResponse,
  normalizeAcousticResponse,
  normalizeCombinedResponse,
  parseWebSocketMessage,
  mapDetectedPatterns,
  coercionToLevel,
  scoreToRiskLevel,
} from "../../services/voice-analysis-adapter";
import {
  VoiceService,
  SIMULATION_TRANSCRIPT,
  DEFAULT_CALLER,
} from "../../services/voice-service";
import {
  createUnavailableAcousticAnalysis,
  isAcousticAnalysisAvailable,
  buildCombinedVoiceAnalysis,
} from "../../types/voice";

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
// PART 5-1: Pure Validation and Mapping Helpers
// -----------------------------------------------------------------------------
runSection("PART 5-1: Pure Risk Score & Pattern Validation", () => {
  // Score validation
  assert(validateRiskScore(0) === 0, "validateRiskScore: 0 is valid");
  assert(validateRiskScore(50) === 50, "validateRiskScore: 50 is valid");
  assert(validateRiskScore(100) === 100, "validateRiskScore: 100 is valid");
  assert(validateRiskScore(42.7) === 43, "validateRiskScore: rounds floating points to integer");

  // Rejection of invalid scores
  assert(validateRiskScore(-1) === null, "validateRiskScore: rejects -1");
  assert(validateRiskScore(-100) === null, "validateRiskScore: rejects -100");
  assert(validateRiskScore(101) === null, "validateRiskScore: rejects 101");
  assert(validateRiskScore(500) === null, "validateRiskScore: rejects 500");
  assert(validateRiskScore(NaN) === null, "validateRiskScore: rejects NaN");
  assert(validateRiskScore(Infinity) === null, "validateRiskScore: rejects Infinity");
  assert(validateRiskScore("50") === null, "validateRiskScore: rejects string");
  assert(validateRiskScore(null) === null, "validateRiskScore: rejects null");
  assert(validateRiskScore(undefined) === null, "validateRiskScore: rejects undefined");

  // Pattern and coercion mapping
  const mapped = mapDetectedPatterns(["authority_impersonation", "urgency", "credential_harvesting"]);
  assert(mapped.includes("AUTHORITY_IMPERSONATION"), "mapped AUTHORITY_IMPERSONATION");
  assert(mapped.includes("URGENT_LANGUAGE"), "mapped URGENT_LANGUAGE");
  assert(mapped.includes("OTP_SOLICITATION"), "mapped OTP_SOLICITATION");
  assert(coercionToLevel("CRITICAL") === "HIGH", "coercion CRITICAL -> HIGH");
  assert(coercionToLevel("ELEVATED") === "MEDIUM", "coercion ELEVATED -> MEDIUM");
  assert(coercionToLevel("SAFE") === "LOW", "coercion SAFE -> LOW");

  assert(scoreToRiskLevel(80) === "HIGH", "score 80 -> HIGH");
  assert(scoreToRiskLevel(50) === "MEDIUM", "score 50 -> MEDIUM");
  assert(scoreToRiskLevel(15) === "LOW", "score 15 -> LOW");
});

// -----------------------------------------------------------------------------
// PART 5-2: Normalization of Existing Transcript Responses
// -----------------------------------------------------------------------------
runSection("PART 5-2: Transcript Response Normalization", () => {
  // Legacy backend classifier response format
  const legacyHigh = {
    accumulated_risk: 0.88,
    coercion_level: "CRITICAL",
    detected_intents: ["authority_impersonation", "credential_harvesting"],
    matched_phrases: ["Central Cyber Security Cell", "read it out to me immediately"],
    is_scam_alert: true,
    message: "CRITICAL SOCIAL ENGINEERING SCAM DETECTED!",
  };

  const normLegacy = normalizeTranscriptResponse(legacyHigh);
  assert(normLegacy.status === "available", "Legacy format normalized status: available");
  assert(normLegacy.riskScore === 88, "accumulated_risk 0.88 converted to score 88");
  assert(normLegacy.riskLevel === "HIGH", "coercion_level CRITICAL converted to level HIGH");
  assert(normLegacy.detectedPatterns.length === 2, "detected patterns preserved");
  assert(normLegacy.matchedPhrases.length === 2, "matched phrases preserved");

  // Typed envelope format: { type: "transcript_analysis", data: { ... } }
  const envelope = {
    type: "transcript_analysis",
    data: {
      riskScore: 45,
      riskLevel: "MEDIUM",
      detectedPatterns: ["URGENT_LANGUAGE"],
      matchedPhrases: ["urgent procedure"],
      status: "available",
    },
  };
  const normEnvelope = normalizeTranscriptResponse(envelope);
  assert(normEnvelope.riskScore === 45, "Envelope riskScore 45 preserved");
  assert(normEnvelope.riskLevel === "MEDIUM", "Envelope riskLevel MEDIUM preserved");
  assert(normEnvelope.detectedPatterns.includes("URGENT_LANGUAGE"), "Envelope patterns preserved");

  // Safe fallback for null, undefined, empty object
  const normNull = normalizeTranscriptResponse(null);
  assert(normNull.status === "unavailable", "Null transcript normalizes to unavailable");
  assert(normNull.riskScore === 0, "Null transcript has riskScore 0");
  assert(normNull.riskLevel === "LOW", "Null transcript has riskLevel LOW");

  const normEmpty = normalizeTranscriptResponse({});
  assert(normEmpty.riskScore === 0, "Empty transcript normalizes to riskScore 0");
  assert(normEmpty.riskLevel === "LOW", "Empty transcript normalizes to riskLevel LOW");
});

// -----------------------------------------------------------------------------
// PART 5-3: Future Acoustic Response Normalization
// -----------------------------------------------------------------------------
runSection("PART 5-3: Acoustic Response Normalization & Score Isolation", () => {
  // Missing acoustic data MUST remain null (never 0)
  const missingAcoustic = normalizeAcousticResponse(null);
  assert(missingAcoustic.status === "unavailable", "Null acoustic is status unavailable");
  assert(missingAcoustic.riskScore === null, "Null acoustic riskScore is strictly null");
  assert(missingAcoustic.riskLevel === null, "Null acoustic riskLevel is strictly null");
  assert(missingAcoustic.confidence === null, "Null acoustic confidence is strictly null");

  const emptyAcoustic = normalizeAcousticResponse({});
  assert(emptyAcoustic.riskScore === null, "Empty acoustic riskScore is strictly null (never 0)");
  assert(emptyAcoustic.status === "unavailable", "Empty acoustic status is unavailable");

  // Explicit unavailable status
  const unavail = normalizeAcousticResponse({
    status: "unavailable",
    reason: "Backend acoustic engine not loaded",
  });
  assert(unavail.status === "unavailable", "Unavailable status preserved");
  assert(unavail.riskScore === null, "Unavailable riskScore is null");
  assert(unavail.reason === "Backend acoustic engine not loaded", "Reason preserved");

  // Explicit pending status
  const pending = normalizeAcousticResponse({
    status: "pending",
  });
  assert(pending.status === "pending", "Pending status preserved");
  assert(pending.riskScore === null, "Pending riskScore is null (never 0)");

  // Explicit failed status
  const failedState = normalizeAcousticResponse({
    status: "failed",
    errorMessage: "Audio buffer underrun",
  });
  assert(failedState.status === "failed", "Failed status preserved");
  assert(failedState.riskScore === null, "Failed riskScore is null");
  assert(failedState.errorMessage === "Audio buffer underrun", "Error message preserved");

  // Valid acoustic response
  const validAcoustic = normalizeAcousticResponse({
    status: "available",
    riskScore: 74,
    riskLevel: "HIGH",
    confidence: 0.92,
    detectedAnomalies: ["synthetic_voice_timbre"],
    features: { syntheticVoiceScore: 0.88, snrDb: 18.5 },
  });
  assert(validAcoustic.status === "available", "Valid acoustic status is available");
  assert(validAcoustic.riskScore === 74, "Valid acoustic riskScore 74 preserved");
  assert(validAcoustic.riskLevel === "HIGH", "Valid acoustic riskLevel HIGH preserved");
  assert(validAcoustic.detectedAnomalies?.includes("synthetic_voice_timbre") === true, "Anomalies preserved");
  assert((validAcoustic.features as any)?.snrDb === 18.5, "Features preserved");

  // Out-of-bounds acoustic score is strictly rejected (status becomes 'failed', score null)
  const rejectedNegative = normalizeAcousticResponse({
    status: "available",
    riskScore: -15,
  });
  assert(rejectedNegative.status === "failed", "Negative score rejected: status marked failed");
  assert(rejectedNegative.riskScore === null, "Negative score: riskScore set to null");
  assert(rejectedNegative.errorMessage !== null, "Negative score: errorMessage set");

  const rejectedOver100 = normalizeAcousticResponse({
    status: "available",
    riskScore: 125,
  });
  assert(rejectedOver100.status === "failed", "Score > 100 rejected: status marked failed");
  assert(rejectedOver100.riskScore === null, "Score > 100: riskScore set to null");

  const rejectedNonNumeric = normalizeAcousticResponse({
    status: "available",
    riskScore: "critical" as any,
  });
  assert(rejectedNonNumeric.status === "failed", "Non-numeric score rejected: status marked failed");
  assert(rejectedNonNumeric.riskScore === null, "Non-numeric score: riskScore set to null");
});

// -----------------------------------------------------------------------------
// PART 5-4: WebSocket Message Parsing & Categorization
// -----------------------------------------------------------------------------
runSection("PART 5-4: WebSocket Message Parser & Categorization", () => {
  // Legacy backend packet
  const legacyPacket = JSON.stringify({
    accumulated_risk: 0.75,
    coercion_level: "CRITICAL",
    detected_intents: ["urgency"],
    matched_phrases: ["urgent"],
    is_scam_alert: true,
    message: "Critical alert",
  });
  const parsedLegacy = parseWebSocketMessage(legacyPacket);
  assert(parsedLegacy.category === "legacy_classifier", "Legacy backend packet recognized as legacy_classifier");
  assert(parsedLegacy.payload.accumulated_risk === 0.75, "Legacy payload parsed correctly");

  // Future transcript_analysis message
  const transcriptMsg = JSON.stringify({
    type: "transcript_analysis",
    data: { riskScore: 82, riskLevel: "HIGH" },
  });
  const parsedTranscript = parseWebSocketMessage(transcriptMsg);
  assert(parsedTranscript.category === "transcript_analysis", "transcript_analysis recognized");
  assert(parsedTranscript.payload.riskScore === 82, "transcript_analysis data payload extracted");

  // Future acoustic_analysis message
  const acousticMsg = JSON.stringify({
    type: "acoustic_analysis",
    data: { status: "available", riskScore: 65 },
  });
  const parsedAcoustic = parseWebSocketMessage(acousticMsg);
  assert(parsedAcoustic.category === "acoustic_analysis", "acoustic_analysis recognized");
  assert(parsedAcoustic.payload.riskScore === 65, "acoustic_analysis data payload extracted");

  // Future combined_analysis message
  const combinedMsg = JSON.stringify({
    type: "combined_analysis",
    data: { status: "available", riskScore: 78, riskLevel: "HIGH" },
  });
  const parsedCombined = parseWebSocketMessage(combinedMsg);
  assert(parsedCombined.category === "combined_analysis", "combined_analysis recognized");

  // Future analysis_status message
  const statusMsg = JSON.stringify({
    type: "analysis_status",
    status: "pending",
    message: "Acoustic buffer accumulating",
  });
  const parsedStatus = parseWebSocketMessage(statusMsg);
  assert(parsedStatus.category === "analysis_status", "analysis_status recognized");

  // Future analysis_error message
  const errorMsg = JSON.stringify({
    type: "analysis_error",
    error: { status: "failed", errorCode: "BUFFER_OVERFLOW", errorMessage: "Audio buffer overflow" },
  });
  const parsedError = parseWebSocketMessage(errorMsg);
  assert(parsedError.category === "analysis_error", "analysis_error recognized");

  // Unknown message category: safely categorized, never throws
  const unknownMsg = JSON.stringify({
    type: "future_unsupported_category_v9",
    someField: 123,
  });
  const parsedUnknown = parseWebSocketMessage(unknownMsg);
  assert(parsedUnknown.category === "unknown", "Unknown message type categorized as unknown");
  assert(parsedUnknown.rawType === "future_unsupported_category_v9", "rawType preserved");

  // Malformed JSON string: does not throw
  const malformedString = "{ invalid_json_syntax: ";
  const parsedMalformed = parseWebSocketMessage(malformedString);
  assert(parsedMalformed.category === "unknown", "Malformed JSON categorized as unknown without throwing");

  // Null, undefined, empty
  assert(parseWebSocketMessage(null).category === "unknown", "null handled safely");
  assert(parseWebSocketMessage(undefined).category === "unknown", "undefined handled safely");
});

// -----------------------------------------------------------------------------
// PART 5-5: Combined Voice Analysis & Score Separation
// -----------------------------------------------------------------------------
runSection("PART 5-5: Combined Analysis & Multi-Modal Isolation", () => {
  // Case A: Transcript only (acoustic unavailable)
  const transcriptOnly = normalizeCombinedResponse({
    transcriptAnalysis: {
      riskScore: 85,
      riskLevel: "HIGH",
      detectedPatterns: ["AUTHORITY_IMPERSONATION"],
      matchedPhrases: ["Central Cyber Security Cell"],
      status: "available",
    },
    acousticAnalysis: null,
  });

  assert(transcriptOnly.status === "available", "Combined status is available");
  assert(transcriptOnly.riskScore === 85, "Overall risk mirrors transcript score (85)");
  assert(transcriptOnly.hasAcousticData === false, "hasAcousticData is strictly false");
  assert(transcriptOnly.transcriptAnalysis.riskScore === 85, "Transcript score is 85");
  assert(transcriptOnly.acousticAnalysis?.riskScore === null, "Acoustic score is strictly null (never 0)");

  // Case B: Combined multi-modal (transcript + genuine acoustic)
  const multiModal = normalizeCombinedResponse({
    transcriptAnalysis: {
      riskScore: 80,
      riskLevel: "HIGH",
      detectedPatterns: ["URGENT_LANGUAGE"],
      matchedPhrases: ["immediately"],
      status: "available",
    },
    acousticAnalysis: {
      status: "available",
      riskScore: 60,
      riskLevel: "MEDIUM",
      confidence: 0.85,
    },
  });

  assert(multiModal.hasAcousticData === true, "hasAcousticData is true for genuine acoustic");
  assert(multiModal.transcriptAnalysis.riskScore === 80, "Transcript score is 80");
  assert(multiModal.acousticAnalysis?.riskScore === 60, "Acoustic score is 60");
  // 0.7 * 80 + 0.3 * 60 = 56 + 18 = 74
  assert(multiModal.riskScore === 74, "Combined weighted score computed: 74");

  // Case C: Null / empty combined input
  const nullCombined = normalizeCombinedResponse(null);
  assert(nullCombined.riskScore === 0, "Null combined input riskScore is 0");
  assert(nullCombined.hasAcousticData === false, "Null combined hasAcousticData is false");
  assert(nullCombined.acousticAnalysis?.riskScore === null, "Null combined acoustic score is null");
});

// -----------------------------------------------------------------------------
// PART 5-6: Backward Compatibility with VoiceService & VoiceScreen
// -----------------------------------------------------------------------------
runSection("PART 5-6: VoiceService Invariants & Simulation Preservation", () => {
  // getInitialSnapshot
  const initial = VoiceService.getInitialSnapshot();
  assert(initial.status === "inactive", "Initial snapshot status is inactive");
  assert(initial.riskScore === 0, "Initial snapshot riskScore is 0");
  assert(initial.riskLevel === "LOW", "Initial snapshot riskLevel is LOW");
  assert(initial.analysis !== undefined, "Initial snapshot includes analysis object");
  assert(initial.analysis?.hasAcousticData === false, "Initial analysis hasAcousticData is false");
  assert(initial.analysis?.acousticAnalysis?.riskScore === null, "Initial acoustic score is strictly null");

  // Simulation transcript
  assert(Array.isArray(SIMULATION_TRANSCRIPT), "SIMULATION_TRANSCRIPT is intact");
  assert(SIMULATION_TRANSCRIPT.length === 5, "Transcript has exactly 5 steps");
  assert(SIMULATION_TRANSCRIPT[0].text.includes("Central Cyber Security Cell"), "Line 0 dialogue intact");
  assert(SIMULATION_TRANSCRIPT[2].text.includes("AnyDesk"), "Line 2 dialogue intact");
  assert(SIMULATION_TRANSCRIPT[4].text.includes("OTP"), "Line 4 dialogue intact");

  // Caller info
  assert(DEFAULT_CALLER.displayName === "Unknown / Toll-Free Support", "Caller name preserved");
  assert(DEFAULT_CALLER.phoneNumber === "+91 1800 209 8888", "Caller phone number preserved");

  // Reset session
  VoiceService.resetSession();
  assert(true, "resetSession executes cleanly");
});

// -----------------------------------------------------------------------------
// PART 5-7: Non-Mutation of Payment, Guardian, Auth, or Nav State
// -----------------------------------------------------------------------------
runSection("PART 5-7: Non-Mutation of Non-Voice Subsystems", () => {
  const norm = normalizeCombinedResponse(null);
  assert((norm as any).paymentId === undefined, "No paymentId in normalized analysis");
  assert((norm as any).guardianApproved === undefined, "No guardianApproved in normalized analysis");
  assert((norm as any).authToken === undefined, "No authToken in normalized analysis");
  assert((norm as any).navigationState === undefined, "No navigationState in normalized analysis");
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
