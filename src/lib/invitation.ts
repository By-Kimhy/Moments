import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { InvitationResponse } from "@api/contract";
import { getLocale, type Locale } from "@/i18n";
import { ApiError, api } from "./api";

/** One API call per request, shared by the page and its metadata. */
export const getInvitation = cache(async (token: string): Promise<InvitationResponse> => {
  try {
    return await api.get<InvitationResponse>(`/invitations/${encodeURIComponent(token)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
});

/** ?lang=en|km wins, so a guest can switch; otherwise the visitor's cookie, then Khmer. */
export async function invitationLocale(lang: string | string[] | undefined): Promise<Locale> {
  if (lang === "en" || lang === "km") return lang;
  return getLocale();
}
