// Turns the session cookie into a user by asking the API. Pages check here; the API checks
// again on every call.
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { CurrentUser } from "@api/contract";
import { ApiError, api } from "./api";

// Cached per request, so a page and its layout share one lookup.
export const getOptionalUser = cache(async (): Promise<CurrentUser | null> => {
  try {
    return (await api.get<{ user: CurrentUser }>("/auth/me")).user;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getOptionalUser();
  if (!user) redirect("/login");
  return user;
}
