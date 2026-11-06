import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { CLASS_IDS, go, next, openProjector, panel, PLANS, reveal, row, send, SESSION, start, TEACHING_AT, teach, yellow, at } from "./live-helpers";

/**
 * The end of a lesson, step 10: the way from teaching to the review, the review on the console and on the projector, End with its question, the end page with the
 * attendance list for e-Дневник, the practice set, a second window, a failure and a reload. In mock mode, in Macedonian. The clock is the test's; the lesson is
 * "Проценти и пропорции" for II-4 as in the other live specs (6 questions).
 */

const LIVE = `/teacher/live/${SESSION}`;
const endButton = (page: Page) => page.getByRole("button", { name: "Заврши го часот", exact: true });
const question = (page: Page) => page.getByRole("alertdialog", { name: "Дали сакате да го завршите часот?" });
const toReview = (page: Page) => panel(page).getByRole("button", { name: "Премини на прегледот", exact: true });
const early = (page: Page) => panel(page).getByRole("button", { name: "Премини на прегледот сега" });
const neverJoins = CLASS_IDS.filter((id) => !PLANS.some((p) => p.id === id));

/** Send, close and show the answer of the first `count` questions, a minute apart on the test's clock. Ends with the answer of the last shown. */
async function ask(page: Page, context: BrowserContext, count: number) {
  let t = TEACHING_AT;
  for (let i = 0; i < count; i++) {
    await (i === 0 ? send(page) : next(page)).click();
    t += 60;
    await go(context, t);
    await reveal(page).click();
    t += 1;
  }
  await go(context, t);
}

/** Leave the lesson for the review before every question has been sent: the quiet control and its question. */
async function reviewEarly(page: Page) {
  await early(page).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Да, премини на прегледот" }).click();
}

async function endIt(page: Page) {
  await endButton(page).click();
  await question(page).getByRole("button", { name: "Да, заврши го часот" }).click();
}

test.describe("from teaching to the review", () => {
  test("after the last question the panel says so and the one yellow button goes on to the review", async ({ page, context }) => {
    const projector = await teach(page, context);
    await ask(page, context, 6);
    await expect(panel(page).getByTestId("none-left")).toContainText("Сите прашања се готови");
    await expect(yellow(page)).toHaveCount(1);
    await expect(yellow(page)).toHaveText("Премини на прегледот");
    // Nothing is left to send, so there is no quiet way to leave early either.
    await expect(early(page)).toHaveCount(0);
    await toReview(page).click();
    await expect(page.locator(".states__item[aria-current=step]")).toContainText("Преглед");
    await expect(page.getByRole("heading", { name: "Сега на проекторот", exact: true })).toBeVisible();
    await expect(projector.getByTestId("cv-missed")).toBeVisible();
  });

  test("early, while questions remain: a quiet control, a question first that says what is lost, with the safe answer as the default", async ({ page, context }) => {
    await teach(page, context);
    await expect(early(page)).toBeVisible();
    await expect(early(page)).toHaveClass(/btn--quiet/);
    // Never while a question is open or waiting for its answer to be shown.
    await send(page).click();
    await expect(early(page)).toHaveCount(0);
    await go(context, TEACHING_AT + 60);
    await expect(reveal(page)).toBeVisible();
    await expect(early(page)).toHaveCount(0);
    await reveal(page).click();
    await expect(early(page)).toBeVisible();

    await early(page).click();
    const dialog = page.getByRole("alertdialog", { name: "Да преминеме на прегледот сега?" });
    await expect(dialog).toContainText("5 прашања што не сте ги испратиле нема да бидат поставени.");
    await expect(dialog.getByRole("button", { name: "Не, продолжи со предавањето" })).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Не, продолжи со предавањето" })).toHaveClass(/btn--primary/);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator(".states__item[aria-current=step]")).toContainText("Предавање");

    await early(page).click();
    await dialog.getByRole("button", { name: "Да, премини на прегледот" }).click();
    await expect(page.locator(".states__item[aria-current=step]")).toContainText("Преглед");
  });
});

