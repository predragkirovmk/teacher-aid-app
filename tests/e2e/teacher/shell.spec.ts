import type { Page } from "@playwright/test";
import { expect, MOCK_KEY, SETTINGS_KEY, test } from "./fixtures";

/**
 * Smoke tests of the teacher shell, in mock mode, in Macedonian unless a test changes the language. They read like what a
 * teacher does: go to a page, press a button, see what changed.
 */

// The two menus, whatever the language: the four places first, then settings, help and sign out.
const mainMenu = (page: Page) => page.getByRole("navigation").first();
const moreMenu = (page: Page) => page.getByRole("navigation").nth(1);
const title = (page: Page) => page.getByRole("heading", { level: 1 });

test.describe("the sidebar", () => {
  test("every destination opens, says where you are and is marked as the current page", async ({ page }) => {
    await page.goto("/teacher");
    await expect(title(page)).toHaveText("Денес");
    await expect(mainMenu(page).getByRole("link", { name: "Денес" })).toHaveAttribute("aria-current", "page");

    const destinations = [
      { menu: mainMenu, link: "Лекции", path: "/teacher/lessons", heading: "Лекции" },
      { menu: mainMenu, link: "Класови", path: "/teacher/classes", heading: "Класови" },
      { menu: mainMenu, link: "Библиотека", path: "/teacher/library", heading: "Библиотека" },
      { menu: moreMenu, link: "Поставки", path: "/teacher/settings", heading: "Поставки" },
      { menu: moreMenu, link: "Помош", path: "/teacher/help", heading: "Помош" },
      { menu: mainMenu, link: "Денес", path: "/teacher", heading: "Денес" },
    ];
    for (const d of destinations) {
      const link = d.menu(page).getByRole("link", { name: d.link });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${d.path}$`));
      await expect(title(page)).toHaveText(d.heading);
      await expect(page).toHaveTitle(`${d.heading} · TeacherAid`);
      await expect(link).toHaveAttribute("aria-current", "page");
    }
  });

  test("the sidebar stays on screen on a laptop, with four labelled destinations", async ({ page }) => {
    await page.goto("/teacher/library");
    await expect(mainMenu(page).getByRole("link")).toHaveText(["Денес", "Лекции", "Класови", "Библиотека"]);
    await expect(page.getByRole("button", { name: "Мени", exact: true })).toBeHidden();
  });
});

test.describe("the frame on a long page", () => {
  // A long page is one that scrolls: the new lesson's form with its sentences open.
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1024, 768],
    [900, 700],
  ] as const) {
    test(`at ${width} x ${height}, scrolled to the bottom: the skip link is out of sight and the sidebar (or the top bar) still keeps its place`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/teacher/lessons/new");
      await page.getByRole("radio", { name: /^Неколку реченици/ }).check();
      await page.mouse.move(width / 2, height / 2);
      for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 400);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);

      await expect(page.getByRole("link", { name: "Прескокни кон содржината" })).not.toBeInViewport();
      if (width >= 1024) {
        // The sidebar is a panel that floats 12px inside the window, as tall as the window allows.
        const sidebar = (await page.locator("#sidebar").boundingBox())!;
        expect(sidebar.y).toBe(12);
        expect(sidebar.height).toBe(height - 24);
      } else {
        const bar = (await page.locator(".topbar").boundingBox())!;
        expect(bar.y).toBe(0);
      }
    });
  }

  test("the first Tab shows the skip link, and Enter moves the focus to the page's content", async ({ page }) => {
    await page.goto("/teacher/lessons/new");
    // The frame is drawn once the sign-in is read; a Tab before that lands on nothing.
    await expect(page.locator("h1")).toBeVisible();
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Прескокни кон содржината" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
    await expect(skip).not.toBeInViewport();
  });
});

test.describe("the teacher", () => {
  test("the name, the initials and the greeting come from the account", async ({ page }) => {
    await page.goto("/teacher");
    // Who is signed in is said once, at the foot of the sidebar, and it leads to Settings; the page's own top has no name on it.
    const me = page.locator("#sidebar").getByRole("link", { name: "Марија Петровска, поставки" });
    await expect(me).toBeVisible();
    await expect(me).toHaveText("Марија Петровска");
    await expect(me.locator(".me__badge")).toHaveAttribute("data-initials", "МП");
    await expect(page.locator("main").getByRole("link", { name: /поставки$/ })).toHaveCount(0);
    await expect(page.getByText(/^(Добро утро|Добар ден|Добра вечер), Марија$/)).toBeVisible();
  });

  test("the English interface writes the name in Latin letters", async ({ page }) => {
    await page.goto("/teacher/settings");
    await page.getByRole("radio", { name: "English" }).check();
    await expect(title(page)).toHaveText("Settings");
    const me = page.getByRole("link", { name: "Marija Petrovska, settings" });
    await expect(me.locator(".me__badge")).toHaveAttribute("data-initials", "MP");
    await expect(page.getByText("Marija Petrovska, teacher")).toBeVisible();
    await mainMenu(page).getByRole("link", { name: "Today" }).click();
    await expect(page.getByText(/^Good (morning|afternoon|evening), Marija$/)).toBeVisible();
  });
});

test.describe("settings", () => {
  test("the language is kept after a reload and on every page", async ({ page }) => {
    await page.goto("/teacher/settings");
    await page.getByRole("radio", { name: "English" }).check();
    await expect(title(page)).toHaveText("Settings");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.reload();
    await expect(title(page)).toHaveText("Settings");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), SETTINGS_KEY)) ?? "{}").locale).toBe("en");

    await mainMenu(page).getByRole("link", { name: "Lessons" }).click();
    await expect(title(page)).toHaveText("Lessons");
    await moreMenu(page).getByRole("link", { name: "Help" }).click();
    await expect(title(page)).toHaveText("Help");

    await moreMenu(page).getByRole("link", { name: "Settings" }).click();
    await page.getByRole("radio", { name: "Македонски" }).check();
    await expect(title(page)).toHaveText("Поставки");
    await expect(page.locator("html")).toHaveAttribute("lang", "mk");
  });

  test("the type of institution changes the words: classes and students, or groups and students", async ({ page }) => {
    await page.goto("/teacher/settings");
    await expect(mainMenu(page).getByRole("link", { name: "Класови" })).toBeVisible();
    await expect(page.getByText("Марија Петровска, наставник")).toBeVisible();

    await page.getByRole("radio", { name: "Факултет" }).check();
    await expect(mainMenu(page).getByRole("link", { name: "Групи" })).toBeVisible();
    await expect(mainMenu(page).getByRole("link", { name: "Класови" })).toHaveCount(0);
    await expect(page.getByText("Марија Петровска, професор")).toBeVisible();

    // It is kept, and Today asks for a group and speaks of the students of a faculty.
    await page.reload();
    await expect(mainMenu(page).getByRole("link", { name: "Групи" })).toBeVisible();
    await mainMenu(page).getByRole("link", { name: "Денес" }).click();
    await page.getByRole("button", { name: "Започни час" }).first().click();
    await expect(page.getByRole("dialog", { name: "Со која група?" })).toContainText("28 студенти");
    await page.getByRole("button", { name: "Откажи" }).click();

    await moreMenu(page).getByRole("link", { name: "Поставки" }).click();
    await page.getByRole("radio", { name: "Средно училиште" }).check();
    await expect(mainMenu(page).getByRole("link", { name: "Класови" })).toBeVisible();
    await mainMenu(page).getByRole("link", { name: "Денес" }).click();
    await page.getByRole("button", { name: "Започни час" }).first().click();
    await expect(page.getByRole("dialog", { name: "Со кој клас?" })).toContainText("28 ученици");
    await page.getByRole("button", { name: "Откажи" }).click();
  });

  test("in English a faculty has groups and a school has classes", async ({ page }) => {
    await page.goto("/teacher/settings");
    await page.getByRole("radio", { name: "English" }).check();
    await page.getByRole("radio", { name: "University" }).check();
    await expect(mainMenu(page).getByRole("link", { name: "Groups" })).toBeVisible();
    await expect(page.getByText("Marija Petrovska, professor")).toBeVisible();
    await page.getByRole("radio", { name: "Secondary school" }).check();
    await expect(mainMenu(page).getByRole("link", { name: "Classes" })).toBeVisible();
  });

  test("Reset demo data asks first, keeps everything on No, and starts the demo over on Yes", async ({ page }) => {
    await page.goto("/teacher/settings");
    await page.getByRole("radio", { name: "English" }).check();
    await page.getByRole("radio", { name: "University" }).check();
    // The demo has been used: something is saved in it.
    await page.evaluate((key) => {
      const state = JSON.parse(localStorage.getItem(key) ?? "null");
      state.school.counter = 7;
      state.school.speed_bonus = { "course-ii-4": false };
      localStorage.setItem(key, JSON.stringify(state));
    }, MOCK_KEY);
    const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), MOCK_KEY);

    const dialog = page.getByRole("alertdialog", { name: "Do you want to reset the demo data?" });
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Reset the demo data" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "No, keep them" })).toBeFocused();
    await expect(dialog).toHaveAccessibleDescription("The lessons you prepared in this demo will disappear.");
    // The sentence under the question has room before the buttons (a card's paragraph rules must not reach into the dialog).
    await expect(dialog.locator(".dialog__body")).toHaveCSS("margin-bottom", "24px");

    // No: nothing changes.
    await dialog.getByRole("button", { name: "No, keep them" }).click();
    await expect(dialog).toBeHidden();
    expect((await saved()).school.counter).toBe(7);
    await expect(page.getByRole("status")).toHaveCount(0);

    // Escape is No as well.
    await page.getByRole("button", { name: "Reset the demo data" }).click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect((await saved()).school.counter).toBe(7);

    // Yes: the demo starts over; the language and the type of institution are settings and stay.
    await page.getByRole("button", { name: "Reset the demo data" }).click();
    await dialog.getByRole("button", { name: "Yes, reset" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status")).toContainText("The demo data is back as it was at the start.");
    // The focus moves to the message, which is what makes a screen reader read it out.
    await expect(page.getByRole("status")).toBeFocused();
    const after = await saved();
    expect(after.school.counter).toBe(0);
    expect(after.school.speed_bonus).toEqual({});
    expect(after.v).toBe(1);
    await expect(title(page)).toHaveText("Settings");
    await expect(mainMenu(page).getByRole("link", { name: "Groups" })).toBeVisible();
  });
});

test.describe("signing out", () => {
  test("asks first, stays on No and Escape, and leaves on Yes for the sign-in screen", async ({ page }) => {
    await page.goto("/teacher/help");
    const signOut = page.getByRole("button", { name: "Одјави се" });
    const dialog = page.getByRole("alertdialog", { name: "Дали сакате да се одјавите?" });

    await signOut.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Не, остани" })).toBeFocused();
    await dialog.getByRole("button", { name: "Не, остани" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/teacher\/help$/);

    await signOut.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/teacher\/help$/);

    await signOut.click();
    await dialog.getByRole("button", { name: "Да, одјави ме" }).click();
    await expect(page).toHaveURL(/\/teacher\/sign-in$/);
    await expect(title(page)).toHaveText("Најава");
    await expect(page.getByRole("status")).toHaveText("Успешно се одјавивте.");
  });
});

test.describe("a narrow window", () => {
  test.use({ viewport: { width: 900, height: 900 } });

  test("the sidebar is a drawer behind a labelled Menu button", async ({ page }) => {
    await page.goto("/teacher");
    const menu = page.getByRole("button", { name: "Мени", exact: true });
    await expect(menu).toBeVisible();
    await expect(mainMenu(page)).toBeHidden();

    await menu.click();
    const drawer = page.getByRole("dialog", { name: "Мени" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Затвори" })).toBeFocused();
    await expect(mainMenu(page).getByRole("link")).toHaveText(["Денес", "Лекции", "Класови", "Библиотека"]);

    // Escape closes it and the focus goes back to the button that opened it.
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();

    // Choosing a destination goes there and closes the drawer.
    await menu.click();
    await mainMenu(page).getByRole("link", { name: "Лекции" }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons$/);
    await expect(title(page)).toHaveText("Лекции");
    await expect(mainMenu(page)).toBeHidden();
  });

  test("the drawer closes with its own Close button, and keeps the sign-out question working", async ({ page }) => {
    await page.goto("/teacher/help");
    await page.getByRole("button", { name: "Мени", exact: true }).click();
    await page.getByRole("button", { name: "Затвори" }).click();
    await expect(mainMenu(page)).toBeHidden();

    await page.getByRole("button", { name: "Мени", exact: true }).click();
    await page.getByRole("button", { name: "Одјави се" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Дали сакате да се одјавите?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Не, остани" }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe("the pages load clean", () => {
  const paths = [
    "/teacher",
    "/teacher/lessons",
    "/teacher/lessons/new",
    "/teacher/lessons/l-procenti",
    "/teacher/lessons/l-procenti?from=today",
    "/teacher/live/s-none",
    "/teacher/classes",
    "/teacher/library",
    "/teacher/settings",
    "/teacher/help",
    "/teacher/welcome",
    "/teacher/welcome?next=%2Fteacher%2Fsettings",
  ];

  for (const path of paths) {
    test(`${path} has no console errors, no hydration mismatch and no blocked request`, async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" || /hydrat/i.test(m.text())) problems.push(`${m.type()}: ${m.text()}`);
      });
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      page.on("requestfailed", (r) => problems.push(`failed: ${r.url()} ${r.failure()?.errorText}`));

      await page.goto(path);
      await expect(title(page)).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(problems).toEqual([]);
    });
  }

  test("a page that does not exist says so, with a way back", async ({ page }) => {
    await page.goto("/teacher/nowhere");
    await expect(title(page)).toHaveText("Оваа страница не постои");
    await page.getByRole("link", { name: "Оди на Денес", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher$/);
  });
});
