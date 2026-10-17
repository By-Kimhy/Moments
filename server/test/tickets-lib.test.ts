import { describe, expect, it } from "vitest";
import { newReference, onSale, platformFee } from "../src/lib/tickets.js";

describe("ticket rules", () => {
  it("knows when a ticket type is on sale", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    expect(onSale({ active: true, salesStart: null, salesEnd: null }, now)).toBe(true);
    expect(onSale({ active: false, salesStart: null, salesEnd: null }, now)).toBe(false);
    expect(onSale({ active: true, salesStart: new Date("2026-12-02T00:00:00Z"), salesEnd: null }, now)).toBe(false);
    expect(onSale({ active: true, salesStart: null, salesEnd: new Date("2026-12-01T00:00:00Z") }, now)).toBe(false);
  });

  it("makes short references without look-alike characters", () => {
    for (let i = 0; i < 50; i++) expect(newReference()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("rounds the platform fee to whole cents or riel", () => {
    expect(platformFee(2500, 4)).toBe(100);
    expect(platformFee(1999, 4)).toBe(80);
    expect(platformFee(150000, 3.5)).toBe(5250);
  });
});
