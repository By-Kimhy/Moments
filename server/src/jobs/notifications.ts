// Telegram alerts to the hosts of an event:
// - each RSVP, and each KHQR gift a guest reports (the host has to act on it), right away
// - gifts recorded at the desk, as one summary per 15 minutes, not one message per envelope
// With Redis, jobs go through a BullMQ queue (retried with backoff if Telegram is down);
// without it (development, tests) they run in the background of the API process.
import { Queue, Worker } from "bullmq";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import { giftTotals } from "../lib/gifts.js";
import { digestMessage, guestGiftMessage, rsvpMessage, testMessage } from "../lib/notification-messages.js";
import { sms } from "../providers/sms.js";
import { TelegramError, telegram } from "../providers/telegram.js";

export const DIGEST_MINUTES = 15;

export type NotificationJob =
  | { kind: "thank_you_sms"; thankYouId: string }
  | { kind: "rsvp"; guestId: string }
  | { kind: "guest_gift"; giftId: string }
  | { kind: "desk_digest"; eventId: string; windowEnd: number }
  | { kind: "test"; eventId: string };

const QUEUE = "notifications";
let queue: Queue | null = null;
const inFlight = new Set<Promise<unknown>>();
const scheduled = new Map<string, NodeJS.Timeout>();

const queueEnabled = () => Boolean(config.redisUrl()) && !config.test;
const connection = () => ({ url: config.redisUrl()!, maxRetriesPerRequest: null });

function getQueue() {
  queue ??= new Queue(QUEUE, { connection: connection(), defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: 1000, removeOnFail: 1000 } });
  return queue;
}

/** Queues a notification. Never throws: an alert must not break the request that caused it. */
export async function notify(job: NotificationJob, options: { delay?: number; jobId?: string } = {}) {
  // Alerts to hosts need the bot; thank-you SMS don't.
  if (job.kind !== "thank_you_sms" && !telegram()) return;
  try {
    if (queueEnabled()) {
      await getQueue().add(job.kind, job, options);
      return;
    }
    if (options.delay !== undefined) {
      // Direct mode: one timer per digest window. Tests run digests by hand instead.
      if (config.test || (options.jobId && scheduled.has(options.jobId))) return;
      const timer = setTimeout(() => {
        scheduled.delete(options.jobId ?? "");
        track(handle(job));
      }, options.delay);
      timer.unref();
      if (options.jobId) scheduled.set(options.jobId, timer);
      return;
    }
    track(handle(job));
  } catch (e) {
    console.error("notify failed", e);
  }
}

function track(p: Promise<unknown>) {
  const tracked = p.catch((e) => console.error("notification failed", e)).finally(() => inFlight.delete(tracked));
  inFlight.add(tracked);
}

/** For tests: waits for background notifications to finish. */
export async function drainNotifications() {
  await Promise.all([...inFlight]);
}

/** After a gift at the desk: make sure this window's summary is on its way. */
export function scheduleDeskDigest(eventId: string, now = Date.now()) {
  const windowMs = DIGEST_MINUTES * 60_000;
  const windowEnd = Math.ceil((now + 1) / windowMs) * windowMs;
  return notify({ kind: "desk_digest", eventId, windowEnd }, { delay: windowEnd - now, jobId: `digest-${eventId}-${windowEnd}` });
}

async function eventFor(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { owner: { select: { language: true } } } });
  if (!event?.telegramChatId) return null;
  return { event, chatId: event.telegramChatId.toString(), lang: event.owner.language, title: event.titleKm };
}

async function send(eventId: string, chatId: string, text: string) {
  const client = telegram();
  if (!client) return;
  try {
    await client.sendMessage(chatId, text);
  } catch (e) {
    // The bot was removed from the group or blocked: unlink instead of retrying forever.
    if (e instanceof TelegramError && e.permanent) {
      await prisma.$transaction(async (tx) => {
        await tx.event.update({ where: { id: eventId }, data: { telegramChatId: null } });
        await audit(tx, { eventId, entity: "event", entityId: eventId, action: "telegram_unlinked", actorId: null, after: { reason: e.message } });
      });
      return;
    }
    throw e;
  }
}

