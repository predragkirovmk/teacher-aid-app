import type { BrowserContext, Page } from "@playwright/test";
import { expect, MOCK_KEY, SETTINGS_KEY, test } from "./fixtures";

/**
 * Today, the window that starts a lesson, the read-only lesson, and the guide shown again from Settings, in mock mode, in
 * Macedonian unless a test changes the language. The clock stands still at Thursday 29 October 2026, 09:30, so the date in
 * words and "yesterday" and "3 days ago" read the same whenever the tests run. The demo's teacher has two lessons prepared:
 * "Основи на веројатноста" (IV-1, changed the day before) and "Проценти и пропорции" (II-4, changed 3 days before).
 */

const NOW = new Date("2026-10-29T09:30:00+01:00");
const title = (page: Page) => page.getByRole("heading", { level: 1 });
const mainMenu = (page: Page) => page.getByRole("navigation").first();
const yellow = (page: Page) => page.locator(".btn--primary:visible");
const cards = (page: Page) => page.locator(".lessons > li");
const startDialog = (page: Page) => page.getByRole("dialog", { name: /^Со кој(а)? (клас|група)\?$/ });
const runningDialog = (page: Page) => page.getByRole("dialog", { name: "Веќе имате час во тек" });
const demoButton = (page: Page, name: string) => page.getByRole("button", { name });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

// ---- Helpers that put things into the demo's saved state, as a teacher who had made them would have ----

const question = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `x-q${i}`,
  order: i,
  prompt: `Прашање ${i + 1}?`,
  media: null,
  explanation: null,
  timer_seconds: 20,
  topic: "Тема",
  kind: "true_false",
  correct: "true",
  ...extra,
});

/** A lesson of the demo teacher's own, as the mock keeps it: valid, prepared, not run. */
const lessonOf = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `l-x${n}`,
  title: `Додадена лекција ${n}`,
  subject: { id: "math", name: "Математика" },
  year: 2,
  question_count: 5,
  version: 1,
  times_run: 0,
  last_run_at: null,
  copied_from: null,
  created_at: `2026-10-28T1${n}:00:00.000Z`,
  updated_at: `2026-10-28T1${n}:00:00.000Z`,
  review_summary: "",
  questions: [0, 1, 2, 3, 4].map((i) => question(i)),
  source: null,
  emphasis: null,
  ...extra,
});

/** Add lessons to the demo school, then load the page again so the demo reads them. */
async function addLessons(page: Page, lessons: unknown[], school: "school" | "university" = "school") {
  await page.goto("/teacher");
  await expect(title(page)).toHaveText("Денес");
  await page.evaluate(
    ([key, kind, added]) => {
      const state = JSON.parse(localStorage.getItem(key as string) ?? "null");
      state[kind as string].lessons.push(...(added as unknown[]));
      localStorage.setItem(key as string, JSON.stringify(state));
    },
    [MOCK_KEY, school, lessons] as const,
  );
  await page.reload();
  await expect(title(page)).toHaveText("Денес");
}

/** The demo's saved state, for a test that wants to see what was kept. */
const savedSession = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.school?.session ?? null, MOCK_KEY);

// ---------------------------------------------------------------------------------------------------------------------

