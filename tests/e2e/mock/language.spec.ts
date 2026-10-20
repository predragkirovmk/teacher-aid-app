import { en, expect, mk, start, test } from "../fixtures";

test("the language switches to English and back, and is remembered", async ({ page }) => {
  await page.goto("/app/profile");
  await expect(page.locator("html")).toHaveAttribute("lang", "mk");

  await page.getByRole("button", { name: new RegExp(mk.t("profile.language")) }).click();
  await page.getByRole("dialog", { name: mk.t("lang.title") }).getByRole("radio", { name: /English/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: en.t("nav.profile") })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("navigation", { name: en.t("nav.main") })).toContainText(en.t("nav.home"));

  // It is the phone's setting: it survives a reload and shows on every screen.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: en.t("nav.profile") })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: en.t("nav.main") });
  await tabs.getByRole("link", { name: en.t("nav.home") }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/^Good (morning|afternoon|evening|night), Marko/);

  await tabs.getByRole("link", { name: en.t("nav.profile") }).click();
  await page.getByRole("button", { name: new RegExp(en.t("profile.language")) }).click();
  await page.getByRole("dialog", { name: en.t("lang.title") }).getByRole("radio", { name: /Македонски/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: mk.t("nav.profile") })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "mk");
});

test("the welcome screen has the switch too", async ({ page }) => {
  await start(page, { state: { signedIn: false } });
  await page.goto("/app/welcome");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: en.t("welcome.title") })).toBeVisible();
  await page.getByRole("button", { name: "Македонски" }).click();
  await expect(page.getByRole("heading", { name: mk.t("welcome.title") })).toBeVisible();
});
