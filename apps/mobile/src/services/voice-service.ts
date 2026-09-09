import {
  CallSnapshot,
  CallerInfo,
  DetectedPattern,
  TranscriptLine,
  TranscriptAnalysis,
  AudioBufferMetadata,
  AudioBufferIngestionResult,
  buildCombinedVoiceAnalysis,
  createUnavailableAcousticAnalysis,
} from "../types/voice";
import { RiskLevel } from "../types/risk";
import { getApiBaseUrl } from "./api-client";
import {
  PATTERN_MAP,
  mapDetectedPatterns,
  coercionToLevel,
  scoreToRiskLevel,
  validateRiskScore,
  normalizeTranscriptResponse,
  normalizeAcousticResponse,
  normalizeCombinedResponse,
  parseWebSocketMessage,
} from "./voice-analysis-adapter";

// Re-export adapter utilities for convenient consumption
export {
  PATTERN_MAP,
  mapDetectedPatterns,
  coercionToLevel,
  scoreToRiskLevel,
  validateRiskScore,
  normalizeTranscriptResponse,
  normalizeAcousticResponse,
  normalizeCombinedResponse,
  parseWebSocketMessage,
};

export const DEFAULT_CALLER: CallerInfo = {
  displayName: "Unknown / Toll-Free Support",
  phoneNumber: "+91 1800 209 8888",
  direction: "inbound",
};

/**
 * Illustrative scripted call for the in-app "step through a scam call" demo
 * screen (VoiceScreen). The dialogue itself is a fixture — there's no live
 * microphone audio in this in-app flow — but each line is sent as a real
 * `text_chunk` to the backend's `/ws/voice-stream` classifier below, so the
 * risk scores, detected patterns, and alert copy shown to the user are real
 * ML output, not canned numbers. (Live call audio capture from an actual
 * phone call is a separate, native-Android concern — see
 * telemetry/LiveCallAudioService.kt — not this in-app demo screen.)
 */
export const SIMULATION_TRANSCRIPT: { speaker: "caller" | "user"; text: string; atSec: number }[] = [
  {
    speaker: "caller",
    text: "Hello, this is Senior Officer Vikram from Central Cyber Security Cell. Your bank account has been flagged for suspicious transactions.",
    atSec: 4,
  },
  {
    speaker: "user",
    text: "Wait, which account? What happened?",
    atSec: 9,
  },
  {
    speaker: "caller",
    text: "Your UPI ID is linked to illegal overseas transfers. You must install AnyDesk QuickSupport immediately so I can verify your device token.",
    atSec: 16,
  },
  {
    speaker: "user",
    text: "Why do I need to install AnyDesk? Can I call my branch?",
    atSec: 22,
  },
  {
    speaker: "caller",
    text: "Do NOT call the branch, this is urgent police procedure. You will receive a 6-digit verification OTP on SMS now. Please read it out to me immediately to cancel the penalty.",
    atSec: 30,
  },
];

export interface ClassifierResponse {
  accumulated_risk: number;
  coercion_level: "SAFE" | "ELEVATED" | "CRITICAL";
  detected_intents: string[];
  matched_phrases: string[];
  is_scam_alert: boolean;
  message: string;
}

/**
 * Thin real-time client for the backend's `/ws/voice-stream` classifier.
 * One socket per active "call" — the backend keeps a stateful leaky-bucket
 * accumulator per connection, so risk genuinely builds up across chunks the
 * same way it would for a real streamed call.
 */
class VoiceStreamSession {
  private socket: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;

