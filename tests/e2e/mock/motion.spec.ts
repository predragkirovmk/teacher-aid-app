import { expect, mk, test, untilStage } from "../fixtures";
import type { Locator, Page } from "@playwright/test";

/**
 * Press feedback (docs/mobile-motion-steps.md, step 2): every tappable element squashes while it is held and springs back past 1 on release.
 * The mouse is held down on the element and let go on it, with the click swallowed, so nothing is opened. The squash is read
 * from the computed `scale` after 150 ms, which is the length of the press spring (--spring-press), so it has arrived.
 */
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

type Target = { name: string; open: (page: Page) => Promise<Locator>; min?: number };

const TARGETS: Target[] = [
  {
    name: "a card on Home",
    open: async (page) => {
      await page.goto("/app");
      return page.locator("a.card").first();
    },
  },
  {
    name: "a row in Settings",
    open: async (page) => {
      await page.goto("/app/settings");
      return page.locator("button.item").first();
    },
  },
  {
    name: "a tab in the tab bar",
    open: async (page) => {
      await page.goto("/app");
      return page.locator(".tab").nth(1);
    },
  },
  {
    name: "the round back button",
    open: async (page) => {
      await page.goto("/app/settings");
      return page.locator(".round").first();
    },
  },
  {
    name: "the avatar link on Home",
    open: async (page) => {
      await page.goto("/app");
      return page.locator(".home-bar a");
    },
  },
  {
    name: "a question of the FAQ",
    open: async (page) => {
      await page.goto("/app/faq");
      return page.locator("details.faq summary").first();
    },
  },
  {
    name: "an answer in a live quiz",
    open: async (page) => {
      await page.clock.install();
      await page.goto("/app/checkin/MATH-7B");
      await untilStage(page, "answering");
      return page.locator(".q-opt, .q-tf__btn").first();
    },
  },
  {
    name: "your own row in the quiz lobby",
    open: async (page) => {
      await page.clock.install();
      await page.goto("/app/checkin/MATH-7B");
      const me = page.locator(".q-me");
      await expect(me).toBeVisible();
      return me;
    },
  },
  {
    name: "an answer in a practice set",
    open: async (page) => {
      await page.goto("/app/practice/ps-session-math-1");
      return page.locator(".q-opt").first();
    },
  },
  {
    // The visible dot is 10 px inside a 44 px target, so it shrinks much further than a button, or a press could not be seen.
    name: "a dot in a topic chart",
    min: 0.5,
    open: async (page) => {
      await page.goto("/app/subject/math");
      return page.locator(".tc__dot").nth(1);
    },
  },
  {
    name: "the toast",
    open: async (page) => {
      await page.goto("/app/profile");
      await page.getByRole("button", { name: mk.q("p.edit"), exact: true }).click();
      await page.getByRole("textbox").first().fill("Мики Т");
      await page.getByRole("button", { name: mk.q("p.save") }).click();
      const toast = page.locator(".toast");
      await expect(toast).toBeVisible();
      return toast;
    },
  },
  {
    name: "the notification switch",
    open: async (page) => {
      // Push is only available on a phone that can do it; the switch is dimmed and still on a desktop browser.
      await page.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "default", configurable: true }));
      await page.goto("/app/settings");
      return page.getByRole("switch", { name: mk.t("settings.notifications") });
    },
  },
];

