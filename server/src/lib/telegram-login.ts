// Checks data from the Telegram Login Widget:
// https://core.telegram.org/widgets/login#checking-authorization
import { createHash, createHmac } from "node:crypto";
import { safeEqual } from "./codes.js";

export type TelegramAuthData = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
};

const MAX_AGE_SECONDS = 24 * 60 * 60;

export function telegramHash(fields: Record<string, string>, botToken: string) {
  const dataCheckString = Object.keys(fields)
    .filter((k) => k !== "hash")
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  return createHmac("sha256", secret).update(dataCheckString).digest("hex");
}

/** True when the widget data was signed by our bot and is less than a day old. */
export function verifyTelegramLogin(data: TelegramAuthData, botToken: string, now = Date.now()) {
  const fields = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as Record<string, string>;
  if (!safeEqual(telegramHash(fields, botToken), data.hash)) return false;
  const age = now / 1000 - Number(data.auth_date);
  return Number.isFinite(age) && age >= -60 && age <= MAX_AGE_SECONDS;
}
