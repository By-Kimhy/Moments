"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

export async function orderPlan(eventId: string, plan: "STANDARD" | "PREMIUM") {
  await api.post(`/events/${eventId}/plan/orders`, { plan });
  revalidatePath(`/events/${eventId}/plan`);
}

export async function cancelPlanOrder(eventId: string, orderId: string) {
  await api.post(`/events/${eventId}/plan/orders/${orderId}/cancel`);
  revalidatePath(`/events/${eventId}/plan`);
}

// Platform admins.

export async function confirmPlanOrder(orderId: string) {
  await api.post(`/admin/plan-orders/${orderId}/confirm`);
  revalidatePath("/admin");
}

export async function rejectPlanOrder(orderId: string) {
  await api.post(`/admin/plan-orders/${orderId}/cancel`);
  revalidatePath("/admin");
}
