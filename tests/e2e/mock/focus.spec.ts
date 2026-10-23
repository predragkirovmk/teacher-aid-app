import { expect, mk, test, untilStage } from "../fixtures";
import type { Page } from "@playwright/test";

/**
 * The web focus flag (spec 7.10, BR-FOC-01). FOCUS-7B is the maths lesson from the lobby into a first question that lasts a
 * minute. A student leaving is simulated the way the browser would say it: `visibilitychange` with the page hidden, and the
 * window's `blur`. What the mock's teacher console received is kept in localStorage.
 */
type Entry = { type: string; at: number; sessionQuestionId: string; flagged: boolean };
const heard = async (page: Page) =>
  (JSON.parse((await page.evaluate(() => localStorage.getItem("teacheraid-mock-console"))) ?? "{}") as { focus?: Entry[] }).focus ?? [];

const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", { value: h ? "hidden" : "visible", configurable: true });
    Object.defineProperty(document, "hidden", { value: h, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

/** What the screen holds apart from the countdown, which moves by itself. */
const shape = (page: Page) =>
  page.locator("main.q").evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelector(".q-ring")?.remove();
    return copy.innerHTML;
  });

/** Let the clock run and the mock's promises settle. */
const wait = async (page: Page, ms: number) => {
  await page.clock.fastForward(ms);
  await page.waitForTimeout(60);
};

test("the lobby tells the student once, as part of the page and not a dialog, and the first question is not delayed", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/FOCUS-7B");
  await untilStage(page, "waiting_start");
  await expect(page.getByRole("note")).toContainText(mk.q("fair.note"));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The lobby still asks nothing of the student and the lesson starts on its own time.
  await expect(page.getByText(mk.q("q.waitTeacher"))).toBeVisible();
  await untilStage(page, "answering");

  // Said once: a new visit on the same phone does not say it again.
  await page.goto("/app/checkin/FOCUS-7B");
  await untilStage(page, "waiting_start");
  await expect(page.getByRole("note")).toHaveCount(0);
});

test("leaving during the question is recorded, with the way back, and nothing on the student's screen changes", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/FOCUS-7B");
  await untilStage(page, "answering");
  const before = await shape(page);

  await setHidden(page, true);
  await wait(page, 4_000);
  // Confirmed while the student is still away, so the teacher sees it at once.
  await expect.poll(() => heard(page)).toHaveLength(1);
  expect((await heard(page))[0]).toMatchObject({ type: "lost", flagged: true });
  // Nobody is blocked or told off: the same screen, no alert.
  await expect(page.locator("[role=alert]").filter({ hasText: /\S/ })).toHaveCount(0);
  await expect(page.locator(".toast")).toHaveCount(0);
  await expect(page.locator("main.q")).toHaveAttribute("data-stage", "answering");

  await setHidden(page, false);
  await wait(page, 500);
  await expect.poll(async () => (await heard(page)).map((f) => f.type)).toEqual(["lost", "back"]);
  const [lost, back] = await heard(page);
  expect(lost.sessionQuestionId).toBe(back.sessionQuestionId);
  expect(back.at - lost.at).toBeGreaterThanOrEqual(4_000);
  expect(await shape(page)).toBe(before);

  // And the student can still answer.
  await page.locator(".q-opt, .q-tf__btn").first().click();
  await expect(page.getByText(mk.q("q.locked"))).toBeVisible();
});

test("the window losing focus counts like the page being hidden", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/FOCUS-7B");
  await untilStage(page, "answering");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await wait(page, 4_000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await wait(page, 500);
  await expect.poll(async () => (await heard(page)).map((f) => f.type)).toEqual(["lost", "back"]);
});

test("a flicker shorter than the threshold is nothing: the notification shade", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/FOCUS-7B");
  await untilStage(page, "answering");
  await setHidden(page, true);
  await wait(page, 1_000);
  await setHidden(page, false);
  await wait(page, 5_000);
  expect(await heard(page)).toEqual([]);
});

test("leaving between questions is not recorded", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/FOCUS-7B");
  // Before the first question: the lobby.
  await untilStage(page, "waiting_start");
  await setHidden(page, true);
  await wait(page, 5_000);
  await setHidden(page, false);
  await wait(page, 200);
  expect(await heard(page)).toEqual([]);

  // After a question: answer it, wait for the result and the pause before the next.
  await untilStage(page, "answering");
  await page.locator(".q-opt, .q-tf__btn").first().click();
  await untilStage(page, "waiting_next");
  await setHidden(page, true);
  await wait(page, 5_000);
  await setHidden(page, false);
  await wait(page, 200);
  expect(await heard(page)).toEqual([]);
});

test("a student who joined in the middle of a question has not been told yet, so nothing is recorded until they have", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/LATE-7B");
  await untilStage(page, "answering");
  await expect(page.getByRole("note")).toHaveCount(0);
  await setHidden(page, true);
  await wait(page, 5_000);
  await setHidden(page, false);
  await wait(page, 200);
  expect(await heard(page)).toEqual([]);

  // Between questions the line is there for them, and from then on it counts.
  await page.locator(".q-opt, .q-tf__btn").first().click();
  await untilStage(page, "waiting_next");
  await expect(page.getByRole("note")).toContainText(mk.q("fair.note"));
  await untilStage(page, "answering");
  await setHidden(page, true);
  await wait(page, 4_000);
  await expect.poll(() => heard(page)).toHaveLength(1);
});

test("the English line says the same", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("teacheraid-locale", "en"));
  await page.clock.install();
  await page.goto("/app/checkin/FOCUS-7B");
  await untilStage(page, "waiting_start");
  await expect(page.getByRole("note")).toContainText("your teacher sees that you were away, but not where you went");
});
