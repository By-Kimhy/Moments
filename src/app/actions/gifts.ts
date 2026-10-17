"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { type Currency, parseAmount } from "@api/lib/money";
import { type FormState, api, attempt, field } from "@/lib/api";
import { getMessages } from "@/i18n";

const giftsPath = (eventId: string) => `/events/${eventId}/gifts`;

/** The amount as typed ("50", "100,000") in minor units, or a form error. */
async function amountFrom(formData: FormData) {
  const currency = (field(formData, "currency") === "KHR" ? "KHR" : "USD") as Currency;
  const amount = parseAmount(field(formData, "amount"), currency);
  return { amount, currency, error: amount ? null : (await getMessages()).desk.badAmount };
}

export async function addGift(eventId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const values = Object.fromEntries(["amount", "currency", "method", "guestId", "giverName", "note"].map((k) => [k, field(formData, k)]));
  const { amount, currency, error } = await amountFrom(formData);
  if (error) return { errors: { amount: [error] }, values };
  const result = await attempt(() =>
    api.post(`${giftsPath(eventId)}`, {
      amount,
      currency,
      method: values.method || "CASH",
      guestId: values.guestId || null,
      giverName: values.giverName,
      note: values.note,
      clientId: randomUUID(),
    }),
  );
  if (!result.ok) return { ...result.state, values };
  revalidatePath(giftsPath(eventId));
  return { done: true };
}

export async function updateGift(eventId: string, giftId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const values = Object.fromEntries(["amount", "currency", "method", "note"].map((k) => [k, field(formData, k)]));
  const { amount, currency, error } = await amountFrom(formData);
  if (error) return { errors: { amount: [error] }, values };
  const result = await attempt(() => api.patch(`${giftsPath(eventId)}/${giftId}`, { amount, currency, method: values.method, note: values.note }));
  if (!result.ok) return { ...result.state, values };
  revalidatePath(`${giftsPath(eventId)}/${giftId}`);
  return { done: true };
}

export async function voidGift(eventId: string, giftId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const result = await attempt(() => api.post(`${giftsPath(eventId)}/${giftId}/void`, { reason: field(formData, "reason") }));
  if (!result.ok) return result.state;
  revalidatePath(`${giftsPath(eventId)}/${giftId}`);
  return { done: true };
}

export async function confirmGift(eventId: string, giftId: string) {
  await api.post(`${giftsPath(eventId)}/${giftId}/confirm`);
  revalidatePath(giftsPath(eventId));
}

export async function rejectGift(eventId: string, giftId: string) {
  await api.post(`${giftsPath(eventId)}/${giftId}/reject`);
  revalidatePath(giftsPath(eventId));
}
