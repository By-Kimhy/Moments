// Browser tests of the main journeys, on a phone-sized screen. They need the seeded database
// (`npm run db:seed`) and the built app running without a Telegram bot, so the login page
// offers its test form: `npm run build && TELEGRAM_BOT_TOKEN= ALLOW_TEST_LOGIN=true npm start`, then `npm run e2e`.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    ...devices["Pixel 7"],
    locale: "km-KH",
    trace: "retain-on-failure",
  },
});
