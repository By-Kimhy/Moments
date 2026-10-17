// Guests' wishes for the couple: the ones written as wishes, plus the messages left with a reply
// or a gift, gathered into one list and a printable wish book.
import { prisma } from "../db.js";
import { escape, fonts } from "../reports/pdf.js";

export const MAX_WISHES_PER_GUEST = 5;

export type WishItem = { id: string; kind: "WISH" | "RSVP" | "GIFT"; guest: string; text: string; at: Date; hidden: boolean };

/** Every wish of an event, oldest first. Hidden wishes only when asked for. */
export async function collectWishes(eventId: string, { includeHidden = false } = {}): Promise<WishItem[]> {
  const [wishes, replies, gifts] = await Promise.all([
    prisma.wish.findMany({ where: { eventId, ...(includeHidden ? {} : { hiddenAt: null }) }, include: { guest: { select: { name: true } } } }),
    prisma.guest.findMany({ where: { eventId, rsvpMessage: { not: null } }, select: { id: true, name: true, rsvpMessage: true, rsvpAt: true, updatedAt: true } }),
    prisma.gift.findMany({ where: { eventId, note: { not: null }, voidedAt: null }, select: { id: true, note: true, giverName: true, createdAt: true, guest: { select: { name: true } } } }),
  ]);
  return [
    ...wishes.map((w) => ({ id: w.id, kind: "WISH" as const, guest: w.guest.name, text: w.text, at: w.createdAt, hidden: w.hiddenAt !== null })),
    ...replies.map((g) => ({ id: g.id, kind: "RSVP" as const, guest: g.name, text: g.rsvpMessage!, at: g.rsvpAt ?? g.updatedAt, hidden: false })),
    ...gifts.map((g) => ({ id: g.id, kind: "GIFT" as const, guest: g.guest?.name ?? g.giverName ?? "", text: g.note!, at: g.createdAt, hidden: false })),
  ]
    .filter((w) => w.text.trim())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The wish book: one card per wish, for printing or keeping. */
export function wishBookHtml(event: { titleKm: string; titleEn: string | null; startsAt: Date }, wishes: WishItem[], lang: "km" | "en") {
  const title = lang === "en" && event.titleEn ? event.titleEn : event.titleKm;
  const date = new Intl.DateTimeFormat(lang === "km" ? "km-KH" : "en-GB", { timeZone: "Asia/Phnom_Penh", dateStyle: "long" }).format(event.startsAt);
  const heading = lang === "km" ? "សៀវភៅពាក្យជូនពរ" : "Wish book";
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
${fonts()}
@page { size: A4; margin: 18mm 14mm; }
body { font-family: "Kantumruy Pro", sans-serif; font-size: 11pt; color: #2b1d1d; line-height: 1.8; }
header { text-align: center; margin-bottom: 18px; }
h1 { font-family: "Moul", serif; font-weight: 400; color: #9b2c2c; font-size: 20pt; margin: 0; }
.sub { color: #7a6a66; }
.wishes { columns: 2; column-gap: 12px; }
.wish { break-inside: avoid; border: 1px solid #ead9cf; border-radius: 10px; padding: 10px 12px; margin: 0 0 12px; background: #fffaf5; }
.wish p { margin: 0 0 6px; white-space: pre-line; }
.wish .by { color: #9b2c2c; font-weight: 700; font-size: 10pt; }
</style></head><body>
<header><h1>${escape(heading)}</h1><div><b>${escape(title)}</b></div><div class="sub">${escape(date)}</div></header>
<div class="wishes">
${wishes.map((w) => `<div class="wish"><p>“${escape(w.text)}”</p><div class="by">— ${escape(w.guest)}</div></div>`).join("\n")}
</div></body></html>`;
}
