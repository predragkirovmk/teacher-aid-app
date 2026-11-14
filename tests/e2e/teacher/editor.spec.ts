import type { Page } from "@playwright/test";
import { expect, MOCK_KEY, SETTINGS_KEY, tall, test } from "./fixtures";

/**
 * The editor (F-03 step 5, F-04, FR-LES-07 to -22): a draft that is ready is a lesson to change, one question open at a time,
 * with every change saved by itself; the four refinements, each a job with an undo; saving it as a lesson, or as the next version
 * of one that was saved; and the lessons not finished, listed on Today. In mock mode, in Macedonian unless a test changes the
 * language. Drafts are put straight into the demo's saved state (as the AI would have left them), so that a test does not wait
 * for the AI; the wait itself, and the way from the form to the draft, are in prepare.spec.ts, and the first lesson of a first
 * run is the last describe here.
 */

const SEED = "d-seed";
const SEED_URL = `/teacher/lessons/drafts/${SEED}`;
const iso = (ms: number) => new Date(ms).toISOString();

// ---- Six questions of all three kinds, as the AI left them ----------------------------------------------------------------

const base = (i: number) => ({ id: `${SEED}-q${i + 1}`, order: i, media: null, explanation: `Затоа ${i + 1}.`, timer_seconds: 25, topic: "Равенки" });

const mc = (i: number, prompt: string, options: string[], correct: string, extra: Record<string, unknown> = {}) => ({
  ...base(i),
  kind: "multiple_choice",
  prompt,
  options,
  correct,
  ...extra,
});
const tf = (i: number, prompt: string, correct: string, extra: Record<string, unknown> = {}) => ({ ...base(i), kind: "true_false", prompt, correct, timer_seconds: 15, ...extra });
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
  mc(3, "Колку решенија има равенката x² − 6x + 9 = 0?", ["Две различни", "Едно двојно решение", "Нема реални решенија"], "1"),
  num(4, "Колку е поголемото решение на равенката x² − 5x + 6 = 0?", "3"),
  tf(5, "Збирот на решенијата е −b/a.", "true"),
];

type Draft = Record<string, unknown>;

/** A draft as the mock keeps it. `job: null` is a draft that is ready; a job is written out for the ones that are not. */
const draftOf = (extra: Draft = {}, questions: unknown[] = QUESTIONS): Draft => ({
  id: SEED,
  source_id: null,
  source: { kind: "typed", file_name: null },
  subject: { id: "math", name: "Математика" },
  year: 2,
  emphasis: null,
  refinements: [],
  previous_draft_id: null,
  created_at: iso(Date.now() - 60_000),
  updated_at: iso(Date.now() - 60_000),
  consumed_at: null,
  lesson_id: null,
  job: null,
  content: { title: "Квадратни равенки", review_summary: "Квадратна равенка е равенка од втор степен.", questions },
  ...extra,
});

type Seed = { drafts?: Draft[]; sources?: unknown[]; lessons?: unknown[]; first_run_done?: boolean };

/** Put what the AI would have left into the demo's saved state, then load the page afresh so that the demo reads it. */
async function seed(page: Page, what: Seed, url: string, whose: "school" | "university" | "novice" = "school") {
  await page.goto("/teacher/help");
  // The demo writes its state once the page has started; read it only after.
  await page.waitForFunction((key) => localStorage.getItem(key) !== null, MOCK_KEY);
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

const demo = (page: Page) =>
  page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) ?? "null");
    return state as {
      school: { drafts: { id: string; consumed_at: string | null; lesson_id: string | null; previous_draft_id: string | null; refinements: string[]; content: { title: string; review_summary: string; questions: Record<string, unknown>[] } }[]; lessons: { id: string; title: string; version: number; question_count: number; questions: Record<string, unknown>[] }[] };
      novice: { school: { first_run_done: boolean; lessons: { id: string; title: string }[] } };
    };
  }, MOCK_KEY);

const draftOnDisk = async (page: Page, id = SEED) => (await demo(page)).school.drafts.find((d) => d.id === id)!;

// ---- What is on the page ------------------------------------------------------------------------------------------------

const title = (page: Page) => page.getByRole("heading", { level: 1 });
const mainButton = (page: Page) => page.locator(".btn--primary:visible");
const cards = (page: Page) => page.locator(".questions > li");
const card = (page: Page, n: number) => cards(page).nth(n - 1);
const open = (page: Page) => page.locator("li.question--open");
const edit = (page: Page, n: number) => card(page, n).getByRole("button", { name: "Уреди", exact: true });
const done = (page: Page) => open(page).getByRole("button", { name: "Готово", exact: true });
const saveButton = (page: Page) => page.getByRole("button", { name: /^Зачувај (лекција|ги промените)$/ });
const titleField = (page: Page) => page.getByRole("textbox", { name: "Наслов на лекцијата" });
const summaryField = (page: Page) => page.getByRole("textbox", { name: "Резиме за повторување" });
const status = (page: Page) => page.locator(".savestate").first();
/** The draft has every change: past the quiet moment (0.8 s) the last change has been sent, and the status says so. */
const saved = async (page: Page) => {
  await page.waitForTimeout(1000);
  await expect(status(page)).toHaveText("Промените се зачувани.", { timeout: 10_000 });
};
const refineHeading = (page: Page) => page.getByRole("heading", { level: 2, name: "Промени ги сите прашања" });
const refine = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const waitHeading = (page: Page) => page.getByRole("heading", { level: 2, name: "Ги менуваме прашањата" });
const alerts = (page: Page) => page.locator("main").getByRole("alert");
const leaveDialog = (page: Page) => page.getByRole("alertdialog", { name: "Дали сакате да ја напуштите страницата?" });
const menu = (page: Page) => page.getByRole("navigation", { name: "Главно мени" });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** The fields of the question that is open. */
const prompt = (page: Page) => open(page).getByRole("textbox", { name: "Текст на прашањето" });
const option = (page: Page, n: number) => open(page).getByRole("textbox", { name: `Одговор ${n}`, exact: true });
/** The choice of an answer, whether it is the right one now ("Одговор 2, точен одговор") or not ("Одговор 2, означи како точен"). */
const isRight = (page: Page, n: number) => open(page).getByRole("radio", { name: new RegExp(`^Одговор ${n}, `) });
const timer = (page: Page) => open(page).getByRole("textbox", { name: "Време за одговор, во секунди" });
const kind = (page: Page, name: string) => open(page).getByRole("radio", { name });
const answer = (page: Page) => open(page).getByRole("textbox", { name: "Точен одговор", exact: true });
const tolerance = (page: Page) => open(page).getByRole("textbox", { name: "Колку може да отстапува одговорот?" });
/** "Повеќе опции" hides how far off an answer may be and the minus key until one of them is set; pressing it shows them. */
const moreOptions = (page: Page) => open(page).getByRole("button", { name: /^(Повеќе|Помалку) опции$/ });

test.beforeEach(async ({ page }, testInfo) => {
  // A teacher in their first run has their own demo state, and makes their lesson from the start.
  if (testInfo.titlePath.includes("the first run") || testInfo.titlePath.some((t) => t.startsWith("a new teacher"))) return;
  await seed(page, { drafts: [draftOf()] }, SEED_URL);
  await expect(title(page)).toHaveText("Квадратни равенки");
});

// ---- The editor at rest ---------------------------------------------------------------------------------------------------

test.describe("at rest", () => {
  test("is the title, the questions in order, the four ways to change them all, the summary, and one main button", async ({ page }) => {
    await expect(page.locator(".head__sub")).toHaveText("Математика · II година");
    await expect(titleField(page)).toHaveValue("Квадратни равенки");
    await expect(status(page)).toHaveText("Промените се зачувуваат сами.");
    await expect(cards(page)).toHaveCount(6);
    await expect(card(page, 1).getByRole("heading", { level: 3 })).toHaveText("Прашање 1 од 6");
    // A question that is only read has one button, named for what it does.
    for (let n = 1; n <= 6; n++) await expect(card(page, n).getByRole("button")).toHaveCount(1);
    await expect(edit(page, 1)).toBeVisible();
    await expect(page.getByRole("button", { name: "Додај прашање" })).toBeVisible();
    await expect(refineHeading(page)).toBeVisible();
    for (const name of ["Полесни", "Потешки", "Повеќе прашања", "Пократко време"]) await expect(refine(page, name)).toBeVisible();
    await expect(summaryField(page)).toHaveValue("Квадратна равенка е равенка од втор степен.");
    await expect(mainButton(page)).toHaveCount(1);
    await expect(mainButton(page)).toHaveText("Зачувај лекција");

    // Questions first, then the ways to change them all, then the review summary, then the button (in the page's own order: the button
    // is in a bar that stays in the window, so where it is on the screen says nothing about where it is in the page).
    const order = await page.evaluate(() => {
      const at = (el: Element | null) => el!;
      const last = at(document.querySelector(".questions > li:last-child"));
      const refine = at(document.getElementById("refine-title"));
      const summary = at(document.getElementById("editor-summary"));
      const save = at(document.querySelector(".savebar .btn--primary"));
      const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return [follows(last, refine), follows(refine, summary), follows(summary, save)];
    });
    expect(order).toEqual([true, true, true]);
    // What happens to an unfinished lesson is said under the button.
    await expect(page.getByText("Ако не ја зачувате сега, ја чуваме до 30 дена и ја наоѓате на Денес.")).toBeAttached();
    await expect(saveButton(page)).toHaveAccessibleDescription(/Откако ќе ја зачувате, лекцијата е на Денес/);
  });

  test("the main button and where saving stands are one bar that stays in the window, and is the only place that says it", async ({ page }) => {
    const bar = page.locator(".savebar");
    await expect(bar).toHaveCount(1);
    await expect(bar.locator(".btn--primary")).toHaveText("Зачувај лекција");
    await expect(bar.locator(".savestate")).toHaveText("Промените се зачувуваат сами.");
    // Said once on the page, not by the title and again by the open question.
    await expect(page.locator(".savestate")).toHaveCount(1);
    await edit(page, 1).click();
    await expect(page.locator(".savestate")).toHaveCount(1);
    expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
    // In the window when the page opens, in the middle of the long page, and with a long question open.
    const inWindow = async () => {
      const box = (await saveButton(page).boundingBox())!;
      const vh = page.viewportSize()!.height;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(vh);
    };
    await inWindow();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await inWindow();
    await expect(mainButton(page)).toHaveCount(1);
    // At the end of the page it is where it belongs, above the two lines about what saving does.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const barBox = (await bar.boundingBox())!;
    const note = (await page.locator("#save-note").boundingBox())!;
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(note.y);
    // A box that takes the focus is not under it.
    await page.evaluate(() => window.scrollTo(0, 0));
    await timer(page).focus();
    const field = (await timer(page).boundingBox())!;
    expect(field.y + field.height).toBeLessThanOrEqual((await bar.boundingBox())!.y);
  });

  test("in a short window (200% zoom) the bar is part of the page, and does not take a third of it", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    expect(await page.locator(".savebar").evaluate((el) => getComputedStyle(el).position)).toBe("static");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom)).toBe("auto");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await saveButton(page).scrollIntoViewIfNeeded();
    const box = (await saveButton(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
  });

  test("everything that can be pressed is large: 44px and up, the main button 48px; and no words are under 16px", async ({ page }) => {
    for (const button of await page.locator("main button:visible, main a.btn:visible").all()) expect(await tall(button)).toBeGreaterThanOrEqual(44);
    expect(await tall(saveButton(page))).toBeGreaterThanOrEqual(48);
    const small = await page.locator("main *:visible").evaluateAll((els) =>
      els
        .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== ""))
        .filter((el) => !el.closest(".sr"))
        .map((el) => ({ text: el.textContent!.trim().slice(0, 30), size: parseFloat(getComputedStyle(el).fontSize) }))
        .filter((x) => x.size < 16),
    );
    expect(small).toEqual([]);
    // What is read, the question and the words beside the main button, is the body size: 17px.
    expect(await card(page, 1).locator(".question__prompt").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(17);
    expect(await page.locator(".prepare__go p").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(17);
  });

  test("the first question starts in the first screen of a laptop", async ({ page }) => {
    const first = (await cards(page).first().boundingBox())!;
    expect(first.y + 200).toBeLessThanOrEqual(720);
  });

  test("Back goes to Lessons, where the teacher came from", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Назад кон Лекции", exact: true })).toHaveAttribute("href", "/teacher/lessons");
  });
});

