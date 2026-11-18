import type { BrowserContext, Page } from "@playwright/test";
import { expect, tall, test } from "./fixtures";
import { go, next, openProjector, panel, PLANS, send, SESSION, start, T0, TEACHING_AT, mainButton, at } from "./live-helpers";
import { simulate } from "../../../lib/teacher/api/mock-live";

/**
 * The end of a lesson: End with its question, and the end page, which is one list of the students who joined, in register order, each with their score
 * ("4 од 6"), to copy or print. In mock mode, in Macedonian. The clock is the test's; the lesson is "Проценти и пропорции" as in the other live specs
 * (6 questions).
 */

const LIVE = `/teacher/live/${SESSION}`;
/** The top bar's End; after the last question the panel has a second one, the same button, so the first in the page is taken. */
const endButton = (page: Page) => page.getByRole("button", { name: "Заврши го часот", exact: true }).first();
const question = (page: Page) => page.getByRole("alertdialog", { name: "Дали сакате да го завршите часот?" });

/** Send the first `count` questions a minute apart on the test's clock; each one's answer shows by itself when its time ends. */
async function ask(page: Page, context: BrowserContext, count: number) {
  let t = TEACHING_AT;
  for (let i = 0; i < count; i++) {
    await (i === 0 ? send(page) : next(page)).click();
    t += 60;
    await go(context, t);
    t += 1;
  }
  await go(context, t);
}

async function endIt(page: Page) {
  await endButton(page).click();
  await question(page).getByRole("button", { name: "Да, заврши го часот" }).click();
}

