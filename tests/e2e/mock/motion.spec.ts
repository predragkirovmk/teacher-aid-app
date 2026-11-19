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
    name: "the last quiz tile on Home",
    open: async (page) => {
      await page.goto("/app");
      return page.locator("a.card.tile");
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
      return page.locator('.tab[href="/app/profile"]');
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
    name: "the bell on Home",
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
/**
 * The types of the last transition that asked for one. An untyped call (React starting a transition for a screen's own content
 * arriving, which does nothing: see ENTER and EXIT in Shell) can land after the typed one, and on a slow runner it does, so the
 * last call overall is not always the one the tap or Back made. And React can make the typed call after the URL and the screen
 * have changed, so a test polls for it instead of reading once.
 */
const lastAsked = async (page: Page) => (await transitions(page)).filter((types) => types.length > 0).at(-1) ?? [];
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
    await expect.poll(() => lastAsked(page)).toContain("nav-forward");

    await back(page).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator("a.card.tile").first()).toBeVisible();
    await expect.poll(() => lastAsked(page)).toEqual(["nav-back"]);
  });

  test("a row in Settings goes forward and Back returns to Settings", async ({ page }) => {
    await recordTransitions(page);
    await page.goto("/app/profile");
    await page.locator("a.item").first().click();
    await expect(page).not.toHaveURL(/\/app\/profile$/);
    await expect.poll(() => lastAsked(page)).toContain("nav-forward");
    await back(page).click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect.poll(() => lastAsked(page)).toEqual(["nav-back"]);
  });

  test("a tab-bar tap never asks for a slide and lands on the tab", async ({ page }) => {
    await home(page);
    await page.locator('.tab[href="/app/profile"]').click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect(page.locator('.tab[href="/app/profile"]')).toHaveAttribute("aria-current", "page");
    // Normally the call carries `tab`; React can lose a type under load, and Shell then crossfades by its own flag
    // (tab-crossfade.spec.ts proves the crossfade). What a tap must never do is ask for a slide or a swipe.
    await expect.poll(async () => (await transitions(page)).length).toBeGreaterThan(0);
    expect((await transitions(page)).flat().filter((type) => type !== "tab")).toEqual([]);
  });

  test("a tab swap is a simultaneous opacity-only crossfade: old and new start together, last the same time, no scale, no delay, dock still", async ({ page }) => {
    await home(page);
    await page.locator('.tab[href="/app/profile"]').click();
    await expect(page).toHaveURL(/\/app\/profile$/);
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

  test("a swipe on the pager asks for the swipe type, which animates nothing, and still lands on the next tab", async ({ page }) => {
    await home(page);
    await page.waitForTimeout(600);
    await swipe(page, 330, 60);
    await expect(page).toHaveURL(/\/app\/profile$/);
    await page.waitForTimeout(500);
    // The swipe type has no class in Shell, so nothing in the transition animates: the pager's own slide is the only
    // motion, with no crossfade after it. (It is a type of its own, not none, so other transitions can be off for it.)
    expect((await transitions(page)).flat()).toEqual(["swipe"]);
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
    await page.locator('.tab[href="/app/profile"]').click();
    await page.locator('.tab[href="/app"]').click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator('.tab[href="/app"]')).toHaveAttribute("aria-current", "page");
  });

  test("the overlay lets taps through", async ({ page }) => {
    await home(page);
    await page.locator('.tab[href="/app/profile"]').click();
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
    // The snapshots' animations start a frame or two after the screen changes; under load, wait until one was seen.
    const newOnes = async () => (await animations(page)).filter((a) => a.pseudo.startsWith("::view-transition-new"));
    await expect.poll(async () => (await newOnes()).length).toBeGreaterThan(0);
    for (const a of await newOnes()) {
      expect(a.name).toBe("vt-fade-in");
      expect(a.ms).toBe(150);
    }
    await back(page).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test("a tab swap still lands", async ({ page }) => {
    await home(page);
    await page.locator('.tab[href="/app/profile"]').click();
    await expect(page).toHaveURL(/\/app\/profile$/);
  });
});

/**
 * Entrances (docs/mobile-motion-steps.md, step 4, calm): rows, cards and states rise 8 px and fade, 35 ms apart and never later
 * than 240 ms; answer options are the one place that scales, a small pop from 0.96, 30 to 50 ms apart. Nothing rises after a
 * tab switch or on a screen that slides in. Read from the computed styles, which stay after an animation ends, so the test does
 * not race the animation.
 */
const ms = (v: string) => v.split(",").map((s) => (s.trim().endsWith("ms") ? parseFloat(s) : parseFloat(s) * 1000));
const entrance = (el: Locator) =>
  el.evaluate((n) => {
    const s = getComputedStyle(n);
    return { names: s.animationName.split(",").map((x) => x.trim()), delay: s.animationDelay, duration: s.animationDuration };
  });
/** Every entrance animation running anywhere on the page right now. */
const running = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a instanceof CSSAnimation && ["arrive", "arrive-fade", "q-opt-in"].includes(a.animationName))
      .map((a) => (a as CSSAnimation).animationName),
  );
