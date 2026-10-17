// The gift book as a PDF, printed by Chromium from HTML. Khmer needs a real text-shaping engine
// (vowels and subscripts combine around consonants); PDF libraries without one garble it, a
// browser gets it right. The Khmer fonts are embedded in the page, so no network is needed.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { formatAmount } from "../lib/money.js";
import type { Report } from "./data.js";
import { LABELS, type ReportLanguage } from "./labels.js";

const require = createRequire(import.meta.url);

/** The Chromium to print with: CHROMIUM_PATH, or a usual install location. */
export function chromiumPath() {
  const candidates = [process.env.CHROMIUM_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"];
  return candidates.find((p): p is string => Boolean(p) && existsSync(p!)) ?? null;
}

let fontCss: string | null = null;
function fonts() {
  fontCss ??= [
    ["Kantumruy Pro", 400, "@fontsource/kantumruy-pro/files/kantumruy-pro-khmer-400-normal.woff2"],
    ["Kantumruy Pro", 700, "@fontsource/kantumruy-pro/files/kantumruy-pro-khmer-700-normal.woff2"],
    ["Kantumruy Pro", 400, "@fontsource/kantumruy-pro/files/kantumruy-pro-latin-400-normal.woff2"],
    ["Kantumruy Pro", 700, "@fontsource/kantumruy-pro/files/kantumruy-pro-latin-700-normal.woff2"],
    ["Moul", 400, "@fontsource/moul/files/moul-khmer-400-normal.woff2"],
  ]
    .map(([family, weight, file]) => {
      const data = readFileSync(require.resolve(file as string)).toString("base64");
      return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${data}) format("woff2");}`;
    })
    .join("\n");
  return fontCss;
}

const escape = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const both = (usd: number, khr: number) => [usd && formatAmount(usd, "USD"), khr && formatAmount(khr, "KHR")].filter(Boolean).join(" + ") || "—";

export function reportHtml(report: Report, lang: ReportLanguage) {
  const L = LABELS[lang];
  const title = lang === "en" && report.event.titleEn ? report.event.titleEn : report.event.titleKm;
  const date = new Intl.DateTimeFormat(lang === "km" ? "km-KH" : "en-GB", { timeZone: "Asia/Phnom_Penh", dateStyle: "long" }).format(report.event.startsAt);
  const generated = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", dateStyle: "medium", timeStyle: "short" }).format(report.generatedAt);
  const t = report.totals;
  const a = report.attendance;
  const usdTotal = report.byGiver.reduce((s, r) => s + r.usd, 0);
  const khrTotal = report.byGiver.reduce((s, r) => s + r.khr, 0);

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
${fonts()}
@page { size: A4; margin: 16mm 12mm 18mm; }
body { font-family: "Kantumruy Pro", sans-serif; font-size: 10.5pt; color: #2b1d1d; line-height: 1.7; }
h1 { font-family: "Moul", serif; font-weight: 400; color: #9b2c2c; font-size: 18pt; margin: 0; }
h2 { font-size: 12pt; margin: 18px 0 6px; color: #9b2c2c; }
.sub { color: #7a6a66; }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.card { border: 1px solid #ead9cf; border-radius: 8px; padding: 8px 10px; }
.card b { display: block; font-size: 14pt; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
table { width: 100%; border-collapse: collapse; }
th { background: #9b2c2c; color: #fff; text-align: left; font-weight: 700; padding: 4px 6px; }
td { border-bottom: 1px solid #ead9cf; padding: 3px 6px; vertical-align: top; }
tr { page-break-inside: avoid; }
thead { display: table-header-group; }
tfoot { display: table-row-group; }
.num { text-align: right; white-space: nowrap; }
.muted { color: #7a6a66; font-size: 9pt; }
tfoot td { font-weight: 700; border-top: 2px solid #9b2c2c; }
dl { margin: 0; } dl div { display: flex; justify-content: space-between; border-bottom: 1px dotted #ead9cf; }
</style></head><body>
<h1>${escape(L.giftBook)}</h1>
<div><b>${escape(title)}</b> · ${escape(date)}</div>
<div class="sub">${escape(report.side ? L.side[report.side] : L.allSides)} · ${escape(L.generated)} ${escape(generated)}</div>

<div class="cards">
  <div class="card">${escape(L.totalUsd)}<b>${formatAmount(t.total.USD, "USD")}</b></div>
  <div class="card">${escape(L.totalKhr)}<b>${formatAmount(t.total.KHR, "KHR")}</b></div>
  <div class="card">${escape(L.giftCount)}<b>${t.count}</b></div>
</div>

<div class="cols">
  <div>
    <h2>${escape(L.bySide)}</h2>
    <dl>${(["GROOM", "BRIDE", "BOTH", "NONE"] as const)
      .map((s) => `<div><dt>${escape(L.side[s])}</dt><dd>${both(t.bySide[s].USD, t.bySide[s].KHR)}</dd></div>`)
      .join("")}
      <div><dt>${escape(L.cash)}</dt><dd>${both(t.byMethod.CASH.USD, t.byMethod.CASH.KHR)}</dd></div>
      <div><dt>${escape(L.khqr)}</dt><dd>${both(t.byMethod.KHQR.USD, t.byMethod.KHQR.KHR)}</dd></div>
      ${t.pendingCount ? `<div><dt>${escape(L.pending)}</dt><dd>${both(t.pending.USD, t.pending.KHR)}</dd></div>` : ""}
    </dl>
  </div>
  <div>
    <h2>${escape(L.attendance)}</h2>
    <dl>${(
      [
        [L.invited, a.invitedGuests],
        [L.invitedPeople, a.invitedPeople],
        [L.attending, a.attendingPeople],
        [L.declined, a.declinedGuests],
        [L.arrived, a.checkedInPeople],
        [L.walkIns, a.walkIns],
      ] as const
    )
      .map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${value}</dd></div>`)
      .join("")}</dl>
  </div>
