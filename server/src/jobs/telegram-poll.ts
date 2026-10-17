// Development without a public URL for the webhook: ask Telegram for updates (long polling).
// Turn on with TELEGRAM_POLLING=true. Don't use with a webhook set: Telegram allows only one.
import { config } from "../config.js";
import { HttpTelegramClient } from "../providers/telegram.js";
import { handleTelegramUpdate } from "../routes/telegram.js";

export function startTelegramPolling() {
  const token = config.telegramBotToken();
  if (!token || !config.telegramPolling()) return;
  const client = new HttpTelegramClient(token, config.telegramApiBase());
  let offset = 0;
  const loop = async () => {
    for (;;) {
      try {
        const updates = await client.call<{ update_id: number }[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] });
        for (const update of updates) {
          offset = update.update_id + 1;
          await handleTelegramUpdate(update as Parameters<typeof handleTelegramUpdate>[0]);
        }
      } catch (e) {
        console.error("telegram polling:", (e as Error).message);
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  };
  void loop();
  console.log("Polling Telegram for updates");
}
