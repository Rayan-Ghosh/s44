import { ApiClient, IS_DEMO_MODE } from "./api-client";
import { TrustedContact } from "../types/guardian";
import { DEMO_TRUSTED_CONTACTS, DEMO_USER_TRANSACTIONS } from "../data/demo-data";

export interface GuardianRequestDto {
  id: number;
  transactionId: number;
  trustedContactId: number;
  requestedAt: string;
  expiresAt: string;
  resolvedAt: string | null;
  outcome: "PENDING" | "APPROVED" | "REJECTED" | "TIMEOUT" | null;
  remainingSeconds: number;
  transactionAmount: number;
  riskScore: number | null;
  riskReasons: string[];
  senderName?: string;
  senderPhoneMasked?: string;
  recipientName?: string;
}

const mapGuardianRequest = (r: any): GuardianRequestDto => ({
  id: r.id,
  transactionId: r.transaction_id,
  trustedContactId: r.trusted_contact_id,
  requestedAt: r.requested_at,
  expiresAt: r.expires_at,
  resolvedAt: r.resolved_at,
  outcome: r.outcome,
  remainingSeconds: r.remaining_seconds ?? 0,
  transactionAmount: r.transaction_amount ?? 0,
  riskScore: r.risk_score ?? null,
  riskReasons: r.risk_reasons ?? [],
  senderName: r.sender_name,
  senderPhoneMasked: r.sender_phone_masked,
  recipientName: r.recipient_name,
});

export class GuardianService {
  private static localContacts: TrustedContact[] = IS_DEMO_MODE ? [...DEMO_TRUSTED_CONTACTS] : [];
  private static localRequests: Map<number, GuardianRequestDto> = new Map();

  // -------------------------------------------------------------------------
  // Trusted Contacts CRUD
  // -------------------------------------------------------------------------