test.describe("the review", () => {
  test("on the console: the worst first, each with the right answer and how many missed it; the names of those who asked, to answer aloud", async ({ page, context }) => {
    await teach(page, context);
    await ask(page, context, 6);
    await toReview(page).click();
    const items = page.getByTestId("missed-list").locator("li");
    await expect(items).toHaveCount(5);
    const counts = await items.locator(".rlist__count").allInnerTexts();
    const shares = counts.map((c) => {
      const [, m, j] = /^(\d+) од (\d+)/.exec(c)!;
      return Number(m) / Number(j);
    });
    expect(shares).toEqual([...shares].sort((a, b) => b - a));
    await expect(items.first().locator(".rlist__answer")).toContainText("Точен одговор:");
    // The questions the class wrote, with the sender's name, here only.
    const anon = page.getByTestId("anon");
    await expect(anon.first()).toBeVisible();
    await expect(anon.first().locator("strong")).not.toBeEmpty();
    await anon.first().getByRole("button", { name: /^Означи како одговорено/ }).click();
    await expect(page.locator('[data-testid="anon"][data-answered=true]')).toHaveCount(1);
    await expect(yellow(page)).toHaveText("Следно на проекторот");
  });

  test("on the projector: one screen at a time which the teacher steps through, the right answer and why, then the questions with no name", async ({ page, context }) => {
    const projector = await teach(page, context);
    await ask(page, context, 6);
    await toReview(page).click();
    const first = page.getByTestId("missed-list").locator(".rlist__prompt").first();
    await expect(projector.getByTestId("cv-missed")).toBeVisible();
    await expect(projector.getByTestId("cv-prompt")).toHaveText((await first.innerText()).trim());
    await expect(projector.getByTestId("cv-answer")).toContainText("Точен одговор");
    await expect(projector.getByTestId("cv-count")).toContainText("погрешија");
    await expect(projector.getByTestId("cv-why")).toBeVisible();
    // The projector sizes by the window and never scrolls.
    expect(await projector.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);

    const nextOnProjector = page.getByRole("button", { name: "Следно на проекторот" });
    for (let i = 0; i < 4; i++) await nextOnProjector.click();
    await expect(page.getByTestId("screen-now")).toContainText("Се прикажува 5 од");
    await nextOnProjector.click();
    // The questions the class wrote, text only.
    await expect(projector.getByTestId("cv-anon")).toBeVisible();
    const senders = await page.getByTestId("anon").locator("strong").allInnerTexts();
    const shown = await projector.getByTestId("cv-anon-text").allInnerTexts();
    expect(shown.length).toBeGreaterThan(0);
    const wholeScreen = await projector.locator("main").innerText();
    for (const name of senders) expect(wholeScreen).not.toContain(name);
    for (const text of await page.getByTestId("anon").locator(".inbox__text").allInnerTexts()) expect(wholeScreen).toContain(text);
    // The last has been shown: no yellow step is left, and the way on is the red End.
    await expect(nextOnProjector).toHaveCount(0);
    await expect(yellow(page)).toHaveCount(0);
    await expect(endButton(page)).toBeVisible();
    // Back one.
    await page.getByRole("button", { name: "Претходно" }).click();
    await expect(projector.getByTestId("cv-missed")).toBeVisible();
  });

  test("the console in review: the compact header, the panel first with what the projector shows, the list below with that item marked", async ({ page, context }) => {
    const projector = await teach(page, context);
    await ask(page, context, 6);
    await toReview(page).click();
    await expect(page.locator(".head")).toHaveClass(/head--compact/);
    const now = page.locator(".rpanel");
    const list = page.getByTestId("missed-list");
    // The panel is above the list, in the first screen, with the yellow button on one line.
    const box = await now.boundingBox();
    const listBox = await list.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(listBox!.y);
    for (const [w, h] of [[1024, 768], [1280, 720], [1440, 900]] as const) {
      await page.setViewportSize({ width: w, height: h });
      const next = now.getByRole("button", { name: "Следно на проекторот" });
      const b = await next.boundingBox();
      expect(b!.y + b!.height).toBeLessThanOrEqual(h);
      expect(b!.height).toBeLessThan(80);
    }
    await expect(page.getByTestId("screen-now")).toContainText("Се прикажува 1 од 6");
    const prompt = (await list.locator(".rlist__prompt").first().innerText()).trim();
    await expect(page.getByTestId("now-prompt")).toHaveText(prompt);
    await expect(page.getByTestId("now-answer")).toContainText("Точен одговор:");
    await expect(page.getByTestId("now-count")).toContainText("погрешија");
    await expect(list.locator("li[aria-current=true]")).toHaveCount(1);
    await expect(list.locator("li").first()).toHaveAttribute("aria-current", "true");
    await expect(list.locator("li").first().getByTestId("on-projector")).toHaveText("На проекторот");
    // Back is a quiet control, and only from the second screen.
    await expect(now.getByRole("button", { name: "Претходно" })).toHaveCount(0);
    await now.getByRole("button", { name: "Следно на проекторот" }).click();
    await expect(list.locator("li").nth(1)).toHaveAttribute("aria-current", "true");
    await expect(now.getByRole("button", { name: "Претходно" })).toHaveClass(/btn--quiet/);
    await expect(projector.getByTestId("cv-missed")).toContainText("2 од");
  });

  test("the anonymous questions on the panel carry the sender's name for the teacher, and the projector none", async ({ page, context }) => {
    const projector = await teach(page, context);
    await ask(page, context, 6);
    await toReview(page).click();
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Следно на проекторот" }).click();
    const names = await page.getByTestId("now-anon").locator("strong").allInnerTexts();
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n.trim()).not.toBe("");
    await expect(page.getByTestId("anon").locator('[data-testid="on-projector"]').first()).toBeVisible();
    const whole = await projector.locator("main").innerText();
    for (const n of names) expect(whole).not.toContain(n);
  });

  test("after the last screen the panel says the review is done and points to End; the focus is not put on End", async ({ page, context }) => {
    await teach(page, context);
    await ask(page, context, 6);
    await toReview(page).click();
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Следно на проекторот" }).click();
    await expect(page.getByTestId("review-done")).toContainText("Прегледот е готов");
    const go = page.getByRole("button", { name: "Оди до „Заврши го часот“" });
    await go.click();
    await expect(endButton(page)).toBeInViewport();
    await expect(endButton(page)).not.toBeFocused();
  });

  test("the place survives a reload of the console, and a reload of either window leaves both agreeing", async ({ page, context }) => {
    const projector = await teach(page, context);
    await ask(page, context, 6);
    await toReview(page).click();
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Следно на проекторот" }).click();
    await expect(projector.getByTestId("cv-missed")).toContainText("3 од");
    await page.reload();
    await expect(page.getByTestId("screen-now")).toContainText("Се прикажува 3 од 6");
    await expect(page.getByTestId("missed-list").locator("li").nth(2)).toHaveAttribute("aria-current", "true");
    await expect(projector.getByTestId("cv-missed")).toContainText("3 од");
    await projector.reload();
    await expect(projector.getByTestId("cv-missed")).toContainText("3 од");
    // Both at once.
    await Promise.all([page.reload(), projector.reload()]);
    await expect(page.getByTestId("screen-now")).toContainText("Се прикажува 3 од 6");
    await expect(projector.getByTestId("cv-missed")).toContainText("3 од");
  });

  test("a projector opened or reloaded in the middle of the review finds the place the console is at", async ({ page, context }) => {
    const projector = await teach(page, context);
    await ask(page, context, 2);
    await reviewEarly(page);
    await page.getByRole("button", { name: "Следно на проекторот" }).click();
    await expect(projector.getByTestId("cv-missed")).toContainText("2 од");
    await projector.reload();
    await expect(projector.getByTestId("cv-missed")).toContainText("2 од");
  });

  test("with nothing missed and no questions asked it says so, plainly, on both screens, and goes on to End", async ({ page, context }) => {
    const projector = await teach(page, context);
    await early(page).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Да, премини на прегледот" }).click();
    await expect(page.getByTestId("none-missed")).toHaveText("Никој не згреши ниту едно прашање");
    await expect(projector.getByTestId("cv-none")).toHaveText("Никој не згреши ниту едно прашање");
    await expect(endButton(page)).toBeVisible();
  });
});

