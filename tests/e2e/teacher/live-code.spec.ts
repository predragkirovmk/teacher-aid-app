import { tokenAt } from "../../../lib/teacher/api/mock-live";
import { expect, test } from "./fixtures";
import { at, classCode, code, count, nextEdge, openProjector, readQr, SESSION, start, T0 } from "./live-helpers";

/**
 * The code to read out, which is shown by default (`STUDENTS_CAN_TYPE_CODE` in lib/teacher/live.ts, OPEN-03): the student app has a
 * "Внеси код" button. These tests run against the default build and are skipped only in a build made with
 * `NEXT_PUBLIC_STUDENTS_CAN_TYPE_CODE=0`, which hides the code (`live.spec.ts` has the tests for that build):
 *
 *   NEXT_PUBLIC_E2E=1 pnpm build && pnpm exec next start -p 3100
 *   pnpm exec playwright test live-code
 */
test.skip(process.env.NEXT_PUBLIC_STUDENTS_CAN_TYPE_CODE === "0", "the code is switched off in this build");

const grouped = (short: string) => `${short.slice(0, 3)} ${short.slice(3)}`;

test.describe("with the code shown", () => {
  test("the console shows it large, in two groups of three, with the sentence that it changes", async ({ page, context }) => {
    await start(page, context);
    await expect(page.getByRole("heading", { name: "Код за приклучување" })).toBeVisible();
    await expect(code(page)).toHaveText(grouped(tokenAt(SESSION, T0).short_code));
    expect(await code(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(48);
    await expect(page.getByText("Кодот се менува на секои 30 секунди.")).toBeVisible();
    // Beside it, the list of who has joined, empty until someone scans.
    await expect(count(page)).toHaveText("0 се приклучија");
    // The one main button is still alone.
    await expect(page.locator(".btn--primary:visible")).toHaveCount(1);
  });

  test("while teaching, the code steps back to one line under the question, no larger than the question", async ({ page, context }) => {
    await start(page, context);
    const lobby = (await page.locator(".live__code").boundingBox())!.height;
    await openProjector(page, context);
    await page.bringToFront();
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    const prompt = page.getByTestId("panel-prompt");
    await expect(prompt).toBeVisible();
    await expect(code(page)).toHaveText(grouped(tokenAt(SESSION, T0).short_code));
    const px = (l: typeof prompt) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(await px(code(page))).toBeLessThanOrEqual(await px(prompt));
    // The code sits on its heading's line, so the card is shorter than in the lobby.
    const [heading, digits] = await Promise.all([page.locator("#live-code").boundingBox(), code(page).boundingBox()]);
    expect(Math.abs(heading!.y + heading!.height / 2 - (digits!.y + digits!.height / 2))).toBeLessThan(heading!.height);
    expect((await page.locator(".live__code").boundingBox())!.height).toBeLessThan(lobby);
    // Under the question, not above it.
    expect((await page.locator(".live__code").boundingBox())!.y).toBeGreaterThan((await prompt.boundingBox())!.y);
  });

  test("the code changes every 30 seconds on both screens, together with the QR", async ({ page, context }) => {
    await start(page, context);
    const projector = await openProjector(page, context);
    await expect(classCode(projector)).toHaveText(await code(page).innerText());
    const qr = projector.locator(".cv__qr svg");
    const before = { code: await code(page).textContent(), qr: await readQr(qr) };
    const edge = nextEdge();
    await context.clock.setFixedTime(edge + 500);
    const next = tokenAt(SESSION, edge + 500);
    await expect(code(page)).toHaveText(grouped(next.short_code));
    await expect(classCode(projector)).toHaveText(grouped(next.short_code));
    expect(await code(page).textContent()).not.toBe(before.code);
    await expect.poll(() => readQr(qr)).not.toBe(before.qr);
  });

  test("the projector says to scan or enter the code, and the code is huge: at least 12 percent of the window's height", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    const projector = await openProjector(page, context);
    await projector.setViewportSize({ width: 1920, height: 1080 });
    await expect(projector.getByText("Скенирајте го QR-кодот или внесете го кодот во TeacherAid")).toBeVisible();
    expect(await classCode(projector).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(0.12 * 1080);
    await expect(projector.getByText("Кодот се менува на секои 30 секунди.")).toHaveCount(1);
    for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
      await projector.setViewportSize(size);
      expect(await projector.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight])).toEqual([0, 0]);
      const box = (await classCode(projector).boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    }
    await expect(count(page)).toBeVisible();
  });

  test("while teaching, the corner for those who are late has the code beside the QR", async ({ page, context }) => {
    await start(page, context);
    const projector = await openProjector(page, context);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    await expect(projector.locator(".cv__corner").getByText("Доцните? Скенирајте го QR-кодот или внесете го кодот.")).toBeVisible();
    await expect(classCode(projector)).toHaveText(await code(page).innerText());
  });
});
