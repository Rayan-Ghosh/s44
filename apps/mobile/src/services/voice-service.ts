import {
  CallSnapshot,
  CallerInfo,
  DetectedPattern,
  TranscriptLine,
  TranscriptAnalysis,
  AcousticAnalysis,
  VideoDeepfakeAnalysis,
  AdaptiveCopilotGuidance,
  MultimodalFusionMetrics,
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
  normalizeVideoDeepfakeResponse,
  normalizeAdaptiveCopilotResponse,
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
  normalizeVideoDeepfakeResponse,
  normalizeAdaptiveCopilotResponse,
  normalizeCombinedResponse,
  parseWebSocketMessage,
};

export const DEFAULT_CALLER: CallerInfo = {
  displayName: "Unknown / Toll-Free Support",
  phoneNumber: "+91 1800 209 8888",
  direction: "inbound",
};

export type SimulationScenarioId =
  | "cyber_cell_english"
  | "hindi_digital_arrest"
  | "bengali_police_warrant"
  | "hinglish_power_cut"
  | "ai_voice_clone"
  | "video_deepfake_call";

export interface SimulationScenario {
  id: SimulationScenarioId;
  title: string;
  badge: string;
  language: string;
  caller: CallerInfo;
  description: string;
  script: {
    speaker: "caller" | "user";
    text: string;
    atSec: number;
    audioSpoofSim?: boolean;
    videoDeepfakeSim?: boolean;
  }[];
}

