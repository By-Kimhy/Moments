import { describe, expect, it } from "vitest";
import { normalizePhone } from "../src/lib/phone.js";

describe("normalizePhone", () => {
  it.each([
    ["012 345 678", "+85512345678"],
    ["012-345-678", "+85512345678"],
    ["+855 12 345 678", "+85512345678"],
    ["855 12345678", "+85512345678"],
    ["+855012345678", "+85512345678"],
    ["097 7777 777", "+855977777777"],
    ["12345678", "+85512345678"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("keeps numbers from other countries", () => {
    expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
  });

  it.each(["", "abc", "012", "0123456789012", "+855 0"])("rejects %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

import { csvCell } from "../src/lib/csv.js";

describe("csvCell", () => {
  it("keeps formulas from running in Excel, but leaves phone numbers alone", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-cmd")).toBe("'-cmd");
    expect(csvCell("+85512345678")).toBe("+85512345678");
    expect(csvCell("-5")).toBe("-5");
    expect(csvCell("សុខ ដារ៉ា")).toBe("សុខ ដារ៉ា");
  });
});
