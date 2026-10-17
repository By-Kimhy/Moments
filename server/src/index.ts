import { createApp } from "./app.js";
import { config } from "./config.js";
import { startNotificationWorker } from "./jobs/notifications.js";
import { startTelegramPolling } from "./jobs/telegram-poll.js";
import { startBakongChecks } from "./lib/platform-orders.js";

config.sessionSecret(); // fail fast if the secret is missing

startNotificationWorker();
startTelegramPolling();
startBakongChecks();

createApp().listen(config.port, () => {
  console.log(`Moments API listening on http://localhost:${config.port}`);
});
