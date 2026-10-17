import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePhone } from "./lib/phone.js";

// The repository root, from both src/ (tsx) and dist/ (built). Relative paths in .env resolve from here.
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  // Comma-separated list of browser origins allowed to call the API with cookies.
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  production: process.env.NODE_ENV === "production",
  test: process.env.NODE_ENV === "test",
  appUrl: () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  sessionSecret: () => required("SESSION_SECRET"),
  redisUrl: () => process.env.REDIS_URL || null,
  telegramBotToken: () => process.env.TELEGRAM_BOT_TOKEN || null,
  telegramBotUsername: () => (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "").replace(/^@/, "") || null,
  telegramApiBase: () => process.env.TELEGRAM_API_URL || "https://api.telegram.org",
  // Checked on every webhook call, so only Telegram can post updates.
  telegramWebhookSecret: () => process.env.TELEGRAM_WEBHOOK_SECRET || null,
  // For development without a public URL: the API asks Telegram for updates instead.
  telegramPolling: () => process.env.TELEGRAM_POLLING === "true",
  // Platform fee on ticket sales, in percent (recorded per order for billing).
  platformFeePercent: () => Number(process.env.PLATFORM_FEE_PERCENT ?? 4),
  // The platform's own KHQR image (a PNG or JPEG file), shown to hosts paying for a plan.
  platformKhqrImage: () => (process.env.PLATFORM_KHQR_IMAGE ? path.resolve(repoRoot, process.env.PLATFORM_KHQR_IMAGE) : null),
  // Bakong Open API, to confirm payments to the platform automatically.
  bakongToken: () => process.env.BAKONG_TOKEN || null,
  bakongAccountId: () => process.env.BAKONG_ACCOUNT_ID || null, // the platform's Bakong id, e.g. moments@aba
  bakongMerchantName: () => process.env.BAKONG_MERCHANT_NAME || "Moments",
  bakongApiBase: () => (process.env.BAKONG_API_URL || "https://api-bakong.nbc.gov.kh").replace(/\/$/, ""),
  // Comma-separated phone numbers (any format) of platform admins.
  adminPhones: () =>
    (process.env.ADMIN_PHONES ?? "")
      .split(",")
      .map((p) => normalizePhone(p))
      .filter((p): p is string => Boolean(p)),
  uploadDir: () => path.resolve(repoRoot, process.env.UPLOAD_DIR || "./uploads"),
  s3: () =>
    process.env.S3_BUCKET
      ? {
          bucket: process.env.S3_BUCKET,
          region: process.env.S3_REGION || "auto",
          endpoint: process.env.S3_ENDPOINT || undefined,
          accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
        }
      : null,
};
