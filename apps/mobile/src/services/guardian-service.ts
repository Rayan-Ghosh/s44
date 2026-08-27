import { ApiClient } from "./api-client";
import { TrustedContact } from "../types/guardian";

// ---------------------------------------------------------------------------
// Seed Data (used when backend is offline — consistent with existing pattern)
// ---------------------------------------------------------------------------
let _seedContacts: TrustedContact[] = [];

export class GuardianService {
  // -------------------------------------------------------------------------
  // Trusted Contacts CRUD
  // -------------------------------------------------------------------------

  static async getTrustedContacts(userId: number = 1): Promise<TrustedContact[]> {
    const res = await ApiClient.get<any[]>(`/api/v1/users/${userId}/trusted-contacts`);
    if (res.data && Array.isArray(res.data)) {
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
    // Return in-memory seed state when offline
    return _seedContacts;
  }

  static async addTrustedContact(
    userId: number = 1,
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

    // Offline fallback — persist in memory
    const offline: TrustedContact = {
      id: `local-${Date.now()}`,
      name: contact.name,
      phone: contact.phone,
      relationship: contact.relationship,
      addedAt: new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    };
    _seedContacts = [..._seedContacts, offline];
    return { success: true, contact: offline };
  }

  static async removeTrustedContact(
    userId: number = 1,
    contactId: string
  ): Promise<{ success: boolean; error?: string }> {
    const numId = parseInt(contactId.replace(/\D/g, ""), 10);
    if (!isNaN(numId)) {
      await ApiClient.request(`/api/v1/users/${userId}/trusted-contacts/${numId}`, {
        method: "DELETE",
      });
    }
    // Always remove from local memory too
    _seedContacts = _seedContacts.filter((c) => c.id !== contactId);
    return { success: true };
  }
}