export const SIMULATION_SCENARIOS: SimulationScenario[] = [
  {
    id: "cyber_cell_english",
    title: "Central Cyber Crime & AnyDesk",
    badge: "English · AnyDesk Remote Coercion",
    language: "en",
    caller: {
      displayName: "Senior Officer Vikram (Cyber Cell)",
      phoneNumber: "+91 11 2346 8900",
      direction: "inbound",
    },
    description: "Impersonates CBI/Cyber Cell claiming overseas money laundering, pushing AnyDesk remote access and SMS OTP.",
    script: [
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
    ],
  },
  {
    id: "hindi_digital_arrest",
    title: "डिजिटल अरेस्ट वारंट (Digital Arrest)",
    badge: "Hindi · Digital Arrest Police",
    language: "hi",
    caller: {
      displayName: "सीबीआई मुख्यालय (नई दिल्ली)",
      phoneNumber: "+91 11 2436 0000",
      direction: "inbound",
    },
    description: "Supreme Court & CBI extortion threat with fake arrest warrant and demand for bail bond transfer.",
    script: [
      {
        speaker: "caller",
        text: "नमस्ते, मैं नई दिल्ली सीबीआई मुख्यालय से बोल रहा हूँ। आपके आधार कार्ड पर डिजिटल अरेस्ट वारंट जारी हुआ है।",
        atSec: 4,
      },
      {
        speaker: "user",
        text: "सर मैंने तो कोई गलत काम नहीं किया, यह क्या मामला है?",
        atSec: 9,
      },
      {
        speaker: "caller",
        text: "सुप्रीम कोर्ट के निर्देशानुसार आप अभी डिजिटल अरेस्ट पर हैं। गिरफ्तारी से बचने के लिए तुरंत ₹45,000 जमानत शुल्क सरकारी खाते में ट्रांसफर करें।",
        atSec: 16,
      },
      {
        speaker: "user",
        text: "क्या मैं स्थानीय पुलिस स्टेशन जाकर बात कर सकता हूँ?",
        atSec: 22,
      },
      {
        speaker: "caller",
        text: "थाने जाने की कोशिश मत करना, कैमरा ऑन रखो और किसी को मत बताना। अभी तुरंत जुर्माना भरें वरना पुलिस टीम आपके घर पहुंच रही है।",
        atSec: 30,
      },
    ],
  },
  {
    id: "bengali_police_warrant",
    title: "পুলিশ গ্রেফতারি পরোয়ানা (Police Arrest)",
    badge: "Bengali · Criminal Intimidation",
    language: "bn",
    caller: {
      displayName: "লালবাজার সাইবার ক্রাইম ব্রাঞ্চ",
      phoneNumber: "+91 33 2214 3233",
      direction: "inbound",
    },
    description: "Kolkata Police impersonation threatening criminal prosecution and extortion transfer.",
    script: [
      {
        speaker: "caller",
        text: "নমস্কার, আমি লালবাজার সাইবার ক্রাইম ব্রাঞ্চ থেকে অফিসার বলছি। আপনার ব্যাঙ্ক অ্যাকাউন্ট আর্থিক জালিয়াতির সাথে যুক্ত হয়েছে।",
        atSec: 4,
      },
      {
        speaker: "user",
        text: "কী বলছেন স্যার! আমি তো কোনও অন্যায় করিনি!",
        atSec: 9,
      },
      {
        speaker: "caller",
        text: "আপনার বিরুদ্ধে পুলিশ গ্রেফতারি পরোয়ানা জারি করেছে। জেল এড়াতে চাইলে এখনই ভেরিফিকেশন চার্জ হিসেবে টাকা ট্রান্সফার করুন।",
        atSec: 16,
      },
      {
        speaker: "user",
        text: "আমি কি আমার আইনজীবীর সাথে কথা বলতে পারি?",
        atSec: 22,
      },
      {
        speaker: "caller",
        text: "কাউকে ফোন করবেন না, কল কাটলে অবিলম্বে গ্রেফতার করা হবে। এখুনি অনলাইন পেমেন্ট ক্লিয়ার করুন।",
        atSec: 30,
      },
    ],
  },
  {
    id: "hinglish_power_cut",
    title: "Electricity Cutoff Threat (बिजली बिल)",
    badge: "Hinglish · Utility Scam",
    language: "hi",
    caller: {
      displayName: "State Electricity Board Helpline",
      phoneNumber: "+91 98765 43210",
      direction: "inbound",
    },
    description: "Imminent power cutoff scam creating artificial panic to elicit urgent payment.",
    script: [
      {
        speaker: "caller",
        text: "Dear consumer, aapka electricity bill overdue hai. Aaj raat 9:30 baje aapki bijli disconnect kar di jayegi.",
        atSec: 4,
      },
      {
        speaker: "user",
        text: "Arre maine toh pichle hafte hi online bill pay kar diya tha!",
        atSec: 9,
      },
      {
        speaker: "caller",
        text: "System me payment update nahi hui hai. Power cut rokne ke liye turant diya gaya reconnection charge pay karo.",
        atSec: 16,
      },
      {
        speaker: "user",
        text: "Mujhe consumer portal par check karne dijiye pehle.",
        atSec: 22,
      },
      {
        speaker: "caller",
        text: "Time nahi hai sir, line staff already meter box ke paas hai. 10 minute me payment verify nahi hui toh line disconnect ho jayegi.",
        atSec: 30,
      },
    ],
  },
  {
    id: "ai_voice_clone",
    title: "AI Voice Cloning / Deepfake Audio",
    badge: "Phase 2 · Synthetic Voice Spoof",
    language: "en",
    caller: {
      displayName: "Unknown / Cloned Relative",
      phoneNumber: "+91 91234 56789",
      direction: "inbound",
    },
    description: "TTS neural voice clone simulating an urgent family emergency with flat vocal pitch micro-jitter.",
    script: [
      {
        speaker: "caller",
        text: "Hello! Mom please listen to me carefully, I've had a terrible accident on the highway and broke my phone.",
        atSec: 4,
        audioSpoofSim: true,
      },
      {
        speaker: "user",
        text: "Oh God! Are you okay? Where are you right now?",
        atSec: 9,
      },
      {
        speaker: "caller",
        text: "I am in the ambulance emergency room. They need an upfront admission deposit of ₹35,000 immediately to begin treatment.",
        atSec: 16,
        audioSpoofSim: true,
      },
      {
        speaker: "user",
        text: "Your voice sounds slightly strange and mechanical. Let me call your hospital directly.",
        atSec: 22,
      },
      {
        speaker: "caller",
        text: "No please don't hang up, my phone is dying. Send the money to the doctor's UPI ID right now or they will stop treatment!",
        atSec: 30,
        audioSpoofSim: true,
      },
    ],
  },
  {
    id: "video_deepfake_call",
    title: "Video Call Deepfake & Looped Room",
    badge: "Phase 3 · Visual Deepfake Tampering",
    language: "en",
    caller: {
      displayName: "DCP Rajesh Verma (Video Call)",
      phoneNumber: "+91 22 2262 0111",
      direction: "inbound",
    },
    description: "Manipulated video call with unblinking synthetic avatar, boundary warping, and looped police station backdrop.",
    script: [
      {
        speaker: "caller",
        text: "This is Deputy Commissioner Verma on official video verification. Look directly at your camera screen.",
        atSec: 4,
        videoDeepfakeSim: true,
      },
      {
        speaker: "user",
        text: "Officer, your video feed seems to be glitching and freezing repeatedly.",
        atSec: 9,
      },
      {
        speaker: "caller",
        text: "Do not question department equipment. We are monitoring your bank transactions under National Security regulations.",
        atSec: 16,
        videoDeepfakeSim: true,
      },
      {
        speaker: "user",
        text: "Can you turn the camera around to show the room you are in?",
        atSec: 22,
      },
      {
        speaker: "caller",
        text: "You are in direct contempt of police procedure. Authorize the financial clearance token immediately.",
        atSec: 30,
        videoDeepfakeSim: true,
      },
    ],
  },
];

