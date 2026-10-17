import { randomInt } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { normalizePhone } from "../src/lib/phone.js";
import { handleTelegramUpdate } from "../src/routes/telegram.js";

export const app = createApp();

/** A random Cambodian mobile number, e.g. "012 345 678" style but unique per test. */
export const randomPhone = () => `0${randomInt(10, 99)}${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;

// Each caller gets its own address so rate limits per IP don't trip across tests.
export const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

/** A unique stand-in Telegram user id. */
export const randomTelegramId = () => 10_000_000_000 + randomInt(0, 2 ** 47 - 1);

/** What Telegram sends the bot when a person shares their own phone number. */
export const contactUpdate = (telegramId: number, phone: string, firstName = "Test", lastName?: string) => ({
  update_id: randomInt(1, 2 ** 31),
  message: {
    chat: { id: telegramId, type: "private" },
    from: { id: telegramId, first_name: firstName },
    contact: { phone_number: phone, user_id: telegramId, first_name: firstName, last_name: lastName },
  },
});

/**
 * Signs in the way a person does: the page starts a login, the person presses Start in the bot
 * and shares their phone number, and the page's poll gets the session cookie.
 */
export async function signIn(name = "Test Host", phone = randomPhone(), telegramId = randomTelegramId()) {
  const agent = request.agent(app);
  const ip = randomIp();
  const start = await agent.post("/api/auth/telegram/start").set("X-Forwarded-For", ip);
  if (start.status !== 200) throw new Error(`login start failed: ${start.status} ${JSON.stringify(start.body)}`);
  await handleTelegramUpdate({ update_id: 1, message: { chat: { id: telegramId, type: "private" }, from: { id: telegramId }, text: `/start login_${start.body.token}` } });
  // Telegram sends numbers without the "+".
  const e164 = normalizePhone(phone)!;
  const [first, ...rest] = name.split(" ");
  await handleTelegramUpdate(contactUpdate(telegramId, e164.slice(1), first, rest.join(" ") || undefined));
  const res = await agent.post("/api/auth/telegram/poll").send({ token: start.body.token });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, phone: e164, telegramId, user: res.body.user as { id: string; name: string }, token: res.body.token as string };
}

export const sampleEvent = {
  titleKm: "ពិធីមង្គលការ",
  titleEn: "Test wedding",
  startsAt: "2026-12-20T00:00:00Z",
  schedule: [{ time: "07:00", titleKm: "ពិធីហែជំនូន" }],
};

/** A signed-in host with one new event (on the free plan, unless another is given). */
export async function hostWithEvent(name = "Test Host", plan: "FREE" | "STANDARD" | "PREMIUM" = "FREE") {
  const host = await signIn(name);
  const res = await host.agent.post("/api/events").send(sampleEvent);
  if (res.status !== 201) throw new Error(`create event failed: ${res.status} ${JSON.stringify(res.body)}`);
  if (plan !== "FREE") await prisma.event.update({ where: { id: res.body.event.id }, data: { plan } });
  return { ...host, event: res.body.event as { id: string; helperCode: string } };
}

/** Joins an event's desk as a helper and returns an agent carrying the desk cookie. */
export async function joinDesk(code: string, name = "Helper") {
  const agent = request.agent(app);
  const res = await agent.post("/api/desk/join").set("X-Forwarded-For", randomIp()).send({ code, name });
  if (res.status !== 201) throw new Error(`desk join failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, memberId: res.body.helper.memberId as string, token: res.body.token as string };
}
