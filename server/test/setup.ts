import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll } from "vitest";
import { prisma } from "../src/db.js";

const envFile = path.resolve(import.meta.dirname, "../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.SESSION_SECRET ||= "test-secret-test-secret-test-secret";
process.env.SMS_PROVIDER = "mock";
// Uploaded test images go to a temporary folder, never to S3 or the real uploads folder.
process.env.UPLOAD_DIR = path.join(tmpdir(), "moments-test-uploads");
process.env.S3_BUCKET = "";
if (!process.env.CHROMIUM_PATH && existsSync("/opt/pw-browsers/chromium")) process.env.CHROMIUM_PATH = "/opt/pw-browsers/chromium";
process.env.TELEGRAM_BOT_TOKEN = "123456:test-bot-token";

afterAll(async () => {
  await prisma.$disconnect();
});
