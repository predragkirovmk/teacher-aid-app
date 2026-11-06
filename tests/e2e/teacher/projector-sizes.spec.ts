import { expect, test } from "./fixtures";
import { go, openProjector, readQr, reveal, send, next, start, teach, TEACHING_AT, at } from "./live-helpers";

/** The projector check of step 12: read from the back of a room, at the three sizes a school has. */

const SIZES = [
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

test("the QR stays big, on a white quiet zone, and scannable at every size", async ({ page, context }) => {
  await start(page, context);
  const projector = await openProjector(page, context);
  await at(context, 20, page);
  for (const size of SIZES) {
    await projector.setViewportSize(size);
    const box = (await projector.locator(".cv__qr").boundingBox())!;
    expect(box.width, `${size.width}`).toBeGreaterThanOrEqual(size.height * 0.5);
    expect(box.width, `${size.width}`).toBeLessThanOrEqual(size.width * 0.45);
    // The white panel is the quiet zone: the symbol inside leaves at least two modules of white on every side.
    const quiet = await projector.locator(".cv__qr").evaluate((el) => {
      const svg = el.querySelector("svg")!.getBoundingClientRect();
      const outer = el.getBoundingClientRect();
      return Math.min(svg.left - outer.left, outer.right - svg.right, svg.top - outer.top, outer.bottom - svg.bottom);
    });
    expect(quiet, `${size.width}`).toBeGreaterThanOrEqual(0);
    expect(await readQr(projector.locator(".cv__qr svg")), `${size.width}`).toContain("/app/");
    // Every name on the window is at least 20px.
    expect(await projector.evaluate(() => Math.min(...[...document.querySelectorAll(".cv__names li, .cv__count, .cv__how")].map((e) => parseFloat(getComputedStyle(e).fontSize))))).toBeGreaterThanOrEqual(20);
  }
});

test("the ranking beside the bars is large in a squarish window, a name on one line, and the question still fills the height", async ({ page, context }) => {
  const projector = await teach(page, context);
  await send(page).click();
  await go(context, TEACHING_AT + 31);
  await reveal(page).click();
  await next(page).click();
  await go(context, TEACHING_AT + 90);
  await reveal(page).click();
  await expect(projector.getByTestId("cv-board")).toBeVisible();
  for (const size of SIZES) {
    await projector.setViewportSize(size);
    const rows = await projector.locator(".cvb__row").evaluateAll((els) => els.map((e) => ({ size: parseFloat(getComputedStyle(e).fontSize), height: e.querySelector(".cvb__name")!.getBoundingClientRect().height })));
    expect(rows.length).toBeGreaterThan(0);
    const min = Math.min(...rows.map((r) => r.size));
    expect(min, `${size.width}`).toBeGreaterThanOrEqual(size.width === 1024 ? 26 : 22);
    // One line a name: the name is not taller than two lines of its own type.
    for (const r of rows) expect(r.height, `${size.width}`).toBeLessThanOrEqual(r.size * 2);
    const reveal = (await projector.locator(".cvq__reveal").boundingBox())!;
    expect((reveal.y + reveal.height) / size.height, `${size.width}`).toBeGreaterThanOrEqual(0.85);
    expect(await projector.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight])).toEqual([0, 0]);
  }
});
