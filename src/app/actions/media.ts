"use server";

import { revalidatePath } from "next/cache";
import { type FormState, api, attempt } from "@/lib/api";

// Only real files: an empty file input still sends a nameless, empty File.
const files = (formData: FormData, key: string) =>
  formData.getAll(key).filter((f): f is File => f instanceof File && f.size > 0);

export async function uploadPhotos(eventId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const body = new FormData();
  for (const file of files(formData, "photos")) body.append("photos", file, file.name);
  const result = await attempt(() => api.post(`/events/${eventId}/photos`, body));
  if (!result.ok) return result.state;
  revalidatePath(`/events/${eventId}`);
  return { done: true };
}

export async function removePhoto(eventId: string, key: string) {
  await api.delete(`/events/${eventId}/photos/${key}`);
  revalidatePath(`/events/${eventId}`);
}

export async function makeCover(eventId: string, key: string) {
  await api.post(`/events/${eventId}/photos/${key}/cover`);
  revalidatePath(`/events/${eventId}`);
}

export async function uploadKhqr(eventId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const [file] = files(formData, "image");
  const body = new FormData();
  if (file) body.append("image", file, file.name);
  const result = await attempt(() => api.put(`/events/${eventId}/khqr`, body));
  if (!result.ok) return result.state;
  revalidatePath(`/events/${eventId}`);
  return { done: true };
}

export async function removeKhqr(eventId: string) {
  await api.delete(`/events/${eventId}/khqr`);
  revalidatePath(`/events/${eventId}`);
}
