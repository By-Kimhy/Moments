import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { MemoryTelegramClient, telegram } from "../src/providers/telegram.js";
import { handleTelegramUpdate } from "../src/routes/telegram.js";
import { app, contactUpdate, randomIp, randomPhone, randomTelegramId, signIn } from "./helpers.js";

const bot = () => telegram() as MemoryTelegramClient;
const start = async () => (await request(app).post("/api/auth/telegram/start").set("X-Forwarded-For", randomIp()).expect(200)).body as { token: string; url: string };
const press = (telegramId: number, token: string) =>
  handleTelegramUpdate({ update_id: 1, message: { chat: { id: telegramId, type: "private" }, from: { id: telegramId }, text: `/start login_${token}` } });

describe("Telegram login", () => {
  it("signs up through the bot, reads the session, logs out and signs back in", async () => {
    const { agent, phone, user, telegramId } = await signIn("សុខ ដារ៉ា");
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.user).toMatchObject({ id: user.id, phone, name: "សុខ ដារ៉ា", telegramId: String(telegramId), language: "KM" });

    await agent.post("/api/auth/logout").expect(204);
    await agent.get("/api/auth/me").expect(401);

    const again = await signIn("Other Name", phone, telegramId);
    expect(again.user).toMatchObject({ id: user.id, name: "សុខ ដារ៉ា" });
  });

  it("opens the bot, asks for the phone number, and waits until it is shared", async () => {
    const { token, url } = await start();
    expect(url).toBe(`https://t.me/MomentsTestBot?start=login_${token}`);
    await request(app).post("/api/auth/telegram/poll").send({ token }).expect(202);

    const id = randomTelegramId();
    await press(id, token);
    const ask = bot().sent.at(-1)!;
    expect(ask.chatId).toBe(String(id));
    expect(ask.replyMarkup).toMatchObject({ keyboard: [[{ request_contact: true }]] });

    await handleTelegramUpdate(contactUpdate(id, `855${randomPhone().slice(1)}`, "Bora"));
    expect(bot().sent.at(-1)!.replyMarkup).toEqual({ remove_keyboard: true });
    const done = await request(app).post("/api/auth/telegram/poll").send({ token }).expect(200);
    expect(done.body.user.name).toBe("Bora");
    expect(done.headers["set-cookie"]?.[0]).toMatch(/^session=/);
    // A login is used once.
    await request(app).post("/api/auth/telegram/poll").send({ token }).expect(410);
  });

  it("finds a co-host who was added by phone number before they signed in", async () => {
    const phone = randomPhone();
    const host = await signIn("Host");
    const event = (await host.agent.post("/api/events").send({ titleKm: "មង្គលការ", startsAt: "2026-12-20T00:00:00Z" }).expect(201)).body.event;
    await host.agent.post(`/api/events/${event.id}/cohosts`).send({ phone, name: "Sophea" }).expect(201);
    const cohost = await signIn("Sophea Telegram", phone);
    await cohost.agent.get(`/api/events/${event.id}`).expect(200);
    expect(cohost.user.name).toBe("Sophea");
  });

  it("accepts only the person's own number", async () => {
    const { token } = await start();
    const id = randomTelegramId();
    await press(id, token);
    const someoneElse = contactUpdate(id, "85512000111");
    someoneElse.message.contact.user_id = id + 1;
    await handleTelegramUpdate(someoneElse);
    await request(app).post("/api/auth/telegram/poll").send({ token }).expect(202);
    expect(await prisma.user.findUnique({ where: { phone: "+85512000111" } })).toBeNull();
  });

  it("answers an unknown or expired login in the bot and the page", async () => {
    const id = randomTelegramId();
    await press(id, "x".repeat(24));
    expect(bot().sent.at(-1)!.text).toContain("expired");
    await request(app).post("/api/auth/telegram/poll").send({ token: "nonsense" }).expect(410);
  });

  it("accepts a bearer token instead of the cookie", async () => {
    const { token } = await signIn();
    await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`).expect(200);
    await request(app).get("/api/auth/me").set("Authorization", "Bearer nonsense").expect(401);
  });

  it("updates the name and language", async () => {
    const { agent } = await signIn();
    const res = await agent.patch("/api/auth/me").send({ name: "New Name", language: "EN" }).expect(200);
    expect(res.body.user).toMatchObject({ name: "New Name", language: "EN" });
  });

  it("has no phone-code sign-in", async () => {
    await request(app).post("/api/auth/otp/request").send({ phone: "012345678" }).expect(404);
    // With a bot set up, the development shortcut is off.
    await request(app).post("/api/auth/telegram/dev-confirm").send({ token: "x", phone: "012345678" }).expect(404);
  });
});

describe("error messages", () => {
  it("come in Khmer when the request prefers Khmer", async () => {
    const res = await request(app).post("/api/auth/telegram/poll").set("Accept-Language", "km").send({ token: "nonsense" });
    expect(res.body.error).toBe("ការចូលនេះផុតកំណត់ហើយ។ សូមចាប់ផ្តើមម្តងទៀត។");
    const en = await request(app).post("/api/auth/telegram/poll").send({ token: "nonsense" });
    expect(en.body.error).toBe("This sign-in has expired. Start again.");
  });
});
