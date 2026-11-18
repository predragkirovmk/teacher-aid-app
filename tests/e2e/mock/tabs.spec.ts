import { expect, mk, test } from "../fixtures";

test("the tab bar is the classic five: Home, Subjects, the scan in the middle, Alerts, Profile", async ({ page }) => {
  await page.goto("/app");
  const tabs = page.getByRole("navigation", { name: mk.t("nav.main") });
  const names = [mk.t("nav.home"), mk.t("subjects.title"), mk.t("nav.scan"), new RegExp(mk.t("nav.alerts")), mk.t("nav.profile")];
  await expect(tabs.getByRole("link")).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(tabs.getByRole("link").nth(i)).toHaveAccessibleName(name);
});

test("the tab bar switches between Home, Subjects, Alerts and Profile", async ({ page }) => {
  await page.goto("/app");
  const tabs = page.getByRole("navigation", { name: mk.t("nav.main") });
  const current = tabs.locator("[aria-current=page]");

  await expect(current).toContainText(mk.t("nav.home"));

  await tabs.getByRole("link", { name: mk.t("subjects.title") }).click();
  await expect(page).toHaveURL(/\/app\/subjects$/);
  // A tab root: its large title, and no Back.
  await expect(page.getByRole("heading", { level: 1, name: mk.t("subjects.title") })).toBeVisible();
  await expect(page.getByRole("button", { name: mk.t("back") })).toHaveCount(0);
  await expect(current).toContainText(mk.t("subjects.title"));

  await tabs.getByRole("link", { name: new RegExp(mk.t("nav.alerts")) }).click();
  await expect(page).toHaveURL(/\/app\/notifications$/);
  await expect(page.getByRole("heading", { level: 1, name: mk.t("nav.alerts") })).toBeVisible();
  await expect(current).toContainText(mk.t("nav.alerts"));

  await tabs.getByRole("link", { name: mk.t("nav.profile") }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.getByRole("heading", { level: 1, name: mk.t("nav.profile") })).toBeVisible();
  await expect(current).toContainText(mk.t("nav.profile"));

  await tabs.getByRole("link", { name: mk.t("nav.home") }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(current).toContainText(mk.t("nav.home"));
});
