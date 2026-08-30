import { RiskLevel } from "./risk";

export type HistoryType = "payment" | "call";

export interface BaseHistoryItem {
  id: string;
  type: HistoryType;
  timestamp: string;
  formattedTime: string;
  riskScore: number;
  riskLevel: RiskLevel;
  status: string;
}

export interface PaymentHistoryItem extends BaseHistoryItem {
  type: "payment";
  amount: number;
  recipientName: string;
  recipientHandle: string;
  actionTaken: "confirmed" | "cancelled" | "reported" | "allowed";
}

export interface CallHistoryItem extends BaseHistoryItem {
  type: "call";
  callerName: string;
  callerNumber: string;
  durationSec: number;
  detectedPattern: string;
  actionTaken: "ended" | "reported" | "dismissed";
}

export type HistoryItem = PaymentHistoryItem | CallHistoryItem;
