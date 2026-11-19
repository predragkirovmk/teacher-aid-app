import { expect, mk, STORE_KEY, test } from "../fixtures";

test("reset demo clears check-ins and read alerts", async ({ page }) => {
  // A check-in and a read alert to clear.
  await page.goto("/app/checkin/MATH-7B");
  await expect(page).toHaveURL(/\/app\/play\/MATH-7B$/);
  await page.goto("/app/notifications");
  await page.getByRole("button", { name: mk.t("notif.markAll") }).click();
  await expect(page.locator(".item--unread")).toHaveCount(0);

  await page.goto("/app/settings");
  await page.getByRole("button", { name: new RegExp(mk.t("settings.reset")) }).click();
  const sheet = page.getByRole("dialog", { name: mk.t("confirm.reset") });
  await sheet.getByRole("button", { name: mk.t("settings.reset") }).click();
  await expect(page.getByText(mk.t("settings.resetDone")).first()).toBeVisible();

  await page.goto("/app");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").checkins ?? [], STORE_KEY)).toEqual([]);
  await page.goto("/app/notifications");
  // Two alerts and the practice set the teacher sent.
  await expect(page.locator(".item--unread")).toHaveCount(3);
});
