import type { Page } from "@playwright/test";
import { expect, MOCK_KEY, SETTINGS_KEY, test } from "./fixtures";

/**
 * Lessons and the library (step 7): the Lessons page of three sections and a row of subjects; deleting a lesson from its own page, and
 * the refusal while a class is being held with it; the picture of a question, added, replaced and removed, with its words and its
 * failures, and seen in every place a lesson is read; tolerance and a minus behind "Повеќе опции"; Today's three unfinished lessons and
 * its link to the rest; the school library, its preview, copying, and what is said after. In mock mode, in Macedonian unless a test
 * changes the language. The clock stands still at Thursday 29 October 2026, 09:30, so that the history of the demo school reads the
 * same whenever the tests run.
 */

const NOW = new Date("2026-10-29T09:30:00+01:00");
const iso = (ms: number) => new Date(ms).toISOString();
/** A moment this many minutes before the clock of the page. */
const ago = (minutes: number) => iso(NOW.getTime() - minutes * 60_000);

const SEED = "d-seed";
const SEED_URL = `/teacher/lessons/drafts/${SEED}`;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

// ---- A draft as the AI would have left it: six questions of all three kinds ------------------------------------------------

const base = (i: number) => ({ id: `${SEED}-q${i + 1}`, order: i, media: null, explanation: `Затоа ${i + 1}.`, timer_seconds: 25, topic: "Равенки" });
const mc = (i: number, prompt: string, options: string[], correct: string) => ({ ...base(i), kind: "multiple_choice", prompt, options, correct });
const tf = (i: number, prompt: string, correct: string) => ({ ...base(i), kind: "true_false", prompt, correct, timer_seconds: 15 });
const num = (i: number, prompt: string, correct: string, extra: Record<string, unknown> = {}) => ({
  ...base(i),
  kind: "numeric",
  prompt,
  correct,
  tolerance: 0,
  unit: null,
  allow_negative: false,
  timer_seconds: 45,
  ...extra,
});

const QUESTIONS = [
  mc(0, "Која од равенките е квадратна?", ["2x + 5 = 0", "x² − 4x + 3 = 0", "x³ − 1 = 0", "3/x = 6"], "1"),
  tf(1, "Равенката x² + 4 = 0 нема реални решенија.", "true"),
  num(2, "Колку е дискриминантата на равенката x² − 5x + 6 = 0?", "1"),
  num(3, "Колку cm² е плоштината на правоаголник со страни 3 и 4?", "12", { unit: "cm²", tolerance: 0.5 }),
  num(4, "Колку е најмалата вредност на y = x² − 6x + 5?", "-4", { allow_negative: true }),
  tf(5, "Збирот на решенијата е −b/a.", "true"),
];

type Draft = Record<string, unknown>;

const draftOf = (extra: Draft = {}): Draft => ({
  id: SEED,
  source_id: null,
  source: { kind: "typed", file_name: null },
  subject: { id: "math", name: "Математика" },
  year: 2,
  emphasis: null,
  refinements: [],
  previous_draft_id: null,
  created_at: ago(60),
  updated_at: ago(60),
  consumed_at: null,
  lesson_id: null,
  job: null,
  content: { title: "Квадратни равенки", review_summary: "Квадратна равенка е равенка од втор степен.", questions: QUESTIONS },
  ...extra,
});

type Seed = { drafts?: Draft[]; library_empty?: boolean; first_run_done?: boolean };

/** Put what the demo would have saved into its state, then load the page afresh so that the demo reads it. */
async function seed(page: Page, what: Seed, url: string, whose: "school" | "university" | "novice" = "school") {
  await page.goto("/teacher/help");
  await page.evaluate(
    ([key, seeded, which]) => {
      const state = JSON.parse(localStorage.getItem(key) ?? "null");
      const overlay = which === "novice" ? state.novice.school : which === "university" ? state.university : state.school;
      Object.assign(overlay, seeded);
      localStorage.setItem(key, JSON.stringify(state));
    },
    [MOCK_KEY, what, whose] as const,
  );
  await page.goto(url);
}

type Saved = {
  school: {
    drafts: { id: string; lesson_id: string | null; content: { questions: { media: { id: string; url: string; alt: string | null } | null }[] } }[];
    lessons: { id: string; title: string; copied_from: { lesson_id: string } | null }[];
    deleted: string[];
  };
};
const demo = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null") as Saved, MOCK_KEY);

// ---- What is on the page ------------------------------------------------------------------------------------------------------

const title = (page: Page) => page.getByRole("heading", { level: 1 });
const yellow = (page: Page) => page.locator(".btn--primary:visible");
const sections = (page: Page) => page.locator("main h2.section__title");
const prepared = (page: Page) => page.locator("section[aria-labelledby=prepared] .lessons > li");
const held = (page: Page) => page.locator("section[aria-labelledby=held] .lessons > li");
const unfinished = (page: Page) => page.locator("section[aria-labelledby=nedovrseni] .lessons > li");
const subjectRow = (page: Page) => page.getByRole("radiogroup", { name: "Предмет" });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const setLanguage = (page: Page, locale: "mk" | "en", schoolType: "school" | "university") =>
  page.addInitScript((value) => localStorage.setItem(value.key, JSON.stringify(value.state)), { key: SETTINGS_KEY, state: { locale, schoolType, schoolSeen: true } });

const PROCENTI = "/teacher/lessons/l-procenti";
const deleteButton = (page: Page) => page.getByRole("button", { name: "Избриши лекција" });
const deleteQuestion = (page: Page, lesson = "Проценти и пропорции") => page.getByRole("alertdialog", { name: `Дали сакате да ја избришете лекцијата „${lesson}“?` });

// The editor: the question that is open and what is in it.
const questionCards = (page: Page) => page.locator(".questions > li");
const card = (page: Page, n: number) => questionCards(page).nth(n - 1);
const open = (page: Page) => page.locator("li.question--open");
const edit = (page: Page, n: number) => card(page, n).getByRole("button", { name: "Уреди", exact: true });
const done = (page: Page) => open(page).getByRole("button", { name: "Готово", exact: true });
const moreOptions = (page: Page) => open(page).getByRole("button", { name: /^(Повеќе|Помалку) опции$/ });
const tolerance = (page: Page) => open(page).getByRole("textbox", { name: "Колку може да отстапува одговорот?" });
const negative = (page: Page) => open(page).getByRole("checkbox", { name: "Одговорот може да биде негативен број" });
const answer = (page: Page) => open(page).getByRole("textbox", { name: "Точен одговор", exact: true });
const unit = (page: Page) => open(page).getByRole("textbox", { name: "Единица" });
const fileField = (page: Page) => open(page).locator('input[type="file"]');
const alt = (page: Page) => open(page).getByRole("textbox", { name: "Што има на сликата?" });
const saveButton = (page: Page) => page.getByRole("button", { name: /^Зачувај (лекција|ги промените)$/ });
const status = (page: Page) => page.locator(".savestate").first();
const saved = async (page: Page) => {
  await page.waitForTimeout(1000);
  await expect(status(page)).toHaveText("Промените се зачувани.", { timeout: 10_000 });
};

