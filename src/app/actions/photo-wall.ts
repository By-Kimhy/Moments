"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

export async function setWallPhotoHidden(eventId: string, photoId: string, hidden: boolean) {
  await api.post(`/events/${eventId}/photo-wall/${photoId}/${hidden ? "hide" : "show"}`);
  revalidatePath(`/events/${eventId}/photos`);
}

export async function deleteWallPhoto(eventId: string, photoId: string) {
  await api.delete(`/events/${eventId}/photo-wall/${photoId}`);
  revalidatePath(`/events/${eventId}/photos`);
}
