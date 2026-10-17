"use server";

import { redirect } from "next/navigation";
import { ApiError, api, field } from "@/lib/api";

export type ShopState = { message?: string; errors?: Record<string, string[] | undefined>; values?: Record<string, string> } | undefined;

/** Places the order and sends the buyer to their order page to pay. */
export async function placeOrder(slug: string, language: "km" | "en", _state: ShopState, formData: FormData): Promise<ShopState> {
  const items = [...formData.entries()]
    .filter(([k]) => k.startsWith("qty:"))
    .map(([k, v]) => ({ ticketTypeId: k.slice(4), quantity: Number(v) || 0 }))
    .filter((i) => i.quantity > 0);
  const values = { buyerName: field(formData, "buyerName"), buyerPhone: field(formData, "buyerPhone") };
  let token: string;
  try {
    ({ token } = await api.post<{ token: string }>(`/public/events/${slug}/orders`, { ...values, items }, language));
  } catch (e) {
    if (e instanceof ApiError && [400, 409, 429].includes(e.status)) return { message: e.fieldErrors ? undefined : e.message, errors: e.fieldErrors, values };
    throw e;
  }
  redirect(`/o/${token}`);
}
