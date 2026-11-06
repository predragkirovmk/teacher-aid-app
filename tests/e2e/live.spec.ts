import { simulate, tokenAt } from "../../lib/teacher/api/mock-live";
import { expect, SETTINGS_KEY, test } from "./fixtures";
import {
  at, cards, classCode, code, comesLater, count, joinedAt, nextEdge, openProjector, people, PLANS, readQr, row, SESSION, start, T0, title, yellow,
} from "./live-helpers";

/**
 * The live lesson, step 8: starting a lesson with a class, the console, the class view in a second window, and what each shows. In mock mode, in
 * Macedonian unless a test changes the language. The class is played from the clock alone (lib/teacher/api/mock-live.ts), and the clock is the
 * test's: it stands still at `T0` and moves only when a test moves it, so who has joined is known exactly, with nothing slow and nothing that
 * can flake. The first lesson started in a fresh demo is the session `s-n1`, and II-4 has 26 students.
 */

test.describe("starting", () => {
  test("from Today: the button names the class, and the lesson opens on its console with the subject, class and lesson in plain words", async ({ page, context }) => {
    await start(page, context);
    await expect(title(page)).toHaveText("Час во тек");
    await expect(page.getByText("Математика, II-4: Проценти и пропорции")).toBeVisible();
    // The sidebar stays: this is a page of the app, not a window of its own.
    await expect(page.getByRole("navigation", { name: "Главно мени" })).toBeVisible();
    await expect(page).toHaveTitle("Час во тек · TeacherAid");
  });

  test("a lesson that is not the open one is not found, plainly, with the way back", async ({ page }) => {
    await page.goto("/teacher/live/s-none");
    await expect(page.getByRole("heading", { name: "Овој час не е во тек" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Денес|Назад/ }).first()).toBeVisible();
  });
});

test.describe("the lobby", () => {
  test("says where the lesson stands in four words, the current one by a word and a mark, and gives the page one yellow button", async ({ page, context }) => {
    await start(page, context);
    const states = page.getByRole("list", { name: "Каде е часот" });
    await expect(states.getByRole("listitem")).toHaveText([/Чекаме ученици/, /Предавање/, /Преглед/, /Крај/]);
    const now = states.locator("[aria-current=step]");
    await expect(now).toHaveCount(1);
    await expect(now).toContainText("Чекаме ученици");
    await expect(now).toContainText("Сега");
    await expect(yellow(page)).toHaveCount(1);
    await expect(yellow(page)).toHaveText("Почни го часот");
    // The ones that are not current are told apart by more than colour: a screen reader is told which are done and which are still to come.
    await expect(states.getByRole("listitem").nth(1)).toContainText("следно");
  });

  test("no code is shown to read out while students cannot type it, and the class is listed with nobody here", async ({ page, context }) => {
    await start(page, context);
    await expect(code(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Код за приклучување" })).toHaveCount(0);
    await expect(page.getByText(/Кодот се менува/)).toHaveCount(0);
    await expect(count(page)).toHaveText("0 од 26 се приклучија");
    await expect(people(page)).toHaveCount(26);
    await expect(page.getByRole("heading", { name: "Уште не се тука (26)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Тука се (0)" })).toBeVisible();
  });

  test("students join as the clock runs, at an uneven pace, up to 70 to 85 percent, and each moves from one group to the other", async ({ page, context }) => {
    await start(page, context);
    let last = 0;
    for (const seconds of [6, 15, 30, 50, 75]) {
      await at(context, seconds, page);
      const n = joinedAt(seconds);
      await expect(count(page)).toHaveText(`${n} од 26 се приклучија`);
      await expect(page.getByRole("heading", { name: `Тука се (${n})` })).toBeVisible();
      await expect(page.getByRole("heading", { name: `Уште не се тука (${26 - n})` })).toBeVisible();
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
    expect(last / 26).toBeGreaterThanOrEqual(0.7);
    expect(last / 26).toBeLessThanOrEqual(0.85);
    // Everybody is still listed, by name, and each one's state is an icon and a word.
    await expect(people(page)).toHaveCount(26);
    for (const state of ["joined", "not_yet"]) await expect(page.locator(`.person[data-state="${state}"] .person__state svg`).first()).toBeVisible();
    await expect(page.locator(".person[data-state=joined] .person__word").first()).toHaveText("Се приклучи");
    await expect(page.locator(".person[data-state=not_yet] .person__word").first()).toHaveText("Уште не е тука");
  });

  test("the ones who are not here yet are first, and the register's order holds inside each group", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    await expect(count(page)).toHaveText(`${joinedAt(40)} од 26 се приклучија`);
    const states = await people(page).evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.state));
    const firstHere = states.findIndex((s) => s !== "not_yet");
    expect(firstHere).toBeGreaterThan(0);
    expect(states.slice(0, firstHere).every((s) => s === "not_yet")).toBe(true);
    expect(states.slice(firstHere).every((s) => s !== "not_yet")).toBe(true);
    // A register is read by surname, and the groups keep it: the names of the first group are in order.
    const names = await page.locator(".roster__group").first().locator(".person__name").allTextContents();
    expect(names).toEqual([...names].sort((a, b) => a.split(" ").slice(-1)[0].localeCompare(b.split(" ").slice(-1)[0], "mk") || a.localeCompare(b, "mk")));
  });

  test("one student loses the connection for a while, is first among those who are here and says so in words, then comes back", async ({ page, context }) => {
    await start(page, context);
    const away = PLANS.find((p) => p.off)!;
    await at(context, (away.off!.from_ms + 1000) / 1000, page);
    const offline = page.locator(".person[data-state=offline]");
    await expect(offline).toHaveCount(1);
    await expect(offline.locator(".person__word")).toHaveText("Без врска");
    await expect(page.locator(".roster__group").nth(1).locator(".person").first()).toHaveAttribute("data-state", "offline");
    await at(context, away.off!.to_ms / 1000 + 1, page);
    await expect(offline).toHaveCount(0);
  });
});

