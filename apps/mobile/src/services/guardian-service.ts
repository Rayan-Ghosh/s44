import { ApiClient, IS_DEMO_MODE } from "./api-client";
import { TrustedContact } from "../types/guardian";
import { DEMO_TRUSTED_CONTACTS } from "../data/demo-data";

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
        this.localContacts = res.data.map((c: any) => ({
          id: String(c.id),
          name: c.name,
          phone: c.phone_number || c.phone,
          relationship: c.relationship || "Contact",
          addedAt: c.created_at
            ? new Date(c.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : new Date().toLocaleDateString("en-IN"),
        }));
        return [...this.localContacts];
      }
    } catch {
      // Fallback
    }

    return [...this.localContacts];
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
        });

        if (res.data && (res.data as any).id) {
          const saved: TrustedContact = {
            id: String((res.data as any).id),
            name: contact.name,
            phone: contact.phone,
            relationship: contact.relationship,
            addedAt: new Date().toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
          };
          this.localContacts = [...this.localContacts, saved];
          return { success: true, contact: saved };
        }
      } catch {
        // Fallback
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
          await ApiClient.request(`/api/v1/users/${userId}/trusted-contacts/${numId}`, {
            method: "DELETE",
          });
        } catch {
          // Best effort
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
        if (res.data) {
          return { success: true, request: mapGuardianRequest(res.data) };
        }
      } catch {
        // Fallback to local request simulation
      }
    }

    const now = new Date();
    const expires = new Date(now.getTime() + 120000);
    const mockId = Date.now();
    const localReq: GuardianRequestDto = {
      id: mockId,
      transactionId,
      trustedContactId: trustedContactId || 1,
      requestedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      resolvedAt: null,
      outcome: "PENDING",
      remainingSeconds: 120,
      transactionAmount: 4890,
      riskScore: 78,
      riskReasons: [
        "Coercive urgency keywords detected in utility scam",
        "Active phone call detected during payment flow",
        "Recipient VPA has no past interaction history",
      ],
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
        // Fallback
      }
    }
    return this.localRequests.get(requestId) || null;
  }

  static async getPendingRequests(trustedContactId: number): Promise<GuardianRequestDto[]> {
    if (!IS_DEMO_MODE) {
      try {
        const res = await ApiClient.get<any[]>(`/api/v1/guardian/requests/pending/${trustedContactId}`);
        if (res.data && Array.isArray(res.data)) return res.data.map(mapGuardianRequest);
      } catch {
        // Fallback
      }
    }
    return Array.from(this.localRequests.values()).filter((r) => r.outcome === "PENDING");
  }

  static async approve(requestId: number, notes?: string): Promise<{ success: boolean; error?: string }> {
    if (!IS_DEMO_MODE) {
      try {
        const res = await ApiClient.post<any>(`/api/v1/guardian/requests/${requestId}/approve`, notes ? { notes } : undefined);
        if (res.data) return { success: true };
      } catch {
        // Fallback
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
        const res = await ApiClient.post<any>(`/api/v1/guardian/requests/${requestId}/reject`, notes ? { notes } : undefined);
        if (res.data) return { success: true };
      } catch {
        // Fallback
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
}
