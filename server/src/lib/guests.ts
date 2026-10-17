// Guest fields, and turning a spreadsheet of guests into rows the API can create.
import type { Guest, Prisma, Side } from "@prisma/client";
import ExcelJS from "exceljs";
import { z } from "zod";
import { config } from "../config.js";
import { parseCsv } from "./csv.js";
import { normalizePhone } from "./phone.js";

export const MAX_IMPORT_ROWS = 2000;

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";
/** "០១២ ៣៤៥" → "012 345": people type phone numbers and counts in Khmer digits too. */
export const latinDigits = (s: string) => s.replace(/[០-៩]/g, (d) => String(KHMER_DIGITS.indexOf(d)));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const guestSchema = z.object({
  name: z.string().trim().min(1, "Enter the guest's name.").max(160),
  nameAlt: optionalText(160),
  phone: z
    .string()
    .nullish()
    .transform((v, ctx) => {
      if (!v?.trim()) return null;
      const phone = normalizePhone(latinDigits(v));
      if (!phone) ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
      return phone;
    }),
  side: z.enum(["BRIDE", "GROOM", "BOTH"], { message: "Choose the bride's or groom's side." }).default("BOTH"),
  group: optionalText(80),
  invitedCount: z.coerce
    .number({ message: "Enter how many people are invited." })
    .int("Enter a whole number.")
    .min(1, "At least 1 person.")
    .max(50, "At most 50 people per invitation.")
    .default(1),
  // A table by id (forms) or by name (spreadsheet import; created if it doesn't exist yet).
  tableId: z
    .string()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), "Choose a table."),
  tableName: optionalText(40),
});

export type GuestInput = z.output<typeof guestSchema>;

export const inviteUrl = (token: string) => `${config.appUrl()}/i/${token}`;

/** A guest as hosts see it. */
export const guestView = (g: Guest & { _count?: { checkins: number; gifts: number }; table?: { name: string } | null }) => ({
  id: g.id,
  name: g.name,
  nameAlt: g.nameAlt,
  phone: g.phone,
  side: g.side,
  group: g.group,
  invitedCount: g.invitedCount,
  inviteToken: g.inviteToken,
  inviteUrl: inviteUrl(g.inviteToken),
  rsvpStatus: g.rsvpStatus,
  rsvpCount: g.rsvpCount,
  rsvpMessage: g.rsvpMessage,
  rsvpAt: g.rsvpAt,
  openedAt: g.openedAt,
  tableId: g.tableId,
  tableName: g.table?.name ?? null,
  walkIn: g.walkIn,
  checkedIn: (g._count?.checkins ?? 0) > 0,
  giftCount: g._count?.gifts ?? 0,
  createdAt: g.createdAt,
});

// Column headings we recognise, in English and Khmer (compared lower-case, without spaces).
const HEADINGS: Record<keyof GuestInput, string[]> = {
  name: ["name", "fullname", "guest", "guestname", "ឈ្មោះ", "ឈ្មោះភ្ញៀវ", "ឈ្មោះខ្មែរ"],
  nameAlt: ["latinname", "englishname", "name(latin)", "name(english)", "ឈ្មោះឡាតាំង", "ឈ្មោះអង់គ្លេស"],
  phone: ["phone", "phonenumber", "mobile", "tel", "telephone", "លេខទូរស័ព្ទ", "ទូរស័ព្ទ", "លេខ"],
  side: ["side", "ខាង"],
  group: ["group", "relationship", "category", "ក្រុម", "ទំនាក់ទំនង", "ប្រភេទ"],
  invitedCount: ["people", "partysize", "count", "guests", "number", "pax", "ចំនួន", "ចំនួនមនុស្ស", "ចំនួនភ្ញៀវ"],
  tableId: [],
  tableName: ["table", "tableno", "tablenumber", "តុ", "លេខតុ"],
};

const SIDES: Record<string, Side> = {
  bride: "BRIDE", b: "BRIDE", "ស្រី": "BRIDE", "កូនក្រមុំ": "BRIDE", "ខាងស្រី": "BRIDE", "ខាងកូនក្រមុំ": "BRIDE",
  groom: "GROOM", g: "GROOM", "ប្រុស": "GROOM", "កូនកំលោះ": "GROOM", "ខាងប្រុស": "GROOM", "ខាងកូនកំលោះ": "GROOM",
  both: "BOTH", "": "BOTH", "ទាំងពីរ": "BOTH", "ទាំងពីរខាង": "BOTH",
};

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export type ImportRow = { line: number; guest: GuestInput };
export type ImportError = { line: number; messages: string[] };
export type ImportResult = { rows: ImportRow[]; errors: ImportError[] };

/** Reads the first sheet of an .xlsx file, or a .csv file, into rows of text. */
export async function readSheet(buffer: Buffer, fileName: string): Promise<string[][]> {
  if (/\.csv$/i.test(fileName)) return parseCsv(buffer.toString("utf8"));
  if (!/\.xlsx$/i.test(fileName)) throw new Error("unsupported");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) cells.push(row.getCell(c).text ?? "");
    rows.push(cells);
  });
  return rows;
}

/**
 * Turns spreadsheet rows (first row = headings) into guests. Rows with problems are reported
 * by line number instead of stopping the whole import.
 */
export function rowsToGuests(table: string[][]): ImportResult | { headingError: true } {
  const [headings = [], ...body] = table;
  const columns = new Map<keyof GuestInput, number>();
  headings.forEach((h, i) => {
    const key = (Object.keys(HEADINGS) as (keyof GuestInput)[]).find((k) => HEADINGS[k].includes(squash(h)));
    if (key && !columns.has(key)) columns.set(key, i);
  });
  if (!columns.has("name")) return { headingError: true };

  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  body.forEach((cells, i) => {
    const line = i + 2; // heading is line 1
    const cell = (k: keyof GuestInput) => (columns.has(k) ? (cells[columns.get(k)!] ?? "").trim() : "");
    const sideText = squash(cell("side"));
    const side = SIDES[sideText];
    const count = latinDigits(cell("invitedCount"));
    const result = guestSchema.safeParse({
      name: cell("name"),
      nameAlt: cell("nameAlt"),
      phone: cell("phone"),
      side: side ?? "unknown",
      group: cell("group"),
      invitedCount: count === "" ? undefined : count,
      tableName: cell("tableName"),
    });
    if (result.success) rows.push({ line, guest: result.data });
    else errors.push({ line, messages: result.error.issues.map((issue) => issue.message) });
  });
  return { rows, errors };
}

/**
 * Resolves a guest's table for one event: an id must belong to the event; a name finds the
 * table or creates it (at the end of the list). Returns the table id, or null for none.
 */
export async function resolveTable(tx: Prisma.TransactionClient, eventId: string, input: { tableId?: string | null; tableName?: string | null }) {
  if (input.tableId) {
    const table = await tx.diningTable.findFirst({ where: { id: input.tableId, eventId }, select: { id: true } });
    if (!table) return undefined; // caller reports "Table not found"
    return table.id;
  }
  if (!input.tableName) return null;
  const existing = await tx.diningTable.findUnique({ where: { eventId_name: { eventId, name: input.tableName } }, select: { id: true } });
  if (existing) return existing.id;
  const last = await tx.diningTable.aggregate({ where: { eventId }, _max: { sortOrder: true } });
  const created = await tx.diningTable.create({ data: { eventId, name: input.tableName, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  return created.id;
}
