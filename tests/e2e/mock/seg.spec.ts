import type { Page } from "@playwright/test";
import { expect, mk, start, test } from "../fixtures";

/**
 * Every segmented control and tab row has one piece for the whole track (SegGlide). On a new choice the edge in front leaves
 * first and the edge behind follows, so the old and the new choice are briefly one piece, then it settles. Reduce Motion moves
 * it at once; so does a move between the rows of a wrapped track; Windows high contrast draws the chosen piece itself.
 */

type Edges = { l: number; r: number; t: number; b: number };
type Sample = Edges & { at: number };

/** Tap `target` inside `track` from the page itself, then read the piece's edges every frame for `ms`. */
async function tapAndWatch(page: Page, track: string, target: string, ms = 900) {
  return page.evaluate(
    async ([track, target, ms]) => {
      const el = document.querySelector<HTMLElement>(track)!;
      const glide = el.querySelector<HTMLElement>(":scope > .seg__glide")!;
      const read = (): Edges => {
        const cs = getComputedStyle(glide);
        const px = (k: string) => parseFloat(cs.getPropertyValue(`--seg-${k}`));
        return { l: px("l"), r: el.clientWidth - px("r"), t: px("t"), b: el.clientHeight - px("b") };
      };
      const before = read();
      const t0 = performance.now();
      el.querySelector<HTMLElement>(target)!.click();
      const samples: Sample[] = [];
      await new Promise<void>((done) => {
        const tick = () => {
          samples.push({ at: performance.now() - t0, ...read() });
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      const piece = el.querySelector<HTMLElement>(target)!;
      const goal = { l: piece.offsetLeft, r: piece.offsetLeft + piece.offsetWidth, t: piece.offsetTop, b: piece.offsetTop + piece.offsetHeight };
      return { before, samples, goal };
    },
    [track, target, ms] as const,
  );
}

const near = (a: number, b: number, by = 1) => Math.abs(a - b) <= by;

test.describe("the welcome screen's language switch", () => {
  test.beforeEach(async ({ page }) => {
    await start(page, { state: { signedIn: false } });
    await page.goto("/app/welcome");
    await expect(page.locator(".seg-pills > .seg__glide")).toHaveAttribute("data-on", "true");
  });

  test("the piece stretches from МК into EN, the leading edge first, then settles on EN", async ({ page }) => {
    const { before, samples, goal } = await tapAndWatch(page, ".seg-pills", ".pill[lang=en]");
    // For a moment the piece is on both at once: its trailing edge still over МК while its leading edge is already over EN.
    expect(samples.some((s) => s.l < before.r - 4 && s.r > goal.l + 4)).toBe(true);
    // The leading edge arrives first.
    const leadIn = samples.find((s) => near(s.r, goal.r, 2))!.at;
    const trailIn = samples.find((s) => near(s.l, goal.l, 2))!.at;
    expect(leadIn).toBeLessThan(trailIn);
    // It never jumps: no frame moves an edge more than half the way at once.
    for (let i = 1; i < samples.length; i++) expect(Math.abs(samples[i].l - samples[i - 1].l)).toBeLessThan((goal.l - before.l) / 2);
    const last = samples.at(-1)!;
    expect(near(last.l, goal.l) && near(last.r, goal.r)).toBe(true);
    await expect(page.locator(".pill[lang=en]")).toHaveAttribute("aria-pressed", "true");
  });

  test("the trailing edge overshoots a little before it settles", async ({ page }) => {
    const { before, samples, goal } = await tapAndWatch(page, ".seg-pills", ".pill[lang=en]");
    const furthest = Math.max(...samples.map((s) => s.l));
    expect(furthest).toBeGreaterThan(goal.l + 0.5);
    // Small: under a tenth of the way.
    expect(furthest - goal.l).toBeLessThan((goal.l - before.l) / 10);
  });

  test("with Reduce Motion the piece moves at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { samples, goal } = await tapAndWatch(page, ".seg-pills", ".pill[lang=en]", 200);
    expect(near(samples[0].l, goal.l) && near(samples[0].r, goal.r)).toBe(true);
  });

  test("a track wrapped onto two lines moves between its rows at once, never stretching over the pieces between", async ({ page }) => {
    // Narrow enough that EN goes under МК.
    await page.locator(".seg-pills").evaluate((el) => (el.style.width = "64px"));
    const glide = page.locator(".seg-pills > .seg__glide");
    await expect.poll(() => page.locator(".pill[lang=en]").evaluate((el: HTMLElement) => el.offsetTop)).toBeGreaterThan(20);
    // The resize placed it on МК, at once.
    await expect.poll(() => glide.evaluate((el) => el.getAnimations().length)).toBe(0);
    const { samples, goal } = await tapAndWatch(page, ".seg-pills", ".pill[lang=en]", 200);
    expect(near(samples[0].t, goal.t) && near(samples[0].b, goal.b) && near(samples[0].l, goal.l)).toBe(true);
  });

  test("a slide under way when the track changes size goes on to the corrected place", async ({ page }) => {
    const pills = page.locator(".seg-pills");
    await pills.evaluate((el) => {
      el.querySelector<HTMLElement>(".pill[lang=en]")!.click();
      // Mid-slide the track grows, which moves EN.
      setTimeout(() => (el.style.gap = "24px"), 80);
    });
    await page.waitForTimeout(1000);
    const [edges, goal] = await pills.evaluate((el) => {
      const cs = getComputedStyle(el.querySelector(".seg__glide")!);
      const en = el.querySelector<HTMLElement>(".pill[lang=en]")!;
      return [parseFloat(cs.getPropertyValue("--seg-l")), en.offsetLeft];
    });
    expect(near(edges, goal)).toBe(true);
  });

  test("in Windows high contrast the piece goes and the chosen word draws its own ground", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await expect(page.locator(".seg-pills > .seg__glide")).toBeHidden();
    const ground = await page.locator(".pill[lang=mk]").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(ground).not.toBe("rgba(0, 0, 0, 0)");
  });
});

test.describe("the tab bar", () => {
  test("one piece slides from Home to Profile over the scan, and never sits under the scan", async ({ page }) => {
    await start(page, {});
    await page.goto("/app");
    const glide = page.locator(".tabbar > .seg__glide");
    await expect(glide).toHaveAttribute("data-on", "true");
    const { before, samples } = await tapAndWatch(page, ".tabbar", `.tab[href="/app/profile"]`, 2500);
    await expect(page).toHaveURL(/\/app\/profile$/);
    const goal = await page
      .locator(`.tab[href="/app/profile"]`)
      .evaluate((el: HTMLElement) => ({ l: el.offsetLeft, r: el.offsetLeft + el.offsetWidth }));
    // Home and Profile are one piece for a moment, then it settles on Profile.
    expect(samples.some((s) => s.l < before.r - 4 && s.r > goal.l + 4)).toBe(true);
    const last = samples.at(-1)!;
    expect(near(last.l, goal.l) && near(last.r, goal.r)).toBe(true);
    await expect(page.getByRole("navigation", { name: mk.t("nav.main") }).locator("[aria-current=page]")).toHaveText(mk.t("nav.profile"));
  });

  test("off the tab roots there is no piece, and it comes back at once", async ({ page }) => {
    await start(page, {});
    await page.goto("/app/settings");
    const glide = page.locator(".tabbar > .seg__glide");
    await expect(glide).toHaveAttribute("data-on", "false");
    await page.goto("/app/subjects");
    await expect(glide).toHaveAttribute("data-on", "true");
  });
});
