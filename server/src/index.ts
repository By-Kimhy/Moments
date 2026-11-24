import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { startNotificationWorker } from "./jobs/notifications.js";
import { startReminders } from "./jobs/reminders.js";
import { startTelegramPolling } from "./jobs/telegram-poll.js";
import { startBakongChecks } from "./lib/platform-orders.js";
import { flushMonitoring, initMonitoring } from "./monitoring.js";

// With SENTRY_DSN, Sentry also reports uncaught exceptions and unhandled rejections.
initMonitoring();
config.sessionSecret(); // fail fast if the secret is missing

const worker = startNotificationWorker();
startTelegramPolling();
startBakongChecks();
startReminders();

const server = createApp().listen(config.port, () => {
  console.log(`Moments API listening on http://localhost:${config.port}`);
});

// On deploys the host sends SIGTERM: finish the requests in flight, then close cleanly.
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received, shutting down`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  await new Promise((resolve) => server.close(resolve));
  await worker?.close();
  await prisma.$disconnect();
  await flushMonitoring();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
