// The visitor's language comes from the "lang" cookie; Khmer when it's missing.
import "server-only";
import { cookies } from "next/headers";
import { en } from "./en";
import { km, type Messages } from "./km";

export type Locale = "km" | "en";
export const LOCALE_COOKIE = "lang";

export async function getLocale(): Promise<Locale> {
  return (await cookies()).get(LOCALE_COOKIE)?.value === "en" ? "en" : "km";
}

export async function getMessages(locale?: Locale): Promise<Messages> {
  return (locale ?? (await getLocale())) === "en" ? en : km;
}

export type { Messages };
