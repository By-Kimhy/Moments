// Uploaded images are re-encoded before storing: it strips metadata (phone photos carry GPS
// location), rejects anything that isn't really an image, and keeps invitation pages fast.
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { HttpError } from "../errors.js";

export type ProcessedImage = { body: Buffer; contentType: string; ext: string };

const NOT_AN_IMAGE = "Upload a JPEG, PNG or WebP image.";

async function decode(input: Buffer) {
  try {
    const image = sharp(input, { failOn: "error" }).rotate(); // apply EXIF orientation, then drop EXIF
    const meta = await image.metadata();
    if (!meta.format || !["jpeg", "png", "webp", "heif"].includes(meta.format)) throw new Error("format");
    return image;
  } catch {
    throw new HttpError(400, NOT_AN_IMAGE);
  }
}

/** Couple photos: at most 1600 px wide or tall, WebP. */
export async function processPhoto(input: Buffer): Promise<ProcessedImage> {
  const image = await decode(input);
  const body = await image.resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  return { body, contentType: "image/webp", ext: "webp" };
}

/** KHQR codes: lossless PNG so the QR stays scannable. */
export async function processQr(input: Buffer): Promise<ProcessedImage> {
  const image = await decode(input);
  const body = await image.resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return { body, contentType: "image/png", ext: "png" };
}

/** A storage key nobody can guess: <eventId>-<kind>-<random>.<ext> */
export const imageKey = (eventId: string, kind: "photo" | "khqr", ext: string) =>
  `${eventId}-${kind}-${randomBytes(9).toString("base64url")}.${ext}`;
