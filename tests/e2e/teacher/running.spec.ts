import type { BrowserContext, Page } from "@playwright/test";
import { expect, SETTINGS_KEY, tall, test } from "./fixtures";

/**
 * The reminder that a lesson is running, on every page but Today (which has its band) and the lesson's own screen: in the
 * sidebar on a laptop, in the top bar where the sidebar is a drawer. In mock mode, in Macedonian unless a test changes the
 * language. The demo's running lesson is "Основи на веројатноста" with IV-1.
 */

const NOW = new Date("2026-10-29T09:30:00+01:00");
const title = (page: Page) => page.getByRole("heading", { level: 1 });
const mainMenu = (page: Page) => page.getByRole("navigation").first();
const yellow = (page: Page) => page.locator(".btn--primary:visible");
const demoButton = (page: Page, name: string) => page.getByRole("button", { name });
/** The words with the class, whichever way the name is put together for a screen reader (a comma may or may not have a space before it). */
const reminder = (page: Page, name: RegExp | string = /^Час во тек\s*,\s*IV-1$/) => page.getByRole("group", { name });
const back = (page: Page) => page.getByRole("link", { name: "Врати се на часот, IV-1", exact: true });

/** Every page the sidebar leads to, and the ones under them, but Today. */
const PAGES = [
  { path: "/teacher/lessons", heading: "Лекции" },
  { path: "/teacher/lessons/new", heading: "Подготви лекција" },
  { path: "/teacher/lessons/l-procenti", heading: "Проценти и пропорции" },
  { path: "/teacher/classes", heading: "Класови" },
  { path: "/teacher/library", heading: "Библиотека" },
  { path: "/teacher/settings", heading: "Поставки" },
  { path: "/teacher/help", heading: "Помош" },
];

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

async function simulate(page: Page) {
  await page.goto("/teacher/settings");
  await demoButton(page, "Симулирај час во тек").click();
  await expect(page.getByRole("status")).toHaveText("Готово. На Денес сега се гледа час во тек.");
}

