import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, SETTINGS_KEY, test } from "./fixtures";
import { go, openProjector, panel, reveal, send, start, teach, TEACHING_AT, T0 } from "./live-helpers";

/**
 * Accessibility, step 12: axe over the screens, in both languages and both kinds of institution, failing on a serious or critical issue
 * (contrast, names and roles, labels, headings, landmarks, tables). Focus order, keyboard and dialogs are in the specs of each screen.
 */

const SCREENS: [string, string][] = [
  ["today", "/teacher"],
  ["lessons", "/teacher/lessons"],
  ["new lesson", "/teacher/lessons/new"],
  ["a lesson", "/teacher/lessons/l-procenti"],
  ["library", "/teacher/library"],
  ["a library lesson", "/teacher/library/lib-statistika"],
  ["settings", "/teacher/settings"],
  ["help", "/teacher/help"],
  ["classes", "/teacher/classes"],
  ["a course", "/teacher/classes/course-ii-4"],
  ["not found", "/teacher/nothing-here"],
];

const found: string[] = [];
test.afterEach(() => {
  const all = found.splice(0);
  expect(all, "serious or critical accessibility issues").toEqual([]);
});

async function check(page: Page, what: string) {
  await page.waitForLoadState("load");
  await page.waitForTimeout(500);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of bad) {
    found.push(`${what}: ${v.id}: ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(" ") + " | " + (n.any[0]?.message ?? n.all[0]?.message ?? "")).join(" ;; ")}`);
  }
}

for (const [locale, schoolType] of [["mk", "school"], ["en", "school"], ["mk", "university"]] as const) {
  test(`axe: every screen, ${locale}, ${schoolType}`, async ({ page }) => {
    await page.addInitScript(([k, l, t]) => localStorage.setItem(k, JSON.stringify({ locale: l, schoolType: t, schoolSeen: true })), [SETTINGS_KEY, locale, schoolType]);
    for (const [name, url] of SCREENS) {
      await page.goto(url);
      await check(page, `${name} (${locale}, ${schoolType})`);
    }
  });
}

test.describe("signed out", () => {
  test.use({ account: null });
  for (const [name, url] of [["sign-in", "/teacher/sign-in"], ["not invited", "/teacher/sign-in?error=unknown_email"], ["signed out", "/teacher/sign-in?reason=signed_out"]]) {
    test(`axe: ${name}`, async ({ page }) => {
      await page.goto(url);
      await check(page, name);
    });
  }
  test("axe: the demo sheet", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await page.getByRole("button", { name: "Најави се со Google" }).click();
    await check(page, "sign-in with the demo sheet");
  });
});

test.describe("the live lesson", () => {
  test("axe: console and class view in the lobby, a question open, closed and shown", async ({ page, context }) => {
    await start(page, context);
    const projector = await openProjector(page, context);
    await check(page, "console, lobby");
    await check(projector, "class view, lobby");
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    await go(context, TEACHING_AT);
    await check(page, "console, teaching");
    await check(projector, "class view, between");
    await send(page).click();
    await check(page, "console, a question open");
    await check(projector, "class view, a question open");
    await go(context, TEACHING_AT + 31);
    await check(page, "console, closed");
    await check(projector, "class view, closed");
    await reveal(page).click();
    await check(page, "console, shown");
    await check(projector, "class view, shown");
  });
});

void panel; void teach; void T0;

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("nothing animates or eases: the drawer, the dialogs, the waiting dots and the switches all stand still", async ({ page }) => {
    await page.goto("/teacher/classes/course-ii-4");
    await page.waitForLoadState("load");
    const moving = await page.evaluate(() =>
      [...document.querySelectorAll("*")]
        .filter((e) => {
          const cs = getComputedStyle(e);
          const longest = (v: string) => Math.max(...v.split(",").map((d) => parseFloat(d) * (d.trim().endsWith("ms") ? 1 : 1000)));
          return longest(cs.transitionDuration) > 1 || longest(cs.animationDuration) > 1;
        })
        .map((e) => e.className?.toString().split(" ")[0]),
    );
    expect(moving).toEqual([]);
  });
});
