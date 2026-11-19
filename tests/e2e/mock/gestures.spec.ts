import type { Page } from "@playwright/test";
import { expect, mk, test } from "../fixtures";

/**
 * Step 6: a released swipe or sheet carries the finger's speed into the app's own spring, a new touch catches it where it
 * is, and what leaves (the toast) fades out. Animations are paused to read a
 * frame, so none of this depends on how fast the machine runs.
 */
const pagerX = (page: Page) =>
  page.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".pager")!).transform).m41);
const pagerAnimations = (page: Page) => page.evaluate(() => document.querySelector(".pager")!.getAnimations().length);
/** Stop a spring 60 ms in, and wait until it has really stopped, so the frame that is read is the frame that stays. */
const freeze = (page: Page, selector: string) =>
  page.evaluate(async (sel) => {
    const all = document.querySelector(sel)!.getAnimations();
    all.forEach((a) => ((a.currentTime = 60), a.pause()));
    await Promise.all(all.map((a) => a.ready));
  }, selector);
const phone = async (page: Page) => (await page.locator(".phone").boundingBox())!;

/** A drag that ends with the finger still, so it leaves with no speed. */
async function drag(page: Page, from: number, to: number, { still = true } = {}) {
  const box = await phone(page);
  const y = box.y + 130;
  await page.mouse.move(box.x + from, y);
  await page.mouse.down();
  await page.mouse.move(box.x + to, y + 3, { steps: 8 });
  if (still) await page.waitForTimeout(160);
}

/**
 * A flick: pointer events sent from inside the page, a few milliseconds apart, so the speed is a finger's (the mouse of the test
 * runner makes a move a round trip, about 10 ms, and a drag of it reads as slow).
 */
async function flick(page: Page, from: number, to: number) {
  await page.evaluate(
    ({ from, to }) => {
      const pager = document.querySelector<HTMLElement>(".pager")!;
      const box = document.querySelector(".phone")!.getBoundingClientRect();
      const y = box.top + 130;
      const send = (type: string, x: number) =>
        pager.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true, clientX: box.left + x, clientY: y, buttons: type === "pointerup" ? 0 : 1 }));
      send("pointerdown", from);
      for (let i = 1; i <= 8; i++) send("pointermove", from + ((to - from) * i) / 8);
      send("pointerup", to);
    },
    { from, to },
  );
}

test.describe("the pager carries the finger's speed", () => {
  test("a fast, short flick changes the tab, and the next one comes in on a move that starts with its speed", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("main.screen:not([data-pending])")).toBeVisible();
    // 60 px is well under a quarter of the phone: only the speed can carry it.
    await flick(page, 330, 270);
    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect.poll(() => pagerAnimations(page)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => (document.querySelector(".pager") as HTMLElement).style.transform)).toBe("");
  });

  test("a slow, short drag springs back to the same tab", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("main.screen:not([data-pending])")).toBeVisible();
    const box = await phone(page);
    await drag(page, 330, 330 - Math.round(box.width * 0.2));
    await page.mouse.up();
    expect(await pagerAnimations(page)).toBeGreaterThan(0);
    await expect.poll(() => pagerX(page)).toBe(0);
    await expect(page).toHaveURL(/\/app$/);
    expect(await page.evaluate(() => (document.querySelector(".pager") as HTMLElement).style.transform)).toBe("");
  });

  test("a finger that stops before it lifts leaves with no speed, even after a fast drag", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("main.screen:not([data-pending])")).toBeVisible();
    await drag(page, 330, 270);
    await page.mouse.up();
    await expect(page).toHaveURL(/\/app$/);
  });

  test("a touch during the settle takes the screen from where it is, with no jump", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("main.screen:not([data-pending])")).toBeVisible();
    const box = await phone(page);
    await drag(page, 330, 330 - Math.round(box.width * 0.22));
    await page.mouse.up();
    // Freeze the spring-back part of the way, then touch the screen again.
    await freeze(page, ".pager");
    const frozen = await pagerX(page);
    expect(frozen).toBeLessThan(-10);
    expect(await pagerAnimations(page)).toBeGreaterThan(0);

    await page.mouse.move(box.x + 200, box.y + 130);
    await page.mouse.down();
    // Caught: the animation is gone and the screen has not moved.
    expect(await pagerAnimations(page)).toBe(0);
    expect(Math.abs((await pagerX(page)) - frozen)).toBeLessThan(1);
    // The finger carries on from there: 20 px more is 20 px further, not a restart from 0.
    await page.mouse.move(box.x + 180, box.y + 133, { steps: 4 });
    expect(Math.abs((await pagerX(page)) - (frozen - 20))).toBeLessThan(4);
    await page.mouse.up();
  });

  test("a tap that only caught a settling screen lets it go again", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("main.screen:not([data-pending])")).toBeVisible();
    const box = await phone(page);
    await drag(page, 330, 330 - Math.round(box.width * 0.22));
    await page.mouse.up();
    await freeze(page, ".pager");
    await page.mouse.move(box.x + 200, box.y + 130);
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => pagerX(page)).toBe(0);
    await expect(page).toHaveURL(/\/app$/);
  });

  test("with reduced motion nothing travels: the screen changes and no move runs", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app");
    await expect(page.locator("main.screen:not([data-pending])")).toBeVisible();
    await flick(page, 330, 270);
    expect(await pagerAnimations(page)).toBe(0);
    expect(await pagerX(page)).toBe(0);
    await expect(page).toHaveURL(/\/app\/profile$/);
    expect(await pagerAnimations(page)).toBe(0);
  });
});

