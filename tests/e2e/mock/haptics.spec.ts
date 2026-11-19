import { expect, mk, test, untilStage } from "../fixtures";
import type { Page } from "@playwright/test";

/** Step 7: haptics on rewards only. `navigator.vibrate` is replaced by a recorder; Chromium's own is not touched by the tests. */
const OPTION = ".q-opt, .q-tf__btn";
const stage = (page: Page) => page.locator("main.q").getAttribute("data-stage");
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __buzz: unknown[] }).__buzz);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const log: unknown[] = [];
    (window as unknown as { __buzz: unknown[] }).__buzz = log;
    navigator.vibrate = (p) => (log.push(p), true);
  });
});

async function playTo(page: Page, until: (s: string | null) => boolean, pick = 0) {
  for (let i = 0; i < 400; i++) {
    const s = await stage(page).catch(() => null);
    if (until(s)) return s;
    if (s === "answering") {
      const number = page.locator(".n-input");
      if (await number.isVisible()) {
        await number.fill("3,25");
        await number.press("Enter");
      } else {
        await page.locator(OPTION).nth(Math.min(pick, (await page.locator(OPTION).count()) - 1)).click();
      }
    }
    await page.clock.fastForward(1_000);
    await page.waitForTimeout(30);
  }
  throw new Error("the quiz never reached the stage");
}

test("tab taps, the bell, presses and navigation do not vibrate", async ({ page }) => {
  await page.goto("/app");
  const tabs = page.getByRole("navigation", { name: mk.t("nav.main") });
  await tabs.getByRole("link", { name: mk.t("nav.scan") }).click();
  await expect(page).toHaveURL(/\/app\/join$/);
  await tabs.getByRole("link", { name: mk.t("nav.profile") }).click();
  await tabs.getByRole("link", { name: mk.t("nav.home") }).click();
  await page.locator(".home-bar").getByRole("link", { name: mk.t("notif.title") }).click();
  await expect(page).toHaveURL(/\/app\/notifications$/);
  expect(await calls(page)).toEqual([]);
});

test("a wrong answer is one light tick", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/MATH-7B");
  await page.mouse.click(5, 5); // a gesture, as a real phone has had by now
  await untilStage(page, "answering");
  await untilStage(page, "wrong"); // no answer: the time runs out
  await page.clock.fastForward(300);
  expect(await calls(page)).toEqual([20]);
});

test("the end of a lesson vibrates once", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/MATH-7B");
  await page.mouse.click(5, 5);
  await playTo(page, (s) => s === "ended");
  await page.clock.fastForward(1_000);
  const all = await calls(page);
  expect(all.filter((p) => JSON.stringify(p) === "[20,40,30]")).toHaveLength(1);
  expect(all.filter((p) => JSON.stringify(p) === "[18,60,28]").length).toBeLessThanOrEqual(4);
});

test("a right practice answer and the finished set vibrate once each", async ({ page }) => {
  await page.goto("/app/practice/ps-session-math-1");
  const pick = async (index: number) => {
    await page.locator(".q-opt, .q-tf__btn").nth(index).click();
    await page.getByRole("button", { name: mk.t("pr.check") }).click();
  };
  await pick(1);
  await expect(page.locator(".pr-mark .q-burst")).toHaveCount(1);
  expect(await calls(page)).toEqual([14, [18, 60, 28]]);
  await page.getByRole("button", { name: mk.t("pr.next") }).click();
  await pick(0);
  await page.getByRole("button", { name: mk.t("pr.next") }).click();
  await pick(0);
  await page.getByRole("button", { name: mk.t("pr.next") }).click();
  await page.locator(".n-input").fill("15,0");
  await page.locator(".n-input").press("Enter");
  await page.getByRole("button", { name: mk.t("pr.result") }).click();
  await expect(page.getByRole("heading", { name: mk.t("pr.done.score", { score: 4, total: 4 }) })).toBeVisible({ timeout: 5_000 });
  const all = await calls(page);
  expect(all.filter((p) => JSON.stringify(p) === "[20,40,30]")).toHaveLength(1);
  // Four right answers in a row: each one buzzes once, so a ref guard must not outlive its question.
  expect(all.filter((p) => JSON.stringify(p) === "[18,60,28]")).toHaveLength(4);
});

test("a new badge vibrates once", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/MATH-7B");
  await page.mouse.click(5, 5);
  await playTo(page, (s) => s === "ended");
  // A new document starts without a gesture, so go the way a student does: open Profile, tap, and follow the row.
  await page.goto("/app/profile");
  await page.getByRole("link", { name: mk.t("drawer.achievements") }).click();
  await expect(page.locator(".unlock").first()).toBeVisible();
  // The buzz waits for the badge's pop (250 ms after the commit), so the badge can be visible before it; wait for the buzz
  // instead of reading once, then give a second one time to show up, since the promise is exactly one.
  const badge = async () => (await calls(page)).filter((p) => JSON.stringify(p) === "[16,50,16]").length;
  await expect.poll(badge, { timeout: 10_000 }).toBe(1);
  await page.waitForTimeout(500);
  expect(await badge()).toBe(1);
});

test.describe("without the stub", () => {
  test("Chromium's own vibrate logs nothing before the first tap", async ({ page }) => {
    // The fixture fails the test on any console error; this one only has to load and answer.
    await page.addInitScript(() => delete (navigator as unknown as { vibrate?: unknown }).vibrate); // back to the browser's own
    await page.goto("/app/practice/ps-session-math-1");
    await page.locator(".q-opt, .q-tf__btn").nth(1).click();
    await page.getByRole("button", { name: mk.t("pr.check") }).click();
    await expect(page.locator(".pr-mark .q-burst")).toHaveCount(1);
  });
});
