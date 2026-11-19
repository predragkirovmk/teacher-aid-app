import AxeBuilder from "@axe-core/playwright";
import { expect, mk, start, test } from "../fixtures";

/** The Scan tab: a call to action that opens the camera, and a typed code that does the same without one. */

test("the join button is big, fits a 360 px phone, and opens the scanner with a forward slide", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/app/join");
  await expect(page.getByRole("heading", { level: 1, name: mk.t("join.title") })).toBeVisible();
  await expect(page.getByText(mk.t("join.line"))).toBeVisible();
  const cta = page.locator(".join-cta");
  await expect(cta).toHaveText(mk.t("nav.scanJoin"));
  const box = (await cta.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(56);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await cta.click();
  await expect(page).toHaveURL(/\/app\/scan$/);
});

test("the button idles with transform and opacity only", async ({ page }) => {
  await page.goto("/app/join");
  const props = await page.evaluate(() =>
    document
      .querySelector(".join-cta")!
      .getAnimations({ subtree: true })
      .flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)))
      .filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k)),
  );
  expect(props.length).toBeGreaterThan(0);
  expect(new Set(props)).toEqual(new Set(["transform", "opacity"]));
});

test("the idle cycle is 4.5 s and starts 600 ms after arrival", async ({ page }) => {
  await page.goto("/app/join");
  const timing = await page.evaluate(() =>
    document
      .querySelector(".join-cta")!
      .getAnimations({ subtree: true })
      .filter((a) => a.effect?.getComputedTiming().iterations === Infinity)
      .map((a) => {
        const t = a.effect!.getComputedTiming();
        return [Number(t.duration), Number(t.delay)];
      }),
  );
  expect(timing).toHaveLength(3);
  for (const [duration, delay] of timing) {
    expect(duration).toBe(4500);
    expect(delay).toBe(600);
  }
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("nothing idles", async ({ page }) => {
    await page.goto("/app/join");
    await expect(page.locator(".join-cta")).toBeVisible();
    expect(await page.evaluate(() => document.querySelector(".join-cta")!.getAnimations({ subtree: true }).length)).toBe(0);
  });
});

async function openCode(page: import("@playwright/test").Page) {
  await start(page, {});
  await page.goto("/app/join");
  await page.getByRole("button", { name: mk.t("scan.code") }).click();
  return page.getByRole("textbox", { name: mk.t("scan.codeLabel") });
}

test("a typed class code joins the quiz", async ({ page }) => {
  const field = await openCode(page);
  await expect(field).toBeFocused();
  await expect(page.getByText(mk.t("scan.codeHint"))).toBeVisible();
  await field.fill(" math-7b ");
  await page.getByRole("button", { name: mk.t("scan.codeGo") }).click();
  await expect(page).toHaveURL(/\/app\/play\/MATH-7B$/);
  await expect(page.getByText(mk.q("q.live"))).toBeVisible();
});

test("a code nobody issued shows the Miss sheet, and it can be dismissed", async ({ page }) => {
  const field = await openCode(page);
  await field.fill("NOPE-9");
  await field.press("Enter");
  await expect(page.locator(".scan-miss")).toContainText(mk.q("q.fail.unknown.title"));
  await expect(page).toHaveURL(/\/app\/join$/);
  await page.getByRole("button", { name: mk.t("join.again") }).click();
  await expect(page.locator(".scan-miss")).toHaveCount(0);
});

test("an empty code says so in place, tied to the field", async ({ page }) => {
  const field = await openCode(page);
  await field.press("Enter");
  const note = page.locator(".scan-code__err");
  await expect(note).toHaveText(mk.t("scan.codeEmpty"));
  const describedBy = (await field.getAttribute("aria-describedby"))!.split(" ");
  expect(describedBy).toContain((await note.getAttribute("id"))!);
  await expect(field).toBeFocused();
  await expect(page.locator(".scan-miss")).toHaveCount(0);
});

test("axe finds nothing serious on the join screen, with the code field closed and open", async ({ page }) => {
  const field = await openCode(page);
  await expect(field).toBeVisible();
  const open = await new AxeBuilder({ page }).analyze();
  await page.goto("/app/join");
  await expect(page.locator(".join-cta")).toBeVisible();
  const closed = await new AxeBuilder({ page }).analyze();
  for (const r of [open, closed]) expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
