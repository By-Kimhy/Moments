import { expect, test } from "@playwright/test";
import { DEMO_HOST, newPage, signIn } from "./helpers";

test("a buyer orders tickets, the organizer confirms, the buyer gets QR tickets", async ({ page, browser }) => {
  await page.goto("/e/khmer-music-night");
  const vip = page.locator("li:has-text('VIP')");
  await vip.locator("button:text-is('+')").click();
  await page.fill("input[name=buyerName]", "E2E Buyer");
  await page.fill("input[name=buyerPhone]", "011 223 344");
  await page.click("button:has-text('កុម្ម៉ង់')");
  await page.waitForURL(/\/o\//);
  const reference = (await page.textContent("[data-testid=reference]"))!.trim();

  const organizer = await newPage(browser);
  await signIn(organizer, DEMO_HOST);
  const eventId = await organizer.evaluate(async () => {
    const res = await fetch("/api/events");
    const { events } = await res.json();
    return events.find((e: { slug: string | null }) => e.slug === "khmer-music-night").id as string;
  });
  await organizer.goto(`/events/${eventId}/tickets`);
  await organizer.click(`li:has-text('${reference}') button:has-text('បានទទួល')`);

  await expect(page.getByText("បានបង់ប្រាក់ ✓")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("img[alt=QR]")).toHaveCount(1);
});
