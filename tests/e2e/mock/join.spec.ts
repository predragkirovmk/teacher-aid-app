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

test("the button's focus ring is a visible white pill, drawn over the halo", async ({ page }) => {
  await page.goto("/app/join");
  const cta = page.locator(".join-cta");
  await page.keyboard.press("Tab");
  await cta.focus();
  const style = await cta.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: s.outlineColor, width: s.outlineWidth, style: s.outlineStyle, radius: s.borderRadius, halo: getComputedStyle(el.querySelector(".join-cta__halo")!).zIndex };
  });
  expect(style).toEqual({ outline: "rgb(255, 255, 255)", width: "3px", style: "solid", radius: "36px", halo: "-1" });
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

/** Wait for the arrival animations (the rise, the field's) to end: a fade in progress shows a half-faded button to axe and moves things a few pixels. The button's idle never ends, so it is left out. */
const settled = (page: import("@playwright/test").Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getComputedTiming().iterations === Infinity || a.playState === "finished"));

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

test("the six-digit code a teacher shows joins, typed with its space, and a reload stays in the lesson", async ({ page }) => {
  const field = await openCode(page);
  await expect(page.getByText(mk.t("scan.codeHint"))).toHaveText("Шест бројки, на пример 482 913");
  await field.fill("482 913");
  await field.press("Enter");
  await expect(page).toHaveURL(/\/app\/play\/482913$/);
  await expect(page.getByText(mk.q("q.live"))).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/app\/play\/482913$/);
  await expect(page.getByText(mk.q("q.live"))).toBeVisible();
});

test("five digits say the code has six", async ({ page }) => {
  const field = await openCode(page);
  await field.fill("48291");
  await field.press("Enter");
  await expect(page.locator(".scan-code__err")).toHaveText(mk.t("scan.codeBad"));
  await expect(page.locator(".scan-code__err")).toContainText("шест бројки");
});

test("a typed TA: tag joins the code in it, not the tag", async ({ page }) => {
  const field = await openCode(page);
  await field.fill("ta:math-7b");
  await field.press("Enter");
  await expect(page).toHaveURL(/\/app\/play\/MATH-7B$/);
});

test("a code nobody issued shows the Miss sheet above the tab bar, and dismissing it returns the focus to the field", async ({ page }) => {
  const field = await openCode(page);
  await field.fill("NOPE-9");
  await field.press("Enter");
  const sheet = page.locator(".scan-miss");
  await expect(sheet).toContainText(mk.q("q.fail.unknown.title"));
  await expect(page).toHaveURL(/\/app\/join$/);
  const [s, dock] = await Promise.all([sheet.boundingBox(), page.locator(".dock").boundingBox()]);
  expect(s!.y + s!.height).toBeLessThanOrEqual(dock!.y);
  await page.getByRole("button", { name: mk.t("join.again") }).click();
  await expect(sheet).toHaveCount(0);
  await expect(field).toBeFocused();
});

test("the button does not move when the code field opens, with or without its message", async ({ page }) => {
  await start(page, {});
  await page.goto("/app/join");
  await settled(page);
  const cta = page.locator(".join-cta");
  const y = (await cta.boundingBox())!.y;
  await page.getByRole("button", { name: mk.t("scan.code") }).click();
  const field = page.getByRole("textbox", { name: mk.t("scan.codeLabel") });
  await field.press("Enter");
  await expect(page.locator(".scan-code__err")).toBeVisible();
  await settled(page);
  expect(Math.abs((await cta.boundingBox())!.y - y)).toBeLessThan(0.5);
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
  await settled(page);
  const open = await new AxeBuilder({ page }).analyze();
  await page.goto("/app/join");
  await expect(page.locator(".join-cta")).toBeVisible();
  await settled(page);
  const closed = await new AxeBuilder({ page }).analyze();
  for (const r of [open, closed]) expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

test("the code field groups six digits as the teacher's screen does, and keeps the caret", async ({ page }) => {
  await start(page, {});
  await page.goto("/app/join");
  await page.getByRole("button", { name: mk.t("scan.code") }).click();
  const field = page.getByRole("textbox", { name: mk.t("scan.codeLabel") });
  await field.pressSequentially("4829");
  await expect(field).toHaveValue("482 9");
  await field.press("ArrowLeft", { delay: 0 });
  await field.press("ArrowLeft");
  await field.press("ArrowLeft");
  await field.pressSequentially("7");
  await expect(field).toHaveValue("487 29");
  await field.pressSequentially("1");
  await expect(field).toHaveValue("487 129");
  await field.fill("MATH-7B");
  await expect(field).toHaveValue("MATH-7B");
});
