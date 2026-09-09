import { ApiClient } from "./api-client";

export interface IncomingPaymentRequest {
  id: string;
  requesterName: string;
  upiId: string;
  amount: number;
  note?: string;
  timestamp: string;
  expiresAt?: string;
  sourceApp?: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
}

const DEFAULT_PENDING_REQUESTS: IncomingPaymentRequest[] = [
  {
    id: "req-001",
    requesterName: "Swiggy India",
    upiId: "swiggy@icici",
    amount: 650,
    note: "Dinner delivery #SW-7821",
    timestamp: "10 mins ago",
    sourceApp: "Swiggy",
    status: "PENDING",
  },
  {
    id: "req-002",
    requesterName: "Vikram Sharma",
    upiId: "vikram.sharma99@okaxis",
    amount: 4500,
    note: "Consulting invoice #INV-2026-08",
    timestamp: "1 hour ago",
    sourceApp: "WhatsApp Pay",
    status: "PENDING",
  },
  {
    id: "req-003",
    requesterName: "BSES Electricity",
    upiId: "bses.yamuna@sbi",
    amount: 1240,
    note: "Electricity Bill CA#1029384",
    timestamp: "2 hours ago",
    sourceApp: "Utility Bill Desk",
    status: "PENDING",
  },
];

class PaymentRequestManager {
  private requests: IncomingPaymentRequest[] = [...DEFAULT_PENDING_REQUESTS];
  private shouldFailNextCall = false;

  /**
   * For testing retry / error state handling.
   */
  public setSimulateFailure(fail: boolean) {
    this.shouldFailNextCall = fail;
  }

  /**
   * Fetches incoming/pending payment requests.
   */
  public async getPendingRequests(
    _userId?: number
  ): Promise<{ requests: IncomingPaymentRequest[]; error?: string }> {
    // Artificial small delay for realistic UI loading state
    await new Promise((res) => setTimeout(res, 300));

    if (this.shouldFailNextCall) {
      this.shouldFailNextCall = false;
      return {
        requests: [],
        error: "Unable to sync incoming payment requests. Network timeout.",
      };
    }

    const pending = this.requests.filter((r) => r.status === "PENDING");
    return { requests: [...pending] };
  }

  /**
   * Simulates a newly arrived payment request (useful for testing or demo).
   */
  public simulateIncomingRequest(
    overrides?: Partial<IncomingPaymentRequest>
  ): IncomingPaymentRequest {
    const newReq: IncomingPaymentRequest = {
      id: `req-${Date.now()}`,
      requesterName: overrides?.requesterName || "Aakash Verma",
      upiId: overrides?.upiId || "aakash.v@okhdfcbank",
      amount: overrides?.amount || 1200,
      note: overrides?.note || "Split lunch payment",
      timestamp: "Just now",
      sourceApp: overrides?.sourceApp || "Google Pay",
      status: "PENDING",
      ...overrides,
    };
    this.requests = [newReq, ...this.requests];
    return newReq;
  }

  /**
   * Marks a request as accepted.
   */
  public markRequestAccepted(id: string): void {
    const idx = this.requests.findIndex((r) => r.id === id);
    if (idx !== -1) {
      this.requests[idx] = { ...this.requests[idx], status: "ACCEPTED" };
    }
  }

  /**
   * Clears all pending requests (for testing empty state).
   */
  public clearRequests(): void {
    this.requests = [];
  }

  /**
   * Resets default pending requests.
   */
  public resetDefaultRequests(): void {
    this.requests = [...DEFAULT_PENDING_REQUESTS];
  }
}

export const PaymentRequestService = new PaymentRequestManager();
