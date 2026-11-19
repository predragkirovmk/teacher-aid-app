import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";

/**
 * A tap on a tab of the tab bar always crossfades the screens, to the end: every view transition the tap causes is a tab one (React can drop the type under load: Shell then falls back to its own flag),
 * none is skipped (a second startViewTransition skips the one running, and its crossfade would be cut off), the old and the new
 * screen fade (vt-fade-out, vt-fade-in), and the new screen is the one on show. Each pair is tried at full speed and under a 4x
 * CPU throttle, the way a phone and a loaded CI runner are slow.
 */

type Call = { types: string[]; ready: string; finished: string; stack: string; at: number };

/** Remember every view transition: its types, whether it was skipped (`ready` rejects) or cut off, and what animations ran. */
async function record(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __calls: Call[]; __fades: string[] };
    w.__calls = [];
    w.__fades = [];
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = ((arg?: { types?: string[] } | (() => void)) => {
      const call: Call = { types: typeof arg === "object" && arg && Array.isArray(arg.types) ? [...arg.types] : [], ready: "pending", finished: "pending", stack: String(new Error().stack), at: Math.round(performance.now()) };
      w.__calls.push(call);
      const transition = original(arg as never);
      transition.ready.then(
        () => (call.ready = "ready"),
        (e: Error) => (call.ready = `rejected ${e.name}`),
      );
      transition.finished.then(
        () => (call.finished = "finished"),
        (e: Error) => (call.finished = `rejected ${e.name}`),
      );
      return transition;
    }) as typeof document.startViewTransition;
    const watch = () => {
      for (const a of document.getAnimations()) {
        const e = a.effect as KeyframeEffect | null;
        const pseudo = e?.pseudoElement ?? "";
        const key = `${pseudo} ${a instanceof CSSAnimation ? a.animationName : ""}`;
        if (pseudo.startsWith("::view-transition") && !w.__fades.includes(key)) w.__fades.push(key);
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
}

const TABS = ["/app", "/app/join", "/app/profile"];

for (const rate of [1, 4]) {
  test.describe(`a tab tap crossfades (CPU ${rate}x)`, () => {
    for (const [i, to] of TABS.entries()) {
      const from = TABS[(i + 1) % TABS.length];
      test(`${from} to ${to}`, async ({ page }) => {
        await record(page);
        if (rate > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate });
        await page.goto(from);
        await expect(page.locator("main.screen:not([data-pending])")).toBeVisible();
        await page.locator(`.tab[href="${to}"]`).click();
        await expect(page).toHaveURL(new RegExp(`${to}$`));
        await expect(page.locator(`.tab[href="${to}"]`)).toHaveAttribute("aria-current", "page");
        await expect(page.locator("main.screen:not([data-pending])")).toBeVisible();

        // Every transition ends (a skipped one rejects `ready`), and the animations were seen on the root group.
        const calls = () => page.evaluate(() => (window as unknown as { __calls: Call[] }).__calls);
        await expect.poll(async () => (await calls()).every((c) => c.finished !== "pending")).toBe(true);
        const all = await calls();
        expect(all.length).toBeGreaterThan(0);
        for (const c of all) {
          // React can lose the `tab` type under load; the screens crossfade either way (Shell), but never slide.
          expect(c.types.filter((t) => t !== "tab"), c.stack).toEqual([]);
          expect(c.ready, c.stack).toBe("ready");
          expect(c.finished, c.stack).toBe("finished");
        }
        const fades = await page.evaluate(() => (window as unknown as { __fades: string[] }).__fades);
        // React names the screen's group itself (_t_0_), so the group is any but the dock's.
        expect(fades.some((f) => /^::view-transition-old\((?!dock)[^)]+\) vt-fade-out$/.test(f))).toBe(true);
        expect(fades.some((f) => /^::view-transition-new\((?!dock)[^)]+\) vt-fade-in$/.test(f))).toBe(true);
      });
    }
  });
}
