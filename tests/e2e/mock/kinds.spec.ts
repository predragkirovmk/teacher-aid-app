import { CLASSMATES } from "@/lib/app/api/mock/quiz";
import { expect, mk, en, start, test, untilStage } from "../fixtures";
import type { Page } from "@playwright/test";

/**
 * The question kinds beyond multiple choice and true or false: the opener (a vote, one line of reason, the
 * class's votes and reasons) and the numeric answer. The mock has a code for each that jumps straight to it
 * (lib/app/api/mock/session.ts): OPENER-7B (maths, a prediction), DEBATE-7B (English, a claim with no right
 * side), NUMERIC-7B (physics, a decimal with a minus, a unit and a tolerance).
 */
const OPTION = ".q-opt, .q-tf__btn";
const reasonBox = (page: Page) => page.getByRole("textbox");

test.describe("the opener", () => {
  test("a vote, a reason, then the class's votes and reasons, with the points for each", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/OPENER-7B");
    await untilStage(page, "voting");
    await expect(page.getByText(mk.q("o.tag.prediction"))).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("удвојуваш");
    await expect(page.getByRole("timer")).toBeVisible();

    // The right one is "stays the same". Voting is final: the vote is locked and the reason opens at once.
    await page.locator(OPTION).nth(1).click();
    await untilStage(page, "reasoning");
    await expect(page.getByText(mk.q("o.voteLocked"))).toBeVisible();
    await expect(page.locator(".o-vote")).toContainText("Останува исто");
    await expect(page.locator(".o-bars")).toHaveCount(0);

    // One line, 80 characters: the box stops there and says how much is left.
    await expect(reasonBox(page)).toHaveAttribute("maxlength", "80");
    await reasonBox(page).fill("x".repeat(120));
    await expect(reasonBox(page)).toHaveValue("x".repeat(80));
    await expect(page.locator(".o-count")).toHaveText("80/80");
    await reasonBox(page).fill("Исто нешто на двете страни не ја менува рамнотежата.");
    await reasonBox(page).press("Enter");

    // Sent: it waits for the class, and the votes appear once voting has closed.
    await untilStage(page, "opener_wait");
    await expect(page.locator(".o-own")).toContainText("Исто нешто на двете страни");
    await expect(page.locator(".o-bars")).toBeVisible();
    await expect(page.locator(".o-bar")).toHaveCount(3);

    // The result: right vote, 10 for it and 8 for the reason, and the class's votes with the right answer and the student's marked in words.
    await untilStage(page, "opener_result");
    await expect(page.getByRole("heading", { name: mk.q("q.right") })).toBeVisible();
    await expect(page.locator(".o-chips")).toContainText(mk.q("o.pts.vote", { n: 10 }));
    await expect(page.locator(".o-chips")).toContainText(mk.q("o.pts.reason", { n: 8 }));
    await expect(page.locator(".q-total .q-big")).toHaveText("18");
    await expect(page.locator('.o-bar[data-right="true"] .o-tag--right')).toContainText(mk.q("q.correctAnswer"));
    await expect(page.locator(".o-bar .o-tag").filter({ hasText: mk.q("o.yourVote") })).toHaveCount(1);

    // The reasons arrive with the reveal, anonymous.
    const reasons = page.locator(".o-reason");
    await expect(reasons.first()).toBeVisible();
    const shown = (await page.locator(".o-reasons").innerText()).toLowerCase();
    for (const name of CLASSMATES) expect(shown, name).not.toContain(name.split(" ")[0].toLowerCase());
    await expect(page.getByText(mk.q("o.anon"))).toBeVisible();

    // And the lesson goes on to its first question.
    await untilStage(page, "answering");
    await expect(page.getByText(mk.q("q.progress", { n: 1, total: 5 }))).toBeVisible();
  });

  test("a wrong vote still earns the reason's points", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/OPENER-7B");
    await untilStage(page, "voting");
    await page.locator(OPTION).nth(0).click();
    await untilStage(page, "reasoning");
    await reasonBox(page).fill("Мислам дека се удвојува.");
    await page.getByRole("button", { name: mk.q("o.send") }).click();
    await untilStage(page, "opener_result");
    await expect(page.getByRole("heading", { name: mk.q("q.wrong") })).toBeVisible();
    await expect(page.getByText(mk.q("o.voteWrongReason"))).toBeVisible();
    await expect(page.locator(".o-chips")).toContainText(mk.q("o.pts.reason", { n: 8 }));
    await expect(page.locator(".o-chips")).not.toContainText(mk.q("o.pts.vote", { n: 10 }));
    await expect(page.locator(".q-total .q-big")).toHaveText("8");
  });

  test("an empty reason is not sent, and says so in words", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/OPENER-7B");
    await untilStage(page, "voting");
    await page.locator(OPTION).nth(1).click();
    await untilStage(page, "reasoning");
    await page.getByRole("button", { name: mk.q("o.send") }).click();
    await expect(page.getByRole("alert").filter({ hasText: mk.q("o.err.empty") })).toBeVisible();
    await expect(page.locator("main.q")).toHaveAttribute("data-stage", "reasoning");
    // Typing clears it.
    await reasonBox(page).fill("Бидејќи.");
    await expect(page.getByRole("alert").filter({ hasText: mk.q("o.err.empty") })).toHaveCount(0);
  });

  test("a debate has two sides and no right one: the student's side, the split and only the reason's points", async ({ page }) => {
    await page.clock.install();
    await start(page, { locale: "en" });
    await page.goto("/app/checkin/DEBATE-7B");
    await untilStage(page, "voting");
    await expect(page.getByText(en.q("o.tag.debate"))).toBeVisible();
    await expect(page.locator(".q-tf__btn")).toHaveCount(2);
    await page.getByRole("button", { name: en.q("o.disagree") }).click();
    await untilStage(page, "reasoning");
    await expect(page.getByText(en.q("o.reasonHint.debate"))).toBeVisible();
    // The reason can be skipped, and then the class's split is the screen.
    await page.getByRole("button", { name: en.q("o.skip") }).click();
    await untilStage(page, "opener_wait");
    await expect(page.getByText(en.q("o.reasonSkipped"))).toBeVisible();
    await expect(page.locator(".o-bar")).toHaveCount(2);

    await untilStage(page, "opener_result");
    await expect(page.getByRole("heading", { name: en.q("o.side.disagree") })).toBeVisible();
    await expect(page.getByText(en.q("o.noRight"))).toBeVisible();
    // No right or wrong anywhere, and no points for a side.
    await expect(page.locator(".o-tag--right")).toHaveCount(0);
    await expect(page.locator(".o-chips")).toHaveCount(0);
    await expect(page.locator(".q-total .q-big")).toHaveText("0");
    await expect(page.locator(".o-bar .o-tag").filter({ hasText: en.q("o.yourVote") })).toHaveCount(1);
  });

  test("a student who does not vote is told so and gets nothing", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/OPENER-7B");
    await untilStage(page, "voting");
    await untilStage(page, "opener_wait");
    await expect(page.getByText(mk.q("o.missed"))).toBeVisible();
    await untilStage(page, "opener_result");
    await expect(page.getByRole("heading", { name: mk.q("o.noVote") })).toBeVisible();
    await expect(page.locator(".q-total .q-big")).toHaveText("0");
  });
});

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
    // Play on to the maths lesson's numeric question: the opener, then two pop-ups the test answers at once.
    for (let i = 0; i < 600 && !(await page.locator(".n-input").isVisible()); i++) {
      const s = await page.locator("main.q").getAttribute("data-stage").catch(() => null);
      if (s === "voting" || s === "answering") await page.locator(OPTION).first().click();
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
