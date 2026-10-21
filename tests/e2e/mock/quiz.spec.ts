import { expect, mk, test } from "../fixtures";
import type { Page } from "@playwright/test";

// The scripted lesson paces itself on real timers (about three minutes); a controlled clock skips the waiting.
const OPTION = ".q-opt, .q-tf__btn";
const stage = (page: Page) => page.locator("main.q").getAttribute("data-stage");

/** Play on: answer whatever is asked, and let the clock run, until `done`. */
async function playUntil(page: Page, done: () => Promise<boolean>, seen = new Set<string>()) {
  const option = page.locator(OPTION).first();
  let answered = 0;
  for (let i = 0; i < 300 && !(await done()); i++) {
    const s = await stage(page).catch(() => null);
    if (s) seen.add(s);
    if (await option.isVisible()) {
      await option.click();
      answered++;
    }
    await page.clock.fastForward(1_500);
    await page.waitForTimeout(40);
  }
  return { answered, seen };
}

test("a whole lesson: answer every question, see each verdict, the ending and the summary", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/MATH-7B");
  await expect(page.getByText(mk.q("q.live"))).toBeVisible();

  const ended = page.getByRole("heading", { name: mk.q("q.ended.title") });
  const { answered, seen } = await playUntil(page, () => ended.isVisible());

  expect(answered).toBe(5);
  seen.add((await stage(page)) ?? "");
  // Every state of the student's lesson came by (spec 4.4).
  for (const s of ["joined", "waiting_start", "answering", "waiting_others", "waiting_next", "ended"]) expect(seen, s).toContain(s);
  expect(seen.has("right") || seen.has("wrong")).toBe(true);

  // The ending: the tally, the place, the points, and the way to the summary.
  await expect(page.getByText(/од 5 точни/)).toBeVisible();
  await expect(page.getByText(mk.q("q.place"))).toBeVisible();
  await expect(page.getByText(mk.q("q.total"))).toBeVisible();
  await page.getByRole("link", { name: mk.q("q.ended.summary") }).click();
  await expect(page).toHaveURL(/\/app\/summary\/mock-session-math/);
  await expect(page.getByText("Линеарни равенки")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(5);

  // The first answer unlocks its achievement, right or wrong; Home's latest result is this lesson.
  await page.goto("/app/achievements");
  const first = page.getByRole("listitem").filter({ hasText: mk.t("ach.answer.title") });
  await expect(first).toContainText(mk.t("ach.unlocked"));
});

test("the verdict, the ranking and the next question come one after the other", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/MATH-7B");
  await expect(page.getByText(mk.q("q.live"))).toBeVisible();

  const option = page.locator(OPTION).first();
  for (let i = 0; i < 40 && !(await option.isVisible()); i++) {
    await page.clock.fastForward(1_000);
    await page.waitForTimeout(30);
  }
  await expect(page.getByRole("timer")).toBeVisible();
  await option.click();
  // Locked in: the answer, and the class's progress.
  await expect(page.getByText(mk.q("q.locked"))).toBeVisible();
  await expect(page.getByText(/од 28 одговорија/)).toBeVisible();

  const verdict = page.getByRole("heading", { name: new RegExp(`^(${mk.q("q.right")}|${mk.q("q.wrong")})$`) });
  for (let i = 0; i < 40 && !(await verdict.isVisible()); i++) {
    await page.clock.fastForward(1_000);
    await page.waitForTimeout(30);
  }
  await expect(verdict).toBeVisible();
  await expect(page.getByText(mk.q("q.total"))).toBeVisible();

  for (let i = 0; i < 20 && !(await page.getByRole("list", { name: mk.q("q.board") }).isVisible()); i++) {
    await page.clock.fastForward(1_000);
    await page.waitForTimeout(30);
  }
  await expect(page.getByText(mk.q("q.place"))).toBeVisible();
  await expect(page.getByRole("list", { name: mk.q("q.board") })).toBeVisible();
  await expect(page.getByText(mk.q("q.next"))).toBeVisible();
});

test("the countdown follows the server's clock, which the demo runs a few seconds ahead of the phone's", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/MATH-7B");
  const option = page.locator(OPTION).first();
  for (let i = 0; i < 40 && !(await option.isVisible()); i++) {
    await page.clock.fastForward(500);
    await page.waitForTimeout(30);
  }
  const label = (await page.getByRole("timer").getAttribute("aria-label")) ?? "";
  const seconds = Number(label.match(/\d+/)?.[0]);
  // A 20-second question, some seconds in (the suite runs in parallel, so not exactly how many): if the app
  // used the phone's clock it would say 23 or 24, more than the question is long.
  expect(seconds).toBeGreaterThanOrEqual(10);
  expect(seconds).toBeLessThanOrEqual(20);
});

test("a connection that drops mid-question is noticed, and the screen catches up when it returns", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/FLAKY-7B");
  const option = page.locator(OPTION).first();
  for (let i = 0; i < 40 && !(await option.isVisible()); i++) {
    await page.clock.fastForward(500);
    await page.waitForTimeout(30);
  }
  // Not answering: 12 seconds in, the link drops.
  const lost = page.getByText(mk.q("net.reconnecting"));
  for (let i = 0; i < 40 && !(await lost.isVisible()); i++) {
    await page.clock.fastForward(1_000);
    await page.waitForTimeout(30);
  }
  await expect(lost).toBeVisible();

  // It retries by itself; the question closed and the next may have opened while it was gone.
  for (let i = 0; i < 60 && (await lost.isVisible()); i++) {
    await page.clock.fastForward(1_000);
    await page.waitForTimeout(30);
  }
  await expect(lost).toBeHidden();
  await expect(page.getByText(mk.q("net.back"))).toBeVisible();
  const { answered } = await playUntil(page, async () => (await stage(page)) === "waiting_next" || (await stage(page)) === "ended");
  void answered;
  await expect(page.locator("main.q")).not.toHaveAttribute("data-stage", "syncing");
});

test("the quiz carries on after a reload, with the code the page was opened with", async ({ page }) => {
  await page.goto("/app/checkin/MATH-7B");
  await expect(page.getByText(mk.q("q.live"))).toBeVisible();
  await page.reload();
  await expect(page.getByText(mk.q("q.live"))).toBeVisible();
  await expect(page).toHaveURL(/\/app\/play\/MATH-7B$/);
});

test("leaving the quiz asks first", async ({ page }) => {
  await page.goto("/app/checkin/MATH-7B");
  await page.getByRole("button", { name: mk.q("q.leave") }).click();

  const sheet = page.getByRole("dialog", { name: mk.q("q.leaveTitle") });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: mk.q("q.leaveConfirm") }).click();
  await expect(page).not.toHaveURL(/\/app\/play\//);
});
