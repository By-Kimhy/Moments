// Seating: how many seats a guest needs, and arranging guests at tables automatically.
import type { RsvpStatus, Side } from "@prisma/client";

/** People to seat for one invitation: those confirmed if they said yes, nobody if they said no. */
export function seatsFor(g: { rsvpStatus: RsvpStatus; rsvpCount: number | null; invitedCount: number }) {
  if (g.rsvpStatus === "DECLINED") return 0;
  if (g.rsvpStatus === "ATTENDING") return g.rsvpCount ?? g.invitedCount;
  return g.invitedCount;
}

export type ArrangeTable = { id: string; capacity: number; used: number };
export type ArrangeGuest = { id: string; side: Side; group: string | null; seats: number };

const SIDE_ORDER: Record<Side, number> = { GROOM: 0, BRIDE: 1, BOTH: 2 };

/**
 * Seats guests at tables. Each side stays together, and within it each group (family, friends,
 * work…), filling tables in order. One guest row (a family invited together) is never split.
 * Guests who fit nowhere are returned in `unplaced`. Tables keep the seats already taken.
 */
export function autoArrange(tables: ArrangeTable[], guests: ArrangeGuest[]) {
  const free = new Map(tables.map((t) => [t.id, t.capacity - t.used]));
  const order = tables.map((t) => t.id);
  const assignments: { guestId: string; tableId: string }[] = [];
  const unplaced: string[] = [];

  // Clusters: side, then group; the biggest parties first inside each so they still fit.
  const clusters = new Map<string, ArrangeGuest[]>();
  for (const g of guests.filter((x) => x.seats > 0)) {
    const key = `${SIDE_ORDER[g.side]}\u0000${g.group ?? "￿"}`;
    clusters.set(key, [...(clusters.get(key) ?? []), g]);
  }
  const sortedKeys = [...clusters.keys()].sort((a, b) => a.localeCompare(b, "km"));

  for (const key of sortedKeys) {
    const used: string[] = []; // tables this cluster already sits at
    for (const guest of clusters.get(key)!.sort((a, b) => b.seats - a.seats)) {
      const fits = (id: string) => (free.get(id) ?? 0) >= guest.seats;
      const table =
        used.find(fits) ?? // next to their own group
        order.find((id) => fits(id) && free.get(id) === tables.find((t) => t.id === id)!.capacity) ?? // an empty table
        order.find(fits); // any table with room
      if (!table) {
        unplaced.push(guest.id);
        continue;
      }
      free.set(table, free.get(table)! - guest.seats);
      if (!used.includes(table)) used.push(table);
      assignments.push({ guestId: guest.id, tableId: table });
    }
  }
  return { assignments, unplaced };
}

/** Names for new tables: continue after the highest numbered table ("1".."20" → "21"…). */
export function nextTableNames(existing: string[], count: number) {
  const highest = Math.max(0, ...existing.filter((n) => /^\d+$/.test(n)).map(Number));
  return Array.from({ length: count }, (_, i) => String(highest + i + 1));
}