export async function handle(job: NotificationJob) {
  if (job.kind === "thank_you_sms") {
    await sendThankYouSms(job.thankYouId);
  } else if (job.kind === "rsvp") {
    const guest = await prisma.guest.findUnique({ where: { id: job.guestId } });
    if (!guest || guest.rsvpStatus === "PENDING") return;
    const target = await eventFor(guest.eventId);
    if (!target) return;
    const attending = await prisma.guest.findMany({ where: { eventId: guest.eventId, rsvpStatus: "ATTENDING" }, select: { rsvpCount: true, invitedCount: true } });
    await send(
      guest.eventId,
      target.chatId,
      rsvpMessage(target.lang, {
        title: target.title,
        guest: guest.name,
        status: guest.rsvpStatus,
        count: guest.rsvpCount ?? guest.invitedCount,
        message: guest.rsvpMessage,
        attendingPeople: attending.reduce((s, g) => s + (g.rsvpCount ?? g.invitedCount), 0),
      }),
    );
  } else if (job.kind === "guest_gift") {
    const gift = await prisma.gift.findUnique({ where: { id: job.giftId }, include: { guest: true } });
    if (!gift || gift.status !== "PENDING") return;
    const target = await eventFor(gift.eventId);
    if (!target) return;
    await send(
      gift.eventId,
      target.chatId,
      guestGiftMessage(target.lang, {
        title: target.title,
        guest: gift.guest?.name ?? gift.giverName ?? "",
        amount: gift.amount,
        currency: gift.currency,
        note: gift.note,
        link: `${config.appUrl()}/events/${gift.eventId}/gifts`,
      }),
    );
  } else if (job.kind === "desk_digest") {
    const target = await eventFor(job.eventId);
    if (!target) return;
    const from = new Date(job.windowEnd - DIGEST_MINUTES * 60_000);
    const gifts = await prisma.gift.findMany({
      where: { eventId: job.eventId },
      select: { amount: true, currency: true, method: true, status: true, voidedAt: true, createdAt: true, source: true, guest: { select: { side: true, group: true } } },
    });
    const inWindow = gifts.filter((g) => g.source !== "GUEST" && g.createdAt >= from && g.createdAt < new Date(job.windowEnd));
    const windowTotals = giftTotals(inWindow);
    if (!windowTotals.count) return;
    const all = giftTotals(gifts);
    await send(
      job.eventId,
      target.chatId,
      digestMessage(target.lang, { title: target.title, count: windowTotals.count, window: windowTotals.total, total: all.total, totalCount: all.count, minutes: DIGEST_MINUTES }),
    );
  } else if (job.kind === "test") {
    const target = await eventFor(job.eventId);
    if (target) await send(job.eventId, target.chatId, testMessage(target.lang, target.title));
  }
}

/** Sends one queued thank-you by SMS and records how it went. */
async function sendThankYouSms(thankYouId: string) {
  const thankYou = await prisma.thankYou.findUnique({ where: { id: thankYouId }, include: { guest: { select: { phone: true } } } });
  if (!thankYou || thankYou.status === "SENT") return;
  try {
    if (!thankYou.guest.phone) throw new Error("No phone number");
    await sms.send(thankYou.guest.phone, thankYou.text);
    await prisma.thankYou.update({ where: { id: thankYou.id }, data: { status: "SENT", sentAt: new Date(), error: null } });
  } catch (e) {
    await prisma.thankYou.update({ where: { id: thankYou.id }, data: { status: "FAILED", error: (e as Error).message.slice(0, 300) } });
  }
}

/** Runs queued notifications and thank-you SMS (with Redis). Started by the API process. */
export function startNotificationWorker() {
  if (!queueEnabled()) return null;
  // At most 10 messages a second, to stay inside SMS gateway and Telegram limits.
  const worker = new Worker<NotificationJob>(QUEUE, (job) => handle(job.data), { connection: connection(), concurrency: 5, limiter: { max: 10, duration: 1000 } });
  worker.on("failed", (job, err) => console.error(`notification ${job?.name} failed (attempt ${job?.attemptsMade})`, err.message));
  return worker;
}
