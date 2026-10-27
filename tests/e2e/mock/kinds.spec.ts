import { expect, mk, en, start, test, untilStage } from "../fixtures";
import type { Page } from "@playwright/test";

/**
 * The question kinds beyond multiple choice and true or false: the numeric answer (there is no opener, 2026-10-27). The mock
 * has a code that jumps straight to it (lib/app/api/mock/session.ts): NUMERIC-7B (physics, a decimal with a minus, a unit
 * and a tolerance).
 */
const OPTION = ".q-opt, .q-tf__btn";

test.describe("a numeric answer", () => {
  const field = (page: Page) => page.getByLabel(mk.q("n.label"));

  test("asks the phone for its decimal pad, shows the unit, and takes a comma and a minus", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/NUMERIC-7B");
    await untilStage(page, "answering");
        await expect(field(page)).toHaveAttribute("inputmode", "decimal");
    await expect(field(page)).toHaveAttribute("enterkeyhint", "send");
    await expect(field(page)).toBeFocused();
    await expect(page.locator(".n-unit")).toHaveText("m/s²");
    await expect(page.getByText(mk.q("n.hintUnit", { unit: "m/s²" }))).toBeVisible();

    // The minus key sits beside the field, because the phone's decimal pad has none.
    const minus = page.getByRole("button", { name: mk.q("n.minus") });
    await minus.click();
    await expect(field(page)).toHaveValue("-");
    await field(page).press("End");
    await page.keyboard.type("2,5");
    await expect(field(page)).toHaveValue("-2,5");
    await minus.click();
    await expect(field(page)).toHaveValue("2,5");
  });

  test("says what is wrong in words: nothing typed, not a number", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/NUMERIC-7B");
    await untilStage(page, "answering");
    const lock = page.getByRole("button", { name: mk.q("n.lock") });
    await lock.click();
    await expect(page.getByRole("alert").filter({ hasText: mk.q("n.err.empty") })).toBeVisible();
    await expect(field(page)).toHaveAttribute("aria-invalid", "true");

    const before = await lock.boundingBox();
    await field(page).fill("abc");
    await expect(page.locator(".n-err")).toHaveCount(0);
    await field(page).press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: mk.q("n.err.nan") })).toBeVisible();
    // The lock button did not move when the problem came and went.
    expect(await lock.boundingBox()).toEqual(before);
    await field(page).fill("1.000,5");
    await field(page).press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: mk.q("n.err.nan") })).toBeVisible();
    // Nothing was sent: the question is still open.
    await expect(page.locator("main.q")).toHaveAttribute("data-stage", "answering");
  });

  test("a wrong number: the correct value with its unit, the student's own, and the tolerance, with an icon and a word", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/NUMERIC-7B");
    await untilStage(page, "answering");
    await field(page).fill("-3,6");
    await field(page).press("Enter");
    // Locked: the number as typed, in the student's script.
    await expect(page.getByText(mk.q("q.locked"))).toBeVisible();
    await expect(page.locator(".q-locked")).toContainText("−3,6 m/s²");

    await untilStage(page, "wrong");
    await expect(page.getByRole("heading", { name: mk.q("q.wrong") })).toBeVisible();
    await untilStage(page, "wrong"); // still the verdict, waiting for the reveal
    const correct = page.locator(".q-correct");
    await expect(correct).toContainText(mk.q("n.correctValue"));
    await expect(correct).toContainText("−2,5 m/s²");
    await expect(correct).toContainText(mk.q("n.tolerance", { tol: "0,1" }));
    await expect(page.getByText(mk.q("n.yours", { text: "−3,6 m/s²" }))).toBeVisible();
  });

  test("a number close enough is right, and says what the exact value is", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/NUMERIC-7B");
    await untilStage(page, "answering");
    await field(page).fill("-2,45");
    await field(page).press("Enter");
    await untilStage(page, "right");
    await expect(page.getByRole("heading", { name: mk.q("q.right") })).toBeVisible();
    await expect(page.getByText(mk.q("n.exactValue", { text: "−2,5 m/s²" }))).toBeVisible();
  });

  test("the point is the English separator, and the same answer is right either way", async ({ page }) => {
    await page.clock.install();
    await start(page, { locale: "en" });
    await page.goto("/app/checkin/NUMERIC-7B");
    await untilStage(page, "answering");
    await expect(page.getByText(en.q("n.hintUnit", { unit: "m/s²" }))).toBeVisible();
    await page.getByLabel(en.q("n.label")).fill("-2.5");
    await page.getByLabel(en.q("n.label")).press("Enter");
    await expect(page.locator(".q-locked")).toContainText("−2.5 m/s²");
    await untilStage(page, "right");
  });

  test("the lock button stays above the keypad: with the screen cut to what is left above it, nothing needs a scroll", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/NUMERIC-7B");
    await untilStage(page, "answering");
    // An installed app on an iPhone has about 430 points above the decimal pad.
    await page.setViewportSize({ width: 375, height: 430 });
    await expect(field(page)).toBeInViewport();
    await expect(page.getByRole("button", { name: mk.q("n.lock") })).toBeInViewport({ ratio: 1 });
  });

  test("a question with no minus does not offer the key, and refuses one typed", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/MATH-7B");
    // Play on to the maths lesson's numeric question: two pop-ups the test answers at once.
    for (let i = 0; i < 600 && !(await page.locator(".n-input").isVisible()); i++) {
      const s = await page.locator("main.q").getAttribute("data-stage").catch(() => null);
      if (s === "answering") await page.locator(OPTION).first().click();
      await page.clock.fastForward(1_000);
      await page.waitForTimeout(30);
    }
    await expect(page.locator(".n-input")).toBeVisible();
    await expect(page.getByRole("button", { name: mk.q("n.minus") })).toHaveCount(0);
    await expect(page.locator(".n-unit")).toHaveCount(0);
    await field(page).fill("-3,25");
    await field(page).press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: mk.q("n.err.negative") })).toBeVisible();
    // The decimal answer, with a comma, is right.
    await field(page).fill("3,25");
    await field(page).press("Enter");
    await untilStage(page, "right");
  });
});
