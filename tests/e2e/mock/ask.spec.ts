import { expect, mk, en, test, untilStage } from "../fixtures";
import type { Page } from "@playwright/test";

/**
 * A question to the teacher (F-09, US-S06). ASK-7B is the maths lesson with a limit of 2 questions (the usual
 * limit is 3). What the mock's teacher console received is kept in localStorage (lib/app/api/mock/session.ts).
 */
type Console = { asks: { text: string; sender: string }[] };
const received = async (page: Page) => JSON.parse((await page.evaluate(() => localStorage.getItem("teacheraid-mock-console"))) ?? "{}") as Console;
const entry = (page: Page) => page.getByRole("button", { name: mk.q("ask.entry") });
const sheet = (page: Page) => page.getByRole("dialog", { name: mk.q("ask.title") });
const box = (page: Page) => sheet(page).getByRole("textbox", { name: mk.q("ask.label") });

async function inLobby(page: Page) {
  await page.clock.install();
  await page.goto("/app/checkin/ASK-7B");
  await untilStage(page, "waiting_start");
}

test("the way to ask is quiet, the sheet says who sees the name, and the question reaches the teacher with it", async ({ page }) => {
  await inLobby(page);
  // A plain button, not the yellow one: it never competes with the answers.
  await expect(entry(page)).toBeVisible();
  await expect(entry(page)).toHaveClass(/btn--plain/);
  await entry(page).click();

  await expect(sheet(page)).toBeVisible();
  // The honest line: classmates do not see who asked, the teacher does. In words, before anything is typed.
  await expect(sheet(page).getByText(mk.q("ask.honest"))).toBeVisible();
  await expect(page.getByText(/анонимн/i)).toHaveCount(0);
  await expect(sheet(page).getByText(mk.q("ask.left.many", { n: 2 }))).toBeVisible();
  // The box has the keyboard, and its description is the honest line.
  await expect(box(page)).toBeFocused();
  await expect(box(page)).toHaveAccessibleDescription(mk.q("ask.honest"));

  await box(page).fill("  Може ли да го објасниш   повторно?  ");
  await sheet(page).getByRole("button", { name: mk.q("ask.send") }).click();
  await expect(sheet(page).getByRole("heading", { name: mk.q("ask.sent") })).toBeVisible();
  await expect(sheet(page).getByText(mk.q("ask.sentNote"))).toBeVisible();

  // The console has it with the sender; the text is cleaned.
  await expect.poll(async () => (await received(page)).asks).toEqual([{ text: "Може ли да го објасниш повторно?", sender: "student-marko", at: expect.any(Number) }]);

  // One left; ask another puts the box back, empty.
  await sheet(page).getByRole("button", { name: mk.q("ask.another") }).click();
  await expect(sheet(page).getByText(mk.q("ask.left.one"))).toBeVisible();
  await expect(box(page)).toHaveValue("");
});

test("Enter sends, an empty question is not sent, and the box stops at the limit", async ({ page }) => {
  await inLobby(page);
  await entry(page).click();
  await box(page).press("Enter");
  await expect(sheet(page).getByRole("alert")).toContainText(mk.q("ask.err.empty"));
  expect((await received(page)).asks).toHaveLength(0);

  await expect(box(page)).toHaveAttribute("maxlength", "280");
  await box(page).fill("ш".repeat(300));
  await expect(box(page)).toHaveValue("ш".repeat(280));
  await expect(sheet(page).locator(".o-count")).toHaveText("280/280");
  await box(page).fill("Кратко прашање");
  await expect(sheet(page).locator(".o-count")).toHaveCount(0);
  await box(page).press("Enter");
  await expect(sheet(page).getByRole("heading", { name: mk.q("ask.sent") })).toBeVisible();
});

test("the limit: two questions, then the sheet says there are no more, and still offers the way out", async ({ page }) => {
  await inLobby(page);
  await entry(page).click();
  await box(page).fill("Прво");
  await box(page).press("Enter");
  await sheet(page).getByRole("button", { name: mk.q("ask.another") }).click();
  await box(page).fill("Второ");
  await box(page).press("Enter");
  await expect(sheet(page).getByRole("heading", { name: mk.q("ask.sent") })).toBeVisible();
  // That was the last one.
  await expect(sheet(page).getByRole("button", { name: mk.q("ask.another") })).toHaveCount(0);
  await sheet(page).getByRole("button", { name: mk.q("ask.done") }).click();
  await expect(sheet(page)).toHaveCount(0);

  await entry(page).click();
  await expect(sheet(page).getByRole("heading", { name: mk.q("ask.limit.title") })).toBeVisible();
  await expect(sheet(page).getByText(mk.q("ask.limit.body"))).toBeVisible();
  await expect(sheet(page).getByRole("textbox")).toHaveCount(0);
  expect((await received(page)).asks.map((a) => a.text)).toEqual(["Прво", "Второ"]);
});