test.describe("the sheet", () => {
  async function openSheet(page: Page) {
    await page.goto("/app/profile");
    await page.getByRole("button", { name: new RegExp(mk.t("profile.language")) }).click();
    const dialog = page.getByRole("dialog", { name: mk.t("lang.title") });
    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.querySelector(".sheet")!.getAnimations().length)).toBe(0);
    return dialog;
  }
  const sheetY = (page: Page) => page.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".sheet")!).transform).m42);

  test("a flick down closes it", async ({ page }) => {
    const dialog = await openSheet(page);
    const grip = (await page.locator(".sheet__handle").boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + 20);
    await page.mouse.down();
    // The sheet reads speed from the time between events, and the mouse's steps arrive as slowly as the machine is busy
    // (on a loaded runner, 50 px in five steps falls under the flick speed). So the flick is sent from inside the page, in one
    // task: 50 px in no time at all. The real mouse-down above gives the pointer and its capture.
    await page.evaluate(() => {
      const el = document.querySelector(".sheet__handle")!;
      const r = el.getBoundingClientRect();
      const send = (type: string, y: number) =>
        el.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, clientX: r.x + r.width / 2, clientY: y }));
      for (let i = 1; i <= 5; i++) send("pointermove", r.y + 20 + i * 10);
      send("pointerup", r.y + 70);
    });
    await expect(dialog).toHaveCount(0);
    await page.mouse.up();
  });

  test("a slow, short drag springs back with a move of its own, and a touch catches it where it is", async ({ page }) => {
    const dialog = await openSheet(page);
    const grip = (await page.locator(".sheet__handle").boundingBox())!;
    const x = grip.x + grip.width / 2;
    await page.mouse.move(x, grip.y + 20);
    await page.mouse.down();
    await page.mouse.move(x, grip.y + 60, { steps: 6 });
    await page.waitForTimeout(160);
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.querySelector(".sheet")!.getAnimations().length)).toBeGreaterThan(0);
    await freeze(page, ".sheet");
    const frozen = await sheetY(page);
    expect(frozen).toBeGreaterThan(3);

    const now = (await page.locator(".sheet__handle").boundingBox())!;
    await page.mouse.move(x, now.y + 20);
    await page.mouse.down();
    await expect.poll(() => page.evaluate(() => document.querySelector(".sheet")!.getAnimations().length)).toBe(0);
    expect(Math.abs((await sheetY(page)) - frozen)).toBeLessThan(1);
    await page.mouse.move(x, now.y + 30, { steps: 3 });
    await expect.poll(async () => Math.abs((await sheetY(page)) - (frozen + 10))).toBeLessThan(3);
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    await expect.poll(() => sheetY(page)).toBe(0);
  });
});

test.describe("what leaves, leaves with a fade", () => {
  test("the toast fades out when it is tapped, and is gone after it", async ({ page }) => {
    await page.goto("/app/profile");
    await page.getByRole("button", { name: mk.q("p.edit"), exact: true }).click();
    await page.getByRole("textbox").first().fill("Мики Т");
    await page.getByRole("button", { name: mk.q("p.save") }).click();
    const toast = page.locator(".toast");
    await expect(toast).toBeVisible();
    // Let it arrive first: a toast tapped before its first frame never shows, so it has nothing to fade.
    await expect.poll(() => toast.evaluate((el) => el.getAnimations().length)).toBe(0);
    // Its exit is a transition on opacity that starts with the tap, not a removal (`transitionrun` is heard however late the frame).
    const exit = await toast.evaluate(
      (el) =>
        new Promise<{ out: boolean; property: string }>((done) => {
          el.addEventListener("transitionrun", function onRun(e) {
            if (!el.classList.contains("toast--out") || (e as TransitionEvent).propertyName !== "opacity") return;
            el.removeEventListener("transitionrun", onRun);
            done({ out: true, property: "opacity" });
          });
          (el as HTMLElement).click();
        }),
    );
    expect(exit).toEqual({ out: true, property: "opacity" });
    await expect(toast).toHaveCount(0);
  });
});
