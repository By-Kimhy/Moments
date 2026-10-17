// Sends login codes by SMS. Only the mock exists for now; a real gateway plugs in here.
import { config } from "../config.js";

export interface SmsProvider {
  send(phone: string, text: string): Promise<void>;
}

/** Prints messages to the log instead of sending them, and remembers the last one per number. */
export class MockSmsProvider implements SmsProvider {
  readonly sent = new Map<string, string>();

  async send(phone: string, text: string) {
    this.sent.set(phone, text);
    if (!config.test) console.log(`[sms:mock] to ${phone}: ${text}`);
  }
}

function createSmsProvider(): SmsProvider {
  const name = config.smsProvider();
  if (name === "mock") return new MockSmsProvider();
  throw new Error(`Unknown SMS_PROVIDER "${name}"`);
}

export const sms = createSmsProvider();
