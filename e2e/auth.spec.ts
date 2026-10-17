import { expect, test } from "@playwright/test";
import { randomPhone, signIn } from "./helpers";

test("a new person signs in, lands where they wanted, and can edit their account", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount/);
  await signIn(page, randomPhone(), "Test Person", { open: false });
  await expect(page).toHaveURL(/\/account$/);
  await page.fill("input[name=name]", "Test Person Two");
  await page.click("button:has-text('រក្សាទុក')");
  await expect(page.getByText("បានរក្សាទុក។")).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText("Test Person Two")).toBeVisible();
});
