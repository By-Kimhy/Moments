import { Router } from "express";
import { z } from "zod";
import { clearDeskCookie, clearSessionCookie, currentUser, requireUser, setSessionCookie, signUserSession, toCurrentUser } from "../auth.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { deleteAccount } from "../lib/accounts.js";
import { normalizePhone } from "../lib/phone.js";
import { LOGIN_TTL, completeLogin, consumeLogin, loginStatus, newLoginToken } from "../lib/telegram-auth.js";
import { telegram } from "../providers/telegram.js";
import { rateLimit } from "../store.js";

export const authRouter = Router();

const pollSchema = z.object({ token: z.string().max(64) });
// Development without a bot: the login page confirms with a phone number and name instead.
const devConfirmSchema = z.object({
  token: z.string().max(64),
  phone: z.string({ message: "Enter your phone number." }).transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (!phone) ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
    return phone ?? "";
  }),
  name: z.string().trim().max(120).optional(),
});

const updateMeSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120).optional(),
  language: z.enum(["KM", "EN"]).optional(),
});

// Only when switched on by name, never in production, and only without a bot: it signs anyone in
// as any phone number.
const devLogin = () => !telegram() && !config.production && (config.test || process.env.ALLOW_TEST_LOGIN === "true");

// Step 1: a one-time login token and the bot link to open with it.
authRouter.post("/telegram/start", async (req, res) => {
  await rateLimit(`tglogin-ip:${req.ip}`, 30, 60 * 60, "Too many tries. Wait a few minutes and try again.");
  if (!telegram() && !devLogin()) throw new HttpError(503, "Telegram is not set up on this server.");
  const token = await newLoginToken();
  const bot = config.telegramBotUsername();
  res.json({ token, expiresIn: LOGIN_TTL, url: bot ? `https://t.me/${bot}?start=login_${token}` : null, dev: devLogin() });
});

// Step 2: the page asks until the bot has confirmed the person's phone number.
authRouter.post("/telegram/poll", async (req, res) => {
  const { token } = parse(pollSchema, req.body);
  const record = await loginStatus(token);
  if (!record) throw new HttpError(410, "This sign-in has expired. Start again.");
  if (record.status === "pending") {
    res.status(202).json({ status: "pending" });
    return;
  }
  await consumeLogin(token);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: record.userId } });
  const session = await signUserSession(user.id);
  setSessionCookie(res, session);
  res.json({ status: "done", user: toCurrentUser(user), token: session });
});

authRouter.post("/telegram/dev-confirm", async (req, res) => {
  if (!devLogin()) throw new HttpError(404, "Not found.");
  const { token, phone, name } = parse(devConfirmSchema, req.body);
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (!existing && !name) throw new HttpError(400, "Enter your name to create your account.", { name: ["Enter your name."] });
  // A stand-in Telegram id from the phone number, so the same number is the same account.
  const user = await completeLogin(token, { telegramId: existing?.telegramId ?? BigInt(phone.replace(/\D/g, "")), phone, name: name || existing?.name || phone });
  if (!user) throw new HttpError(410, "This sign-in has expired. Start again.");
  res.status(204).end();
});

// Deleting the account: the person types DELETE to confirm.
authRouter.post("/me/delete", requireUser, async (req, res) => {
  parse(z.object({ confirm: z.literal("DELETE", { message: "Type DELETE to confirm." }) }), req.body);
  const result = await deleteAccount(currentUser(req).id);
  clearSessionCookie(res);
  res.json(result);
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  clearDeskCookie(res);
  res.status(204).end();
});

authRouter.get("/me", requireUser, (req, res) => {
  res.json({ user: currentUser(req) });
});

authRouter.patch("/me", requireUser, async (req, res) => {
  const data = parse(updateMeSchema, req.body);
  const user = await prisma.user.update({ where: { id: currentUser(req).id }, data });
  res.json({ user: toCurrentUser(user) });
});