  private connect(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    const wsUrl = getApiBaseUrl().replace(/^http/, "ws") + "/ws/voice-stream";
    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("Unable to connect to the voice classifier."));
      this.socket = ws;
    });
    return this.connectPromise;
  }

  async sendChunk(text: string): Promise<ClassifierResponse | null> {
    try {
      await this.connect();
    } catch {
      return null;
    }
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return null;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 5000);
      this.socket!.onmessage = (event) => {
        clearTimeout(timeout);
        try {
          const parsedMsg = parseWebSocketMessage(event.data);
          if (parsedMsg.category === "legacy_classifier") {
            resolve(parsedMsg.payload as ClassifierResponse);
          } else if (
            parsedMsg.category === "transcript_analysis" ||
            parsedMsg.category === "combined_analysis"
          ) {
            const transcript = normalizeTranscriptResponse(parsedMsg.payload);
            resolve({
              accumulated_risk: transcript.accumulatedRisk ?? transcript.riskScore / 100,
              coercion_level:
                transcript.coercionLevel ??
                (transcript.riskLevel === "HIGH"
                  ? "CRITICAL"
                  : transcript.riskLevel === "MEDIUM"
                  ? "ELEVATED"
                  : "SAFE"),
              detected_intents: transcript.intents ?? [],
              matched_phrases: transcript.matchedPhrases,
              is_scam_alert:
                transcript.riskScore >= 61 || transcript.coercionLevel === "CRITICAL",
              message:
                transcript.message ||
                (transcript.reasons && transcript.reasons.length > 0
                  ? transcript.reasons.join(". ")
                  : "Voice analysis completed"),
            });
          } else if (parsedMsg.category === "analysis_error") {
            resolve(null);
          } else if (parsedMsg.payload && typeof parsedMsg.payload === "object") {
            resolve(parsedMsg.payload as ClassifierResponse);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };
      this.socket!.send(JSON.stringify({ text_chunk: text }));
    });
  }

  close() {
    this.socket?.close();
    this.socket = null;
    this.connectPromise = null;
  }
}

const activeSession = new VoiceStreamSession();

export class VoiceService {
  static getInitialSnapshot(): CallSnapshot {
    const transcriptAnalysis: TranscriptAnalysis = {
      status: "available",
      riskScore: 0,
      riskLevel: "LOW",
      detectedPatterns: [],
      matchedPhrases: [],
      reasons: ["No active call"],
    };

    const analysis = buildCombinedVoiceAnalysis(
      transcriptAnalysis,
      createUnavailableAcousticAnalysis()
    );

    return {
      status: "inactive",
      caller: DEFAULT_CALLER,
      durationSec: 0,
      transcript: [],
      riskScore: 0,
      riskLevel: "LOW",
      detectedPatterns: [],
      signals: [
        {
          key: "voice",
          label: "Acoustic & Linguistic Scanner",
          score: 0,
          status: "ok",
          factors: [],
        },
      ],
      reasons: ["No active call"],
      alert: {
        triggered: false,
        pattern: null,
        title: "",
        explanation: "",
        recommendedAction: "",
      },
      analysis,
    };
  }

