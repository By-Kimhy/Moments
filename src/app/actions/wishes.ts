"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

export async function setWishHidden(eventId: string, wishId: string, hidden: boolean) {
  await api.post(`/events/${eventId}/wishes/${wishId}/${hidden ? "hide" : "show"}`);
  revalidatePath(`/events/${eventId}/wishes`);
}
