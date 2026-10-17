import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { MemoryTelegramClient, setTelegramClient } from "../src/providers/telegram.js";

process.env.SESSION_SECRET ||= "test-secret-test-secret-test-secret";
process.env.SMS_PROVIDER = "mock";
// Uploaded test images go to a temporary folder, never to S3 or the real uploads folder.
process.env.UPLOAD_DIR = path.join(tmpdir(), "moments-test-uploads");
process.env.S3_BUCKET = "";
if (!process.env.CHROMIUM_PATH && existsSync("/opt/pw-browsers/chromium")) process.env.CHROMIUM_PATH = "/opt/pw-browsers/chromium";
process.env.TELEGRAM_BOT_TOKEN = "123456:test-bot-token";
process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";
process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME = "MomentsTestBot";
// Never call the real Telegram from tests.
setTelegramClient(new MemoryTelegramClient());

afterAll(async () => {
  await prisma.$disconnect();
});
