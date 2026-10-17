"use server";

import { revalidatePath } from "next/cache";
import { api, attempt } from "@/lib/api";

export type TelegramLink = { code: string; url: string | null; groupCommand: string; botUsername: string | null };
export type TelegramState = { link?: TelegramLink; message?: string; tested?: boolean } | undefined;

export async function createTelegramLink(eventId: string): Promise<TelegramState> {
  const result = await attempt(() => api.post<TelegramLink>(`/events/${eventId}/telegram/link`));
  return result.ok ? { link: result.data } : { message: result.state.message };
}

export async function sendTelegramTest(eventId: string): Promise<TelegramState> {
  const result = await attempt(() => api.post(`/events/${eventId}/telegram/test`));
  return result.ok ? { tested: true } : { message: result.state.message };
}

export async function disconnectTelegram(eventId: string) {
  await api.delete(`/events/${eventId}/telegram`);
  revalidatePath(`/events/${eventId}`);
}
