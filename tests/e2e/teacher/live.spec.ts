import { tokenAt } from "../../../lib/teacher/api/mock-live";
import { expect, SETTINGS_KEY, tall, test } from "./fixtures";
import {
  at, cards, classCode, code, count, joinedAt, nextEdge, openProjector, people, PLANS, readQr, SESSION, start, T0, title, mainButton, classTab, inboxTab, questionsTab, tabs,
} from "./live-helpers";

/**
 * The live lesson, step 8: starting a lesson, the console, the class view in a second window, and what each shows. In mock mode, in
 * Macedonian unless a test changes the language. The students who scan the code are played from the clock alone (lib/teacher/api/mock-live.ts), and the clock is the
 * test's: it stands still at `T0` and moves only when a test moves it, so who has joined is known exactly, with nothing slow and nothing that
 * can flake. The first lesson started in a fresh demo is the session `s-n1`, and the demo has 26 students who may scan the code.
 */

test.describe("starting", () => {
  test("from Lessons: one press, and the lesson opens on its console with its title in plain words", async ({ page, context }) => {
    await start(page, context);
    await expect(title(page)).toHaveText("Час во тек");
    await expect(page.locator(".head__sub")).toHaveText("Проценти и пропорции");
    // The lesson has the whole window: no sidebar and no menu, and the way out is the Back to Lessons. Before teaching the students stand alone, with no tabs.
    await expect(page.locator(".sidebar, .topbar")).toHaveCount(2);
    for (const part of await page.locator(".sidebar, .topbar").all()) await expect(part).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Главно мени" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Назад кон Лекции" })).toHaveAttribute("href", "/teacher");
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Кој се приклучи" })).toBeVisible();
    await expect(page).toHaveTitle("Час во тек · TeacherAid");
  });

  test("a lesson that is not the open one is not found, plainly, with the way back", async ({ page }) => {
    await page.goto("/teacher/live/s-none");
    await expect(page.getByRole("heading", { name: "Овој час не е во тек" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Лекции|Назад/ }).first()).toBeVisible();
  });
});

