import { describe, expect, it } from "vitest";
import { type ArrangeGuest, autoArrange, nextTableNames, seatsFor } from "../src/lib/seating.js";

describe("seatsFor", () => {
  it("counts confirmed people, invited people without a reply, and nobody for a no", () => {
    expect(seatsFor({ rsvpStatus: "ATTENDING", rsvpCount: 2, invitedCount: 4 })).toBe(2);
    expect(seatsFor({ rsvpStatus: "PENDING", rsvpCount: null, invitedCount: 3 })).toBe(3);
    expect(seatsFor({ rsvpStatus: "DECLINED", rsvpCount: 0, invitedCount: 3 })).toBe(0);
  });
});

describe("autoArrange", () => {
  const g = (id: string, side: ArrangeGuest["side"], group: string | null, seats: number): ArrangeGuest => ({ id, side, group, seats });

  it("keeps sides and groups together and never splits a party", () => {
    const tables = [1, 2, 3].map((n) => ({ id: `t${n}`, capacity: 10, used: 0 }));
    const { assignments, unplaced } = autoArrange(tables, [
      g("bride-friend-1", "BRIDE", "Friends", 4),
      g("groom-family-1", "GROOM", "Family", 6),
      g("groom-family-2", "GROOM", "Family", 4),
      g("bride-friend-2", "BRIDE", "Friends", 5),
      g("groom-work", "GROOM", "Work", 3),
    ]);
    const at = Object.fromEntries(assignments.map((a) => [a.guestId, a.tableId]));
    expect(unplaced).toEqual([]);
    expect(at["groom-family-1"]).toBe(at["groom-family-2"]); // 6 + 4 fill table 1
    expect(at["groom-family-1"]).toBe("t1");
    expect(at["groom-work"]).toBe("t2"); // groom's side next
    expect(at["bride-friend-1"]).toBe(at["bride-friend-2"]); // 5 + 4 together
    expect(at["bride-friend-1"]).toBe("t3");
  });

  it("respects seats already taken, skips guests who said no, and reports who didn't fit", () => {
    const { assignments, unplaced } = autoArrange(
      [{ id: "t1", capacity: 8, used: 6 }],
      [g("small", "BOTH", null, 2), g("declined", "BOTH", null, 0), g("big", "BOTH", null, 3)],
    );
    // The bigger party is tried first and doesn't fit; the 2-seat party takes the last 2 seats.
    expect(assignments).toEqual([{ guestId: "small", tableId: "t1" }]);
    expect(unplaced).toEqual(["big"]);
  });
});

describe("nextTableNames", () => {
  it("continues the numbering", () => {
    expect(nextTableNames([], 3)).toEqual(["1", "2", "3"]);
    expect(nextTableNames(["1", "2", "VIP", "7"], 2)).toEqual(["8", "9"]);
  });
});