/** The scale as a number: the browser says "none" for a scale of 1. */
const read = (el: Locator) =>
  el.evaluate((n) => {
    const s = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    return { scale: s.scale === "none" ? 1 : parseFloat(s.scale), opacity: parseFloat(s.opacity), cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  });

/** Wait until no finite animation runs on the element, on what it holds or on what holds it (a screen's entrance), so its place is its resting place. */
const still = (el: Locator) =>
  expect
    .poll(() =>
      el.evaluate(
        (n) =>
          document.getAnimations().filter((a) => {
            const t = a.effect instanceof KeyframeEffect ? a.effect.target : null;
            return t && (t.contains(n) || n.contains(t)) && a.effect!.getComputedTiming().iterations !== Infinity;
          }).length,
      ),
    )
    .toBe(0);

async function hold(page: Page, el: Locator) {
  // The tap that ends the press is swallowed before the app sees it, so nothing opens or toggles. (Moving off the
  // element instead would drag a link, and dropping it opens it.)
  await page.evaluate(() => addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); }, true));
  await el.scrollIntoViewIfNeeded();
  await still(el);
  const box = (await el.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

async function release(page: Page) {
  await page.mouse.up();
}

test.describe("a press squashes", () => {
  test.use({ userAgent: ANDROID });

  for (const target of TARGETS) {
    test(`${target.name} squashes under a finger and springs back to its size`, async ({ page }) => {
      const el = await target.open(page);
      await el.scrollIntoViewIfNeeded();
      await still(el);
      const rest = await read(el);
      expect(rest.scale).toBe(1);

      await hold(page, el);
      await page.waitForTimeout(150);
      const held = await read(el);
      expect(held.scale).toBeLessThan(1);
      expect(held.scale).toBeGreaterThanOrEqual(target.min ?? 0.93);
      expect(held.opacity).toBe(1);
      // It squashes about its own centre: a transform offset that the scale shrinks would push it off its place.
      expect(Math.abs(held.cx - rest.cx)).toBeLessThan(0.75);
      expect(Math.abs(held.cy - rest.cy)).toBeLessThan(0.75);

      await release(page);
      // It goes past 1 and settles in under half a second (--spring-pop).
      await expect.poll(async () => (await read(el)).scale, { timeout: 1_500 }).toBe(1);
    });
  }
});

test.describe("a press is a transition and stops for a disabled control", () => {
  test.use({ userAgent: ANDROID });

  for (const [name, selector, url] of [
    // A row squashes only 0.02, too little to tell a restart from a continuation; a card (0.04) and a tab (0.06) can.
    ["a card", "a.card", "/app"],
    ["a tab", ".tab", "/app"],
  ] as const) {
    test(`a second press on ${name} carries on from where the release had got to`, async ({ page }) => {
      await page.goto(url);
      const el = page.locator(selector).first();
      await hold(page, el);
      await expect.poll(async () => (await read(el)).scale).toBeLessThan(0.99);
      await page.waitForTimeout(150);
      await release(page);
      // Freeze the spring back 40 ms in, so the test does not depend on how fast the browser answers.
      const rising = await el.evaluate((n) => {
        const a = n.getAnimations().find((x) => x instanceof CSSTransition && x.transitionProperty === "scale")!;
        a.pause();
        a.currentTime = 40;
        return parseFloat(getComputedStyle(n).scale);
      });
      await page.mouse.down();
      const again = (await read(el)).scale;
      // Restarting from full size would jump back up to 1; carrying on leaves it where it was, or lower.
      expect(rising).toBeLessThan(1);
      expect(again).toBeLessThanOrEqual(rising + 0.002);
      await page.mouse.up();
    });
  }

  test("a disabled button does not move", async ({ page }) => {
    await page.goto("/app/practice/ps-session-math-1");
    const check = page.getByRole("button", { name: mk.t("pr.check") });
    await expect(check).toHaveAttribute("aria-disabled", "true");
    await hold(page, check);
    await page.waitForTimeout(150);
    expect((await read(check)).scale).toBe(1);
    await release(page);
  });
});

test.describe("a press with reduced motion", () => {
  test.use({ userAgent: ANDROID, reducedMotion: "reduce" });

  for (const target of TARGETS) {
    test(`${target.name} dims and does not change size`, async ({ page }) => {
      const el = await target.open(page);

      await hold(page, el);
      await page.waitForTimeout(150);
      const held = await read(el);
      expect(held.scale).toBe(1);
      expect(held.opacity).toBeLessThan(1);

      await release(page);
      await expect.poll(async () => (await read(el)).opacity, { timeout: 1_500 }).toBe(1);
    });
  }
});

/**
 * Screen transitions (docs/mobile-motion-steps.md, step 3). The browser's startViewTransition is wrapped to record the types
 * each call asks for, so a test can say which direction React or the Back helper asked for without watching pixels.
 */
async function recordTransitions(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: string[][]; __anims: { pseudo: string; name: string; ms: number; delay: number; props: string[]; start: number }[] };
    w.__vt = [];
    w.__anims = [];
    const original = document.startViewTransition?.bind(document);
    if (original) {
      document.startViewTransition = ((arg?: { types?: string[] } | (() => void)) => {
        w.__vt.push(typeof arg === "object" && arg && Array.isArray(arg.types) ? [...arg.types] : []);
        return original(arg as never);
      }) as typeof document.startViewTransition;
    }
    // Remember the animations the snapshots run, so a test can read what the screens do while they move.
    const watch = () => {
      for (const a of document.getAnimations()) {
        const e = a.effect as KeyframeEffect | null;
        const pseudo = e?.pseudoElement ?? "";
        if (pseudo.startsWith("::view-transition") && a instanceof CSSAnimation && !w.__anims.some((x) => x.pseudo === pseudo && x.name === a.animationName)) {
          const t = e!.getComputedTiming();
          const props = new Set(e!.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k)));
          w.__anims.push({ pseudo, name: a.animationName, ms: Number(t.duration), delay: Number(t.delay), props: [...props].sort(), start: performance.now() });
        }
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
}
const transitions = (page: Page) => page.evaluate(() => (window as unknown as { __vt: string[][] }).__vt);
const animations = (page: Page) => page.evaluate(() => (window as unknown as { __anims: { pseudo: string; name: string; ms: number; delay: number; props: string[]; start: number }[] }).__anims.filter((a) => !a.pseudo.includes("(dock")));
const back = (page: Page) => page.getByRole("button", { name: mk.t("back") });
/** Home with its first card; the card opens a detail screen with a Back button. */
async function home(page: Page) {
  await recordTransitions(page);
  await page.goto("/app");
  await expect(page.locator("main.screen:not([data-pending])")).toBeVisible();
}
/** Drag across the phone, not the window: the pager only listens inside it. */
async function swipe(page: Page, from: number, to: number) {
  const phone = (await page.locator(".phone").boundingBox())!;
  const y = phone.y + 130;
  await page.mouse.move(phone.x + from, y);
  await page.mouse.down();
  await page.mouse.move(phone.x + to, y + 4, { steps: 10 });
  await page.mouse.up();
}

