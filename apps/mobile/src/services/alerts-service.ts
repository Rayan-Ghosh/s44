import { ApiClient } from "./api-client";
import { AlertCategory, SecurityAlert } from "../types/alert";

const inferCategory = (summary: string): AlertCategory => {
  const s = summary.toLowerCase();
  if (s.includes("call") || s.includes("voice") || s.includes("otp")) return "voice";
  if (s.includes("device") || s.includes("login")) return "device";
  return "payment";
};

const ACTION_COPY: Record<"HIGH" | "MEDIUM" | "LOW", string[]> = {
  HIGH: [
    "Review this transaction carefully in the Payments tab before taking any action.",
    "If you did not initiate this or were pressured on a phone call, cancel or report it.",
    "Never share your UPI PIN or an OTP with anyone who contacts you about this.",
  ],
  MEDIUM: [
    "Double-check the recipient and amount before confirming.",
    "Contact your bank directly if anything about this feels unfamiliar.",
  ],
  LOW: ["No action needed — this is shown for your awareness."],
};

/**
 * Backed by the real GET /api/v1/alerts + GET /api/v1/risk/{transaction_id}
 * endpoints. The backend's Alert model (spec §18) only stores a `summary`
 * string, severity, status, and transaction_id — it has no narrative
 * "what happened / why flagged / what to do" fields, so `whatHappened`
 * reuses the real summary and `whyFlagged` is filled from the transaction's
 * real risk factors when available. `whatYouShouldDo` is static guidance
 * copy keyed off real severity, not per-alert fabricated content.
 */
export class AlertsService {
  static async getAlerts(userId?: number): Promise<SecurityAlert[]> {
    const res = await ApiClient.get<any[]>("/api/v1/alerts");
    if (!res.data || !Array.isArray(res.data)) return [];

    const alerts = await Promise.all(
      res.data.map(async (a: any): Promise<SecurityAlert> => {
        const severity: SecurityAlert["severity"] = a.severity || "MEDIUM";
        let whyFlagged: string[] = [];
        let riskScore: number | undefined;

        if (a.transaction_id) {
          const riskRes = await ApiClient.get<any>(`/api/v1/risk/${a.transaction_id}`);
          if (riskRes.data) {
            riskScore = riskRes.data.final_score;
            whyFlagged = (riskRes.data.risk_factors || [])
              .map((f: any) => f.explanation)
              .filter(Boolean);
          }
        }

        return {
          id: String(a.id),
          category: inferCategory(a.summary || ""),
          severity,
          title: a.summary || "Security Alert",
          description: a.summary || "A security event was detected.",
          timestamp: a.created_at
            ? new Date(a.created_at).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })
            : "Recently",
          isRead: a.status !== "OPEN",
          metadata: { riskScore },
          whatHappened: a.summary || "A security event was detected on your account.",
          whyFlagged: whyFlagged.length > 0 ? whyFlagged : [a.summary || "Flagged by the fraud detection engine."],
          whatYouShouldDo: ACTION_COPY[severity] || ACTION_COPY.MEDIUM,
        };
      })
    );

    return alerts;
  }
}
