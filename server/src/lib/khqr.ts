// KHQR (Cambodia's EMVCo QR standard) strings for a Bakong account, with the amount and the
// order's reference built in, so a payment can later be found by the string's MD5 hash.
import { createHash } from "node:crypto";
import type { Currency } from "./money.js";

const tlv = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE, as EMVCo QR codes use for tag 63. */
export function crc16(input: string) {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Bakong ids look like "name@bank". */
export const isBakongAccountId = (id: string) => /^[A-Za-z0-9._-]{1,32}@[A-Za-z0-9._-]{1,32}$/.test(id);

export type KhqrInput = {
  accountId: string;
  merchantName: string;
  merchantCity?: string;
  amount: number; // minor units
  currency: Currency;
  billNumber: string;
  now?: Date;
};

/** A dynamic KHQR for an individual Bakong account. */
export function buildKhqr({ accountId, merchantName, merchantCity = "Phnom Penh", amount, currency, billNumber, now = new Date() }: KhqrInput) {
  const amountText = currency === "USD" ? (amount / 100).toFixed(2) : String(amount);
  const ascii = (s: string, max: number) => s.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").trim().slice(0, max) || "Moments";
  const body = [
    tlv("00", "01"),
    tlv("01", "12"), // dynamic: used once, with an amount
    tlv("29", tlv("00", accountId)),
    tlv("52", "5999"),
    tlv("53", currency === "USD" ? "840" : "116"),
    tlv("54", amountText),
    tlv("58", "KH"),
    tlv("59", ascii(merchantName, 25)),
    tlv("60", ascii(merchantCity, 15)),
    tlv("62", tlv("01", billNumber)),
    tlv("99", tlv("00", String(now.getTime()))),
  ].join("");
  const withCrcTag = `${body}6304`;
  return withCrcTag + crc16(withCrcTag);
}

export const khqrMd5 = (qr: string) => createHash("md5").update(qr).digest("hex");
