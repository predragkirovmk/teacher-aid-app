import { tokenAt } from "../../../lib/teacher/api/mock-live";
import { expect, test } from "./fixtures";
import { at, classCode, code, count, nextEdge, openProjector, people, readQr, SESSION, start, T0 } from "./live-helpers";

/**
 * The code to read out, which is shown only while a student can type it (`STUDENTS_CAN_TYPE_CODE` in lib/teacher/live.ts, OPEN-03). The
 * default build has it off and `live.spec.ts` says nothing of it is shown; these tests run against a build made with
 * `NEXT_PUBLIC_STUDENTS_CAN_TYPE_CODE=1` and are skipped otherwise:
 *
 *   NEXT_PUBLIC_STUDENTS_CAN_TYPE_CODE=1 NEXT_PUBLIC_E2E=1 pnpm build && pnpm exec next start -p 3100
 *   NEXT_PUBLIC_STUDENTS_CAN_TYPE_CODE=1 pnpm exec playwright test live-code
 */
test.skip(process.env.NEXT_PUBLIC_STUDENTS_CAN_TYPE_CODE !== "1", "needs a build with the code switched on");

const grouped = (short: string) => `${short.slice(0, 3)} ${short.slice(3)}`;

test.describe("with the code switched on", () => {
  test("the console shows it large, in two groups of three, with the sentence that it changes", async ({ page, context }) => {
    await start(page, context);
    await expect(page.getByRole("heading", { name: "Код за приклучување" })).toBeVisible();
    await expect(code(page)).toHaveText(grouped(tokenAt(SESSION, T0).short_code));
    expect(await code(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(48);
    await expect(page.getByText("Кодот се менува на секои 30 секунди.")).toBeVisible();
    await expect(people(page)).toHaveCount(26);
    // The one yellow button is still alone.
    await expect(page.locator(".btn--primary:visible")).toHaveCount(1);
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