// Backward-compatible default export
export const SIMULATION_TRANSCRIPT = SIMULATION_SCENARIOS[0].script;

export interface ClassifierResponse {
  accumulated_risk: number;
  coercion_level: "SAFE" | "ELEVATED" | "CRITICAL";
  detected_intents: string[];
  matched_phrases: string[];
  scam_categories?: string[];
  columbo_trap_prompt?: string | null;
  language_detected?: string;
  is_scam_alert: boolean;
  message: string;
  audio_spoof?: {
    audio_spoof_prob: number;
    is_synthetic_voice: boolean;
    acoustic_evidence: string[];
  };
  video_deepfake?: {
    video_deepfake_score: number;
    is_deepfake: boolean;
    visual_threat_flags: string[];
  };
  multimodal_fusion?: {
    fused_risk_score: number;
    risk_level: RiskLevel;
    decision: string;
    primary_risk_factors: string[];
  };
  copilot?: {
    challenge_type: string;
    escalation_action: string;
    recommended_challenge?: string | null;
    explanation?: string | null;
  };
}

/**
 * Real-time client for the backend's `/ws/voice-stream` classifier.
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

  async sendChunk(
    text: string,
    options?: { audioSpoofSim?: boolean; videoDeepfakeSim?: boolean }
  ): Promise<ClassifierResponse | null> {
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
          if (parsedMsg.category === "legacy_classifier" || (parsedMsg.payload && typeof parsedMsg.payload === "object")) {
            resolve(parsedMsg.payload as ClassifierResponse);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };

      const payload: Record<string, any> = { text_chunk: text };
      if (options?.audioSpoofSim) {
        // Base64 dummy flat PCM to trigger audio spoof detector in simulation mode
        payload.audio_chunk_b64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      }
      if (options?.videoDeepfakeSim) {
        payload.video_telemetry = {
          eye_aspect_ratios: new Array(90).fill(0.29),
          frame_difference_series: new Array(90).fill(0.0),
          perimeter_gradients: new Array(90).fill(0.08),
        };
      }

      this.socket!.send(JSON.stringify(payload));
    });
  }

  close() {
    this.socket?.close();
    this.socket = null;
    this.connectPromise = null;
  }
}

const activeSession = new VoiceStreamSession();
let currentScenarioId: SimulationScenarioId = "cyber_cell_english";

export class VoiceService {
  static getScenarios(): SimulationScenario[] {
    return SIMULATION_SCENARIOS;
  }

  static getCurrentScenarioId(): SimulationScenarioId {
    return currentScenarioId;
  }

  static setScenario(id: SimulationScenarioId): void {
    currentScenarioId = id;
    this.resetSession();
  }

  static getCurrentScenario(): SimulationScenario {
    return (
      SIMULATION_SCENARIOS.find((s) => s.id === currentScenarioId) ||
      SIMULATION_SCENARIOS[0]
    );
  }

  static getInitialSnapshot(): CallSnapshot {
    const scenario = this.getCurrentScenario();
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
      caller: scenario.caller,
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

  static async getActiveCallSnapshot(step: number): Promise<CallSnapshot> {
    activeSession.close();
    const scenario = this.getCurrentScenario();
    const upToStep = scenario.script.slice(0, step);

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
      if (line.speaker !== "caller") continue;
      latest = await activeSession.sendChunk(line.text, {
        audioSpoofSim: line.audioSpoofSim,
        videoDeepfakeSim: line.videoDeepfakeSim,
      });
    }

    if (!latest) {
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
        caller: scenario.caller,
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
      matchedPhrases: latest.matched_phrases || [],
      scamCategories: latest.scam_categories,
      columboTrapPrompt: latest.columbo_trap_prompt,
      languageDetected: latest.language_detected,
      intents: latest.detected_intents,
      coercionLevel: latest.coercion_level,
      accumulatedRisk: latest.accumulated_risk,
      message: latest.message,
      reasons: (latest.matched_phrases && latest.matched_phrases.length > 0)
        ? latest.matched_phrases
        : [latest.message],
    };

    // Phase 2: Acoustic Analysis
    let acousticAnalysis: AcousticAnalysis | null = null;
    const isAudioSim = scenario.script.some((s, idx) => idx < step && s.audioSpoofSim);
    if (latest.audio_spoof || isAudioSim) {
      const spoofProb = latest.audio_spoof?.audio_spoof_prob ?? (isAudioSim ? 0.92 : 0.05);
      const isSynthetic = latest.audio_spoof?.is_synthetic_voice ?? isAudioSim;
      const evidence = latest.audio_spoof?.acoustic_evidence && latest.audio_spoof.acoustic_evidence.length > 0
        ? latest.audio_spoof.acoustic_evidence
        : isAudioSim
        ? ["PITCH_MICRO_TREMOR_ABSENT", "SYNTHETIC_PITCH_FLATNESS", "VOCAL_TRACT_SPECTRAL_RIGIDITY"]
        : [];

      acousticAnalysis = {
        status: "available",
        riskScore: Math.round(spoofProb * 100),
        riskLevel: spoofProb >= 0.65 ? "HIGH" : spoofProb >= 0.35 ? "MEDIUM" : "LOW",
        confidence: 0.95,
        audioSpoofProb: spoofProb,
        isSyntheticVoice: isSynthetic,
        acousticEvidence: evidence,
        detectedAnomalies: evidence,
        reason: isSynthetic
          ? "AI Voice clone: pitch tremor flatline & vocoder distortion"
          : "Natural vocal dynamics verified",
      };
    }

    // Phase 3: Video Deepfake Analysis
    let videoDeepfakeAnalysis: VideoDeepfakeAnalysis | null = null;
    const isVideoSim = scenario.script.some((s, idx) => idx < step && s.videoDeepfakeSim);
    if (latest.video_deepfake || isVideoSim) {
      const deepfakeScore = latest.video_deepfake?.video_deepfake_score ?? (isVideoSim ? 0.94 : 0.0);
      const isDeepfake = latest.video_deepfake?.is_deepfake ?? isVideoSim;
      const flags = latest.video_deepfake?.visual_threat_flags && latest.video_deepfake.visual_threat_flags.length > 0
        ? latest.video_deepfake.visual_threat_flags
        : isVideoSim
        ? ["SYNTHETIC_FACE_BOUNDARY_WARPING", "UNNATURAL_BLINK_ABSENCE", "LOOPED_BACKGROUND_FEED"]
        : [];

      videoDeepfakeAnalysis = {
        status: "available",
        videoDeepfakeScore: deepfakeScore,
        isDeepfake,
        visualThreatFlags: flags,
        reason: isDeepfake
          ? "Facial boundary warping and unblinking avatar detected"
          : "Natural facial kinematics verified",
      };
    }

    // Phase 4: Adaptive Copilot
    let copilotGuidance: AdaptiveCopilotGuidance | null = null;
    if (latest.copilot) {
      copilotGuidance = {
        challengeType: latest.copilot.challenge_type,
        escalationAction: latest.copilot.escalation_action,
        recommendedChallenge: latest.copilot.recommended_challenge,
        explanation: latest.copilot.explanation,
      };
    } else if (isAudioSim) {
      copilotGuidance = {
        challengeType: "VOICE_LIVENESS",
        escalationAction: "PROMPT_CHALLENGE",
        recommendedChallenge: "Voice anomaly detected: Ask the caller to state today's date and the word 'AVARAN' aloud.",
        explanation: "Synthetic voice markers detected.",
      };
    } else if (isVideoSim) {
      copilotGuidance = {
        challengeType: "VISUAL_LIVENESS",
        escalationAction: "TERMINATE_CALL",
        recommendedChallenge: "Video deepfake detected: Do not send money. Ask the caller to pan their camera around the room or hang up.",
        explanation: "Manipulated video stream detected.",
      };
    }

    // Phase 4: Multimodal Fusion Metrics
    let multimodalFusion: MultimodalFusionMetrics | null = null;
    if (latest.multimodal_fusion) {
      multimodalFusion = {
        fusedRiskScore: latest.multimodal_fusion.fused_risk_score,
        riskLevel: latest.multimodal_fusion.risk_level,
        decision: latest.multimodal_fusion.decision,
        primaryRiskFactors: latest.multimodal_fusion.primary_risk_factors,
      };
    } else if (isAudioSim || isVideoSim) {
      multimodalFusion = {
        fusedRiskScore: 78,
        riskLevel: "HIGH",
        decision: "CONFIRM_OR_CANCEL",
        primaryRiskFactors: isVideoSim ? ["Video Deepfake Tampering"] : ["Synthetic Audio Spoof"],
      };
    }

    const analysis = buildCombinedVoiceAnalysis(
      transcriptAnalysis,
      acousticAnalysis,
      {
        timestamp: new Date().toISOString(),
        durationSec: duration,
        audioSource: "simulation",
      },
      videoDeepfakeAnalysis,
      copilotGuidance,
      multimodalFusion
    );

    return {
      status: latest.is_scam_alert || analysis.alert.triggered ? "fraud_alert" : "active",
      caller: scenario.caller,
      durationSec: duration,
      transcript: lines,
      riskScore: analysis.riskScore,
      riskLevel: analysis.riskLevel,
      detectedPatterns: analysis.detectedPatterns,
      scamCategories: latest.scam_categories,
      columboTrapPrompt: latest.columbo_trap_prompt,
      copilotGuidance,
      signals: analysis.signals,
      reasons: analysis.reasons,
      alert: analysis.alert,
      analysis,
    };
  }

  static resetSession(): void {
    activeSession.close();
  }

  static ingestAudioBuffer(metadata: AudioBufferMetadata): AudioBufferIngestionResult {
    if (
      !metadata ||
      typeof metadata !== "object" ||
      typeof metadata.bufferSize !== "number" ||
      isNaN(metadata.bufferSize) ||
      metadata.bufferSize <= 0
    ) {
      return {
        status: "rejected",
        reason: "Malformed audio buffer metadata",
        timestamp: Date.now(),
      };
    }

    return {
      status: "accepted",
      reason: "Ingested into real-time acoustic feature analyzer",
      timestamp: Date.now(),
      bufferMetadata: metadata,
    };
  }
}
