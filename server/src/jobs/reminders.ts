// Reminders to the hosts of a published wedding: 3 days before (who hasn't replied), the day
// before (the guest desk checklist) and the day after (totals and thank-yous). They go to the
// event's linked Telegram chat, or else to each host privately (hosts sign in through the bot).
// Each kind is sent once per event; claiming it in the database first stops doubles.
import type { Event, ReminderKind } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { giftTotals } from "../lib/gifts.js";
import { deskReminder, repliesReminder, thanksReminder } from "../lib/notification-messages.js";
import { TelegramError, telegram } from "../providers/telegram.js";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Which reminder is due for an event now, if any: [kind, from, until] relative to the start. */
const WINDOWS: [ReminderKind, number, number][] = [
  ["REPLIES", -3 * DAY, -1 * DAY],
  ["DESK", -1 * DAY, -2 * HOUR],
  ["THANKS", 1 * DAY, 4 * DAY],
];

export function dueReminders(startsAt: Date, now = new Date()) {
  const since = now.getTime() - startsAt.getTime();
  return WINDOWS.filter(([, from, until]) => since >= from && since < until).map(([kind]) => kind);
}

async function recipients(event: Event) {
  if (event.telegramChatId) return [event.telegramChatId.toString()];
  const hosts = await prisma.eventMember.findMany({ where: { eventId: event.id, role: "OWNER", revokedAt: null }, include: { user: { select: { telegramId: true } } } });
  return [...new Set(hosts.flatMap((h) => (h.user?.telegramId ? [h.user.telegramId.toString()] : [])))];
}

async function message(event: Event & { owner: { language: "KM" | "EN" } }, kind: ReminderKind) {
  const lang = event.owner.language;
  const app = config.appUrl();
  if (kind === "REPLIES") {
    const guests = await prisma.guest.findMany({ where: { eventId: event.id, walkIn: false }, select: { name: true, rsvpStatus: true, rsvpCount: true, invitedCount: true }, orderBy: { name: "asc" } });
    const pending = guests.filter((g) => g.rsvpStatus === "PENDING");
    return repliesReminder(lang, {
      title: event.titleKm,
      pending: pending.map((g) => g.name),
      pendingCount: pending.length,
      attendingPeople: guests.reduce((s, g) => s + (g.rsvpStatus === "ATTENDING" ? (g.rsvpCount ?? g.invitedCount) : 0), 0),
      link: `${app}/events/${event.id}/guests`,
    });
  }
  if (kind === "DESK") {
    const helpers = await prisma.eventMember.count({ where: { eventId: event.id, role: "HELPER", revokedAt: null } });
    return deskReminder(lang, { title: event.titleKm, helperCode: event.helperCode, helpers, khqr: Boolean(event.khqrImageKey), deskLink: `${app}/desk`, guestsLink: `${app}/events/${event.id}` });
  }
  const [arrived, gifts] = await Promise.all([
    prisma.checkin.aggregate({ where: { eventId: event.id }, _sum: { peopleCount: true } }),
    prisma.gift.findMany({ where: { eventId: event.id }, select: { amount: true, currency: true, method: true, status: true, voidedAt: true, guest: { select: { side: true, group: true } } } }),
  ]);
  const totals = giftTotals(gifts);
  return thanksReminder(lang, { title: event.titleKm, arrived: arrived._sum.peopleCount ?? 0, gifts: totals.count, total: totals.total, link: `${app}/events/${event.id}/thank-you` });
}

/** Sends every reminder that is due. Returns how many were sent. */
export async function sendDueReminders(now = new Date()) {
  const client = telegram();
  if (!client) return 0;
  const events = await prisma.event.findMany({
    where: { type: "WEDDING", status: "PUBLISHED", startsAt: { gte: new Date(now.getTime() - 4 * DAY), lte: new Date(now.getTime() + 3 * DAY) } },
    include: { owner: { select: { language: true } }, reminders: { select: { kind: true } } },
  });
  let sent = 0;
  for (const event of events) {
    for (const kind of dueReminders(event.startsAt, now)) {
      if (event.reminders.some((r) => r.kind === kind)) continue;
      // Claim it first: if another process got there, the unique key stops this one.
      const claimed = await prisma.eventReminder.create({ data: { eventId: event.id, kind } }).catch(() => null);
      if (!claimed) continue;
      const text = await message(event, kind);
      for (const chatId of await recipients(event)) {
        try {
          await client.sendMessage(chatId, text);
        } catch (e) {
          if (!(e instanceof TelegramError && e.permanent)) console.error("reminder failed", event.id, kind, (e as Error).message);
        }
      }
      sent++;
    }
  }
  return sent;
}

/** In the API process: look for due reminders every 15 minutes. */
export function startReminders() {
  if (!telegram() || config.test) return;
  const run = () => void sendDueReminders().catch((e) => console.error("reminders failed", e));
  setInterval(run, 15 * 60_000).unref();
  run();
}
