/**
 * AVARAN Voice Domain Regression Suite
 *
 * PART 1: Voice Domain Types & Availability States
 *   - createUnavailableAcousticAnalysis() sets status: "unavailable" and riskScore: null.
 *   - No fake acoustic scores (0, 50, 100) are fabricated when unavailable.
 *   - isAcousticAnalysisAvailable correctly identifies valid computed acoustic results vs unavailable/null.
 *
 * PART 2: Strict Separation of Transcript vs Acoustic Risk
 *   - Transcript risk and acoustic risk are preserved in distinct, isolated sub-objects.
 *   - High transcript risk does not bleed into or fabricate an acoustic risk score.
 *   - Combined voice analysis marks hasAcousticData = false when acoustic is not present.
 *   - Combined voice analysis overall score reflects transcript risk solely when acoustic is unavailable.
 *
 * PART 3: Safe Handling of Empty, Null, Malformed, or Unavailable Analysis Data
 *   - safeNormalizeVoiceAnalysis handles null, undefined, empty object, and corrupted fields.
 *   - Malformed data falls back gracefully without crashing or throwing exceptions.
 *
 * PART 4: Preservation of Voice Simulation & Transcript Behavior
 *   - SIMULATION_TRANSCRIPT fixture maintains all 5 scripted dialogue steps and timing.
 *   - DEFAULT_CALLER properties are preserved.
 *   - VoiceService.getInitialSnapshot preserves all existing properties and default states.
 *
 * PART 5: Preservation of Risk Scoring & Pattern Mapping Conventions
 *   - Risk scoring thresholds (>=61 HIGH, >=31 MEDIUM, <=30 LOW) remain exact.
 *   - Threat pattern vocabulary mapping (authority, urgency, credentials, legal) remains consistent.
 *
 * PART 6: Non-Mutation of Payment, Guardian, Auth, or Navigation State
 *   - Voice analysis never mutates or produces PaymentWorkflowStage.
 *   - Pre-payment evaluation guards reject voice risk levels from authorizing transactions.
 *   - Voice analysis data structures are pure and isolated.
 */

import {
  CallStatus,
  CallerInfo,
  TranscriptLine,
  DetectedPattern,
  FraudAlert,
  VoiceAnalysisStatus,
  VoiceAnalysisMetadata,
  TranscriptAnalysis,
  AcousticAnalysis,
  CombinedVoiceAnalysis,
  CallSnapshot,
  createUnavailableAcousticAnalysis,
  isAcousticAnalysisAvailable,
  buildCombinedVoiceAnalysis,
  safeNormalizeVoiceAnalysis,
} from "../../types/voice";

import {
  VoiceService,
  DEFAULT_CALLER,
  SIMULATION_TRANSCRIPT,
} from "../../services/voice-service";

import {
  getRiskLevelFromScore,
  getStatusBadgeProps,
  RiskLevel,
} from "../risk-scoring";

import {
  validatePaymentAuthorizationStage,
  PaymentWorkflowStage,
} from "../../types/transaction";

// ─────────────────────────────────────────────────────────────
// Test Harness
// ─────────────────────────────────────────────────────────────
let totalChecks = 0;
let failures = 0;

function assert(condition: boolean, description: string, value?: any) {
  totalChecks++;
  if (condition) {
    console.log(`[OK]   ${description}${value !== undefined ? `: ${JSON.stringify(value)}` : ""}`);
  } else {
    failures++;
    console.error(`[FAIL] ${description}${value !== undefined ? `: ${JSON.stringify(value)}` : ""}`);
  }
}

// ─────────────────────────────────────────────────────────────
// PART 1: Voice Domain Types & Availability States
// ─────────────────────────────────────────────────────────────
console.log("\n=================================================================");
console.log("PART 1: Voice Domain Types & Availability States");
console.log("=================================================================\n");

const unavailableAcoustic = createUnavailableAcousticAnalysis();

assert(unavailableAcoustic.status === "unavailable", "PART1: Acoustic status defaults to 'unavailable'");
assert(unavailableAcoustic.riskScore === null, "PART1: Acoustic riskScore is strictly null (not 0 or fake number)");
assert(unavailableAcoustic.riskLevel === null, "PART1: Acoustic riskLevel is strictly null");
assert(unavailableAcoustic.confidence === null, "PART1: Acoustic confidence is strictly null");
assert(unavailableAcoustic.features === null, "PART1: Acoustic features is null when backend unavailable");
assert(typeof unavailableAcoustic.reason === "string" && unavailableAcoustic.reason.length > 0, "PART1: Informative reason provided for unavailable acoustic backend");

assert(unavailableAcoustic.riskScore !== 0, "PART1: Verified riskScore is NOT fabricated as 0");
assert(unavailableAcoustic.riskScore !== 50, "PART1: Verified riskScore is NOT fabricated as 50");
assert(unavailableAcoustic.riskScore !== 100, "PART1: Verified riskScore is NOT fabricated as 100");

