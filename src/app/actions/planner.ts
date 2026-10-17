"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { HostEvent, OrganizationSummary } from "@api/contract";
import { type FormState, api, attempt, field } from "@/lib/api";
import { toIso } from "@/lib/dates";

export async function createOrganization(_state: FormState, formData: FormData): Promise<FormState> {
  const body = { name: field(formData, "name") };
  const result = await attempt(() => api.post<{ organization: OrganizationSummary }>("/organizations", body));
  if (!result.ok) return { ...result.state, values: body };
  redirect(`/planner/${result.data.organization.id}`);
}

export async function updateOrganization(orgId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const body = { name: field(formData, "name"), brandColor: field(formData, "brandColor") };
  const result = await attempt(() => api.patch(`/organizations/${orgId}`, body));
  if (!result.ok) return { ...result.state, values: body };
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const upload = new FormData();
    upload.append("image", logo, logo.name);
    const uploaded = await attempt(() => api.put(`/organizations/${orgId}/logo`, upload));
    if (!uploaded.ok) return uploaded.state;
  }
  revalidatePath(`/planner/${orgId}`);
  return { done: true };
}

export async function addStaff(orgId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const body = { name: field(formData, "name"), phone: field(formData, "phone"), role: field(formData, "role") || "STAFF" };
  const result = await attempt(() => api.post(`/organizations/${orgId}/members`, body));
  if (!result.ok) return { ...result.state, values: body };
  revalidatePath(`/planner/${orgId}`);
  return { done: true };
}

export async function removeStaff(orgId: string, memberId: string) {
  await api.delete(`/organizations/${orgId}/members/${memberId}`);
  revalidatePath(`/planner/${orgId}`);
}

export async function createClientEvent(orgId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const values = Object.fromEntries(["titleKm", "date", "time", "clientName", "clientPhone"].map((k) => [k, field(formData, k)]));
  const result = await attempt(() =>
    api.post<{ event: HostEvent }>(`/organizations/${orgId}/events`, {
      titleKm: values.titleKm,
      startsAt: toIso(values.date, values.time),
      clientName: values.clientName,
      clientPhone: values.clientPhone,
    }),
  );
  if (!result.ok) {
    const { startsAt, ...rest } = result.state.errors ?? {};
    return { ...result.state, errors: result.state.errors ? { ...rest, date: startsAt } : undefined, values };
  }
  redirect(`/events/${result.data.event.id}`);
}
