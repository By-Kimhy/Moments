import { Router } from "express";
import { z } from "zod";
import {
  clearDeskCookie,
  clearSessionCookie,
  currentUser,
  requireUser,
  setSessionCookie,
  signUserSession,
  toCurrentUser,
} from "../auth.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError, parse } from "../errors.js";
import { randomDigits, safeEqual, sha256 } from "../lib/codes.js";
import { normalizePhone } from "../lib/phone.js";
import { verifyTelegramLogin } from "../lib/telegram-login.js";
import { sms } from "../providers/sms.js";
import { rateLimit, store } from "../store.js";

export const authRouter = Router();

const OTP_TTL = 5 * 60; // seconds
const OTP_MAX_ATTEMPTS = 5;

const phoneField = z
  .string({ message: "Enter your phone number." })
  .transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (!phone) ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
    return phone ?? "";
  });

const requestOtpSchema = z.object({ phone: phoneField });

const verifyOtpSchema = z.object({
  phone: phoneField,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
  // Only needed the first time a phone number signs in.
  name: z.string().trim().max(120).optional(),
});

const telegramSchema = z.object({
  id: z.coerce.string().regex(/^\d+$/),
  first_name: z.string().max(200).optional(),
  last_name: z.string().max(200).optional(),
  username: z.string().max(200).optional(),
  photo_url: z.string().max(500).optional(),
  auth_date: z.coerce.string().regex(/^\d+$/),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});

const updateMeSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120).optional(),
  language: z.enum(["KM", "EN"]).optional(),
});

type OtpRecord = { hash: string; attempts: number };
const otpKey = (phone: string) => `otp:${phone}`;

// Sends a 6-digit code by SMS. With the mock provider outside production the response also
// carries the code, so the login screen can be tested without a phone.
authRouter.post("/otp/request", async (req, res) => {
  const { phone } = parse(requestOtpSchema, req.body);
  await rateLimit(`otp-phone:${phone}`, 3, 10 * 60, "Too many codes requested. Try again in a few minutes.");
  await rateLimit(`otp-ip:${req.ip}`, 20, 60 * 60, "Too many codes requested. Try again later.");

  const code = randomDigits(6);
  const record: OtpRecord = { hash: sha256(`${phone}:${code}`), attempts: 0 };
  await store.set(otpKey(phone), JSON.stringify(record), OTP_TTL);
  await sms.send(phone, `Moments: your login code is ${code}. It expires in 5 minutes.`);

  const showCode = config.smsProvider() === "mock" && !config.production;
  res.json({ phone, expiresIn: OTP_TTL, ...(showCode ? { devCode: code } : {}) });
});

authRouter.post("/otp/verify", async (req, res) => {
  const { phone, code, name } = parse(verifyOtpSchema, req.body);
  const raw = await store.get(otpKey(phone));
  if (!raw) throw new HttpError(400, "The code has expired. Ask for a new one.", { code: ["The code has expired. Ask for a new one."] });

  const record = JSON.parse(raw) as OtpRecord;
  if (!safeEqual(record.hash, sha256(`${phone}:${code}`))) {
    record.attempts += 1;
    if (record.attempts >= OTP_MAX_ATTEMPTS) await store.del(otpKey(phone));
    else await store.set(otpKey(phone), JSON.stringify(record), OTP_TTL);
    throw new HttpError(400, "That code is not correct.", { code: ["That code is not correct."] });
  }

  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    // Keep the code valid so the person can retry with their name.
    if (!name) throw new HttpError(400, "Enter your name to create your account.", { name: ["Enter your name."] });
    user = await prisma.user.create({ data: { phone, name } });
  }
  await store.del(otpKey(phone));

  const token = await signUserSession(user.id);
  setSessionCookie(res, token);
  res.json({ user: toCurrentUser(user), token });
});

authRouter.post("/telegram", async (req, res) => {
  const botToken = config.telegramBotToken();
  if (!botToken) throw new HttpError(503, "Telegram login is not set up.");
  const data = parse(telegramSchema, req.body);
  if (!verifyTelegramLogin(data, botToken)) throw new HttpError(401, "Telegram login could not be verified.");

  const telegramId = BigInt(data.id);
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.username || "Telegram user";
  const user =
    (await prisma.user.findUnique({ where: { telegramId } })) ??
    (await prisma.user.create({ data: { telegramId, name: name.slice(0, 120) } }));

  const token = await signUserSession(user.id);
  setSessionCookie(res, token);
  res.json({ user: toCurrentUser(user), token });
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
