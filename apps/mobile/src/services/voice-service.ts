import { CallSnapshot, CallerInfo, DetectedPattern, TranscriptLine } from "../types/voice";
import { RiskLevel } from "../types/risk";
import { getApiBaseUrl } from "./api-client";

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

// Matches voice/classifier.py's `active_threat_dimensions` vocabulary
// exactly (URGENCY, LEGAL_THREAT, AUTHORITY_IMPERSONATION,
// FINANCIAL_EXTRACTION, CREDENTIAL_HARVESTING) — see that file for the
// authoritative list.
const PATTERN_MAP: Record<string, DetectedPattern> = {
  authority_impersonation: "AUTHORITY_IMPERSONATION",
  urgency: "URGENT_LANGUAGE",
  legal_threat: "SUSPICIOUS_CALL_PATTERN",
  financial_extraction: "FINANCIAL_CREDENTIAL_EXTRACTION",
  credential_harvesting: "OTP_SOLICITATION",
};

const mapDetectedPatterns = (intents: string[]): DetectedPattern[] => {
  const mapped = intents.map((i) => PATTERN_MAP[i.toLowerCase()]).filter(Boolean) as DetectedPattern[];
  return Array.from(new Set(mapped));
};

const coercionToLevel = (level: string): RiskLevel =>
  level === "CRITICAL" ? "HIGH" : level === "ELEVATED" ? "MEDIUM" : "LOW";

interface ClassifierResponse {
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
          resolve(JSON.parse(event.data as string));
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
      };
    }

    const riskLevel = coercionToLevel(latest.coercion_level);
    const patterns = mapDetectedPatterns(latest.detected_intents);
    const riskScore = Math.round(latest.accumulated_risk * 100);

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
    };
  }

  static resetSession(): void {
    activeSession.close();
  }
}
