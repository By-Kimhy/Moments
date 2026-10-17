"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { OwnVendor } from "@api/contract";
import { type Currency, parseAmount } from "@api/lib/money";
import { getMessages } from "@/i18n";
import { type FormState, api, attempt, field } from "@/lib/api";

const files = (formData: FormData, key: string) => formData.getAll(key).filter((f): f is File => f instanceof File && f.size > 0);

const VENDOR_FIELDS = ["name", "category", "province", "slug", "descriptionKm", "descriptionEn", "priceFrom", "priceCurrency", "phone", "telegram", "facebookUrl"];


export async function createVendor(_state: FormState, formData: FormData): Promise<FormState> {
  const values = Object.fromEntries(["name", "category", "province"].map((k) => [k, field(formData, k)]));
  const result = await attempt(() => api.post<{ vendor: OwnVendor }>("/vendors/mine", values));
  if (!result.ok) return { ...result.state, values };
  redirect(`/vendor/${result.data.vendor.id}`);
}

export async function updateVendor(vendorId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const values = Object.fromEntries(VENDOR_FIELDS.map((k) => [k, field(formData, k)]));
  // The price is typed in dollars or riel ("350", "2,000,000") and sent in minor units.
  const currency = (values.priceCurrency === "KHR" ? "KHR" : "USD") as Currency;
  const priceFrom = values.priceFrom.trim() ? parseAmount(values.priceFrom, currency) : null;
  if (values.priceFrom.trim() && !priceFrom) return { errors: { priceFrom: [(await getMessages()).desk.badAmount] }, values };
  const result = await attempt(() => api.patch(`/vendors/mine/${vendorId}`, { ...values, priceCurrency: currency, priceFrom }));
  if (!result.ok) return { ...result.state, values };
  const [logo] = files(formData, "logo");
  if (logo) {
    const upload = new FormData();
    upload.append("image", logo, logo.name);
    const uploaded = await attempt(() => api.put(`/vendors/mine/${vendorId}/logo`, upload));
    if (!uploaded.ok) return { ...uploaded.state, values };
  }
  revalidatePath(`/vendor/${vendorId}`);
  return { done: true };
}

export async function uploadVendorPhotos(vendorId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const body = new FormData();
  for (const file of files(formData, "photos")) body.append("photos", file, file.name);
  const result = await attempt(() => api.post(`/vendors/mine/${vendorId}/photos`, body));
  if (!result.ok) return result.state;
  revalidatePath(`/vendor/${vendorId}`);
  return { done: true };
}

export async function removeVendorPhoto(vendorId: string, key: string) {
  await api.delete(`/vendors/mine/${vendorId}/photos/${key}`);
  revalidatePath(`/vendor/${vendorId}`);
}

export async function submitVendor(vendorId: string): Promise<FormState> {
  const result = await attempt(() => api.post(`/vendors/mine/${vendorId}/submit`));
  if (!result.ok) {
    // Name what's missing in one message: the fields are in another form.
    const missing = Object.values(result.state.errors ?? {}).flat();
    return { message: [result.state.message, ...missing].filter(Boolean).join(" ") };
  }
  revalidatePath(`/vendor/${vendorId}`);
  return { done: true };
}

export async function markEnquiriesRead(vendorId: string) {
  await api.post(`/vendors/mine/${vendorId}/enquiries/read`);
  revalidatePath(`/vendor/${vendorId}`);
}

export async function replyToReview(vendorId: string, reviewId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const result = await attempt(() => api.put(`/vendors/mine/${vendorId}/reviews/${reviewId}/reply`, { reply: field(formData, "reply") }));
  if (!result.ok) return result.state;
  revalidatePath(`/vendor/${vendorId}`);
  return { done: true };
}

export async function sendEnquiry(slug: string, _state: FormState, formData: FormData): Promise<FormState> {
  const values = Object.fromEntries(["name", "phone", "eventDate", "message", "eventId"].map((k) => [k, field(formData, k)]));
  const result = await attempt(() => api.post(`/vendors/${slug}/enquiries`, values));
  if (!result.ok) return { ...result.state, values };
  revalidatePath(`/vendors/${slug}`);
  return { done: true };
}

export async function saveReview(slug: string, _state: FormState, formData: FormData): Promise<FormState> {
  const values = { rating: field(formData, "rating"), text: field(formData, "text") };
  const result = await attempt(() => api.put(`/vendors/${slug}/reviews`, values));
  if (!result.ok) return { ...result.state, values };
  revalidatePath(`/vendors/${slug}`);
  return { done: true };
}

export async function shortlistVendor(vendorId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const eventId = field(formData, "eventId");
  const result = await attempt(() => api.put(`/events/${eventId}/vendors/${vendorId}`, { status: field(formData, "status") || "CONSIDERING", note: field(formData, "note") }));
  if (!result.ok) return result.state;
  revalidatePath(`/events/${eventId}/vendors`);
  return { done: true };
}

export async function removeShortlisted(eventId: string, vendorId: string) {
  await api.delete(`/events/${eventId}/vendors/${vendorId}`);
  revalidatePath(`/events/${eventId}/vendors`);
}

export async function reportVendor(slug: string, reviewId: string | null, _state: FormState, formData: FormData): Promise<FormState> {
  const result = await attempt(() => api.post(`/vendors/${slug}/reports`, { reason: field(formData, "reason"), note: field(formData, "note"), reviewId }));
  if (!result.ok) return result.state;
  return { done: true };
}

// Platform admins.

export async function moderateVendor(vendorId: string, action: "approve" | "return" | "suspend", formData: FormData) {
  await api.post(`/admin/vendors/${vendorId}/${action}`, { note: field(formData, "note") });
  revalidatePath("/admin", "layout");
}

export async function featureVendor(vendorId: string, formData: FormData) {
  await api.post(`/admin/vendors/${vendorId}/feature`, { days: field(formData, "days") || "0" });
  revalidatePath("/admin", "layout");
}

export async function setReviewHidden(reviewId: string, hidden: boolean) {
  await api.post(`/admin/reviews/${reviewId}/${hidden ? "hide" : "show"}`);
  revalidatePath("/admin", "layout");
}

export async function resolveReport(reportId: string) {
  await api.post(`/admin/reports/${reportId}/resolve`);
  revalidatePath("/admin", "layout");
}
