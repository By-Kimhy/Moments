"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { HostEvent } from "@api/contract";
import { type FormState, api, attempt, field } from "@/lib/api";
import { toIso } from "@/lib/dates";

/** "07:00 | ពិធីហែជំនូន | Procession" per line → schedule items. */
function parseSchedule(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [time = "", titleKm = "", titleEn = ""] = line.split("|").map((p) => p.trim());
      return { time, titleKm, titleEn: titleEn || null };
    });
}

const TEXT_FIELDS = [
  "titleKm",
  "titleEn",
  "groomNameKm",
  "groomNameEn",
  "brideNameKm",
  "brideNameEn",
  "venueKm",
  "venueEn",
  "mapUrl",
  "khqrAccountName",
  "templateId",
] as const;

function eventBody(formData: FormData) {
  const body: Record<string, unknown> = Object.fromEntries(TEXT_FIELDS.map((k) => [k, field(formData, k)]));
  body.startsAt = toIso(field(formData, "date"), field(formData, "time"));
  body.schedule = parseSchedule(field(formData, "schedule"));
  if (formData.has("status")) body.status = field(formData, "status");
  return body;
}

// Keep what was typed, so a failed save doesn't empty the form.
const typed = (formData: FormData) =>
  Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));

// Schedule errors arrive per item ("schedule"); dates arrive as "startsAt" but the form has "date".
function formErrors(errors?: Record<string, string[] | undefined>) {
  if (!errors) return errors;
  const { startsAt, ...rest } = errors;
  return { ...rest, date: startsAt };
}

export async function createEvent(_state: FormState, formData: FormData): Promise<FormState> {
  const result = await attempt(() => api.post<{ event: HostEvent }>("/events", eventBody(formData)));
  if (!result.ok) return { ...result.state, errors: formErrors(result.state.errors), values: typed(formData) };
  redirect(`/events/${result.data.event.id}`);
}

export async function updateEvent(eventId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const result = await attempt(() => api.patch(`/events/${eventId}`, eventBody(formData)));
  if (!result.ok) return { ...result.state, errors: formErrors(result.state.errors), values: typed(formData) };
  redirect(`/events/${eventId}`);
}

export async function addCohost(eventId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const body = { phone: field(formData, "phone"), name: field(formData, "name") };
  const result = await attempt(() => api.post(`/events/${eventId}/cohosts`, body));
  if (!result.ok) return { ...result.state, values: body };
  revalidatePath(`/events/${eventId}`);
  return { done: true };
}

export async function removeMember(eventId: string, memberId: string) {
  await api.delete(`/events/${eventId}/members/${memberId}`);
  revalidatePath(`/events/${eventId}`);
}

export async function rotateHelperCode(eventId: string) {
  await api.post(`/events/${eventId}/helper-code`);
  revalidatePath(`/events/${eventId}`);
}