const delaysOf = (page: Page, selector: string) =>
  page.evaluate(
    (sel) => [...document.querySelectorAll(sel)].map((n) => parseFloat(getComputedStyle(n).animationDelay.split(",")[0]) * 1000),
    selector,
  );

test.describe("entrances", () => {
  test("a quiz question's options pop in 30 to 50 ms apart, and a tap on the last one while it arrives records the answer", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/MATH-7B");
    await untilStage(page, "answering");
    const options = page.locator(".q-opt");
    expect(await options.count()).toBeGreaterThan(2);

    const delays = await delaysOf(page, ".q-opt");
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i] - delays[i - 1]).toBeGreaterThanOrEqual(30);
      expect(delays[i] - delays[i - 1]).toBeLessThanOrEqual(50);
    }
    const first = await entrance(options.first());
    expect(first.names).toEqual(["q-opt-in", "arrive-fade"]);
    const from = await options.first().evaluate((n) => {
      const k = n.getAnimations().find((a) => (a as CSSAnimation).animationName === "q-opt-in")!.effect as KeyframeEffect;
      return k.getKeyframes()[0].transform;
    });
    expect(from).toBe("scale(0.96)");

    // Hold every option part-way through its arrival, then tap the last one where it is: it must take the tap.
    await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        const t = (a.effect as KeyframeEffect | null)?.target;
        if (t instanceof Element && t.matches(".q-opt")) {
          a.pause();
          a.currentTime = 200;
        }
      }
    });
    const last = options.last();
    const box = (await last.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByText(mk.q("q.locked"))).toBeVisible();
  });

  test("a practice question's options pop in 30 to 50 ms apart and answer a tap at once", async ({ page }) => {
    await page.goto("/app/practice/ps-session-math-1");
    await expect(page.locator(".q-opt").first()).toBeVisible();
    const delays = await delaysOf(page, ".q-opt");
    expect(delays.length).toBeGreaterThan(2);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i] - delays[i - 1]).toBeGreaterThanOrEqual(30);
      expect(delays[i] - delays[i - 1]).toBeLessThanOrEqual(50);
    }
    await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        const t = (a.effect as KeyframeEffect | null)?.target;
        if (t instanceof Element && t.matches(".q-opt")) {
          a.pause();
          a.currentTime = 150;
        }
      }
    });
    const last = page.locator(".q-opt").last();
    const box = (await last.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(last).toHaveAttribute("aria-pressed", "true");
  });

  test("Home's cards rise once per session: the first Home rises, a return and a reload do not", async ({ page }) => {
    await page.goto("/app");
    const cards = page.locator(".rise");
    expect(await cards.count()).toBeGreaterThan(1);
    expect((await entrance(cards.first())).names).toEqual(["arrive", "arrive-fade"]);
    // 8 px and a fade, no scale: the one keyframe moves only transform, in translateY.
    const keyframe = await cards.first().evaluate((n) => (n.getAnimations().find((a) => (a as CSSAnimation).animationName === "arrive")!.effect as KeyframeEffect).getKeyframes()[0].transform);
    expect(keyframe).toBe("translateY(8px)");
    await expect(page.locator("html")).toHaveAttribute("data-rise-seen", "");
    await page.locator('.tab[href="/app/profile"]').click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    await page.locator('.tab[href="/app"]').click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(cards.first()).toBeVisible();
    expect((await entrance(cards.first())).names).toEqual(["none"]);
    await page.reload();
    expect((await entrance(page.locator(".rise").first())).names).toEqual(["none"]);
  });

  test("leaving Home before its intro is over still counts: coming back does not replay it", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator(".rise").first()).toBeVisible();
    await page.waitForTimeout(400);
    await page.locator('.tab[href="/app/profile"]').click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    await page.locator('.tab[href="/app"]').click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator("html")).toHaveAttribute("data-rise-seen", "");
    expect((await entrance(page.locator(".rise").first())).names).toEqual(["none"]);
  });

  test("a tab switch shows no entrance on the new tab, by tap", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("html")).toHaveAttribute("data-rise-seen", "");
    for (const tab of ["/app/profile", "/app"]) {
      await page.locator(`.tab[href="${tab}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${tab}$`));
      // Across the whole crossfade and after it, nothing rises.
      for (let i = 0; i < 6; i++) {
        expect(await running(page)).toEqual([]);
        await page.waitForTimeout(60);
      }
    }
  });

  test("a tab switch by swipe shows no entrance either", async ({ page }) => {
    await home(page);
    await expect(page.locator("html")).toHaveAttribute("data-rise-seen", "");
    await swipe(page, 330, 60);
    await expect(page).toHaveURL(/\/app\/profile$/);
    for (let i = 0; i < 8; i++) {
      expect(await running(page)).toEqual([]);
      await page.waitForTimeout(60);
    }
  });

  test("a deeper screen has no entrance on top of its slide", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("html")).toHaveAttribute("data-rise-seen", "");
    await page.locator("a.card.tile").first().click();
    await expect(page).not.toHaveURL(/\/app$/);
    for (let i = 0; i < 6; i++) {
      expect(await running(page)).toEqual([]);
      await page.waitForTimeout(60);
    }
  });

  test("a list that fills after loading staggers 35 ms apart and nobody waits more than 240 ms", async ({ page }) => {
    await page.goto("/app/summary");
    const rows = page.locator("main.screen ul.list > li");
    expect(await rows.count()).toBeGreaterThan(7);
    // The Gate sets this on <html> when a screen's data lands late (unit-tested); the mock answers at once, so set it by hand.
    await page.evaluate(() => document.documentElement.setAttribute("data-arrive", ""));
    const delays = await delaysOf(page, "main.screen ul.list > li");
    expect(delays[1] - delays[0]).toBeGreaterThanOrEqual(30);
    expect(delays[1] - delays[0]).toBeLessThanOrEqual(40);
    expect(Math.max(...delays)).toBeLessThanOrEqual(240);
    // After the sixth or seventh the rest arrive together.
    expect(delays.at(-1)).toBe(delays.at(-2));
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    const e = await entrance(rows.first());
    expect(e.names).toEqual(["arrive", "arrive-fade"]);
    expect(ms(e.duration)[1]).toBe(180);
  });

  test("a bottom sheet rises on the snappy spring and leaves faster than it came", async ({ page }) => {
    await page.goto("/app/profile");
    await page.getByRole("main").getByRole("button", { name: mk.t("drawer.logout") }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const e = await entrance(sheet);
    expect(e.names).toEqual(["slide-up"]);
    const rise = ms(e.duration)[0];
    expect(rise).toBe(390);
    await sheet.getByRole("button").first().click();
    // The exit is 230 ms (SHEET_EXIT_MS), shorter than the rise.
    const t0 = Date.now();
    await expect(sheet).toBeHidden();
    expect(Date.now() - t0).toBeLessThan(rise);
  });

  test("a sheet closed while it is still rising leaves from where it is, with no jump", async ({ page }) => {
    await page.goto("/app/profile");
    await page.getByRole("main").getByRole("button", { name: mk.t("drawer.logout") }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    // Close it a moment into the rise and read where it is on the next frames: it must be near its resting place, not already gone.
    const ys = await sheet.evaluate(
      (n) =>
        new Promise<number[]>((done) => {
          const y = () => new DOMMatrix(getComputedStyle(n).transform).m42;
          setTimeout(() => {
            n.querySelector<HTMLButtonElement>("button")!.click();
            const seen: number[] = [];
            const frame = () => {
              seen.push(y());
              if (seen.length < 4) requestAnimationFrame(frame);
              else done(seen);
            };
            requestAnimationFrame(frame);
          }, 100);
        }),
    );
    expect(Math.max(...ys.slice(0, 2))).toBeLessThan(120);
    await expect(sheet).toBeHidden();
  });
});

