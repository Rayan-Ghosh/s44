import { FinalOutcome, PaymentRiskEvaluation, TransactionInput } from "../types/transaction";
import { RiskService } from "./risk-service";

export const DEFAULT_HELD_PAYMENT: TransactionInput = {
  id: 4092,
  amount: 49000,
  recipientName: "Unknown Merchant",
  recipientHandle: "newmerchant@upi",
  isNewRecipient: true,
  deviceLabel: "OnePlus 11 (Unrecognized)",
  isNewDevice: true,
  location: "New Delhi, India",
  paymentMethod: "UPI FastPay",
  timestamp: new Date().toISOString(),
};

export class TransactionService {
  static async getHeldPayment(): Promise<PaymentRiskEvaluation> {
    const risk = await RiskService.evaluateTransactionRisk(DEFAULT_HELD_PAYMENT);
    return {
      transaction: DEFAULT_HELD_PAYMENT,
      risk,
      outcome: "pending",
      evaluatedAt: new Date().toISOString(),
    };
  }

  static async submitDecision(
    tx: TransactionInput,
    outcome: FinalOutcome
  ): Promise<{ success: boolean; outcome: FinalOutcome; message: string }> {
    // In production: POST /api/v1/transactions/{id}/decision
    return {
      success: true,
      outcome,
      message:
        outcome === "confirmed"
          ? "Payment authorized by user override"
          : outcome === "cancelled"
          ? "Payment cancelled and funds safeguarded"
          : "Payment blocked and reported to institution fraud desk",
    };
  }
}
