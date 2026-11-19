import { expect, mk, test } from "../fixtures";

test("the tab bar has three equal tabs: Home, Scan (icon only), Profile", async ({ page }) => {
  await page.goto("/app");
  const bar = page.getByRole("navigation", { name: mk.t("nav.main") });
  const names = [mk.t("nav.home"), mk.t("nav.scanJoin"), mk.t("nav.profile")];
  await expect(bar.getByRole("link")).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(bar.getByRole("link").nth(i)).toHaveAccessibleName(name);
  // Scan is a tab like the others: the same size to within a pixel, the same label style, no idle motion of its own.
  const boxes = await Promise.all(names.map((n) => bar.getByRole("link", { name: n }).boundingBox()));
  for (const b of boxes) {
    expect(Math.abs(b!.width - boxes[0]!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(b!.height - boxes[0]!.height)).toBeLessThanOrEqual(1);
  }
  const style = (n: string) =>
    bar.getByRole("link", { name: n }).evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.fontSize, s.fontWeight, s.color, s.backgroundColor, s.borderRadius].join("|");
    });
  expect(await style(names[1])).toBe(await style(names[2]));
  // Icon only: the name is for assistive technology, nothing is written in the tab, and its glyph is centred in the same box as the others.
  const scan = bar.getByRole("link", { name: names[1] });
  expect(((await scan.innerText()) ?? "").trim()).toBe("");
  const [sb, gb] = await Promise.all([scan.boundingBox(), scan.locator("svg").boundingBox()]);
  expect(Math.abs(gb!.x + gb!.width / 2 - (sb!.x + sb!.width / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs(gb!.y + gb!.height / 2 - (sb!.y + sb!.height / 2))).toBeLessThanOrEqual(1);
  // The same glyph size as the other tabs (as set; a selected tab's glyph lands with a small bounce, which moves its box).
  const size = (n: string) => bar.getByRole("link", { name: n }).locator("svg").getAttribute("width");
  expect(await size(names[1])).toBe(await size(names[2]));
  expect(await bar.getByRole("link", { name: names[1] }).evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  // The tab opens the join screen and becomes the current one.
  await bar.getByRole("link", { name: names[1] }).click();
  await expect(page).toHaveURL(/\/app\/join$/);
  await expect(page.getByRole("heading", { level: 1, name: mk.t("join.title") })).toBeVisible();
  await expect(bar.locator("[aria-current=page]")).toHaveAttribute("aria-label", mk.t("nav.scanJoin"));
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
