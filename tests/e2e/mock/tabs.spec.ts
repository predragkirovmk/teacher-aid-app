import { expect, mk, test } from "../fixtures";

test.describe("the scan pill", () => {
  test("sits in the middle of the bar, reads Scan to join, and opens the scanner", async ({ page }) => {
    await page.goto("/app");
    const bar = page.getByRole("navigation", { name: mk.t("nav.main") });
    const pill = bar.getByRole("link", { name: mk.t("nav.scanJoin") });
    await expect(pill).toHaveText(mk.t("nav.scanJoin"));
    const [b, p, home, profile] = await Promise.all([
      bar.boundingBox(),
      pill.boundingBox(),
      bar.getByRole("link", { name: mk.t("nav.home") }).boundingBox(),
      bar.getByRole("link", { name: mk.t("nav.profile") }).boundingBox(),
    ]);
    expect(Math.abs(p!.x + p!.width / 2 - (b!.x + b!.width / 2))).toBeLessThan(2);
    expect(p!.x).toBeGreaterThan(home!.x + home!.width - 1);
    expect(p!.x + p!.width).toBeLessThan(profile!.x + 1);
    // The text sits on one line, and Home and Profile keep room for their words.
    expect(p!.height).toBeLessThan(80);
    expect(home!.width).toBeGreaterThan(70);
    await pill.click();
    await expect(page).toHaveURL(/\/app\/scan$/);
    await expect(page.getByRole("heading", { level: 1, name: mk.t("scan.title") })).toBeVisible();
  });

  test("idles with transform and opacity only", async ({ page }) => {
    await page.goto("/app");
    const props = await page.evaluate(() =>
      document
        .querySelector(".scan-pill")!
        .getAnimations({ subtree: true })
        .flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)))
        .filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k)),
    );
    expect(props.length).toBeGreaterThan(0);
    expect(new Set(props)).toEqual(new Set(["transform", "opacity"]));
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("nothing idles", async ({ page }) => {
      await page.goto("/app");
      await expect(page.locator(".scan-pill")).toBeVisible();
      expect(await page.evaluate(() => document.querySelector(".scan-pill")!.getAnimations({ subtree: true }).length)).toBe(0);
    });
  });
});

test("the tab bar has three slots: Home, the scan in the middle, Profile", async ({ page }) => {
  await page.goto("/app");
  const tabs = page.getByRole("navigation", { name: mk.t("nav.main") });
  const names = [mk.t("nav.home"), mk.t("nav.scanJoin"), mk.t("nav.profile")];
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
