import { expect, test } from "@playwright/test";
import { DEMO_HOST, newPage, randomPhone, signIn, weddingWithGuest } from "./helpers";

test("a free event is upgraded after the admin confirms the payment", async ({ page, browser }) => {
  await signIn(page, randomPhone(), "Upgrading Host");
  const { eventId } = await weddingWithGuest(page, "Guest");
  await page.goto(`/events/${eventId}/seating`);
  await expect(page.locator("[data-testid=upgrade-notice]")).toBeVisible();

  await page.goto(`/events/${eventId}/plan`);
  await page.click("button:has-text('ដំឡើងទៅ ព្រីមៀម')");
  const reference = (await page.textContent("[data-testid=plan-reference]"))!.trim();

  const admin = await newPage(browser);
  await signIn(admin, DEMO_HOST);
  await admin.goto("/admin/payments");
  await admin.locator(`[data-testid=plan-order]:has-text('${reference}') button:has-text('បានទទួលប្រាក់')`).click();
  await expect(admin.locator(`[data-testid=plan-order]:has-text('${reference}')`)).toHaveCount(0);

  await page.reload();
  await expect(page.locator("[data-testid=current-plan]")).toContainText("ព្រីមៀម");
  await page.goto(`/events/${eventId}/seating`);
  await expect(page.locator("[data-testid=upgrade-notice]")).toHaveCount(0);
});
