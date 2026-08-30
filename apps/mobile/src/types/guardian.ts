export type GuardianStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface TrustedContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  addedAt: string;
}

export interface GuardianRequest {
  id: string;
  transactionId: string;
  merchant: string;
  amount: number;
  paymentMethod: string;
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reasons: string[];
  status: GuardianStatus;
  createdAt: number; // Unix ms timestamp
  expiresAt: number; // Unix ms timestamp (createdAt + 60000)
  resolvedAt?: number;
}
