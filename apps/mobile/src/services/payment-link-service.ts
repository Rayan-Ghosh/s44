import { ApiClient } from "./api-client";
import { PaymentService, UserTransaction, RiskFactorItem } from "./payment-service";
import { RiskService } from "./risk-service";
import { AlertService } from "./alert-service";
import { getDeviceIdentifier, getDeviceName, getDeviceType } from "./device-info-service";
import { getRiskLevelFromScore } from "../utils/risk-scoring";

export interface PaymentRequest {
  id: string;
  merchantName: string;
  payeeUpiId: string;
  amount: number;
  currency: string;
  description?: string;
  originalUrl?: string;
  sourceApp?: string;
  sourceType: "payment_link" | "upi" | "manual" | "deep_link";
  status:
    | "Detected"
    | "Analyzing"
    | "Needs Review"
    | "Waiting For User"
    | "Waiting For Guardian"
    | "Approved"
    | "Launching Payment App"
    | "Payment App Opened"
    | "Completed"
    | "Cancelled"
    | "Blocked"
    | "Reported";
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskFactors: RiskFactorItem[];
  reasons: string[];
  createdAt: string;
  updatedAt: string;
}

class PaymentLinkManager {
  /**
   * Parses a raw URI string (UPI, HTTP, or deep link) into a structured
   * PaymentRequest. Pure parsing only — no risk scoring. Call
   * `createAndEvaluate` with the result to get a real backend risk score.
   */
  public parsePaymentUrl(url: string, sourceType: PaymentRequest["sourceType"] = "payment_link"): PaymentRequest {
    let payeeUpiId = "unknown@upi";
    let merchantName = "Unknown Merchant";
    let amount = 0;
    let description = "Direct Transfer";
    const currency = "INR";

    try {
      const cleanUrl = url.trim();
      const questionIdx = cleanUrl.indexOf("?");
      if (questionIdx !== -1) {
        const query = cleanUrl.substring(questionIdx + 1);
        const pairs = query.split("&");
        for (const pair of pairs) {
          const [rawKey, rawVal] = pair.split("=");
          if (rawKey && rawVal) {
            const key = decodeURIComponent(rawKey).toLowerCase();
            const val = decodeURIComponent(rawVal);
            if (key === "pa") payeeUpiId = val;
            if (key === "pn") merchantName = val;
            if (key === "am") amount = parseFloat(val) || 0;
            if (key === "tn" || key === "desc") description = val;
          }
        }
      }
    } catch {
      // Malformed URL — fall through with the defaults above.
    }

    const now = new Date().toISOString();

    return {
      id: `pending-${Date.now()}`,
      merchantName: merchantName || "Unknown Merchant",
      payeeUpiId: payeeUpiId || "unknown@upi",
      amount,
      currency,
      description,
      originalUrl: url,
      sourceType,
      status: "Analyzing",
      riskScore: 0,
      riskLevel: "LOW",
      riskFactors: [],
      reasons: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Creates a real backend transaction for this payment request and runs it
   * through the authoritative risk engine (POST /api/v1/transactions then
   * POST /api/v1/risk/evaluate), then mirrors the result into the shared
   * PaymentService cache so the Payments screen reflects it immediately.
   */
  public async createAndEvaluate(
    req: PaymentRequest,
    userId: number
  ): Promise<UserTransaction | null> {
    const deviceId = await getDeviceIdentifier();
    const createRes = await ApiClient.post<any>("/api/v1/transactions", {
      user_id: userId,
      recipient_identifier: req.payeeUpiId,
      recipient_display_name: req.merchantName,
      device_identifier: deviceId,
      device_name: getDeviceName(),
      device_type: getDeviceType(),
      amount: req.amount > 0 ? req.amount : 1,
      payment_method: "UPI",
    });
    if (!createRes.data) return null;

    const txnId: number = createRes.data.id;
    const risk = await RiskService.evaluateTransaction(txnId);
    const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
      risk?.riskLevel || getRiskLevelFromScore(risk?.riskScore);
    const isHigh = riskLevel === "HIGH";

    const txStatus: UserTransaction["status"] =
      riskLevel === "HIGH"
        ? "Risk detected"
        : riskLevel === "MEDIUM"
        ? "Held"
        : "Safe";

    const newTx: UserTransaction = {
      id: String(txnId),
      title: req.merchantName,
      merchant: req.merchantName,
      amount: req.amount,
      date: "Just now",
      timestamp: new Date().toISOString(),
      paymentMethod: "UPI Direct",
      status: txStatus,
      riskLevel: riskLevel,
      riskScore: risk?.riskScore ?? 0,
      riskFactors: [],
      reasons: risk?.reasons || [],
    };

    PaymentService.addTransaction(newTx);

    if (isHigh) {
      AlertService.addAlert({
        id: `alert-int-${txnId}`,
        title: "Suspicious Payment Link Intercepted",
        description: `₹${req.amount.toLocaleString("en-IN")} payment to ${req.merchantName} flagged for unusual volume and new recipient.`,
        severity: "HIGH",
        status: "ACTIVE",
        timestamp: "Just now",
        transactionId: String(txnId),
        isRead: false,
      });
    }

    return newTx;
  }
}

export const PaymentLinkService = new PaymentLinkManager();