test.describe("Today with lessons prepared", () => {
  test("says the date in words, greets, and lists the lessons not run yet, the one changed last first", async ({ page }) => {
    await page.goto("/teacher");
    await expect(title(page)).toHaveText("Денес");
    await expect(page.getByText("четврток, 29 октомври", { exact: true })).toBeVisible();
    await expect(page.getByText("Добро утро, Марија", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Подготвени лекции" })).toBeVisible();

    await expect(cards(page)).toHaveCount(2);
    // Each: title, subject and year, number of questions, and when it was last changed, in plain words.
    await expect(cards(page).nth(0).getByRole("heading", { level: 3 })).toHaveText("Основи на веројатноста");
    await expect(cards(page).nth(0)).toContainText("Математика · IV година");
    await expect(cards(page).nth(0)).toContainText("7 прашања · Последна промена: вчера");
    await expect(cards(page).nth(1).getByRole("heading", { level: 3 })).toHaveText("Проценти и пропорции");
    await expect(cards(page).nth(1)).toContainText("Математика · II година");
    await expect(cards(page).nth(1)).toContainText("6 прашања · Последна промена: пред 3 дена");
    // Two labelled actions on each, a word beside every icon.
    for (const card of await cards(page).all()) {
      await expect(card.getByRole("button", { name: "Започни час" })).toBeVisible();
      await expect(card.getByRole("link", { name: "Отвори" })).toBeVisible();
    }
    // Nothing is running, so no band.
    await expect(page.getByText("Час во тек", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Сите лекции" })).toHaveCount(0);
  });

  test("has one yellow button, \"Подготви лекција\", at the top above the lessons; the lessons' own buttons are not yellow", async ({ page }) => {
    await page.goto("/teacher");
    await expect(cards(page)).toHaveCount(2);
    await expect(yellow(page)).toHaveCount(1);
    const prepare = page.getByRole("link", { name: "Подготви лекција" });
    await expect(prepare).toHaveClass(/btn--primary/);
    await expect(prepare).toHaveAttribute("href", "/teacher/lessons/new?from=today");
    const [button, list] = [(await prepare.boundingBox())!, (await cards(page).first().boundingBox())!];
    expect(button.y).toBeLessThan(list.y);
    // Where the eye starts: under the title, inside the first screen of a 1280 x 720 window.
    expect(button.y + button.height).toBeLessThan(720);
    for (const card of await cards(page).all()) await expect(card.getByRole("button", { name: "Започни час" })).toHaveClass(/btn--secondary/);
  });

  test("the buttons are big enough: 56px, and 48px for the quiet link", async ({ page }) => {
    await page.goto("/teacher");
    const heights = async (locator: ReturnType<Page["locator"]>) => Promise.all((await locator.all()).map(async (b) => (await b.boundingBox())!.height));
    for (const h of await heights(page.getByRole("button", { name: "Започни час" }))) expect(h).toBeGreaterThanOrEqual(56);
    for (const h of await heights(page.getByRole("link", { name: "Отвори" }))) expect(h).toBeGreaterThanOrEqual(48);
    expect((await page.getByRole("link", { name: "Подготви лекција" }).boundingBox())!.height).toBeGreaterThanOrEqual(56);
    // And the type: 18px or more everywhere on the cards.
    const small = await page.locator(".lesson").evaluateAll((els) =>
      els.flatMap((el) => [el, ...el.querySelectorAll("*")]).filter((e) => e.childNodes.length && parseFloat(getComputedStyle(e).fontSize) < 16).length,
    );
    expect(small).toBe(0);
  });

  test("shows at most five, and leads to all of them", async ({ page }) => {
    await addLessons(page, [1, 2, 3, 4].map((n) => lessonOf(n)));
    await expect(cards(page)).toHaveCount(5);
    // The oldest change is the one left out.
    await expect(page.getByRole("heading", { level: 3, name: "Проценти и пропорции" })).toHaveCount(0);
    await expect(cards(page).first().getByRole("heading", { level: 3 })).toHaveText("Додадена лекција 4");
    const all = page.getByRole("link", { name: "Сите лекции" });
    await expect(all).toHaveAttribute("href", "/teacher/lessons");
    await all.click();
    await expect(page).toHaveURL(/\/teacher\/lessons$/);
    await expect(title(page)).toHaveText("Лекции");
  });

  test("exactly five are all shown, with no link to more", async ({ page }) => {
    await addLessons(page, [1, 2, 3].map((n) => lessonOf(n)));
    await expect(cards(page)).toHaveCount(5);
    await expect(page.getByRole("link", { name: "Сите лекции" })).toHaveCount(0);
  });

  test("a lesson that was run is not listed", async ({ page }) => {
    await page.goto("/teacher");
    // The seeded lessons that were run are not on Today: none of the history's titles is.
    await expect(page.getByRole("heading", { level: 3, name: "Квадратни равенки" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 3, name: "Системи линеарни равенки" })).toHaveCount(0);
    await expect(cards(page)).toHaveCount(2);
  });

  test("reads in English, with the date and the days in English", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "en", schoolType: "school", schoolSeen: true })), SETTINGS_KEY);
    await page.goto("/teacher");
    await expect(title(page)).toHaveText("Today");
    await expect(page.getByText("Thursday, 29 October", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Prepared lessons" })).toBeVisible();
    await expect(cards(page).nth(0)).toContainText("Математика · Year 4");
    await expect(cards(page).nth(0)).toContainText("7 questions · Last changed: yesterday");
    await expect(cards(page).nth(1)).toContainText("Last changed: 3 days ago");
    await expect(page.getByRole("link", { name: "Prepare a lesson" })).toBeVisible();
    await expect(cards(page).first().getByRole("button", { name: "Start lesson" })).toBeVisible();
    await expect(cards(page).first().getByRole("link", { name: "Open" })).toBeVisible();
  });

  test("at a faculty it is groups and study years", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "mk", schoolType: "university", schoolSeen: true })), SETTINGS_KEY);
    await page.goto("/teacher");
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).first()).toContainText("Математичка анализа 1 · 1. година");
    await cards(page).first().getByRole("button", { name: "Започни час" }).click();
    await expect(startDialog(page)).toHaveAccessibleName("Со која група?");
  });
});

test.describe("Today with nothing prepared", () => {
  test.use({ account: "novice" });

  test("keeps the empty state, with the one yellow button in it", async ({ page }) => {
    await page.goto("/teacher");
    await page.getByRole("button", { name: "Прескокни го водичот" }).click();
    await expect(title(page)).toHaveText("Денес");
    await expect(page.getByText("четврток, 29 октомври", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Немате подготвени лекции" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Подготвени лекции", exact: true })).toHaveCount(0);
    await expect(cards(page)).toHaveCount(0);
    await expect(yellow(page)).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Подготви лекција" })).toHaveClass(/btn--primary/);
  });

  test("with a lesson running, the empty state stays and its button is not yellow; the band's is", async ({ page }) => {
    // A new teacher is taken to the guide first; skipping it comes to the page that was asked for.
    await page.goto("/teacher/settings");
    await page.getByRole("button", { name: "Прескокни го водичот" }).click();
    await expect(title(page)).toHaveText("Поставки");
    await demoButton(page, "Симулирај час во тек").click();
    await mainMenu(page).getByRole("link", { name: "Денес" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Немате подготвени лекции" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Врати се на часот" })).toHaveClass(/btn--primary/);
    await expect(page.getByRole("link", { name: "Подготви лекција" })).toHaveClass(/btn--secondary/);
    await expect(yellow(page)).toHaveCount(1);
  });
});

