"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type FormState, api, attempt, field } from "@/lib/api";
import { deleteDeskSession, deleteSession } from "@/lib/session";

export async function updateAccount(_state: FormState, formData: FormData): Promise<FormState> {
  const values = { name: field(formData, "name"), language: field(formData, "language") };
  const result = await attempt(() => api.patch("/auth/me", values));
  if (!result.ok) return { ...result.state, values };
  revalidatePath("/account");
  return { done: true };
}

export async function deleteAccount(_state: FormState, formData: FormData): Promise<FormState> {
  const result = await attempt(() => api.post("/auth/me/delete", { confirm: field(formData, "confirm") }));
  if (!result.ok) return result.state;
  await deleteSession();
  await deleteDeskSession();
  redirect("/");
}
