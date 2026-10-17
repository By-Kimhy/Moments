import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { drainNotifications, handle } from "../src/jobs/notifications.js";
import { HttpTelegramClient, MemoryTelegramClient, TelegramError, setTelegramClient } from "../src/providers/telegram.js";
import { app, hostWithEvent, joinDesk } from "./helpers.js";

let bot: MemoryTelegramClient;
beforeEach(() => {
  bot = new MemoryTelegramClient();
  setTelegramClient(bot);
});
afterEach(() => setTelegramClient(new MemoryTelegramClient()));

const webhook = (text: string, chatId: number, type = "private") =>
  request(app)
    .post("/api/telegram/webhook")
    .set("X-Telegram-Bot-Api-Secret-Token", "test-webhook-secret")
    .send({ update_id: 1, message: { chat: { id: chatId, type }, text } });

/** A published event linked to a Telegram chat, with one guest. */
async function linkedEvent(chatId = -1000 - Math.floor(Math.random() * 1e6)) {
  const host = await hostWithEvent();
  const base = `/api/events/${host.event.id}`;
  await host.agent.patch(base).send({ status: "PUBLISHED" }).expect(200);
  const link = await host.agent.post(`${base}/telegram/link`).expect(200);
  await webhook(`/link@MomentsTestBot ${link.body.code}`, chatId, "group").expect(200);
  const { body } = await host.agent.post(`${base}/guests`).send({ name: "សុខ ដារ៉ា", invitedCount: 3 }).expect(201);
  bot.sent.length = 0;
  return { ...host, base, chatId: String(chatId), guest: body.guest as { id: string; inviteToken: string } };
}

describe("linking a chat", () => {
  it("links the chat that sends the one-time code, once", async () => {
    const host = await hostWithEvent();
    const base = `/api/events/${host.event.id}`;
    expect((await host.agent.get(`${base}/telegram`)).body).toMatchObject({ enabled: true, connected: false, botUsername: "MomentsTestBot" });
    const link = await host.agent.post(`${base}/telegram/link`).expect(200);
    expect(link.body.url).toBe(`https://t.me/MomentsTestBot?start=${link.body.code}`);

    await webhook(`/start ${link.body.code}@MomentsTestBot`, 4242).expect(200);
    expect(bot.sent.at(-1)).toMatchObject({ chatId: "4242", text: expect.stringContaining("បានភ្ជាប់") });
    expect((await host.agent.get(`${base}/telegram`)).body.connected).toBe(true);
    expect(await prisma.auditLog.count({ where: { eventId: host.event.id, action: "telegram_linked" } })).toBe(1);

    // The code works once.
    await webhook(`/start ${link.body.code}`, 999).expect(200);
    expect(bot.sent.at(-1)?.text).toContain("មិនត្រឹមត្រូវ");
    expect((await prisma.event.findUniqueOrThrow({ where: { id: host.event.id } })).telegramChatId).toBe(4242n);

    await host.agent.delete(`${base}/telegram`).expect(204);
    expect((await host.agent.get(`${base}/telegram`)).body.connected).toBe(false);
  });

  it("answers a bare /start with help, and refuses webhooks without the secret", async () => {
    await webhook("/start", 77).expect(200);
    expect(bot.sent.at(-1)?.text).toContain("Moments");
    await request(app).post("/api/telegram/webhook").send({ update_id: 1 }).expect(404);
    await request(app).post("/api/telegram/webhook").set("X-Telegram-Bot-Api-Secret-Token", "wrong").send({ update_id: 1 }).expect(404);
  });

  it("is for owners only", async () => {
    const host = await hostWithEvent();
    const helper = await joinDesk(host.event.helperCode);
    await helper.agent.post(`/api/events/${host.event.id}/telegram/link`).expect(403);
  });
});