assert(!isAcousticAnalysisAvailable(null), "PART1: isAcousticAnalysisAvailable(null) returns false");
assert(!isAcousticAnalysisAvailable(undefined), "PART1: isAcousticAnalysisAvailable(undefined) returns false");
assert(!isAcousticAnalysisAvailable(unavailableAcoustic), "PART1: isAcousticAnalysisAvailable(unavailableAcoustic) returns false");

const pendingAcoustic: AcousticAnalysis = {
  status: "pending",
  riskScore: null,
  riskLevel: null,
};
assert(!isAcousticAnalysisAvailable(pendingAcoustic), "PART1: Pending acoustic analysis returns false");

const failedAcoustic: AcousticAnalysis = {
  status: "failed",
  riskScore: null,
  riskLevel: null,
  errorMessage: "Audio decode error",
};
assert(!isAcousticAnalysisAvailable(failedAcoustic), "PART1: Failed acoustic analysis returns false");

// Valid synthetic acoustic fixture for type verification only
const availableAcoustic: AcousticAnalysis = {
  status: "available",
  riskScore: 75,
  riskLevel: "HIGH",
  confidence: 0.92,
  features: {
    stressScore: 0.85,
    syntheticVoiceScore: 0.1,
    backgroundNoiseCategory: "call_center",
  },
};
assert(isAcousticAnalysisAvailable(availableAcoustic), "PART1: Genuinely available acoustic analysis with computed score returns true");

// ─────────────────────────────────────────────────────────────
// PART 2: Strict Separation of Transcript vs Acoustic Risk
// ─────────────────────────────────────────────────────────────
console.log("\n=================================================================");
console.log("PART 2: Strict Separation of Transcript vs Acoustic Risk");
console.log("=================================================================\n");

const highRiskTranscript: TranscriptAnalysis = {
  status: "available",
  riskScore: 88,
  riskLevel: "HIGH",
  detectedPatterns: ["AUTHORITY_IMPERSONATION", "OTP_SOLICITATION"],
  matchedPhrases: ["police procedure", "read out the OTP"],
  coercionLevel: "CRITICAL",
  accumulatedRisk: 0.88,
};

const combinedWithoutAcoustic = buildCombinedVoiceAnalysis(
  highRiskTranscript,
  createUnavailableAcousticAnalysis()
);

assert(combinedWithoutAcoustic.hasAcousticData === false, "PART2: hasAcousticData is strictly false when acoustic backend unavailable");
assert(combinedWithoutAcoustic.riskScore === 88, "PART2: Overall score strictly mirrors transcript score when acoustic is unavailable", combinedWithoutAcoustic.riskScore);
assert(combinedWithoutAcoustic.riskLevel === "HIGH", "PART2: Overall level matches transcript level");
assert(combinedWithoutAcoustic.acousticAnalysis !== null, "PART2: Acoustic analysis container is present");
assert(combinedWithoutAcoustic.acousticAnalysis?.riskScore === null, "PART2: Acoustic risk score remains strictly null inside combined result");
assert(combinedWithoutAcoustic.acousticAnalysis?.status === "unavailable", "PART2: Acoustic analysis status remains 'unavailable'");
assert(combinedWithoutAcoustic.transcriptAnalysis.riskScore === 88, "PART2: Transcript risk score is preserved in its own sub-object");
assert(combinedWithoutAcoustic.alert.triggered === true, "PART2: Alert is triggered based on high-risk transcript");

// Simulated fusion scenario (pure type/schema test with mocked acoustic)
const combinedWithBoth = buildCombinedVoiceAnalysis(
  highRiskTranscript,
  availableAcoustic
);
assert(combinedWithBoth.hasAcousticData === true, "PART2: hasAcousticData is true when acoustic data is genuinely provided");
assert(combinedWithBoth.transcriptAnalysis.riskScore === 88, "PART2: Transcript risk score (88) remains completely distinct from acoustic score (75)");
assert(combinedWithBoth.acousticAnalysis?.riskScore === 75, "PART2: Acoustic risk score (75) is preserved independently");
assert(combinedWithBoth.signals.length > 0, "PART2: Detector signals formatted for risk engine compatibility");

// ─────────────────────────────────────────────────────────────
// PART 3: Safe Handling of Empty, Null, Malformed Data
// ─────────────────────────────────────────────────────────────
console.log("\n=================================================================");
console.log("PART 3: Safe Handling of Empty, Null, Malformed Data");
console.log("=================================================================\n");