test.describe("entrances with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("Home and a list are a plain 150 ms fade, no translate, no scale, no delay", async ({ page }) => {
    await page.goto("/app");
    const card = page.locator(".rise").first();
    const e = await entrance(card);
    expect(e.names).toEqual(["arrive-fade"]);
    expect(ms(e.duration)).toEqual([150]);
    expect(ms(e.delay)).toEqual([0]);
    expect(await card.evaluate((n) => n.getAnimations().flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k))).filter((k) => ["transform", "scale", "translate"].includes(k)))).toEqual([]);

    await page.goto("/app/summary");
    await page.evaluate(() => document.documentElement.setAttribute("data-arrive", ""));
    const delays = await delaysOf(page, "main.screen ul.list > li");
    expect(delays.every((d) => d === 0)).toBe(true);
    expect((await entrance(page.locator("main.screen ul.list > li").first())).names).toEqual(["arrive-fade"]);
  });

  test("a quiz question's options fade with no scale and no stagger", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/MATH-7B");
    await untilStage(page, "answering");
    const delays = await delaysOf(page, ".q-opt");
    expect(delays.length).toBeGreaterThan(2);
    expect(delays.every((d) => d === 0)).toBe(true);
    const e = await entrance(page.locator(".q-opt").first());
    expect(e.names).toEqual(["arrive-fade"]);
    expect(ms(e.duration)).toEqual([150]);
  });
});