  static async getTrustedContacts(userId: number = 1): Promise<TrustedContact[]> {
    if (IS_DEMO_MODE) {
      return [...this.localContacts];
    }

    try {
      const res = await ApiClient.get<any[]>(`/api/v1/users/${userId}/trusted-contacts`);
      if (res.data && Array.isArray(res.data)) {
        return res.data.map((c: any) => ({
          id: String(c.id),
          name: c.name,
          phone: c.phone_number || c.phone,
          relationship: c.relationship || "Contact",
          guardianUserId: c.guardian_user_id,
          addedAt: c.created_at
            ? new Date(c.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : new Date().toLocaleDateString("en-IN"),
        }));
      }
    } catch {
      // Return empty array on network failure in live mode
    }

    return [];
  }

  static async addTrustedContact(
    userId: number = 1,
    contact: Omit<TrustedContact, "id" | "addedAt">
  ): Promise<{ success: boolean; contact?: TrustedContact; error?: string }> {
    if (!IS_DEMO_MODE) {
      try {
        const res = await ApiClient.post(`/api/v1/users/${userId}/trusted-contacts`, {
          name: contact.name,
          phone_number: contact.phone,
          relationship: contact.relationship,
          guardian_user_id: contact.guardianUserId,
        });

        if (res.data && (res.data as any).id) {
          const saved: TrustedContact = {
            id: String((res.data as any).id),
            name: contact.name,
            phone: contact.phone,
            relationship: contact.relationship,
            guardianUserId: (res.data as any).guardian_user_id,
            addedAt: new Date().toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
          };
          return { success: true, contact: saved };
        }
        return { success: false, error: res.error || "Failed to add trusted contact" };
      } catch (err: any) {
        return { success: false, error: err?.message || "Failed to add trusted contact" };
      }
    }

    const localSaved: TrustedContact = {
      id: String(Date.now()),
      name: contact.name,
      phone: contact.phone,
      relationship: contact.relationship,
      addedAt: new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    };
    this.localContacts = [...this.localContacts, localSaved];
    return { success: true, contact: localSaved };
  }

  static async removeTrustedContact(
    userId: number = 1,
    contactId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!IS_DEMO_MODE) {
      const numId = parseInt(contactId, 10);
      if (!isNaN(numId)) {
        try {
          const res = await ApiClient.request(`/api/v1/users/${userId}/trusted-contacts/${numId}`, {
            method: "DELETE",
          });
          return { success: res.status === 200 || res.status === 204 };
        } catch (err: any) {
          return { success: false, error: err?.message || "Failed to remove contact" };
        }
      }
    }

    this.localContacts = this.localContacts.filter((c) => c.id !== contactId);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Guardian request lifecycle (2-minute hold)
  // -------------------------------------------------------------------------

  static async createRequest(
    transactionId: number,
    trustedContactId?: number
  ): Promise<{ success: boolean; request?: GuardianRequestDto; error?: string }> {
    if (!IS_DEMO_MODE) {
      try {
        const res = await ApiClient.post<any>("/api/v1/guardian/requests", {
          transaction_id: transactionId,
          trusted_contact_id: trustedContactId,
        });
        if (res.data && (res.status === 200 || res.status === 201)) {
          return { success: true, request: mapGuardianRequest(res.data) };
        }
        return { success: false, error: res.error || "Failed to trigger guardian request." };
      } catch (err: any) {
        return { success: false, error: err?.message || "Failed to trigger guardian request." };
      }
    }

    const now = new Date();
    const expires = new Date(now.getTime() + 120000);
    const mockId = Date.now();
    const tx = DEMO_USER_TRANSACTIONS.find((t) => t.id === String(transactionId));
    const localReq: GuardianRequestDto = {
      id: mockId,
      transactionId,
      trustedContactId: trustedContactId || 1,
      requestedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      resolvedAt: null,
      outcome: "PENDING",
      remainingSeconds: 120,
      transactionAmount: tx ? tx.amount : 4890,
      riskScore: tx ? (tx.riskScore ?? 78) : 78,
      riskReasons: tx && tx.reasons && tx.reasons.length > 0 ? tx.reasons : [
        "Coercive urgency keywords detected in utility scam",
        "Active phone call detected during payment flow",
        "Recipient VPA has no past interaction history",
      ],
      recipientName: tx?.merchant,
    };
    this.localRequests.set(mockId, localReq);
    return { success: true, request: localReq };
  }

  static async getRequest(requestId: number): Promise<GuardianRequestDto | null> {
    if (!IS_DEMO_MODE) {
      try {
        const res = await ApiClient.get<any>(`/api/v1/guardian/requests/${requestId}`);
        if (res.data) return mapGuardianRequest(res.data);
      } catch {
        return null;
      }
    }
    return this.localRequests.get(requestId) || null;
  }

  static async getRequestByTransactionId(transactionId: number): Promise<GuardianRequestDto | null> {
    if (!IS_DEMO_MODE) {
      try {
        const res = await ApiClient.get<any>(`/api/v1/guardian/requests/by-transaction/${transactionId}`);
        if (res.data) return mapGuardianRequest(res.data);
      } catch {
        return null;
      }
    }
    return (
      Array.from(this.localRequests.values()).find((r) => r.transactionId === transactionId) ||
      null
    );
  }

  static async getPendingRequests(trustedContactId: number): Promise<GuardianRequestDto[]> {
    if (!IS_DEMO_MODE) {
      try {
        const res = await ApiClient.get<any[]>(`/api/v1/guardian/requests/pending/${trustedContactId}`);
        if (res.data && Array.isArray(res.data)) return res.data.map(mapGuardianRequest);
      } catch {
        return [];
      }
    }
    return IS_DEMO_MODE
      ? Array.from(this.localRequests.values()).filter((r) => r.outcome === "PENDING")
      : [];
  }

  /**
   * Fetch all non-expired PENDING GuardianRequests for a guardian user by
   * their own Avaran user_id, using:
   *   GET /api/v1/guardian/requests/by-guardian-user/{guardianUserId}
   */
  static async getPendingRequestsByGuardianUserId(guardianUserId: number): Promise<GuardianRequestDto[]> {
    if (!IS_DEMO_MODE) {
      try {
        const res = await ApiClient.get<any[]>(
          `/api/v1/guardian/requests/by-guardian-user/${guardianUserId}`
        );
        if (res.data && Array.isArray(res.data)) return res.data.map(mapGuardianRequest);
      } catch {
        return [];
      }
    }
    return IS_DEMO_MODE
      ? Array.from(this.localRequests.values()).filter((r) => r.outcome === "PENDING")
      : [];
  }

  static async approve(requestId: number, notes?: string): Promise<{ success: boolean; error?: string }> {
    if (!IS_DEMO_MODE) {
      try {
        const res = await ApiClient.post<any>(
          `/api/v1/guardian/requests/${requestId}/approve`,
          notes ? { notes } : undefined
        );
        if (res.data && (res.status === 200 || res.status === 201)) {
          return { success: true };
        }
        return { success: false, error: res.error || "Failed to approve transaction." };
      } catch (err: any) {
        return { success: false, error: err?.message || "Failed to approve transaction." };
      }
    }

    const req = this.localRequests.get(requestId);
    if (req) {
      req.outcome = "APPROVED";
      req.resolvedAt = new Date().toISOString();
      this.localRequests.set(requestId, req);
    }
    return { success: true };
  }

  static async reject(requestId: number, notes?: string): Promise<{ success: boolean; error?: string }> {
    if (!IS_DEMO_MODE) {
      try {
        const res = await ApiClient.post<any>(
          `/api/v1/guardian/requests/${requestId}/reject`,
          notes ? { notes } : undefined
        );
        if (res.data && (res.status === 200 || res.status === 201)) {
          return { success: true };
        }
        return { success: false, error: res.error || "Failed to reject transaction." };
      } catch (err: any) {
        return { success: false, error: err?.message || "Failed to reject transaction." };
      }
    }

    const req = this.localRequests.get(requestId);
    if (req) {
      req.outcome = "REJECTED";
      req.resolvedAt = new Date().toISOString();
      this.localRequests.set(requestId, req);
    }
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Pre-payment Evaluation Guardian Escalation Boundary
  // -------------------------------------------------------------------------

  /**
   * Pre-payment Evaluation Guardian Escalation Service Boundary.
   *
   * Connects to backend Guardian approval request endpoint for pre-payment evaluations.
   * Invariants:
   * - Uses existing authenticated user and evaluation identifiers.
   * - Does NOT create or modify transaction records.
   * - Does NOT fake Guardian approval.
   * - If backend rejects pre-transaction requests or endpoint is missing/unclear,
   *   captures the error/blocker without fabricating success.
   */
  static async requestEvaluationGuardianApproval(params: {
    evaluationId: string;
    userId: number;
    amount: number;
    recipient: string;
    riskScore: number;
    riskLevel: string;
    reasons: string[];
    trustedContactId?: number;
  }): Promise<{
    success: boolean;
    requestId?: string;
    expiresAt?: string;
    remainingSeconds?: number;
    error?: string;
    blockerNotice?: string;
  }> {
    if (!IS_DEMO_MODE) {
      try {
        // Attempt backend evaluation guardian request endpoint
        const res = await ApiClient.post<any>("/api/v1/guardian/requests/evaluation", {
          evaluation_id: params.evaluationId,
          user_id: params.userId,
          amount: params.amount,
          recipient: params.recipient,
          risk_score: params.riskScore,
          risk_level: params.riskLevel,
          reasons: params.reasons,
          trusted_contact_id: params.trustedContactId,
        });

        if (res.data && (res.status === 200 || res.status === 201)) {
          return {
            success: true,
            requestId: String(res.data.id || res.data.request_id),
            expiresAt: res.data.expires_at,
            remainingSeconds: res.data.remaining_seconds ?? 120,
          };
        }

        // If endpoint is not found (404) or requires persisted transaction_id, report exact blocker
        if (res.status === 404 || res.status === 400 || res.status === 422) {
          const detail = res.error || (res.data && res.data.detail) || "Backend endpoint not found";
          return {
            success: false,
            error: detail,
            blockerNotice:
              "Backend Guardian request endpoint requires a persisted transaction ID. In adherence to phase safety rules, no transaction record is created before authorization.",
          };
        }

        return {
          success: false,
          error: res.error || "Unable to initiate Guardian approval request.",
        };
      } catch (err: any) {
        return {
          success: false,
          error: err?.message || "Guardian approval request service unavailable.",
        };
      }
    }

    // Demo Mode: simulate realistic 2-minute Guardian hold for testing UI lifecycle
    const now = new Date();
    const expires = new Date(now.getTime() + 120000);
    const mockId = `EVAL-REQ-${Date.now()}`;
    return {
      success: true,
      requestId: mockId,
      expiresAt: expires.toISOString(),
      remainingSeconds: 120,
    };
  }

  /**
   * Poll or check status of an active pre-payment evaluation Guardian request.
   */
  static async checkEvaluationGuardianStatus(
    requestId: string
  ): Promise<{
    success: boolean;
    status?: "PENDING" | "APPROVED" | "REJECTED" | "TIMEOUT";
    resolutionNotes?: string;
    remainingSeconds?: number;
    error?: string;
  }> {
    if (!IS_DEMO_MODE) {
      try {
        const numId = parseInt(requestId, 10);
        const endpoint = isNaN(numId)
          ? `/api/v1/guardian/requests/evaluation/${requestId}`
          : `/api/v1/guardian/requests/${numId}`;

        const res = await ApiClient.get<any>(endpoint);
        if (res.data && res.status === 200) {
          return {
            success: true,
            status: res.data.outcome || (res.data.status as any) || "PENDING",
            resolutionNotes: res.data.resolution_notes,
            remainingSeconds: res.data.remaining_seconds,
          };
        }
        return { success: false, error: res.error || "Failed to check guardian status." };
      } catch (err: any) {
        return { success: false, error: err?.message || "Failed to check guardian status." };
      }
    }

    return {
      success: true,
      status: "PENDING",
      remainingSeconds: 120,
    };
  }
}