test.describe("screen transitions", () => {
  test("going deeper asks for nav-forward and lands on the screen, and Back asks for nav-back and returns", async ({ page }) => {
    await home(page);
    await page.locator("a.card.tile").first().click();
    await expect(page).not.toHaveURL(/\/app$/);
    await expect(back(page)).toBeVisible();
    expect((await transitions(page)).at(-1)).toContain("nav-forward");

    await back(page).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator("a.card.tile").first()).toBeVisible();
    expect((await transitions(page)).at(-1)).toEqual(["nav-back"]);
  });

  test("a row in Settings goes forward and Back returns to Settings", async ({ page }) => {
    await recordTransitions(page);
    await page.goto("/app/profile");
    await page.locator("a.item").first().click();
    await expect(page).not.toHaveURL(/\/app\/profile$/);
    expect((await transitions(page)).at(-1)).toContain("nav-forward");
    await back(page).click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    expect((await transitions(page)).at(-1)).toEqual(["nav-back"]);
  });

  test("a tab-bar tap asks for tab and lands on the tab", async ({ page }) => {
    await home(page);
    await page.locator(".tab").nth(1).click();
    await expect(page).toHaveURL(/\/app\/notifications$/);
    await expect(page.locator(".tab").nth(1)).toHaveAttribute("aria-current", "page");
    expect((await transitions(page)).at(-1)).toEqual(["tab"]);
  });

  test("a tab swap is a simultaneous opacity-only crossfade: old and new start together, last the same time, no scale, no delay, dock still", async ({ page }) => {
    await home(page);
    await page.locator(".tab").nth(1).click();
    await expect(page).toHaveURL(/\/app\/notifications$/);
    // The animations start a frame or two after the URL changes; under load, wait until both were seen.
    await expect.poll(async () => (await animations(page)).filter((a) => a.name === "vt-fade-out" || a.name === "vt-fade-in").length).toBe(2);
    const anims = await animations(page);
    const out = anims.find((a) => a.pseudo.startsWith("::view-transition-old(") && a.name === "vt-fade-out");
    const inn = anims.find((a) => a.pseudo.startsWith("::view-transition-new(") && a.name === "vt-fade-in");
    expect(out).toBeTruthy();
    expect(inn).toBeTruthy();
    expect(out!.ms).toBe(220);
    expect(inn!.ms).toBe(out!.ms);
    expect(out!.delay).toBe(0);
    expect(inn!.delay).toBe(0);
    // Created in the same frame, so they start together.
    expect(Math.abs(inn!.start - out!.start)).toBeLessThan(50);
    // Opacity only: no transform, no scale, no translate.
    expect(out!.props).toEqual(["opacity"]);
    expect(inn!.props).toEqual(["opacity"]);
    expect(anims.some((a) => a.name === "vt-pop-in")).toBe(false);
    // The dock has no animation of its own while the screens fade.
    const all = await page.evaluate(() => (window as unknown as { __anims: { pseudo: string }[] }).__anims.filter((a) => a.pseudo.includes("(dock")));
    expect(all).toEqual([]);
  });

  test("a swipe on the pager carries no transition type, runs no view-transition animation and still lands on the next tab", async ({ page }) => {
    await home(page);
    await page.waitForTimeout(600);
    await swipe(page, 330, 60);
    await expect(page).toHaveURL(/\/app\/notifications$/);
    await page.waitForTimeout(500);
    // React starts a transition for any screen change that mounts a boundary, but it carries no type, so nothing in it
    // animates: the pager's own slide is the only motion.
    expect((await transitions(page)).flat()).toEqual([]);
    expect(await animations(page)).toEqual([]);
  });

  test("the browser's own history move starts no view transition", async ({ page }) => {
    await home(page);
    await page.locator("a.card.tile").first().click();
    await expect(back(page)).toBeVisible();
    const before = (await transitions(page)).length;
    await page.goBack();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator("a.card.tile").first()).toBeVisible();
    expect((await transitions(page)).length).toBe(before);
  });

  test("a tap while a screen is still sliding in lands: Back at once returns to Home", async ({ page }) => {
    await home(page);
    await page.locator("a.card.tile").first().click();
    // No waiting for the slide: the overlay lets the tap through to the live page.
    await back(page).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator("a.card.tile").first()).toBeVisible();
  });

  test("a tab tapped during a tab swap lands on the last tab", async ({ page }) => {
    await home(page);
    await page.locator(".tab").nth(1).click();
    await page.locator(".tab").nth(2).click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect(page.locator(".tab").nth(2)).toHaveAttribute("aria-current", "page");
  });

  test("the overlay lets taps through", async ({ page }) => {
    await home(page);
    await page.locator(".tab").nth(1).click();
    const none = await page.evaluate(() => getComputedStyle(document.documentElement, "::view-transition").pointerEvents);
    // Outside a transition the pseudo-element does not exist and reads as the default; while one runs it must be none.
    expect(["none", "auto"]).toContain(none);
    const rule = await page.evaluate(() =>
      [...document.styleSheets].flatMap((s) => [...s.cssRules]).some((r) => r.cssText.startsWith("::view-transition {") && r.cssText.includes("pointer-events: none")),
    );
    expect(rule).toBe(true);
  });
});

test.describe("screen transitions with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a forward screen change still lands, as a short opacity fade with no slide", async ({ page }) => {
    await home(page);
    await page.locator("a.card.tile").first().click();
    await expect(page).not.toHaveURL(/\/app$/);
    await expect(back(page)).toBeVisible();
    const anims = (await animations(page)).filter((a) => a.pseudo.startsWith("::view-transition-new"));
    expect(anims.length).toBeGreaterThan(0);
    for (const a of anims) {
      expect(a.name).toBe("vt-fade-in");
      expect(a.ms).toBe(150);
    }
    await back(page).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test("a tab swap still lands", async ({ page }) => {
    await home(page);
    await page.locator(".tab").nth(2).click();
    await expect(page).toHaveURL(/\/app\/profile$/);
  });
});