test("the way to ask is not on the screen while a question is open, and comes back after", async ({ page }) => {
  await inLobby(page);
  await untilStage(page, "voting");
  await expect(entry(page)).toHaveCount(0);
  await page.locator(".q-opt").nth(1).click();
  await untilStage(page, "reasoning");
  await expect(entry(page)).toHaveCount(0);
  await untilStage(page, "opener_result");
  await expect(entry(page)).toBeVisible();
  await untilStage(page, "answering");
  await expect(entry(page)).toHaveCount(0);
  await page.locator(".q-opt, .q-tf__btn").first().click();
  await expect(entry(page)).toHaveCount(0);
  await untilStage(page, "waiting_next");
  await expect(entry(page)).toBeVisible();
});

test("a sheet that is open when a question starts steps aside, says why, and keeps what was typed", async ({ page }) => {
  await inLobby(page);
  await entry(page).click();
  await box(page).fill("Нешто што не стигнав да го испратам");
  // The teacher starts the opener while the student is typing.
  await untilStage(page, "voting");
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator(".toast")).toContainText(mk.q("ask.paused"));
  // Nothing was sent.
  expect((await received(page)).asks).toHaveLength(0);

  await page.locator(".q-opt").nth(1).click();
  await untilStage(page, "opener_result");
  await entry(page).click();
  await expect(box(page)).toHaveValue("Нешто што не стигнав да го испратам");
});

test("a question written with no signal is saved, said so, and sent when the signal returns", async ({ page, context }) => {
  await inLobby(page);
  await entry(page).click();
  await context.setOffline(true);
  await expect(page.getByText(mk.q("net.offline"))).toBeVisible();
  await box(page).fill("Прашање без интернет");
  await box(page).press("Enter");
  await expect(sheet(page).getByRole("heading", { name: mk.q("ans.saved") })).toBeVisible();
  expect((await received(page)).asks ?? []).toHaveLength(0);
  // The one left is counted: it is not free to spend again.
  await sheet(page).getByRole("button", { name: mk.q("ask.another") }).click();
  await expect(sheet(page).getByText(mk.q("ask.left.one"))).toBeVisible();

  await context.setOffline(false);
  await expect.poll(async () => (await received(page)).asks.map((a) => a.text)).toEqual(["Прашање без интернет"]);
});

test("in English the same line is said, and the word anonymous is not", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("teacheraid-locale", "en"));
  await page.clock.install();
  await page.goto("/app/checkin/ASK-7B");
  await untilStage(page, "waiting_start");
  await page.getByRole("button", { name: en.q("ask.entry") }).click();
  const dialog = page.getByRole("dialog", { name: en.q("ask.title") });
  await expect(dialog.getByText("Your classmates won't see who asked. Your teacher sees your name.")).toBeVisible();
  await expect(page.getByText(/anonymous/i)).toHaveCount(0);
});

test("a lesson that ends with the sheet open says so, and takes no more", async ({ page }) => {
  await inLobby(page);
  // Run to the review, where nothing is asked of the student and the teacher is about to end the lesson.
  const last = page.getByText(mk.q("q.last"));
  for (let i = 0; i < 400 && !(await last.isVisible()); i++) {
    await page.clock.fastForward(2_000);
    await page.waitForTimeout(20);
    // A question open for the student is skipped through without answering.
  }
  await expect(last).toBeVisible();
  await entry(page).click();
  await box(page).fill("Последно прашање");
  // The review lasts a few seconds, then the teacher ends the lesson.
  await page.clock.fastForward(20_000);
  await page.waitForTimeout(50);
  await expect(sheet(page).getByRole("heading", { name: mk.q("ask.ended.title") })).toBeVisible();
  await expect(sheet(page).getByText(mk.q("ask.ended.body"))).toBeVisible();
});
