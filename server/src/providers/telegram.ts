// Sends messages with the Telegram Bot API. Without TELEGRAM_BOT_TOKEN nothing is sent.
import { config } from "../config.js";

export interface TelegramClient {
  sendMessage(chatId: string, text: string): Promise<void>;
}

export class TelegramError extends Error {
  constructor(
    message: string,
    /** The chat can no longer be reached (bot removed or blocked): stop trying. */
    public permanent: boolean,
  ) {
    super(message);
  }
}

export class HttpTelegramClient implements TelegramClient {
  constructor(
    private token: string,
    private apiBase: string,
  ) {}

  async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.apiBase}/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
    if (!data.ok) {
      const code = data.error_code ?? res.status;
      throw new TelegramError(`Telegram ${method} failed: ${code} ${data.description ?? ""}`, code === 400 || code === 403);
    }
    return data.result as T;
  }

  async sendMessage(chatId: string, text: string) {
    await this.call("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
  }
}

/** Keeps messages in memory; tests read them. */
export class MemoryTelegramClient implements TelegramClient {
  readonly sent: { chatId: string; text: string }[] = [];

  async sendMessage(chatId: string, text: string) {
    this.sent.push({ chatId, text });
  }
}

let client: TelegramClient | null | undefined;

export function telegram(): TelegramClient | null {
  if (client === undefined) {
    const token = config.telegramBotToken();
    client = token ? new HttpTelegramClient(token, config.telegramApiBase()) : null;
  }
  return client;
}

/** Tests swap in a MemoryTelegramClient (or null to turn sending off). */
export function setTelegramClient(next: TelegramClient | null) {
  client = next;
}
