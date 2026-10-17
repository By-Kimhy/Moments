"use server";

import { redirect } from "next/navigation";
import type { AuthResponse } from "@api/contract";
import { ApiError, api } from "@/lib/api";
import { createSession, deleteDeskSession, deleteSession } from "@/lib/session";

// Only allow same-site relative paths, so `?next=` can't redirect off-site.
function safeNext(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

/**
 * Asks the API whether the bot has confirmed this login. Once it has, the session cookie is
 * set here (on the web app's own domain) and the page is told where to go.
 */
export async function finishTelegramLogin(token: string, next: string): Promise<{ status: "pending" | "expired" } | { status: "done"; next: string }> {
  try {
    const res = await api.post<{ status: "pending" } | ({ status: "done" } & AuthResponse)>("/auth/telegram/poll", { token });
    if (res.status === "pending") return res;
    await createSession(res.token);
    return { status: "done", next: safeNext(next) };
  } catch (e) {
    if (e instanceof ApiError && e.status === 410) return { status: "expired" };
    throw e;
  }
}

export async function logout() {
  await deleteSession();
  await deleteDeskSession();
  redirect("/");
}
