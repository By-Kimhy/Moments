"use server";

import { redirect } from "next/navigation";
import type { AuthResponse, OtpRequestResponse } from "@api/contract";
import { type FormState, api, attempt, field } from "@/lib/api";
import { createSession, deleteDeskSession, deleteSession } from "@/lib/session";

export type LoginState = (NonNullable<FormState> & { step?: "phone" | "code"; phone?: string; devCode?: string }) | undefined;

// Only allow same-site relative paths, so `?next=` can't redirect off-site.
function safeNext(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function requestCode(_state: LoginState, formData: FormData): Promise<LoginState> {
  const phone = field(formData, "phone");
  const result = await attempt(() => api.post<OtpRequestResponse>("/auth/otp/request", { phone }));
  if (!result.ok) return { ...result.state, step: "phone", values: { phone } };
  return { step: "code", phone: result.data.phone, devCode: result.data.devCode };
}

export async function verifyCode(state: LoginState, formData: FormData): Promise<LoginState> {
  const body = { phone: field(formData, "phone"), code: field(formData, "code"), name: field(formData, "name") || undefined };
  const result = await attempt(() => api.post<AuthResponse>("/auth/otp/verify", body));
  if (!result.ok) return { ...result.state, step: "code", phone: body.phone, devCode: state?.devCode, values: { name: body.name ?? "" } };

  await createSession(result.data.token);
  redirect(safeNext(field(formData, "next")));
}

export async function logout() {
  await deleteSession();
  await deleteDeskSession();
  redirect("/");
}
