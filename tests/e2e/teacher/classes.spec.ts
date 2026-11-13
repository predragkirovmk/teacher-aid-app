import type { Page } from "@playwright/test";
import { createMockApi, memorySource } from "../../../lib/teacher/api/mock";
import { freshState, MOCK_KEY, startOfDay } from "../../../lib/teacher/api/mock-state";
import { attendanceByStudent, focusByStudent, newestQuestions, summaryOf, weakestFirst } from "../../../lib/teacher/classes";
import type { CourseDashboard } from "../../../lib/teacher/api/types";
import { expect, SETTINGS_KEY, test } from "./fixtures";
import { go, next, panel, reveal, send, T0, teach, TEACHING_AT, title, mainButton } from "./live-helpers";

/**
 * The class results, step 11: the list of classes and the results page of a class, with the numbers of the demo school worked out here from the
 * same seed. In mock mode, in Macedonian, on the clock the other live specs hold still.
 */

const II4 = "course-ii-4";
const I2 = "course-iv-2";

const dashboardOf = async (courseId: string): Promise<CourseDashboard> => {
  const api = createMockApi(memorySource(freshState(startOfDay(T0)), { now: () => T0 }), { delay: () => Promise.resolve() });
  return api.getDashboard(courseId);
};

test.beforeEach(async ({ context }) => {
  await context.clock.setFixedTime(T0);
});

const seed = async (page: Page, what: Record<string, unknown>, url: string) => {
  await page.goto("/teacher/help");
  await page.waitForFunction((key) => localStorage.getItem(key) !== null, MOCK_KEY);
  await page.evaluate(
    ([key, seeded]) => {
      const state = JSON.parse(localStorage.getItem(key as string) ?? "null");
      Object.assign(state.school, seeded);
      localStorage.setItem(key as string, JSON.stringify(state));
    },
    [MOCK_KEY, what] as const,
  );
  await page.goto(url);
};

test.describe("the list of classes", () => {
  test("lists the courses, the one taught last first, with the students, the lessons held and when the last was", async ({ page }) => {
    await page.goto("/teacher/classes");
    await expect(title(page)).toHaveText("Класови");
    const cards = page.getByTestId("class-card");
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0).getByRole("heading")).toHaveText("II-4 · Математика");
    await expect(cards.nth(1).getByRole("heading")).toHaveText("IV-1 · Математика");
    await expect(cards.nth(2).getByRole("heading")).toHaveText("III-5 · Математика");
    await expect(cards.nth(3).getByRole("heading")).toHaveText("IV-2 · Математика");
    await expect(cards.nth(0)).toContainText("26 ученици");
    await expect(cards.nth(0)).toContainText("10 одржани часа");
    await expect(cards.nth(0)).toContainText("Последниот час беше пред 3 дена");
    // IV-1 and III-5 were last taught the same Friday; IV-1 later in the day.
    await expect(cards.nth(1)).toContainText("6 одржани часа");
    await expect(cards.nth(3)).toContainText("25 ученици");
    await expect(cards.nth(3)).toContainText("Уште нема одржан час со овој клас");
    await expect(cards.nth(3)).not.toContainText("0 одржани");
    await expect(mainButton(page)).toHaveCount(0);
  });

  test("a card opens the results of its class", async ({ page }) => {
    await page.goto("/teacher/classes");
    await page.getByTestId("class-card").nth(1).getByRole("link").click();
    await expect(page).toHaveURL(/\/teacher\/classes\/course-iv-1$/);
    await expect(title(page)).toHaveText("IV-1 · Математика");
  });

  test("at the faculty the untaught group says so in the group's words", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "mk", schoolType: "university", schoolSeen: true })), SETTINGS_KEY);
    await page.goto("/teacher/classes");
    await expect(title(page)).toHaveText("Групи");
    const cards = page.getByTestId("class-card");
    const last = cards.filter({ hasText: "Група 1Б" });
    await expect(last).toContainText("26 студенти");
    await expect(last).toContainText("Уште нема одржан час со оваа група");
  });

  test("a teacher with no class is told who gives them", async ({ page }) => {
    await seed(page, { courses_empty: true }, "/teacher/classes");
    const empty = page.getByTestId("classes-empty");
    await expect(empty).toContainText("Сѐ уште немате класови");
    await expect(empty).toContainText("Класовите Ви ги доделува администраторот на училиштето.");
  });
});

