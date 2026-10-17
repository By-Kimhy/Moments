// Everything a report needs about one event, optionally only one family's side: families often
// keep separate gift books for the bride's and the groom's side, to return gifts later.
import type { Side } from "@prisma/client";
import { prisma } from "../db.js";
import { giftTotals } from "../lib/gifts.js";

export type ReportSide = Side | null;

export type GuestGiftRow = {
  guestId: string | null;
  name: string;
  nameAlt: string | null;
  phone: string | null;
  side: Side | null; // null: a giver not on the guest list
  group: string | null;
  usd: number;
  khr: number;
  count: number;
  methods: ("CASH" | "KHQR")[];
  notes: string[];
  checkedInPeople: number | null;
};

export async function buildReport(eventId: string, side: ReportSide) {
  const [event, guests, gifts] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
    prisma.guest.findMany({ where: { eventId, ...(side ? { side } : {}) }, include: { checkins: true } }),
    prisma.gift.findMany({
      where: { eventId, ...(side ? { guest: { side } } : {}) },
      include: { guest: true, recordedBy: { select: { displayName: true } }, voidedBy: { select: { displayName: true } } },
      orderBy: { recordedAt: "asc" },
    }),
  ]);

  const invited = guests.filter((g) => !g.walkIn);
  const attendance = {
    invitedGuests: invited.length,
    invitedPeople: invited.reduce((s, g) => s + g.invitedCount, 0),
    attendingGuests: invited.filter((g) => g.rsvpStatus === "ATTENDING").length,
    attendingPeople: invited.reduce((s, g) => s + (g.rsvpStatus === "ATTENDING" ? (g.rsvpCount ?? g.invitedCount) : 0), 0),
    declinedGuests: invited.filter((g) => g.rsvpStatus === "DECLINED").length,
    checkedInGuests: guests.filter((g) => g.checkins.length).length,
    checkedInPeople: guests.reduce((s, g) => s + (g.checkins[0]?.peopleCount ?? 0), 0),
    walkIns: guests.length - invited.length,
  };

  // One row per giver: a guest (all their gifts added up) or a name given at the desk.
  const rows = new Map<string, GuestGiftRow>();
  for (const gift of gifts) {
    if (gift.voidedAt || gift.status !== "CONFIRMED") continue;
    const key = gift.guest ? `g:${gift.guest.id}` : `n:${(gift.giverName ?? "").trim().toLowerCase()}`;
    const row = rows.get(key) ?? {
      guestId: gift.guest?.id ?? null,
      name: gift.guest?.name ?? gift.giverName ?? "",
      nameAlt: gift.guest?.nameAlt ?? null,
      phone: gift.guest?.phone ?? null,
      side: gift.guest?.side ?? null,
      group: gift.guest?.group ?? null,
      usd: 0,
      khr: 0,
      count: 0,
      methods: [],
      notes: [],
      checkedInPeople: null,
    };
    if (gift.currency === "USD") row.usd += gift.amount;
    else row.khr += gift.amount;
    row.count++;
    if (!row.methods.includes(gift.method)) row.methods.push(gift.method);
    if (gift.note) row.notes.push(gift.note);
    rows.set(key, row);
  }
  const checkins = new Map(guests.map((g) => [g.id, g.checkins[0]?.peopleCount ?? null]));
  const sideOrder = { GROOM: 0, BRIDE: 1, BOTH: 2 } as const;
  const byGiver = [...rows.values()]
    .map((r) => ({ ...r, checkedInPeople: r.guestId ? (checkins.get(r.guestId) ?? null) : null }))
    .sort((a, b) => (a.side ? sideOrder[a.side] : 3) - (b.side ? sideOrder[b.side] : 3) || a.name.localeCompare(b.name, "km"));

  return {
    event: { titleKm: event.titleKm, titleEn: event.titleEn, startsAt: event.startsAt, venueKm: event.venueKm, venueEn: event.venueEn },
    side,
    generatedAt: new Date(),
    totals: giftTotals(gifts),
    attendance,
    byGiver,
    gifts: gifts.map((g) => ({
      recordedAt: g.recordedAt,
      name: g.guest?.name ?? g.giverName ?? "",
      side: g.guest?.side ?? null,
      amount: g.amount,
      currency: g.currency,
      method: g.method,
      status: g.voidedAt ? ("VOIDED" as const) : g.status,
      source: g.source,
      recordedBy: g.recordedBy?.displayName ?? null,
      note: g.note,
      voidReason: g.voidReason,
    })),
  };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;
