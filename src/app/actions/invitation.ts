"use server";

import type { GuestGift, InvitationGuest } from "@api/contract";
import { type Currency, parseAmount } from "@api/lib/money";
import { getMessages } from "@/i18n";
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

export type GuestGiftState = { gifts?: GuestGift[]; error?: string } | undefined;

/** The guest tells the family how much they sent by KHQR. It waits for the family to confirm. */
export async function submitGuestGift(token: string, language: "km" | "en", _state: GuestGiftState, formData: FormData): Promise<GuestGiftState> {
  const currency: Currency = field(formData, "currency") === "KHR" ? "KHR" : "USD";
  const amount = parseAmount(field(formData, "amount"), currency);
  if (!amount) return { error: (await getMessages(language)).invite.badAmount };
  try {
    const { gifts } = await api.post<{ gifts: GuestGift[] }>(`/invitations/${token}/gift`, { amount, currency, note: field(formData, "note") }, language);
    return { gifts };
  } catch (e) {
    if (e instanceof ApiError && [400, 409, 429].includes(e.status)) return { error: e.fieldErrors ? Object.values(e.fieldErrors).flat().join(" ") : e.message };
    throw e;
  }
}
