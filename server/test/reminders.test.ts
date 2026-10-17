import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { dueReminders, sendDueReminders } from "../src/jobs/reminders.js";
import { type MemoryTelegramClient, telegram } from "../src/providers/telegram.js";
import { hostWithEvent } from "./helpers.js";

const DAY = 86_400_000;
const sentTo = (chatId: string) => (telegram() as MemoryTelegramClient).sent.filter((m) => m.chatId === chatId);

describe("reminders", () => {
  it("are due 3 days before, the day before and the day after", () => {
    const start = new Date("2026-12-20T00:00:00Z");
    const at = (hours: number) => dueReminders(start, new Date(start.getTime() + hours * 3600_000));
    expect(at(-80)).toEqual([]);
    expect(at(-70)).toEqual(["REPLIES"]);
    expect(at(-20)).toEqual(["DESK"]);
    expect(at(-1)).toEqual([]);
    expect(at(30)).toEqual(["THANKS"]);
    expect(at(24 * 5)).toEqual([]);
  });

  it("go to the hosts privately once each, with who hasn't replied, the desk and the totals", async () => {
    const host = await hostWithEvent("Reminded Host");
    const base = `/api/events/${host.event.id}`;
    await host.agent.post(`${base}/guests`).send({ name: "Not Replied", side: "BRIDE", invitedCount: 1 }).expect(201);
    const start = Date.now() + 2.5 * DAY;
    await prisma.event.update({ where: { id: host.event.id }, data: { status: "PUBLISHED", startsAt: new Date(start) } });
    const me = String(host.telegramId);

    await sendDueReminders(new Date());
    const replies = sentTo(me).at(-1)!.text;
    expect(replies).toContain("ភ្ញៀវ ១ នាក់មិនទាន់ឆ្លើយតប");
    expect(replies).toContain("• Not Replied");
    const count = sentTo(me).length;
    await sendDueReminders(new Date());
    expect(sentTo(me)).toHaveLength(count); // not twice

    await sendDueReminders(new Date(start - 0.5 * DAY));
    expect(sentTo(me).at(-1)!.text).toContain(`លេខកូដជំនួយការ៖ ${host.event.helperCode}`);
    await sendDueReminders(new Date(start + 1.5 * DAY));
    expect(sentTo(me).at(-1)!.text).toContain("/thank-you");
    expect(await prisma.eventReminder.count({ where: { eventId: host.event.id } })).toBe(3);
  });

  it("skip drafts", async () => {
    const host = await hostWithEvent();
    await prisma.event.update({ where: { id: host.event.id }, data: { startsAt: new Date(Date.now() + 2.5 * DAY) } });
    await sendDueReminders(new Date());
    expect(await prisma.eventReminder.count({ where: { eventId: host.event.id } })).toBe(0);
  });
});