test.describe("with a lesson running, on a laptop", () => {
  test("every page but Today says so in the sidebar, with the class and the way back", async ({ page }) => {
    await simulate(page);
    for (const { path, heading } of PAGES) {
      await page.goto(path);
      await expect(title(page)).toHaveText(heading);
      await expect(reminder(page), path).toBeVisible();
      // What is seen reads "Час во тек · IV-1"; a comma only a screen reader hears sits after the dot.
      await expect(reminder(page)).toContainText(/Час во тек ·\s*,?\s*IV-1/);
      await expect(back(page), path).toHaveAttribute("href", /^\/teacher\/live\/s-n\d+$/);
      await expect(back(page)).toHaveText("Врати се");
    }
  });

  test("Today has its band instead, and the lesson's own screen needs no reminder", async ({ page }) => {
    await simulate(page);
    await page.goto("/teacher");
    await expect(title(page)).toHaveText("Денес");
    await expect(page.getByRole("region", { name: "Час во тек" })).toBeVisible();
    await expect(reminder(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Врати се на часот" })).toHaveCount(1);

    await page.getByRole("link", { name: "Врати се на часот" }).click();
    await expect(page).toHaveURL(/\/teacher\/live\/s-n\d+$/);
    await expect(title(page)).toHaveText("Час во тек");
    await expect(reminder(page)).toHaveCount(0);
  });

  test("says nothing when no lesson is running", async ({ page }) => {
    for (const path of ["/teacher", ...PAGES.map((p) => p.path)]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.getByRole("group", { name: /Час во тек/ }), path).toHaveCount(0);
    }
  });

  test("one press leads back to the lesson, and from there the reminder is gone", async ({ page }) => {
    await simulate(page);
    await mainMenu(page).getByRole("link", { name: "Библиотека" }).click();
    await expect(title(page)).toHaveText("Библиотека");
    await back(page).click();
    await expect(page).toHaveURL(/\/teacher\/live\/s-n\d+$/);
    await expect(title(page)).toHaveText("Час во тек");
    await expect(reminder(page)).toHaveCount(0);
  });

  test("a lesson started from Today is there on the next page the teacher goes to", async ({ page }) => {
    await page.goto("/teacher");
    await page.locator(".lessons > li", { hasText: "Проценти и пропорции" }).getByRole("button", { name: "Започни час" }).click();
    await page.getByRole("dialog", { name: "Со кој клас?" }).getByRole("radio", { name: /III-5/ }).check();
    await page.getByRole("dialog").getByRole("button", { name: /^Започни( со .+)?$/ }).click();
    await expect(page).toHaveURL(/\/teacher\/live\/s-n\d+$/);
    await expect(reminder(page)).toHaveCount(0);

    await mainMenu(page).getByRole("link", { name: "Класови" }).click();
    await expect(title(page)).toHaveText("Класови");
    await expect(reminder(page, /^Час во тек\s*,\s*III-5$/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Врати се на часот, III-5", exact: true })).toBeVisible();
  });

  const endFrom = async (page: Page) => {
    await reminder(page).getByRole("button", { name: "Заврши го часот" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Да, заврши го часот" }).click();
  };

  test("goes the moment the lesson is ended, from the reminder, which leads to the end page", async ({ page }) => {
    await simulate(page);
    await expect(reminder(page)).toBeVisible();
    await expect(reminder(page).getByRole("button", { name: "Заврши го часот" })).toHaveClass(/btn--danger/);
    await endFrom(page);
    await expect(title(page)).toHaveText("Часот заврши");
    await expect(reminder(page)).toHaveCount(0);
    // And comes back the moment one is shown again.
    await page.goto("/teacher/settings");
    await demoButton(page, "Симулирај час во тек").click();
    // Another lesson is shown now: the one that was run is a held one.
    await expect(reminder(page, /^Час во тек\s*,/)).toBeVisible();
  });

  test("follows a lesson started or closed in another window, with no change of page", async ({ page, context }: { page: Page; context: BrowserContext }) => {
    await page.goto("/teacher/library");
    await expect(title(page)).toHaveText("Библиотека");
    await expect(reminder(page)).toHaveCount(0);

    const other = await context.newPage();
    await other.clock.setFixedTime(NOW);
    await simulate(other);
    await expect(reminder(page)).toBeVisible();

    await endFrom(other);
    await expect(reminder(page)).toHaveCount(0);
  });

  test("is told apart from the menu by more than colour: an icon, words, an edge and a button, and none of it is yellow", async ({ page }) => {
    await simulate(page);
    await page.goto("/teacher/classes");
    const tile = reminder(page);
    await expect(tile.locator("svg")).toHaveCount(3);
    await expect(back(page)).toHaveClass(/btn--secondary/);
    await expect(back(page)).not.toHaveClass(/btn--primary/);
    // The edge is white and 2px; the tile has its own ground, which the menu rows do not.
    await expect(tile).toHaveCSS("border-top-width", "2px");
    await expect(tile).toHaveCSS("border-top-color", "rgb(255, 255, 255)");
    expect(await tile.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    // Nothing on it moves, ever.
    expect(await tile.evaluate((el) => [el, ...el.querySelectorAll("*")].flatMap((e) => e.getAnimations()).length)).toBe(0);
    for (const e of await tile.evaluate((el) => [el, ...el.querySelectorAll("*")].map((x) => getComputedStyle(x).animationName))) expect(e).toBe("none");
    // Its screen's yellow stays with its own one button: the lesson's start button is not yellow while a lesson runs.
    await page.goto("/teacher/lessons/l-procenti");
    await expect(title(page)).toHaveText("Проценти и пропорции");
    await expect(reminder(page)).toBeVisible();
    await expect(yellow(page)).toHaveCount(0);
  });

  test("is big enough and plain enough: the button is 48px tall, nothing under 16px, and it sits under the four places, so the menu does not move", async ({ page }) => {
    await page.goto("/teacher/classes");
    const rowsBefore = await mainMenu(page).getByRole("link").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    const footBefore = (await page.getByRole("navigation").nth(1).boundingBox())!.y;
    await simulate(page);
    await page.goto("/teacher/classes");
    await expect(reminder(page)).toBeVisible();
    expect(await tall(back(page))).toBeGreaterThanOrEqual(48);
    const small = await reminder(page).evaluate((el) =>
      [el, ...el.querySelectorAll("*")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()) && parseFloat(getComputedStyle(e).fontSize) < 16).length,
    );
    expect(small).toBe(0);
    expect(await mainMenu(page).getByRole("link").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))).toEqual(rowsBefore);
    const [tile, last, foot] = [(await reminder(page).boundingBox())!, (await mainMenu(page).getByRole("link").last().boundingBox())!, (await page.getByRole("navigation").nth(1).boundingBox())!];
    expect(tile.y).toBeGreaterThan(last.y + last.height);
    expect(tile.y + tile.height).toBeLessThanOrEqual(foot.y);
    expect(foot.y).toBe(footBefore);
  });

  test("is reached after the menu and before Settings with the keyboard, and Enter on it goes back to the lesson", async ({ page }) => {
    await simulate(page);
    await page.goto("/teacher/library");
    await mainMenu(page).getByRole("link", { name: "Библиотека" }).focus();
    await page.keyboard.press("Tab");
    await expect(back(page)).toBeFocused();
    // Then End, the red one; the way back is first, so a press of Enter on a Tab from the menu never ends a lesson.
    await page.keyboard.press("Tab");
    await expect(reminder(page).getByRole("button", { name: "Заврши го часот" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("navigation").nth(1).getByRole("link", { name: "Поставки" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/teacher\/live\/s-n\d+$/);
  });

  test("is in English, and at a faculty it names the group", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "en", schoolType: "university", schoolSeen: true })), SETTINGS_KEY);
    await page.goto("/teacher/settings");
    await demoButton(page, "Pretend a lesson is running").click();
    await page.getByRole("navigation").first().getByRole("link", { name: "Library" }).click();
    const tile = page.getByRole("group", { name: /^Lesson running\s*,\s*Група 1А$/ });
    await expect(tile).toBeVisible();
    await expect(tile).toContainText(/Lesson running ·\s*,?\s*Група 1А/);
    const link = tile.getByRole("link", { name: "Return to the lesson, Група 1А", exact: true });
    await expect(link).toHaveText("Return");
  });
});

test.describe("with a lesson running, where the sidebar is a drawer", () => {
  test.use({ viewport: { width: 900, height: 900 } });

  test("the top bar carries it, once, and the drawer does not repeat it", async ({ page }) => {
    await simulate(page);
    await page.goto("/teacher/lessons");
    const bar = page.locator("header.topbar");
    await expect(bar.getByRole("group", { name: /^Час во тек\s*,\s*IV-1$/ })).toBeVisible();
    await expect(bar.getByRole("link", { name: "Врати се на часот, IV-1", exact: true })).toBeVisible();
    // The sidebar's own copy is hidden, so there is one on screen and one for a screen reader.
    await expect(reminder(page)).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Врати се на часот, IV-1", exact: true })).toHaveCount(1);
    // The Menu button and the brand are where they always were.
    const menu = page.getByRole("button", { name: "Мени", exact: true });
    expect((await menu.boundingBox())!.x).toBeLessThan(40);

    // With the drawer open the bar is behind it and cannot be reached, and the drawer does not carry a second one.
    await menu.click();
    const drawer = page.getByRole("dialog", { name: "Мени" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("group")).toHaveCount(0);
    await expect(bar).toHaveJSProperty("inert", true);
    await page.keyboard.press("Escape");
    await expect(bar).toHaveJSProperty("inert", false);
    await expect(reminder(page)).toBeVisible();
    await expect(menu).toBeFocused();
  });

  test("and goes back to the lesson in one press", async ({ page }) => {
    await simulate(page);
    await page.goto("/teacher/help");
    await page.locator("header.topbar").getByRole("link", { name: "Врати се на часот, IV-1", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher\/live\/s-n\d+$/);
    await expect(reminder(page)).toHaveCount(0);
  });

  test("Today has no second reminder in the top bar", async ({ page }) => {
    await simulate(page);
    await page.goto("/teacher");
    await expect(page.getByRole("region", { name: "Час во тек" })).toBeVisible();
    await expect(page.locator("header.topbar").getByRole("group")).toHaveCount(0);
    await expect(yellow(page)).toHaveCount(1);
  });
});

test.describe("with a lesson running, in a zoomed window", () => {
  // 200% on a 1280 x 720 window leaves 640 x 360 CSS pixels; 400% leaves 320 x 180.
  for (const [zoom, viewport] of [
    ["200%", { width: 640, height: 360 }],
    ["400%", { width: 320, height: 180 }],
  ] as const) {
    test(`at ${zoom} nothing runs off the side and the reminder is reachable, with the top bar scrolling away instead of covering the page`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await simulate(page);
      for (const path of ["/teacher/lessons", "/teacher/settings", "/teacher/lessons/l-procenti"]) {
        await page.goto(path);
        await expect(page.locator("h1")).toBeVisible();
        const bar = page.locator("header.topbar");
        await expect(bar.getByRole("link", { name: "Врати се на часот, IV-1", exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
        // Too short to spare the room: the bar is part of the page, not stuck over it.
        await expect(bar).toHaveCSS("position", "static");
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(100);
        expect((await bar.boundingBox())!.y, path).toBeLessThan(0);
      }
    });
  }

  test("at a phone's width the words come first and the button under them, and the bar scrolls away with the page", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await simulate(page);
    await page.goto("/teacher/library");
    const bar = page.locator("header.topbar");
    const group = bar.getByRole("group", { name: /^Час во тек\s*,\s*IV-1$/ });
    const link = bar.getByRole("link", { name: "Врати се на часот, IV-1", exact: true });
    await expect(group).toBeVisible();
    const [words, button, tile] = [(await group.locator(".running__tag").boundingBox())!, (await link.boundingBox())!, (await group.boundingBox())!];
    expect(button.y).toBeGreaterThanOrEqual(words.y + words.height);
    expect(button.width).toBeGreaterThan(tile.width * 0.8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await expect(bar).toHaveCSS("position", "static");
  });

  test("in a window that is wide and tall enough the bar holds the words and the button in one row, and stays on top", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await simulate(page);
    await page.goto("/teacher/library");
    const bar = page.locator("header.topbar");
    const group = bar.getByRole("group", { name: /^Час во тек\s*,\s*IV-1$/ });
    const [words, button] = [(await group.locator(".running__tag").boundingBox())!, (await bar.getByRole("link", { name: "Врати се на часот, IV-1", exact: true }).boundingBox())!];
    expect(Math.abs(words.y + words.height / 2 - (button.y + button.height / 2))).toBeLessThan(8);
    await expect(bar).toHaveCSS("position", "sticky");
  });

  test("in a window that is tall enough the top bar stays on top, whole, with the reminder in it", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 800 });
    await simulate(page);
    await page.goto("/teacher/lessons/l-procenti");
    const bar = page.locator("header.topbar");
    await expect(bar).toHaveCSS("position", "sticky");
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(100);
    expect((await bar.boundingBox())!.y).toBe(0);
    await expect(bar.getByRole("link", { name: "Врати се на часот, IV-1", exact: true })).toBeInViewport();
  });
});
