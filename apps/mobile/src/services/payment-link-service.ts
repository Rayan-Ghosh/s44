import { PaymentService, UserTransaction, RiskFactorItem } from "./payment-service";
import { AlertService } from "./alert-service";

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
   * Parses a raw URI string (UPI, HTTP, or deep link) into a structured PaymentRequest
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
      // Fallback
    }

    const id = `req-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();

    const request: PaymentRequest = {
      id,
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

    return this.analyzePaymentRequest(request);
  }

  /**
   * Evaluates security signals and calculates live risk score
   */
  public analyzePaymentRequest(request: PaymentRequest): PaymentRequest {
    let score = 5.0;
    const reasons: string[] = [];
    const riskFactors: RiskFactorItem[] = [];

    const isRecognizedMerchant =
      request.merchantName.toLowerCase().includes("amazon") ||
      request.merchantName.toLowerCase().includes("swiggy") ||
      request.merchantName.toLowerCase().includes("zomato") ||
      request.merchantName.toLowerCase().includes("bescom") ||
      request.merchantName.toLowerCase().includes("airtel");

    if (isRecognizedMerchant) {
      score = 6.5;
      reasons.push("Recognized verified merchant handle");
      reasons.push("Standard transaction signature");
    } else {
      // 1. Amount Anomaly
      if (request.amount >= 10000) {
        score += 38.0;
        reasons.push(`High transfer amount (₹${request.amount.toLocaleString("en-IN")})`);
        riskFactors.push({
          factor_type: "transaction",
          factor_name: "amount_deviation",
          contribution: 42.0,
          explanation: "Transaction amount exceeds typical daily baseline.",
        });
      } else if (request.amount >= 3000) {
        score += 15.0;
        reasons.push("Moderate transaction amount");
      }

      // 2. Recipient Trust
      if (request.payeeUpiId.includes("unknown") || !request.payeeUpiId.includes("@")) {
        score += 25.0;
        reasons.push("Unverified recipient UPI identifier");
        riskFactors.push({
          factor_type: "recipient",
          factor_name: "new_recipient",
          contribution: 30.0,
          explanation: "First time sending money to this recipient handle.",
        });
      } else {
        score += 18.0;
        reasons.push("Unfamiliar payee handle");
        riskFactors.push({
          factor_type: "recipient",
          factor_name: "first_time_contact",
          contribution: 20.0,
          explanation: "Recipient handle not in verified whitelist.",
        });
      }

      // 3. Sensitive Note / Social Engineering Heuristics
      const descLower = (request.description || "").toLowerCase();
      if (
        descLower.includes("urgent") ||
        descLower.includes("lottery") ||
        descLower.includes("kyc") ||
        descLower.includes("customs") ||
        descLower.includes("fee")
      ) {
        score += 28.0;
        reasons.push("Urgency/coercion keywords detected in transaction note");
        riskFactors.push({
          factor_type: "content",
          factor_name: "social_engineering_keywords",
          contribution: 28.0,
          explanation: "Note contains high-risk social engineering markers.",
        });
      }
    }

    const finalScore = Math.min(99.0, Math.max(4.0, score));
    const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
      finalScore >= 60 ? "HIGH" : finalScore >= 25 ? "MEDIUM" : "LOW";

    const updated: PaymentRequest = {
      ...request,
      riskScore: finalScore,
      riskLevel,
      riskFactors,
      reasons: reasons.length > 0 ? reasons : ["Standard behavioral profile match"],
      status: riskLevel === "HIGH" ? "Needs Review" : "Waiting For User",
      updatedAt: new Date().toISOString(),
    };

    return updated;
  }

  /**
   * Ingests a new intercepted payment request into the centralized PaymentService
   */
  public ingestPaymentRequest(req: PaymentRequest): UserTransaction {
    const isHigh = req.riskLevel === "HIGH";

    const newTx: UserTransaction = {
      id: req.id,
      title: req.merchantName,
      merchant: req.merchantName,
      amount: req.amount,
      date: "Just now",
      timestamp: new Date().toISOString(),
      paymentMethod: "UPI Direct",
      status: isHigh ? "Risk detected" : "Safe",
      riskLevel: req.riskLevel,
      riskScore: req.riskScore,
      riskFactors: req.riskFactors,
      reasons: req.reasons,
    };

    // Add to central state
    PaymentService.addTransaction(newTx);

    // If high risk, also create alert in AlertService
    if (isHigh) {
      AlertService.addAlert({
        id: `alert-int-${req.id}`,
        title: "Suspicious Payment Link Intercepted",
        description: `₹${req.amount.toLocaleString("en-IN")} payment to ${req.merchantName} flagged for unusual volume and new recipient.`,
        severity: "HIGH",
        status: "ACTIVE",
        timestamp: "Just now",
        transactionId: req.id,
        isRead: false,
      });
    }

    return newTx;
  }
}

export const PaymentLinkService = new PaymentLinkManager();
