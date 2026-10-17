// Seating printouts for the venue: an alphabetical "find your table" list for the entrance,
// then one card per table with the names seated there.
import { escape, fonts, htmlToPdf } from "./pdf.js";
import type { ReportLanguage } from "./labels.js";

type Table = { name: string; capacity: number; seatsUsed: number; guests: { name: string; nameAlt: string | null; seats: number }[] };

const L = {
  km: { title: "ប្លង់តុ", find: "ស្វែងរកតុរបស់អ្នក", table: "តុ", name: "ឈ្មោះ", people: "នាក់", seats: "កៅអី" },
  en: { title: "Seating plan", find: "Find your table", table: "Table", name: "Name", people: "people", seats: "seats" },
} as const;

export function seatingHtml(eventTitle: string, tables: Table[], lang: ReportLanguage) {
  const t = L[lang];
  // "តុ 5", but "តុកិត្តិយស" rather than "តុ តុកិត្តិយស".
  const label = (name: string) => (/^(តុ|table)/i.test(name) ? name : `${t.table} ${name}`);
  const index = tables
    .flatMap((table) => table.guests.map((g) => ({ ...g, table: table.name })))
    .sort((a, b) => a.name.localeCompare(b.name, "km"));
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
${fonts()}
@page { size: A4; margin: 14mm; }
body { font-family: "Kantumruy Pro", sans-serif; color: #2b1d1d; line-height: 1.7; font-size: 11pt; }
h1 { font-family: "Moul", serif; font-weight: 400; color: #9b2c2c; margin: 0; font-size: 18pt; }
h2 { color: #9b2c2c; margin: 4px 0 10px; }
.index { columns: 2; column-gap: 24px; }
.index div { display: flex; justify-content: space-between; border-bottom: 1px dotted #ead9cf; break-inside: avoid; }
.index b { color: #9b2c2c; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; page-break-before: always; }
.card { border: 2px solid #9b2c2c; border-radius: 12px; padding: 10px 14px; break-inside: avoid; }
.card h3 { font-family: "Moul", serif; font-weight: 400; color: #9b2c2c; margin: 0; font-size: 16pt; }
.card .sub { color: #7a6a66; font-size: 9pt; }
.card ol { margin: 6px 0 0; padding-left: 18px; }
.muted { color: #7a6a66; font-size: 9pt; }
</style></head><body>
<h1>${escape(t.title)}</h1>
<div>${escape(eventTitle)}</div>
<h2>${escape(t.find)}</h2>
<div class="index">${index
    .map((g) => `<div><span>${escape(g.name)}${g.nameAlt ? ` <span class="muted">${escape(g.nameAlt)}</span>` : ""}</span><b>${escape(label(g.table))}</b></div>`)
    .join("")}</div>
<div class="cards">${tables
    .map(
      (table) => `<div class="card"><h3>${escape(label(table.name))}</h3>
      <div class="sub">${table.seatsUsed}/${table.capacity} ${escape(t.seats)}</div>
      <ol>${table.guests.map((g) => `<li>${escape(g.name)}${g.seats > 1 ? ` <span class="muted">(${g.seats} ${escape(t.people)})</span>` : ""}</li>`).join("")}</ol></div>`,
    )
    .join("")}</div>
</body></html>`;
}

export const seatingPdf = (eventTitle: string, tables: Table[], lang: ReportLanguage) => htmlToPdf(seatingHtml(eventTitle, tables, lang));
