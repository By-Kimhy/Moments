import { describe, expect, it } from "vitest";
import { normalizePhone } from "../src/lib/phone.js";
import { type TelegramAuthData, telegramHash, verifyTelegramLogin } from "../src/lib/telegram-login.js";

describe("normalizePhone", () => {
  it.each([
    ["012 345 678", "+85512345678"],
    ["012-345-678", "+85512345678"],
    ["+855 12 345 678", "+85512345678"],
    ["855 12345678", "+85512345678"],
    ["+855012345678", "+85512345678"],
    ["097 7777 777", "+855977777777"],
    ["12345678", "+85512345678"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("keeps numbers from other countries", () => {
    expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
  });

  it.each(["", "abc", "012", "0123456789012", "+855 0"])("rejects %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("verifyTelegramLogin", () => {
  const bot = "123456:test-bot-token";
  const now = 1_800_000_000_000;
  const signed = (fields: Omit<TelegramAuthData, "hash">): TelegramAuthData => ({ ...fields, hash: telegramHash(fields, bot) });

  it("accepts data signed with the bot token", () => {
    const data = signed({ id: "42", first_name: "Dara", auth_date: String(now / 1000 - 60) });
    expect(verifyTelegramLogin(data, bot, now)).toBe(true);
  });

  it("rejects changed fields, another bot, and old logins", () => {
    const data = signed({ id: "42", first_name: "Dara", auth_date: String(now / 1000 - 60) });
    expect(verifyTelegramLogin({ ...data, id: "43" }, bot, now)).toBe(false);
    expect(verifyTelegramLogin(data, "999:other", now)).toBe(false);
    const old = signed({ id: "42", auth_date: String(now / 1000 - 2 * 24 * 3600) });
    expect(verifyTelegramLogin(old, bot, now)).toBe(false);
  });
});
