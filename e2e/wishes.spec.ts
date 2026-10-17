import { expect, test } from "@playwright/test";
import { newPage, randomPhone, signIn, weddingWithGuest } from "./helpers";

test("a guest writes a wish and the host sees it in the wish book", async ({ page, browser }) => {
  await signIn(page, randomPhone(), "Wish Host");
  const { eventId, token } = await weddingWithGuest(page, "ឈឹម ស្រីពៅ");

  const guest = await newPage(browser);
  await guest.goto(`/i/${token}`);
  const form = guest.locator("[data-testid=wish-form]");
  await form.locator("textarea").fill("សូមឱ្យគូស្វាមីភរិយាមានសុភមង្គលជារៀងរហូត");
  await form.locator("button").click();
  await expect(form.getByText("សូមអរគុណសម្រាប់ពាក្យជូនពរ!")).toBeVisible();

  await page.goto(`/events/${eventId}/wishes`);
  await expect(page.locator("[data-testid=wishes] li").first()).toContainText("សុភមង្គលជារៀងរហូត");
  await expect(page.locator("[data-testid=wishes] li").first()).toContainText("ឈឹម ស្រីពៅ");
});
