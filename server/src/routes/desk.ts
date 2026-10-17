// Helpers join an event's desk with its 6-digit helper code and their name. No account needed.
import { Router } from "express";
import { z } from "zod";
import { clearDeskCookie, setDeskCookie, signHelperSession } from "../auth.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { audit } from "../lib/audit.js";
import { deskView } from "../lib/events.js";
import { rateLimit } from "../store.js";

export const deskRouter = Router();

const joinSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit helper code."),
  name: z.string().trim().min(1, "Enter your name.").max(120),
});

deskRouter.post("/join", async (req, res) => {
  // A million possible codes; this keeps guessing out of reach.
  await rateLimit(`desk-join:${req.ip}`, 10, 10 * 60, "Too many tries. Wait a few minutes and try again.");
  const { code, name } = parse(joinSchema, req.body);
  const event = await prisma.event.findUnique({ where: { helperCode: code } });
  if (!event || event.status === "ARCHIVED") {
    throw new HttpError(400, "That helper code is not correct.", { code: ["That helper code is not correct."] });
  }
  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.eventMember.create({ data: { eventId: event.id, role: "HELPER", displayName: name } });
    await audit(tx, { eventId: event.id, entity: "member", entityId: created.id, action: "join_desk", actorId: created.id, after: { name } });
    return created;
  });
  const token = await signHelperSession(member.id, event.id);
  setDeskCookie(res, token);
  res.status(201).json({ helper: { memberId: member.id, displayName: name }, event: deskView(event), token });
});

deskRouter.get("/me", async (req, res) => {
  if (!req.helper) throw new HttpError(401, "Join with the helper code first.");
  const event = await prisma.event.findUniqueOrThrow({ where: { id: req.helper.eventId } });
  res.json({ helper: { memberId: req.helper.memberId, displayName: req.helper.displayName }, event: deskView(event) });
});

deskRouter.post("/leave", (_req, res) => {
  clearDeskCookie(res);
  res.status(204).end();
});