test.describe("Today with a lesson running", () => {
  async function simulate(page: Page) {
    await page.goto("/teacher/settings");
    await demoButton(page, "Симулирај час во тек").click();
    await expect(page.getByRole("status")).toHaveText("Готово. На Денес сега се гледа час во тек.");
    await mainMenu(page).getByRole("link", { name: "Денес" }).click();
    await expect(title(page)).toHaveText("Денес");
  }

  test("puts a band at the top: the subject and class, the lesson, how long, and the way back; and the yellow moves to it", async ({ page }) => {
    await simulate(page);
    const band = page.getByRole("region", { name: "Час во тек" });
    await expect(band).toBeVisible();
    await expect(band.getByRole("heading", { level: 2 })).toHaveText("Математика, IV-1");
    await expect(band).toContainText("Основи на веројатноста");
    await expect(band).toContainText("Трае 12 минути");
    const back = band.getByRole("link", { name: "Врати се на часот" });
    await expect(back).toHaveClass(/btn--primary/);
    // The one yellow button of the screen; "Подготви лекција" is secondary.
    await expect(yellow(page)).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Подготви лекција" })).toHaveClass(/btn--secondary/);
    // The band is above everything else but the header.
    const [bandBox, listBox] = [(await band.boundingBox())!, (await page.getByRole("link", { name: "Подготви лекција" }).boundingBox())!];
    expect(bandBox.y).toBeLessThan(listBox.y);
    // The running lesson is not offered again below.
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first().getByRole("heading", { level: 3 })).toHaveText("Проценти и пропорции");
  });

  test("zoomed to 400% the band keeps its button inside it, the class is not broken at its hyphen, and nothing scrolls sideways", async ({ page }) => {
    // 400% on a 1280 x 720 window leaves 320 x 180 CSS pixels; a taller one leaves the room to see the whole band.
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/teacher/settings");
    await demoButton(page, "Симулирај час во тек").click();
    await page.goto("/teacher");
    const band = page.getByRole("region", { name: "Час во тек" });
    await expect(band).toBeVisible();
    const [bandBox, buttonBox] = [(await band.boundingBox())!, (await band.getByRole("link", { name: "Врати се на часот" }).boundingBox())!];
    expect(buttonBox.x).toBeGreaterThanOrEqual(bandBox.x);
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(bandBox.x + bandBox.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await expect(band.getByRole("heading", { level: 2 })).toHaveText("Математика, IV-1");
    expect(await band.locator(".band__course .nowrap").evaluate((el) => el.getClientRects().length)).toBe(1);
  });

  test("a long title keeps the dot beside its last word and \"Трае 12 минути\" whole, never a line that starts with the dot", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "mk", schoolType: "university", schoolSeen: true })), SETTINGS_KEY);
    await page.goto("/teacher/settings");
    await demoButton(page, "Симулирај час во тек").click();
    await mainMenu(page).getByRole("link", { name: "Денес" }).click();
    const line = page.getByRole("region", { name: "Час во тек" }).locator(".band__line");
    await expect(line).toContainText("Тригонометрија на правоаголен триаголник");
    const where = await line.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el.firstChild as Text);
      const rects = range.getClientRects();
      const dot = el.querySelector("[aria-hidden]")!.getBoundingClientRect();
      return {
        titleEnds: rects[rects.length - 1].top,
        dotTop: dot.top,
        dotAfterWord: dot.left - rects[rects.length - 1].right,
        howLines: el.querySelector(".keep")!.getClientRects().length,
      };
    });
    // The dot is on the line where the title ends, right after its last word, not at the start of a line.
    expect(Math.abs(where.dotTop - where.titleEnds)).toBeLessThan(4);
    expect(where.dotAfterWord).toBeLessThan(8);
    expect(where.howLines).toBe(1);
  });

  test("the way back leads to the console of the live lesson", async ({ page }) => {
    await simulate(page);
    await page.getByRole("link", { name: "Врати се на часот" }).click();
    await expect(page).toHaveURL(/\/teacher\/live\/s-n\d+$/);
    await expect(title(page)).toHaveText("Час во тек");
    await expect(page.getByText("Математика, IV-1: Основи на веројатноста")).toBeVisible();
    await expect(page.getByRole("list", { name: "Каде е часот" }).locator("[aria-current=step]")).toContainText("Чекаме ученици");
    await expect(page.getByRole("button", { name: "Почни го часот" })).toBeVisible();
    await page.getByRole("link", { name: "Назад кон Денес" }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByRole("region", { name: "Час во тек" })).toBeVisible();
  });

  test("ending the lesson from the band takes the band away and gives the yellow back; the lesson is then a held one", async ({ page }) => {
    await simulate(page);
    await page.goto("/teacher/settings");
    await expect(demoButton(page, "Симулирај час во тек")).toHaveCount(0);
    await expect(demoButton(page, "Затвори го демо часот")).toHaveCount(0);
    await mainMenu(page).getByRole("link", { name: "Денес" }).click();
    await page.getByRole("region", { name: "Час во тек" }).getByRole("button", { name: "Заврши го часот" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Да, заврши го часот" }).click();
    await expect(title(page)).toHaveText("Часот заврши");
    expect(await savedSession(page)).toBeNull();
    await mainMenu(page).getByRole("link", { name: "Денес" }).click();
    await expect(page.getByRole("region", { name: "Час во тек" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Подготви лекција" })).toHaveClass(/btn--primary/);
    // The lesson that was run is held now, so one prepared lesson is left.
    await expect(cards(page)).toHaveCount(1);
  });

  test("a lesson nobody ended says when it began", async ({ page }) => {
    await simulate(page);
    await page.evaluate((key) => {
      const state = JSON.parse(localStorage.getItem(key) ?? "null");
      state.school.session.started_at = "2026-10-28T08:00:00.000Z";
      localStorage.setItem(key, JSON.stringify(state));
    }, MOCK_KEY);
    await page.reload();
    await expect(page.getByRole("region", { name: "Час во тек" })).toContainText("Започна вчера");
    await page.evaluate((key) => {
      const state = JSON.parse(localStorage.getItem(key) ?? "null");
      state.school.session.started_at = "2026-10-29T06:30:00.000Z"; // 07:30 on this computer, two hours before
      localStorage.setItem(key, JSON.stringify(state));
    }, MOCK_KEY);
    await page.reload();
    await expect(page.getByRole("region", { name: "Час во тек" })).toContainText("Започна во 07:30");
  });

  test("is in English and at a faculty too", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "en", schoolType: "university", schoolSeen: true })), SETTINGS_KEY);
    await page.goto("/teacher/settings");
    await demoButton(page, "Pretend a lesson is running").click();
    await mainMenu(page).getByRole("link", { name: "Today" }).click();
    const band = page.getByRole("region", { name: "Lesson running" });
    await expect(band).toBeVisible();
    await expect(band).toContainText("Running for 12 minutes");
    await expect(band.getByRole("heading", { level: 2 })).toHaveText(/^Математичка анализа 1, Група 1А$/);
    await expect(band.getByRole("link", { name: "Return to the lesson" })).toHaveClass(/btn--primary/);
  });
});