/** A picture of a size, as a PNG, made by the browser itself. */
async function picture(page: Page, width: number, height: number, color = "#3b82f6"): Promise<Buffer> {
  const b64 = await page.evaluate(
    ([w, h, c]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w as number;
      canvas.height = h as number;
      const context = canvas.getContext("2d")!;
      context.fillStyle = c as string;
      context.fillRect(0, 0, w as number, h as number);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    [width, height, color] as const,
  );
  return Buffer.from(b64, "base64");
}

// ---------------------------------------------------------------------------------------------------------------------------

test.describe("Lessons", () => {
  test("is one page with no tabs: one yellow button, then the prepared lessons and the ones that were held", async ({ page }) => {
    await page.goto("/teacher/lessons");
    await expect(title(page)).toHaveText("Лекции");
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(yellow(page)).toHaveCount(1);
    const prepare = page.getByRole("link", { name: "Подготви лекција" });
    await expect(prepare).toHaveClass(/btn--primary/);
    await expect(prepare).toHaveAttribute("href", "/teacher/lessons/new");
    // Nothing is unfinished, so that section is not there at all.
    await expect(sections(page)).toHaveText(["Подготвени", "Одржани"]);
    await expect(page.getByRole("heading", { level: 2, name: "Недовршени" })).toHaveCount(0);
    // A teacher with one subject has no row of subjects.
    await expect(subjectRow(page)).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);

    await expect(prepared(page)).toHaveCount(2);
    await expect(prepared(page).nth(0).getByRole("heading", { level: 3 })).toHaveText("Основи на веројатноста");
    await expect(prepared(page).nth(1).getByRole("heading", { level: 3 })).toHaveText("Проценти и пропорции");
    await expect(prepared(page).nth(0)).toContainText("7 прашања · Последна промена: вчера");
    // A prepared lesson was never held, so it has no line about it.
    await expect(prepared(page).nth(0)).not.toContainText("Одржана");
    expect(await held(page).count()).toBeGreaterThanOrEqual(6);
  });

  test("a lesson that was held says when it was last held and how many times, in words and in Macedonian's own forms", async ({ page }) => {
    await page.goto("/teacher/lessons");
    await expect(held(page).first()).toBeVisible();
    for (const lesson of await held(page).all()) {
      await expect(lesson).toContainText(/Одржана (денес|вчера|пред (\d+ (дена|недели|месеци|години)|една недела|еден месец|една година)) · \d+ (пат|пати)/);
    }
    // Trigonometry was held three times, last on the Friday before the Thursday the clock stands on: six days ago.
    const trig = held(page).filter({ hasText: "Тригонометрија на правоаголен триаголник" });
    await expect(trig).toContainText("Одржана пред 6 дена · 3 пати");
    await expect(held(page).filter({ hasText: "Квадратна функција" })).toContainText("2 пати");
  });

  test("each card keeps 'Отвори' and an outlined 'Започни час', and has no way to delete", async ({ page }) => {
    await page.goto("/teacher/lessons");
    const lessons = page.locator(".lessons > li");
    await expect(lessons.first()).toBeVisible();
    for (const lesson of await lessons.all()) {
      await expect(lesson.getByRole("button", { name: "Започни час" })).toHaveClass(/btn--secondary/);
      await expect(lesson.getByRole("link", { name: "Отвори" })).toHaveAttribute("href", /\/teacher\/lessons\/l-/);
      await expect(lesson.getByRole("button", { name: /Избриши|Фрли/ })).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: "Избриши лекција" })).toHaveCount(0);
  });

  test("the buttons are big enough, the words 16px or more, and nothing runs off the side at 1024 wide", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/teacher/lessons");
    await expect(held(page).first()).toBeVisible();
    for (const b of await page.getByRole("button", { name: "Започни час" }).all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    for (const l of await page.getByRole("link", { name: "Отвори" }).all()) expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    expect((await page.getByRole("link", { name: "Подготви лекција" }).boundingBox())!.height).toBeGreaterThanOrEqual(56);
    const small = await page.locator("main").evaluate((main) => [...main.querySelectorAll("*")].filter((e) => e.childNodes.length && parseFloat(getComputedStyle(e).fontSize) < 16 && !e.closest(".sr")).length);
    expect(small).toBe(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("the lesson changed last comes first in each section, whatever order it was made in", async ({ page }) => {
    const q = (n: number) => ({ id: `x-q${n}`, order: n, prompt: `Прашање ${n}?`, media: null, explanation: null, timer_seconds: 20, topic: "Тема", kind: "true_false", correct: "true" });
    const lesson = (n: number, updated: string) => ({
      id: `l-x${n}`,
      title: `Додадена лекција ${n}`,
      subject: { id: "math", name: "Математика" },
      year: 2,
      question_count: 5,
      version: 1,
      times_run: 0,
      last_run_at: null,
      copied_from: null,
      created_at: updated,
      updated_at: updated,
      review_summary: "",
      questions: [0, 1, 2, 3, 4].map(q),
      source: null,
      emphasis: null,
    });
    await page.goto("/teacher/help");
    await page.evaluate(
      ([key, added]) => {
        const state = JSON.parse(localStorage.getItem(key as string) ?? "null");
        state.school.lessons.push(...(added as unknown as unknown[]));
        localStorage.setItem(key as string, JSON.stringify(state));
      },
      [MOCK_KEY, [lesson(1, ago(6 * 24 * 60)), lesson(2, ago(30)), lesson(3, ago(4 * 24 * 60))]] as [string, unknown],
    );
    await page.goto("/teacher/lessons");
    await expect(prepared(page).getByRole("heading", { level: 3 })).toHaveText([
      "Додадена лекција 2",
      "Основи на веројатноста",
      "Проценти и пропорции",
      "Додадена лекција 3",
      "Додадена лекција 1",
    ]);
  });

  test("the lessons that are not finished come first, with an anchor, and the same cards as on Today", async ({ page }) => {
    const pendingJob = { started_at: ago(1), done_at: iso(NOW.getTime() + 600_000), outcome: "ready" };
    await seed(
      page,
      {
        drafts: [
          draftOf({ id: "d-pending", job: pendingJob, created_at: ago(1), updated_at: ago(1), content: { title: "Скриено", review_summary: "", questions: [] } }),
          draftOf({ id: "d-ready", created_at: ago(120), updated_at: ago(120) }),
        ],
      },
      "/teacher/lessons",
    );
    await expect(sections(page)).toHaveText(["Недовршени", "Подготвени", "Одржани"]);
    await expect(unfinished(page)).toHaveCount(2);
    await expect(unfinished(page).nth(0).getByRole("heading", { level: 3 })).toHaveText("Се подготвува");
    await expect(unfinished(page).nth(1).getByRole("heading", { level: 3 })).toHaveText("Квадратни равенки");
    await expect(unfinished(page).nth(0).getByRole("link", { name: "Отвори" })).toBeVisible();
    await expect(unfinished(page).nth(1).getByRole("link", { name: "Продолжи" })).toBeVisible();
    await expect(unfinished(page).nth(1).getByRole("button", { name: "Фрли" })).toBeVisible();
    await expect(page.locator("#nedovrseni")).toHaveText("Недовршени");
    await expect(yellow(page)).toHaveCount(1);
  });

  test("throwing one away asks first, here as on Today, and it is gone from both", async ({ page }) => {
    await seed(page, { drafts: [draftOf()] }, "/teacher/lessons");
    await unfinished(page).first().getByRole("button", { name: "Фрли" }).click();
    const question = page.getByRole("alertdialog");
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: "Фрли" }).click();
    await expect(unfinished(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Недовршени" })).toHaveCount(0);
    expect((await demo(page)).school.drafts).toHaveLength(0);
  });

  test("with a lesson running, the lesson of it is still listed as prepared, and the yellow button stays the one that prepares", async ({ page }) => {
    await page.goto("/teacher/settings");
    await page.getByRole("button", { name: "Симулирај час во тек" }).click();
    await page.getByRole("navigation", { name: "Главно мени" }).getByRole("link", { name: "Лекции" }).click();
    await expect(title(page)).toHaveText("Лекции");
    await expect(prepared(page).filter({ hasText: "Основи на веројатноста" })).toHaveCount(1);
    await expect(yellow(page)).toHaveCount(1);
  });
});

// ---- The row of subjects ---------------------------------------------------------------------------------------------------

test.describe("the subjects of a teacher who has several", () => {
  test.beforeEach(async ({ page }) => {
    await setLanguage(page, "mk", "university");
  });

  test("a row at the top, 'Сите предмети' first and chosen, then one choice per subject", async ({ page }) => {
    await page.goto("/teacher/lessons");
    await expect(subjectRow(page)).toBeVisible();
    await expect(subjectRow(page).getByRole("radio")).toHaveCount(4);
    await expect(subjectRow(page).getByRole("radio").first()).toBeChecked();
    await expect(subjectRow(page).locator(".choice__text")).toHaveText(["Сите предмети", "Веројатност и статистика", "Линеарна алгебра", "Математичка анализа 1"]);
    // Under the yellow button and above the first section.
    const y = async (l: ReturnType<typeof page.locator>) => (await l.boundingBox())!.y;
    expect(await y(subjectRow(page))).toBeGreaterThan(await y(page.getByRole("link", { name: "Подготви лекција" })));
    expect(await y(subjectRow(page))).toBeLessThan(await y(sections(page).first()));
    await expect(yellow(page)).toHaveCount(1);
  });

  test("a subject shows only its own lessons, and a section with none of them goes", async ({ page }) => {
    await page.goto("/teacher/lessons");
    await expect(sections(page)).toHaveText(["Подготвени", "Одржани"]);
    await subjectRow(page).getByRole("radio", { name: "Линеарна алгебра" }).check();
    await expect(held(page).first()).toBeVisible();
    // The prepared lessons of this faculty are in analysis, so nothing is prepared in linear algebra.
    await expect(sections(page)).toHaveText(["Одржани"]);
    for (const lesson of await held(page).all()) await expect(lesson).toContainText("Линеарна алгебра ·");
    await subjectRow(page).getByRole("radio", { name: "Математичка анализа 1" }).check();
    await expect(sections(page)).toHaveText(["Подготвени", "Одржани"]);
    for (const lesson of await page.locator(".lessons > li").all()) await expect(lesson).toContainText("Математичка анализа 1 ·");
    await subjectRow(page).getByRole("radio", { name: "Сите предмети" }).check();
    expect(await page.locator(".lessons > li").count()).toBeGreaterThan(6);
  });

  test("the unfinished lessons follow the subject too", async ({ page }) => {
    await seed(
      page,
      {
        drafts: [
          draftOf({ id: "d-a", subject: { id: "linear-algebra", name: "Линеарна алгебра" }, year: 2 }),
          draftOf({ id: "d-b", subject: { id: "probability", name: "Веројатност и статистика" }, year: 3, created_at: ago(5), updated_at: ago(5) }),
        ],
      },
      "/teacher/lessons",
      "university",
    );
    await expect(unfinished(page)).toHaveCount(2);
    await subjectRow(page).getByRole("radio", { name: "Веројатност и статистика" }).check();
    await expect(unfinished(page)).toHaveCount(1);
    await expect(unfinished(page).first()).toContainText("Веројатност и статистика · 3. година");
  });

  test("the arrow keys choose, and the focus stays on the choice", async ({ page }) => {
    await page.goto("/teacher/lessons");
    await expect(subjectRow(page)).toBeVisible();
    await subjectRow(page).getByRole("radio", { name: "Сите предмети" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(subjectRow(page).getByRole("radio", { name: "Веројатност и статистика" })).toBeChecked();
    await expect(subjectRow(page).getByRole("radio", { name: "Веројатност и статистика" })).toBeFocused();
    for (const lesson of await page.locator(".lessons > li").all()) await expect(lesson).toContainText("Веројатност и статистика ·");
  });
});

// ---- Nothing yet --------------------------------------------------------------------------------------------------------------

test.describe("a teacher with no lessons", () => {
  test.use({ account: "novice" });

  test("is told so in one card, whose yellow button prepares the first", async ({ page }) => {
    await seed(page, { first_run_done: true }, "/teacher/lessons", "novice");
    await expect(page.getByRole("heading", { level: 2, name: "Сè уште немате лекции" })).toBeVisible();
    await expect(page.getByText("Подгответе ја првата лекција. Кога ќе биде готова, ќе ја најдете тука.")).toBeVisible();
    await expect(yellow(page)).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Подготви лекција" })).toHaveClass(/btn--primary/);
    await expect(page.locator(".lessons")).toHaveCount(0);
    await expect(subjectRow(page)).toHaveCount(0);
  });
});

// ---- Today and its three ----------------------------------------------------------------------------------------------------

test.describe("Today with lessons not finished", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => draftOf({ id: `d-${i + 1}`, created_at: ago(10 + i * 10), updated_at: ago(10 + i * 10), content: { title: `Нацрт ${i + 1}`, review_summary: "", questions: QUESTIONS } }));

  test("shows three of them, the ones changed last, and a link that counts all of them", async ({ page }) => {
    await seed(page, { drafts: many(5) }, "/teacher");
    const drafts = page.locator("section[aria-labelledby=unfinished] .lessons > li");
    await expect(drafts).toHaveCount(3);
    await expect(drafts.getByRole("heading", { level: 3 })).toHaveText(["Нацрт 1", "Нацрт 2", "Нацрт 3"]);
    const all = page.getByRole("link", { name: "Сите недовршени (5)" });
    await expect(all).toBeVisible();
    await expect(all).toHaveAttribute("href", "/teacher/lessons#nedovrseni");
    await expect(all).toHaveClass(/btn--secondary/);
    await expect(yellow(page)).toHaveCount(1);
  });

  test("the link leads to all of them, on the Lessons page, at their section", async ({ page }) => {
    await seed(page, { drafts: many(5) }, "/teacher");
    await page.getByRole("link", { name: "Сите недовршени (5)" }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons#nedovrseni$/);
    await expect(title(page)).toHaveText("Лекции");
    await expect(unfinished(page)).toHaveCount(5);
    const heading = page.getByRole("heading", { level: 2, name: "Недовршени" });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    // The same order as on Today, so the three that were shown are the first three.
    await expect(unfinished(page).getByRole("heading", { level: 3 })).toHaveText(["Нацрт 1", "Нацрт 2", "Нацрт 3", "Нацрт 4", "Нацрт 5"]);
  });

  test("a link straight to the section also lands on it, after a full load", async ({ page }) => {
    await seed(page, { drafts: many(5) }, "/teacher/lessons#nedovrseni");
    await expect(page.getByRole("heading", { level: 2, name: "Недовршени" })).toBeFocused();
    await expect(unfinished(page)).toHaveCount(5);
  });

  test("with three or fewer there is no link", async ({ page }) => {
    await seed(page, { drafts: many(3) }, "/teacher");
    await expect(page.locator("section[aria-labelledby=unfinished] .lessons > li")).toHaveCount(3);
    await expect(page.getByRole("link", { name: /^Сите недовршени/ })).toHaveCount(0);
  });

  test("the link is in the English words too", async ({ page }) => {
    await setLanguage(page, "en", "school");
    await seed(page, { drafts: many(4) }, "/teacher");
    await expect(page.getByRole("link", { name: "All not finished (4)" })).toBeVisible();
  });
});

// ---- Deleting a lesson -------------------------------------------------------------------------------------------------------

test.describe("deleting a lesson", () => {
  test("is the last thing on the lesson's page, outlined and away from the buttons that are pressed every day", async ({ page }) => {
    await page.goto(PROCENTI);
    await expect(title(page)).toHaveText("Проценти и пропорции");
    await expect(deleteButton(page)).toBeVisible();
    await expect(deleteButton(page)).toHaveClass(/btn--secondary/);
    await expect(yellow(page)).toHaveCount(1);
    await expect(yellow(page)).toHaveText("Започни час");
    const y = async (l: ReturnType<typeof page.locator>) => (await l.boundingBox())!.y;
    const lastQuestion = questionCards(page).last();
    expect(await y(deleteButton(page))).toBeGreaterThan((await y(lastQuestion)) + (await lastQuestion.boundingBox())!.height - 1);
    expect(await y(deleteButton(page))).toBeGreaterThan(await y(page.getByRole("button", { name: "Уреди лекција" })) + 400);
    expect((await deleteButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(56);
  });

  test("asks first, in plain words, and 'Не, задржи ја' is the yellow button that has the focus, as in every other question of the app", async ({ page }) => {
    await page.goto(PROCENTI);
    await deleteButton(page).click();
    const question = deleteQuestion(page);
    await expect(question).toBeVisible();
    await expect(question).toContainText("Лекцијата ќе исчезне од Вашите лекции.");
    await expect(question).toContainText("Часовите што веќе сте ги одржале и нивните резултати остануваат.");
    await expect(question).toContainText("Копиите што ги направиле Вашите колеги остануваат.");
    await expect(question).toContainText("Ова не може да се врати.");
    await expect(question.getByRole("button", { name: "Не, задржи ја" })).toHaveClass(/btn--primary/);
    await expect(question.getByRole("button", { name: "Не, задржи ја" })).toBeFocused();
    await expect(question.getByRole("button", { name: "Да, избриши ја" })).toHaveClass(/btn--secondary/);
    // "No" and Escape both keep the lesson.
    await question.getByRole("button", { name: "Не, задржи ја" }).click();
    await expect(question).toBeHidden();
    await expect(deleteButton(page)).toBeFocused();
    await deleteButton(page).click();
    await page.keyboard.press("Escape");
    await expect(question).toBeHidden();
    await expect(title(page)).toHaveText("Проценти и пропорции");
    expect((await demo(page)).school.deleted).toEqual([]);
  });

  test("goes to the Lessons page with a line that says so once; the lesson is gone, and what was held stays", async ({ page }) => {
    await page.goto(PROCENTI);
    await deleteButton(page).click();
    await deleteQuestion(page).getByRole("button", { name: "Да, избриши ја" }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons$/);
    await expect(title(page)).toHaveText("Лекции");
    await expect(page.getByRole("status").filter({ hasText: "Лекцијата е избришана." })).toHaveText("Лекцијата е избришана. Одржаните часови и нивните резултати остануваат.");
    await expect(page.getByRole("heading", { level: 3, name: "Проценти и пропорции" })).toHaveCount(0);
    await expect(prepared(page)).toHaveCount(1);
    expect((await demo(page)).school.deleted).toEqual(["l-procenti"]);
    // Told once: a reload does not say it again, and the lesson is not on Today either.
    await page.reload();
    await expect(title(page)).toHaveText("Лекции");
    await expect(page.getByText("Лекцијата е избришана.")).toHaveCount(0);
    await page.goto("/teacher");
    await expect(page.getByRole("heading", { level: 3, name: "Проценти и пропорции" })).toHaveCount(0);
    await page.goto(PROCENTI);
    await expect(page.getByRole("heading", { level: 2, name: /Не успеавме|Не го најдовме/ }).or(page.getByText("Не го најдовме тоа што го барате."))).toBeVisible();
  });

  test("a lesson that was held can be deleted too", async ({ page }) => {
    await page.goto("/teacher/lessons");
    const lesson = held(page).filter({ hasText: "Квадратна функција" });
    await lesson.getByRole("link", { name: "Отвори" }).click();
    await expect(title(page)).toHaveText("Квадратна функција");
    await deleteButton(page).click();
    await deleteQuestion(page, "Квадратна функција").getByRole("button", { name: "Да, избриши ја" }).click();
    await expect(page.getByText("Лекцијата е избришана.")).toBeVisible();
    await expect(held(page).filter({ hasText: "Квадратна функција" })).toHaveCount(0);
  });

  test("while a class is being held with the lesson it is not offered: the page says to end the lesson first", async ({ page }) => {
    await page.goto("/teacher/settings");
    await page.getByRole("button", { name: "Симулирај час во тек" }).click();
    await page.goto("/teacher/lessons/l-verojatnost");
    await expect(title(page)).toHaveText("Основи на веројатноста");
    await expect(page.getByText("Прво завршете го часот", { exact: true })).toBeVisible();
    await expect(page.getByText("Со оваа лекција сега има час во тек, па таа не може да се избрише.")).toBeVisible();
    // The words to end the lesson first are on a line of their own, with the reason under them.
    const first = page.getByText("Прво завршете го часот", { exact: true });
    const reason = page.getByText("Со оваа лекција сега има час во тек");
    expect(await first.evaluate((el) => getComputedStyle(el).display)).toBe("block");
    expect((await reason.boundingBox())!.height).toBeGreaterThan((await first.boundingBox())!.height * 1.8);
    await expect(deleteButton(page)).toHaveCount(0);
    // Another lesson can go while one is running.
    await page.goto(PROCENTI);
    await expect(deleteButton(page)).toBeVisible();
    await expect(page.getByText("Прво завршете го часот")).toHaveCount(0);
    // When the class is over the lesson can go again.
    await page.goto("/teacher/settings");
    await page.getByRole("button", { name: "Затвори го демо часот" }).click();
    await page.goto("/teacher/lessons/l-verojatnost");
    await expect(deleteButton(page)).toBeVisible();
  });

  test("what was being changed in the lesson goes with it, and the question says so", async ({ page }) => {
    await page.goto(PROCENTI);
    await page.getByRole("button", { name: "Уреди лекција" }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/drafts\//);
    expect((await demo(page)).school.drafts.filter((d) => d.lesson_id === "l-procenti")).toHaveLength(1);
    await page.goto(PROCENTI);
    await deleteButton(page).click();
    await expect(deleteQuestion(page)).toContainText("Промените што сте ги започнале на оваа лекција, а не сте ги зачувале, се бришат со неа.");
    await deleteQuestion(page).getByRole("button", { name: "Да, избриши ја" }).click();
    await expect(page.getByText("Лекцијата е избришана.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Недовршени" })).toHaveCount(0);
    expect((await demo(page)).school.drafts).toHaveLength(0);
  });

  test("without changes in progress the question does not talk about them", async ({ page }) => {
    await page.goto(PROCENTI);
    await deleteButton(page).click();
    await expect(deleteQuestion(page)).not.toContainText("Промените што сте ги започнале");
  });

  test("in English, at a faculty, the same", async ({ page }) => {
    await setLanguage(page, "en", "university");
    await page.goto("/teacher/lessons");
    await prepared(page).first().getByRole("link", { name: "Open" }).click();
    await page.getByRole("button", { name: "Delete lesson" }).click();
    const question = page.getByRole("alertdialog", { name: /^Delete the lesson “.+”\?$/ });
    await expect(question).toContainText("The lesson will leave your lessons. The lessons you have already held and their results stay.");
    await expect(question.getByRole("button", { name: "No, keep it" })).toBeFocused();
    await question.getByRole("button", { name: "Yes, delete it" }).click();
    await expect(page.getByText("The lesson is deleted. The lessons you have held and their results stay.")).toBeVisible();
  });
});

// ---- The picture of a question ----------------------------------------------------------------------------------------------

test.describe("the picture of a question", () => {
  const ALT = "Графикот на параболата y = x² − 6x + 5";

  test.beforeEach(async ({ page }) => {
    await seed(page, { drafts: [draftOf()] }, SEED_URL);
    await expect(title(page)).toHaveText("Квадратни равенки");
    await edit(page, 1).click();
  });

  test("is optional and offered in the open question as a button on a real file field, with what is allowed said in a line", async ({ page }) => {
    await expect(open(page).getByRole("heading", { level: 4, name: "Слика" })).toBeVisible();
    await expect(open(page).getByText("По желба. Додајте слика ако прашањето се однесува на неа")).toBeVisible();
    await expect(fileField(page)).toHaveAttribute("type", "file");
    await expect(fileField(page)).toHaveAttribute("accept", /image\/jpeg,image\/png,image\/webp/);
    const add = open(page).locator("label.btn", { hasText: "Додај слика" });
    await expect(add).toBeVisible();
    await expect(add).toHaveClass(/btn--secondary/);
    expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    await expect(open(page).getByText("JPEG, PNG или WebP, најмногу 10 MB.")).toBeVisible();
    // No picture yet: no preview, and none of the words about it either.
    await expect(open(page).locator(".imagefield__preview")).toHaveCount(0);
    await expect(alt(page)).toHaveCount(0);
    // It does not hold up saving: the lesson is as ready as it was.
    await done(page).click();
    await expect(open(page)).toHaveCount(0);
    await expect(saveButton(page)).toBeVisible();
  });

  test("a picture is added with a calm wait, shown, made about 1000 pixels wide, and kept in the draft", async ({ page }) => {
    await fileField(page).setInputFiles({ name: "grafik.png", mimeType: "image/png", buffer: await picture(page, 2400, 1200) });
    await expect(open(page).getByText("Сликата се додава. Почекајте малку.")).toBeVisible();
    // Nothing can be pressed to add another while one is on its way.
    await expect(open(page).locator("label.btn", { hasText: "Додај слика" })).toHaveCount(0);
    const preview = open(page).locator(".imagefield__preview");
    await expect(preview).toBeVisible();
    await expect(open(page).getByText("Сликата се додава. Почекајте малку.")).toHaveCount(0);
    expect(await preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([1000, 500]);
    await expect(preview).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
    // "Замени" and "Отстрани" are there, a word beside each icon, and "Додај слика" is not.
    await expect(open(page).getByLabel("Замени ја сликата")).toHaveCount(1);
    await expect(open(page).locator("label.btn", { hasText: "Замени" })).toBeVisible();
    await expect(open(page).getByRole("button", { name: "Отстрани ја сликата" })).toBeVisible();
    await expect(open(page).locator("label.btn", { hasText: "Додај слика" })).toHaveCount(0);
    await saved(page);
    const media = (await demo(page)).school.drafts[0].content.questions[0].media!;
    expect(media.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(media.alt).toBeNull();
  });

  test("a smaller picture keeps its size", async ({ page }) => {
    await fileField(page).setInputFiles({ name: "mala.png", mimeType: "image/png", buffer: await picture(page, 640, 480) });
    const preview = open(page).locator(".imagefield__preview");
    await expect(preview).toBeVisible();
    expect(await preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([640, 480]);
  });

  test("what is in it is asked next, in a line that explains it and does not demand it, and is kept with the picture", async ({ page }) => {
    await fileField(page).setInputFiles({ name: "grafik.png", mimeType: "image/png", buffer: await picture(page, 800, 600) });
    await expect(alt(page)).toBeVisible();
    // The focus is there, since describing it is the next thing to do.
    await expect(alt(page)).toBeFocused();
    await expect(open(page).getByText("Опишете ја со неколку зборови, за ученици што не гледаат добро. Не е задолжително, но го препорачуваме.")).toBeVisible();
    await expect(alt(page)).toHaveAttribute("maxlength", "200");
    await alt(page).fill(ALT);
    await saved(page);
    expect((await demo(page)).school.drafts[0].content.questions[0].media!.alt).toBe(ALT);
    await expect(open(page).locator(".imagefield__preview")).toHaveAttribute("alt", ALT);
    // Without any words the lesson is as ready as with them.
    await alt(page).fill("");
    await saved(page);
    expect((await demo(page)).school.drafts[0].content.questions[0].media!.alt).toBeNull();
    await done(page).click();
    await expect(open(page)).toHaveCount(0);
    await expect(page.locator(".problem")).toHaveCount(0);
  });

  test("a picture is replaced by another, its old words go, and it is removed with one press", async ({ page }) => {
    await fileField(page).setInputFiles({ name: "prva.png", mimeType: "image/png", buffer: await picture(page, 800, 600, "#ef4444") });
    await alt(page).fill("Првата слика");
    const preview = open(page).locator(".imagefield__preview");
    const first = await preview.getAttribute("src");
    await fileField(page).setInputFiles({ name: "vtora.png", mimeType: "image/png", buffer: await picture(page, 400, 400, "#22c55e") });
    await expect(open(page).getByText("Сликата се додава. Почекајте малку.")).toBeVisible();
    // The old picture stays on screen until the new one has come.
    await expect(preview).toBeVisible();
    await expect(open(page).getByText("Сликата се додава. Почекајте малку.")).toHaveCount(0);
    expect(await preview.getAttribute("src")).not.toBe(first);
    expect(await preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([400, 400]);
    // The words of the first picture are not the second's.
    await expect(alt(page)).toHaveValue("");
    await open(page).getByRole("button", { name: "Отстрани ја сликата" }).click();
    await expect(preview).toHaveCount(0);
    await expect(alt(page)).toHaveCount(0);
    await expect(open(page).locator("label.btn", { hasText: "Додај слика" })).toBeVisible();
    await expect(fileField(page)).toBeFocused();
    await saved(page);
    expect((await demo(page)).school.drafts[0].content.questions[0].media).toBeNull();
    // The same file can be chosen again after it was removed.
    await fileField(page).setInputFiles({ name: "prva.png", mimeType: "image/png", buffer: await picture(page, 800, 600, "#ef4444") });
    await expect(preview).toBeVisible();
  });

  test("a picture stays on its question when the kind of answer is changed, and what was written while it came is not lost", async ({ page }) => {
    await fileField(page).setInputFiles({ name: "grafik.png", mimeType: "image/png", buffer: await picture(page, 800, 600) });
    // The teacher goes on writing while it comes.
    await open(page).getByRole("textbox", { name: "Текст на прашањето" }).fill("Што покажува графикот?");
    await expect(open(page).locator(".imagefield__preview")).toBeVisible();
    await expect(open(page).getByRole("textbox", { name: "Текст на прашањето" })).toHaveValue("Што покажува графикот?");
    await open(page).getByRole("radio", { name: "Точно или неточно" }).check();
    await expect(open(page).locator(".imagefield__preview")).toBeVisible();
    await saved(page);
    const q = (await demo(page)).school.drafts[0].content.questions[0] as { prompt: string; kind: string; media: unknown };
    expect(q).toMatchObject({ prompt: "Што покажува графикот?", kind: "true_false" });
    expect(q.media).not.toBeNull();
  });

  test("a picture that arrives after the question was closed is still put on it", async ({ page }) => {
    await fileField(page).setInputFiles({ name: "grafik.png", mimeType: "image/png", buffer: await picture(page, 800, 600) });
    await done(page).click();
    await expect(open(page)).toHaveCount(0);
    await expect(card(page, 1).getByRole("img")).toBeVisible();
  });

  test("a file that is not a JPEG, PNG or WebP is refused in words at the picture, and nothing is added", async ({ page }) => {
    await fileField(page).setInputFiles({ name: "dokument.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 ...") });
    const problem = open(page).getByRole("alert");
    await expect(problem).toContainText("Сликата не е додадена");
    await expect(problem).toContainText("Може да се додаде само слика од тип JPEG, PNG или WebP. Изберете друга слика.");
    await expect(problem).toContainText("Изберете друга слика");
    await expect(open(page).locator(".imagefield__preview")).toHaveCount(0);
    // A refused file is not tried again: the way on is another file, with the button that is still there.
    await expect(open(page).getByRole("button", { name: "Обиди се повторно" })).toHaveCount(0);
    await expect(open(page).locator("label.btn", { hasText: "Додај слика" })).toBeVisible();
    await fileField(page).setInputFiles({ name: "grafik.png", mimeType: "image/png", buffer: await picture(page, 800, 600) });
    await expect(open(page).locator(".imagefield__preview")).toBeVisible();
    await expect(open(page).locator(".imagefield__problem")).toHaveCount(0);
  });

  test("a picture over 10 MB is refused, and one that is not a picture at all is too", async ({ page }) => {
    await fileField(page).setInputFiles({ name: "golema.png", mimeType: "image/png", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
    await expect(open(page).getByRole("alert")).toContainText("Сликата е поголема од 10 MB. Изберете помала слика.");
    await expect(open(page).locator(".imagefield__preview")).toHaveCount(0);
    await fileField(page).setInputFiles({ name: "lazna.png", mimeType: "image/png", buffer: Buffer.from("ова не е слика") });
    await expect(open(page).getByRole("alert")).toContainText("Не можевме да ја прочитаме сликата. Можеби е оштетена. Изберете друга слика.");
    await expect(open(page).locator(".imagefield__preview")).toHaveCount(0);
  });

  test("with no connection it says so at the picture, keeps the file, and adds it when the connection is back", async ({ page, context }) => {
    await context.setOffline(true);
    await fileField(page).setInputFiles({ name: "grafik.png", mimeType: "image/png", buffer: await picture(page, 800, 600) });
    const problem = open(page).getByRole("alert");
    await expect(problem).toContainText("Сликата не е додадена");
    await expect(problem).toContainText("Нема врска со интернет. Проверете ја врската и обидете се повторно.");
    await expect(open(page).locator(".imagefield__preview")).toHaveCount(0);
    await context.setOffline(false);
    await open(page).getByRole("button", { name: "Обиди се повторно" }).click();
    await expect(open(page).locator(".imagefield__preview")).toBeVisible();
    await expect(open(page).locator(".imagefield__problem")).toHaveCount(0);
  });

  test("a replacement that fails leaves the picture that was there, with its words", async ({ page }) => {
    await fileField(page).setInputFiles({ name: "prva.png", mimeType: "image/png", buffer: await picture(page, 800, 600) });
    await alt(page).fill("Првата слика");
    const preview = open(page).locator(".imagefield__preview");
    const first = await preview.getAttribute("src");
    await fileField(page).setInputFiles({ name: "dokument.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });
    await expect(open(page).getByRole("alert")).toContainText("Сликата не е додадена");
    expect(await preview.getAttribute("src")).toBe(first);
    await expect(alt(page)).toHaveValue("Првата слика");
  });

  test("no picture needs more than the page's own policy: nothing is blocked, and nothing is loaded from elsewhere", async ({ page }) => {
    const blocked: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) blocked.push(m.text());
    });
    page.on("requestfailed", (r) => blocked.push(`failed ${r.url()}`));
    await fileField(page).setInputFiles({ name: "grafik.png", mimeType: "image/png", buffer: await picture(page, 800, 600) });
    await expect(open(page).locator(".imagefield__preview")).toBeVisible();
    await done(page).click();
    expect(blocked).toEqual([]);
    const res = await page.request.get("/teacher/lessons");
    const policy = res.headers()["content-security-policy"];
    // The demo's pictures are data: addresses, and that is all the teacher's pages allow besides themselves: no blob:, no other origin.
    expect(policy).toContain("img-src 'self' data:;");
    expect(policy).not.toContain("blob:");
    // The rest of the site keeps its own policy.
    expect((await page.request.get("/app")).headers()["content-security-policy"]).toContain("img-src 'self' blob: data:;");
  });

  test("is seen where the lesson is read: the card of the question, the lesson once it is saved, and a copy of it", async ({ page }) => {
    await fileField(page).setInputFiles({ name: "grafik.png", mimeType: "image/png", buffer: await picture(page, 800, 600) });
    await alt(page).fill(ALT);
    await done(page).click();
    // The draft's read view: the image with its words as its name, and the words in view for the teacher, once.
    await expect(card(page, 1).getByRole("img", { name: ALT })).toBeVisible();
    await expect(card(page, 1).getByText(`Што покажува сликата: ${ALT}`)).toBeVisible();
    await expect(card(page, 1).locator(".question__figure figcaption")).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("img", { name: ALT })).toHaveCount(1);
    await saved(page);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-n\d+/);
    // The lesson's own view.
    await expect(card(page, 1).getByRole("img", { name: ALT })).toBeVisible();
    await expect(card(page, 1).getByText(`Што покажува сликата: ${ALT}`)).toBeVisible();
    // A picture whose words were not written still has a name for a screen reader.
    await expect(card(page, 2).getByRole("img")).toHaveCount(0);
    // And once it is changed again it is on the draft of the lesson.
    await page.getByRole("button", { name: "Уреди лекција" }).click();
    await expect(card(page, 1).getByRole("img", { name: ALT })).toBeVisible();
  });

  test("a picture without words is named for a screen reader all the same, and shows no line of words", async ({ page }) => {
    await fileField(page).setInputFiles({ name: "grafik.png", mimeType: "image/png", buffer: await picture(page, 800, 600) });
    await done(page).click();
    await expect(card(page, 1).getByRole("img", { name: "Слика кон прашањето" })).toBeVisible();
    await expect(card(page, 1).locator("figcaption")).toHaveCount(0);
  });

  test("in English, at a faculty", async ({ page }) => {
    await setLanguage(page, "en", "university");
    await seed(page, { drafts: [draftOf({ subject: { id: "linear-algebra", name: "Linear algebra" } })] }, SEED_URL, "university");
    await card(page, 1).getByRole("button", { name: "Edit", exact: true }).click();
    await expect(open(page).getByRole("heading", { level: 4, name: "Picture" })).toBeVisible();
    await expect(open(page).getByText("JPEG, PNG or WebP, at most 10 MB.")).toBeVisible();
    await expect(open(page).locator("label.btn", { hasText: "Add a picture" })).toBeVisible();
    await fileField(page).setInputFiles({ name: "grafik.png", mimeType: "image/png", buffer: await picture(page, 800, 600) });
    await expect(open(page).getByRole("textbox", { name: "What is in the picture?" })).toBeVisible();
    await expect(open(page).getByText("for students who cannot see it well. It is not required, but we recommend it.")).toBeVisible();
    await expect(open(page).getByRole("button", { name: "Remove the picture" })).toBeVisible();
    await fileField(page).setInputFiles({ name: "dokument.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });
    await expect(open(page).getByRole("alert")).toContainText("Only a JPEG, PNG or WebP picture can be added.");
  });

  test("the keyboard reaches it: the field has the focus after the question, and its button shows the ring", async ({ page }) => {
    await open(page).getByRole("textbox", { name: "Текст на прашањето" }).focus();
    await page.keyboard.press("Tab");
    await expect(fileField(page)).toBeFocused();
    const ring = await open(page)
      .locator("label.btn", { hasText: "Додај слика" })
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return { style: s.outlineStyle, width: s.outlineWidth };
      });
    expect(ring).toEqual({ style: "solid", width: "3px" });
    await page.keyboard.press("Tab");
    await expect(open(page).getByRole("radio", { name: "Понудени одговори" })).toBeFocused();
  });
});

// ---- Tolerance and a minus, behind "Повеќе опции" ---------------------------------------------------------------------------

test.describe("a numeric question", () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { drafts: [draftOf()] }, SEED_URL);
    await expect(title(page)).toHaveText("Квадратни равенки");
  });

  test("keeps the answer and the unit in view and puts the rest behind 'Повеќе опции'", async ({ page }) => {
    await edit(page, 3).click();
    await expect(answer(page)).toBeVisible();
    await expect(unit(page)).toBeVisible();
    await expect(tolerance(page)).toHaveCount(0);
    await expect(negative(page)).toHaveCount(0);
    const more = moreOptions(page);
    await expect(more).toHaveText("Повеќе опции");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    expect((await more.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await expect(more).toHaveClass(/btn--secondary/);
    await more.click();
    await expect(more).toHaveText("Помалку опции");
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(tolerance(page)).toBeVisible();
    await expect(negative(page)).toBeVisible();
    // The words that explain them come with them.
    await expect(open(page).getByText("На пример 0,5 значи дека 11,5 и 12,5 се точни кога одговорот е 12.")).toBeVisible();
    await expect(open(page).getByText("Тогаш Вашите ученици ќе имаат копче за минус.")).toBeVisible();
    // And can be closed again while none is set.
    await more.click();
    await expect(tolerance(page)).toHaveCount(0);
    await expect(more).toHaveAttribute("aria-expanded", "false");
  });

  test("opens on its own when a tolerance is already set, and then there is nothing to press", async ({ page }) => {
    await edit(page, 4).click();
    await expect(tolerance(page)).toBeVisible();
    await expect(tolerance(page)).toHaveValue("0,5");
    await expect(negative(page)).toBeVisible();
    await expect(moreOptions(page)).toHaveCount(0);
    await expect(unit(page)).toHaveValue("cm²");
  });

  test("opens on its own when a minus is already allowed", async ({ page }) => {
    await edit(page, 5).click();
    await expect(negative(page)).toBeChecked();
    await expect(tolerance(page)).toHaveValue("0");
    await expect(moreOptions(page)).toHaveCount(0);
    // Unticking it does not take the group away from under the teacher's hand.
    await negative(page).uncheck();
    await expect(negative(page)).toBeVisible();
    await expect(tolerance(page)).toBeVisible();
  });

  test("a tolerance typed makes it stay, and is kept in the draft", async ({ page }) => {
    await edit(page, 3).click();
    await moreOptions(page).click();
    await tolerance(page).fill("0,25");
    await expect(moreOptions(page)).toHaveCount(0);
    await expect(tolerance(page)).toBeVisible();
    await saved(page);
    expect((await demo(page)).school.drafts[0].content.questions[2]).toMatchObject({ tolerance: 0.25 });
    await done(page).click();
    await expect(card(page, 3)).toContainText("Се прифаќа отстапување до 0,25.");
    // Open again, it is open at once.
    await edit(page, 3).click();
    await expect(tolerance(page)).toHaveValue("0,25");
  });

  test("a minus answer without the minus key opens what it needs, and says what to tick", async ({ page }) => {
    await edit(page, 3).click();
    await answer(page).fill("-2");
    await expect(negative(page)).toHaveCount(0);
    await done(page).click();
    await expect(open(page).getByRole("alert")).toContainText("точниот одговор е негативен број");
    // The tick it asks for is there to press, in a group that opened by itself.
    await expect(negative(page)).toBeVisible();
    await negative(page).check();
    await expect(open(page).getByRole("alert")).toHaveCount(0);
  });

  test("a tolerance that is not a number is a problem of the question, and the list of what is wrong has a link that goes to it", async ({ page }) => {
    await edit(page, 3).click();
    await moreOptions(page).click();
    await tolerance(page).fill("abc");
    await done(page).click();
    await expect(open(page).getByRole("alert")).toContainText("отстапувањето мора да биде број");
    await expect(tolerance(page)).toBeFocused();
    // Left as it is, the lesson cannot be saved, and the list says what is wrong with a link to it.
    await saveButton(page).click();
    await expect(page.getByRole("heading", { level: 2, name: "Уште не може да се зачува" })).toBeVisible();
    await page.getByRole("link", { name: /отстапувањето мора да биде број/ }).click();
    await expect(tolerance(page)).toBeFocused();
    await tolerance(page).fill("0,5");
    await expect(open(page).getByRole("alert")).toHaveCount(0);
  });

  test("the other kinds have no such button", async ({ page }) => {
    await edit(page, 1).click();
    await expect(moreOptions(page)).toHaveCount(0);
  });

  test("in English, at a faculty", async ({ page }) => {
    await setLanguage(page, "en", "university");
    await seed(page, { drafts: [draftOf({ subject: { id: "linear-algebra", name: "Linear algebra" } })] }, SEED_URL, "university");
    await card(page, 3).getByRole("button", { name: "Edit", exact: true }).click();
    await expect(open(page).getByRole("button", { name: "More options" })).toHaveAttribute("aria-expanded", "false");
    await open(page).getByRole("button", { name: "More options" }).click();
    await expect(open(page).getByRole("button", { name: "Fewer options" })).toBeVisible();
    await expect(open(page).getByRole("textbox", { name: "How far off may an answer be?" })).toBeVisible();
    await expect(open(page).getByText("Then your students get a minus key.")).toBeVisible();
  });
});

// ---- The library -------------------------------------------------------------------------------------------------------------

test.describe("the library", () => {
  const items = (page: Page) => page.locator(".lessons > li");

  test("lists what colleagues saved: title, subject and year, who, how many questions, when", async ({ page }) => {
    await page.goto("/teacher/library");
    await expect(title(page)).toHaveText("Библиотека");
    await expect(page.locator(".head__sub")).toHaveText("Лекции што ги зачувале колегите од Вашето училиште.");
    await expect(items(page)).toHaveCount(5);
    // Newest saved first.
    await expect(items(page).getByRole("heading", { level: 3 })).toHaveText([
      "Праволиниско движење и брзина",
      "Планиметрија: триаголник и круг",
      "Њутнови закони",
      "Статистика: средна вредност и медијана",
      "Основи на комбинаториката",
    ]);
    await expect(items(page).nth(0)).toContainText("Физика · I година");
    await expect(items(page).nth(0)).toContainText("6 прашања · Од Весна Аврамовска");
    await expect(items(page).nth(0)).toContainText("Зачувана пред 6 дена");
    await expect(items(page).nth(1)).toContainText("Математика · II година");
    await expect(items(page).nth(1)).toContainText("5 прашања · Од Зоран Илиев");
    await expect(items(page).nth(1)).toContainText("Зачувана пред една недела");
    await expect(items(page).nth(3)).toContainText("Од Билјана Стојановска");
    // None of them is the teacher's own, none is copied yet, and the one button of each is outlined.
    await expect(page.getByText("Марија Петровска")).toHaveCount(1); // only the name at the top right
    await expect(page.getByText("Веќе ја копиравте")).toHaveCount(0);
    for (const item of await items(page).all()) await expect(item.getByRole("link", { name: "Прегледај" })).toHaveClass(/btn--secondary/);
    // The main action, copying, is on the preview, so this page has no yellow button.
    await expect(yellow(page)).toHaveCount(0);
  });

  test("has a row of subjects as the Lessons page has, and a subject shows its own", async ({ page }) => {
    await page.goto("/teacher/library");
    const row = page.getByRole("radiogroup", { name: "Предмет" });
    await expect(row.locator(".choice__text")).toHaveText(["Сите предмети", "Математика", "Физика"]);
    await expect(row.getByRole("radio", { name: "Сите предмети" })).toBeChecked();
    await row.getByRole("radio", { name: "Физика" }).check();
    await expect(items(page)).toHaveCount(2);
    for (const item of await items(page).all()) await expect(item).toContainText("Физика ·");
    await row.getByRole("radio", { name: "Математика" }).check();
    await expect(items(page)).toHaveCount(3);
    await row.getByRole("radio", { name: "Сите предмети" }).check();
    await expect(items(page)).toHaveCount(5);
  });

  test("at a faculty it is worded for the faculty, and has more subjects and colleagues", async ({ page }) => {
    await setLanguage(page, "mk", "university");
    await page.goto("/teacher/library");
    await expect(page.locator(".head__sub")).toHaveText("Лекции што ги зачувале колегите од Вашиот факултет.");
    await expect(items(page)).toHaveCount(4);
    await expect(page.getByRole("radiogroup", { name: "Предмет" }).locator(".choice__text")).toHaveText([
      "Сите предмети",
      "Веројатност и статистика",
      "Дискретна математика",
      "Линеарна алгебра",
      "Математичка анализа 1",
    ]);
    await expect(page.getByText("Од Драган Ристевски")).toBeVisible();
  });

  test("an empty library is one honest card, with nothing to press", async ({ page }) => {
    await seed(page, { library_empty: true }, "/teacher/library");
    await expect(page.getByRole("heading", { level: 2, name: "Сè уште нема лекции од колегите" })).toBeVisible();
    await expect(page.getByText("Кога колегите од Вашето училиште ќе зачуваат лекции, ќе се појават тука и ќе можете да ги копирате.")).toBeVisible();
    await expect(page.locator(".lessons")).toHaveCount(0);
    await expect(page.getByRole("radiogroup")).toHaveCount(0);
    await expect(yellow(page)).toHaveCount(0);
  });

  test("an empty library at a faculty names the faculty, in both languages", async ({ page }) => {
    await setLanguage(page, "en", "university");
    await seed(page, { library_empty: true }, "/teacher/library", "university");
    await expect(page.getByRole("heading", { level: 2, name: "No lessons from colleagues yet" })).toBeVisible();
    await expect(page.getByText("When your colleagues at your faculty save lessons, they appear here and you can copy them.")).toBeVisible();
  });

  test("a lesson is previewed, read only, as a lesson is read, with who made it and one yellow button", async ({ page }) => {
    await page.goto("/teacher/library");
    await items(page).filter({ hasText: "Статистика: средна вредност и медијана" }).getByRole("link", { name: "Прегледај" }).click();
    await expect(page).toHaveURL(/\/teacher\/library\/lib-statistika$/);
    await expect(title(page)).toHaveText("Статистика: средна вредност и медијана");
    await expect(page.locator(".head__sub")).toHaveText("Математика · III година");
    await expect(page.getByRole("link", { name: "Назад кон Библиотека" })).toHaveAttribute("href", "/teacher/library");
    await expect(page.getByText("Ова е преглед на лекцијата на Билјана Стојановска.")).toBeVisible();
    await expect(page.getByText("Оригиналот не се менува.")).toBeVisible();
    await expect(yellow(page)).toHaveCount(1);
    await expect(yellow(page)).toHaveText("Копирај во моите лекции");
    // The questions, in order, with the right answer marked, exactly as a lesson of the teacher's own; nothing to change.
    await expect(questionCards(page)).toHaveCount(5);
    await expect(card(page, 1).getByRole("heading", { level: 3 })).toHaveText("Прашање 1 од 5");
    await expect(card(page, 1)).toContainText("Точен одговор");
    await expect(page.getByRole("button", { name: /Уреди|Започни час|Избриши/ })).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    // The library's entry in the menu is the current one.
    await expect(page.getByRole("navigation", { name: "Главно мени" }).getByRole("link", { name: "Библиотека" })).toHaveAttribute("aria-current", "page");
  });

  test("shows a picture of a colleague's question with its words", async ({ page }) => {
    await page.goto("/teacher/library/lib-planimetrija");
    await expect(title(page)).toHaveText("Планиметрија: триаголник и круг");
    await expect(card(page, 1).getByRole("img", { name: "Правоаголен триаголник со катети 6 и 8" })).toBeVisible();
    await expect(card(page, 1).getByText("Што покажува сликата: Правоаголен триаголник со катети 6 и 8")).toBeVisible();
    const natural = await card(page, 1).getByRole("img").evaluate((img: HTMLImageElement) => img.naturalWidth);
    expect(natural).toBeGreaterThan(0);
  });

  test("copying lands on the lesson, which is now the teacher's own, with a line that says so once and where to change it", async ({ page }) => {
    await page.goto("/teacher/library/lib-statistika");
    await page.getByRole("button", { name: "Копирај во моите лекции" }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-n\d+$/);
    await expect(title(page)).toHaveText("Статистика: средна вредност и медијана");
    await expect(page.getByRole("status").filter({ hasText: "Лекцијата е копирана" })).toHaveText("Лекцијата е копирана и сега е Ваша. Можете да ја менувате со „Уреди лекција“.");
    await expect(page.getByRole("button", { name: "Уреди лекција" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Избриши лекција" })).toBeVisible();
    // Told once.
    await page.reload();
    await expect(page.getByText("Лекцијата е копирана")).toHaveCount(0);
    // It is among the teacher's lessons, prepared, and a copy of the colleague's.
    await page.goto("/teacher/lessons");
    await expect(prepared(page).filter({ hasText: "Статистика: средна вредност и медијана" })).toHaveCount(1);
    expect((await demo(page)).school.lessons.find((l) => l.title.startsWith("Статистика"))?.copied_from?.lesson_id).toBe("lib-statistika");
  });

  test("a lesson that was copied says so in the library and in its preview, and can be copied again", async ({ page }) => {
    await page.goto("/teacher/library/lib-statistika");
    await expect(page.getByText("Веќе ја копиравте")).toHaveCount(0);
    await page.getByRole("button", { name: "Копирај во моите лекции" }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-n\d+$/);
    await page.goto("/teacher/library");
    const item = items(page).filter({ hasText: "Статистика: средна вредност и медијана" });
    await expect(item).toContainText("Веќе ја копиравте");
    await expect(page.getByText("Веќе ја копиравте")).toHaveCount(1);
    await item.getByRole("link", { name: "Прегледај" }).click();
    await expect(page.getByText("Веќе ја копиравте оваа лекција. Ако ја копирате повторно, ќе добиете уште една копија.")).toBeVisible();
    // Copying again stays possible, with the same yellow button.
    await expect(yellow(page)).toHaveText("Копирај во моите лекции");
    await yellow(page).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-n\d+$/);
    const copies = (await demo(page)).school.lessons.filter((l) => l.title.startsWith("Статистика"));
    expect(copies).toHaveLength(2);
    expect(new Set(copies.map((c) => c.id)).size).toBe(2);
  });

  test("the copy is changed without touching the colleague's lesson", async ({ page }) => {
    await page.goto("/teacher/library/lib-statistika");
    await page.getByRole("button", { name: "Копирај во моите лекции" }).click();
    await page.getByRole("button", { name: "Уреди лекција" }).click();
    await page.getByRole("textbox", { name: "Наслов на лекцијата" }).fill("Моја статистика");
    await saved(page);
    await saveButton(page).click();
    await expect(title(page)).toHaveText("Моја статистика");
    await page.goto("/teacher/library");
    await expect(items(page).filter({ hasText: "Статистика: средна вредност и медијана" })).toHaveCount(1);
    await expect(items(page).filter({ hasText: "Моја статистика" })).toHaveCount(0);
  });

  test("an old address, or a lesson that is not in the library, says so and leads back", async ({ page }) => {
    await page.goto("/teacher/library/lib-nema");
    await expect(page.getByRole("heading", { level: 2, name: "Не ја најдовме лекцијата" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Назад кон Библиотека" }).last()).toHaveAttribute("href", "/teacher/library");
    // The teacher's own lesson is not a lesson of the library either.
    await page.goto("/teacher/library/l-procenti");
    await expect(page.getByRole("heading", { level: 2, name: "Не ја најдовме лекцијата" })).toBeVisible();
    await expect(yellow(page)).toHaveCount(0);
  });

  test("a copy that cannot be made says why at the button, and the button is still there to try again", async ({ page, context }) => {
    await page.goto("/teacher/library/lib-statistika");
    await expect(yellow(page)).toBeVisible();
    await context.setOffline(true);
    await yellow(page).click();
    const problem = page.locator("main").getByRole("alert");
    await expect(problem).toContainText("Не успеавме да ја копираме лекцијата");
    await expect(problem).toContainText("Нема врска со интернет.");
    await expect(page).toHaveURL(/\/teacher\/library\/lib-statistika$/);
    expect((await demo(page)).school.lessons).toHaveLength(0);
    await context.setOffline(false);
    await yellow(page).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-n\d+$/);
  });

  test("in English, at a faculty", async ({ page }) => {
    await setLanguage(page, "en", "university");
    await page.goto("/teacher/library");
    await expect(title(page)).toHaveText("Library");
    await expect(page.locator(".head__sub")).toHaveText("Lessons your colleagues at your faculty have saved.");
    await expect(items(page).first().getByRole("link", { name: "Preview" })).toBeVisible();
    await expect(items(page).first()).toContainText("By ");
    await items(page).first().getByRole("link", { name: "Preview" }).click();
    await expect(page.getByRole("link", { name: "Back to the Library" })).toBeVisible();
    await expect(page.getByText(/^This is a preview of .+’s lesson\. If you copy it, you get a lesson of your own that you can edit\. The original does not change\.$/)).toBeVisible();
    await page.getByRole("button", { name: "Copy to my lessons" }).click();
    await expect(page.getByText("The lesson is copied and is now yours. You can change it with “Edit lesson”.")).toBeVisible();
  });
});

// ---- The keyboard alone ----------------------------------------------------------------------------------------------------

test.describe("keyboard only", () => {
  test("a lesson is opened from the list, the question to delete it is answered, and the lesson is deleted", async ({ page }) => {
    await page.goto("/teacher/lessons");
    await expect(prepared(page).first()).toBeVisible();
    await page.getByRole("link", { name: "Подготви лекција" }).focus();
    await page.keyboard.press("Tab");
    await expect(prepared(page).first().getByRole("button", { name: "Започни час" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(prepared(page).first().getByRole("link", { name: "Отвори" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(prepared(page).nth(1).getByRole("button", { name: "Започни час" })).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(title(page)).toHaveText("Проценти и пропорции");
    // To the end of the page by keys, the delete button is the last stop of the lesson.
    await deleteButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(deleteQuestion(page).getByRole("button", { name: "Не, задржи ја" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(deleteQuestion(page)).toBeHidden();
    await expect(deleteButton(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(deleteQuestion(page).getByRole("button", { name: "Да, избриши ја" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/teacher\/lessons$/);
    await expect(page.getByText("Лекцијата е избришана.")).toBeVisible();
    await expect(prepared(page)).toHaveCount(1);
  });

  test("a colleague's lesson is previewed and copied, and the new lesson is reached", async ({ page }) => {
    await page.goto("/teacher/library");
    const first = page.locator(".lessons > li").first().getByRole("link", { name: "Прегледај" });
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/teacher\/library\/lib-/);
    await page.getByRole("button", { name: "Копирај во моите лекции" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-n\d+$/);
    await expect(page.getByText("Лекцијата е копирана и сега е Ваша.")).toBeVisible();
    await page.getByRole("button", { name: "Уреди лекција" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/teacher\/lessons\/drafts\//);
  });

  test("the subject row is a group of radio buttons: the arrows choose, Tab leaves it", async ({ page }) => {
    await setLanguage(page, "mk", "university");
    await page.goto("/teacher/library");
    const row = page.getByRole("radiogroup", { name: "Предмет" });
    await row.getByRole("radio", { name: "Сите предмети" }).focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(row.getByRole("radio", { name: "Дискретна математика" })).toBeChecked();
    await expect(page.locator(".lessons > li")).toHaveCount(1);
    await page.keyboard.press("Tab");
    await expect(page.locator(".lessons > li").first().getByRole("link", { name: "Прегледај" })).toBeFocused();
  });
});

// ---- Zoomed, and the sizes of a laptop --------------------------------------------------------------------------------------

test.describe("zoomed and small windows", () => {
  // 200% on a 1280 x 720 window leaves 640 x 360 CSS pixels; 400% leaves 320 x 180.
  for (const [zoom, viewport] of [
    ["200%", { width: 640, height: 360 }],
    ["400%", { width: 320, height: 180 }],
    ["1024 wide", { width: 1024, height: 768 }],
  ] as const) {
    test(`at ${zoom} the pages of this step do not run off the side`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setLanguage(page, "mk", "university");
      await seed(page, { drafts: [draftOf({ subject: { id: "linear-algebra", name: "Линеарна алгебра" } })] }, "/teacher/lessons", "university");
      await expect(page.getByRole("radiogroup", { name: "Предмет" })).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.goto("/teacher");
      await expect(title(page)).toHaveText("Денес");
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.goto("/teacher/library");
      await expect(page.locator(".lessons > li").first()).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.goto("/teacher/library/lib-matrici");
      await expect(card(page, 1)).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.goto("/teacher/lessons/l-nizi");
      await expect(deleteButton(page)).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await deleteButton(page).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expect(page.getByRole("alertdialog").getByRole("button", { name: "Не, задржи ја" })).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });

    test(`at ${zoom} a colleague's lesson with a picture fits`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/teacher/library/lib-planimetrija");
      await expect(card(page, 1).getByRole("img", { name: "Правоаголен триаголник со катети 6 и 8" })).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(await card(page, 1).getByRole("img").evaluate((img: HTMLImageElement) => img.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
    });

    test(`at ${zoom} an open question with a picture, its words and the options behind More options fits`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await seed(page, { drafts: [draftOf()] }, SEED_URL);
      await expect(title(page)).toHaveText("Квадратни равенки");
      await edit(page, 1).click();
      await fileField(page).setInputFiles({ name: "grafik.png", mimeType: "image/png", buffer: await picture(page, 2400, 1200) });
      await expect(alt(page)).toBeVisible();
      await alt(page).fill("Многу долг опис на сликата што мора да се прелома во повеќе редови и да не го пробие работ на прозорецот никаде");
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await open(page).getByRole("textbox", { name: "Текст на прашањето" }).fill("Едно прашање со слика.");
      await open(page).getByRole("radio", { name: "Одговор со број" }).check();
      await moreOptions(page).click();
      await expect(tolerance(page)).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      // A failure said at the picture fits too.
      await fileField(page).setInputFiles({ name: "dokument.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });
      await expect(open(page).getByRole("alert")).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }
});
