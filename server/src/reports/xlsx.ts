// The gift book as an Excel workbook: a summary, one row per giver (what families use to return
// gifts at other weddings), every gift with its status, and the guest list with attendance.
// Amounts are real numbers in dollars and riel so people can add them up in Excel.
import ExcelJS from "exceljs";
import { prisma } from "../db.js";
import type { Report } from "./data.js";
import { LABELS, type ReportLanguage } from "./labels.js";

const FONT = { name: "Khmer OS Battambang", size: 11 }; // installed on most computers in Cambodia
const USD_FORMAT = '"$"#,##0.00';
const KHR_FORMAT = '#,##0"៛"';

function header(sheet: ExcelJS.Worksheet, columns: { header: string; key: string; width: number; numFmt?: string }[]) {
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width, style: { font: FONT, numFmt: c.numFmt } }));
  const row = sheet.getRow(1);
  row.font = { ...FONT, bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9B2C2C" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

export async function reportWorkbook(report: Report, eventId: string, lang: ReportLanguage) {
  const L = LABELS[lang];
  const book = new ExcelJS.Workbook();
  book.creator = "Moments";
  book.created = report.generatedAt;
  const sideName = report.side ? L.side[report.side] : L.allSides;

  // Summary
  const summary = book.addWorksheet(L.summary);
  summary.columns = [{ width: 34, style: { font: FONT } }, { width: 22, style: { font: FONT } }];
  const title = lang === "en" && report.event.titleEn ? report.event.titleEn : report.event.titleKm;
  summary.addRow([`${L.giftBook} — ${title}`]).font = { ...FONT, size: 14, bold: true };
  summary.addRow([sideName]);
  summary.addRow([L.generated, report.generatedAt.toISOString().slice(0, 16).replace("T", " ") + " UTC"]);
  summary.addRow([]);
  const t = report.totals;
  const money = (label: string, usd: number, khr: number) => {
    summary.addRow([`${label} — ${L.usd}`, usd / 100]).getCell(2).numFmt = USD_FORMAT;
    summary.addRow([`${label} — ${L.khr}`, khr]).getCell(2).numFmt = KHR_FORMAT;
  };
  money(L.total, t.total.USD, t.total.KHR);
  summary.addRow([L.giftCount, t.count]);
  money(L.cash, t.byMethod.CASH.USD, t.byMethod.CASH.KHR);
  money(L.khqr, t.byMethod.KHQR.USD, t.byMethod.KHQR.KHR);
  if (t.pendingCount) money(L.pending, t.pending.USD, t.pending.KHR);
  summary.addRow([]);
  summary.addRow([L.bySide]).font = { ...FONT, bold: true };
  for (const side of ["GROOM", "BRIDE", "BOTH", "NONE"] as const) money(L.side[side], t.bySide[side].USD, t.bySide[side].KHR);
  summary.addRow([]);
  summary.addRow([L.attendance]).font = { ...FONT, bold: true };
  const a = report.attendance;
  for (const [label, value] of [
    [L.invited, a.invitedGuests],
    [L.invitedPeople, a.invitedPeople],
    [L.attending, a.attendingPeople],
    [L.declined, a.declinedGuests],
    [L.arrived, a.checkedInPeople],
    [L.walkIns, a.walkIns],
  ] as const) {
    summary.addRow([label, value]);
  }

  // One row per giver
  const givers = book.addWorksheet(L.byGiver);
  header(givers, [
    { header: L.no, key: "no", width: 6 },
    { header: L.name, key: "name", width: 26 },
    { header: "Latin", key: "nameAlt", width: 22 },
    { header: L.bySide, key: "side", width: 16 },
    { header: L.group, key: "group", width: 16 },
    { header: L.phone, key: "phone", width: 16 },
    { header: L.usd, key: "usd", width: 12, numFmt: USD_FORMAT },
    { header: L.khr, key: "khr", width: 14, numFmt: KHR_FORMAT },
    { header: L.method, key: "method", width: 12 },
    { header: L.note, key: "note", width: 30 },
  ]);
  report.byGiver.forEach((r, i) =>
    givers.addRow({
      no: i + 1,
      name: r.name,
      nameAlt: r.nameAlt,
      side: L.side[r.side ?? "NONE"],
      group: r.group,
      phone: r.phone,
      usd: r.usd ? r.usd / 100 : null,
      khr: r.khr || null,
      method: r.methods.map((m) => (m === "CASH" ? L.cash : L.khqr)).join(", "),
      note: r.notes.join(" / "),
    }),
  );
  const last = givers.rowCount;
  const totalRow = givers.addRow({ name: L.total, usd: { formula: `SUM(G2:G${last})` }, khr: { formula: `SUM(H2:H${last})` } });
  totalRow.font = { ...FONT, bold: true };

  // Every gift, cancelled ones included, so the book can be checked line by line
  const all = book.addWorksheet(L.allGifts);
  header(all, [
    { header: L.time, key: "time", width: 18 },
    { header: L.name, key: "name", width: 26 },
    { header: L.bySide, key: "side", width: 16 },
    { header: L.amount, key: "amount", width: 14 },
    { header: L.currency, key: "currency", width: 10 },
    { header: L.method, key: "method", width: 10 },
    { header: L.status, key: "status", width: 14 },
    { header: L.recordedBy, key: "recordedBy", width: 18 },
    { header: L.note, key: "note", width: 30 },
  ]);
  for (const g of report.gifts) {
    const row = all.addRow({
      time: new Date(g.recordedAt.getTime() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " "), // Phnom Penh time
      name: g.name,
      side: L.side[g.side ?? "NONE"],
      amount: g.currency === "USD" ? g.amount / 100 : g.amount,
      currency: g.currency,
      method: g.method === "CASH" ? L.cash : L.khqr,
      status: L.statuses[g.status],
      recordedBy: g.recordedBy,
      note: [g.note, g.voidReason].filter(Boolean).join(" / "),
    });
    row.getCell("amount").numFmt = g.currency === "USD" ? USD_FORMAT : KHR_FORMAT;
    if (g.status !== "CONFIRMED") row.font = { ...FONT, strike: g.status === "VOIDED", color: { argb: "FF888888" } };
  }

  // Guest list with replies and attendance
  const guests = await prisma.guest.findMany({
    where: { eventId, ...(report.side ? { side: report.side } : {}) },
    include: { checkins: true, table: { select: { name: true } } },
    orderBy: [{ side: "asc" }, { name: "asc" }],
  });
  const guestSheet = book.addWorksheet(L.guests);
  header(guestSheet, [
    { header: L.name, key: "name", width: 26 },
    { header: L.bySide, key: "side", width: 16 },
    { header: L.group, key: "group", width: 16 },
    { header: L.phone, key: "phone", width: 16 },
    { header: L.invitedPeople, key: "invited", width: 12 },
    { header: L.rsvp, key: "rsvp", width: 14 },
    { header: L.arrived, key: "arrived", width: 12 },
    { header: L.table, key: "table", width: 10 },
  ]);
  for (const g of guests) {
    guestSheet.addRow({
      name: g.name,
      side: L.side[g.side],
      group: g.group,
      phone: g.phone,
      invited: g.invitedCount,
      rsvp: L.rsvps[g.rsvpStatus],
      arrived: g.checkins[0]?.peopleCount ?? null,
      table: g.table?.name ?? null,
    });
  }

  return Buffer.from(await book.xlsx.writeBuffer());
}