test.describe("the lobby", () => {
  test("says where the lesson stands in three words, the current one by a word and a mark, and gives the page one main button", async ({ page, context }) => {
    await start(page, context);
    const states = page.getByRole("list", { name: "Каде е часот" });
    await expect(states.getByRole("listitem")).toHaveText([/Чекаме ученици/, /Предавање/, /Крај/]);
    const now = states.locator("[aria-current=step]");
    await expect(now).toHaveCount(1);
    await expect(now).toContainText("Чекаме ученици");
    await expect(now).toContainText("Сега");
    await expect(mainButton(page)).toHaveCount(1);
    await expect(mainButton(page)).toHaveText("Почни го часот");
    // The ones that are not current are told apart by more than colour: a screen reader is told which are done and which are still to come.
    await expect(states.getByRole("listitem").nth(1)).toContainText("следно");
  });

  test("no code is shown to read out while students cannot type it, and nobody is listed before anyone scans: the list says students appear then", async ({ page, context }) => {
    await start(page, context);
    await expect(code(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Код за приклучување" })).toHaveCount(0);
    await expect(page.getByText(/Кодот се менува/)).toHaveCount(0);
    await expect(count(page)).toHaveText("0 се приклучија");
    await expect(people(page)).toHaveCount(0);
    await expect(page.getByText("Учениците се појавуваат овде кога ќе го скенираат кодот.")).toBeVisible();
    // No roster of the school's students, no "not here yet" group, no "no phone" button.
    await expect(page.getByRole("heading", { name: /Уште не се тука|Тука се/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Без телефон/ })).toHaveCount(0);
  });

  test("students appear as the clock runs, at an uneven pace, up to 70 to 85 percent of the 26, each one just the name, and the line that told to wait goes", async ({ page, context }) => {
    await start(page, context);
    let last = 0;
    for (const seconds of [6, 15, 30, 50, 75]) {
      await at(context, seconds, page);
      const n = joinedAt(seconds);
      await expect(count(page)).toHaveText(`${n} се приклучија`);
      await expect(people(page)).toHaveCount(n);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
    expect(last / 26).toBeGreaterThanOrEqual(0.7);
    expect(last / 26).toBeLessThanOrEqual(0.85);
    await expect(page.getByText("Учениците се појавуваат овде кога ќе го скенираат кодот.")).toHaveCount(0);
    // A student who is here is just the name: no icon and no word repeated on every row (the count above says they joined).
    await expect(page.locator(".person[data-state=joined]").first()).toBeVisible();
    await expect(page.locator(".person[data-state=joined] .person__word, .person[data-state=joined] svg")).toHaveCount(0);
    await expect(page.getByText("Се приклучи", { exact: true })).toHaveCount(0);
  });

  test("the list is in the order students joined: a new one comes at the end and nobody moves", async ({ page, context }) => {
    await start(page, context);
    await at(context, 20, page);
    const before = await people(page).locator(".person__name").allTextContents();
    await at(context, 50, page);
    const after = await people(page).locator(".person__name").allTextContents();
    expect(after.length).toBeGreaterThan(before.length);
    expect(after.slice(0, before.length)).toEqual(before);
  });

  test("one student loses the connection for a while, stays where they are, says so in words, then comes back", async ({ page, context }) => {
    await start(page, context);
    const away = PLANS.find((p) => p.off)!;
    await at(context, (away.off!.from_ms + 1000) / 1000, page);
    const offline = page.locator(".person[data-state=offline]");
    await expect(offline).toHaveCount(1);
    await expect(offline.locator(".person__word")).toHaveText("Без врска");
    await expect(offline.locator(".person__what svg")).toBeVisible();
    await at(context, away.off!.to_ms / 1000 + 1, page);
    await expect(offline).toHaveCount(0);
  });
});

test.describe("the projector", () => {
  test("one click opens the class view in a window of its own: the QR, how to join and who has joined, and no code, with no sidebar and no names of those who have not joined", async ({ page, context }) => {
    await start(page, context);
    await at(context, 30, page);
    const n = joinedAt(30);
    const projector = await openProjector(page, context);
    await expect(projector).toHaveURL(new RegExp(`/teacher/live/${SESSION}/class$`));
    await expect(projector.getByText("Скенирајте го QR-кодот со TeacherAid или со камерата на телефонот")).toBeVisible();
    await expect(projector.locator(".cv__qr svg")).toBeVisible();
    await expect(classCode(projector)).toHaveCount(0);
    await expect(projector.getByText(/се менува/)).toHaveCount(0);
    await expect(projector.getByText(n === 1 ? "1 се приклучи" : `${n} се приклучија`)).toBeVisible();
    // Nothing of the console: no sidebar, no roster, no word that belongs to it.
    await expect(projector.getByRole("navigation")).toHaveCount(0);
    await expect(projector.locator(".person")).toHaveCount(0);
    await expect(projector.getByText(/Без телефон|Уште не се тука|Почни го часот/)).toHaveCount(0);
    await expect(projector).toHaveTitle("Екран за проектор · TeacherAid");
  });

  test("nothing on the projector is under 20px, whatever the size of the window: it is read from the back of a classroom", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    const projector = await openProjector(page, context);
    await projector.setViewportSize({ width: 1024, height: 768 });
    const small = await projector.evaluate(() =>
      [...document.querySelectorAll("main *")]
        .filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()))
        .map((el) => parseFloat(getComputedStyle(el).fontSize))
        .filter((px) => px < 20).length,
    );
    expect(small).toBe(0);
    // The count is the biggest thing after the QR: a class reads how many are in from the back.
    const size = await projector.locator(".cv__count").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(0.07 * 768);
  });

  test("the QR changes every 30 seconds, in place and without being drawn again, and the projector shows no countdown and no code", async ({ page, context }) => {
    await start(page, context);
    const projector = await openProjector(page, context);
    const qr = projector.locator(".cv__qr svg");
    await expect(qr).toBeVisible();
    await qr.evaluate((el) => ((window as unknown as { __qr: Element }).__qr = el));
    const before = await qr.innerHTML();
    await context.clock.setFixedTime(nextEdge() + 500);
    await expect.poll(() => qr.innerHTML()).not.toBe(before);
    // The same element, changed in place: there was no moment with none, so no flash.
    expect(await qr.evaluate((el) => el === (window as unknown as { __qr: Element }).__qr)).toBe(true);
    await expect(projector.getByText(/сек/)).toHaveCount(0);
    await expect(projector.getByText(/\b[0-9]+:[0-9]{2}\b/)).toHaveCount(0);
    await expect(classCode(projector)).toHaveCount(0);
  });

  test("the address in the QR, read back from the picture, is the check-in path of the student app on this app's own origin, with the token of the moment", async ({ page, context, baseURL }) => {
    await start(page, context);
    const projector = await openProjector(page, context);
    const qr = projector.locator(".cv__qr svg");
    await expect(qr).toBeVisible();
    const read = () => readQr(qr);
    expect(await read()).toBe(`${new URL(baseURL!).origin}/app/checkin/${tokenAt(SESSION, T0).token}`);
    // And after the code has changed it is the new token's.
    const edge = nextEdge();
    await context.clock.setFixedTime(edge + 500);
    await expect.poll(read, { timeout: 20_000 }).toBe(`${new URL(baseURL!).origin}/app/checkin/${tokenAt(SESSION, edge + 500).token}`);
  });

  test("the last few names are on the projector, and only those who have joined", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    const projector = await openProjector(page, context);
    await expect(projector.locator(".cv__names")).toBeVisible();
    const names = (await projector.locator(".cv__names li").allTextContents()).map((s) => s.trim());
    expect(names.length).toBeLessThanOrEqual(5);
    const here = await people(page).locator(".person__name").allTextContents();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(here).toContain(name);
    // Only the last few: the others who joined are not named on the projector.
    expect(here.length).toBeGreaterThan(names.length);
  });

  test("a window that was never opened is not called closed: nothing is said of it and the button is the plain one", async ({ page, context }) => {
    await start(page, context);
    await at(context, 30, page);
    await expect(page.getByRole("button", { name: "Отвори го екранот за проектор" })).toBeVisible();
    await expect(page.getByText(/Екранот за проектор е (отворен|затворен)/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Отвори повторно" })).toHaveCount(0);
  });

  test("the console knows the window is open, and when it is closed says so, with a button to open it again", async ({ page, context }) => {
    await start(page, context);
    const projector = await openProjector(page, context);
    await expect(page.getByText("Екранот за проектор е отворен.")).toBeVisible();
    await projector.close();
    await expect(page.getByText("Екранот за проектор е затворен.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Отвори повторно" })).toBeVisible();
    const again = await openProjector(page, context, "Отвори повторно");
    await expect(again.locator(".cv__qr svg")).toBeVisible();
    await expect(page.getByText("Екранот за проектор е отворен.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Отвори го екранот за проектор" })).toBeVisible();
  });

  test("a window that went quiet for longer than three beats is closed, even if nothing said so", async ({ page, context }) => {
    await start(page, context);
    const projector = await openProjector(page, context);
    await expect(page.getByText("Екранот за проектор е отворен.")).toBeVisible();
    // The class view's own beats stop (as they would if its window had been put to sleep); the console counts the silence on its own clock.
    await projector.evaluate(() => (BroadcastChannel.prototype.postMessage = () => {}));
    await projector.close();
    await at(context, 12);
    await expect(page.getByText("Екранот за проектор е затворен.")).toBeVisible();
  });

  test("a popup blocker is said in words, and a plain link opens the window in a new one", async ({ page, context }) => {
    await page.addInitScript(() => (window.open = () => null));
    await start(page, context);
    await page.getByRole("button", { name: "Отвори го екранот за проектор" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "Прелистувачот не го дозволи новиот прозорец" });
    await expect(alert).toBeVisible();
    const link = alert.getByRole("link", { name: "Отвори го екранот за проектор во нов прозорец" });
    await expect(link).toHaveAttribute("href", `/teacher/live/${SESSION}/class`);
    await expect(link).toHaveAttribute("target", "_blank");
    const opened = context.waitForEvent("page");
    await link.click();
    const projector = await opened;
    await expect(projector.locator(".cv__qr svg")).toBeVisible();
  });

  test("warns that the projector must show only the projector screen, and the steps are on the Help page", async ({ page, context }) => {
    await start(page, context);
    await expect(page.getByText(/Проекторот мора да го прикажува само екранот за проектор/)).toBeVisible();
    // Help opens in a window of its own from a running lesson, so the console is never left.
    const opened = context.waitForEvent("page");
    await page.getByRole("link", { name: /Како да го наместам/ }).click();
    const help = await opened;
    await expect(help).toHaveURL(/\/teacher\/help#projector$/);
    await expect(page).toHaveURL(/\/teacher\/live\//);
    const item = help.locator("details#projector");
    await expect(item).toHaveAttribute("open", "");
    await expect(item.getByRole("heading", { name: "Windows" })).toBeVisible();
    await expect(item.getByText("Win+P")).toBeVisible();
    await expect(item.getByText("Прошири", { exact: false }).first()).toBeVisible();
    await expect(item.getByRole("heading", { name: "Mac" })).toBeVisible();
    await expect(item.getByText(/Displays/)).toBeVisible();
    await expect(item.getByText(/mirroring/)).toBeVisible();
  });

  test("a fullscreen button hides itself in full screen and nothing else hides", async ({ page, context }) => {
    await start(page, context);
    const projector = await openProjector(page, context);
    const button = projector.getByRole("button", { name: "Цел екран" });
    await expect(button).toBeVisible();
    const others = projector.locator("main :not(.cv__fullscreen, .cv__fullscreen *)");
    const before = await others.count();
    await projector.evaluate(() => {
      // A headless window cannot go full screen; the page only listens to the browser, so the browser is told it did.
      Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => document.documentElement });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    await expect(button).toHaveCount(0);
    expect(await others.count()).toBe(before);
    await projector.evaluate(() => {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    await expect(button).toBeVisible();
  });
});

test.describe("starting the lesson, and teaching", () => {
  test("asks first, because it cannot be taken back, with the safe answer as the default; saying no changes nothing", async ({ page, context }) => {
    await start(page, context);
    await at(context, 30, page);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Да го почнеме часот сега?" });
    // Nobody is counted as missing: students can still join, and nobody is marked late.
    await expect(dialog).toContainText("Учениците можат да се приклучат и потоа.");
    await expect(dialog).not.toContainText(/задоцнет|не се приклучиле/);
    await expect(dialog).toContainText("Часот не може да се врати на чекање.");
    await expect(dialog.getByRole("button", { name: "Не, уште чекам" })).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Не, уште чекам" })).toHaveClass(/btn--primary/);
    await dialog.getByRole("button", { name: "Не, уште чекам" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Каде е часот" }).locator("[aria-current=step]")).toContainText("Чекаме ученици");
  });

  test("moves to teaching: the state line says so, the panel for the question now has the one main button, the class, the questions and the anonymous questions are tabs, and the only way to end is the red one in the top bar", async ({ page, context }) => {
    await start(page, context);
    await at(context, 30, page);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    const now = page.getByRole("list", { name: "Каде е часот" }).locator("[aria-current=step]");
    await expect(now).toContainText("Предавање");
    await expect(now).toContainText("Сега");
    await expect(page.getByRole("listitem").filter({ hasText: "Чекаме ученици" })).toContainText("завршено");
    await expect(mainButton(page)).toHaveCount(1);
    await expect(mainButton(page)).toHaveText("Испрати го прашањето");
    await expect(page.getByRole("button", { name: "Почни го часот" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Прашањето сега" })).toBeVisible();
    // Who is here, the lesson's questions and the anonymous questions share one place: three tabs, the class first, one panel shown.
    await expect(tabs(page).getByRole("tab")).toHaveText(["Класот", "Прашања", "Анонимни (0)"]);
    await expect(classTab(page)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Класот" }).getByRole("heading", { name: "Кој се приклучи" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Прашања на часот" })).toBeHidden();
    await questionsTab(page).click();
    await expect(questionsTab(page)).toHaveAttribute("aria-selected", "true");
    await expect(classTab(page)).toHaveAttribute("aria-selected", "false");
    await expect(page.getByRole("tabpanel", { name: "Прашања" }).getByRole("heading", { name: "Прашања на часот" })).toBeVisible();
    await expect(page.locator(".qitem").first()).toContainText("Прашање 1 од");
    await expect(page.getByRole("heading", { name: "Кој се приклучи" })).toBeHidden();
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    // The chosen tab is told apart by more than colour: its words are heavier and it stands on its own ground, the one white piece
    // of the row, which moves under whichever tab is chosen (SegGlide) and settles exactly on its edges.
    const weight = (tab: typeof classTab) => tab(page).evaluate((el) => getComputedStyle(el).fontWeight);
    expect(await weight(questionsTab)).not.toBe(await weight(classTab));
    const ground = () =>
      questionsTab(page).evaluate((el) => {
        const glide = el.parentElement!.querySelector<HTMLElement>(".seg__glide")!;
        const face = getComputedStyle(glide, "::after");
        const [top, right, bottom, left] = face.clipPath.match(/-?[\d.]+px/g)!.map(parseFloat);
        const g = glide.getBoundingClientRect();
        const t = el.getBoundingClientRect();
        const off = Math.max(Math.abs(g.top + top - t.top), Math.abs(g.right - right - t.right), Math.abs(g.bottom - bottom - t.bottom), Math.abs(g.left + left - t.left));
        return getComputedStyle(glide).opacity === "1" && face.backgroundColor !== getComputedStyle(el.parentElement!).backgroundColor && off < 1;
      });
    await expect.poll(ground).toBe(true);
    // The row of tabs is one stop for the keyboard: the arrows, Home and End move between the tabs and show the panel at once.
    await page.keyboard.press("ArrowRight");
    await expect(inboxTab(page)).toBeFocused();
    await expect(page.getByRole("tabpanel", { name: /^Анонимни/ }).getByRole("heading", { name: "Анонимни прашања (0)" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(classTab(page)).toBeFocused();
    await page.keyboard.press("End");
    await expect(inboxTab(page)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(classTab(page)).toBeFocused();
    // The joined list is still there, and keeps working.
    await expect(page.getByRole("heading", { name: "Кој се приклучи" })).toBeVisible();
    // One way to end, red, in the top bar: above the question, after the projector button.
    await expect(page.getByRole("button", { name: /Заврши|Крај/ })).toHaveCount(1);
    const end = page.getByRole("button", { name: "Заврши го часот", exact: true });
    await expect(end).toHaveClass(/btn--danger/);
    const [endBox, panelBox, projectorBox] = [(await end.boundingBox())!, (await page.locator(".qpanel").boundingBox())!, (await page.getByRole("button", { name: "Отвори го екранот за проектор" }).boundingBox())!];
    expect(endBox.y + endBox.height).toBeLessThanOrEqual(panelBox.y);
    expect(endBox.x).toBeGreaterThan(projectorBox.x + projectorBox.width);
  });

  test("a student who joins after the lesson has begun simply appears in the list: no word of late, and no one is named before they join", async ({ page, context }) => {
    await start(page, context);
    await at(context, 20, page);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    await expect(page.getByRole("list", { name: "Каде е часот" }).locator("[aria-current=step]")).toContainText("Предавање");
    const before = joinedAt(20, 20);
    await expect(people(page)).toHaveCount(before);
    await at(context, 100, page, 20);
    const after = joinedAt(100, 20);
    expect(after).toBeGreaterThan(before);
    await expect(people(page)).toHaveCount(after);
    await expect(page.locator(".person", { hasText: "Задоцни" })).toHaveCount(0);
    await expect(page.locator(".person[data-state=late]")).toHaveCount(0);
  });

  test("the class view says the lesson is going on, with a small corner for those who are late", async ({ page, context }) => {
    await start(page, context);
    const projector = await openProjector(page, context);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    await expect(projector.getByRole("heading", { name: "Часот е во тек" })).toBeVisible();
    const corner = projector.locator(".cv__corner");
    await expect(corner).toBeVisible();
    await expect(corner.getByText("Доцните? Скенирајте го QR-кодот.")).toBeVisible();
    await expect(corner.locator(".cv__qr svg")).toBeVisible();
    await expect(classCode(projector)).toHaveCount(0);
    await expect(projector.locator(".person")).toHaveCount(0);
    // The QR keeps changing there too.
    const before = await corner.locator(".cv__qr svg").innerHTML();
    await context.clock.setFixedTime(nextEdge() + 500);
    await expect.poll(() => corner.locator(".cv__qr svg").innerHTML()).not.toBe(before);
  });
});

test.describe("coming back", () => {
  test("a reload of the console brings everything back: who has joined and where the lesson stands", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    const before = await people(page).allInnerTexts();
    await page.reload();
    await expect(count(page)).toBeVisible();
    expect(await people(page).allInnerTexts()).toEqual(before);
    await expect(count(page)).toHaveText(`${joinedAt(40)} се приклучија`);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    await page.reload();
    await expect(page.getByRole("list", { name: "Каде е часот" }).locator("[aria-current=step]")).toContainText("Предавање");
    await expect(page.getByRole("heading", { name: "Прашањето сега" })).toBeVisible();
    await expect(people(page)).toHaveCount(joinedAt(40));
  });

  test("a reload of the class view brings it back, with the same count and the same QR", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    const projector = await openProjector(page, context);
    await expect(projector.locator(".cv__qr svg")).toBeVisible();
    const shown = { qr: await readQr(projector.locator(".cv__qr svg")), count: await projector.locator(".cv__count").innerText() };
    await projector.reload();
    await expect.poll(() => readQr(projector.locator(".cv__qr svg")), { timeout: 20_000 }).toBe(shown.qr);
    await expect(projector.locator(".cv__count")).toHaveText(shown.count);
    // And the console still knows the window is open.
    await expect(page.getByText("Екранот за проектор е отворен.")).toBeVisible();
  });

  test("both windows agree: who joins in the console's clock is counted on the projector too", async ({ page, context }) => {
    await start(page, context);
    const projector = await openProjector(page, context);
    await at(context, 25, page);
    await expect(projector.locator(".cv__count")).toHaveText(joinedAt(25) === 1 ? "1 се приклучи" : `${joinedAt(25)} се приклучија`);
    await expect(count(page)).toHaveText(`${joinedAt(25)} се приклучија`);
    await expect(people(page)).toHaveCount(joinedAt(25));
  });

  test("a lost connection is said calmly, and mended by itself when it is back", async ({ page, context }) => {
    await start(page, context);
    await expect(page.getByText("Се поврзуваме повторно…")).toHaveCount(0);
    await context.setOffline(true);
    const line = page.getByRole("status").filter({ hasText: "Се поврзуваме повторно…" });
    await expect(line).toBeVisible();
    await expect(line).toContainText("Часот си продолжува.");
    await at(context, 35);
    await context.setOffline(false);
    await expect(line).toHaveCount(0);
    // What happened while it was gone is there: the snapshot was read again.
    await expect(count(page)).toHaveText(`${joinedAt(35)} се приклучија`);
  });

  test("the projector says the same, quietly, and recovers", async ({ page, context }) => {
    await start(page, context);
    const projector = await openProjector(page, context);
    await expect(projector.locator(".cv__qr svg")).toBeVisible();
    await context.setOffline(true);
    await expect(projector.getByRole("status").filter({ hasText: "Се поврзуваме повторно…" })).toBeVisible();
    await context.setOffline(false);
    await expect(projector.getByText("Се поврзуваме повторно…")).toHaveCount(0);
  });

  test("a failure to start the lesson is said where the button is, with the reason, and pressing again works", async ({ page, context }) => {
    await start(page, context);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await context.setOffline(true);
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    await expect(page.locator(".live__code").getByRole("alert")).toContainText("Нема врска со интернет");
    await context.setOffline(false);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    await expect(page.getByRole("heading", { name: "Прашањето сега" })).toBeVisible();
  });
});

test.describe("who may see it", () => {
  test.describe("signed out", () => {
    test.use({ account: null });

    test("the class view is behind the sign-in like every other page, and a deep link keeps its path and drops its query", async ({ page }) => {
      await page.goto(`/teacher/live/${SESSION}/class?names=all`);
      await expect(page).toHaveURL(/\/teacher\/sign-in\?next=%2Fteacher%2Flive%2Fs-n1%2Fclass$/);
      await expect(page.locator(".cv")).toHaveCount(0);
    });
  });

  test("the class view holds nothing that only the console has, in the page or in what it kept", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    const names = await page.locator(".person__name").allTextContents();
    const projector = await openProjector(page, context);
    await expect(projector.locator(".cv__qr svg")).toBeVisible();
    const html = await projector.content();
    const recent = (await projector.locator(".cv__names li").allTextContents()).map((s) => s.trim());
    for (const name of names.filter((n) => !recent.includes(n))) expect(html.includes(name), name).toBe(false);
    for (const word of ["Без телефон", "Уште не се тука", "Предавање"]) expect(html.includes(word), word).toBe(false);
    // The console's pages are the sidebar's: the projected page has none of it.
    await expect(projector.locator(".sidebar, .nav, .topbar")).toHaveCount(0);
  });
});

test.describe("words", () => {
  test("in English, a school: the console, the list of who joined and the projector speak English, and the names are in Latin letters", async ({ page, context }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "en", schoolType: "school", schoolSeen: true })), SETTINGS_KEY);
    await context.clock.setFixedTime(T0);
    await page.goto("/teacher");
    await cards(page).filter({ hasText: "Проценти и пропорции" }).getByRole("button", { name: "Start lesson" }).click();
    await expect(page.locator(".head__sub")).toHaveText("Проценти и пропорции");
    await expect(page.getByRole("list", { name: "Where the lesson is" }).getByRole("listitem")).toHaveText([/Waiting for the students/, /Teaching/, /The end/]);
    await expect(page.getByRole("heading", { name: "When you are ready" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Projector screen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start the lesson" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open the projector screen" })).toBeVisible();
    await expect(count(page)).toHaveText("0 joined");
    await expect(page.getByText("Students appear here when they scan the code.")).toBeVisible();
    await at(context, 40, page);
    const name = await page.locator(".person__name").first().innerText();
    expect(name).toMatch(/^[A-Za-z' -]+$/);
    const projector = await openProjector(page, context, "Open the projector screen");
    await expect(projector.getByText("Scan the QR code with TeacherAid, or with your phone's camera")).toBeVisible();
    await expect(projector.getByText(/^\d+ joined$|^1 joined$/)).toBeVisible();
    await expect(projector.getByText(/code changes|Code/i)).toHaveCount(1); // only "QR code" in the line that says to scan
    await expect(projector.getByRole("button", { name: "Full screen" })).toBeVisible();
    const opened = context.waitForEvent("page");
    await page.getByRole("link", { name: /How do I set that up/ }).click();
    const help = await opened;
    await expect(help.locator("details#projector").getByText("Press the Windows key and P together (Win+P).")).toBeVisible();
  });

  test("at a faculty the console says students, and the line of states says it too", async ({ page, context }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "mk", schoolType: "university", schoolSeen: true })), SETTINGS_KEY);
    await context.clock.setFixedTime(T0);
    await page.goto("/teacher");
    await cards(page).first().getByRole("button", { name: "Започни час" }).click();
    await expect(page).toHaveURL(/\/teacher\/live\//);
    await expect(page.getByRole("list", { name: "Каде е часот" }).getByRole("listitem").first()).toContainText("Чекаме студенти");
    await expect(page.getByText(/Проекторот мора.*Вашите студенти/)).toBeVisible();
    await expect(count(page)).toHaveText("0 се приклучија");
    await expect(page.getByText("Студентите се појавуваат овде кога ќе го скенираат кодот.")).toBeVisible();
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Студентите можат да се приклучат и потоа.");
  });
});

test.describe("the screen", () => {
  test("the console works at 200% zoom: no sideways scroll, and the projector button and the main button are in reach", async ({ page, context }) => {
    // 200% on a 1280 x 720 window leaves 640 x 360 CSS pixels.
    await page.setViewportSize({ width: 640, height: 360 });
    await start(page, context);
    await at(context, 40, page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await expect(page.getByRole("button", { name: "Отвори го екранот за проектор" })).toBeVisible();
    await page.getByRole("button", { name: "Почни го часот" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Почни го часот" })).toBeInViewport();
    await expect(people(page).first()).toBeAttached();
    const box = await people(page).first().boundingBox();
    expect(box!.width).toBeLessThanOrEqual(640);
    // A student's row is a full line tall.
    expect(await tall(people(page).first())).toBeGreaterThanOrEqual(44);
  });

  test("the console fits 1024 x 768 and 1280 x 720 with no sideways scroll, and every button is at least 44px tall", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    for (const size of [{ width: 1024, height: 768 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(size);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      const heights = await page.locator(".live button:visible, .live a.btn:visible").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      for (const h of heights) expect(h).toBeGreaterThanOrEqual(43.5);
    }
  });

  test("the projected window fits 1920 x 1080, 1280 x 720 and 1024 x 768 with no scroll, and the QR is big", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    const projector = await openProjector(page, context);
    await expect(projector.locator(".cv__qr svg")).toBeVisible();
    for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
      await projector.setViewportSize(size);
      expect(await projector.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight])).toEqual([0, 0]);
      const qr = (await projector.locator(".cv__qr").first().boundingBox())!;
      expect(qr.width).toBeGreaterThanOrEqual(0.4 * size.height);
      // The QR and the words beside it stay inside the window.
      for (const part of [".cv__qr", ".cv__how", ".cv__count", ".cv__names"]) {
        const box = (await projector.locator(part).first().boundingBox())!;
        expect(box.x + box.width, part).toBeLessThanOrEqual(size.width);
        expect(box.y + box.height, part).toBeLessThanOrEqual(size.height);
      }
    }
  });
});

test.describe("the reminder", () => {
  test("is not shown on the console, which says it itself, and is shown on every other page", async ({ page, context }) => {
    await start(page, context);
    await expect(page.getByRole("group", { name: /Час во тек/ })).toHaveCount(0);
    // The console has no menu: the way to another page is the Back to Lessons, and from there the menu.
    await page.getByRole("link", { name: "Назад кон Лекции" }).click();
    await page.getByRole("link", { name: "Библиотека" }).click();
    await expect(page.getByRole("group", { name: /Час во тек/ })).toBeVisible();
  });
});

test.describe("what the review of step 8 changed", () => {
  test("the projector button comes first, in the top bar, and is in the first screen at 1280 x 720 and 1024 x 768, above the one main button", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    for (const size of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size);
      const projector = page.getByRole("button", { name: "Отвори го екранот за проектор" });
      await expect(projector).toBeInViewport({ ratio: 1 });
      const start = page.getByRole("button", { name: "Почни го часот" });
      expect((await projector.boundingBox())!.y).toBeLessThan((await start.boundingBox())!.y);
      // It is the first button of the top bar, before the red End, a quiet one of 44px; and the page has one main button.
      expect((await projector.boundingBox())!.x).toBeLessThan((await page.getByRole("button", { name: "Заврши го часот", exact: true }).boundingBox())!.x);
      await expect(projector).toHaveClass(/btn--secondary/);
      expect(await tall(projector)).toBe(44);
      await expect(mainButton(page)).toHaveCount(1);
    }
  });

  test("the card of who has joined has no gap between the count and the list", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    const a = (await count(page).boundingBox())!;
    const b = (await page.locator(".roster__list").boundingBox())!;
    expect(b.y - (a.y + a.height)).toBeLessThanOrEqual(32);
  });

  test("the question before starting is calm: it counts nobody as missing, the safe answer is the main button and has the focus, and Escape stays in the lobby", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    const ask = page.getByRole("alertdialog", { name: "Да го почнеме часот сега?" });
    await expect(ask).not.toContainText(/не се приклучиле|задоцнет/);
    await expect(ask.getByRole("button", { name: "Не, уште чекам" })).toBeFocused();
    await expect(ask.getByRole("button", { name: "Не, уште чекам" })).toHaveClass(/btn--primary/);
    await page.keyboard.press("Escape");
    await expect(ask).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Каде е часот" }).locator("[aria-current=step]")).toContainText("Чекаме ученици");
    await expect(page.getByRole("button", { name: "Почни го часот" })).toBeFocused();
  });

  test("a screen reader hears the count once the joins have slowed, not every join", async ({ page, context }) => {
    await start(page, context);
    const calm = page.getByTestId("calm-count");
    await expect(calm).toHaveText("0 се приклучија");
    // Not a live region for the people: only the one that says the count.
    await expect(page.locator(".person[role], .roster__list[aria-live]")).toHaveCount(0);
    await at(context, 40, page);
    await expect(calm).toHaveText(`${joinedAt(40)} се приклучија`, { timeout: 10_000 });
    await expect(calm).toHaveAttribute("role", "status");
  });

  test("the QR is dark on a white quiet zone, so that a phone reads it", async ({ page, context }) => {
    await start(page, context);
    const projector = await openProjector(page, context);
    const qr = projector.locator(".cv__qr");
    await expect(qr.locator("svg")).toBeVisible();
    expect(await qr.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
    const fills = await qr.locator("svg path").evaluateAll((els) => els.map((el) => el.getAttribute("fill")));
    expect(fills).toContain("#0a2e37");
    // The picture holds a margin of its own inside the white tile.
    const [tile, svg] = [(await qr.boundingBox())!, (await qr.locator("svg").boundingBox())!];
    expect(svg.x - tile.x).toBeGreaterThan(0.02 * tile.width);
  });

  test("long names on the projector stay inside the window and break inside themselves", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    const projector = await openProjector(page, context);
    await projector.evaluate(() => {
      const list = document.querySelector(".cv__names")!;
      list.innerHTML = ["Александар-Константин Христодулопулос-Папаиоанопулос", "Ана", "Анастасија Ристовска-Јовановска", "Ем", "Мартина Илиевска"].map((n) => `<li>${n}</li>`).join("");
    });
    for (const size of [{ width: 1920, height: 1080 }, { width: 1024, height: 768 }]) {
      await projector.setViewportSize(size);
      expect(await projector.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight])).toEqual([0, 0]);
      for (const li of await projector.locator(".cv__names li").all()) {
        const box = (await li.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      }
    }
  });

  test("with the projector closed after it was open, the console says so with a warning mark and offers to open it again", async ({ page, context }) => {
    await start(page, context);
    const projector = await openProjector(page, context);
    await expect(page.getByText("Екранот за проектор е отворен.")).toBeVisible();
    await projector.close();
    const closed = page.locator(".projector__status[data-status=closed]");
    await expect(closed).toContainText("Екранот за проектор е затворен.", { timeout: 15_000 });
    await expect(closed.locator("svg")).toBeVisible();
    await expect(page.getByRole("button", { name: "Отвори повторно" })).toBeVisible();
  });
});
