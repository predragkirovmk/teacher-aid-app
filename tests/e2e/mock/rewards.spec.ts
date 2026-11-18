import { expect, mk, test, untilStage } from "../fixtures";
import type { Page } from "@playwright/test";

/**
 * Step 5, the big moments: a right answer, a wrong one, the end of a lesson, a finished practice set and a new badge. The words and the
 * numbers must be the same as before; only the way they arrive changed. The scripted lesson runs on a controlled clock.
 */
const OPTION = ".q-opt, .q-tf__btn";
const stage = (page: Page) => page.locator("main.q").getAttribute("data-stage");
const animations = (page: Page, selector: string) =>
  page.evaluate((sel) => [...document.querySelectorAll(sel)].flatMap((el) => el.getAnimations().map((a) => (a as CSSAnimation).animationName)), selector);

/** Answer whatever is asked with option `pick` (a number is typed) and run the clock until `until` is the stage. */
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

test.describe("a verdict", () => {
  test("a right answer pops on the big spring with a ring and a burst; its words and points do not change", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/MATH-7B");
    let right = false;
    // Try each option in turn over the lesson's questions until one is right.
    for (let pick = 0; pick < 4 && !right; pick++) {
      await untilStage(page, "answering");
      const s = await playTo(page, (st) => st === "right" || st === "wrong", pick);
      right = s === "right";
      if (!right) await untilStage(page, "answering");
    }
    expect(right, "no question was answered right").toBe(true);

    await expect(page.getByRole("heading", { name: mk.q("q.right") })).toBeVisible();
    expect(await animations(page, ".q-badge")).toContain("q-badge-big");
    const ring = await page.locator(".q-badge-wrap").evaluate((el) => el.getAnimations({ subtree: true }).map((a) => (a as CSSAnimation).animationName));
    expect(ring).toContain("q-ring-pulse");
    await expect(page.locator(".q-burst i")).toHaveCount(12);
    // The points roll up to their final value, and the total is the same figure as always.
    await page.clock.fastForward(1_200);
    const gain = Number((await page.locator(".q-gain").textContent())!.replace("+", ""));
    expect(gain).toBeGreaterThan(0);
    await expect(page.getByText(mk.q("q.total"))).toBeVisible();
    // Nothing flies over the page's buttons or the timer.
    await expect(page.locator(".confetti")).toHaveCount(0);
    expect(await page.locator(".q-burst").evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  });

  test("a wrong answer dips and settles, with no shake and no confetti", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/MATH-7B");
    // No answer: the time runs out.
    await untilStage(page, "answering");
    await playTo(page, (s) => s === "wrong");
    await expect(page.getByRole("heading", { name: new RegExp(`^(${mk.q("q.wrong")}|${mk.q("q.timeout")})$`) })).toBeVisible();
    const names = await animations(page, ".q-badge");
    expect(names).toContain("q-dip");
    expect(names).not.toContain("q-badge-big");
    await expect(page.locator(".confetti, .q-burst")).toHaveCount(0);
  });
});

test("the next question is still answerable on time after a reward", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/MATH-7B");
  await untilStage(page, "answering");
  await playTo(page, (s) => s === "right" || s === "wrong");
  await untilStage(page, "answering");
  await expect(page.getByRole("timer")).toBeVisible();
  await page.locator(OPTION).first().click();
  await expect(page.getByText(mk.q("q.locked"))).toBeVisible();
});

test("the end of a lesson shows the same words, a confetti that leaves the page, and a new badge with its own", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/MATH-7B");
  await playTo(page, (s) => s === "ended");
  await expect(page.getByRole("heading", { name: mk.q("q.ended.title") })).toBeVisible();
  await expect(page.getByText(mk.q("q.place"))).toBeVisible();
  await expect(page.locator(".confetti")).toHaveCount(1);
  expect(await page.locator(".confetti i").count()).toBeGreaterThan(20);
  // The total reaches its value, then the confetti is taken out of the DOM.
  await page.clock.fastForward(2_500);
  await expect(page.locator(".confetti")).toHaveCount(0);
  expect(Number(await page.locator(".q-ended .q-big").textContent())).toBeGreaterThanOrEqual(0);

  await page.goto("/app/achievements");
  const first = page.getByRole("listitem").filter({ hasText: mk.t("ach.answer.title") });
  await expect(first).toContainText(mk.t("ach.unlocked"));
  await expect(first.locator(".unlock")).toHaveCount(1);
  expect(await animations(page, ".unlock")).toContain("unlock-pop");
  await expect(first.locator(".confetti")).toHaveCount(1);
  await page.clock.fastForward(2_500);
  await expect(page.locator(".confetti")).toHaveCount(0);
});

test("a finished practice set pops its check with confetti, then removes it", async ({ page }) => {
  await page.goto("/app/practice/ps-session-math-1");
  const pick = async (index: number) => {
    await page.locator(".q-opt, .q-tf__btn").nth(index).click();
    await page.getByRole("button", { name: mk.t("pr.check") }).click();
  };
  await pick(1);
  // The check of a right answer pops and carries a small burst.
  await expect(page.locator(".pr-mark .q-burst")).toHaveCount(1);
  await page.getByRole("button", { name: mk.t("pr.next") }).click();
  await pick(0);
  await page.getByRole("button", { name: mk.t("pr.next") }).click();
  await pick(0);
  await page.getByRole("button", { name: mk.t("pr.next") }).click();
  await page.locator(".n-input").fill("15,0");
  await page.locator(".n-input").press("Enter");
  await page.getByRole("button", { name: mk.t("pr.result") }).click();
  await expect(page.getByRole("heading", { name: mk.t("pr.done.score", { score: 4, total: 4 }) })).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".confetti")).toHaveCount(1);
  await expect(page.locator(".confetti")).toHaveCount(0, { timeout: 4_000 });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the ending has no confetti and its total is final at once", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/MATH-7B");
    await playTo(page, (s) => s === "ended");
    await expect(page.getByRole("heading", { name: mk.q("q.ended.title") })).toBeVisible();
    await expect(page.locator(".confetti")).toHaveCount(0);
    const big = page.locator(".q-ended .q-big");
    const now = await big.textContent();
    await page.clock.fastForward(2_500);
    await expect(big).toHaveText(now!);
    expect(await animations(page, ".q-land, .q-badge, .q-badge-wrap")).not.toContain("q-land");
  });

  test("a finished practice set and a new badge show no confetti", async ({ page }) => {
    await page.goto("/app/achievements");
    await expect(page.locator(".confetti")).toHaveCount(0);
    await page.goto("/app/practice/ps-session-math-1");
    await page.locator(".q-opt").nth(1).click();
    await page.getByRole("button", { name: mk.t("pr.check") }).click();
    await expect(page.getByRole("status").filter({ hasText: mk.t("pr.right") })).toBeVisible();
    await expect(page.locator(".confetti")).toHaveCount(0);
  });
});
