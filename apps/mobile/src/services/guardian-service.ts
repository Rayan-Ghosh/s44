import { ApiClient } from "./api-client";
import { TrustedContact } from "../types/guardian";

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
  // -------------------------------------------------------------------------
  // Trusted Contacts CRUD — backed by the real /api/v1/users/{id}/trusted-contacts
  // and /api/v1/guardian/trusted-contacts endpoints. Errors surface to the
  // caller rather than silently substituting local/offline data.
  // -------------------------------------------------------------------------

  static async getTrustedContacts(userId: number): Promise<TrustedContact[]> {
    const res = await ApiClient.get<any[]>(`/api/v1/users/${userId}/trusted-contacts`);
    if (!res.data || !Array.isArray(res.data)) {
      throw new Error(res.error || "Unable to load trusted contacts.");
    }
    return res.data.map((c: any) => ({
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
  }

  static async addTrustedContact(
    userId: number,
    contact: Omit<TrustedContact, "id" | "addedAt">
  ): Promise<{ success: boolean; contact?: TrustedContact; error?: string }> {
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
      return { success: true, contact: saved };
    }

    return { success: false, error: res.error || "Failed to save contact." };
  }

  static async removeTrustedContact(
    userId: number,
    contactId: string
  ): Promise<{ success: boolean; error?: string }> {
    const numId = parseInt(contactId, 10);
    if (isNaN(numId)) {
      return { success: false, error: "Invalid contact id." };
    }
    const res = await ApiClient.request(`/api/v1/users/${userId}/trusted-contacts/${numId}`, {
      method: "DELETE",
    });
    if (res.isNetworkError) {
      return { success: false, error: res.error };
    }
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Guardian request lifecycle — spec §5/§6: a 2-minute (120s) family hold on
  // HIGH-risk transactions. Backed by /api/v1/guardian/requests and friends.
  // -------------------------------------------------------------------------

  static async createRequest(
    transactionId: number,
    trustedContactId?: number
  ): Promise<{ success: boolean; request?: GuardianRequestDto; error?: string }> {
    const res = await ApiClient.post<any>("/api/v1/guardian/requests", {
      transaction_id: transactionId,
      trusted_contact_id: trustedContactId,
    });
    if (!res.data) {
      return { success: false, error: res.error || "Unable to start guardian approval." };
    }
    return { success: true, request: mapGuardianRequest(res.data) };
  }

  static async getRequest(requestId: number): Promise<GuardianRequestDto | null> {
    const res = await ApiClient.get<any>(`/api/v1/guardian/requests/${requestId}`);
    if (!res.data) return null;
    return mapGuardianRequest(res.data);
  }

  static async getPendingRequests(trustedContactId: number): Promise<GuardianRequestDto[]> {
    const res = await ApiClient.get<any[]>(`/api/v1/guardian/requests/pending/${trustedContactId}`);
    if (!res.data || !Array.isArray(res.data)) return [];
    return res.data.map(mapGuardianRequest);
  }

  static async approve(requestId: number, notes?: string): Promise<{ success: boolean; error?: string }> {
    const res = await ApiClient.post<any>(`/api/v1/guardian/requests/${requestId}/approve`, notes ? { notes } : undefined);
    if (!res.data) return { success: false, error: res.error || "Approval failed." };
    return { success: true };
  }

  static async reject(requestId: number, notes?: string): Promise<{ success: boolean; error?: string }> {
    const res = await ApiClient.post<any>(`/api/v1/guardian/requests/${requestId}/reject`, notes ? { notes } : undefined);
    if (!res.data) return { success: false, error: res.error || "Rejection failed." };
    return { success: true };
  }
}
