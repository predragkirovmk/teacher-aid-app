import { expect, mk, test } from "../fixtures";

test("the tab bar has three slots: Home, the scan in the middle, Profile", async ({ page }) => {
  await page.goto("/app");
  const tabs = page.getByRole("navigation", { name: mk.t("nav.main") });
  const names = [mk.t("nav.home"), mk.t("nav.scan"), mk.t("nav.profile")];
  await expect(tabs.getByRole("link")).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(tabs.getByRole("link").nth(i)).toHaveAccessibleName(name);
});

test("the tab bar switches between Home and Profile", async ({ page }) => {
  await page.goto("/app");
  const tabs = page.getByRole("navigation", { name: mk.t("nav.main") });
  const current = tabs.locator("[aria-current=page]");

  await expect(current).toContainText(mk.t("nav.home"));

  await tabs.getByRole("link", { name: mk.t("nav.profile") }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.getByRole("heading", { level: 1, name: mk.t("nav.profile") })).toBeVisible();
  await expect(current).toContainText(mk.t("nav.profile"));

  await tabs.getByRole("link", { name: mk.t("nav.home") }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(current).toContainText(mk.t("nav.home"));
});

test("the bell on Home opens Alerts as a screen with Back, and Back returns to Home", async ({ page }) => {
  await page.goto("/app");
  const bell = page.locator(".home-bar").getByRole("link", { name: mk.t("notif.title") });
  const box = await bell.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await bell.click();
  await expect(page).toHaveURL(/\/app\/notifications$/);
  await expect(page.getByRole("heading", { level: 1, name: mk.t("notif.title") })).toBeVisible();
  // No tab bar piece: Alerts is not a tab, so nothing in the bar is the current screen.
  await expect(page.getByRole("navigation", { name: mk.t("nav.main") }).locator("[aria-current=page]")).toHaveCount(0);
  await page.getByRole("button", { name: mk.t("back") }).click();
  await expect(page).toHaveURL(/\/app$/);
});
