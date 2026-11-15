import type { Page } from "@playwright/test";
import { expect, MOCK_KEY, SETTINGS_KEY, tall, test } from "./fixtures";

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

  test("is a few groups of rows, each with its words on the left and its control at the right", async ({ page }) => {
    await page.goto("/teacher/settings");
    // Three groups: how the app speaks, what it does for this computer, the demo's own.
    await expect(page.locator(".setgroup")).toHaveCount(3);
    const rows = [
      { name: "Јазик", control: page.getByRole("radiogroup", { name: "Јазик" }) },
      { name: "Тип на установа", control: page.getByRole("radiogroup", { name: /^Тип на установа/ }) },
      { name: "Водич за почеток", control: page.getByRole("link", { name: "Прикажи го водичот повторно" }) },
      { name: "Инсталирај на компјутерот", control: page.getByRole("button", { name: "Како?" }) },
      { name: "Демо податоци", control: page.getByRole("button", { name: "Ресетирај ги демо податоците" }) },
    ];
    for (const { name, control } of rows) {
      const heading = page.getByRole("heading", { level: 2, name: new RegExp(`^${name}`) });
      const row = page.locator(".setrow").filter({ has: heading });
      await expect(row, name).toHaveCount(1);
      await expect(row.locator(".setrow__control"), name).toContainText(/\S/);
      const r = (await row.boundingBox())!;
      const h = (await heading.boundingBox())!;
      const c = (await control.boundingBox())!;
      // The control ends near the row's right edge, right of the words, and sits within the row's height.
      expect(r.x + r.width - (c.x + c.width), name).toBeLessThan(30);
      expect(c.x, name).toBeGreaterThan(h.x + h.width);
      expect(c.y, name).toBeGreaterThanOrEqual(r.y);
      expect(c.y + c.height, name).toBeLessThanOrEqual(r.y + r.height);
    }
    // The choices are one track with the chosen piece marked by a tick and heavier words, and they are quiet: 44px.
    const chosen = page.locator(".seg .choice[data-checked=true]").first();
    await expect(chosen).toContainText("Македонски");
    await expect(chosen.locator("svg")).toBeVisible();
    expect(await tall(chosen)).toBe(44);
    expect(await tall(page.getByRole("button", { name: "Ресетирај ги демо податоците" }))).toBe(44);
    // Nothing on Settings is the main button: every control here is quiet.
    await expect(page.locator(".btn--primary:visible")).toHaveCount(0);
    // The arrow keys still move between the choices: they are real radio buttons.
    await page.getByRole("radio", { name: "Македонски" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(title(page)).toHaveText("Settings");
    await expect(page.getByRole("radio", { name: "English" })).toBeChecked();
  });

  test("the steps to install wait behind 'Како?', a real button that says in words whether they are shown", async ({ page }) => {
    await page.goto("/teacher/settings");
    const how = page.getByRole("button", { name: "Како?" });
    const step = page.getByText("Погледнете ја адресната лента");
    await expect(how).toHaveAttribute("aria-expanded", "false");
    await expect(step).toBeHidden();
    expect(await tall(how)).toBe(44);

    await how.click();
    const hide = page.getByRole("button", { name: "Сокриј ги чекорите" });
    await expect(hide).toHaveAttribute("aria-expanded", "true");
    await expect(hide).toBeFocused();
    await expect(step).toBeVisible();
    await expect(page.locator(`#${await hide.getAttribute("aria-controls")}`)).toContainText("Потврдете со „Инсталирај“.");
    // The steps open under the row, across its width, and the rest of the page moves down for them.
    const row = (await page.locator(".setrow").filter({ has: hide }).boundingBox())!;
    const list = (await page.locator(".setrow__more").boundingBox())!;
    expect(list.y).toBeGreaterThan((await hide.boundingBox())!.y);
    expect(list.width).toBeGreaterThan(row.width * 0.8);

    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Како?" })).toHaveAttribute("aria-expanded", "false");
    await expect(step).toBeHidden();
  });
});