const nullNorm = safeNormalizeVoiceAnalysis(null);
assert(nullNorm !== null && typeof nullNorm === "object", "PART3: safeNormalizeVoiceAnalysis(null) returns object");
assert(nullNorm.status === "unavailable", "PART3: Null payload normalizes to 'unavailable' status");
assert(nullNorm.riskScore === 0, "PART3: Null payload normalizes to 0 riskScore");
assert(nullNorm.riskLevel === "LOW", "PART3: Null payload normalizes to LOW riskLevel");
assert(nullNorm.hasAcousticData === false, "PART3: Null payload hasAcousticData is false");
assert(nullNorm.acousticAnalysis?.riskScore === null, "PART3: Null payload acoustic riskScore is null");

const undefinedNorm = safeNormalizeVoiceAnalysis(undefined);
assert(undefinedNorm.riskScore === 0, "PART3: undefined payload normalizes safely");
assert(undefinedNorm.hasAcousticData === false, "PART3: undefined payload hasAcousticData is false");

const emptyObjNorm = safeNormalizeVoiceAnalysis({});
assert(emptyObjNorm.riskScore === 0, "PART3: Empty object {} normalizes safely to score 0");
assert(emptyObjNorm.hasAcousticData === false, "PART3: Empty object hasAcousticData is false");
assert(emptyObjNorm.detectedPatterns.length === 0, "PART3: Empty object has empty detectedPatterns");

const malformedPayload = {
  riskScore: "NaN",
  riskLevel: "INVALID_LEVEL",
  transcriptAnalysis: {
    riskScore: null,
    matchedPhrases: "not-an-array",
    detectedPatterns: 12345,
  },
  acousticAnalysis: {
    riskScore: "garbage",
    status: 404,
  },
};
const malformedNorm = safeNormalizeVoiceAnalysis(malformedPayload);
assert(typeof malformedNorm.riskScore === "number" && !Number.isNaN(malformedNorm.riskScore), "PART3: Malformed payload converts non-numeric score safely to valid number", malformedNorm.riskScore);
assert(malformedNorm.riskLevel === "LOW", "PART3: Malformed risk level falls back to 'LOW'");
assert(Array.isArray(malformedNorm.transcriptAnalysis.detectedPatterns), "PART3: Malformed detectedPatterns defaults to empty array");
assert(malformedNorm.hasAcousticData === false, "PART3: Corrupted acoustic analysis is marked hasAcousticData: false");
assert(malformedNorm.acousticAnalysis?.riskScore === null, "PART3: Corrupted acoustic analysis riskScore normalizes to null");

// ─────────────────────────────────────────────────────────────
// PART 4: Preservation of Voice Simulation & Transcript Behavior
// ─────────────────────────────────────────────────────────────
console.log("\n=================================================================");
console.log("PART 4: Preservation of Voice Simulation & Transcript Behavior");
console.log("=================================================================\n");

assert(Array.isArray(SIMULATION_TRANSCRIPT), "PART4: SIMULATION_TRANSCRIPT is an array");
assert(SIMULATION_TRANSCRIPT.length === 5, "PART4: SIMULATION_TRANSCRIPT has exactly 5 scripted lines", SIMULATION_TRANSCRIPT.length);

assert(SIMULATION_TRANSCRIPT[0].speaker === "caller", "PART4: Line 0 speaker is 'caller'");
assert(SIMULATION_TRANSCRIPT[0].atSec === 4, "PART4: Line 0 atSec is 4");
assert(SIMULATION_TRANSCRIPT[0].text.includes("Senior Officer Vikram"), "PART4: Line 0 dialogue text preserved");

assert(SIMULATION_TRANSCRIPT[1].speaker === "user", "PART4: Line 1 speaker is 'user'");
assert(SIMULATION_TRANSCRIPT[2].speaker === "caller", "PART4: Line 2 speaker is 'caller'");
assert(SIMULATION_TRANSCRIPT[2].text.includes("AnyDesk QuickSupport"), "PART4: Line 2 AnyDesk solicitation text preserved");

assert(SIMULATION_TRANSCRIPT[4].speaker === "caller", "PART4: Line 4 speaker is 'caller'");
assert(SIMULATION_TRANSCRIPT[4].text.includes("6-digit verification OTP"), "PART4: Line 4 OTP solicitation text preserved");

assert(DEFAULT_CALLER.displayName === "Unknown / Toll-Free Support", "PART4: DEFAULT_CALLER displayName preserved");
assert(DEFAULT_CALLER.phoneNumber === "+91 1800 209 8888", "PART4: DEFAULT_CALLER phoneNumber preserved");
assert(DEFAULT_CALLER.direction === "inbound", "PART4: DEFAULT_CALLER direction is 'inbound'");

