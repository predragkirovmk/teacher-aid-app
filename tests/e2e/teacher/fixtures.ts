import { test as base, expect, type Page } from "@playwright/test";

/**
 * The demo's session is a key in localStorage, standing in for the API's cookie (lib/teacher/api/mock-session.ts). Most
 * tests are about what a signed-in teacher does, so they start with the key set, as a teacher who signed in yesterday has it;
 * the tests of signing in set `account` to null and start with nobody.
 */
export const SESSION_KEY = "teacheraid-teacher-session-v1";
export const MOCK_KEY = "teacheraid-teacher-mock-v1";
export const SETTINGS_KEY = "teacheraid-teacher-v1";

export type Account = "veteran" | "novice" | null;

export const test = base.extend<{ account: Account }>({
  account: ["veteran", { option: true }],
  page: async ({ page, account }, provide) => {
    if (account) {
      // Once per tab: a test that signs out must stay signed out when the next page loads.
      await page.addInitScript(
        ([key, persona]) => {
          if (sessionStorage.getItem("e2e-signed-in")) return;
          sessionStorage.setItem("e2e-signed-in", "1");
          if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ persona }));
        },
        [SESSION_KEY, account],
      );
    }
    await provide(page);
  },
});

export { expect };

/** The session key as the page has it: who is signed in, or null. */
export const sessionOf = async (page: Page): Promise<string | null> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.persona ?? null, SESSION_KEY);

/**
 * Lets every animation that ends (an arrival, a mark that lands, a bar that grows) finish, so what is measured next is at rest;
 * a wait that turns is left turning. Measure a place or a strength after this, not while the page is still coming in.
 */
export const settled = (page: Page): Promise<void> =>
  page.evaluate(async () => {
    const ending = document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.all(ending.map((a) => a.finished.catch(() => null)));
  });