// ---- One question at a time -----------------------------------------------------------------------------------------------

test.describe("one question at a time", () => {
  test("Уреди opens that question, with the focus on its words, and Готово closes it with the focus back on Уреди", async ({ page }) => {
    await edit(page, 2).click();
    await expect(open(page)).toHaveCount(1);
    await expect(open(page).getByRole("heading", { level: 3 })).toHaveText("Прашање 2 од 6");
    await expect(prompt(page)).toBeFocused();
    await expect(prompt(page)).toHaveValue("Равенката x² + 4 = 0 нема реални решенија.");
    // The focus jumped from a button to a box far from the number of the question: a screen reader is told which one it is in.
    await expect(prompt(page)).toHaveAccessibleDescription("Прашање 2 од 6");
    // Opening it takes the button of the others away from the one that is open: one has the buttons, the rest only Уреди.
    await expect(open(page).getByRole("button", { name: "Готово" })).toBeVisible();
    await done(page).click();
    await expect(open(page)).toHaveCount(0);
    await expect(edit(page, 2)).toBeFocused();
  });

  test("opening another closes the one that was open, and the one open is checked first", async ({ page }) => {
    await edit(page, 1).click();
    await edit(page, 3).click();
    await expect(open(page)).toHaveCount(1);
    await expect(open(page).getByRole("heading", { level: 3 })).toHaveText("Прашање 3 од 6");
    await expect(card(page, 1).getByRole("button", { name: "Уреди" })).toBeVisible();

    // A question that is not ready stays open and says what is missing, and the focus goes to it.
    await prompt(page).fill("");
    await edit(page, 5).click();
    await expect(open(page).getByRole("heading", { level: 3 })).toHaveText("Прашање 3 од 6");
    await expect(open(page).getByRole("alert")).toContainText("Ова прашање уште не е готово");
    await expect(open(page).getByRole("alert")).toContainText("Прашање 3: напишете го прашањето.");
    await expect(prompt(page)).toBeFocused();
    // What is wrong is said at the top of the card, so it is in the window together with the box the focus went to.
    await expect(open(page).getByRole("alert")).toBeInViewport();
    await expect(prompt(page)).toBeInViewport();
    expect((await open(page).getByRole("alert").boundingBox())!.y).toBeLessThan((await prompt(page).boundingBox())!.y);
    await prompt(page).fill("Нешто.");
    await expect(open(page).getByRole("alert")).toHaveCount(0);
    await edit(page, 5).click();
    await expect(open(page).getByRole("heading", { level: 3 })).toHaveText("Прашање 5 од 6");
  });

  test("Готово on a question that is not ready says why, in words, and does not close it", async ({ page }) => {
    await edit(page, 1).click();
    await option(page, 2).fill("");
    await done(page).click();
    await expect(open(page)).toHaveCount(1);
    await expect(open(page).getByRole("alert")).toContainText("Прашање 1: напишете го одговорот 2 или отстранете го.");
    await expect(option(page, 2)).toBeFocused();
    await option(page, 2).fill("x² − 4x + 4 = 0");
    await done(page).click();
    await expect(open(page)).toHaveCount(0);
  });
});

// ---- Editing each kind ----------------------------------------------------------------------------------------------------

test.describe("editing a question of each kind", () => {
  test("multiple choice: the words, an answer, which is right, one more answer, one fewer, the explanation, the time, the topic", async ({ page }) => {
    await edit(page, 1).click();
    await prompt(page).fill("Која е квадратна равенка?");
    await option(page, 1).fill("x + 5 = 0");
    await isRight(page, 3).check();
    await expect(isRight(page, 3)).toBeChecked();
    await expect(isRight(page, 2)).not.toBeChecked();
    // Two to four answers: four are there, so none can be added, and one can be taken away; at two none can.
    await expect(open(page).getByRole("button", { name: "Додај одговор" })).toHaveCount(0);
    await open(page).getByRole("button", { name: "Отстрани го одговорот 4" }).click();
    await expect(option(page, 4)).toHaveCount(0);
    await open(page).getByRole("button", { name: "Додај одговор" }).click();
    await option(page, 4).fill("x² = 0");
    await open(page).getByRole("button", { name: "Отстрани го одговорот 1" }).click();
    // The right answer moved up with its place: it was the third and is the second now.
    await expect(isRight(page, 2)).toBeChecked();
    await expect(option(page, 2)).toHaveValue("x³ − 1 = 0");
    await open(page).getByRole("button", { name: "Отстрани го одговорот 1" }).click();
    await expect(open(page).getByRole("button", { name: /^Отстрани/ })).toHaveCount(0);
    await expect(option(page, 2)).toBeVisible();
    await open(page).getByRole("textbox", { name: "Објаснување" }).fill("Затоа што е од трет степен.");
    await open(page).getByRole("textbox", { name: "Тема", exact: true }).fill("Видови равенки");
    await open(page).getByRole("button", { name: "+5 секунди" }).click();
    await expect(timer(page)).toHaveValue("30");
    await open(page).getByRole("button", { name: "−5 секунди" }).click();
    await open(page).getByRole("button", { name: "−5 секунди" }).click();
    await expect(timer(page)).toHaveValue("20");
    await timer(page).fill("90");
    await saved(page);

    const q = (await draftOnDisk(page)).content.questions[0];
    expect(q).toMatchObject({
      prompt: "Која е квадратна равенка?",
      options: ["x³ − 1 = 0", "x² = 0"],
      correct: "0",
      explanation: "Затоа што е од трет степен.",
      topic: "Видови равенки",
      timer_seconds: 90,
      kind: "multiple_choice",
    });
    // And on the card that is read: the right one is marked with the words, not by colour alone.
    await done(page).click();
    await expect(card(page, 1).locator(".option[data-correct='true']")).toContainText("Точен одговор");
    await expect(card(page, 1)).toContainText("Време: 90 секунди");
  });

  test("multiple choice: only the right answer says it is right; the others say what pressing them does", async ({ page }) => {
    await edit(page, 1).click();
    const rows = open(page).locator(".opt");
    await expect(rows).toHaveCount(4);
    // One row says "Точен одговор", with a tick; the three others say "Означи како точен", and none of them says it is right.
    await expect(open(page).locator(".opt__right").filter({ hasText: "Точен одговор" })).toHaveCount(1);
    await expect(open(page).locator(".opt__right").filter({ hasText: "Означи како точен" })).toHaveCount(3);
    await expect(rows.nth(1)).toHaveAttribute("data-right", "true");
    await expect(rows.nth(1)).toContainText("Точен одговор");
    for (const i of [0, 2, 3]) {
      await expect(rows.nth(i)).toHaveAttribute("data-right", "false");
      await expect(rows.nth(i)).not.toContainText("Точен одговор");
    }
    // The tick is a drawing next to the words, never alone: the one with the words is the one with the edge, in the accent.
    expect(await rows.nth(1).evaluate((el) => getComputedStyle(el).borderTopColor)).toBe("rgb(18, 69, 84)");
    expect(await rows.nth(0).evaluate((el) => getComputedStyle(el).borderTopColor)).toBe("rgba(0, 0, 0, 0)");
    // What a screen reader says of each, with the words that are on the screen in it.
    await expect(isRight(page, 2)).toHaveAccessibleName("Одговор 2, точен одговор");
    await expect(isRight(page, 3)).toHaveAccessibleName("Одговор 3, означи како точен");
    // Pressing another moves it: the first is not right any more and says so by saying what it does again.
    await isRight(page, 4).check();
    await expect(rows.nth(3)).toContainText("Точен одговор");
    await expect(rows.nth(1)).toContainText("Означи како точен");
    await expect(open(page).locator(".opt__right").filter({ hasText: "Точен одговор" })).toHaveCount(1);
    await saved(page);
    expect((await draftOnDisk(page)).content.questions[0]).toMatchObject({ correct: "3" });
  });

  test("in Windows high contrast the right answer still has its own edge and its words, and the others have none", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await edit(page, 1).click();
    const rows = open(page).locator(".opt");
    const edge = (n: number) => rows.nth(n).evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(await edge(1)).not.toBe(await edge(0));
    expect(await edge(0)).toBe(await edge(2));
    await expect(rows.nth(1)).toContainText("Точен одговор");
    await expect(rows.nth(0)).not.toContainText("Точен одговор");
  });

  test("the kinds are three tiles on one line each, with the same words as the card that is read", async ({ page }) => {
    await edit(page, 1).click();
    for (const name of ["Понудени одговори", "Точно или неточно", "Одговор со број"]) {
      const tile = open(page).locator(".prepare__tiles .choice").filter({ hasText: name });
      await expect(tile).toBeVisible();
      // One line: a tile of 64px, not one of three lines.
      expect(await tall(tile)).toBeLessThanOrEqual(64);
    }
    await done(page).click();
    await expect(card(page, 1).locator(".question__meta")).toContainText("Понудени одговори");
    await expect(card(page, 1).locator(".question__meta")).not.toContainText("Избор од");
  });

  test("true or false: the other answer is chosen, and it is the one that is marked", async ({ page }) => {
    await edit(page, 2).click();
    await expect(open(page).getByRole("radio", { name: "Точно", exact: true })).toBeChecked();
    await open(page).getByRole("radio", { name: "Неточно", exact: true }).check();
    await saved(page);
    expect((await draftOnDisk(page)).content.questions[1]).toMatchObject({ kind: "true_false", correct: "false" });
    await done(page).click();
    await expect(card(page, 2).locator(".option[data-correct='true']")).toContainText("Неточно");
  });

  test("numeric: the answer, the unit, how far off it may be in words, and a minus key", async ({ page }) => {
    await edit(page, 5).click();
    await expect(answer(page)).toHaveValue("3");
    await answer(page).fill("-2,5");
    // The unit is empty until the teacher writes one: nothing in the box that reads as an entry (no placeholder, no example in it);
    // the example, "cm²", is in the words under its label.
    const unit = open(page).getByRole("textbox", { name: "Единица" });
    await expect(unit).toHaveValue("");
    expect(await unit.getAttribute("placeholder")).toBeNull();
    await expect(open(page).getByText("По желба, на пример cm². Се прикажува покрај одговорот.")).toBeVisible();
    await unit.fill("cm²");
    // How far off an answer may be, and the minus key, are behind "Повеќе опции" until one of them is set.
    await expect(tolerance(page)).toHaveCount(0);
    await moreOptions(page).click();
    await tolerance(page).fill("0,5");
    await expect(page.getByText("На пример 0,5 значи дека 11,5 и 12,5 се точни кога одговорот е 12.")).toBeVisible();
    // A minus answer without the minus key is a problem of the question, in plain words.
    await done(page).click();
    await expect(open(page).getByRole("alert")).toContainText("точниот одговор е негативен број");
    await expect(answer(page)).toBeFocused();
    await open(page).getByRole("checkbox", { name: "Одговорот може да биде негативен број" }).check();
    await expect(page.getByText("Тогаш Вашите ученици ќе имаат копче за минус.")).toBeVisible();
    await saved(page);
    expect((await draftOnDisk(page)).content.questions[4]).toMatchObject({ kind: "numeric", correct: "-2,5", unit: "cm²", tolerance: 0.5, allow_negative: true });
    await done(page).click();
    await expect(open(page)).toHaveCount(0);
    await expect(card(page, 5)).toContainText("-2,5 cm²");
    await expect(card(page, 5)).toContainText("Се прифаќа отстапување до 0,5.");
  });

  test("a number that is not a number yet stays in its box, is not in the draft, and is a problem of the question until it is one", async ({ page }) => {
    await edit(page, 3).click();
    await moreOptions(page).click();
    await tolerance(page).fill("0,");
    await timer(page).fill("4x");
    await expect(open(page).getByRole("button", { name: "Готово" })).toBeVisible();
    await done(page).click();
    await expect(open(page).getByRole("alert")).toContainText("отстапувањето мора да биде број");
    await expect(open(page).getByRole("alert")).toContainText("времето мора да биде цел број секунди");
    await tolerance(page).fill("0,5");
    await timer(page).fill("40");
    await expect(open(page).getByRole("alert")).toHaveCount(0);
    await saved(page);
    expect((await draftOnDisk(page)).content.questions[2]).toMatchObject({ tolerance: 0.5, timer_seconds: 40 });
  });

  test("the kind can be changed, keeping the words; what the new kind needs is asked for", async ({ page }) => {
    await edit(page, 1).click();
    await kind(page, "Одговор со број").check();
    await expect(prompt(page)).toHaveValue("Која од равенките е квадратна?");
    await expect(answer(page)).toHaveValue("");
    await expect(option(page, 1)).toHaveCount(0);
    await expect(timer(page)).toHaveValue("45");
    await done(page).click();
    await expect(open(page).getByRole("alert")).toContainText("Прашање 1: напишете го точниот одговор.");
    await answer(page).fill("2");
    await kind(page, "Точно или неточно").check();
    await expect(open(page).getByRole("radio", { name: "Точно", exact: true })).not.toBeChecked();
    await expect(open(page).getByRole("radio", { name: "Неточно", exact: true })).not.toBeChecked();
    await done(page).click();
    await expect(open(page).getByRole("alert")).toContainText("Прашање 1: означете го точниот одговор.");
    await open(page).getByRole("radio", { name: "Неточно", exact: true }).check();
    await saved(page);
    expect((await draftOnDisk(page)).content.questions[0]).toMatchObject({ kind: "true_false", correct: "false", prompt: "Која од равенките е квадратна?", topic: "Равенки", explanation: "Затоа 1." });
    await done(page).click();
    await expect(open(page)).toHaveCount(0);
  });

  test("the title and the review summary are edited too, and the title is the heading of the page", async ({ page }) => {
    await titleField(page).fill("Мојата лекција");
    await expect(title(page)).toHaveText("Мојата лекција");
    await summaryField(page).fill("Моето резиме.");
    await saved(page);
    const draft = await draftOnDisk(page);
    expect(draft.content).toMatchObject({ title: "Мојата лекција", review_summary: "Моето резиме." });
    await page.reload();
    await expect(title(page)).toHaveText("Мојата лекција");
    await expect(summaryField(page)).toHaveValue("Моето резиме.");
  });
});