test.describe("End", () => {
  for (const [name, getReady] of [
    ["the lobby", async () => {}],
    ["teaching", async (page: Page, context: BrowserContext) => {
      await at(context, TEACHING_AT, page);
      await page.getByRole("button", { name: "Почни го часот" }).click();
      await page.getByRole("button", { name: "Да, почни го часот" }).click();
      await expect(panel(page)).toBeVisible();
    }],
    ["the review", async (page: Page, context: BrowserContext) => {
      await at(context, TEACHING_AT, page);
      await page.getByRole("button", { name: "Почни го часот" }).click();
      await page.getByRole("button", { name: "Да, почни го часот" }).click();
      await early(page).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Да, премини на прегледот" }).click();
      await expect(page.getByTestId("none-missed")).toBeVisible();
    }],
  ] as const) {
    test(`from ${name}: it asks first, the safe answer is the default, and the lesson becomes the end page`, async ({ page, context }) => {
      await start(page, context);
      const projector = await openProjector(page, context);
      await getReady(page, context);
      await expect(endButton(page)).toHaveClass(/btn--danger/);
      await endButton(page).click();
      const q = question(page);
      await expect(q).toContainText("Часот се затвора. Учениците повеќе не можат да се приклучат ниту да одговараат, и се запишува списокот кој бил присутен.");
      await expect(q.getByRole("button", { name: "Не, часот останува отворен" })).toBeFocused();
      await expect(q.getByRole("button", { name: "Не, часот останува отворен" })).toHaveClass(/btn--primary/);
      await expect(q.getByRole("button", { name: "Да, заврши го часот" })).toHaveClass(/btn--danger|btn--secondary/);
      // No is safe: nothing happened.
      await page.keyboard.press("Escape");
      await expect(q).toBeHidden();
      await expect(page.locator(".states__item[aria-current=step]")).not.toContainText("Крај");
      await endIt(page);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Часот заврши");
      await expect(page.locator(".states__item[aria-current=step]")).toContainText("Крај");
      await expect(page).toHaveURL(new RegExp(`${LIVE}$`));
      // The projector says the lesson is over, and holds no student's name.
      await expect(projector.getByRole("heading", { name: "Часот заврши" })).toBeVisible();
      expect(await projector.locator("main").innerText()).not.toMatch(/Петровска|Манчевск|Атанасовск/);
    });
  }

  test("a second window follows to the end page, and no band is left on any page", async ({ page, context }) => {
    await start(page, context);
    const other = await context.newPage();
    await other.goto(LIVE);
    await expect(endButton(other)).toBeVisible();
    await endIt(page);
    await expect(other.getByRole("heading", { level: 1 })).toHaveText("Часот заврши", { timeout: 10_000 });
    for (const url of ["/teacher", "/teacher/lessons"]) {
      await page.goto(url);
      await expect(page.getByText("Час во тек")).toHaveCount(0);
    }
  });

  test("from the band on Today and from the reminder on another page: the same question, then the end page", async ({ page, context }) => {
    await start(page, context);
    await page.goto("/teacher");
    await expect(page.locator(".band")).toBeVisible();
    await page.locator(".band").getByRole("button", { name: "Заврши го часот" }).click();
    await expect(question(page).getByRole("button", { name: "Не, часот останува отворен" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".band")).toBeVisible();

    await page.goto("/teacher/lessons");
    await page.locator(".running--side").getByRole("button", { name: "Заврши го часот" }).click();
    await question(page).getByRole("button", { name: "Да, заврши го часот" }).click();
    await expect(page).toHaveURL(new RegExp(`${LIVE}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Часот заврши");
    await expect(page.locator(".running--side")).toHaveCount(0);
  });

  test("when it fails the lesson stays open and says so, and pressing yes again tries again", async ({ page, context }) => {
    await start(page, context);
    await endButton(page).click();
    await context.setOffline(true);
    await question(page).getByRole("button", { name: "Да, заврши го часот" }).click();
    await expect(question(page).getByRole("alert")).toContainText("Не успеавме да го завршиме часот. Тој е сѐ уште отворен и ништо не е изгубено.");
    await expect(page.locator(".states__item[aria-current=step]")).toContainText("Чекаме ученици");
    await context.setOffline(false);
    await question(page).getByRole("button", { name: "Да, заврши го часот" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Часот заврши");
  });

  test("the demo's Settings no longer closes a lesson", async ({ page, context }) => {
    await start(page, context);
    await page.goto("/teacher/settings");
    await expect(page.getByRole("button", { name: "Затвори го демо часот" })).toHaveCount(0);
    await expect(page.getByText("Еден час е во тек. Затворете го со „Заврши го часот“")).toBeVisible();
  });
});

/** A whole lesson, ended with a student marked present without a phone: the end page. */
async function endedLesson(page: Page, context: BrowserContext) {
  await start(page, context);
  const projector = await openProjector(page, context);
  await at(context, 3, page);
  await row(page, neverJoins[0]).getByRole("button", { name: /^Без телефон/ }).click();
  await page.getByRole("dialog").getByRole("radio", { name: "Празна батерија" }).check();
  await page.getByRole("dialog").getByRole("button", { name: "Означи како присутен" }).click();
  await at(context, TEACHING_AT, page);
  await page.getByRole("button", { name: "Почни го часот" }).click();
  await page.getByRole("button", { name: "Да, почни го часот" }).click();
  await ask(page, context, 6);
  await toReview(page).click();
  await endIt(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Часот заврши");
  return projector;
}

test.describe("the end page", () => {
  test("every enrolled student in the register's order, four statuses, the counts above, the reason for no phone", async ({ page, context }) => {
    await endedLesson(page, context);
    const rows = page.getByTestId("att-row");
    await expect(rows).toHaveCount(26);
    const nums = await Promise.all(["present", "late", "absent", "present_no_device"].map(async (s) => Number(await page.getByTestId(`count-${s}`).innerText())));
    expect(nums.reduce((a, b) => a + b, 0)).toBe(26);
    expect(await page.getByTestId("count-total").innerText()).toBe("26");
    expect(nums[0]).toBeGreaterThan(0);
    expect(nums[2]).toBeGreaterThan(0);
    expect(nums[3]).toBe(1);
    await expect(page.locator('[data-status="late"][data-testid="att-row"]').first()).toContainText("Задоцнет/а");
    await expect(page.locator('[data-status="present_no_device"][data-testid="att-row"]')).toContainText("Присутен/а без телефон (празна батерија)");
    await expect(page.locator('[data-status="absent"][data-testid="att-row"]').first()).toContainText("Отсутен/а");
    // By surname, then name: the first word of each name is the surname, in the Macedonian alphabet.
    const surnames = (await rows.locator("th").allInnerTexts()).map((n) => n.split(" ")[0]);
    expect(surnames).toEqual([...surnames].sort((a, b) => a.localeCompare(b, "mk")));
    // One yellow button, the way on.
    await expect(yellow(page)).toHaveText(/Оди на Денес/);
    await expect(yellow(page)).toHaveCount(1);
  });

  test("the list is copied as one student a line, and the line that says so takes the focus", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await endedLesson(page, context);
    await page.getByRole("button", { name: "Копирај го списокот" }).click();
    const note = page.getByText("Списокот е копиран. Можете да го залепите во е-Дневник.");
    await expect(note).toBeVisible();
    await expect(note).toBeFocused();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    const lines = text.split("\n");
    expect(lines).toHaveLength(26);
    for (const line of lines) expect(line).toMatch(/^\S+ [^:]+: (присутен\/а|задоцнет\/а|отсутен\/а|присутен\/а без телефон \(.+\))$/u);
    expect(lines.some((l) => l.endsWith("присутен/а без телефон (празна батерија)"))).toBe(true);
  });

  test("it can be printed: on paper only the list is shown, black on white", async ({ page, context }) => {
    await endedLesson(page, context);
    await expect(page.getByRole("button", { name: "Печати го списокот" })).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".att-print__title")).toBeVisible();
    await expect(page.locator(".att-print .att__actions")).toBeHidden();
    // Only the heading, the class, the lesson and the day above the list: no counts, no buttons.
    await expect(page.locator(".att-print .att__counts")).toBeHidden();
    await expect(page.locator(".att-print__title")).toContainText("II-4");
    await expect(page.locator(".att-print__title")).toContainText("Проценти и пропорции");
    await expect(page.locator(".att-print__title")).toContainText(/\d{4}/);
    await expect(page.locator(".att-print h2")).toHaveCSS("color", "rgb(0, 0, 0)");
    await expect(page.locator(".endpage__missed")).toBeHidden();
    await expect(page.locator(".att-print")).toHaveCSS("color", "rgb(0, 0, 0)");
    await expect(page.locator(".att-print")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    expect(await page.locator(".sidebar").evaluate((el) => getComputedStyle(el).visibility)).toBe("hidden");
    await page.emulateMedia({ media: "screen" });
  });

  test("the most-missed questions, short, in the order of the review", async ({ page, context }) => {
    await endedLesson(page, context);
    const items = page.getByTestId("missed-list").locator("li");
    await expect(items).toHaveCount(5);
    await expect(items.first().locator(".rlist__count")).toContainText("погрешија");
  });

  test("a reload shows the same page, and so does the held lesson, from its own page", async ({ page, context }) => {
    await endedLesson(page, context);
    const before = await page.getByTestId("count-absent").innerText();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Часот заврши");
    await expect(page.getByTestId("count-absent")).toHaveText(before);
    await page.goto("/teacher/lessons/l-procenti");
    await page.getByTestId("last-run").click();
    await expect(page).toHaveURL(new RegExp(`${LIVE}$`));
    await expect(page.getByTestId("count-absent")).toHaveText(before);
  });
});

test.describe("the practice set", () => {
  test("is made from what was missed, once: the button goes, the page says it was sent and how many questions, and who has done it fills in", async ({ page, context }) => {
    await endedLesson(page, context);
    const sendButton = page.getByRole("button", { name: "Испрати вежби на класот" });
    await expect(sendButton).toBeVisible();
    await expect(sendButton).not.toHaveClass(/btn--primary/);
    await sendButton.click();
    await expect(page.getByTestId("practice-sent")).toHaveText("Вежбите се испратени");
    await expect(page.getByTestId("practice-count")).toContainText(/Имаат \d+ прашањ(е|а)\. Учениците ги решаваат сами, без поени\./);
    await expect(sendButton).toHaveCount(0);
    await expect(page.getByTestId("practice-done")).toHaveText("0 од 26 завршија");
    // Time passes, and some have done it.
    await go(context, TEACHING_AT + 6 * 61 + 30 * 60);
    await page.reload();
    await expect(page.getByTestId("practice-sent")).toBeVisible();
    await expect(sendButton).toHaveCount(0);
    expect(await page.getByTestId("practice-student").count()).toBeGreaterThan(2);
    await expect(page.getByTestId("practice-student").first()).toContainText(/\d+ од \d+ точни/);
  });

  test("when sending fails it says so and offers to try again; it is never shown as sent until it was", async ({ page, context }) => {
    await endedLesson(page, context);
    await context.setOffline(true);
    await page.getByRole("button", { name: "Испрати вежби на класот" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Не успеавме да ги испратиме вежбите. Не се испратени." })).toBeVisible();
    await expect(page.getByTestId("practice-sent")).toHaveCount(0);
    await context.setOffline(false);
    await page.getByRole("button", { name: "Испрати вежби на класот" }).click();
    await expect(page.getByTestId("practice-sent")).toBeVisible();
  });

  test("when nothing was missed there is nothing to send, and the page says so", async ({ page, context }) => {
    await start(page, context);
    await endIt(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Часот заврши");
    await expect(page.getByTestId("practice-none")).toHaveText("Никој не згреши прашање, па нема вежби за испраќање.");
    await expect(page.getByRole("button", { name: "Испрати вежби на класот" })).toHaveCount(0);
    await expect(page.getByTestId("none-missed")).toHaveText("Никој не згреши ниту едно прашање");
  });
});

test.describe("the review survives a reload", () => {
  test("the console in the review, and the projector in the review, show the review again", async ({ page, context }) => {
    const projector = await teach(page, context);
    await ask(page, context, 3);
    await reviewEarly(page);
    await expect(page.getByTestId("missed-list")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("missed-list")).toBeVisible();
    await expect(page.locator(".states__item[aria-current=step]")).toContainText("Преглед");
    await projector.reload();
    await expect(projector.getByTestId("cv-missed")).toBeVisible();
  });
});
