import { HistoryItem } from "../types/history";

export const INITIAL_HISTORY: HistoryItem[] = [
  {
    id: "hist-1",
    type: "payment",
    amount: 49000,
    recipientName: "New Merchant",
    recipientHandle: "newmerchant@upi",
    timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    formattedTime: "Today · 8:42 PM",
    riskScore: 88,
    riskLevel: "HIGH",
    status: "Flagged & Held",
    actionTaken: "reported",
  },
  {
    id: "hist-2",
    type: "call",
    callerName: "Incoming Call (Unknown)",
    callerNumber: "+91 1800 209 8888",
    durationSec: 42,
    timestamp: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    formattedTime: "Today · 8:39 PM",
    riskScore: 91,
    riskLevel: "HIGH",
    status: "Scam Intercepted",
    detectedPattern: "Authority Impersonation & OTP Coercion",
    actionTaken: "reported",
  },
  {
    id: "hist-3",
    type: "payment",
    amount: 2400,
    recipientName: "Rohit Verma",
    recipientHandle: "rohit.verma@okaxis",
    timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    formattedTime: "Yesterday · 3:20 PM",
    riskScore: 12,
    riskLevel: "LOW",
    status: "Completed",
    actionTaken: "allowed",
  },
  {
    id: "hist-4",
    type: "call",
    callerName: "Airtel Customer Service",
    callerNumber: "121",
    durationSec: 125,
    timestamp: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    formattedTime: "20 Aug · 11:15 AM",
    riskScore: 18,
    riskLevel: "LOW",
    status: "Safe Call",
    detectedPattern: "Standard Support Inquiries",
    actionTaken: "dismissed",
  },
];

export class HistoryService {
  static getHistory(): HistoryItem[] {
    return [...INITIAL_HISTORY];
  }
}
