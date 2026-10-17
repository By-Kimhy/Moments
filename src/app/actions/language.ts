"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, getLocale } from "@/i18n";

/** Switches between Khmer and English. */
export async function setLanguage() {
  const next = (await getLocale()) === "km" ? "en" : "km";
  (await cookies()).set(LOCALE_COOKIE, next, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