test.describe("the results of a class with a season", () => {
  test("the summary and the links to the sections", async ({ page }) => {
    const d = await dashboardOf(II4);
    const s = summaryOf(d);
    await page.goto(`/teacher/classes/${II4}`);
    await expect(title(page)).toHaveText("II-4 · Математика");
    await expect(page.getByTestId("sum-lessons")).toHaveText("10");
    await expect(page.getByTestId("sum-attendance")).toHaveText(`${Math.round((s.attendance as number) * 100)}%`);
    await expect(page.getByTestId("summary")).toContainText("од учениците доаѓаат на час, во просек");
    await expect(page.getByTestId("sum-right")).toHaveText(`${Math.round((s.right as number) * 100)}%`);
    await expect(page.getByTestId("summary")).toContainText("од одговорите беа точни");
    await expect(page.getByTestId("sum-weakest")).toContainText(`${s.weakest!.topic}: ${s.weakest!.right} од ${s.weakest!.total} точни`);
    const jump = page.getByRole("navigation", { name: "На оваа страница" });
    for (const name of ["Кој доаѓа", "Часови", "Слаби теми", "Прашања", "Вежби", "Излегување", "Поставки"]) {
      await expect(jump.getByRole("link", { name })).toBeVisible();
    }
    await jump.getByRole("link", { name: "Слаби теми" }).click();
    await expect(page).toHaveURL(/#topics$/);
    await expect(page.getByRole("heading", { name: "Слаби теми" })).toBeInViewport();
    await expect(mainButton(page)).toHaveCount(0);
  });

  test("attendance: five students, then all; the reasons and the student who joined mid-year", async ({ page }) => {
    const d = await dashboardOf(II4);
    const rows = attendanceByStudent(d);
    await page.goto(`/teacher/classes/${II4}`);
    const att = page.getByTestId("course-att-row");
    await expect(att).toHaveCount(5);
    await page.locator("#attendance").getByTestId("show-all").click();
    await expect(att).toHaveCount(rows.length);
    const mid = rows.find((r) => r.joined_mid_year)!;
    await expect(page.getByTestId("joined-note")).toHaveCount(1);
    await expect(page.getByTestId("joined-note")).toContainText("Се приклучи на");
    await expect(page.getByTestId("joined-note")).toContainText("Се брои од тогаш.");
    const withReason = rows.filter((r) => r.no_device > 0);
    expect(withReason.length).toBeGreaterThan(0);
    await expect(page.getByTestId("reasons")).toHaveCount(withReason.length);
    expect(mid.held).toBeLessThan(10);
    await page.locator("#attendance").getByTestId("show-all").click();
    await expect(att).toHaveCount(5);
  });

  test("attendance: a name is one line and has the room, the table has a caption and headers", async ({ page }) => {
    await page.goto(`/teacher/classes/${II4}`);
    const table = page.getByTestId("attendance-table");
    await expect(table.locator("caption")).toHaveText("Присуство на секој ученик");
    await expect(table.locator("thead th")).toHaveCount(5);
    const first = table.locator(".cres__name").first();
    const line = await first.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect((await first.boundingBox())!.height).toBeLessThanOrEqual(line + 1);
    expect(await page.locator("#attendance .cres__scroll").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test("at 200% zoom the tables become short stacked rows and nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`/teacher/classes/${II4}`);
    await expect(page.getByTestId("sum-lessons")).toHaveText("10");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const row = page.getByTestId("points-row").first();
    await expect(row.locator("td").first()).toBeVisible();
    await expect(row.getByRole("link", { name: /^Отвори:/ })).toBeVisible();
    // The column headers are still read out, but not drawn.
    await expect(page.getByTestId("points-table").getByRole("columnheader", { name: "Резултат" })).toHaveCount(1);
  });

  test("nothing on the page is smaller than 16px", async ({ page }) => {
    await page.goto(`/teacher/classes/${II4}`);
    await expect(page.getByTestId("sum-lessons")).toHaveText("10");
    for (const b of await page.getByTestId("show-all").all()) await b.click();
    const small = await page.evaluate(() => {
      const found: string[] = [];
      for (const el of document.querySelectorAll(".cres *")) {
        if (!(el instanceof HTMLElement) || !el.childNodes.length) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
        if (own && el.offsetParent !== null && parseFloat(getComputedStyle(el).fontSize) < 16) found.push(`${el.tagName}.${el.className}: ${el.textContent?.slice(0, 30)}`);
      }
      return found;
    });
    expect(small).toEqual([]);
  });

  test("the lessons: the day, the title, who came and one plain result, five rows then all", async ({ page }) => {
    const d = await dashboardOf(II4);
    await page.goto(`/teacher/classes/${II4}`);
    const rows = page.getByTestId("points-row");
    await expect(rows).toHaveCount(5);
    const newest = d.sessions[0];
    await expect(rows.first()).toContainText(newest.lesson.title);
    await expect(rows.first()).toContainText(`${Math.round(newest.right_rate * 100)}% точни`);
    await expect(rows.first()).toContainText(`${newest.tally.present + newest.tally.late} од ${newest.tally.total}`);
    await expect(rows.first().locator("td").nth(2)).toHaveText(`${Math.round(newest.right_rate * 100)}% точни`);
    await expect(rows.first()).not.toContainText("Одговорено на");
    await page.locator("#points").getByTestId("show-all").click();
    await expect(rows).toHaveCount(10);
    await rows.first().getByRole("link", { name: /^Отвори:/ }).click();
    await expect(page).toHaveURL(new RegExp(`/teacher/live/${newest.id}$`));
    await expect(title(page)).toHaveText("Часот заврши");
    await page.goBack();
    await expect(page.locator(".cres__table .btn--primary, .cres__table [style*='red']")).toHaveCount(0);
  });

  test("weak topics: the weakest first, each right out of total in words", async ({ page }) => {
    const d = await dashboardOf(II4);
    const order = weakestFirst(d.topics);
    await page.goto(`/teacher/classes/${II4}`);
    const rows = page.getByTestId("topic-row");
    await expect(rows.first()).toContainText(order[0].topic);
    await expect(rows.first()).toContainText(`${order[0].right} од ${order[0].total} точни`);
    await expect(rows.first()).toContainText("Најтешка тема");
    await expect(rows.nth(1)).toContainText(order[1].topic);
    await expect(page.getByTestId("topic-row")).toHaveCount(Math.min(order.length, 5));
  });

  test("leaving the app: counted per student, said calmly", async ({ page }) => {
    const d = await dashboardOf(II4);
    const rows = focusByStudent(d);
    await page.goto(`/teacher/classes/${II4}`);
    const section = page.locator("#focus");
    await expect(section).toContainText("Ова е само информација");
    if (rows.length === 0) {
      await expect(page.getByTestId("focus-none")).toBeVisible();
    } else {
      const times = rows.reduce((n, r) => n + r.times, 0);
      await expect(page.getByTestId("focus-total")).toContainText(`Од апликацијата е излегувано ${times} пати, од ${rows.length} ученици`);
      await expect(page.getByTestId("focus-row").first()).toContainText(rows[0].full_name.split(" ").pop()!);
    }
  });

  test("questions to the teacher: newest first, each with its sender and its lesson", async ({ page }) => {
    const d = await dashboardOf(II4);
    const list = newestQuestions(d.anon_questions);
    expect(list.length).toBeGreaterThan(0);
    await page.goto(`/teacher/classes/${II4}`);
    const items = page.getByTestId("question-item");
    await expect(items).toHaveCount(Math.min(list.length, 5));
    await expect(items.first()).toContainText(list[0].text);
    await expect(items.first()).toContainText(list[0].sender.name.split(" ").pop()!);
    const lesson = d.sessions.find((s) => s.id === list[0].session_id)!.lesson.title;
    await expect(items.first()).toContainText(lesson);
  });

  test("practice: how many finished, and who, behind a disclosure", async ({ page }) => {
    const d = await dashboardOf(II4);
    await page.goto(`/teacher/classes/${II4}`);
    const sets = page.getByTestId("practice-set");
    await expect(sets).toHaveCount(d.practice.length);
    const first = d.practice[0];
    await expect(sets.first()).toContainText(`${first.completed} од ${first.students} завршија`);
    await sets.first().getByText("Кој ги реши").click();
    await expect(sets.first().getByTestId("practice-students").locator("li").first()).toBeVisible();
    await expect(page.locator("#practice")).toContainText(`${d.sessions.length - d.practice.length} од ${d.sessions.length}`);
  });

  test("the setting for the class: one switch, in words, saved at once", async ({ page }) => {
    await page.goto(`/teacher/classes/${II4}`);
    const bonus = page.getByRole("switch", { name: "Бонус за брз одговор" });
    await expect(bonus).toBeChecked();
    await expect(bonus).toContainText("Вклучен");
    await expect(page.locator("#settings").getByRole("radio")).toHaveCount(0);
    await expect(page.locator("#settings").getByRole("switch")).toHaveCount(1);
    await expect(page.locator("#settings").getByRole("button")).toHaveCount(0);
    await expect(page.locator("#settings")).toContainText("Ученик што одговара побрзо добива неколку поени повеќе.");
    await bonus.click();
    await expect(page.getByTestId("speed-saved")).toHaveText("Зачувано. Бонусот е исклучен.");
    await expect(bonus).not.toBeChecked();
    await expect(bonus).toContainText("Исклучен");
    await page.reload();
    await expect(page.getByRole("switch", { name: "Бонус за брз одговор" })).not.toBeChecked();
    await page.getByRole("switch", { name: "Бонус за брз одговор" }).click();
    await expect(page.getByTestId("speed-saved")).toHaveText("Зачувано. Бонусот е вклучен.");
    await expect(page.getByRole("switch", { name: "Бонус за брз одговор" })).toBeChecked();
  });
});

test.describe("a class with no lesson held", () => {
  test("says so and points to Today; the setting is still there", async ({ page }) => {
    await page.goto(`/teacher/classes/${I2}`);
    await expect(title(page)).toHaveText("IV-2 · Математика");
    const empty = page.getByTestId("course-empty");
    await expect(empty).toContainText("За овој клас уште нема одржан час");
    await expect(mainButton(page)).toHaveCount(1);
    await expect(empty.getByRole("link", { name: "Оди на Денес" })).toHaveAttribute("href", "/teacher");
    await expect(page.locator("#settings")).toBeVisible();
    await expect(page.getByTestId("points-row")).toHaveCount(0);
  });
});

test.describe("failure, waiting and a class that is not the teacher's", () => {
  test("a failed read says so in plain words and nothing is half drawn; trying again draws the page", async ({ page }) => {
    await seed(page, { dashboard_failures: 1 }, `/teacher/classes/${II4}`);
    await expect(page.locator(".problem")).toContainText("Не успеавме да ги вчитаме резултатите");
    await expect(page.getByTestId("summary")).toHaveCount(0);
    await page.getByRole("button", { name: "Обиди се повторно" }).click();
    await expect(page.getByTestId("sum-lessons")).toHaveText("10");
    await expect(page.locator(".problem")).toHaveCount(0);
  });

  test("while it is slow the page keeps its shape and says it is loading", async ({ page }) => {
    await seed(page, { dashboard_wait_ms: 1500 }, `/teacher/classes/${II4}`);
    await expect(title(page)).toHaveText("Резултати за класот");
    await expect(page.locator("[aria-busy=true] .skeleton").first()).toBeVisible();
    await expect(page.getByTestId("sum-lessons")).toHaveText("10", { timeout: 10_000 });
  });

  test("a class that is not the teacher's is the not-found page of the app", async ({ page }) => {
    await page.goto("/teacher/classes/course-someone-else");
    await expect(title(page)).toHaveText("Оваа страница не постои");
    await expect(page.locator("main").getByRole("link", { name: "Оди на Денес" })).toBeVisible();
  });
});

test.describe("a lesson ended in the demo", () => {
  test("is in its course the same session: counted in the list, in the history, the numbers and the questions", async ({ page, context }) => {
    await teach(page, context);
    let t = TEACHING_AT;
    for (let i = 0; i < 6; i++) {
      await (i === 0 ? send(page) : next(page)).click();
      t += 60;
      await go(context, t);
      await reveal(page).click();
      t += 1;
    }
    await go(context, t);
    await panel(page).getByRole("button", { name: "Премини на прегледот", exact: true }).click();
    await page.getByRole("button", { name: "Заврши го часот", exact: true }).click();
    await page.getByRole("alertdialog", { name: "Дали сакате да го завршите часот?" }).getByRole("button", { name: "Да, заврши го часот" }).click();
    await expect(title(page)).toHaveText("Часот заврши");

    await page.goto("/teacher/classes");
    const card = page.getByTestId("class-card").first();
    await expect(card.getByRole("heading")).toHaveText("II-4 · Математика");
    await expect(card).toContainText("11 одржани часа");
    await expect(card).toContainText("Последниот час беше денес");
    await card.getByRole("link").click();
    await expect(page.getByTestId("sum-lessons")).toHaveText("11");
    const lessons = page.getByTestId("points-row");
    await expect(lessons.first()).toContainText("Проценти и пропорции");
    await lessons.first().getByRole("link", { name: /^Отвори:/ }).click();
    await expect(title(page)).toHaveText("Часот заврши");
  });
});