test.describe("End", () => {
  for (const [name, getReady] of [
    ["the lobby", async () => {}],
    ["teaching", async (page: Page, context: BrowserContext) => {
      await at(context, TEACHING_AT, page);
      await page.getByRole("button", { name: "Почни го часот" }).click();
      await page.getByRole("button", { name: "Да, почни го часот" }).click();
      await expect(panel(page)).toBeVisible();
    }],
    ["after the last question", async (page: Page, context: BrowserContext) => {
      await at(context, TEACHING_AT, page);
      await page.getByRole("button", { name: "Почни го часот" }).click();
      await page.getByRole("button", { name: "Да, почни го часот" }).click();
      await ask(page, context, 6);
      await expect(panel(page).getByTestId("none-left")).toBeVisible();
    }],
  ] as const) {
    test(`from ${name}: it asks first, the safe answer is the default, and the lesson becomes the end page`, async ({ page, context }) => {
      await start(page, context);
      const projector = await openProjector(page, context);
      await getReady(page, context);
      await expect(endButton(page)).toHaveClass(/btn--danger/);
      await endButton(page).click();
      const q = question(page);
      await expect(q).toContainText("Часот се затвора. Учениците повеќе не можат да се приклучат ниту да одговараат, и се запишува списокот со нивните резултати.");
      await expect(q.getByRole("button", { name: "Не, часот останува отворен" })).toBeFocused();
      await expect(q.getByRole("button", { name: "Не, часот останува отворен" })).toHaveClass(/btn--primary/);
      await expect(q.getByRole("button", { name: "Да, заврши го часот" })).toHaveClass(/btn--danger/);
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
    for (const url of ["/teacher", "/teacher/library"]) {
      await page.goto(url);
      await expect(page.getByText("Час во тек")).toHaveCount(0);
    }
  });

  test("from the reminder on any page, Lessons included: the same question, then the end page", async ({ page, context }) => {
    await start(page, context);
    for (const url of ["/teacher", "/teacher/library"]) {
      await page.goto(url);
      await expect(page.locator(".running--side")).toBeVisible();
    }
    await page.locator(".running--side").getByRole("button", { name: "Заврши го часот" }).click();
    await expect(question(page).getByRole("button", { name: "Не, часот останува отворен" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".running--side")).toBeVisible();

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


/** A whole lesson, ended: the end page. The clock stands 396 seconds in, after six questions sent at 30, 91, 152 ... seconds. */
const END_AT = TEACHING_AT + 61 * 6;
async function endedLesson(page: Page, context: BrowserContext) {
  await start(page, context);
  await at(context, TEACHING_AT, page);
  await page.getByRole("button", { name: "Почни го часот" }).click();
  await page.getByRole("button", { name: "Да, почни го часот" }).click();
  await ask(page, context, 6);
  await endIt(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Часот заврши");
}

/** How many questions each student who had joined by the end was asked: the ones sent after they joined. Sorted, since the page's names are not known here. */
function expectedAsked() {
  const sent = Array.from({ length: 6 }, (_, i) => T0 + (TEACHING_AT + 61 * i) * 1000);
  const input = { started_at: T0, teaching_at: T0 + TEACHING_AT * 1000, now: T0 + END_AT * 1000 };
  return PLANS.map((p) => simulate(p, input).joined_at)
    .filter((joined): joined is number => joined !== null)
    .map((joined) => sent.filter((fired) => joined <= fired).length)
    .sort((a, b) => a - b);
}

test.describe("the end page", () => {
  test("one full-width list of the students who joined, in the register's order, each with a score, and nothing beside it", async ({ page, context }) => {
    await endedLesson(page, context);
    const expected = expectedAsked();
    const rows = page.getByTestId("att-row");
    await expect(rows).toHaveCount(expected.length);
    // The title, and how many there were.
    await expect(page.getByRole("heading", { name: "Ученици на часот" })).toBeVisible();
    await expect(page.getByTestId("end-count")).toHaveText(`${expected.length} ${expected.length % 10 === 1 && expected.length % 100 !== 11 ? "ученик" : "ученици"}`);
    // By surname, then name: the first word of each name is the surname, in the Macedonian alphabet.
    const surnames = (await rows.locator("th").allInnerTexts()).map((n) => n.split(" ")[0]);
    expect(surnames).toEqual([...surnames].sort((a, b) => a.localeCompare(b, "mk")));
    // "N од M": M is the number of questions put to that student, N never more; the numbers are bold.
    const scores = (await rows.locator("td").allInnerTexts()).map((text) => /^(\d+) од (\d+)$/.exec(text.trim())!.slice(1).map(Number));
    for (const [correct, asked] of scores) expect(correct).toBeLessThanOrEqual(asked);
    expect(scores.map(([, asked]) => asked).sort((a, b) => a - b)).toEqual(expected);
    await expect(rows.first().locator("td strong")).toHaveCount(2);
    // Nothing of the old page: no counts, no most-missed list, no practice set, no attendance words.
    for (const gone of [".att__counts", ".endpage__missed", ".practice", '[data-testid="missed-list"]', '[data-testid="count-present"]']) await expect(page.locator(gone)).toHaveCount(0);
    await expect(page.getByText(/присутен|доцна|вежби/i)).toHaveCount(0);
    // The one card is the width of the content: the same left and right edge as the page's content.
    const content = (await page.locator(".endpage").boundingBox())!;
    const card = (await page.locator(".att").boundingBox())!;
    expect(Math.abs(card.x - content.x)).toBeLessThan(2);
    expect(Math.abs(card.width - content.width)).toBeLessThan(2);
    // One main button, the way on, at the right of the title; the steps are over; the lesson was held.
    await expect(mainButton(page)).toHaveText(/Оди на Лекции/);
    await expect(mainButton(page)).toHaveCount(1);
    await expect(page.locator(".states__item[aria-current=step]")).toContainText("Крај");
    await expect(page.getByText("Часот е зачуван меѓу одржаните часови.")).toBeVisible();
    // Copy and print in the head of the card, on one row, quiet buttons of 44px.
    const copy = page.locator(".att").getByRole("button", { name: "Копирај го списокот" });
    const print = page.locator(".att").getByRole("button", { name: "Печати го списокот" });
    expect(Math.abs((await copy.boundingBox())!.y - (await print.boundingBox())!.y)).toBeLessThan(2);
    expect(await tall(copy)).toBe(44);
    expect(await tall(print)).toBe(44);
  });

  test("the list is copied as one student a line, name and score, and the line that says so takes the focus", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await endedLesson(page, context);
    await page.getByRole("button", { name: "Копирај го списокот" }).click();
    const note = page.getByText("Списокот е копиран. Можете да го залепите во е-Дневник.");
    await expect(note).toBeVisible();
    await expect(note).toBeFocused();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    const lines = text.split("\n");
    expect(lines).toHaveLength(expectedAsked().length);
    for (const line of lines) expect(line).toMatch(/^\S+ [^\t]+\t\d+ од \d+$/u);
    // The same lines, in the same order, as the table.
    const rows = page.getByTestId("att-row");
    const shown = await rows.evaluateAll((trs) => trs.map((tr) => `${tr.querySelector("th")!.textContent}\t${tr.querySelector("td")!.textContent}`));
    expect(lines).toEqual(shown);
  });

  test("when copying is refused, it says so and tells what to do", async ({ page, context }) => {
    await endedLesson(page, context);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) }, configurable: true });
    });
    await page.getByRole("button", { name: "Копирај го списокот" }).click();
    await expect(page.getByText("Не успеавме да го копираме списокот.")).toBeFocused();
  });

  test("it can be printed: on paper only the card is shown, with the lesson and the day above it, black on white", async ({ page, context }) => {
    await endedLesson(page, context);
    await expect(page.getByRole("button", { name: "Печати го списокот" })).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".att-print__title")).toBeVisible();
    await expect(page.locator(".att-print .att__actions")).toBeHidden();
    await expect(page.locator(".att-print__title")).toContainText("Проценти и пропорции");
    await expect(page.locator(".att-print__title")).toContainText(/\d{4}/);
    await expect(page.locator(".att-print h2")).toHaveCSS("color", "rgb(0, 0, 0)");
    await expect(page.locator(".att-print")).toHaveCSS("color", "rgb(0, 0, 0)");
    await expect(page.locator(".att-print")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    expect(await page.locator(".sidebar").evaluate((el) => getComputedStyle(el).visibility)).toBe("hidden");
    await page.emulateMedia({ media: "screen" });
  });

  test("a lesson nobody joined: one line says so, and there is no table, Copy or Print", async ({ page, context }) => {
    await start(page, context);
    await endIt(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Часот заврши");
    await expect(page.getByTestId("end-none")).toHaveText("Никој не се приклучи на овој час.");
    await expect(page.getByTestId("att-row")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Копирај го списокот" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Печати го списокот" })).toHaveCount(0);
    await expect(mainButton(page)).toHaveText(/Оди на Лекции/);
  });

  test("a reload shows the same page, and so does the held lesson, opened from its own page in the Library", async ({ page, context }) => {
    await endedLesson(page, context);
    const before = await page.getByTestId("att-row").allInnerTexts();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Часот заврши");
    expect(await page.getByTestId("att-row").allInnerTexts()).toEqual(before);
    await page.goto("/teacher/lessons/l-procenti");
    await page.getByTestId("last-run").click();
    await expect(page).toHaveURL(new RegExp(`${LIVE}$`));
    expect(await page.getByTestId("att-row").allInnerTexts()).toEqual(before);
  });
});