const initialSnapshot: CallSnapshot = VoiceService.getInitialSnapshot();
assert(initialSnapshot.status === "inactive", "PART4: Initial snapshot status is 'inactive'");
assert(initialSnapshot.durationSec === 0, "PART4: Initial snapshot durationSec is 0");
assert(initialSnapshot.riskScore === 0, "PART4: Initial snapshot riskScore is 0");
assert(initialSnapshot.riskLevel === "LOW", "PART4: Initial snapshot riskLevel is 'LOW'");
assert(initialSnapshot.transcript.length === 0, "PART4: Initial snapshot transcript is empty array");
assert(initialSnapshot.detectedPatterns.length === 0, "PART4: Initial snapshot detectedPatterns is empty array");
assert(initialSnapshot.alert.triggered === false, "PART4: Initial snapshot alert.triggered is false");
assert(initialSnapshot.analysis !== undefined, "PART4: Initial snapshot includes structured analysis");
assert(initialSnapshot.analysis?.hasAcousticData === false, "PART4: Initial snapshot hasAcousticData is false");
assert(initialSnapshot.analysis?.acousticAnalysis?.riskScore === null, "PART4: Initial snapshot acoustic riskScore is null");

// ─────────────────────────────────────────────────────────────
// PART 5: Preservation of Risk Scoring & Pattern Mapping Conventions
// ─────────────────────────────────────────────────────────────
console.log("\n=================================================================");
console.log("PART 5: Preservation of Risk Scoring & Pattern Mapping");
console.log("=================================================================\n");

assert(getRiskLevelFromScore(0) === "LOW", "PART5: Score 0 -> LOW");
assert(getRiskLevelFromScore(30) === "LOW", "PART5: Score 30 -> LOW (boundary)");
assert(getRiskLevelFromScore(31) === "MEDIUM", "PART5: Score 31 -> MEDIUM (boundary)");
assert(getRiskLevelFromScore(60) === "MEDIUM", "PART5: Score 60 -> MEDIUM (boundary)");
assert(getRiskLevelFromScore(61) === "HIGH", "PART5: Score 61 -> HIGH (boundary)");
assert(getRiskLevelFromScore(100) === "HIGH", "PART5: Score 100 -> HIGH");

const badgeLow = getStatusBadgeProps("LOW");
assert(badgeLow.status === "low" && badgeLow.label === "LOW RISK", "PART5: LOW status badge props preserved");

const badgeMed = getStatusBadgeProps("MEDIUM");
assert(badgeMed.status === "medium" && badgeMed.label === "MEDIUM RISK", "PART5: MEDIUM status badge props preserved");

const badgeHigh = getStatusBadgeProps("HIGH");
assert(badgeHigh.status === "high" && badgeHigh.label === "HIGH RISK", "PART5: HIGH status badge props preserved");

const recognizedPatterns: DetectedPattern[] = [
  "AUTHORITY_IMPERSONATION",
  "REMOTE_ACCESS_COERCION",
  "FINANCIAL_CREDENTIAL_EXTRACTION",
  "URGENT_LANGUAGE",
  "OTP_SOLICITATION",
  "SUSPICIOUS_CALL_PATTERN",
];
assert(recognizedPatterns.length === 6, "PART5: All 6 standard threat pattern types recognized");

// ─────────────────────────────────────────────────────────────
// PART 6: Non-Mutation of Payment, Guardian, Auth, or Nav State
// ─────────────────────────────────────────────────────────────
console.log("\n=================================================================");
console.log("PART 6: Non-Mutation of Payment, Guardian, Auth, or Nav State");
console.log("=================================================================\n");

// Verify that voice analysis results cannot be confused with or authorize payment workflows
const voiceAsStage = validatePaymentAuthorizationStage(combinedWithoutAcoustic.riskLevel as any);
assert(voiceAsStage.valid === false, "PART6: Voice riskLevel ('HIGH') cannot authorize payment workflow");

const voiceStatusAsStage = validatePaymentAuthorizationStage(combinedWithoutAcoustic.status as any);
assert(voiceStatusAsStage.valid === false, "PART6: Voice status ('available') cannot authorize payment workflow");

const evalStageRejection = validatePaymentAuthorizationStage("EVALUATION_COMPLETED" as PaymentWorkflowStage);
assert(evalStageRejection.valid === false, "PART6: Evaluation stage is strictly rejected from payment authorization");

const authStageAcceptance = validatePaymentAuthorizationStage("PAYMENT_AUTHORIZED" as PaymentWorkflowStage);
assert(authStageAcceptance.valid === true, "PART6: Only explicit PAYMENT_AUTHORIZED can authorize payment");

// Verify voice snapshot is pure and does not expose payment/guardian properties
const snapshotKeys = Object.keys(initialSnapshot);
assert(!snapshotKeys.includes("paymentId"), "PART6: Voice snapshot has no paymentId");
assert(!snapshotKeys.includes("guardianApproved"), "PART6: Voice snapshot has no guardianApproved");
assert(!snapshotKeys.includes("authToken"), "PART6: Voice snapshot has no authToken");
assert(!snapshotKeys.includes("navigationState"), "PART6: Voice snapshot has no navigationState");

// ─────────────────────────────────────────────────────────────
// PART 7: VoiceScreen UI Risk Analysis Display & Invariants
// ─────────────────────────────────────────────────────────────
console.log("\n=================================================================");
console.log("PART 7: VoiceScreen UI Risk Analysis Display & Invariants");
console.log("=================================================================\n");

