import { expect, mk, test } from "../fixtures";

test("the tab bar has three equal tabs: Home, Scan, Profile, each with an icon and a name", async ({ page }) => {
  await page.goto("/app");
  const bar = page.getByRole("navigation", { name: mk.t("nav.main") });
  const names = [mk.t("nav.home"), mk.t("nav.scan"), mk.t("nav.profile")];
  expect(names[1]).toBe("Скенирај");
  await expect(bar.getByRole("link")).toHaveCount(names.length);
  // The visible label is the accessible name (no aria-label overriding it).
  for (const [i, name] of names.entries()) {
    const tab = bar.getByRole("link").nth(i);
    await expect(tab).toHaveAccessibleName(name);
    await expect(tab).not.toHaveAttribute("aria-label", /.*/);
    expect(((await tab.innerText()) ?? "").trim()).toBe(name);
  }
  // Scan is a tab like the others: the same size to within a pixel, the same label style, no idle motion of its own.
  const tabAt = (i: number) => bar.getByRole("link").nth(i);
  const boxes = await Promise.all(names.map((_, i) => tabAt(i).boundingBox()));
  for (const b of boxes) {
    expect(Math.abs(b!.width - boxes[0]!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(b!.height - boxes[0]!.height)).toBeLessThanOrEqual(1);
  }
  const style = (i: number) =>
    tabAt(i).evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.fontSize, s.fontWeight, s.color, s.backgroundColor, s.borderRadius, s.lineHeight, s.letterSpacing].join("|");
    });
  expect(await style(1)).toBe(await style(2));
  // The glyph and the label sit where they do in the other tabs, measured from each tab's own top-left and centre.
  const layout = (i: number) =>
    tabAt(i).evaluate((el) => {
      const t = el.getBoundingClientRect();
      const g = el.querySelector("svg")!.getBoundingClientRect();
      const r = document.createRange();
      r.selectNodeContents(el);
      const l = Array.from(r.getClientRects()).filter((c) => c.width > 0 && c.height > 0 && !(c.x === g.x && c.y === g.y && c.width === g.width)).pop()!;
      return {
        glyphDx: g.x + g.width / 2 - (t.x + t.width / 2),
        glyphDy: g.y - t.y,
        labelDx: l.x + l.width / 2 - (t.x + t.width / 2),
        labelDy: l.y - t.y,
        labelH: l.height,
      };
    });
  // The current tab's glyph lands with a small bounce; measure once it has settled.
  await bar.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((an) => an.finished)));
  const [home, scan, profile] = await Promise.all([layout(0), layout(1), layout(2)]);
  for (const other of [home, profile]) {
    expect(Math.abs(scan.glyphDx)).toBeLessThanOrEqual(1);
    expect(Math.abs(scan.glyphDy - other.glyphDy)).toBeLessThanOrEqual(1);
    expect(Math.abs(scan.labelDx)).toBeLessThanOrEqual(1);
    expect(Math.abs(scan.labelDy - other.labelDy)).toBeLessThanOrEqual(1);
    expect(Math.abs(scan.labelH - other.labelH)).toBeLessThanOrEqual(1);
  }
  // The same glyph size as the other tabs (as set; a selected tab's glyph lands with a small bounce, which moves its box).
  const size = (i: number) => tabAt(i).locator("svg").getAttribute("width");
  expect(await size(1)).toBe(await size(2));
  expect(await tabAt(1).evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  // The tab opens the join screen and becomes the current one.
  await tabAt(1).click();
  await expect(page).toHaveURL(/\/app\/join$/);
  await expect(page.getByRole("heading", { level: 1, name: mk.t("join.title") })).toBeVisible();
  await expect(bar.locator("[aria-current=page]")).toHaveText(mk.t("nav.scan"));
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