  /**
   * Streams every scripted line up to `step` through the real classifier
   * (rebuilding leaky-bucket state each call keeps this idempotent even if
   * the UI re-requests the same step) and returns a snapshot built from the
   * backend's actual response.
   */
  static async getActiveCallSnapshot(step: number): Promise<CallSnapshot> {
    activeSession.close();
    const upToStep = SIMULATION_TRANSCRIPT.slice(0, step);

    const lines: TranscriptLine[] = upToStep.map((t, idx) => ({
      id: `line-${idx}`,
      speaker: t.speaker,
      text: t.text,
      atSec: t.atSec,
      isFinal: true,
    }));
    const duration = lines.length > 0 ? lines[lines.length - 1].atSec + 3 : 5;

    let latest: ClassifierResponse | null = null;
    for (const line of upToStep) {
      if (line.speaker !== "caller") continue; // only the caller's speech carries scam signal
      latest = await activeSession.sendChunk(line.text);
    }

    if (!latest) {
      // Classifier unreachable — surface a real "unknown" state rather than
      // a fabricated risk number.
      const unavailableTranscript: TranscriptAnalysis = {
        status: "unavailable",
        riskScore: 0,
        riskLevel: "LOW",
        detectedPatterns: [],
        matchedPhrases: [],
        errorMessage: "Could not reach the voice classifier.",
        reasons: ["Unable to reach the voice classifier backend."],
      };
      const analysis = buildCombinedVoiceAnalysis(
        unavailableTranscript,
        createUnavailableAcousticAnalysis()
      );

      return {
        status: "active",
        caller: DEFAULT_CALLER,
        durationSec: duration,
        transcript: lines,
        riskScore: 0,
        riskLevel: "LOW",
        detectedPatterns: [],
        signals: [
          {
            key: "voice",
            label: "Acoustic & Linguistic Scanner",
            score: null,
            status: "unavailable",
            note: "Could not reach the voice classifier.",
            factors: [],
          },
        ],
        reasons: ["Unable to reach the voice classifier backend."],
        alert: { triggered: false, pattern: null, title: "", explanation: "", recommendedAction: "" },
        analysis,
      };
    }

    const riskLevel = coercionToLevel(latest.coercion_level);
    const patterns = mapDetectedPatterns(latest.detected_intents);
    const riskScore = Math.round(latest.accumulated_risk * 100);

    const transcriptAnalysis: TranscriptAnalysis = {
      status: "available",
      riskScore,
      riskLevel,
      detectedPatterns: patterns,
      matchedPhrases: latest.matched_phrases,
      intents: latest.detected_intents,
      coercionLevel: latest.coercion_level,
      accumulatedRisk: latest.accumulated_risk,
      message: latest.message,
      reasons: latest.matched_phrases.length > 0 ? latest.matched_phrases : [latest.message],
    };

    const analysis = buildCombinedVoiceAnalysis(
      transcriptAnalysis,
      createUnavailableAcousticAnalysis(),
      {
        timestamp: new Date().toISOString(),
        durationSec: duration,
        audioSource: "simulation",
      }
    );

    return {
      status: latest.is_scam_alert ? "fraud_alert" : "active",
      caller: DEFAULT_CALLER,
      durationSec: duration,
      transcript: lines,
      riskScore,
      riskLevel,
      detectedPatterns: patterns,
      signals: [
        {
          key: "voice",
          label: "Live Voice Scam Classifier",
          score: latest.accumulated_risk,
          status: "ok",
          factors: latest.matched_phrases.map((phrase) => ({
            label: `Matched phrase: "${phrase}"`,
            contribution: latest.accumulated_risk,
            direction: "increases" as const,
          })),
        },
      ],
      reasons: latest.matched_phrases.length > 0 ? latest.matched_phrases : [latest.message],
      alert: latest.is_scam_alert
        ? {
            triggered: true,
            pattern: patterns[0] || "SUSPICIOUS_CALL_PATTERN",
            title: "High-Threat Social Engineering Attack",
            explanation: latest.message,
            recommendedAction: "Refuse any OTP/PIN request, end this call immediately, and report the caller.",
          }
        : { triggered: false, pattern: null, title: "", explanation: "", recommendedAction: "" },
      analysis,
    };
  }

  static resetSession(): void {
    activeSession.close();
  }

  /**
   * Ingestion boundary for real-time audio buffer events.
   *
   * Prepared for future acoustic-analysis ML transport:
   * - Does NOT compute risk locally.
   * - Does NOT fabricate acoustic detection scores.
   * - Does NOT modify transcript analysis or WebSocket { text_chunk } traffic.
   * - Explicitly returns 'unavailable' while the acoustic ML backend is pending.
   */
  static ingestAudioBuffer(metadata: AudioBufferMetadata): AudioBufferIngestionResult {
    // Validate metadata
    if (
      !metadata ||
      typeof metadata !== "object" ||
      typeof metadata.bufferSize !== "number" ||
      isNaN(metadata.bufferSize) ||
      metadata.bufferSize <= 0
    ) {
      return {
        status: "rejected",
        reason: "Malformed or invalid audio buffer metadata (bufferSize must be a positive number)",
        timestamp: Date.now(),
      };
    }

    // Since the backend acoustic-analysis model is not yet implemented:
    // Safely ignore audio buffers for risk calculation and return explicit unavailable state
    return {
      status: "unavailable",
      reason: "Acoustic ML backend is not yet implemented; audio buffer recorded for metadata telemetry only",
      timestamp: Date.now(),
      bufferMetadata: metadata,
    };
  }
}