test.describe("the projector", () => {
  test("one click opens the class view in a window of its own: the QR, how to join and who has joined, and no code, with no sidebar and no names of those who are not here", async ({ page, context }) => {
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
    const here = await page.locator(".person[data-state=joined], .person[data-state=offline], .person[data-state=late]").locator(".person__name").allTextContents();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(here).toContain(name);
    const missing = await page.locator(".person[data-state=not_yet] .person__name").allTextContents();
    const text = await projector.locator("main").innerText();
    for (const name of missing) expect(text).not.toContain(name);
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

test.describe("present without a phone", () => {
  test("a student who is not here has a button that asks the reason, in four plain choices, and one yellow button marks them", async ({ page, context }) => {
    await start(page, context);
    const missing = page.locator(".person[data-state=not_yet]").first();
    const name = await missing.locator(".person__name").innerText();
    await missing.getByRole("button", { name: `Без телефон: ${name}` }).click();
    const dialog = page.getByRole("dialog", { name: `Зошто ${name} е без телефон?` });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".choice")).toHaveText(["Нема телефон", "Празна батерија", "Нема интернет", "Заклучувањето на екранот не е дозволено"]);
    for (const radio of await dialog.getByRole("radio").all()) await expect(radio).not.toBeChecked();
    for (const choice of await dialog.locator(".choice").all()) expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    await expect(dialog.getByRole("button", { name: "Означи како присутен" })).toHaveClass(/btn--primary/);
    await expect(dialog.getByRole("radio").first()).toBeFocused();
  });

  test("pressing the yellow button with nothing chosen says so and marks nothing", async ({ page, context }) => {
    await start(page, context);
    await page.locator(".person[data-state=not_yet]").first().getByRole("button", { name: /^Без телефон/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Означи како присутен" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Прво изберете причина.");
    await expect(dialog.getByRole("radio").first()).toBeFocused();
    await expect(page.locator(".person[data-state=no_device]")).toHaveCount(0);
  });

  test("choosing a reason and confirming marks the student present with the reason, counts them apart from those who joined, and says so", async ({ page, context }) => {
    await start(page, context);
    await at(context, 20, page);
    const n = joinedAt(20);
    const missing = page.locator(".person[data-state=not_yet]").first();
    const name = await missing.locator(".person__name").innerText();
    await missing.getByRole("button", { name: /^Без телефон/ }).click();
    await page.getByRole("dialog").getByRole("radio", { name: "Празна батерија" }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Означи како присутен" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const marked = page.locator(".person[data-state=no_device]");
    await expect(marked).toHaveCount(1);
    await expect(marked.locator(".person__name")).toHaveText(name);
    await expect(marked.locator(".person__word")).toHaveText("Без телефон");
    await expect(marked.locator(".person__detail")).toHaveText("Празна батерија");
    // Not a join: the count of those who joined is as it was, and the mark is counted on its own line.
    await expect(count(page)).toHaveText(`${n} од 26 се приклучија`);
    await expect(page.locator(".roster__nophone")).toHaveText("1 без телефон, означени како присутни");
    await expect(page.getByRole("status").filter({ hasText: `${name} е означен како присутен без телефон.` })).toBeVisible();
    // The student has moved to the group of those who are accounted for, and the button that took the focus is the one that takes the mark back.
    await expect(page.getByRole("heading", { name: `Уште не се тука (${26 - n - 1})` })).toBeVisible();
    await expect(marked.getByRole("button", { name: `Отстрани ја ознаката: ${name}` })).toBeFocused();
  });

  test("the mark can be taken back, and the student is as before it; every reason is kept", async ({ page, context }) => {
    await start(page, context);
    const reasons = ["Нема телефон", "Празна батерија", "Нема интернет", "Заклучувањето на екранот не е дозволено"];
    for (const [i, reason] of reasons.entries()) {
      await page.locator(".person[data-state=not_yet]").nth(i).getByRole("button", { name: /^Без телефон/ }).click();
      await page.getByRole("dialog").getByRole("radio", { name: reason }).check();
      await page.getByRole("dialog").getByRole("button", { name: "Означи како присутен" }).click();
    }
    await expect(page.locator(".person[data-state=no_device] .person__detail")).toHaveText(reasons);
    await page.reload();
    await expect(page.locator(".person[data-state=no_device] .person__detail")).toHaveText(reasons);

    const one = page.locator(".person[data-state=no_device]").first();
    const name = await one.locator(".person__name").innerText();
    await one.getByRole("button", { name: /^Отстрани ја ознаката/ }).click();
    await expect(page.locator(".person[data-state=no_device]")).toHaveCount(3);
    const back = page.locator(".person", { hasText: name });
    await expect(back).toHaveAttribute("data-state", "not_yet");
    await expect(back.getByRole("button", { name: `Без телефон: ${name}` })).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: `Ознаката за ${name} е отстранета.` })).toBeVisible();
  });

  test("a student who has joined has no such button, and Cancel marks nobody", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    await expect(page.locator(".person[data-state=joined]").first()).toBeVisible();
    await expect(page.locator(".person[data-state=joined]").first().getByRole("button")).toHaveCount(0);
    await page.locator(".person[data-state=not_yet]").first().getByRole("button", { name: /^Без телефон/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Откажи" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".person[data-state=no_device]")).toHaveCount(0);
  });

  test("a student marked who then joins with a phone is simply here: the mark and its reason are gone, and nothing is asked", async ({ page, context }) => {
    await start(page, context);
    await at(context, 3, page);
    const later = comesLater(3);
    const target = row(page, later.id);
    const name = await target.locator(".person__name").innerText();
    await target.getByRole("button", { name: /^Без телефон/ }).click();
    await page.getByRole("dialog").getByRole("radio", { name: "Нема интернет" }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Означи како присутен" }).click();
    await expect(page.locator(".person", { hasText: name })).toHaveAttribute("data-state", "no_device");

    await at(context, later.after_ms / 1000 + 1, page);
    const joined = page.locator(".person", { hasText: name });
    await expect(joined).toHaveAttribute("data-state", /^(joined|offline)$/);
    await expect(joined.locator(".person__word")).toHaveText(/Се приклучи|Без врска/);
    await expect(joined.getByRole("button")).toHaveCount(0);
    await expect(joined).not.toContainText("Нема интернет");
    await expect(page.locator(".roster__nophone")).toHaveCount(0);
  });

  test("a student who joined while the choice was open is told so, and nothing is marked", async ({ page, context }) => {
    await start(page, context);
    await at(context, 3, page);
    const later = comesLater(3);
    await row(page, later.id).getByRole("button", { name: /^Без телефон/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: "Нема телефон" }).check();
    await at(context, later.after_ms / 1000 + 1, page);
    await dialog.getByRole("button", { name: "Означи како присутен" }).click();
    await expect(dialog.getByRole("alert")).toContainText("штотуку се приклучи со телефон, па нема што да се означи.");
    await dialog.getByRole("button", { name: "Откажи" }).click();
    await expect(page.locator(".person[data-state=no_device]")).toHaveCount(0);
  });

  test("works with the keyboard alone: Enter opens the choice, an arrow chooses, Tab and Enter mark, and the focus is where the next thing to do is", async ({ page, context }) => {
    await start(page, context);
    const first = page.locator(".person[data-state=not_yet]").first();
    const name = await first.locator(".person__name").innerText();
    await first.getByRole("button", { name: /^Без телефон/ }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radio").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(dialog.getByRole("radio", { name: "Празна батерија" })).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Означи како присутен" })).toBeFocused();
    await page.keyboard.press("Enter");
    const take = page.getByRole("button", { name: `Отстрани ја ознаката: ${name}` });
    await expect(take).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: `Без телефон: ${name}` })).toBeFocused();
    // Escape closes the choice, marks nothing and gives the focus back to the button that opened it.
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Без телефон: ${name}` })).toBeFocused();
    await expect(page.locator(".person[data-state=no_device]")).toHaveCount(0);
  });
});

test.describe("starting the lesson, and teaching", () => {
  test("asks first, because it cannot be taken back, with the safe answer as the default; saying no changes nothing", async ({ page, context }) => {
    await start(page, context);
    await at(context, 30, page);
    const n = joinedAt(30);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Да го почнеме часот сега?" });
    await expect(dialog).toContainText(`Уште ${26 - n} не се приклучиле.`);
    await expect(dialog).toContainText("Часот не може да се врати на чекање.");
    await expect(dialog.getByRole("button", { name: "Не, уште чекам" })).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Не, уште чекам" })).toHaveClass(/btn--primary/);
    await dialog.getByRole("button", { name: "Не, уште чекам" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Каде е часот" }).locator("[aria-current=step]")).toContainText("Чекаме ученици");
  });

  test("moves to teaching: the state line says so, the panel for the question now has the one yellow button, the questions are listed, and nothing says anything about ending", async ({ page, context }) => {
    await start(page, context);
    await at(context, 30, page);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    const now = page.getByRole("list", { name: "Каде е часот" }).locator("[aria-current=step]");
    await expect(now).toContainText("Предавање");
    await expect(now).toContainText("Сега");
    await expect(page.getByRole("listitem").filter({ hasText: "Чекаме ученици" })).toContainText("завршено");
    await expect(yellow(page)).toHaveCount(1);
    await expect(yellow(page)).toHaveText("Испрати го прашањето");
    await expect(page.getByRole("button", { name: "Почни го часот" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Прашањето сега" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Прашања на часот" })).toBeVisible();
    await expect(page.locator(".qitem").first()).toContainText("Прашање 1 од");
    await expect(page.getByRole("button", { name: /Заврши|Крај/ })).toHaveCount(0);
    // The joined list is still there, and keeps working.
    await expect(page.getByRole("heading", { name: "Кој се приклучи" })).toBeVisible();
  });

  test("a student who joins after the lesson has begun is late, with the time, and the ones who were in before are not", async ({ page, context }) => {
    await start(page, context);
    await at(context, 20, page);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    await expect(page.getByRole("list", { name: "Каде е часот" }).locator("[aria-current=step]")).toContainText("Предавање");
    await at(context, 100, page, 20);
    const late = page.locator(".person", { has: page.locator(".person__word", { hasText: "Задоцни" }) });
    const lateOnes = PLANS.filter((p) => simulate(p, { started_at: T0, teaching_at: T0 + 20_000, now: T0 + 100_000 }).late).length;
    expect(lateOnes).toBeGreaterThanOrEqual(1);
    await expect(late).toHaveCount(lateOnes);
    await expect(late.first().locator(".person__detail")).toHaveText(/^во \d\d:\d\d$/);
    await expect(count(page)).toHaveText(`${joinedAt(100, 20)} од 26 се приклучија`);
    // The ones who joined in the lobby are marked as having been on time: no word of "late" on them.
    expect(await page.locator(".person[data-state=joined]").count()).toBe(joinedAt(100, 20) - lateOnes - (await page.locator(".person[data-state=offline]").count()));
  });

  test("marking a student without a phone still works in teaching", async ({ page, context }) => {
    await start(page, context);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    await page.locator(".person[data-state=not_yet]").first().getByRole("button", { name: /^Без телефон/ }).click();
    await page.getByRole("dialog").getByRole("radio", { name: "Нема телефон" }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Означи како присутен" }).click();
    await expect(page.locator(".person[data-state=no_device]")).toHaveCount(1);
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
  test("a reload of the console brings everything back: who has joined, who is marked, where the lesson stands", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    await page.locator(".person[data-state=not_yet]").first().getByRole("button", { name: /^Без телефон/ }).click();
    await page.getByRole("dialog").getByRole("radio", { name: "Нема интернет" }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Означи како присутен" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const before = await people(page).allInnerTexts();
    await page.reload();
    await expect(count(page)).toBeVisible();
    await expect(page.locator(".person[data-state=no_device]")).toHaveCount(1);
    expect(await people(page).allInnerTexts()).toEqual(before);
    await expect(count(page)).toHaveText(`${joinedAt(40)} од 26 се приклучија`);
    await expect(page.locator(".person[data-state=no_device] .person__detail")).toHaveText("Нема интернет");
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    await page.reload();
    await expect(page.getByRole("list", { name: "Каде е часот" }).locator("[aria-current=step]")).toContainText("Предавање");
    await expect(page.getByRole("heading", { name: "Прашањето сега" })).toBeVisible();
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

  test("both windows agree: a move in the console reaches the projector, and a mark does not", async ({ page, context }) => {
    await start(page, context);
    const projector = await openProjector(page, context);
    await at(context, 25, page);
    await expect(projector.locator(".cv__count")).toHaveText(joinedAt(25) === 1 ? "1 се приклучи" : `${joinedAt(25)} се приклучија`);
    await expect(count(page)).toHaveText(`${joinedAt(25)} од 26 се приклучија`);
    await page.locator(".person[data-state=not_yet]").first().getByRole("button", { name: /^Без телефон/ }).click();
    await page.getByRole("dialog").getByRole("radio", { name: "Нема телефон" }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Означи како присутен" }).click();
    // The projector's count is of those who joined with a phone, and a mark is not one.
    await expect(projector.locator(".cv__count")).toHaveText(joinedAt(25) === 1 ? "1 се приклучи" : `${joinedAt(25)} се приклучија`);
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
    await expect(count(page)).toHaveText(`${joinedAt(35)} од 26 се приклучија`);
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

  test("a failure to mark is said at the choice, with the reason, and the choice stays", async ({ page, context }) => {
    await start(page, context);
    await page.locator(".person[data-state=not_yet]").first().getByRole("button", { name: /^Без телефон/ }).click();
    await page.getByRole("dialog").getByRole("radio", { name: "Нема телефон" }).check();
    await context.setOffline(true);
    await page.getByRole("dialog").getByRole("button", { name: "Означи како присутен" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Нема врска со интернет");
    await context.setOffline(false);
    await page.getByRole("dialog").getByRole("button", { name: "Означи како присутен" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".person[data-state=no_device]")).toHaveCount(1);
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
    for (const word of ["Без телефон", "Уште не се тука", "Предавање", "Отстрани ја ознаката"]) expect(html.includes(word), word).toBe(false);
    // The console's pages are the sidebar's: the projected page has none of it.
    await expect(projector.locator(".sidebar, .nav, .topbar")).toHaveCount(0);
  });
});

test.describe("words", () => {
  test("in English, a school: the console, the roster, the reasons and the projector speak English, and the names are in Latin letters", async ({ page, context }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "en", schoolType: "school", schoolSeen: true })), SETTINGS_KEY);
    await context.clock.setFixedTime(T0);
    await page.goto("/teacher");
    await cards(page).filter({ hasText: "Проценти и пропорции" }).getByRole("button", { name: "Start lesson" }).click();
    await page.getByRole("dialog", { name: "Which class?" }).getByRole("radio", { name: /II-4/ }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Start with II-4" }).click();
    await expect(page.getByText("Математика, II-4: Проценти и пропорции")).toBeVisible();
    await expect(page.getByRole("list", { name: "Where the lesson is" }).getByRole("listitem")).toHaveText([/Waiting for the students/, /Teaching/, /Review/, /The end/]);
    await expect(page.getByRole("heading", { name: "When you are ready" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Projector screen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start the lesson" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open the projector screen" })).toBeVisible();
    await expect(count(page)).toHaveText("0 of 26 joined");
    await expect(page.getByRole("heading", { name: "Not here yet (26)" })).toBeVisible();
    const name = await page.locator(".person__name").first().innerText();
    expect(name).toMatch(/^[A-Za-z' -]+$/);
    await page.locator(".person").first().getByRole("button", { name: /^No phone/ }).click();
    await expect(page.getByRole("dialog").locator(".choice")).toHaveText(["No phone", "Empty battery", "No internet", "Screen locking is not allowed"]);
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await at(context, 40, page);
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

  test("at a faculty the console says students and group, and the line of states says it too", async ({ page, context }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "mk", schoolType: "university", schoolSeen: true })), SETTINGS_KEY);
    await context.clock.setFixedTime(T0);
    await page.goto("/teacher");
    await cards(page).first().getByRole("button", { name: "Започни час" }).click();
    await page.getByRole("dialog", { name: "Со која група?" }).getByRole("button", { name: /^Започни со Група 1А$/ }).click();
    await expect(page).toHaveURL(/\/teacher\/live\//);
    await expect(page.getByRole("list", { name: "Каде е часот" }).getByRole("listitem").first()).toContainText("Чекаме студенти");
    await expect(page.getByText(/Проекторот мора.*Вашите студенти/)).toBeVisible();
    await expect(count(page)).toHaveText("0 од 28 се приклучија");
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Уште 28 не се приклучиле.");
  });
});

test.describe("the screen", () => {
  test("the console works at 200% zoom: no sideways scroll, and the projector button and the yellow button are in reach", async ({ page, context }) => {
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
    // A student's row, and its button, fit.
    const button = page.locator(".person[data-state=not_yet]").first().getByRole("button");
    await button.scrollIntoViewIfNeeded();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  });

  test("the console fits 1024 x 768 and 1280 x 720 with no sideways scroll, and every button is at least 48px tall", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    for (const size of [{ width: 1024, height: 768 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(size);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      const heights = await page.locator(".live button:visible, .live a.btn:visible").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      for (const h of heights) expect(h).toBeGreaterThanOrEqual(47.5);
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
    await page.getByRole("link", { name: "Библиотека" }).click();
    await expect(page.getByRole("group", { name: /Час во тек/ })).toBeVisible();
  });
});

test.describe("what the review of step 8 changed", () => {
  test("the projector button comes first and is in the first screen at 1280 x 720 and 1024 x 768, above the one yellow button", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    for (const size of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size);
      const projector = page.getByRole("button", { name: "Отвори го екранот за проектор" });
      await expect(projector).toBeInViewport({ ratio: 1 });
      const start = page.getByRole("button", { name: "Почни го часот" });
      expect((await projector.boundingBox())!.y).toBeLessThan((await start.boundingBox())!.y);
      // The projector button is outlined and big, and the yellow one is the page's only yellow.
      await expect(projector).toHaveClass(/btn--secondary/);
      await expect(projector).toHaveClass(/btn--big/);
      await expect(yellow(page)).toHaveCount(1);
    }
  });

  test("the card of who has joined has no gap between the count and the list, and the line that says what was done takes room only while it has something to say", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    const gap = async () => {
      const a = (await count(page).boundingBox())!;
      const b = (await page.locator(".roster__heading").first().boundingBox())!;
      return b.y - (a.y + a.height);
    };
    expect(await gap()).toBeLessThanOrEqual(32);
    await page.locator(".person[data-state=not_yet]").first().getByRole("button", { name: /^Без телефон/ }).click();
    await page.getByRole("dialog").getByRole("radio", { name: "Нема телефон" }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Означи како присутен" }).click();
    await expect(page.locator(".roster__said")).toContainText("е означен како присутен без телефон");
    // It is read out by a region that was there before it was needed.
    await expect(page.getByRole("status").filter({ hasText: "е означен како присутен без телефон" })).toHaveCount(1);
  });

  test("the question before starting is calm, and does not count a student marked without a phone among those who have not joined", async ({ page, context }) => {
    await start(page, context);
    await at(context, 40, page);
    const missing = 26 - joinedAt(40);
    await page.locator(".person[data-state=not_yet]").first().getByRole("button", { name: /^Без телефон/ }).click();
    await page.getByRole("dialog").getByRole("radio", { name: "Нема телефон" }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Означи како присутен" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    const ask = page.getByRole("alertdialog", { name: "Да го почнеме часот сега?" });
    await expect(ask).toContainText(`Уште ${missing - 1} не се приклучиле.`);
    // The safe answer is the yellow one and has the focus; Escape stays, and the lesson is still in the lobby.
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
    await expect(calm).toHaveText("0 од 26 се приклучија");
    // Not a live region for the people: only the one that says the count.
    await expect(page.locator(".person[role], .roster__list[aria-live]")).toHaveCount(0);
    await at(context, 40, page);
    await expect(calm).toHaveText(`${joinedAt(40)} од 26 се приклучија`, { timeout: 10_000 });
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
