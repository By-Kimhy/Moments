// Connecting an event to a Telegram chat. The host gets a one-time code; sending it to the bot
// (privately, or as "/link <code>" in a family group the bot was added to) links that chat.
import { randomBytes } from "node:crypto";
import { Router } from "express";
import { currentMember, ownersOnly } from "../access.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { audit } from "../lib/audit.js";
import { safeEqual } from "../lib/codes.js";
import {
  badCodeMessage,
  linkedMessage,
  loginAskContact,
  loginDone,
  loginExpired,
  loginNotYourContact,
  loginShareButton,
  startHelp,
} from "../lib/notification-messages.js";
import { normalizePhone } from "../lib/phone.js";
import { completeLogin, pendingLoginForChat, startLoginInChat } from "../lib/telegram-auth.js";
import { notify } from "../jobs/notifications.js";
import { telegram } from "../providers/telegram.js";
import { store } from "../store.js";

/** Mounted on /api/events/:eventId (after eventAccess). */
export const eventTelegramRouter = Router({ mergeParams: true });
eventTelegramRouter.use("/telegram", ownersOnly);
/** Mounted on /api/telegram: Telegram's webhook. */
export const telegramWebhookRouter = Router();

const LINK_TTL = 30 * 60;
const linkKey = (code: string) => `tglink:${code}`;

function requireBot() {
  if (!telegram()) throw new HttpError(503, "Telegram is not set up on this server.");
}

eventTelegramRouter.get("/telegram", async (req, res) => {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: currentMember(req).eventId } });
  res.json({ enabled: Boolean(telegram()), connected: event.telegramChatId !== null, botUsername: config.telegramBotUsername() });
});

eventTelegramRouter.post("/telegram/link", async (req, res) => {
  requireBot();
  const member = currentMember(req);
  const code = randomBytes(5).toString("hex");
  await store.set(linkKey(code), JSON.stringify({ eventId: member.eventId, memberId: member.id }), LINK_TTL);
  const bot = config.telegramBotUsername();
  res.json({ code, expiresIn: LINK_TTL, botUsername: bot, url: bot ? `https://t.me/${bot}?start=${code}` : null, groupCommand: `/link ${code}` });
});

eventTelegramRouter.post("/telegram/test", async (req, res) => {
  requireBot();
  const event = await prisma.event.findUniqueOrThrow({ where: { id: currentMember(req).eventId } });
  if (!event.telegramChatId) throw new HttpError(409, "Connect a Telegram chat first.");
  await notify({ kind: "test", eventId: event.id });
  res.status(202).json({ queued: true });
});

eventTelegramRouter.delete("/telegram", async (req, res) => {
  const member = currentMember(req);
  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: member.eventId }, data: { telegramChatId: null } });
    await audit(tx, { eventId: member.eventId, entity: "event", entityId: member.eventId, action: "telegram_unlinked", actorId: member.id });
  });
  res.status(204).end();
});

type Update = {
  update_id: number;
  message?: {
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
    text?: string;
    contact?: { phone_number: string; user_id?: number; first_name?: string; last_name?: string };
  };
};

/** Handles one update from Telegram (webhook or polling). */
export async function handleTelegramUpdate(update: Update) {
  const message = update.message;
  const client = telegram();
  if (!message || !client) return;
  const chatId = String(message.chat.id);
  if (message.chat.type === "private" && (message.contact || message.text?.startsWith("/start login_"))) {
    await handleLogin(message, chatId);
    return;
  }
  if (!message.text) return;
  const match = message.text.trim().match(/^\/(?:start|link)(?:@\w+)?(?:\s+([0-9a-f]{10}))?(?:@\w+)?$/i);
  if (!match) return;
  const code = match[1]?.toLowerCase();
  if (!code) {
    if (message.chat.type === "private") await client.sendMessage(chatId, startHelp);
    return;
  }
  const raw = await store.get(linkKey(code));
  if (!raw) {
    await client.sendMessage(chatId, badCodeMessage);
    return;
  }
  await store.del(linkKey(code));
  const { eventId, memberId } = JSON.parse(raw) as { eventId: string; memberId: string };
  const event = await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({ where: { id: eventId }, data: { telegramChatId: BigInt(chatId) }, include: { owner: { select: { language: true } } } });
    await audit(tx, { eventId, entity: "event", entityId: eventId, action: "telegram_linked", actorId: memberId, after: { chatType: message.chat.type } });
    return updated;
  });
  await client.sendMessage(chatId, linkedMessage(event.owner.language, event.titleKm));
}

/** Signing in: "/start login_<token>", then the person shares their phone number. */
async function handleLogin(message: NonNullable<Update["message"]>, chatId: string) {
  const client = telegram()!;
  const askContact = { keyboard: [[{ text: loginShareButton, request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };
  if (message.text) {
    const token = message.text.trim().slice("/start login_".length);
    if (await startLoginInChat(token, chatId)) await client.sendMessage(chatId, loginAskContact, askContact);
    else await client.sendMessage(chatId, loginExpired);
    return;
  }
  const contact = message.contact!;
  // Only the person's own number: a contact card of someone else has another (or no) user_id.
  if (!message.from || contact.user_id !== message.from.id) {
    await client.sendMessage(chatId, loginNotYourContact, askContact);
    return;
  }
  const token = await pendingLoginForChat(chatId);
  const phone = normalizePhone(contact.phone_number.startsWith("+") ? contact.phone_number : `+${contact.phone_number}`);
  const name = [contact.first_name ?? message.from.first_name, contact.last_name ?? message.from.last_name].filter(Boolean).join(" ") || message.from.username || "Telegram user";
  const user = token && phone ? await completeLogin(token, { telegramId: BigInt(message.from.id), phone, name }, chatId) : null;
  await client.sendMessage(chatId, user ? loginDone : loginExpired, { remove_keyboard: true });
}

// Telegram sends the secret we gave it in setWebhook in this header.
telegramWebhookRouter.post("/webhook", async (req, res) => {
  const secret = config.telegramWebhookSecret();
  const given = req.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || !safeEqual(given, secret)) throw new HttpError(404, "Not found.");
  try {
    await handleTelegramUpdate(req.body as Update);
  } catch (e) {
    console.error("telegram update failed", e);
  }
  // Always 200: otherwise Telegram keeps re-sending the same update.
  res.json({ ok: true });
});