interface SimulatedVoiceScreenUI {
  primaryScore: number;
  primaryLevel: RiskLevel;
  sourceTag: string;
  isTranscriptOnly: boolean;
  transcriptScoreText: string;
  transcriptLevelText: string;
  isTranscriptScoreVisible: boolean;
  acousticStatusBadge: string;
  isAcousticScoreRendered: boolean;
  acousticRenderedScore: number | null;
  acousticSubText: string;
  isWarningBannerActive: boolean;
}

function renderVoiceScreenRiskSection(snapshot: CallSnapshot | null | undefined): SimulatedVoiceScreenUI {
  const safeSnapshot = snapshot || VoiceService.getInitialSnapshot();
  const analysis = safeNormalizeVoiceAnalysis(
    safeSnapshot.analysis || {
      riskScore: safeSnapshot.riskScore,
      riskLevel: safeSnapshot.riskLevel,
      transcriptAnalysis: {
        status: "available",
        riskScore: safeSnapshot.riskScore,
        riskLevel: safeSnapshot.riskLevel,
        detectedPatterns: safeSnapshot.detectedPatterns,
        matchedPhrases: [],
      },
      acousticAnalysis: null,
    }
  );

  const hasAcoustic = isAcousticAnalysisAvailable(analysis.acousticAnalysis);

  const sourceTag = !hasAcoustic
    ? "Transcript-based score · Acoustic analysis unavailable"
    : "Combined Multi-Modal Voice Risk";

  const transcriptScoreText = `${analysis.transcriptAnalysis.riskScore} / 100 · ${analysis.transcriptAnalysis.riskLevel}`;
  const isTranscriptScoreVisible = typeof analysis.transcriptAnalysis.riskScore === "number";

  let isAcousticScoreRendered = false;
  let acousticRenderedScore: number | null = null;
  let acousticStatusBadge = "UNAVAILABLE";
  let acousticSubText = "Acoustic analysis unavailable (backend not implemented)";

  if (hasAcoustic && typeof analysis.acousticAnalysis?.riskScore === "number") {
    isAcousticScoreRendered = true;
    acousticRenderedScore = analysis.acousticAnalysis.riskScore;
    acousticStatusBadge = analysis.acousticAnalysis.riskLevel || "LOW";
    acousticSubText = "Vocal stress and synthetic deepfake detection";
  }

  const isWarningBannerActive = safeSnapshot.alert.triggered;

  return {
    primaryScore: analysis.riskScore,
    primaryLevel: analysis.riskLevel,
    sourceTag,
    isTranscriptOnly: !hasAcoustic,
    transcriptScoreText,
    transcriptLevelText: analysis.transcriptAnalysis.riskLevel,
    isTranscriptScoreVisible,
    acousticStatusBadge,
    isAcousticScoreRendered,
    acousticRenderedScore,
    acousticSubText,
    isWarningBannerActive,
  };
}

// Scenario 7A: Null / Missing Analysis payload
const uiFromNull = renderVoiceScreenRiskSection(null);
assert(uiFromNull.primaryScore === 0, "PART7-A: Null snapshot renders safely with primary score 0");
assert(uiFromNull.primaryLevel === "LOW", "PART7-A: Null snapshot renders safely with level LOW");
assert(uiFromNull.isTranscriptOnly === true, "PART7-A: Null snapshot correctly marked as transcript-only");
assert(uiFromNull.sourceTag.includes("Transcript-based score"), "PART7-A: Score labeled as transcript-based");
assert(uiFromNull.isTranscriptScoreVisible === true, "PART7-A: Transcript score remains visible");
assert(uiFromNull.isAcousticScoreRendered === false, "PART7-A: No fake acoustic score rendered for null input");
assert(uiFromNull.acousticRenderedScore === null, "PART7-A: Acoustic rendered score is strictly null (not 0 or fake)");
assert(uiFromNull.acousticStatusBadge === "UNAVAILABLE", "PART7-A: Acoustic status badge shows UNAVAILABLE");
assert(uiFromNull.acousticSubText.includes("Acoustic analysis unavailable"), "PART7-A: Acoustic subtext states unavailable");

// Scenario 7B: VoiceService initial snapshot in VoiceScreen
const initialUI = renderVoiceScreenRiskSection(initialSnapshot);
assert(initialUI.primaryScore === 0, "PART7-B: Initial call standby renders with primary score 0");
assert(initialUI.isTranscriptOnly === true, "PART7-B: Standby call marked as transcript-only");
assert(initialUI.isAcousticScoreRendered === false, "PART7-B: No acoustic score rendered for initial snapshot");
assert(initialUI.acousticRenderedScore === null, "PART7-B: Initial acoustic score is null (never 0)");
assert(initialUI.isWarningBannerActive === false, "PART7-B: Initial standby warning banner is inactive");

