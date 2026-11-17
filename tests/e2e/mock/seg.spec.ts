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
      // The piece is two round ends and a bridge: its edges are the outer edges of their boxes, as drawn this frame.
      const read = (): Edges => {
        const box = el.getBoundingClientRect();
        const rects = Array.from(glide.querySelectorAll(".seg__face > span"), (p) => p.getBoundingClientRect());
        const x = box.left + el.clientLeft;
        const y = box.top + el.clientTop;
        return {
          l: Math.min(...rects.map((r) => r.left)) - x,
          r: Math.max(...rects.map((r) => r.right)) - x,
          t: Math.min(...rects.map((r) => r.top)) - y,
          b: Math.max(...rects.map((r) => r.bottom)) - y,
        };
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

/**
 * A slide to the right passes its place once, gently, while it is still arriving: the leading edge is at its farthest while
 * the trailing edge is still on its way, and from then on the piece only comes back (no late bump once it has stopped).
 */
function expectOvershootBeforeStop(samples: Sample[], goal: { l: number; r: number }, way: number) {
  const peak = samples.reduce((best, s, i) => (s.r > samples[best].r ? i : best), 0);
  const past = samples[peak].r - goal.r;
  expect(past).toBeGreaterThan(0.2);
  // Gentle: bounce 0.2 passes by about 1.5% of the way, so under 3%.
  expect(past).toBeLessThan(way * 0.03);
  // Before the stop: the trailing edge has not arrived yet at the farthest point.
  expect(samples[peak].l).toBeLessThan(goal.l - 1);
  // After it, the leading edge only comes back.
  for (let i = peak + 1; i < samples.length; i++) expect(samples[i].r).toBeLessThanOrEqual(samples[i - 1].r + 0.3);
}

/** How many frames, over the 1.2 s after `act`, show a view-transition morph running. */
async function morphsDuring(page: Page, act: () => Promise<unknown>) {
  await page.evaluate(() => {
    const w = window as unknown as { morphs: number };
    w.morphs = 0;
    const end = performance.now() + 1200;
    const look = () => {
      if (document.getAnimations().some((a) => String((a.effect as KeyframeEffect).pseudoElement ?? "").startsWith("::view-transition-group"))) w.morphs++;
      if (performance.now() < end) requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await act();
  await page.waitForTimeout(1300);
  return page.evaluate(() => (window as unknown as { morphs: number }).morphs);
}

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

  test("the piece runs just past its place on the way in and comes back, and nothing passes it after the stop", async ({ page }) => {
    const { before, samples, goal } = await tapAndWatch(page, ".seg-pills", ".pill[lang=en]");
    expectOvershootBeforeStop(samples, goal, goal.l - before.l);
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
    await expect.poll(() => glide.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
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
      const left = el.querySelector(".seg__cap")!.getBoundingClientRect().left - el.getBoundingClientRect().left - el.clientLeft;
      const en = el.querySelector<HTMLElement>(".pill[lang=en]")!;
      return [left, en.offsetLeft];
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
    const { samples } = await tapAndWatch(page, ".tabbar", `.tab[href="/app/profile"]`, 2500);
    await expect(page).toHaveURL(/\/app\/profile$/);
    const goal = await page
      .locator(`.tab[href="/app/profile"]`)
      .evaluate((el: HTMLElement) => ({ l: el.offsetLeft, r: el.offsetLeft + el.offsetWidth }));
    // One piece stretched over the way from Home to Profile for a moment (much wider than a tab), then it settles on Profile.
    expect(Math.max(...samples.map((s) => s.r - s.l))).toBeGreaterThan(2 * (goal.r - goal.l));
    const last = samples.at(-1)!;
    expect(near(last.l, goal.l) && near(last.r, goal.r)).toBe(true);
    // Just past Profile, a little, on the way in, and back.
    expectOvershootBeforeStop(samples, goal, goal.l - samples[0].l);
    await expect(page.getByRole("navigation", { name: mk.t("nav.main") }).locator("[aria-current=page]")).toHaveText(mk.t("nav.profile"));
  });

  test("the slide is drawn by the compositor: nothing on the main thread animates but transforms", async ({ page }) => {
    await start(page, {});
    await page.goto("/app");
    await expect(page.locator(".tabbar > .seg__glide")).toHaveAttribute("data-on", "true");
    const props = await page.evaluate(async () => {
      document.querySelector<HTMLElement>(`.tab[href="/app/subjects"]`)!.click();
      // The piece moves on the tap itself, before the screen has loaded: by the next frame the slide is under way.
      await new Promise(requestAnimationFrame);
      return document
        .querySelector(".tabbar > .seg__glide")!
        .getAnimations({ subtree: true })
        .flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)))
        .filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k));
    });
    expect(props).toContain("transform");
    // Only what the compositor runs by itself: transforms, and the fade when the piece appears.
    expect(props.every((k) => k === "transform" || k === "opacity")).toBe(true);
  });

  test("the chosen tab's icon fills in place, without a bounce", async ({ page }) => {
    await start(page, {});
    await page.goto("/app");
    await expect(page.locator(".tabbar > .seg__glide")).toHaveAttribute("data-on", "true");
    const moving = await page.evaluate(async () => {
      const tab = document.querySelector<HTMLElement>(`.tab[href="/app/profile"]`)!;
      tab.click();
      await new Promise(requestAnimationFrame);
      return tab.querySelector("svg")!.getAnimations().length;
    });
    expect(moving).toBe(0);
  });

  test("a tap between Home and Subjects swaps the screens with no morph between them; a subject still morphs into its screen", async ({ page }) => {
    await start(page, {});
    await page.goto("/app");
    const tabs = page.getByRole("navigation", { name: mk.t("nav.main") });
    expect(await morphsDuring(page, () => tabs.getByRole("link", { name: mk.t("subjects.title") }).click())).toBe(0);
    await expect(page).toHaveURL(/\/app\/subjects$/);
    expect(await morphsDuring(page, () => tabs.getByRole("link", { name: mk.t("nav.home") }).click())).toBe(0);
    await expect(page).toHaveURL(/\/app$/);
    await tabs.getByRole("link", { name: mk.t("subjects.title") }).click();
    await expect(page).toHaveURL(/\/app\/subjects$/);
    // The control: the same morph, from a row into the subject's own screen, still runs.
    expect(await morphsDuring(page, () => page.locator("[data-morph]").first().click())).toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/app\/subject\//);
  });

  test("after a tap, a swipe back to the screen it was made on puts the piece on that screen's tab", async ({ page }) => {
    await start(page, {});
    await page.goto("/app");
    const tabs = page.getByRole("navigation", { name: mk.t("nav.main") });
    await tabs.getByRole("link", { name: mk.t("subjects.title") }).click();
    await expect(page).toHaveURL(/\/app\/subjects$/);
    // A finger drags the screen to the right: back to Home.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 100, y: 400 }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 100 + (200 * i) / 12, y: 400 }] });
      await page.waitForTimeout(12);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page).toHaveURL(/\/app$/);
    await expect(tabs.locator('[data-checked="true"]')).toHaveText(mk.t("nav.home"));
    const home = await page.locator(`.tab[href="/app"]`).evaluate((el: HTMLElement) => el.offsetLeft);
    await expect
      .poll(() => page.locator(".tabbar .seg__cap").first().evaluate((el) => el.getBoundingClientRect().left - el.closest(".tabbar")!.getBoundingClientRect().left))
      .toBeCloseTo(home + 1, 0);
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
