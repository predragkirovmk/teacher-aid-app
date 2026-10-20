import { expect, mk, start, test } from "../fixtures";

test("welcome signs the student in and lands on Home", async ({ page }) => {
  await start(page, { state: { signedIn: false } });
  await page.goto("/app");

  await expect(page).toHaveURL(/\/app\/welcome\?next=%2Fapp$/);
  await expect(page.getByRole("heading", { name: mk.t("welcome.title") })).toBeVisible();

  await page.getByRole("button", { name: mk.t("welcome.cta") }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Марко");
});

test("a link opened while signed out carries through the welcome screen", async ({ page }) => {
  await start(page, { state: { signedIn: false } });
  await page.goto("/app/checkin/MATH-7B");

  await expect(page).toHaveURL(/\/app\/welcome\?next=%2Fapp%2Fcheckin%2FMATH-7B$/);
  await page.getByRole("button", { name: mk.t("welcome.cta") }).click();
  await expect(page).toHaveURL(/\/app\/play\/MATH-7B$/);
});

test("signing out from Profile returns to the welcome screen", async ({ page }) => {
  await page.goto("/app/profile");
  await page.getByRole("button", { name: mk.t("drawer.logout") }).click();

  const sheet = page.getByRole("dialog", { name: mk.t("confirm.logout") });
  await sheet.getByRole("button", { name: mk.t("drawer.logout") }).click();

  await expect(page).toHaveURL(/\/app\/welcome/);
  await expect(page.getByRole("heading", { name: mk.t("welcome.title") })).toBeVisible();
});