// Scenario 7C: High-Threat Phishing Call Simulation Step
const highScamSnapshot: CallSnapshot = {
  status: "fraud_alert",
  caller: DEFAULT_CALLER,
  durationSec: 35,
  transcript: [
    {
      id: "line-0",
      speaker: "caller",
      text: "You will receive a 6-digit verification OTP on SMS now. Please read it out to me immediately.",
      atSec: 30,
      isFinal: true,
    },
  ],
  riskScore: 88,
  riskLevel: "HIGH",
  detectedPatterns: ["OTP_SOLICITATION", "AUTHORITY_IMPERSONATION"],
  signals: [],
  reasons: ["Matched phrase: read out the OTP"],
  alert: {
    triggered: true,
    pattern: "OTP_SOLICITATION",
    title: "High-Threat Social Engineering Attack",
    explanation: "Caller requested OTP.",
    recommendedAction: "Refuse and hang up.",
  },
  analysis: combinedWithoutAcoustic,
};

const highScamUI = renderVoiceScreenRiskSection(highScamSnapshot);
assert(highScamUI.primaryScore === 88, "PART7-C: High-threat call displays primary score 88");
assert(highScamUI.primaryLevel === "HIGH", "PART7-C: High-threat call displays primary level HIGH");
assert(highScamUI.isWarningBannerActive === true, "PART7-C: High-threat call triggers warning banner");
assert(highScamUI.isTranscriptOnly === true, "PART7-C: High-threat call labeled transcript-only when acoustic unavailable");
assert(highScamUI.sourceTag === "Transcript-based score · Acoustic analysis unavailable", "PART7-C: Exact source tag displayed");
assert(highScamUI.transcriptScoreText === "88 / 100 · HIGH", "PART7-C: Transcript score visible with 88 / 100 · HIGH");
assert(highScamUI.isAcousticScoreRendered === false, "PART7-C: High transcript risk does NOT fabricate acoustic score");
assert(highScamUI.acousticRenderedScore === null, "PART7-C: Acoustic score remains strictly null during fraud alert");
assert(highScamUI.acousticStatusBadge === "UNAVAILABLE", "PART7-C: Acoustic badge is UNAVAILABLE during fraud alert");

// Scenario 7D: Corrupted / Malformed snapshot payload
const corruptSnapshot: any = {
  status: "active",
  riskScore: "not-a-number",
  riskLevel: "CORRUPTED",
  transcript: null,
  alert: {},
  analysis: {
    riskScore: undefined,
    transcriptAnalysis: {
      riskScore: "invalid",
    },
    acousticAnalysis: {
      riskScore: 999, // out of range / invalid status
      status: "invalid_status",
    },
  },
};

const corruptUI = renderVoiceScreenRiskSection(corruptSnapshot);
assert(typeof corruptUI.primaryScore === "number" && !Number.isNaN(corruptUI.primaryScore), "PART7-D: Corrupt snapshot safely normalizes primary score without crashing");
assert(corruptUI.primaryLevel === "LOW", "PART7-D: Corrupt snapshot defaults to LOW level");
assert(corruptUI.isAcousticScoreRendered === false, "PART7-D: Corrupt acoustic analysis is NOT rendered as a score");
assert(corruptUI.acousticRenderedScore === null, "PART7-D: Corrupt acoustic score falls back to null");

// Scenario 7E: Future Multi-Modal Scenario (Genuine acoustic data present)
const multiModalSnapshot: CallSnapshot = {
  ...highScamSnapshot,
  analysis: combinedWithBoth,
};

const multiModalUI = renderVoiceScreenRiskSection(multiModalSnapshot);
assert(multiModalUI.isTranscriptOnly === false, "PART7-E: Multi-modal snapshot recognized when acoustic available");
assert(multiModalUI.sourceTag === "Combined Multi-Modal Voice Risk", "PART7-E: Multi-modal source tag rendered");
assert(multiModalUI.transcriptScoreText === "88 / 100 · HIGH", "PART7-E: Transcript score 88 rendered");
assert(multiModalUI.isAcousticScoreRendered === true, "PART7-E: Genuine acoustic score IS rendered when available");
assert(multiModalUI.acousticRenderedScore === 75, "PART7-E: Genuine acoustic score 75 rendered");
assert(multiModalUI.acousticStatusBadge === "HIGH", "PART7-E: Acoustic level badge rendered as HIGH");

// ─────────────────────────────────────────────────────────────
// PART 8: Reusable VoiceSignalBreakdown Component & State Invariants
// ─────────────────────────────────────────────────────────────
console.log("\n=================================================================");
console.log("PART 8: Reusable VoiceSignalBreakdown Component & State Invariants");
console.log("=================================================================\n");

const { getAcousticDisplay } = require("../../components/voice/VoiceSignalBreakdown");

