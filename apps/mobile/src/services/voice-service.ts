import { CallSnapshot, CallerInfo, TranscriptLine } from "../types/voice";

export const DEFAULT_CALLER: CallerInfo = {
  displayName: "Unknown / Toll-Free Support",
  phoneNumber: "+91 1800 209 8888",
  direction: "inbound",
};

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

export class VoiceService {
  static getInitialSnapshot(): CallSnapshot {
    return {
      status: "inactive",
      caller: DEFAULT_CALLER,
      durationSec: 0,
      transcript: [],
      riskScore: 12,
      riskLevel: "LOW",
      detectedPatterns: [],
      signals: [
        {
          key: "voice",
          label: "Acoustic & Linguistic Scanner",
          score: 0.12,
          status: "ok",
          factors: [],
        },
      ],
      reasons: ["Call background noise within standard threshold"],
      alert: {
        triggered: false,
        pattern: null,
        title: "",
        explanation: "",
        recommendedAction: "",
      },
    };
  }

  static getActiveCallSnapshot(step: number): CallSnapshot {
    const lines: TranscriptLine[] = SIMULATION_TRANSCRIPT.slice(0, step).map((t, idx) => ({
      id: `line-${idx}`,
      speaker: t.speaker,
      text: t.text,
      atSec: t.atSec,
      isFinal: true,
    }));

    const duration = lines.length > 0 ? lines[lines.length - 1].atSec + 3 : 5;

    if (step <= 1) {
      return {
        status: "active",
        caller: DEFAULT_CALLER,
        durationSec: duration,
        transcript: lines,
        riskScore: 48,
        riskLevel: "MEDIUM",
        detectedPatterns: ["AUTHORITY_IMPERSONATION", "URGENT_LANGUAGE"],
        signals: [
          {
            key: "voice",
            label: "Authority Impersonation Detector",
            score: 0.65,
            status: "ok",
            factors: [
              { label: "Claims of police / regulatory authority", contribution: 0.4, direction: "increases" },
            ],
          },
        ],
        reasons: ["Caller claiming official regulatory authority without verification"],
        alert: {
          triggered: false,
          pattern: null,
          title: "",
          explanation: "",
          recommendedAction: "",
        },
      };
    }

    if (step <= 3) {
      return {
        status: "fraud_alert",
        caller: DEFAULT_CALLER,
        durationSec: duration,
        transcript: lines,
        riskScore: 78,
        riskLevel: "HIGH",
        detectedPatterns: ["AUTHORITY_IMPERSONATION", "REMOTE_ACCESS_COERCION", "URGENT_LANGUAGE"],
        signals: [
          {
            key: "voice",
            label: "Remote Access Detection",
            score: 0.88,
            status: "ok",
            factors: [
              { label: "Solicitation to install remote desktop tool (AnyDesk)", contribution: 0.55, direction: "increases" },
            ],
          },
        ],
        reasons: [
          "Urgent demand to install remote control software",
          "Attempt to isolate customer from bank branch",
        ],
        alert: {
          triggered: true,
          pattern: "REMOTE_ACCESS_COERCION",
          title: "Remote Access Scam Detected",
          explanation: "The caller is asking you to install AnyDesk. Genuine bank and government officials will never ask you to install remote desktop software.",
          recommendedAction: "Do not install AnyDesk or grant device permissions. Hang up immediately.",
        },
      };
    }

    // Step >= 4 (Full Phishing with OTP solicitation)
    return {
      status: "fraud_alert",
      caller: DEFAULT_CALLER,
      durationSec: duration,
      transcript: lines,
      riskScore: 91,
      riskLevel: "HIGH",
      detectedPatterns: [
        "AUTHORITY_IMPERSONATION",
        "REMOTE_ACCESS_COERCION",
        "OTP_SOLICITATION",
        "URGENT_LANGUAGE",
      ],
      signals: [
        {
          key: "voice",
          label: "Voice Phishing Engine",
          score: 0.95,
          status: "ok",
          factors: [
            { label: "Direct solicitation of 6-digit SMS OTP", contribution: 0.6, direction: "increases" },
            { label: "Threats of penalty and artificial urgency", contribution: 0.35, direction: "increases" },
          ],
        },
      ],
      reasons: [
        "OTP solicitation detected in live conversation",
        "Remote desktop application coercion",
        "Impersonation of law enforcement officials",
      ],
      alert: {
        triggered: true,
        pattern: "OTP_SOLICITATION",
        title: "High-Threat Social Engineering Attack",
        explanation: "Never share an OTP or allow remote access because of an unsolicited call. Banks and police will NEVER ask for your OTP.",
        recommendedAction: "Refuse the OTP request, end this call immediately, and report the scammer.",
      },
    };
  }
}
