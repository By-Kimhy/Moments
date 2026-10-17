"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { BulkImportResponse, GuestInput, ImportPreview } from "@api/contract";
import { ApiError, type FormState, api, attempt, field } from "@/lib/api";

const GUEST_FIELDS = ["name", "nameAlt", "phone", "side", "group", "invitedCount"] as const;

// The table select only exists once the event has tables; without it the table is left alone.
const guestBody = (formData: FormData): Record<string, string> => ({
  ...Object.fromEntries(GUEST_FIELDS.map((k) => [k, field(formData, k)])),
  ...(formData.has("tableId") ? { tableId: field(formData, "tableId") } : {}),
});

export async function addGuest(eventId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const body = guestBody(formData);
  const result = await attempt(() => api.post(`/events/${eventId}/guests`, body));
  if (!result.ok) return { ...result.state, values: body };
  revalidatePath(`/events/${eventId}/guests`);
  return { done: true };
}

export async function updateGuest(eventId: string, guestId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const body = guestBody(formData);
  const result = await attempt(() => api.patch(`/events/${eventId}/guests/${guestId}`, body));
  if (!result.ok) return { ...result.state, values: body };
  redirect(`/events/${eventId}/guests`);
}

export async function newGuestLink(eventId: string, guestId: string) {
  await api.post(`/events/${eventId}/guests/${guestId}/new-link`);
  revalidatePath(`/events/${eventId}/guests/${guestId}`);
}

export async function deleteGuest(eventId: string, guestId: string): Promise<FormState> {
  const result = await attempt(() => api.delete(`/events/${eventId}/guests/${guestId}`));
  if (!result.ok) return result.state;
  redirect(`/events/${eventId}/guests`);
}

export type ImportState =
  | { step: "preview"; preview: ImportPreview }
  | { step: "done"; created: number; skipped: number }
  | (NonNullable<FormState> & { step: "upload" })
  | undefined;

/** Step 1: send the file to the API and show what it found. */
export async function previewImport(eventId: string, _state: ImportState, formData: FormData): Promise<ImportState> {
  const file = formData.get("file");
  const body = new FormData();
  if (file instanceof File && file.size > 0) body.append("file", file, file.name);
  const result = await attempt(() => api.post<ImportPreview>(`/events/${eventId}/guests/import/parse`, body));
  if (!result.ok) return { ...result.state, step: "upload" };
  return { step: "preview", preview: result.data };
}

/** Step 2: add the previewed guests. */
export async function confirmImport(eventId: string, _state: ImportState, formData: FormData): Promise<ImportState> {
  const guests = JSON.parse(field(formData, "guests") || "[]") as GuestInput[];
  try {
    const result = await api.post<BulkImportResponse>(`/events/${eventId}/guests/bulk`, { guests });
    revalidatePath(`/events/${eventId}/guests`);
    return { step: "done", ...result };
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) return { step: "upload", message: e.message };
    throw e;
  }
}
