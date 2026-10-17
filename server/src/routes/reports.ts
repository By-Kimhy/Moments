// Gift and attendance reports for hosts, on screen and as Excel or PDF downloads.
// ?side=GROOM|BRIDE|BOTH gives one family's book; ?lang=en switches the wording.
import { Router, type Request } from "express";
import { z } from "zod";
import { currentMember, ownersOnly } from "../access.js";
import { HttpError, parse } from "../errors.js";
import { buildReport } from "../reports/data.js";
import type { ReportLanguage } from "../reports/labels.js";
import { reportPdf } from "../reports/pdf.js";
import { reportWorkbook } from "../reports/xlsx.js";

/** Mounted on /api/events/:eventId (after eventAccess). */
export const reportsRouter = Router({ mergeParams: true });
reportsRouter.use("/reports", ownersOnly);

const query = z.object({
  side: z.enum(["GROOM", "BRIDE", "BOTH"]).optional().catch(undefined),
  lang: z.enum(["km", "en"]).optional().catch(undefined),
});

function options(req: Request) {
  const { side, lang } = parse(query, req.query);
  const language: ReportLanguage = lang ?? (req.acceptsLanguages("km", "en") === "en" ? "en" : "km");
  return { side: side ?? null, language };
}

/** "gift-book-groom-2026-12-20.xlsx" */
function fileName(side: string | null, startsAt: Date, ext: string) {
  return `gift-book${side ? `-${side.toLowerCase()}` : ""}-${startsAt.toISOString().slice(0, 10)}.${ext}`;
}

reportsRouter.get("/reports/summary", async (req, res) => {
  const { side } = options(req);
  const report = await buildReport(currentMember(req).eventId, side);
  res.json({ report: { ...report, gifts: undefined } });
});

reportsRouter.get("/reports/gift-book.xlsx", async (req, res) => {
  const { side, language } = options(req);
  const { eventId } = currentMember(req);
  const report = await buildReport(eventId, side);
  const file = await reportWorkbook(report, eventId, language);
  res.set("Content-Disposition", `attachment; filename="${fileName(side, report.event.startsAt, "xlsx")}"`);
  res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(file);
});

reportsRouter.get("/reports/gift-book.pdf", async (req, res) => {
  const { side, language } = options(req);
  const report = await buildReport(currentMember(req).eventId, side);
  const file = await reportPdf(report, language);
  if (!file) throw new HttpError(503, "PDF export is not set up on this server.");
  res.set("Content-Disposition", `attachment; filename="${fileName(side, report.event.startsAt, "pdf")}"`);
  res.type("application/pdf").send(file);
});
