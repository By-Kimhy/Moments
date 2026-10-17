import { expect, test } from "@playwright/test";
import { randomPhone, signIn } from "./helpers";

test("the directory filters vendors, and a host sends one an enquiry", async ({ page }) => {
  await page.goto("/vendors");
  await page.selectOption("select[name=category]", "MAKEUP");
  await page.click("form button:has-text('ស្វែងរក')");
  await expect(page).toHaveURL(/category=MAKEUP/);
  await expect(page.getByText("Srey Beauty Makeup")).toBeVisible();

  await signIn(page, randomPhone(), "Enquiring Host");
  await page.goto("/vendors/srey-beauty");
  await page.fill("textarea[name=message]", "តើអ្នកទំនេរថ្ងៃទី ២៧ ធ្នូ ដែរឬទេ?");
  await page.click("section button:has-text('ផ្ញើ')");
  await expect(page.getByText("បានផ្ញើហើយ។")).toBeVisible();
});