test.describe("settings in a phone's width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the control goes under the words, and a choice of two takes the row's width without a ragged line", async ({ page }) => {
    await page.goto("/teacher/settings");
    const row = page.locator(".setrow").filter({ has: page.getByRole("heading", { name: /^Тип на установа/ }) });
    const words = (await row.locator(".setrow__text").boundingBox())!;
    const track = (await row.locator(".choices").boundingBox())!;
    expect(track.y).toBeGreaterThanOrEqual(words.y + words.height);
    expect(Math.abs(track.x - words.x)).toBeLessThan(2);
    expect(Math.abs(track.width - words.width)).toBeLessThan(2);
    // Each piece takes the track's width: one under the other, never a long one and a short one.
    const pieces = row.locator(".choice");
    expect(Math.abs((await pieces.nth(0).boundingBox())!.width - (await pieces.nth(1).boundingBox())!.width)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test.describe("help", () => {
  test("the questions are rows of one list that open in place, and writing to us is the one main button", async ({ page }) => {
    await page.goto("/teacher/help");
    const list = page.locator(".setgroup").first();
    await expect(list.locator("details")).toHaveCount(6);
    const first = list.locator("details").first();
    await expect(first.locator("summary")).toHaveText("Како да подготвам лекција?");
    expect(await tall(first.locator("summary"))).toBeGreaterThanOrEqual(56);
    await expect(page.getByText("Изберете предмет и година", { exact: false })).toBeHidden();
    await first.locator("summary").click();
    await expect(first).toHaveAttribute("open", "");
    await expect(first.getByText("Изберете предмет и година", { exact: false })).toBeVisible();
    // It opens with a move (the owner's note on step 6): the row grows to its answer and the plus turns into a minus.
    const motion = (el: Element) => {
      const content = getComputedStyle(el, "::details-content");
      return { property: content.transitionProperty, duration: content.transitionDuration };
    };
    expect(await first.evaluate(motion)).toEqual({ property: "block-size, content-visibility", duration: "0.54s, 0.54s" });
    const upright = (el: Element) => getComputedStyle(el.querySelector(".faq__mark")!, "::after").transform;
    await expect.poll(() => first.evaluate(upright)).toBe("matrix(1, 0, 0, 1, 0, 0)");
    expect(await list.locator("details").nth(1).evaluate(upright)).toBe("matrix(0, 1, -1, 0, 0, 0)");
    // The rows are one panel: they touch, split by a hairline.
    const a = (await list.locator("details").nth(1).boundingBox())!;
    const b = (await list.locator("details").nth(2).boundingBox())!;
    expect(Math.abs(b.y - (a.y + a.height))).toBeLessThan(2);

    const write = page.getByRole("link", { name: "Пишете ни" });
    await expect(page.locator(".btn--primary:visible")).toHaveCount(1);
    await expect(write).toHaveClass(/btn--primary/);
    expect(await tall(write)).toBe(48);
    await expect(write).toHaveAttribute("href", "mailto:hello@teacheraid.education");
    // The address is there as words too, for a teacher whose computer opens no mail program.
    await expect(page.getByText("hello@teacheraid.education", { exact: true })).toBeVisible();
  });
});

test.describe("help with Reduce Motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("an answer opens at once, with only a short fade", async ({ page }) => {
    await page.goto("/teacher/help");
    const first = page.locator(".setgroup details").first();
    expect(
      await first.evaluate((el) => [getComputedStyle(el, "::details-content").transitionDuration, getComputedStyle(el.querySelector(".faq__mark")!, "::after").transitionDuration]),
    ).toEqual(["0s", "0s"]);
    await first.locator("summary").click();
    await expect(first.locator("p")).toBeVisible();
    expect(await first.locator("p").evaluate((el) => getComputedStyle(el).animationName)).toBe("arrive-fade");
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