</div>

<h2>${escape(L.byGiver)}</h2>
<table>
  <thead><tr><th>${escape(L.no)}</th><th>${escape(L.name)}</th><th>${escape(L.bySide)}</th><th>${escape(L.group)}</th><th class="num">${escape(L.usd)}</th><th class="num">${escape(L.khr)}</th><th>${escape(L.method)}</th></tr></thead>
  <tbody>${report.byGiver
    .map(
      (r, i) => `<tr><td>${i + 1}</td><td>${escape(r.name)}${r.nameAlt ? `<div class="muted">${escape(r.nameAlt)}</div>` : ""}${r.notes.length ? `<div class="muted">${escape(r.notes.join(" / "))}</div>` : ""}</td>
      <td>${escape(L.side[r.side ?? "NONE"])}</td><td>${escape(r.group)}</td>
      <td class="num">${r.usd ? formatAmount(r.usd, "USD") : ""}</td><td class="num">${r.khr ? formatAmount(r.khr, "KHR") : ""}</td>
      <td>${r.methods.map((m) => (m === "CASH" ? L.cash : L.khqr)).join(", ")}</td></tr>`,
    )
    .join("")}</tbody>
  <tfoot><tr><td></td><td>${escape(L.total)}</td><td></td><td></td><td class="num">${formatAmount(usdTotal, "USD")}</td><td class="num">${formatAmount(khrTotal, "KHR")}</td><td></td></tr></tfoot>
</table>
</body></html>`;
}

export async function reportPdf(report: Report, lang: ReportLanguage) {
  const executablePath = chromiumPath();
  if (!executablePath) return null;
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.setContent(reportHtml(report, lang), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;font-size:8px;color:#7a6a66;text-align:center">Moments · <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
      margin: { top: "16mm", bottom: "18mm", left: "12mm", right: "12mm" },
    });
  } finally {
    await browser.close();
  }
}
