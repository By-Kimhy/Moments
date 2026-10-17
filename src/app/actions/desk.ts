"use server";

import { redirect } from "next/navigation";
import type { DeskJoinResponse } from "@api/contract";
import { type FormState, api, attempt, field } from "@/lib/api";
import { createDeskSession, deleteDeskSession } from "@/lib/session";

export async function joinDesk(_state: FormState, formData: FormData): Promise<FormState> {
  const body = { code: field(formData, "code"), name: field(formData, "name") };
  const result = await attempt(() => api.post<DeskJoinResponse>("/desk/join", body));
  if (!result.ok) return { ...result.state, values: body };
  await createDeskSession(result.data.token);
  redirect("/desk");
}

export async function leaveDesk() {
  await deleteDeskSession();
  redirect("/desk");
}
