import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** Unguessable token for invitation links and QR codes (22 URL-safe characters). */
export const newInviteToken = () => randomBytes(16).toString("base64url");

/** N random digits, e.g. "048213". */
export const randomDigits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join("");

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
