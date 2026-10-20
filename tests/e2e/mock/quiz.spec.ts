import { expect, mk, test } from "../fixtures";

test("answering a quiz runs to the result and keeps the points", async ({ page }) => {
  // The demo teacher paces the quiz on real timers (about a minute); a controlled clock skips the waiting.
  await page.clock.install();
  await page.goto("/app/checkin/MATH-7B");
  await expect(page.getByText(mk.q("q.live"))).toBeVisible();

  const home = page.getByRole("button", { name: mk.q("q.home") });
  const option = page.locator(".q-opt, .q-tf__btn").first();
  let answered = 0;
  for (let i = 0; i < 200 && !(await home.isVisible()); i++) {
    if (await option.isVisible()) {
      await option.click();
      answered++;
    }
    await page.clock.fastForward(1_500);
    await page.waitForTimeout(40);
  }

  await expect(page.getByText(mk.q("q.last"))).toBeVisible();
  await expect(page.getByRole("list", { name: mk.q("q.board") })).toBeVisible();
  expect(answered).toBe(5);

  await home.click();
  await expect(page).toHaveURL(/\/app$/);

  // The first answer unlocks its achievement, right or wrong.
  await page.goto("/app/achievements");
  const first = page.getByRole("listitem").filter({ hasText: mk.t("ach.answer.title") });
  await expect(first).toContainText(mk.t("ach.unlocked"));
});

test("leaving the quiz asks first", async ({ page }) => {
  await page.goto("/app/checkin/MATH-7B");
  await page.getByRole("button", { name: mk.q("q.leave") }).click();

  const sheet = page.getByRole("dialog", { name: mk.q("q.leaveTitle") });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: mk.q("q.leaveConfirm") }).click();
  await expect(page).not.toHaveURL(/\/app\/play\//);
});