describe("alerts", () => {
  it("tells the hosts about each RSVP", async () => {
    const { guest, chatId } = await linkedEvent();
    await request(app).post(`/api/invitations/${guest.inviteToken}/rsvp`).send({ status: "ATTENDING", count: 2, message: "អបអរសាទរ" }).expect(200);
    await drainNotifications();
    expect(bot.sent).toEqual([{ chatId, text: expect.stringContaining("✅ សុខ ដារ៉ា នឹងមក (២ នាក់)") }]);
    expect(bot.sent[0].text).toContain('💬 "អបអរសាទរ"');
  });

  it("asks the hosts to confirm a KHQR gift a guest reported", async () => {
    const { guest, chatId, agent, base, event } = await linkedEvent();
    const qr = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#000" } }).png().toBuffer();
    await agent.put(`${base}/khqr`).attach("image", qr, "qr.png").expect(200);
    bot.sent.length = 0;
    await request(app).post(`/api/invitations/${guest.inviteToken}/gift`).send({ amount: 5000, currency: "USD" }).expect(201);
    await drainNotifications();
    expect(bot.sent[0].chatId).toBe(chatId);
    expect(bot.sent[0].text).toContain("$៥០.០០");
    expect(bot.sent[0].text).toContain(`/events/${event.id}/gifts`);
  });

  it("sums up desk gifts per window instead of one message per envelope", async () => {
    const { agent, base, guest, event, chatId } = await linkedEvent();
    for (const [amount, currency] of [[5000, "USD"], [3000, "USD"], [100000, "KHR"]] as const) {
      await agent.post(`${base}/gifts`).send({ guestId: guest.id, amount, currency, clientId: randomUUID() }).expect(201);
    }
    await drainNotifications();
    expect(bot.sent).toEqual([]); // nothing per gift

    await handle({ kind: "desk_digest", eventId: event.id, windowEnd: Date.now() + 60_000 });
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0]).toMatchObject({ chatId, text: expect.stringContaining("ចំណងដៃថ្មី ៣") });
    expect(bot.sent[0].text).toContain("$៨០.០០ + ១០០,០០០៛");

    // An empty window sends nothing.
    await handle({ kind: "desk_digest", eventId: event.id, windowEnd: Date.now() - 3_600_000 });
    expect(bot.sent).toHaveLength(1);
  });

  it("sends nothing for events without a linked chat", async () => {
    const host = await hostWithEvent();
    await host.agent.patch(`/api/events/${host.event.id}`).send({ status: "PUBLISHED" }).expect(200);
    const { body } = await host.agent.post(`/api/events/${host.event.id}/guests`).send({ name: "x" }).expect(201);
    await request(app).post(`/api/invitations/${body.guest.inviteToken}/rsvp`).send({ status: "DECLINED" }).expect(200);
    await drainNotifications();
    expect(bot.sent).toEqual([]);
  });

  it("unlinks a chat the bot can no longer write to", async () => {
    const { event } = await linkedEvent();
    setTelegramClient({
      sendMessage: async () => {
        throw new TelegramError("Forbidden: bot was kicked", true);
      },
    });
    await handle({ kind: "test", eventId: event.id });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).telegramChatId).toBeNull();
  });
});

describe("HttpTelegramClient", () => {
  it("posts to the Bot API and reports blocked chats as permanent errors", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const server = createServer((req, res) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => {
        const body = JSON.parse(data);
        calls.push({ url: req.url!, body });
        res.setHeader("Content-Type", "application/json");
        res.end(body.chat_id === "blocked" ? JSON.stringify({ ok: false, error_code: 403, description: "Forbidden" }) : JSON.stringify({ ok: true, result: {} }));
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const client = new HttpTelegramClient("TOKEN", `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    try {
      await client.sendMessage("42", "សួស្តី");
      expect(calls[0]).toEqual({ url: "/botTOKEN/sendMessage", body: { chat_id: "42", text: "សួស្តី", disable_web_page_preview: true } });
      await expect(client.sendMessage("blocked", "x")).rejects.toMatchObject({ permanent: true });
    } finally {
      server.close();
    }
  });
});
