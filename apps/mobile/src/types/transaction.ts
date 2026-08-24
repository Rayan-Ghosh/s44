import { RiskResult } from "./risk";

export interface TransactionInput {
  id?: number;
  amount: number;
  recipientName: string;
  recipientHandle: string;
  isNewRecipient: boolean;
  deviceLabel: string;
  isNewDevice: boolean;
  location: string;
  paymentMethod: string;
  timestamp: string;
}

export type FinalOutcome = "pending" | "confirmed" | "cancelled" | "reported";

export interface PaymentRiskEvaluation {
  transaction: TransactionInput;
  risk: RiskResult;
  outcome: FinalOutcome;
  evaluatedAt: string;
}
