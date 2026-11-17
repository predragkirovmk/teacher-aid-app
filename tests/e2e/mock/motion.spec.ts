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
