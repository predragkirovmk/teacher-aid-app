import { expect, test as base, type Page } from "@playwright/test";
import { dictionaries, type Key } from "@/lib/app/i18n";
import { dictionaries as quizDictionaries, type QKey } from "@/lib/app/quiz-copy";
import type { Locale } from "@/lib/app/api/types";
import { NOTICE_VERSION } from "@/lib/app/privacy";

/** Where the demo's local data lives; the key is the app's own (lib/app/api/mock/store.ts). */
export const STORE_KEY = "teacheraid-app-v1";
export const LOCALE_KEY = "teacheraid-locale";

const fill = (s: string, vars?: Record<string, string | number>) =>
  vars ? Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), s) : s;

/** The app's own words, so a copy edit does not break a test that is not about copy. */
export const copy = (locale: Locale) => ({
  t: (key: Key, vars?: Record<string, string | number>) => fill(dictionaries[locale][key], vars),
  q: (key: QKey, vars?: Record<string, string | number>) => fill(quizDictionaries[locale][key], vars),
});
export const mk = copy("mk");
export const en = copy("en");

/** A string as an exact, whole-text match for getByText and getByRole names. */
export const exact = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

type Seed = {
  /**
   * Fields of the demo's saved state to start from (signedIn, read, checkins, clock, ...). A test that gives none starts signed in.
   * The student has already acknowledged the privacy notice (`noticeVersion`), as every student but a new one has; a test about
   * the notice says `noticeVersion: null`, or an older version.
   */
  state?: Record<string, unknown>;
  locale?: Locale;
};

/**
 * Start the page from known local data. Call it before the first goto. Each test gets a new
 * browser context, so nothing carries over from another test; the fixture below also clears
 * localStorage once per context, so a shared context or a stored session could not leak either.
 * Init scripts run on every navigation; these act once, so a reload keeps what the app saved.
 */
export async function start(page: Page, seed: Seed) {
  await page.addInitScript(
    ({ seed, storeKey, localeKey, noticeVersion }) => {
      if (sessionStorage.getItem("__e2e_seeded")) return;
      sessionStorage.setItem("__e2e_seeded", "1");
      if (seed.state) localStorage.setItem(storeKey, JSON.stringify({ noticeVersion, noticeAt: Date.now(), ...seed.state }));
      if (seed.locale) localStorage.setItem(localeKey, seed.locale);
    },
    { seed, storeKey: STORE_KEY, localeKey: LOCALE_KEY, noticeVersion: NOTICE_VERSION },
  );
}

export const test = base.extend<{ allowConsoleErrors: RegExp[] }>({
  /**
   * Console errors a test expects, such as the 404 of a page it opens on purpose. A Vercel preview
   * injects its feedback toolbar, which the app's CSP blocks; that is the preview's, not the app's.
   */
  allowConsoleErrors: [[/https:\/\/vercel\.live\//], { option: true }],

  // Every test fails on an uncaught error or a console error: a smoke test should notice both.
  page: async ({ page, allowConsoleErrors }, run) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !allowConsoleErrors.some((re) => re.test(m.text()))) problems.push(`console.error: ${m.text()}`);
    });
    // Every test starts as a student who is signed in, which is what most of them are about; a test about
    // signing in says `signedIn: false` through `start`. (A phone that has never been used is signed out.)
    await page.addInitScript(
      ({ storeKey, noticeVersion }) => {
        if (sessionStorage.getItem("__e2e_cleared")) return;
        sessionStorage.setItem("__e2e_cleared", "1");
        localStorage.clear();
        localStorage.setItem(storeKey, JSON.stringify({ signedIn: true, noticeVersion, noticeAt: Date.now() }));
      },
      { storeKey: STORE_KEY, noticeVersion: NOTICE_VERSION },
    );
    // `run`, not `use`: Playwright's name for it trips the React hooks lint rule.
    await run(page);
    expect(problems, "errors in the browser").toEqual([]);
  },
});

export { expect };

/**
 * Run the demo's clock on, in half-second steps, until the quiz is at `stage` (the `data-stage` of its screen).
 * A test about a pop-up waits for `answering`, not for a button.
 */
export async function untilStage(page: Page, stage: string, steps = 600) {
  const main = page.locator("main.q");
  for (let i = 0; i < steps && (await main.getAttribute("data-stage").catch(() => null)) !== stage; i++) {
    await page.clock.fastForward(500);
    await page.waitForTimeout(30);
  }
  await expect(main).toHaveAttribute("data-stage", stage);
}
