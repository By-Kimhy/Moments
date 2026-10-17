// Signing in with Telegram, through the bot:
// 1. The login page asks for a login token and opens t.me/<bot>?start=login_<token>.
// 2. In Telegram the person presses Start, then "Share my phone number". Telegram vouches for
//    the number, so no SMS code is needed, and co-hosts, staff and clients added by phone
//    number find their events.
// 3. The page polls with the token and gets a session once the bot has confirmed.
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { store } from "../store.js";

export const LOGIN_TTL = 10 * 60; // seconds
const loginKey = (token: string) => `tglogin:${token}`;
const chatKey = (chatId: string) => `tglogin-chat:${chatId}`;

type LoginRecord = { status: "pending" } | { status: "done"; userId: string };

export async function newLoginToken() {
  const token = randomBytes(18).toString("base64url");
  await store.set(loginKey(token), JSON.stringify({ status: "pending" } satisfies LoginRecord), LOGIN_TTL);
  return token;
}

export async function loginStatus(token: string): Promise<LoginRecord | null> {
  if (!/^[\w-]{24}$/.test(token)) return null;
  const raw = await store.get(loginKey(token));
  return raw ? (JSON.parse(raw) as LoginRecord) : null;
}

/** A finished login is used once. */
export const consumeLogin = (token: string) => store.del(loginKey(token));

/** The person pressed Start with this token in a private chat: wait for their contact there. */
export async function startLoginInChat(token: string, chatId: string) {
  const record = await loginStatus(token);
  if (record?.status !== "pending") return false;
  await store.set(chatKey(chatId), token, LOGIN_TTL);
  return true;
}

export async function pendingLoginForChat(chatId: string) {
  return store.get(chatKey(chatId));
}

/**
 * Finds or creates the account for a Telegram user with a confirmed phone number, and marks the
 * login done. An account is found by Telegram id first, then by phone number (someone added as
 * a co-host before they ever signed in).
 */
export async function completeLogin(token: string, who: { telegramId: bigint; phone: string; name: string }, chatId?: string) {
  const record = await loginStatus(token);
  if (record?.status !== "pending") return null;
  const user = await prisma.$transaction(async (tx) => {
    const byTelegram = await tx.user.findUnique({ where: { telegramId: who.telegramId } });
    const byPhone = await tx.user.findUnique({ where: { phone: who.phone } });
    if (byTelegram) {
      // Fill in a missing number, unless another account already has it.
      if (!byTelegram.phone && !byPhone) return tx.user.update({ where: { id: byTelegram.id }, data: { phone: who.phone } });
      return byTelegram;
    }
    if (byPhone) return tx.user.update({ where: { id: byPhone.id }, data: { telegramId: who.telegramId } });
    return tx.user.create({ data: { telegramId: who.telegramId, phone: who.phone, name: who.name.slice(0, 120) } });
  });
  await store.set(loginKey(token), JSON.stringify({ status: "done", userId: user.id } satisfies LoginRecord), LOGIN_TTL);
  if (chatId) await store.del(chatKey(chatId));
  return user;
}