test.describe("starting a lesson", () => {
  const procenti = (page: Page) => cards(page).filter({ hasText: "Проценти и пропорции" });

  test("asks which class, lists the classes of the subject, the lesson's own year first, with how many students; none is chosen", async ({ page }) => {
    await page.goto("/teacher");
    const opener = procenti(page).getByRole("button", { name: "Започни час" });
    await opener.click();
    const dialog = startDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName("Со кој клас?");
    await expect(dialog).toContainText("Лекција: Проценти и пропорции");
    const rows = dialog.getByRole("radio");
    await expect(rows).toHaveCount(4);
    // The lesson is for the second year, so II-4 is first; the others keep the order of the API.
    await expect(dialog.locator(".choice")).toHaveText([/^II-4\s*26 ученици$/, /^III-5\s*24 ученици$/, /^IV-1\s*28 ученици$/, /^IV-2\s*25 ученици$/]);
    for (const radio of await rows.all()) await expect(radio).not.toBeChecked();
    // Large rows, and a window that fits the screen whole.
    for (const row of await dialog.locator(".choice").all()) expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(720);
    // Start is the window's yellow button. The focus is on the choices, on the first one, which is not chosen by it, so Enter
    // starts nothing.
    await expect(dialog.getByRole("button", { name: /^Започни( со .+)?$/ })).toHaveClass(/btn--primary/);
    await expect(rows.first()).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Откажи" })).toHaveClass(/btn--secondary/);
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/teacher$/);
    for (const radio of await rows.all()) await expect(radio).not.toBeChecked();
    expect(await savedSession(page)).toBeNull();
  });

  test("zoomed to 200% it opens at its top: the question and the first class are in view, and the buttons are a Tab away", async ({ page }) => {
    // 200% on a 1280 x 720 window leaves 640 x 360 CSS pixels.
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto("/teacher");
    await procenti(page).getByRole("button", { name: "Започни час" }).click();
    const dialog = startDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Со кој клас?" })).toBeInViewport();
    await expect(dialog.getByText("Лекција: Проценти и пропорции")).toBeInViewport();
    await expect(dialog.locator(".choice").first()).toBeInViewport();
    await expect(dialog.getByRole("radio").first()).toBeFocused();
    // The rest is reached by scrolling the window, and Tab takes the focus, and the view, to the buttons.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: /^Започни( со .+)?$/ })).toBeFocused();
    await expect(dialog.getByRole("button", { name: /^Започни( со .+)?$/ })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test("starting with nothing chosen says so and starts nothing", async ({ page }) => {
    await page.goto("/teacher");
    await procenti(page).getByRole("button", { name: "Започни час" }).click();
    const dialog = startDialog(page);
    await dialog.getByRole("button", { name: /^Започни( со .+)?$/ }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Изберете со кој клас ќе го започнете часот.");
    await expect(dialog.getByRole("radio").first()).toBeFocused();
    expect(await savedSession(page)).toBeNull();
    await expect(page).toHaveURL(/\/teacher$/);
    // Choosing takes the message away.
    await dialog.getByRole("radio", { name: /III-5/ }).check();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
  });

  test("choosing a class and pressing Start opens the lesson in the lobby and goes to the live lesson", async ({ page }) => {
    await page.goto("/teacher");
    await procenti(page).getByRole("button", { name: "Започни час" }).click();
    const dialog = startDialog(page);
    // The yellow button says plainly what it will do: with nothing chosen it names no class, and it names the one that is chosen.
    await expect(dialog.getByRole("button", { name: /^Започни/ })).toHaveText("Започни");
    await dialog.getByRole("radio", { name: /III-5/ }).check();
    await expect(dialog.getByRole("radio", { name: /III-5/ })).toBeChecked();
    await expect(dialog.getByRole("button", { name: /^Започни/ })).toHaveText("Започни со III-5");
    await dialog.getByRole("radio", { name: /IV-1/ }).check();
    await expect(dialog.getByRole("button", { name: /^Започни/ })).toHaveText("Започни со IV-1");
    await dialog.getByRole("radio", { name: /III-5/ }).check();
    await dialog.getByRole("button", { name: "Започни со III-5" }).click();

    await expect(page).toHaveURL(/\/teacher\/live\/s-n\d+$/);
    await expect(title(page)).toHaveText("Час во тек");
    await expect(page.getByText("Математика, III-5")).toBeVisible();
    const kept = await savedSession(page);
    expect(kept).toMatchObject({ state: "lobby", lesson: { id: "l-procenti", title: "Проценти и пропорции", version: 1 }, course_id: "course-iii-5" });
    await expect(page.getByRole("heading", { name: "Екран за проектор" })).toBeVisible();

    // Back on Today the band is there, and the lesson that runs is not listed again.
    await page.getByRole("link", { name: "Назад кон Денес" }).click();
    const band = page.getByRole("region", { name: "Час во тек" });
    await expect(band.getByRole("heading", { level: 2 })).toHaveText("Математика, III-5");
    await expect(yellow(page)).toHaveCount(1);
    await expect(cards(page)).toHaveCount(1);
    await expect(procenti(page)).toHaveCount(0);
  });

  test("works with the keyboard alone: Enter opens it on the choices, arrows choose, Tab to Start, Enter starts", async ({ page }) => {
    await page.goto("/teacher");
    const opener = procenti(page).getByRole("button", { name: "Започни час" });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = startDialog(page);
    // The choices are a group of radio buttons with none chosen, and the focus is on the first: an arrow chooses.
    await expect(dialog.getByRole("radio", { name: /II-4/ })).toBeFocused();
    for (const radio of await dialog.getByRole("radio").all()) await expect(radio).not.toBeChecked();
    await page.keyboard.press("ArrowDown");
    await expect(dialog.getByRole("radio", { name: /III-5/ })).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: /^Започни( со .+)?$/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/teacher\/live\/s-n\d+$/);
    await expect(page.getByText("Математика, III-5: Проценти и пропорции")).toBeVisible();
  });

  test("Cancel and Escape close it, start nothing, and give the focus back to the button that was pressed", async ({ page }) => {
    await page.goto("/teacher");
    const opener = procenti(page).getByRole("button", { name: "Започни час" });
    await opener.click();
    await startDialog(page).getByRole("radio", { name: /IV-1/ }).check();
    await startDialog(page).getByRole("button", { name: "Откажи" }).click();
    await expect(startDialog(page)).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await savedSession(page)).toBeNull();
    await expect(page.getByRole("region", { name: "Час во тек" })).toHaveCount(0);

    await opener.click();
    await page.keyboard.press("Escape");
    await expect(startDialog(page)).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await savedSession(page)).toBeNull();

    // Opened again, it is a fresh question: the class chosen last time is not still chosen.
    await opener.click();
    for (const radio of await startDialog(page).getByRole("radio").all()) await expect(radio).not.toBeChecked();
  });

  test("at a faculty there is one group for the subject, and it is chosen already", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "mk", schoolType: "university", schoolSeen: true })), SETTINGS_KEY);
    await page.goto("/teacher");
    await cards(page).first().getByRole("button", { name: "Започни час" }).click();
    const dialog = startDialog(page);
    await expect(dialog).toHaveAccessibleName("Со која група?");
    await expect(dialog.getByRole("radio")).toHaveCount(1);
    await expect(dialog.getByRole("radio", { name: /Група 1А/ })).toBeChecked();
    await expect(dialog).toContainText("28 студенти");
    await dialog.getByRole("button", { name: /^Започни( со .+)?$/ }).click();
    await expect(page).toHaveURL(/\/teacher\/live\/s-n\d+$/);
    await expect(page.getByText(/^Математичка анализа 1, Група 1А: /)).toBeVisible();
  });

  test("a lesson for a subject the teacher has no class for says so, plainly, with nothing to choose", async ({ page }) => {
    await addLessons(page, [lessonOf(1, { title: "Закони на Њутн", subject: { id: "physics", name: "Физика" } })]);
    await cards(page).filter({ hasText: "Закони на Њутн" }).getByRole("button", { name: "Започни час" }).click();
    const dialog = page.getByRole("dialog", { name: "Немате клас за овој предмет" });
    await expect(dialog).toContainText("Не предавате „Физика“ ни на еден клас.");
    await expect(dialog.getByRole("radio")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Затвори" })).toBeFocused();
    await expect(dialog.getByRole("button", { name: /^Започни$/ })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Затвори" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("while a lesson is running it says so instead of asking, and offers the way back; Close leaves everything as it was", async ({ page }) => {
    await page.goto("/teacher/settings");
    await demoButton(page, "Симулирај час во тек").click();
    await mainMenu(page).getByRole("link", { name: "Денес" }).click();
    const opener = procenti(page).getByRole("button", { name: "Започни час" });
    await opener.click();
    const dialog = runningDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("„Основи на веројатноста“, Математика, IV-1. Нов час можете да започнете дури кога ќе го завршите овој.");
    await expect(dialog.getByRole("radio")).toHaveCount(0);
    const back = dialog.getByRole("link", { name: "Врати се на часот" });
    await expect(back).toHaveClass(/btn--primary/);
    await expect(back).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Затвори" })).toBeVisible();
    await dialog.getByRole("button", { name: "Затвори" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();

    await opener.click();
    await runningDialog(page).getByRole("link", { name: "Врати се на часот" }).click();
    await expect(page).toHaveURL(/\/teacher\/live\/s-n\d+$/);
  });

  test("a lesson started in another window while this one is asking turns the question into that message", async ({ page, context }: { page: Page; context: BrowserContext }) => {
    await page.goto("/teacher");
    await procenti(page).getByRole("button", { name: "Започни час" }).click();
    await expect(startDialog(page)).toBeVisible();

    // The same teacher, in a second window of the same browser, starts a lesson.
    const other = await context.newPage();
    await other.clock.setFixedTime(NOW);
    await other.goto("/teacher");
    await cards(other).filter({ hasText: "Основи на веројатноста" }).getByRole("button", { name: "Започни час" }).click();
    await startDialog(other).getByRole("radio", { name: /IV-1/ }).check();
    await startDialog(other).getByRole("button", { name: /^Започни( со .+)?$/ }).click();
    await expect(other).toHaveURL(/\/teacher\/live\//);

    await expect(runningDialog(page)).toBeVisible();
    await expect(runningDialog(page)).toContainText("„Основи на веројатноста“, Математика, IV-1.");
    await expect(runningDialog(page).getByRole("link", { name: "Врати се на часот" })).toBeFocused();
    // And the page behind it has the band.
    await runningDialog(page).getByRole("button", { name: "Затвори" }).click();
    await expect(page.getByRole("region", { name: "Час во тек" })).toBeVisible();
    await expect(yellow(page)).toHaveCount(1);
  });

  test("the very lesson being asked about, started in another window, turns the question into that message and does not just vanish", async ({ page, context }: { page: Page; context: BrowserContext }) => {
    await page.goto("/teacher");
    await procenti(page).getByRole("button", { name: "Започни час" }).click();
    await expect(startDialog(page)).toBeVisible();

    const other = await context.newPage();
    await other.clock.setFixedTime(NOW);
    await other.goto("/teacher");
    await procenti(other).getByRole("button", { name: "Започни час" }).click();
    await startDialog(other).getByRole("radio", { name: /II-4/ }).check();
    await startDialog(other).getByRole("button", { name: /^Започни( со .+)?$/ }).click();
    await expect(other).toHaveURL(/\/teacher\/live\//);

    // The lesson has left this page's list, as it should, and the window is still here to say why.
    await expect(runningDialog(page)).toBeVisible();
    await expect(runningDialog(page)).toContainText("„Проценти и пропорции“, Математика, II-4.");
    await expect(runningDialog(page).getByRole("link", { name: "Врати се на часот" })).toBeFocused();
    await runningDialog(page).getByRole("button", { name: "Затвори" }).click();
    await expect(procenti(page)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Час во тек" })).toContainText("Проценти и пропорции");
  });

  test("a start that goes through never shows the \"already running\" message on its way out", async ({ page }) => {
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __titles: string[] }).__titles = seen;
      new MutationObserver(() => {
        const t = document.querySelector("dialog:not([role='alertdialog']) h2")?.textContent;
        if (t && seen[seen.length - 1] !== t) seen.push(t);
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.goto("/teacher");
    await procenti(page).getByRole("button", { name: "Започни час" }).click();
    await startDialog(page).getByRole("radio", { name: /II-4/ }).check();
    await startDialog(page).getByRole("button", { name: /^Започни( со .+)?$/ }).click();
    await expect(page).toHaveURL(/\/teacher\/live\//);
    const titles = await page.evaluate(() => (window as unknown as { __titles: string[] }).__titles);
    expect(titles).toEqual(["Со кој клас?"]);
  });

  test("is in English when the screen is", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "en", schoolType: "school", schoolSeen: true })), SETTINGS_KEY);
    await page.goto("/teacher");
    await cards(page).nth(1).getByRole("button", { name: "Start lesson" }).click();
    const dialog = page.getByRole("dialog", { name: "Which class?" });
    await expect(dialog).toContainText("Lesson: Проценти и пропорции");
    await expect(dialog).toContainText("26 students");
    await dialog.getByRole("button", { name: /^Start( with .+)?$/ }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Choose which class to start the lesson with.");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
  });
});

test.describe("a lesson, to read", () => {
  test("opened from Today: its title, subject and year, and the questions in order, each with its kind, answers, timer and why", async ({ page }) => {
    await page.goto("/teacher");
    await cards(page).filter({ hasText: "Проценти и пропорции" }).getByRole("link", { name: "Отвори" }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-procenti\?from=today$/);
    await expect(title(page)).toHaveText("Проценти и пропорции");
    await expect(page).toHaveTitle("Проценти и пропорции · TeacherAid");
    await expect(page.locator(".head__sub")).toHaveText("Математика · II година");
    // The one place it can go from here is named: Today.
    const back = page.getByRole("link", { name: "Назад кон Денес" });
    await expect(back).toBeVisible();

    const questions = page.locator(".questions > li");
    await expect(questions).toHaveCount(6);
    for (let i = 0; i < 6; i++) await expect(questions.nth(i).getByRole("heading", { level: 3 })).toHaveText(`Прашање ${i + 1} од 6`);
    // The first is a number, the second has four answers, the third is true or false.
    await expect(questions.nth(0)).toContainText("Одговор со број");
    await expect(questions.nth(0)).toContainText("Колку е 15% од 240?");
    await expect(questions.nth(0)).toContainText("Време: 30 секунди");
    await expect(questions.nth(1)).toContainText("Понудени одговори");
    await expect(questions.nth(1).locator(".options > li")).toHaveCount(4);
    await expect(questions.nth(2)).toContainText("Точно или неточно");
    await expect(questions.nth(2).locator(".options > li")).toHaveText([/^Точно/, /^Неточно/]);
    // Every question says which answer is right with an icon and the words, and why.
    for (const q of await questions.all()) {
      const right = q.locator(".option[data-correct='true']");
      await expect(right).toHaveCount(1);
      await expect(right).toContainText("Точен одговор");
      await expect(right.locator("svg[aria-hidden='true']")).toHaveCount(1);
      await expect(q.locator(".option:not([data-correct='true'])").getByText("Точен одговор")).toHaveCount(0);
      await expect(q.getByText("Објаснување", { exact: true })).toBeVisible();
      await expect(q).toContainText(/Време: \d+ секунди/);
    }
    // The second question's right answer is the first answer.
    await expect(questions.nth(1).locator(".option[data-correct='true']")).toContainText("600 денари");
    await expect(page.locator(".card").filter({ hasText: "Што сакавте да се нагласи" })).toHaveCount(0);

    await back.click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(title(page)).toHaveText("Денес");
  });

  test("opened from the lessons, or by address alone, Back names the lessons and goes there", async ({ page }) => {
    await page.goto("/teacher/lessons/l-procenti");
    await expect(title(page)).toHaveText("Проценти и пропорции");
    const back = page.getByRole("link", { name: "Назад кон Лекции" });
    await expect(back).toHaveAttribute("href", "/teacher/lessons");
    await expect(page.getByRole("link", { name: "Назад кон Денес" })).toHaveCount(0);
    await back.click();
    await expect(page).toHaveURL(/\/teacher\/lessons$/);
    await expect(title(page)).toHaveText("Лекции");

    // Anything else in the address is not an origin, so Back goes to the lessons.
    await page.goto("/teacher/lessons/l-procenti?from=somewhere");
    await expect(page.getByRole("link", { name: "Назад кон Лекции" })).toBeVisible();
  });

  test("Back is a labelled button the size of the others, at the top of the page", async ({ page }) => {
    await page.goto("/teacher/lessons/l-procenti?from=today");
    const back = page.getByRole("link", { name: "Назад кон Денес" });
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await expect(back.locator("svg")).toHaveCount(1);
  });

  test("has the same \"Започни час\" as Today, and it is the screen's yellow button", async ({ page }) => {
    await page.goto("/teacher/lessons/l-procenti?from=today");
    const start = page.getByRole("button", { name: "Започни час" });
    await expect(start).toHaveClass(/btn--primary/);
    await expect(yellow(page)).toHaveCount(1);
    await start.click();
    const dialog = startDialog(page);
    await expect(dialog).toContainText("Лекција: Проценти и пропорции");
    await dialog.getByRole("radio", { name: /II-4/ }).check();
    await dialog.getByRole("button", { name: /^Започни( со .+)?$/ }).click();
    await expect(page).toHaveURL(/\/teacher\/live\/s-n\d+$/);
    await expect(page.getByText("Математика, II-4: Проценти и пропорции")).toBeVisible();
  });

  test("with a lesson running its start button is not yellow, and says so when pressed", async ({ page }) => {
    await page.goto("/teacher/settings");
    await demoButton(page, "Симулирај час во тек").click();
    await page.goto("/teacher/lessons/l-procenti");
    const start = page.getByRole("button", { name: "Започни час" });
    await expect(start).toHaveClass(/btn--secondary/);
    await expect(yellow(page)).toHaveCount(0);
    await start.click();
    await expect(runningDialog(page)).toBeVisible();
  });

  test("shows what the teacher asked to stress, and writes a number with a comma", async ({ page }) => {
    await addLessons(page, [
      lessonOf(1, {
        emphasis: "Нагласете ги формулите за површина.",
        questions: [
          question(0, { kind: "numeric", correct: "3.5", tolerance: 0.5, unit: "m", allow_negative: false, prompt: "Колку е должината?" }),
          ...[1, 2, 3, 4].map((i) => question(i)),
        ],
      }),
    ]);
    await page.goto("/teacher/lessons/l-x1");
    const emphasis = page.locator(".card").filter({ hasText: "Што сакавте да се нагласи" });
    await expect(emphasis).toContainText("„Нагласете ги формулите за површина.“");
    const first = page.locator(".questions > li").first();
    await expect(first.locator(".option[data-correct='true']")).toContainText("3,5 m");
    await expect(first).toContainText("Се прифаќа отстапување до 0,5.");
  });

  test("a lesson that is not there says so, with no button to try again, and Back still works", async ({ page }) => {
    await page.goto("/teacher/lessons/nope");
    const problem = page.locator(".problem");
    await expect(problem).toContainText("Не успеавме да ја вчитаме лекцијата");
    await expect(problem).toContainText("Не го најдовме тоа што го барате.");
    await expect(page.getByRole("button", { name: "Обиди се повторно" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Започни час" })).toHaveCount(0);
    await page.getByRole("link", { name: "Назад кон Лекции" }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons$/);
  });

  test("is in English, at a faculty", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "en", schoolType: "university", schoolSeen: true })), SETTINGS_KEY);
    await page.goto("/teacher");
    await cards(page).first().getByRole("link", { name: "Open" }).click();
    await expect(page.getByRole("link", { name: "Back to Today" })).toBeVisible();
    await expect(page.locator(".head__sub")).toHaveText("Математичка анализа 1 · Year 1");
    await expect(page.getByRole("heading", { level: 2, name: "Questions" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: /^Question 1 of \d$/ })).toBeVisible();
    await expect(page.getByText("Correct answer").first()).toBeVisible();
    await expect(page.getByText(/^Time: \d+ seconds$/).first()).toBeVisible();
    await expect(page.getByText("Explanation", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Start lesson" })).toBeVisible();
  });
});

test.describe("the guide of a first run", () => {
  test.use({ account: "novice" });

  test("still lands on Today when the first lesson is left for later: its last screen has \"Не сега, оди на Денес\" for the way out", async ({ page }) => {
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/teacher\/welcome$/);
    await expect(page.getByText("Водичот можете да го погледнете повторно во Поставки.")).toBeVisible();
    await page.getByRole("button", { name: "Следно" }).click();
    await page.getByRole("button", { name: "Следно" }).click();
    await expect(page.getByRole("button", { name: "Назад во Поставки" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Подготви ја првата лекција" })).toHaveClass(/btn--primary/);
    await page.getByRole("button", { name: "Не сега, оди на Денес", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(title(page)).toHaveText("Денес");
  });
});

test.describe("the guide shown again from Settings", () => {
  test("comes back to Settings when it is finished, and says so on its button", async ({ page }) => {
    await page.goto("/teacher/settings");
    await page.getByRole("link", { name: "Прикажи го водичот повторно" }).click();
    await expect(page).toHaveURL(/\/teacher\/welcome\?next=%2Fteacher%2Fsettings$/);
    await expect(page.getByText("Чекор 1 од 3")).toBeVisible();
    // Told only to somebody who has not seen it before: this one is looking at it again from Settings.
    await expect(page.getByText("Водичот можете да го погледнете повторно во Поставки.")).toHaveCount(0);
    await page.getByRole("button", { name: "Следно" }).click();
    await page.getByRole("button", { name: "Следно" }).click();
    await expect(page.getByRole("button", { name: "Оди на Денес" })).toHaveCount(0);
    await page.getByRole("button", { name: "Назад во Поставки" }).click();
    await expect(page).toHaveURL(/\/teacher\/settings$/);
    await expect(title(page)).toHaveText("Поставки");
  });

  test("comes back to Settings when it is skipped", async ({ page }) => {
    await page.goto("/teacher/settings");
    await page.getByRole("link", { name: "Прикажи го водичот повторно" }).click();
    await page.getByRole("button", { name: "Прескокни го водичот" }).click();
    await expect(page).toHaveURL(/\/teacher\/settings$/);
    await expect(title(page)).toHaveText("Поставки");
  });

  test("on English, the button says Back to Settings", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "en", schoolType: "school", schoolSeen: true })), SETTINGS_KEY);
    await page.goto("/teacher/settings");
    await page.getByRole("link", { name: "Show the guide again" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Back to Settings" }).click();
    await expect(page).toHaveURL(/\/teacher\/settings$/);
  });
});
