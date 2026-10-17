import { type Browser, type Page, expect } from "@playwright/test";

export const randomPhone = () => `0${70_000_000 + Math.floor(Math.random() * 9_999_999)}`;

/** The demo host from the seed: also a platform admin. */
export const DEMO_HOST = "012 345 678";

/** Signs in with the login page's test form (the app runs without a Telegram bot). */
export async function signIn(page: Page, phone: string, name?: string, { open = true } = {}) {
  if (open) await page.goto("/login");
  await page.fill("input[name=phone]", phone);
  if (name) await page.fill("input[name=name]", name);
  await page.click("form button:has-text('ចូល')");
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** A fresh page in its own browser context, so sessions don't mix. */
export async function newPage(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "km-KH" });
  return context.newPage();
}

/** Creates a published wedding for the signed-in host through the API, with one guest. */
export async function weddingWithGuest(page: Page, guestName: string) {
  const event = (await (await page.request.post("/api/events", { data: { titleKm: "ពិធីមង្គលការ សាកល្បង", startsAt: "2026-12-27T00:00:00Z" } })).json()).event;
  expect(event.id).toBeTruthy();
  await page.request.patch(`/api/events/${event.id}`, { data: { status: "PUBLISHED" } });
  const guest = (await (await page.request.post(`/api/events/${event.id}/guests`, { data: { name: guestName, side: "BRIDE", invitedCount: 2 } })).json()).guest;
  return { eventId: event.id as string, helperCode: event.helperCode as string, token: guest.inviteToken as string };
}
