import request from "supertest";
import { describe, expect, it } from "vitest";
import { telegramHash } from "../src/lib/telegram-login.js";
import { app, randomIp, randomPhone, signIn } from "./helpers.js";

describe("phone login", () => {
  it("signs up with a code, reads the session, logs out and signs back in", async () => {
    const { agent, phone, user } = await signIn("សុខ ដារ៉ា");
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.user).toMatchObject({ id: user.id, phone, name: "សុខ ដារ៉ា", language: "KM" });

    await agent.post("/api/auth/logout").expect(204);
    await agent.get("/api/auth/me").expect(401);

    // Same number again: same account, no name needed.
    const again = await signIn(undefined, phone);
    expect(again.user.id).toBe(user.id);
  });

  it("accepts a bearer token instead of the cookie", async () => {
    const { token } = await signIn();
    await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`).expect(200);
    await request(app).get("/api/auth/me").set("Authorization", "Bearer nonsense").expect(401);
  });

  it("asks a new number for a name, keeping the code valid", async () => {
    const phone = randomPhone();
    const ip = randomIp();
    const otp = await request(app).post("/api/auth/otp/request").set("X-Forwarded-For", ip).send({ phone }).expect(200);
    const noName = await request(app).post("/api/auth/otp/verify").set("X-Forwarded-For", ip).send({ phone, code: otp.body.devCode });
    expect(noName.status).toBe(400);
    expect(noName.body.fieldErrors.name).toBeDefined();
    await request(app).post("/api/auth/otp/verify").send({ phone, code: otp.body.devCode, name: "Bora" }).expect(200);
  });

  it("rejects wrong codes, and burns the code after 5 wrong tries", async () => {
    const phone = randomPhone();
    const otp = await request(app).post("/api/auth/otp/request").set("X-Forwarded-For", randomIp()).send({ phone }).expect(200);
    const wrong = otp.body.devCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/api/auth/otp/verify").send({ phone, code: wrong, name: "X" });
      expect(res.status).toBe(400);
    }
    const right = await request(app).post("/api/auth/otp/verify").send({ phone, code: otp.body.devCode, name: "X" });
    expect(right.status).toBe(400);
    expect(right.body.error).toMatch(/expired/);
  });

  it("validates the phone number and limits how often codes are sent", async () => {
    const bad = await request(app).post("/api/auth/otp/request").set("X-Forwarded-For", randomIp()).send({ phone: "12" });
    expect(bad.status).toBe(400);
    expect(bad.body.fieldErrors.phone).toBeDefined();

    const phone = randomPhone();
    for (let i = 0; i < 3; i++) {
      await request(app).post("/api/auth/otp/request").set("X-Forwarded-For", randomIp()).send({ phone }).expect(200);
    }
    await request(app).post("/api/auth/otp/request").set("X-Forwarded-For", randomIp()).send({ phone }).expect(429);
  });

  it("updates the name and language", async () => {
    const { agent } = await signIn();
    const res = await agent.patch("/api/auth/me").send({ name: "New Name", language: "EN" }).expect(200);
    expect(res.body.user).toMatchObject({ name: "New Name", language: "EN" });
  });
});

describe("Telegram login", () => {
  const login = (fields: Record<string, string>) =>
    request(app)
      .post("/api/auth/telegram")
      .send({ ...fields, hash: telegramHash(fields, process.env.TELEGRAM_BOT_TOKEN!) });

  it("creates the account once and signs the same person in again", async () => {
    const id = String(Date.now());
    const fields = { id, first_name: "Dara", last_name: "Sok", auth_date: String(Math.floor(Date.now() / 1000)) };
    const first = await login(fields).expect(200);
    expect(first.body.user).toMatchObject({ name: "Dara Sok", telegramId: id, phone: null });
    const second = await login(fields).expect(200);
    expect(second.body.user.id).toBe(first.body.user.id);
  });

  it("rejects data not signed by our bot", async () => {
    const fields = { id: "1", first_name: "Eve", auth_date: String(Math.floor(Date.now() / 1000)) };
    await request(app).post("/api/auth/telegram").send({ ...fields, hash: "0".repeat(64) }).expect(401);
  });
});

describe("error messages", () => {
  it("come in Khmer when the request prefers Khmer", async () => {
    const res = await request(app).post("/api/auth/otp/request").set("Accept-Language", "km").set("X-Forwarded-For", randomIp()).send({ phone: "1" });
    expect(res.body.fieldErrors.phone).toEqual(["លេខទូរស័ព្ទមិនត្រឹមត្រូវ។"]);
    const en = await request(app).post("/api/auth/otp/request").set("X-Forwarded-For", randomIp()).send({ phone: "1" });
    expect(en.body.fieldErrors.phone).toEqual(["Enter a valid phone number."]);
  });
});