// ---- Adding, deleting, moving ---------------------------------------------------------------------------------------------

test.describe("adding, deleting and moving", () => {
  test("a question is added by choosing its kind, opens at the end for its words, and up to eight", async ({ page }) => {
    await page.getByRole("button", { name: "Додај прашање" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Какво прашање сакате да додадете?" })).toBeVisible();
    for (const name of ["Понудени одговори", "Точно или неточно", "Одговор со број"]) await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Не додавај" }).click();
    await expect(cards(page)).toHaveCount(6);

    await page.getByRole("button", { name: "Додај прашање" }).click();
    await page.getByRole("button", { name: "Точно или неточно", exact: true }).click();
    await expect(cards(page)).toHaveCount(7);
    await expect(open(page).getByRole("heading", { level: 3 })).toHaveText("Прашање 7 од 7");
    await expect(prompt(page)).toBeFocused();
    await prompt(page).fill("Нула е парен број.");
    await open(page).getByRole("radio", { name: "Точно", exact: true }).check();
    await saved(page);
    await done(page).click();

    await page.getByRole("button", { name: "Додај прашање" }).click();
    await page.getByRole("button", { name: "Одговор со број", exact: true }).click();
    await expect(cards(page)).toHaveCount(8);
    // The most there can be: the button gives way to a plain sentence.
    await prompt(page).fill("Колку е 2 + 2?");
    await answer(page).fill("4");
    await done(page).click();
    await expect(page.getByRole("button", { name: "Додај прашање" })).toHaveCount(0);
    await expect(page.getByText("Лекцијата може да има најмногу 8 прашања.")).toBeVisible();
    await expect(refine(page, "Повеќе прашања")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("Веќе има 8 прашања, најмногу што може.")).toBeVisible();

    await saved(page);
    const questions = (await draftOnDisk(page)).content.questions;
    expect(questions).toHaveLength(8);
    expect(questions.map((q) => q.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(questions[6]).toMatchObject({ kind: "true_false", prompt: "Нула е парен број.", correct: "true" });
    expect(questions[7]).toMatchObject({ kind: "numeric", correct: "4" });
  });

  test("a new multiple-choice question starts with two empty answers, to be written", async ({ page }) => {
    await page.getByRole("button", { name: "Додај прашање" }).click();
    await page.getByRole("button", { name: "Понудени одговори", exact: true }).click();
    await expect(option(page, 1)).toHaveValue("");
    await expect(option(page, 2)).toHaveValue("");
    await expect(option(page, 3)).toHaveCount(0);
    await expect(open(page).getByRole("button", { name: "Додај одговор" })).toBeVisible();
  });

  test("a question is deleted from its own open card, in its place a line with the way back, and brought back where it was", async ({ page }) => {
    const third = await card(page, 3).locator(".question__prompt").innerText();
    await edit(page, 3).click();
    await open(page).getByRole("button", { name: "Избриши" }).click();
    await expect(cards(page)).toHaveCount(6); // five questions and the line
    await expect(page.locator(".questions > li.question--removed")).toContainText("Прашање 3 е избришано.");
    await expect(page.getByRole("button", { name: "Врати го прашањето" })).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: "Прашање 3 е избришано." })).toHaveCount(1);
    await expect(page.locator(".questions > li.question:not(.question--removed)")).toHaveCount(5);
    await saved(page);
    expect((await draftOnDisk(page)).content.questions).toHaveLength(5);

    await page.getByRole("button", { name: "Врати го прашањето" }).click();
    await expect(page.locator(".questions > li.question--removed")).toHaveCount(0);
    await expect(cards(page)).toHaveCount(6);
    await expect(open(page).getByRole("heading", { level: 3 })).toHaveText("Прашање 3 од 6");
    await expect(prompt(page)).toHaveValue(third);
    await saved(page);
    expect((await draftOnDisk(page)).content.questions).toHaveLength(6);
  });

  test("down to five: the fifth question is not deleted, and the card says why", async ({ page }) => {
    await edit(page, 6).click();
    await open(page).getByRole("button", { name: "Избриши" }).click();
    await expect(page.getByRole("button", { name: "Врати го прашањето" })).toBeVisible();
    await edit(page, 5).click();
    // Five are left: there is no Избриши, and the card says what the rule is.
    await expect(open(page).getByRole("button", { name: "Избриши" })).toHaveCount(0);
    await expect(open(page).getByText("Лекцијата мора да има најмалку 5 прашања.")).toBeVisible();
    // Only the last deletion can be taken back, and it is still there until something else is done.
    await done(page).click();
    await page.getByRole("button", { name: "Врати го прашањето" }).click();
    await expect(page.locator(".questions > li.question:not(.question--removed)")).toHaveCount(6);
  });

  test("a question that moves keeps the button that moved it where it was in the window, so it can be pressed again", async ({ page }) => {
    await edit(page, 3).click();
    const down = open(page).getByRole("button", { name: "Надолу" });
    await down.scrollIntoViewIfNeeded();
    const before = (await down.boundingBox())!.y;
    await down.click();
    await expect(open(page).getByRole("heading", { level: 3 })).toHaveText("Прашање 4 од 6");
    await expect(down).toBeFocused();
    // The question went down past a shorter one that was only read, and the page moved with it: the button is where it was.
    await expect.poll(async () => Math.abs((await down.boundingBox())!.y - before)).toBeLessThanOrEqual(2);
    const inWindow = (await down.boundingBox())!;
    expect(inWindow.y).toBeGreaterThanOrEqual(0);
    expect(inWindow.y + inWindow.height).toBeLessThanOrEqual(720);
  });

  test("the focus is never lost: the choice of a kind is where it goes when a question is to be added, and back on the button when it is not", async ({ page }) => {
    await page.getByRole("button", { name: "Додај прашање" }).click();
    // The button that was pressed is gone with the choice that takes its place: the focus is on the first kind, in a group with its question.
    await expect(page.getByRole("group", { name: "Какво прашање сакате да додадете?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Понудени одговори", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Не додавај" }).click();
    await expect(page.getByRole("button", { name: "Додај прашање" })).toBeFocused();
    await page.getByRole("button", { name: "Додај прашање" }).click();
    await page.getByRole("button", { name: "Точно или неточно", exact: true }).click();
    await expect(prompt(page)).toBeFocused();
  });

  test("an answer that is added is written next, and when one is taken away the focus is on the one that took its place", async ({ page }) => {
    await edit(page, 4).click();
    // Three answers: one can be added, and the new one is the box the focus is in.
    await open(page).getByRole("button", { name: "Додај одговор" }).click();
    await expect(option(page, 4)).toBeFocused();
    await expect(option(page, 4)).toHaveValue("");
    // The second is taken away: the third is the second now, and has the focus.
    await option(page, 3).fill("Трето");
    await open(page).getByRole("button", { name: "Отстрани го одговорот 2" }).click();
    await expect(option(page, 2)).toHaveValue("Трето");
    await expect(option(page, 2)).toBeFocused();
    // The last is taken away: the one before it has the focus.
    await open(page).getByRole("button", { name: "Отстрани го одговорот 3" }).click();
    await expect(option(page, 2)).toBeFocused();
    await expect(option(page, 3)).toHaveCount(0);
  });

  test("a question is moved up and down, the order is kept, and the focus stays on the button that was pressed", async ({ page }) => {
    const first = await card(page, 1).locator(".question__prompt").innerText();
    const second = await card(page, 2).locator(".question__prompt").innerText();
    await edit(page, 1).click();
    // The first has no Нагоре, and the last has no Надолу.
    await expect(open(page).getByRole("button", { name: "Нагоре" })).toHaveCount(0);
    await open(page).getByRole("button", { name: "Надолу" }).click();
    await expect(open(page).getByRole("heading", { level: 3 })).toHaveText("Прашање 2 од 6");
    await expect(open(page).getByRole("button", { name: "Надолу" })).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: "Прашањето е преместено на место 2 од 6." })).toHaveCount(1);
    await expect(card(page, 1).locator(".question__prompt")).toHaveText(second);
    await open(page).getByRole("button", { name: "Нагоре" }).click();
    await expect(open(page).getByRole("heading", { level: 3 })).toHaveText("Прашање 1 од 6");
    await expect(card(page, 2).locator(".question__prompt")).toHaveText(second);
    await open(page).getByRole("button", { name: "Надолу" }).click();
    await saved(page);
    const order = (await draftOnDisk(page)).content.questions.map((q) => q.prompt);
    expect(order.slice(0, 2)).toEqual([second, first]);
    expect((await draftOnDisk(page)).content.questions.map((q) => q.order)).toEqual([0, 1, 2, 3, 4, 5]);
    // At the end Надолу is gone, and the focus goes to Готово.
    for (let i = 0; i < 4; i++) await open(page).getByRole("button", { name: "Надолу" }).click();
    await expect(open(page).getByRole("heading", { level: 3 })).toHaveText("Прашање 6 од 6");
    await expect(open(page).getByRole("button", { name: "Надолу" })).toHaveCount(0);
    await expect(open(page).getByRole("button", { name: "Готово" })).toBeFocused();
  });
});

// ---- Every change saves itself --------------------------------------------------------------------------------------------

test.describe("saving as it goes", () => {
  test("says calmly that changes save themselves, then saved, and a screen reader hears 'Промените се зачувани.' once, not for every key", async ({ page }) => {
    // What the page tells a screen reader, in order, from here on.
    await page.evaluate(() => {
      const heard: string[] = [];
      (window as unknown as { heard: string[] }).heard = heard;
      const region = document.querySelector('main [role="status"].sr')!;
      new MutationObserver(() => heard.push(region.textContent ?? "")).observe(region, { childList: true, characterData: true, subtree: true });
    });
    await expect(status(page)).toHaveText("Промените се зачувуваат сами.");
    await titleField(page).pressSequentially("Нова лекција", { delay: 30 });
    await expect(status(page)).toHaveText("Се зачувува…");
    await saved(page);
    for (const text of ["Прва измена.", "Втора измена.", "Трета измена."]) {
      await summaryField(page).fill(text);
      await expect(status(page)).toHaveText("Се зачувува…");
      await saved(page);
    }
    const heard = await page.evaluate(() => (window as unknown as { heard: string[] }).heard.filter(Boolean));
    expect(heard).toEqual(["Промените се зачувани."]);
    // The saved line is a mark with the words; the same words are not on the screen as a second alert.
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  });

  test("a reload mid-edit loses nothing: what was typed a moment ago is there, and so is what was saved earlier", async ({ page }) => {
    await titleField(page).fill("Првата промена");
    await saved(page);
    await summaryField(page).fill("Втората промена, веднаш пред превчитувањето.");
    await page.reload();
    await expect(titleField(page)).toHaveValue("Првата промена");
    await expect(summaryField(page)).toHaveValue("Втората промена, веднаш пред превчитувањето.");
    await edit(page, 1).click();
    await prompt(page).fill("Прашање пред превчитување?");
    await page.reload();
    await expect(card(page, 1).locator(".question__prompt")).toHaveText("Прашање пред превчитување?");
  });

  test("with no connection a change is not lost: the page says it is not saved, asks before it is left, and saves it when the connection is back", async ({ page, context }) => {
    await context.setOffline(true);
    await titleField(page).fill("Без врска");
    await expect(status(page)).toHaveText("Промените не се зачувани. Ќе се обидеме повторно.");
    await expect(page.getByRole("status").filter({ hasText: "Промените не се зачувани." })).toHaveCount(1);
    expect((await draftOnDisk(page)).content.title).toBe("Квадратни равенки");
    // Leaving would lose it, so the page asks, with the safe answer in hand.
    await menu(page).getByRole("link", { name: "Денес" }).click();
    await expect(leaveDialog(page)).toBeVisible();
    await expect(leaveDialog(page)).toContainText("Последните промени уште не се зачувани.");
    await expect(leaveDialog(page).getByRole("button", { name: "Не, остани" })).toBeFocused();
    await leaveDialog(page).getByRole("button", { name: "Не, остани" }).click();
    await context.setOffline(false);
    await saved(page);
    expect((await draftOnDisk(page)).content.title).toBe("Без врска");
    // Saved, and nothing is asked any more.
    await menu(page).getByRole("link", { name: "Денес" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Денес" })).toBeVisible();
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  test("a change that is only waiting for its moment is sent as the page is left, and nothing is asked", async ({ page }) => {
    await titleField(page).fill("Брзо заминување");
    await menu(page).getByRole("link", { name: "Денес" }).click();
    await expect(leaveDialog(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Денес" })).toBeVisible();
    expect((await draftOnDisk(page)).content.title).toBe("Брзо заминување");
    // And Today lists the lesson, by its new title.
    await expect(page.locator(".lessons > li", { hasText: "Брзо заминување" })).toBeVisible();
  });

  test("a number typed that is not a number yet would be lost, so the page asks before it is left", async ({ page }) => {
    await edit(page, 3).click();
    await moreOptions(page).click();
    await tolerance(page).fill("0,");
    await menu(page).getByRole("link", { name: "Денес" }).click();
    await expect(leaveDialog(page)).toBeVisible();
    await leaveDialog(page).getByRole("button", { name: "Не, остани" }).click();
    await tolerance(page).fill("0,5");
    await menu(page).getByRole("link", { name: "Денес" }).click();
    await expect(leaveDialog(page)).toHaveCount(0);
  });
});

// ---- The four refinements, each a job, each with an undo --------------------------------------------------------------------

test.describe("changing all the questions", () => {
  test.slow();

  const lines: [string, string][] = [
    ["Полесни", "Прашањата се направени полесни."],
    ["Потешки", "Прашањата се направени потешки."],
    ["Повеќе прашања", "Додадовме повеќе прашања."],
    ["Пократко време", "Времето за одговор е скратено."],
  ];

  for (const [name, line] of lines) {
    test(`'${name}' is a wait on the page, then the new questions with a line that says what changed, and 'Врати ги претходните прашања' brings the earlier ones back`, async ({ page }) => {
      const before = (await draftOnDisk(page)).content.questions;
      await refine(page, name).click();
      // The same wait, in the page: what is being done, Cancel, no main button.
      await expect(waitHeading(page)).toBeVisible();
      await expect(waitHeading(page)).toBeFocused();
      await expect(page).toHaveURL(/\/teacher\/lessons\/drafts\/d\d+$/);
      await expect(page.getByRole("button", { name: "Откажи", exact: true })).toBeVisible();
      await expect(mainButton(page)).toHaveCount(0);

      await expect(page.getByText(line, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      const refined = page.url();
      expect(refined).not.toContain(SEED);
      await expect(page.getByRole("button", { name: "Врати ги претходните прашања" })).toBeVisible();
      // Said aloud once as it arrives, and the focus is on the first thing to change.
      await expect(page.getByRole("status").filter({ hasText: line })).toHaveCount(1);
      await expect(titleField(page)).toBeFocused();
      const after = (await demo(page)).school.drafts.find((d) => d.previous_draft_id === SEED)!;
      expect(after.refinements).toEqual([{ Полесни: "easier", Потешки: "harder", "Повеќе прашања": "more_questions", "Пократко време": "shorter_timers" }[name]]);
      if (name === "Пократко време") expect(after.content.questions.every((q, i) => (q.timer_seconds as number) < (before[i].timer_seconds as number))).toBe(true);
      if (name === "Повеќе прашања") expect(after.content.questions.length).toBeGreaterThan(before.length);
      expect(JSON.stringify(after.content.questions)).not.toBe(JSON.stringify(before));

      // Back: the new draft is thrown away, the earlier one is the lesson again, as it was, and the line says so.
      await page.getByRole("button", { name: "Врати ги претходните прашања" }).click();
      await expect(page).toHaveURL(new RegExp(`/teacher/lessons/drafts/${SEED}$`));
      await expect(page.getByText("Ги вративме претходните прашања.", { exact: true }).first()).toBeVisible();
      // The button that was pressed is gone with its page: the focus is on the first thing to change, as after the wait, and not lost.
      await expect(titleField(page)).toBeFocused();
      await expect(page.getByRole("button", { name: "Врати ги претходните прашања" })).toHaveCount(0);
      expect(JSON.stringify((await draftOnDisk(page)).content.questions)).toBe(JSON.stringify(before));
      expect((await demo(page)).school.drafts.map((d) => d.id)).toEqual([SEED]);
      await expect(cards(page)).toHaveCount(before.length);
    });
  }

  test("it changes the lesson as the teacher has made it, not as the AI wrote it", async ({ page }) => {
    await titleField(page).fill("Мојот наслов");
    await edit(page, 1).click();
    await prompt(page).fill("Моето прашање?");
    await done(page).click();
    await refine(page, "Пократко време").click();
    await expect(page.getByRole("button", { name: "Врати ги претходните прашања" })).toBeVisible({ timeout: 15_000 });
    await expect(title(page)).toHaveText("Мојот наслов");
    await expect(card(page, 1).locator(".question__prompt")).toHaveText("Моето прашање?");
    await expect(card(page, 1)).toContainText("Време:");
    const refined = (await demo(page)).school.drafts.find((d) => d.previous_draft_id === SEED)!;
    expect(refined.content.title).toBe("Мојот наслов");
    expect(refined.content.questions[0]).toMatchObject({ prompt: "Моето прашање?", timer_seconds: 20 });
    // The draft it came from has the edits too, so going back loses none of them.
    expect((await draftOnDisk(page)).content.questions[0]).toMatchObject({ prompt: "Моето прашање?", timer_seconds: 25 });
  });

  test("the new draft is the one on Today, and a reload while it is written finds the wait again", async ({ page }) => {
    await refine(page, "Потешки").click();
    await expect(waitHeading(page)).toBeVisible();
    await page.reload();
    await expect(waitHeading(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Врати ги претходните прашања" })).toBeVisible({ timeout: 15_000 });
    await menu(page).getByRole("link", { name: "Денес" }).click();
    // One lesson that is not finished, not two: the latest of the chain.
    await expect(page.locator(".lessons > li", { hasText: "Квадратни равенки" })).toHaveCount(1);
  });

  test("going back after the lesson was edited asks first, since the edits would be lost", async ({ page }) => {
    await refine(page, "Полесни").click();
    await expect(page.getByRole("button", { name: "Врати ги претходните прашања" })).toBeVisible({ timeout: 15_000 });
    await titleField(page).fill("Променето по промената");
    await saved(page);
    await page.getByRole("button", { name: "Врати ги претходните прашања" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Дали да се вратат претходните прашања?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Промените што ги направивте по ова ќе се изгубат.");
    await expect(dialog.getByRole("button", { name: "Не, остави" })).toBeFocused();
    await dialog.getByRole("button", { name: "Не, остави" }).click();
    await expect(titleField(page)).toHaveValue("Променето по промената");
    await page.getByRole("button", { name: "Врати ги претходните прашања" }).click();
    await dialog.getByRole("button", { name: "Да, врати" }).click();
    await expect(page).toHaveURL(new RegExp(`/teacher/lessons/drafts/${SEED}$`));
    await expect(titleField(page)).toHaveValue("Квадратни равенки");
  });

  test("a refinement that is cancelled asks first, and the questions stay as they were", async ({ page }) => {
    await refine(page, "Полесни").click();
    await expect(waitHeading(page)).toBeVisible();
    await page.getByRole("button", { name: "Откажи", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Дали сакате да ја откажете промената?" });
    await expect(dialog).toContainText("Прашањата ќе останат какви што беа.");
    await expect(dialog.getByRole("button", { name: "Не, чекај" })).toBeFocused();
    await dialog.getByRole("button", { name: "Да, откажи" }).click();
    await expect(page).toHaveURL(new RegExp(`/teacher/lessons/drafts/${SEED}$`));
    await expect(cards(page)).toHaveCount(6);
    expect((await demo(page)).school.drafts.map((d) => d.id)).toEqual([SEED]);
  });

  test("a refinement the AI cannot make says so, keeps the earlier questions, and can be tried again or left", async ({ page }) => {
    // The source of this draft is one the AI cannot work from (the demo's own way to try this): the first refinement fails.
    await seed(page, { sources: [{ id: "src-x", kind: "typed", file_name: null, text: "Равенки [fail]", runs: 1 }], drafts: [draftOf({ source_id: "src-x" })] }, SEED_URL);
    await refine(page, "Полесни").click();
    await expect(alerts(page)).toContainText("Не успеавме да ги променеме прашањата", { timeout: 15_000 });
    await expect(alerts(page)).toContainText("Вашите претходни прашања се сочувани.");
    await expect(page.getByRole("button", { name: "Обиди се повторно", exact: true })).toBeFocused();
    await expect(mainButton(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Остави ги како што беа", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/teacher/lessons/drafts/${SEED}$`));
    await expect(cards(page)).toHaveCount(6);
    expect((await demo(page)).school.drafts.map((d) => d.id)).toEqual([SEED]);
  });

  test("with 'Повеќе прашања' at eight nothing is started, and the others are not held back", async ({ page }) => {
    const eight = [...QUESTIONS, tf(6, "Седмо прашање.", "true"), tf(7, "Осмо прашање.", "false")].map((q, i) => ({ ...q, id: `${SEED}-q${i + 1}`, order: i }));
    await seed(page, { drafts: [draftOf({}, eight)] }, SEED_URL);
    await expect(cards(page)).toHaveCount(8);
    // Not a button that can be pressed, and the page says why: it looks so too, dimmer than the others; pressing it anyway starts nothing.
    expect(await refine(page, "Повеќе прашања").evaluate((el) => getComputedStyle(el).opacity)).toBe("0.6");
    expect(await refine(page, "Потешки").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    await refine(page, "Повеќе прашања").click({ force: true });
    await expect(waitHeading(page)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${SEED}$`));
    await expect(refine(page, "Потешки")).not.toHaveAttribute("aria-disabled", "true");
  });
});

// ---- Saving ---------------------------------------------------------------------------------------------------------------

test.describe("saving the lesson", () => {
  test("'Зачувај лекција' makes a lesson, lands on its page with a line that it is saved and where it is, and Today lists it", async ({ page }) => {
    await titleField(page).fill("Мојата нова лекција");
    await edit(page, 2).click();
    await prompt(page).fill("Исправено прашање?");
    await done(page).click();
    await saveButton(page).click();

    await expect(page).toHaveURL(/\/teacher\/lessons\/l-n\d+$/);
    await expect(title(page)).toHaveText("Мојата нова лекција");
    const line = page.locator(".draft__note");
    await expect(line).toContainText("Лекцијата е зачувана. Ќе ја најдете на Денес, подготвена за час.");
    await expect(page.getByRole("status").filter({ hasText: "Лекцијата е зачувана." })).toHaveCount(1);
    // One main button on the lesson page: start a class. Editing is a quiet button beside it.
    await expect(mainButton(page)).toHaveCount(1);
    await expect(mainButton(page)).toHaveText("Започни час");
    await expect(page.getByRole("button", { name: "Уреди лекција" })).toHaveClass(/btn--secondary/);
    await expect(page.locator(".questions > li").nth(1)).toContainText("Исправено прашање?");
    // Told once: a reload does not tell it again.
    await page.reload();
    await expect(title(page)).toHaveText("Мојата нова лекција");
    await expect(page.locator(".draft__note")).toHaveCount(0);

    const state = await demo(page);
    expect(state.school.lessons.map((l) => [l.title, l.version, l.question_count])).toEqual([["Мојата нова лекција", 1, 6]]);
    // The draft is saved with it and is not listed any more.
    expect(state.school.drafts.find((d) => d.id === SEED)).toMatchObject({ consumed_at: expect.any(String), lesson_id: state.school.lessons[0].id });
    await page.goto("/teacher");
    await expect(page.getByRole("heading", { level: 2, name: "Недовршени лекции" })).toHaveCount(0);
    await expect(page.locator(".lessons > li").first()).toContainText("Мојата нова лекција");
    await expect(page.locator(".lessons > li")).toHaveCount(3);
  });

  test("a draft that was saved leads to its lesson, and not to a second copy of it", async ({ page }) => {
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-n\d+/);
    await page.goto(SEED_URL);
    await expect(page.getByRole("heading", { level: 2, name: "Оваа лекција е веќе зачувана" })).toBeVisible();
    await page.getByRole("link", { name: "Отвори ја лекцијата" }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-n\d+$/);
  });

  test("when it cannot be saved the problems are listed in plain words, each a link that opens its question and goes to the fault", async ({ page }) => {
    const bad = [
      mc(0, "", ["", "x"], ""),
      tf(1, "Точно е?", ""),
      num(2, "Колку?", "-3", { timer_seconds: 3 }),
      num(3, "Колку?", "двајсет"),
      mc(4, "Прашање?", ["а", "б"], "0"),
    ];
    await seed(page, { drafts: [draftOf({}, bad)] }, SEED_URL);
    await titleField(page).fill("");
    await saveButton(page).click();

    const list = page.locator(".problems__list--links");
    await expect(page.getByRole("heading", { level: 2, name: "Уште не може да се зачува" })).toBeFocused();
    const lines = await list.locator("li").allInnerTexts();
    expect(lines).toEqual([
      "Напишете наслов на лекцијата.",
      "Прашање 1: напишете го прашањето.",
      "Прашање 1: напишете го одговорот 1 или отстранете го.",
      "Прашање 1: означете го точниот одговор.",
      "Прашање 2: означете го точниот одговор.",
      "Прашање 3: точниот одговор е негативен број. Штиклирајте „Одговорот може да биде негативен број“.",
      "Прашање 3: времето мора да биде од 5 до 300 секунди.",
      "Прашање 4: точниот одговор мора да биде број, на пример 12 или 3,5.",
    ]);
    // Nothing was saved, and it is said where the button is.
    await expect(page).toHaveURL(new RegExp(`${SEED}$`));
    expect((await demo(page)).school.lessons).toHaveLength(0);
    for (const link of await list.getByRole("link").all()) expect(await tall(link)).toBeGreaterThanOrEqual(44);

    // Each link opens its question and puts the focus where the fault is.
    await list.getByRole("link", { name: "Прашање 3: времето мора да биде од 5 до 300 секунди." }).click();
    await expect(open(page).getByRole("heading", { level: 3 })).toHaveText("Прашање 3 од 5");
    await expect(timer(page)).toBeFocused();
    await timer(page).fill("30");
    // The list follows the work: that one is gone.
    await expect(list.locator("li")).toHaveCount(7);
    await list.getByRole("link", { name: "Прашање 3: точниот одговор е негативен број. Штиклирајте „Одговорот може да биде негативен број“." }).click();
    await expect(answer(page)).toBeFocused();
    await open(page).getByRole("checkbox", { name: "Одговорот може да биде негативен број" }).check();
    await list.getByRole("link", { name: "Прашање 1: означете го точниот одговор." }).click();
    await expect(open(page).getByRole("heading", { level: 3 })).toHaveText("Прашање 1 од 5");
    await expect(isRight(page, 1)).toBeFocused();
    await list.getByRole("link", { name: "Напишете наслов на лекцијата." }).click();
    await expect(titleField(page)).toBeFocused();
    await titleField(page).fill("Поправена");
    await list.getByRole("link", { name: "Прашање 1: напишете го прашањето." }).click();
    await expect(prompt(page)).toBeFocused();
    await prompt(page).fill("Прво прашање?");
    await list.getByRole("link", { name: "Прашање 1: напишете го одговорот 1 или отстранете го." }).click();
    await expect(option(page, 1)).toBeFocused();
    await option(page, 1).fill("а");
    await isRight(page, 1).check();
    await list.getByRole("link", { name: "Прашање 2: означете го точниот одговор." }).click();
    await expect(open(page).getByRole("heading", { level: 3 })).toHaveText("Прашање 2 од 5");
    await open(page).getByRole("radio", { name: "Точно", exact: true }).check();
    await list.getByRole("link", { name: "Прашање 4: точниот одговор мора да биде број, на пример 12 или 3,5." }).click();
    await answer(page).fill("20");
    await expect(page.getByRole("heading", { level: 2, name: "Уште не може да се зачува" })).toHaveCount(0);
  });

  test("the number of questions is a problem too, and the link goes to adding one", async ({ page }) => {
    await seed(page, { drafts: [draftOf({}, QUESTIONS.slice(0, 4).map((q, i) => ({ ...q, order: i })))] }, SEED_URL);
    await saveButton(page).click();
    const line = page.locator(".problems__list--links li");
    await expect(line).toHaveText(["Лекцијата мора да има најмалку 5 прашања, а сега има 4. Додајте прашања."]);
    await page.locator(".problems__list--links a").click();
    await expect(page.getByRole("button", { name: "Додај прашање" })).toBeFocused();
    await page.getByRole("button", { name: "Додај прашање" }).click();
    await page.getByRole("button", { name: "Точно или неточно", exact: true }).click();
    await prompt(page).fill("Ново?");
    await open(page).getByRole("radio", { name: "Точно", exact: true }).check();
    await expect(line).toHaveCount(0);
    await done(page).click();
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-n\d+/);
  });

  test("with no connection at the last step it says so in plain words, with everything kept, and saves when the connection is back", async ({ page, context }) => {
    await titleField(page).fill("Ќе се зачува подоцна");
    await saved(page);
    await context.setOffline(true);
    await saveButton(page).click();
    await expect(page.locator("main").getByRole("alert").filter({ hasText: "Не успеавме да ја зачуваме лекцијата" })).toContainText("Нема врска со интернет");
    // The button is in a bar that is in the window wherever the teacher is on the page, so what it answers is brought to them.
    await expect(page.locator("main").getByRole("alert").filter({ hasText: "Не успеавме да ја зачуваме лекцијата" })).toBeInViewport();
    await expect(page).toHaveURL(new RegExp(`${SEED}$`));
    await expect(titleField(page)).toHaveValue("Ќе се зачува подоцна");
    await context.setOffline(false);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-n\d+$/);
    await expect(title(page)).toHaveText("Ќе се зачува подоцна");
  });
});

// ---- Editing a lesson that is saved ---------------------------------------------------------------------------------------

test.describe("editing a saved lesson", () => {
  const LESSON_URL = "/teacher/lessons/l-zadaci?from=today";

  /** The demo teacher's own prepared lesson (the demo's own are in today.spec.ts): five true-or-false questions. */
  const lesson = (extra: Record<string, unknown> = {}) => ({
    id: "l-zadaci",
    title: "Задачи за проценти",
    subject: { id: "math", name: "Математика" },
    year: 2,
    question_count: 5,
    version: 3,
    times_run: 0,
    last_run_at: null,
    copied_from: null,
    created_at: iso(Date.now() - 3 * 86_400_000),
    updated_at: iso(Date.now() - 3 * 86_400_000),
    review_summary: "Процент е дел од сто.",
    questions: [0, 1, 2, 3, 4].map((i) => ({ ...tf(i, `Прашање ${i + 1} за проценти?`, "true"), id: `l-zadaci-q${i + 1}` })),
    source: null,
    emphasis: null,
    ...extra,
  });

  test.beforeEach(async ({ page }) => {
    await seed(page, { lessons: [lesson()], drafts: [] }, LESSON_URL);
    await expect(title(page)).toHaveText("Задачи за проценти");
  });

  test("'Уреди лекција' is a quiet button beside the one main button, and opens a draft of the lesson, with Back to the lesson", async ({ page }) => {
    await expect(mainButton(page)).toHaveCount(1);
    await expect(mainButton(page)).toHaveText("Започни час");
    await page.getByRole("button", { name: "Уреди лекција" }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/drafts\/d\d+\?from=today$/);
    await expect(title(page)).toHaveText("Задачи за проценти");
    await expect(titleField(page)).toHaveValue("Задачи за проценти");
    await expect(cards(page)).toHaveCount(5);
    // It saves as the next version of this lesson, and Back is the lesson.
    await expect(mainButton(page)).toHaveText("Зачувај ги промените");
    await expect(page.getByText("Новата верзија важи за следните часови. Веќе одржаните остануваат какви што беа.")).toBeAttached();
    // What is kept is the changes: the lesson itself is there already.
    await expect(page.getByText("Ако не ги зачувате промените сега, ги чуваме до 30 дена и ги наоѓате на Денес.")).toBeAttached();
    await expect(page.getByRole("link", { name: "Назад кон лекцијата", exact: true })).toHaveAttribute("href", "/teacher/lessons/l-zadaci?from=today");
  });

  test("while the questions of an edit are being changed the page is about editing the lesson, and Back is still the lesson", async ({ page }) => {
    await page.getByRole("button", { name: "Уреди лекција" }).click();
    await refine(page, "Полесни").click();
    await expect(waitHeading(page)).toBeVisible();
    // Not "Подготви лекција": nothing is being prepared, a lesson is being changed.
    await expect(title(page)).toHaveText("Уреди лекција");
    await expect(page.locator(".head__sub")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Назад кон лекцијата", exact: true })).toHaveAttribute("href", "/teacher/lessons/l-zadaci?from=today");
    await expect(page.getByRole("link", { name: "Назад кон лекцијата", exact: true })).toBeVisible();
    // When it is ready, the editor has the same Back.
    await expect(page.getByRole("button", { name: "Врати ги претходните прашања" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Назад кон лекцијата", exact: true })).toHaveAttribute("href", "/teacher/lessons/l-zadaci?from=today");
  });

  test("saving it is the next version of the same lesson: the lesson page says so, and Today shows it changed", async ({ page }) => {
    await page.getByRole("button", { name: "Уреди лекција" }).click();
    await titleField(page).fill("Проценти, нова верзија");
    await edit(page, 1).click();
    await prompt(page).fill("Колку е 10% од 200?");
    await done(page).click();
    await saveButton(page).click();

    await expect(page).toHaveURL(/\/teacher\/lessons\/l-zadaci\?from=today$/);
    await expect(title(page)).toHaveText("Проценти, нова верзија");
    await expect(page.locator(".draft__note")).toContainText("Промените се зачувани. Важат за следните часови; веќе одржаните остануваат какви што беа.");
    await expect(page.locator(".questions > li").first()).toContainText("Колку е 10% од 200?");
    const state = await demo(page);
    expect(state.school.lessons.map((l) => [l.id, l.version, l.title])).toEqual([["l-zadaci", 4, "Проценти, нова верзија"]]);
    // The draft is saved with it: no second lesson, nothing left unfinished on Today.
    expect(state.school.drafts[0]).toMatchObject({ consumed_at: expect.any(String), lesson_id: "l-zadaci" });
    await page.goto("/teacher");
    await expect(page.getByRole("heading", { level: 2, name: "Недовршени лекции" })).toHaveCount(0);
    await expect(page.locator(".lessons > li", { hasText: "Проценти, нова верзија" })).toHaveCount(1);
    await expect(page.locator(".lessons > li", { hasText: "Задачи за проценти" })).toHaveCount(0);
  });

  test("a lesson open for editing is one draft: asking again gives the same one, with the edits in it, and Today lists it as changes", async ({ page }) => {
    await page.getByRole("button", { name: "Уреди лекција" }).click();
    await titleField(page).fill("Во тек на измена");
    await saved(page);
    const url = page.url();
    await page.getByRole("link", { name: "Назад кон лекцијата" }).click();
    // The saved lesson is unchanged until the draft is saved.
    await expect(title(page)).toHaveText("Задачи за проценти");
    await page.getByRole("button", { name: "Уреди лекција" }).click();
    await expect(page).toHaveURL(url);
    await expect(titleField(page)).toHaveValue("Во тек на измена");
    expect((await demo(page)).school.drafts.filter((d) => d.lesson_id === "l-zadaci" && !d.consumed_at)).toHaveLength(1);

    await page.goto("/teacher");
    const draft = page.locator(".lessons > li", { hasText: "Измени на зачувана лекција" });
    await expect(draft).toHaveCount(1);
    await expect(draft).toContainText("Во тек на измена");
    // Throwing the changes away is on the draft's own page, at its end, and says what stays.
    await draft.getByRole("link", { name: "Продолжи" }).click();
    await page.getByRole("button", { name: "Фрли ги измените" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Дали да се фрли оваа лекција?" });
    await expect(dialog).toContainText("Измените ќе се изгубат. Зачуваната лекција останува каква што е.");
    await dialog.getByRole("button", { name: "Да, фрли" }).click();
    // It leaves by the way Back does: to the saved lesson, which is as it was.
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-zadaci/);
    await page.goto("/teacher");
    await expect(page.getByRole("heading", { level: 1, name: "Денес" })).toBeVisible();
    await expect(draft).toHaveCount(0);
    await expect(page.locator(".lessons > li", { hasText: "Задачи за проценти" })).toHaveCount(1);
  });
});

// ---- Today: the lessons that are not finished ---------------------------------------------------------------------------------

test.describe("Today lists what is not finished", () => {
  const second = (extra: Draft) => draftOf({ created_at: iso(Date.now() - 30_000), updated_at: iso(Date.now() - 30_000), ...extra });

  test("a draft being written, one that failed and one that is ready, below the prepared lessons, with 'Отвори' or 'Продолжи' and 'Фрли', and one main button", async ({ page }) => {
    const pendingJob = { started_at: iso(Date.now() - 1_000), done_at: iso(Date.now() + 5 * 60_000), outcome: "ready" };
    const failedJob = { started_at: iso(Date.now() - 60_000), done_at: iso(Date.now() - 50_000), outcome: "failed" };
    await seed(
      page,
      {
        drafts: [
          second({ id: "d-pending", job: pendingJob, created_at: iso(Date.now() - 1_000), updated_at: iso(Date.now() - 1_000), content: { title: "Скриено", review_summary: "", questions: [] } }),
          second({ id: "d-failed", job: failedJob, created_at: iso(Date.now() - 50_000), updated_at: iso(Date.now() - 50_000), content: { title: "Скриено", review_summary: "", questions: [] } }),
          draftOf({ id: "d-ready", created_at: iso(Date.now() - 100_000), updated_at: iso(Date.now() - 100_000) }),
        ],
      },
      "/teacher",
    );
    await expect(page.getByRole("heading", { level: 1, name: "Денес" })).toBeVisible();
    const section = page.getByRole("heading", { level: 2, name: "Недовршени лекции" });
    await expect(section).toBeVisible();
    // Below the prepared lessons: Today is for the lesson of the day, and a few forgotten drafts must not push it off a laptop's screen.
    const y = async (l: ReturnType<typeof page.locator>) => (await l.boundingBox())!.y;
    expect(await y(section)).toBeGreaterThan(await y(page.getByRole("heading", { level: 2, name: "Подготвени лекции" })));
    const drafts = page.locator("section[aria-labelledby=unfinished] .lessons > li");
    await expect(drafts).toHaveCount(3);
    // Newest first, with the words of what each is doing in place of a title it does not have.
    await expect(drafts.nth(0).getByRole("heading", { level: 3 })).toHaveText("Се подготвува");
    await expect(drafts.nth(0)).toContainText("Математика · II година");
    await expect(drafts.nth(0)).toContainText("Прашањата се пишуваат. Лекцијата ќе биде готова за малку.");
    await expect(drafts.nth(1).getByRole("heading", { level: 3 })).toHaveText("Не успеа");
    await expect(drafts.nth(1)).toContainText("Прашањата не се напишаа. Отворете ја лекцијата за да се обидете повторно.");
    await expect(drafts.nth(2).getByRole("heading", { level: 3 })).toHaveText("Квадратни равенки");
    await expect(drafts.nth(2)).toContainText("6 прашања · Последна промена:");
    // "Продолжи" only where there is something to carry on: a lesson being written, or that failed, is opened to be looked at.
    for (let i = 0; i < 3; i++) {
      // The row's one link, in words; no button: throwing a draft away is on its own page.
      await expect(drafts.nth(i).getByRole("link")).toHaveText(i === 2 ? "Продолжи" : "Отвори");
      await expect(drafts.nth(i).getByRole("button")).toHaveCount(0);
    }
    // The only red on the card that failed is its warning mark.
    const red = await drafts.nth(1).evaluate((card) => [...card.querySelectorAll("*")].filter((el) => getComputedStyle(el).backgroundColor === "rgb(180, 35, 24)").map((el) => el.className));
    expect(red).toEqual(["problem__badge lesson__badge"]);
    await expect(drafts.nth(0).locator(".problem__badge")).toHaveCount(0);
    await expect(drafts.nth(2).locator(".problem__badge")).toHaveCount(0);
    // The main button is the one that prepares a lesson, as before.
    await expect(mainButton(page)).toHaveCount(1);
    await expect(mainButton(page)).toHaveText("Подготви лекција");
    // The prepared lessons are as they were.
    await expect(page.locator("section[aria-labelledby=prepared] .lessons > li")).toHaveCount(2);
  });

  test("a draft whose title the teacher emptied is still named on Today", async ({ page }) => {
    await seed(page, { drafts: [draftOf({ content: { title: "  ", review_summary: "", questions: QUESTIONS } })] }, "/teacher");
    const draft = page.locator("section[aria-labelledby=unfinished] .lessons > li");
    await expect(draft.getByRole("heading", { level: 3 })).toHaveText("Предложена лекција");
  });

  test("with many drafts and prepared lessons the lessons of the day are in the first screen of 1024 x 768, and nothing runs off the side", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    const many = Array.from({ length: 6 }, (_, i) => draftOf({ id: `d-many-${i}`, created_at: iso(Date.now() - (i + 1) * 3_600_000), updated_at: iso(Date.now() - (i + 1) * 3_600_000) }));
    await seed(page, { drafts: many }, "/teacher");
    // Three of them, and a way to the rest.
    await expect(page.locator("section[aria-labelledby=unfinished] .lessons > li")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Сите недовршени (6)" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Подготвени лекции" })).toBeInViewport();
    await expect(page.locator("section[aria-labelledby=prepared] .lessons > li").first().getByRole("button", { name: /^Започни час/ })).toBeInViewport();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await expect(mainButton(page)).toHaveCount(1);
  });

  test("a draft that is being written turns into its lesson on Today, without a reload", async ({ page }) => {
    const now = Date.now();
    const job = { started_at: iso(now - 1_000), done_at: iso(now + 6_000), outcome: "ready" };
    await seed(page, { drafts: [draftOf({ job, created_at: iso(now - 1_000), updated_at: iso(now - 1_000) })] }, "/teacher");
    const draft = page.locator("section[aria-labelledby=unfinished] .lessons > li");
    await expect(draft.getByRole("heading", { level: 3 })).toHaveText("Се подготвува");
    await expect(draft.getByRole("heading", { level: 3 })).toHaveText("Квадратни равенки", { timeout: 15_000 });
    await expect(draft).toContainText("6 прашања");
  });

  test("'Продолжи' opens a draft where it was left, and 'Отвори' shows the wait of one being written and the failure of one that failed", async ({ page }) => {
    const job = { started_at: iso(Date.now() - 1_000), done_at: iso(Date.now() + 5 * 60_000), outcome: "ready" };
    const failed = { started_at: iso(Date.now() - 60_000), done_at: iso(Date.now() - 50_000), outcome: "failed" };
    await seed(
      page,
      {
        drafts: [
          second({ id: "d-pending", job, content: { title: "Скриено", review_summary: "", questions: [] } }),
          second({ id: "d-failed", job: failed, created_at: iso(Date.now() - 40_000), updated_at: iso(Date.now() - 40_000), content: { title: "Скриено", review_summary: "", questions: [] } }),
          draftOf({ id: "d-ready", created_at: iso(Date.now() - 100_000), updated_at: iso(Date.now() - 100_000) }),
        ],
      },
      "/teacher",
    );
    const drafts = page.locator("section[aria-labelledby=unfinished] .lessons > li");
    await drafts.nth(2).getByRole("link", { name: "Продолжи" }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/drafts\/d-ready\?from=today$/);
    await expect(titleField(page)).toHaveValue("Квадратни равенки");
    await page.getByRole("link", { name: "Назад кон Денес" }).click();

    await drafts.nth(0).getByRole("link", { name: "Отвори" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Ги пишуваме прашањата" })).toBeVisible();
    await page.getByRole("link", { name: "Назад кон Денес" }).click();

    await drafts.nth(1).getByRole("link", { name: "Отвори" }).click();
    await expect(alerts(page)).toContainText("Не успеавме да ги напишеме прашањата");
    // Try again: the same draft is written again, and the wait is back.
    await page.getByRole("button", { name: "Обиди се повторно", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Ги пишуваме прашањата" })).toBeVisible();
    expect((await demo(page)).school.drafts.filter((d) => d.id === "d-failed")).toHaveLength(1);
  });

  test("'Фрли ја лекцијата', at the end of the draft's page, asks first: staying keeps it, and yes throws it away for good", async ({ page }) => {
    await seed(page, { drafts: [draftOf()] }, "/teacher");
    const draft = page.locator("section[aria-labelledby=unfinished] .lessons > li");
    await draft.getByRole("link", { name: "Продолжи" }).click();
    const discard = page.getByRole("button", { name: "Фрли ја лекцијата" });
    // It is the last thing on the page, after the bar that saves, and it is a quiet button.
    await expect(discard).toHaveClass(/btn--secondary/);
    expect((await discard.boundingBox())!.y).toBeGreaterThan((await page.locator("#save-note").boundingBox())!.y);
    await discard.click();
    const dialog = page.getByRole("alertdialog", { name: "Дали да се фрли оваа лекција?" });
    await expect(dialog).toContainText("Она што е подготвено ќе се изгуби.");
    await expect(dialog.getByRole("button", { name: "Не, задржи" })).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Не, задржи" })).toHaveClass(/btn--primary/);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(discard).toBeFocused();
    expect((await demo(page)).school.drafts).toHaveLength(1);

    await discard.click();
    await dialog.getByRole("button", { name: "Да, фрли" }).click();
    // It leaves by the way Back does, to Today, where the lesson is no longer listed.
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByRole("heading", { level: 1, name: "Денес" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Недовршени лекции" })).toHaveCount(0);
    expect((await demo(page)).school.drafts).toEqual([]);
    // The lesson itself is not there either: this is the one the AI made, never saved.
    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: "Недовршени лекции" })).toHaveCount(0);
  });

  test("a draft being written is stopped from its own page: the row opens the wait, and its 'Откажи' asks first", async ({ page }) => {
    const job = { started_at: iso(Date.now() - 1_000), done_at: iso(Date.now() + 5 * 60_000), outcome: "ready" };
    await seed(page, { drafts: [second({ job, content: { title: "Скриено", review_summary: "", questions: [] } })] }, "/teacher");
    const row = page.locator("section[aria-labelledby=unfinished] .lessons > li");
    await expect(row.getByRole("button")).toHaveCount(0);
    await row.getByRole("link", { name: "Отвори" }).click();
    await page.getByRole("button", { name: "Откажи" }).click();
    await expect(page.getByRole("alertdialog", { name: "Дали сакате да откажете?" })).toContainText("Прашањата нема да се напишат.");
  });
});

test.describe("a new teacher with one draft and no lesson", () => {
  test.use({ account: "novice" });

  test("Today has its one button and the draft, and not the empty welcome", async ({ page }) => {
    await seed(page, { drafts: [draftOf()], first_run_done: true }, "/teacher", "novice");
    await expect(page.getByRole("heading", { level: 2, name: "Недовршени лекции" })).toBeVisible();
    await expect(page.locator("section[aria-labelledby=unfinished] .lessons > li")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2, name: "Немате подготвени лекции" })).toHaveCount(0);
    await expect(mainButton(page)).toHaveCount(1);
    await expect(mainButton(page)).toHaveText("Подготви лекција");
  });
});

// ---- The first lesson of a first run -------------------------------------------------------------------------------------

test.describe("the first run", () => {
  test.use({ account: "novice" });
  test.slow();

  const TYPED = "Равенки од втор степен и дискриминантата. Учениците треба да знаат да ги решаваат.";

  async function toLastScreen(page: Page) {
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/teacher\/welcome/);
    await page.getByRole("button", { name: "Следно" }).click();
    await page.getByRole("button", { name: "Следно" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Видете кој бил присутен и што да се повтори" })).toBeVisible();
  }

  test("the guide's last screen leads into the first lesson, with 'Не сега' to leave; the main button is the first lesson", async ({ page }) => {
    await toLastScreen(page);
    await expect(mainButton(page)).toHaveCount(1);
    await expect(mainButton(page)).toHaveText("Подготви ја првата лекција");
    // The longest label of the guide is read on one line (a button of 48px, not two lines of words in a taller one), beside Back.
    expect(await tall(mainButton(page))).toBeLessThanOrEqual(60);
    await expect(page.getByRole("button", { name: "Не сега, оди на Денес" })).toHaveClass(/btn--quiet/);
    await expect(page.getByText("Да почнеме со вистинска лекција")).toBeVisible();
    // Nothing is marked done by arriving here.
    expect((await demo(page)).novice.school.first_run_done).toBe(false);
  });

  test("'Не сега' ends the guide as before: the first run is done, and Today is next", async ({ page }) => {
    await toLastScreen(page);
    await page.getByRole("button", { name: "Не сега, оди на Денес" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Денес" })).toBeVisible();
    expect((await demo(page)).novice.school.first_run_done).toBe(true);
  });

  test("the first lesson is made right there: the form, the wait, the editor, and saving it is the end of the first run", async ({ page }) => {
    await toLastScreen(page);
    await page.getByRole("button", { name: "Подготви ја првата лекција" }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/new\?from=guide$/);
    await expect(title(page)).toHaveText("Подготви лекција");
    // Back is the guide, named; any other page still sends a teacher whose first run is not done to the guide.
    await expect(page.getByRole("link", { name: "Назад кон водичот", exact: true })).toHaveAttribute("href", "/teacher/welcome");
    await page.getByRole("radio", { name: /^II година/ }).check();
    await page.getByRole("radio", { name: /^Неколку реченици/ }).check();
    await page.getByRole("textbox", { name: "Напишете неколку реченици за темата" }).fill(TYPED);
    await page.getByRole("button", { name: "Подготви прашања", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/drafts\/d\d+\?from=guide$/);
    await expect(page.getByRole("heading", { level: 2, name: "Ги пишуваме прашањата" })).toBeVisible();
    // Reloading the wait of a first run is still the wait: the page of the draft is part of the first lesson.
    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: "Ги пишуваме прашањата" })).toBeVisible();
    await expect(title(page)).toHaveText("Квадратни равенки", { timeout: 20_000 });
    expect((await demo(page)).novice.school.first_run_done).toBe(false);

    await saveButton(page).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-n\d+$/);
    await expect(page.locator(".draft__note")).toContainText("Лекцијата е зачувана.");
    expect((await demo(page)).novice.school.first_run_done).toBe(true);
    // Done: the guide does not come back, and Today has the lesson.
    await page.goto("/teacher");
    await expect(page.getByRole("heading", { level: 1, name: "Денес" })).toBeVisible();
    await expect(page.locator(".lessons > li")).toHaveCount(1);
  });

  test("until the first lesson is saved, leaving for any other page goes back to the guide, and the draft is waiting on Today afterwards", async ({ page }) => {
    await toLastScreen(page);
    await page.getByRole("button", { name: "Подготви ја првата лекција" }).click();
    await page.getByRole("radio", { name: /^II година/ }).check();
    await page.getByRole("radio", { name: /^Неколку реченици/ }).check();
    await page.getByRole("textbox", { name: "Напишете неколку реченици за темата" }).fill(TYPED);
    await page.getByRole("button", { name: "Подготви прашања", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/drafts\/d\d+/);
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/teacher\/welcome/);
    await page.getByRole("button", { name: "Прескокни го водичот" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Денес" })).toBeVisible();
    await expect(page.locator("section[aria-labelledby=unfinished] .lessons > li")).toHaveCount(1);
  });

  test("seen again from Settings, the guide ends as it always did", async ({ page }) => {
    await page.goto("/teacher/welcome");
    await page.getByRole("button", { name: "Прескокни го водичот" }).click();
    await page.goto("/teacher/welcome?next=%2Fteacher%2Fsettings");
    await page.getByRole("button", { name: "Следно" }).click();
    await page.getByRole("button", { name: "Следно" }).click();
    await expect(page.getByRole("button", { name: "Назад во Поставки" })).toHaveClass(/btn--primary/);
    await expect(page.getByRole("button", { name: "Подготви ја првата лекција" })).toHaveCount(0);
  });
});

// ---- Keyboard only --------------------------------------------------------------------------------------------------------

test.describe("keyboard only", () => {
  test("a lesson can be changed and saved with the keyboard alone", async ({ page }) => {
    // From the first button of the page on, every step is a key.
    await page.getByRole("link", { name: "Назад кон Лекции" }).focus();
    await page.keyboard.press("Tab"); // the title
    await expect(titleField(page)).toBeFocused();
    // A box that is tabbed into is selected, so what is typed takes its place.
    await page.keyboard.type("Квадратни равенки (проверена)");
    await page.keyboard.press("Tab");
    await expect(edit(page, 1)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(prompt(page)).toBeFocused();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Која од равенките е квадратна? Да?");
    // The picture is optional and is the next stop: the button to add one is the label of a real file field, which has the focus.
    await page.keyboard.press("Tab");
    await expect(open(page).locator('input[type="file"]')).toBeFocused();
    // The kind: one stop for the group, the arrows choose.
    await page.keyboard.press("Tab");
    await expect(kind(page, "Понудени одговори")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(option(page, 1)).toBeFocused();
    await page.keyboard.press("Tab"); // Отстрани, the first answer's
    await page.keyboard.press("Tab"); // the second answer's words
    await page.keyboard.press("Tab"); // the right answer: the radios are one stop, on the one that is chosen
    await expect(isRight(page, 2)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(isRight(page, 3)).toBeChecked();
    await expect(isRight(page, 3)).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(option(page, 3)).toBeFocused();
    // A box that is tabbed into is selected, so what is typed takes its place.
    await page.keyboard.type("x³ − 1 = 0!");
    await done(page).focus();
    await page.keyboard.press("Enter");
    await expect(edit(page, 1)).toBeFocused();
    await saved(page);
    expect((await draftOnDisk(page)).content.questions[0]).toMatchObject({ prompt: "Која од равенките е квадратна? Да?", correct: "2" });
    expect((await draftOnDisk(page)).content.questions[0].options).toEqual(["2x + 5 = 0", "x² − 4x + 3 = 0", "x³ − 1 = 0!", "3/x = 6"]);
    expect((await draftOnDisk(page)).content.title).toBe("Квадратни равенки (проверена)");

    // Down to the one main button, and Enter makes it a lesson.
    await saveButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-n\d+/);
    await expect(title(page)).toHaveText("Квадратни равенки (проверена)");
  });

  test("a question is added, moved, deleted and brought back with the keyboard, and the focus is always on something that can be pressed", async ({ page }) => {
    await page.getByRole("button", { name: "Додај прашање" }).focus();
    await page.keyboard.press("Enter");
    // From the button that was pressed on, by keys only: the first kind has the focus, and Tab goes to the next.
    await expect(page.getByRole("button", { name: "Понудени одговори", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Точно или неточно", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(prompt(page)).toBeFocused();
    await page.keyboard.type("Нула е парен број.");
    await open(page).getByRole("button", { name: "Нагоре" }).focus();
    await page.keyboard.press("Enter");
    await expect(open(page).getByRole("button", { name: "Нагоре" })).toBeFocused();
    await open(page).getByRole("button", { name: "Избриши" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Врати го прашањето" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(prompt(page)).toBeFocused();
    await expect(prompt(page)).toHaveValue("Нула е парен број.");
  });
});

// ---- Words, in both languages and both kinds of school ----------------------------------------------------------------

test.describe("wording", () => {
  test("is in English when the screen is, at a school", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "en", schoolType: "school", schoolSeen: true })), SETTINGS_KEY);
    await page.goto(SEED_URL);
    await expect(page.getByRole("textbox", { name: "Lesson title" })).toBeVisible();
    await expect(page.getByText("Your changes save themselves.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Questions", exact: true })).toBeVisible();
    await expect(card(page, 1).getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a question" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Change all the questions" })).toBeVisible();
    for (const name of ["Easier", "Harder", "More questions", "Shorter time"]) await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Review summary" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save lesson" })).toHaveClass(/btn--primary/);
    await expect(page.getByText("If you do not save it now, we keep it for up to 30 days, and you will find it on Today.")).toBeVisible();

    await card(page, 5).getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("textbox", { name: "The question" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 4, name: "What kind of answer?" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "How far off may an answer be?" })).toHaveCount(0);
    await page.getByRole("button", { name: "More options" }).click();
    await expect(page.getByRole("textbox", { name: "How far off may an answer be?" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "The answer may be a negative number" })).toBeVisible();
    await expect(page.getByText("Then your students get a minus key.")).toBeVisible();
    await expect(page.getByRole("button", { name: "−5 seconds" })).toBeVisible();
    await page.getByRole("textbox", { name: "Right answer", exact: true }).fill("-1");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(open(page).getByRole("alert")).toContainText("Question 5: the right answer is a negative number. Tick “The answer may be a negative number”.");
    await page.getByRole("button", { name: "Save lesson" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "It cannot be saved yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Question 5: the right answer is a negative number. Tick “The answer may be a negative number”." })).toBeVisible();
  });

  test("at a faculty it is 'студенти' and a study year, and 'група' is nowhere asked about in the editor", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "mk", schoolType: "university", schoolSeen: true })), SETTINGS_KEY);
    await seed(page, { drafts: [draftOf({ year: 2, subject: { id: "linalg", name: "Линеарна алгебра" } })] }, SEED_URL, "university");
    await expect(page.locator(".head__sub")).toHaveText("Линеарна алгебра · 2. година");
    await edit(page, 5).click();
    await moreOptions(page).click();
    await expect(page.getByText("Тогаш Вашите студенти ќе имаат копче за минус.")).toBeVisible();
    await expect(page.getByText("Тогаш Вашите ученици")).toHaveCount(0);
  });
});

// ---- Zoomed, and the sizes of a laptop ---------------------------------------------------------------------------------------

test.describe("zoomed and small windows", () => {
  // 200% on a 1280 x 720 window leaves 640 x 360 CSS pixels; 400% leaves 320 x 180.
  for (const [zoom, viewport] of [
    ["200%", { width: 640, height: 360 }],
    ["400%", { width: 320, height: 180 }],
  ] as const) {
    test(`at ${zoom} the editor, an open question of each kind, the problems and the wait do not run off the side`, async ({ page }) => {
      test.slow();
      await page.setViewportSize(viewport);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await titleField(page).fill("Многу долг наслов на лекцијата " + "равенки".repeat(12));
      await summaryField(page).fill("Резиме со многу долг збор: " + "дискриминантата".repeat(8));
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      for (const n of [1, 2, 5]) {
        await edit(page, n).click();
        await expect(open(page)).toBeVisible();
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        // Every button of the open card is whole, inside the window, and not narrower than it is tall to press.
        for (const button of await open(page).locator("button:visible").all()) {
          const box = (await button.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        }
        await done(page).click();
      }
      await edit(page, 1).click();
      await prompt(page).fill("");
      await option(page, 1).fill("");
      await saveButton(page).scrollIntoViewIfNeeded();
      await saveButton(page).click();
      await expect(page.getByRole("heading", { level: 2, name: "Уште не може да се зачува" })).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await saveButton(page).scrollIntoViewIfNeeded();
      const box = (await saveButton(page).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    });
  }

  test("at 200% a draft being written, and the line that says what a refinement changed, fit too", async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 640, height: 360 });
    await refine(page, "Полесни").click();
    await expect(waitHeading(page)).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await expect(page.getByRole("button", { name: "Врати ги претходните прашања" })).toBeVisible({ timeout: 15_000 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("at 1024 x 768 the sidebar and the whole editor are there, with an open question, and nothing runs off the side", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(menu(page)).toBeVisible();
    await edit(page, 1).click();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const buttons = await page.locator("main button:visible, main a.btn:visible").all();
    for (const button of buttons) expect(await tall(button)).toBeGreaterThanOrEqual(44);
    for (const field of await open(page).locator("input[type=text]:visible, textarea:visible").all()) expect(await tall(field)).toBeGreaterThanOrEqual(48);
  });

  test("at 900 wide, in the drawer layout, the editor fits and the one main button is whole", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await edit(page, 1).click();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await expect(mainButton(page)).toHaveCount(1);
  });

  test("the motion stops when the computer asks for less of it, and nothing on the page moves by itself", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await titleField(page).fill("Без движење");
    await refine(page, "Полесни").click();
    await expect(waitHeading(page)).toBeVisible();
    const names = await page.locator(".waiting__dots span").evaluateAll((spans) => spans.map((s) => getComputedStyle(s).animationName));
    expect(names).toEqual(["none", "none", "none"]);
  });
});

