// Wishes for the hosts: every wish of the event, hiding one, and the wish book as a PDF.
import { Router } from "express";
import { currentMember, isUuid, ownersOnly } from "../access.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { collectWishes, wishBookHtml } from "../lib/wishes.js";
import { htmlToPdf } from "../reports/pdf.js";

/** Mounted on /api/events/:eventId (after eventAccess). */
export const wishesRouter = Router({ mergeParams: true });
wishesRouter.use("/wishes", ownersOnly);

wishesRouter.get("/wishes", async (req, res) => {
  res.json({ wishes: await collectWishes(currentMember(req).eventId, { includeHidden: true }) });
});

async function setHidden(eventId: string, wishId: unknown, hidden: boolean) {
  const wish = isUuid(wishId) ? await prisma.wish.findFirst({ where: { id: wishId, eventId } }) : null;
  if (!wish) throw new HttpError(404, "Not found.");
  await prisma.wish.update({ where: { id: wish.id }, data: { hiddenAt: hidden ? new Date() : null } });
}

wishesRouter.post("/wishes/:wishId/hide", async (req, res) => {
  await setHidden(currentMember(req).eventId, req.params.wishId, true);
  res.status(204).end();
});

wishesRouter.post("/wishes/:wishId/show", async (req, res) => {
  await setHidden(currentMember(req).eventId, req.params.wishId, false);
  res.status(204).end();
});

wishesRouter.get("/wishes/book.pdf", async (req, res) => {
  const { eventId } = currentMember(req);
  const language = req.acceptsLanguages("km", "en") === "en" ? "en" : "km";
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const file = await htmlToPdf(wishBookHtml(event, await collectWishes(eventId), language));
  if (!file) throw new HttpError(503, "PDF export is not set up on this server.");
  res.set("Content-Disposition", `attachment; filename="moments-wishes-${event.startsAt.toISOString().slice(0, 10)}.pdf"`);
  res.type("application/pdf").send(file);
});
