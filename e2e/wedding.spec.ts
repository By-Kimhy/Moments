import { expect, test } from "@playwright/test";
import { newPage, randomPhone, signIn, weddingWithGuest } from "./helpers";

test("a guest replies, a helper checks them in and records a gift, the host sees it", async ({ page, browser }) => {
  await signIn(page, randomPhone(), "Wedding Host");
  const { eventId, helperCode, token } = await weddingWithGuest(page, "ស៊ុន សុភា");

  // The guest opens their invitation and says they are coming.
  const guest = await newPage(browser);
  await guest.goto(`/i/${token}`);
  await expect(guest.getByText("ស៊ុន សុភា").first()).toBeVisible();
  await guest.click("button:has-text('ខ្ញុំនឹងមក')");
  await guest.click("button:has-text('ផ្ញើការឆ្លើយតប')");
  await expect(guest.getByRole("button", { name: "ផ្ញើការឆ្លើយតប" })).toHaveCount(0);

  // A helper joins the desk with the code, checks the guest in and records $50.
  const desk = await newPage(browser);
  await desk.goto("/desk");
  await desk.fill("input[name=code]", helperCode);
  await desk.fill("input[name=name]", "Helper One");
  await desk.click("main button:has-text('ចូល')");
  await desk.fill("input[placeholder*='ស្វែងរក']", "ស៊ុន");
  await desk.locator("ul li button").first().click();
  await desk.click("button.bg-accent:has-text('ចុះឈ្មោះចូល')");
  await expect(desk.getByText("✓ ស៊ុន សុភា").first()).toBeVisible();
  await desk.click(".fixed button:has-text('$50.00')");
  await desk.click(".fixed button:has-text('កត់ត្រាចំណងដៃ')");
  await expect(desk.getByText("បានកត់ត្រា $50.00 ពី ស៊ុន សុភា")).toBeVisible();
  await expect(desk.locator("[data-testid=sync-bar]")).toContainText("បានផ្ញើទាំងអស់");

  // The host's gift book has it.
  await page.goto(`/events/${eventId}/gifts`);
  await expect(page.locator("main li").filter({ hasText: "ស៊ុន សុភា" }).first()).toContainText("$50.00");
});