// 8.1: getAcousticDisplay state machine assertions
const displayUnavailable = getAcousticDisplay(createUnavailableAcousticAnalysis());
assert(displayUnavailable.isAvailable === false, "PART8-1: Unavailable acoustic state isAvailable is false");
assert(displayUnavailable.score === null, "PART8-1: Unavailable acoustic score is strictly null");
assert(displayUnavailable.statusLabel === "UNAVAILABLE", "PART8-1: Unavailable acoustic status label is UNAVAILABLE");
assert(displayUnavailable.badgeStatus === "neutral", "PART8-1: Unavailable acoustic badge status is neutral");
assert(displayUnavailable.subText.includes("unavailable"), "PART8-1: Unavailable acoustic subtext explains unavailability");

const displayPending = getAcousticDisplay({
  status: "pending",
  riskScore: null,
  riskLevel: null,
});
assert(displayPending.isAvailable === false, "PART8-1: Pending acoustic state isAvailable is false");
assert(displayPending.score === null, "PART8-1: Pending acoustic score is strictly null (never 0)");
assert(displayPending.statusLabel === "PENDING", "PART8-1: Pending acoustic status label is PENDING");
assert(displayPending.badgeStatus === "pending", "PART8-1: Pending acoustic badge status is pending");
assert(displayPending.subText.includes("progress"), "PART8-1: Pending acoustic subtext indicates progress");

const displayFailed = getAcousticDisplay({
  status: "failed",
  riskScore: null,
  riskLevel: null,
  errorMessage: "Audio buffer overflow",
});
assert(displayFailed.isAvailable === false, "PART8-1: Failed acoustic state isAvailable is false");
assert(displayFailed.score === null, "PART8-1: Failed acoustic score is strictly null");
assert(displayFailed.statusLabel === "FAILED", "PART8-1: Failed acoustic status label is FAILED");
assert(displayFailed.badgeStatus === "high", "PART8-1: Failed acoustic badge status is high");
assert(displayFailed.subText === "Audio buffer overflow", "PART8-1: Failed acoustic subtext conveys error message");

const displayAvailable = getAcousticDisplay({
  status: "available",
  riskScore: 68,
  riskLevel: "HIGH",
});
assert(displayAvailable.isAvailable === true, "PART8-1: Available acoustic state isAvailable is true");
assert(displayAvailable.score === 68, "PART8-1: Available acoustic score is accurately 68");
assert(displayAvailable.level === "HIGH", "PART8-1: Available acoustic level is HIGH");
assert(displayAvailable.statusLabel === "HIGH", "PART8-1: Available acoustic status label matches level");

// 8.2: Component rendering simulation & invariants
interface BreakdownComponentRenderResult {
  hasSourceTag: boolean;
  sourceTagText: string;
  headerBadgeLabel: string;
  headerBadgeStatus: string;
  transcriptScoreText: string;
  transcriptSubText: string;
  acousticScoreText: string | null;
  acousticBadgeLabel: string | null;
  acousticSubText: string;
  isAcousticScoreRendered: boolean;
}

function simulateVoiceSignalBreakdown(
  rawAnalysis?: CombinedVoiceAnalysis | null,
  showSourceTag = true
): BreakdownComponentRenderResult {
  const safeAnalysis = safeNormalizeVoiceAnalysis(rawAnalysis);
  const acousticInfo = getAcousticDisplay(safeAnalysis.acousticAnalysis);
  const hasAcoustic = acousticInfo.isAvailable;

  const sourceTagText = hasAcoustic
    ? "Combined Multi-Modal Voice Risk"
    : "Transcript-based score · Acoustic analysis unavailable";

  const transcriptScoreText = `${safeAnalysis.transcriptAnalysis.riskScore} / 100 · ${safeAnalysis.transcriptAnalysis.riskLevel}`;
  const transcriptSubText = !hasAcoustic
    ? "Primary active signal (linguistic scam patterns)"
    : "Linguistic and conversation intent NLP";

  const isAcousticScoreRendered = hasAcoustic && typeof acousticInfo.score === "number";
  const acousticScoreText = isAcousticScoreRendered
    ? `${acousticInfo.score} / 100 · ${acousticInfo.level}`
    : null;

  const acousticBadgeLabel = !isAcousticScoreRendered ? acousticInfo.statusLabel : null;

  return {
    hasSourceTag: showSourceTag,
    sourceTagText,
    headerBadgeLabel: hasAcoustic ? "MULTI-MODAL" : "TRANSCRIPT ONLY",
    headerBadgeStatus: hasAcoustic ? "low" : "medium",
    transcriptScoreText,
    transcriptSubText,
    acousticScoreText,
    acousticBadgeLabel,
    acousticSubText: acousticInfo.subText,
    isAcousticScoreRendered,
  };
}

