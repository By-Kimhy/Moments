"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

// Featured placement for vendors and subscriptions for planners, paid to the platform.

export async function orderFeatured(vendorId: string, days: number) {
  await api.post(`/vendors/mine/${vendorId}/featured/orders`, { days });
  revalidatePath(`/vendor/${vendorId}`);
}

export async function cancelFeatured(vendorId: string, orderId: string) {
  await api.post(`/vendors/mine/${vendorId}/featured/orders/${orderId}/cancel`);
  revalidatePath(`/vendor/${vendorId}`);
}

export async function orderSubscription(orgId: string, months: number) {
  await api.post(`/organizations/${orgId}/subscription/orders`, { months });
  revalidatePath(`/planner/${orgId}`);
}

export async function cancelSubscription(orgId: string, orderId: string) {
  await api.post(`/organizations/${orgId}/subscription/orders/${orderId}/cancel`);
  revalidatePath(`/planner/${orgId}`);
}
