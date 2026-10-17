// Thank-you messages after the wedding: the text (with the guest's name, and optionally their
// gift), who gets one, and when the invitation turns into a thank-you card.
import type { Currency, Event, Language } from "@prisma/client";
import { formatAmount } from "./money.js";

export const DEFAULT_THANK_YOU: Record<Language, string> = {
  KM: "សូមអរគុណ {name} ដែលបានចូលរួមអបអរសាទរពិធីមង្គលការរបស់យើងខ្ញុំ។ ការចូលរួម និងការគាំទ្ររបស់លោកអ្នក មានន័យយ៉ាងធំធេងសម្រាប់ពួកយើង។ សូមជូនពរឱ្យលោកអ្នកមានសុខភាពល្អ និងសេចក្តីសុខគ្រប់ពេលវេលា។ — {couple}",
  EN: "Thank you, {name}, for celebrating our wedding with us. Your presence and support mean so much to us. Wishing you good health and happiness. — {couple}",
};

export type Audience = "ALL" | "ATTENDED" | "GAVE";

export type ThankYouGuest = {
  name: string;
  nameAlt: string | null;
  rsvpStatus: "PENDING" | "ATTENDING" | "DECLINED";
  checkins: unknown[];
  gifts: { amount: number; currency: Currency; status: string; voidedAt: Date | null }[];
};

/** Confirmed gifts of one guest, e.g. "$50.00 + ១០០,០០០៛". Empty if none. */
export function giftText(gifts: ThankYouGuest["gifts"], language: Language) {
  const sum = { USD: 0, KHR: 0 };
  for (const g of gifts) if (g.status === "CONFIRMED" && !g.voidedAt) sum[g.currency] += g.amount;
  return (["USD", "KHR"] as const)
    .filter((c) => sum[c])
    .map((c) => formatAmount(sum[c], c, language === "KM"))
    .join(" + ");
}

export const gave = (g: ThankYouGuest) => giftText(g.gifts, "EN") !== "";
export const attended = (g: ThankYouGuest) => g.checkins.length > 0;

/** Everyone who didn't say no; those who came; or those who gave a gift. */
export function inAudience(g: ThankYouGuest, audience: Audience) {
  if (audience === "ATTENDED") return attended(g);
  if (audience === "GAVE") return gave(g);
  return g.rsvpStatus !== "DECLINED" || attended(g) || gave(g);
}

export function coupleNames(e: Pick<Event, "groomNameKm" | "groomNameEn" | "brideNameKm" | "brideNameEn" | "titleKm" | "titleEn">, language: Language) {
  const groom = language === "KM" ? e.groomNameKm || e.groomNameEn : e.groomNameEn || e.groomNameKm;
  const bride = language === "KM" ? e.brideNameKm || e.brideNameEn : e.brideNameEn || e.brideNameKm;
  if (groom && bride) return `${groom} ${language === "KM" ? "និង" : "&"} ${bride}`;
  return (language === "KM" ? e.titleKm : e.titleEn || e.titleKm) ?? "";
}

/** Fills {name}, {gift}, {couple} and {link}. A sentence about a gift the guest didn't give is left out. */
export function renderThankYou(template: string, values: { name: string; gift: string; couple: string; link: string }) {
  return template
    .replace(/\{name\}/g, values.name)
    .replace(/\{gift\}/g, values.gift)
    .replace(/\{couple\}/g, values.couple)
    .replace(/\{link\}/g, values.link)
    .replace(/[ \t]+([.,។])/g, "$1")
    .trim();
}

/** The text for one guest in one language, from the event's template or the default. */
export function thankYouFor(
  event: Pick<Event, "thankYouKm" | "thankYouEn" | "groomNameKm" | "groomNameEn" | "brideNameKm" | "brideNameEn" | "titleKm" | "titleEn">,
  guest: ThankYouGuest,
  language: Language,
  link: string,
) {
  const template = (language === "KM" ? event.thankYouKm : event.thankYouEn) || DEFAULT_THANK_YOU[language];
  const name = language === "EN" ? guest.nameAlt || guest.name : guest.name;
  return renderThankYou(template, { name, gift: giftText(guest.gifts, language), couple: coupleNames(event, language), link });
}

/** Twelve hours after it starts, the invitation shows the thank-you card instead. */
export const showThankYouCard = (event: Pick<Event, "startsAt" | "status">, now = new Date()) =>
  event.status === "ARCHIVED" || now.getTime() > event.startsAt.getTime() + 12 * 3600_000;
