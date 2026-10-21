import { expect, mk, en, test } from "../fixtures";
import type { Page } from "@playwright/test";

/**
 * Answering with no signal (spec F-08, BR-NET-01). The demo's lesson uses the browser's own connection as its
 * network, so Playwright's `setOffline` is a dead signal to it. The right answer to the first maths question is the
 * second option.
 */
const OPTION = ".q-opt, .q-tf__btn";
const stage = (page: Page) => page.locator("main.q").getAttribute("data-stage");

/** Run the demo's clock on until question 1 is open. */
async function toQuestion(page: Page) {
  const option = page.locator(OPTION).first();
  for (let i = 0; i < 40 && !(await option.isVisible()); i++) {
    await page.clock.fastForward(500);
    await page.waitForTimeout(30);
  }
  await expect(option).toBeVisible();
}

test("an answer given with no signal is saved, and sent and counted when the signal returns", async ({ page, context }) => {
  await page.clock.install();
  await page.goto("/app/checkin/MATH-7B");
  await toQuestion(page);

  await context.setOffline(true);
  await expect(page.getByText(mk.q("net.offline"))).toBeVisible();

  await page.locator(OPTION).nth(1).click();
  // Locked in, and the student is told it is safe: saved, not lost and not sent.
  await expect(page.getByText(mk.q("q.locked"))).toBeVisible();
  await expect(page.getByText(mk.q("ans.saved"))).toBeVisible();
  await expect(page.getByText(mk.q("ans.sent"), { exact: true })).toHaveCount(0);

  await context.setOffline(false);
  await expect(page.getByText(mk.q("ans.sent"), { exact: true })).toBeVisible();
  await expect(page.getByText(mk.q("ans.saved"))).toHaveCount(0);
  await expect(page.getByText(mk.q("net.back"))).toBeVisible();

  // Credited: the question closes and the verdict is a right answer.
  const right = page.getByRole("heading", { name: mk.q("q.right") });
  for (let i = 0; i < 40 && !(await right.isVisible()); i++) {
    await page.clock.fastForward(1_000);
    await page.waitForTimeout(30);
  }
  await expect(right).toBeVisible();
  await expect(page.locator(".q-gain")).toContainText(/\+1\d/);
});

test("an answer sent only after the question has closed still counts, with the time it was given (BR-NET-01)", async ({ page, context }) => {
  await page.clock.install();
  await page.goto("/app/checkin/MATH-7B");
  await toQuestion(page);

  await context.setOffline(true);
  await page.locator(OPTION).nth(1).click();
  await expect(page.getByText(mk.q("ans.saved"))).toBeVisible();

  // The question closes, the server settles it without the student's answer, and the phone hears nothing.
  await page.clock.fastForward(25_000);
  await expect(page.getByText(mk.q("q.savedWait"))).toBeVisible();
  // Nothing false is said meanwhile: no "wrong", no "time ran out".
  await expect(page.getByRole("heading", { name: mk.q("q.wrong") })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: mk.q("q.timeout") })).toHaveCount(0);

  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: mk.q("q.right") })).toBeVisible();
  await expect(page.locator(".q-gain")).toContainText(/\+1\d/);
  expect(await stage(page)).toBe("right");
});

test("the special code OFFLINE-ANSWER-7B drops the network right after the first answer, and saved turns into sent by itself", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/OFFLINE-ANSWER-7B");
  await toQuestion(page);

  await page.locator(OPTION).nth(1).click();
  await expect(page.getByText(mk.q("ans.saved"))).toBeVisible();
  await expect(page.getByText(mk.q("net.offline"))).toBeVisible();

  // About 15 seconds later the network is back, with nobody touching airplane mode.
  const sent = page.getByText(mk.q("ans.sent"), { exact: true });
  for (let i = 0; i < 30 && !(await sent.isVisible()); i++) {
    await page.clock.fastForward(1_000);
    await page.waitForTimeout(30);
  }
  await expect(sent).toBeVisible();
  await expect(page.getByText(mk.q("net.offline"))).toHaveCount(0);
});

test.describe("with the browser's network gone", () => {
  // Whatever the page asks for while the phone is offline fails, and the browser logs each one.
  test.use({ allowConsoleErrors: [/net::ERR_INTERNET_DISCONNECTED/] });

test("outside the quiz the connection is said quietly too, and in English", async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem("teacheraid-locale", "en"));
  await page.goto("/app");
  await expect(page.getByRole("navigation", { name: en.t("nav.main") })).toBeVisible();
  await expect(page.getByText(en.q("net.offline"))).toHaveCount(0);

  await context.setOffline(true);
  const note = page.getByRole("status").filter({ hasText: en.q("net.offline") });
  await expect(note).toBeVisible();
  // It floats and takes no taps, so nothing under it is blocked.
  await expect(note).toHaveCSS("pointer-events", "none");
  await context.setOffline(false);
  await expect(page.getByText(en.q("net.back"))).toBeVisible();
});
});
