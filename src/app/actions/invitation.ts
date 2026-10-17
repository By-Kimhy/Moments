"use server";

import type { InvitationGuest } from "@api/contract";
import { ApiError, api, field } from "@/lib/api";

export type RsvpState =
  | { ok: true; guest: InvitationGuest }
  | { ok: false; message?: string; errors?: Record<string, string[] | undefined> }
  | undefined;

// Guests aren't signed in, so failures come back as messages rather than redirects.
export async function submitRsvp(token: string, language: "km" | "en", _state: RsvpState, formData: FormData): Promise<RsvpState> {
  const body = { status: field(formData, "status"), count: field(formData, "count") || undefined, message: field(formData, "message") };
  try {
    const { guest } = await api.post<{ guest: InvitationGuest }>(`/invitations/${token}/rsvp`, body, language);
    return { ok: true, guest };
  } catch (e) {
    if (e instanceof ApiError && [400, 409, 429].includes(e.status)) return { ok: false, message: e.fieldErrors ? undefined : e.message, errors: e.fieldErrors };
    throw e;
  }
}