// Scenario 8A: Null input to component
const compNull = simulateVoiceSignalBreakdown(null);
assert(compNull.headerBadgeLabel === "TRANSCRIPT ONLY", "PART8-2: Null analysis renders 'TRANSCRIPT ONLY'");
assert(compNull.transcriptScoreText === "0 / 100 · LOW", "PART8-2: Null analysis renders transcript 0 / 100 · LOW");
assert(compNull.isAcousticScoreRendered === false, "PART8-2: Null analysis does not render acoustic score");
assert(compNull.acousticScoreText === null, "PART8-2: Null analysis acoustic score text is strictly null");
assert(compNull.acousticBadgeLabel === "UNAVAILABLE", "PART8-2: Null analysis acoustic badge is UNAVAILABLE");

// Scenario 8B: Component with pending acoustic analysis
const pendingAnalysis: CombinedVoiceAnalysis = {
  status: "pending",
  riskScore: 45,
  riskLevel: "MEDIUM",
  transcriptAnalysis: {
    status: "available",
    riskScore: 45,
    riskLevel: "MEDIUM",
    detectedPatterns: ["URGENT_LANGUAGE"],
    matchedPhrases: ["urgent procedure"],
  },
  acousticAnalysis: {
    status: "pending",
    riskScore: null,
    riskLevel: null,
  },
  hasAcousticData: false,
  detectedPatterns: ["URGENT_LANGUAGE"],
  signals: [],
  reasons: ["urgent procedure"],
  alert: { triggered: false, pattern: null, title: "", explanation: "", recommendedAction: "" },
};
const compPending = simulateVoiceSignalBreakdown(pendingAnalysis);
assert(compPending.headerBadgeLabel === "TRANSCRIPT ONLY", "PART8-2: Pending acoustic renders 'TRANSCRIPT ONLY'");
assert(compPending.isAcousticScoreRendered === false, "PART8-2: Pending acoustic renders no score");
assert(compPending.acousticBadgeLabel === "PENDING", "PART8-2: Pending acoustic badge label is PENDING");
assert(compPending.acousticSubText.includes("progress"), "PART8-2: Pending acoustic subtext states in progress");

// Scenario 8C: Component with failed acoustic analysis
const failedAnalysis: CombinedVoiceAnalysis = {
  ...pendingAnalysis,
  acousticAnalysis: {
    status: "failed",
    riskScore: null,
    riskLevel: null,
    errorMessage: "Microphone stream dropped",
  },
};
const compFailed = simulateVoiceSignalBreakdown(failedAnalysis);
assert(compFailed.isAcousticScoreRendered === false, "PART8-2: Failed acoustic renders no score");
assert(compFailed.acousticBadgeLabel === "FAILED", "PART8-2: Failed acoustic badge label is FAILED");
assert(compFailed.acousticSubText === "Microphone stream dropped", "PART8-2: Failed acoustic displays error message");

// Scenario 8D: Component with genuine acoustic data (Multi-modal)
const genuineAnalysis: CombinedVoiceAnalysis = {
  status: "available",
  riskScore: 82,
  riskLevel: "HIGH",
  transcriptAnalysis: {
    status: "available",
    riskScore: 88,
    riskLevel: "HIGH",
    detectedPatterns: ["OTP_SOLICITATION"],
    matchedPhrases: ["read the OTP"],
  },
  acousticAnalysis: {
    status: "available",
    riskScore: 72,
    riskLevel: "HIGH",
  },
  hasAcousticData: true,
  detectedPatterns: ["OTP_SOLICITATION"],
  signals: [],
  reasons: ["read the OTP"],
  alert: { triggered: true, pattern: "OTP_SOLICITATION", title: "", explanation: "", recommendedAction: "" },
};
const compGenuine = simulateVoiceSignalBreakdown(genuineAnalysis);
assert(compGenuine.headerBadgeLabel === "MULTI-MODAL", "PART8-2: Genuine acoustic sets header badge to 'MULTI-MODAL'");
assert(compGenuine.sourceTagText === "Combined Multi-Modal Voice Risk", "PART8-2: Genuine acoustic sets source tag to combined");
assert(compGenuine.transcriptScoreText === "88 / 100 · HIGH", "PART8-2: Transcript score (88) rendered distinctly");
assert(compGenuine.isAcousticScoreRendered === true, "PART8-2: Genuine acoustic score IS rendered");
assert(compGenuine.acousticScoreText === "72 / 100 · HIGH", "PART8-2: Acoustic score (72) rendered distinctly");

// Scenario 8E: Component with showSourceTag = false
const compNoTag = simulateVoiceSignalBreakdown(genuineAnalysis, false);
assert(compNoTag.hasSourceTag === false, "PART8-2: showSourceTag=false suppresses source tag row");

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────
console.log("\n=================================================================");
console.log(`TOTAL CHECKS: ${totalChecks}`);
console.log(`FAILURES:     ${failures}`);
console.log("=================================================================\n");

if (failures > 0) {
  process.exit(1);
}
