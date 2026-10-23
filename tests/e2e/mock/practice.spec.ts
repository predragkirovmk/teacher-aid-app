import { expect, exact, mk, start, test } from "../fixtures";
import type { Page } from "@playwright/test";

/**
 * Practice sets (F-12) and the results history (F-12, US-S07, US-S08) in the demo. The demo starts with the set the teacher sent after the last
 * maths lesson: 2/3 of 12 (8, the second option), which of 5/6 and 4/5 is larger (5/6, the first option), 6/8 and 3/4 being equal (true), and
 * 3/4 of 20 (15). Every right answer is 5 points.
 */
const SET = "/app/practice/ps-session-math-1";
const progress = (n: number) => mk.t("pr.progress", { n, total: 4 });

const check = (page: Page) => page.getByRole("button", { name: mk.t("pr.check") });
const next = (page: Page) => page.getByRole("button", { name: mk.t("pr.next") });

/** Pick the choice at `index` and check it. */
async function choose(page: Page, index: number) {
  await page.locator(".q-opt, .q-tf__btn").nth(index).click();
  await check(page).click();
}

async function typeNumber(page: Page, value: string) {
  await page.locator(".n-input").fill(value);
  await page.locator(".n-input").press("Enter");
}

test("a set is opened from Home, answered, left and carried on, and finished with its points", async ({ page }) => {
  await page.goto("/app");
  const row = page.getByRole("link", { name: new RegExp(`^${mk.t("pr.title")}`) });
  await expect(row).toContainText(mk.t("pr.home.new1", { subject: mk.t("subj.math") }));
  await row.click();
  await expect(page).toHaveURL(new RegExp(`${SET}$`));
  await expect(page.getByText(progress(1))).toBeVisible();
  // Nothing races: no timer, no class.
  await expect(page.getByRole("timer")).toHaveCount(0);

  // Not checked until the student says so: the Check button waits for a pick.
  await expect(check(page)).toHaveAttribute("aria-disabled", "true");
  await page.locator(".q-opt").nth(1).click();
  await expect(page.locator(".q-opt").nth(1)).toHaveAttribute("aria-pressed", "true");
  await check(page).click();

  // Right: an icon and a word, why, and the points.
  const verdict = page.getByRole("status").filter({ hasText: mk.t("pr.right") });
  await expect(verdict).toBeVisible();
  await expect(verdict).toContainText(mk.t("pr.gain", { n: 5 }));
  await expect(verdict).toContainText(mk.t("pr.why"));
  await expect(page.locator(".q-opt").nth(1)).toHaveAttribute("data-state", "right");
  await expect(page.locator(".q-opt").nth(1)).toContainText(mk.t("pr.rightChoice"));
  await next(page).click();

  // Wrong: the right answer is said in words, and marked, and nothing is taken away.
  await expect(page.getByText(progress(2))).toBeVisible();
  await choose(page, 2);
  const wrong = page.getByRole("status").filter({ hasText: mk.t("pr.wrong") });
  await expect(wrong).toBeVisible();
  await expect(wrong).toContainText(mk.t("pr.correctIs", { a: "5/6" }));
  await expect(wrong).not.toContainText(mk.t("pr.gain", { n: 5 }));
  await expect(page.locator(".q-opt").nth(0)).toHaveAttribute("data-state", "right");
  await expect(page.locator(".q-opt").nth(2)).toHaveAttribute("data-state", "miss");
  await expect(page.locator(".q-opt").nth(2)).toContainText(mk.t("pr.yourChoice"));

  // Leave in the middle: the way back is where the student came from, nothing asks them to stay.
  await page.getByRole("button", { name: mk.t("pr.leave") }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(row).toContainText(mk.t("pr.home.resume", { subject: mk.t("subj.math") }));

  // Carry on: the third question, after the two that were answered.
  await row.click();
  await expect(page.getByText(progress(3))).toBeVisible();
  await page.locator(".q-tf__btn").nth(0).click();
  await check(page).click();
  await expect(page.getByRole("status").filter({ hasText: mk.t("pr.right") })).toBeVisible();
  await next(page).click();

  await expect(page.getByText(progress(4))).toBeVisible();
  await typeNumber(page, "15,0");
  await expect(page.getByRole("status").filter({ hasText: mk.t("pr.right") })).toBeVisible();
  await page.getByRole("button", { name: mk.t("pr.result") }).click();

  // Done: 3 of 4, 15 points, and each answer with its word.
  await expect(page.getByRole("heading", { name: mk.t("pr.done.score", { score: 3, total: 4 }) })).toBeVisible();
  await expect(page.getByText(mk.t("pr.gain", { n: 15 }))).toBeVisible();
  const review = page.getByRole("region", { name: mk.t("pr.review") });
  await expect(review.getByRole("listitem")).toHaveCount(4);
  await expect(review.getByText(mk.t("pr.right"))).toHaveCount(3);
  await expect(review.getByText(mk.t("pr.wrong"))).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("teacheraid-app-v1")!).quizPoints)).toBe(15);

  // A finished set is not offered again on Home, and no yellow control is added to it.
  await page.getByRole("button", { name: mk.t("close"), exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("link", { name: new RegExp(`^${mk.t("pr.title")}`) })).toHaveCount(0);
});

test("progress is kept across a reload, and shows in the list", async ({ page }) => {
  await page.goto(SET);
  await choose(page, 1);
  await expect(page.getByRole("status").filter({ hasText: mk.t("pr.right") })).toBeVisible();
  await page.reload();
  await expect(page.getByText(progress(2))).toBeVisible();
  // The earlier questions are not offered again: the next unanswered one is.
  await expect(page.getByText(mk.t("pr.state.started", { done: 1, n: 4 }))).toHaveCount(0);
  await page.goto("/app/practice");
  await expect(page.getByRole("link", { name: new RegExp(mk.t("pr.state.started", { done: 1, n: 4 })) })).toBeVisible();
});

test("answers given with no signal are saved, and their verdicts come when the signal returns", async ({ page, context }) => {
  await page.goto(SET);
  await expect(page.getByText(progress(1))).toBeVisible();
  await context.setOffline(true);
  await choose(page, 1);

  // Saved on the phone, said in words, no verdict yet and nothing called wrong; the student can go on.
  await expect(page.getByText(mk.t("pr.saved"))).toBeVisible();
  await expect(page.getByText(mk.t("pr.wrong"))).toHaveCount(0);
  await next(page).click();
  await choose(page, 0);
  await next(page).click();
  await page.locator(".q-tf__btn").nth(0).click();
  await check(page).click();
  await next(page).click();
  await typeNumber(page, "15");
  await page.getByRole("button", { name: mk.t("pr.result") }).click();

  // Everything is answered and nothing is known yet.
  await expect(page.getByRole("heading", { name: mk.t("pr.wait.title") })).toBeVisible();
  await expect(page.getByText(mk.t("pr.wait.body"))).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: mk.t("pr.done.score", { score: 4, total: 4 }) })).toBeVisible();
  await expect(page.getByText(mk.t("pr.done.all"))).toBeVisible();
  await expect(page.getByText(mk.t("pr.gain", { n: 20 }))).toBeVisible();
});

test("a set that is not there says so and leads back to the list", async ({ page }) => {
  await page.goto("/app/practice/ps-nothing");
  await expect(page.getByText(mk.t("pr.missing"))).toBeVisible();
  await page.getByRole("link", { name: mk.t("pr.missing.cta") }).click();
  await expect(page).toHaveURL(/\/app\/practice$/);
});

test("the list shows what is waiting, then what is finished, with the day each was sent", async ({ page }) => {
  await page.goto("/app/practice");
  await expect(page.getByRole("heading", { name: mk.t("pr.group.open") })).toBeVisible();
  await expect(page.getByRole("heading", { name: mk.t("pr.group.done") })).toBeVisible();
  const [waiting, finished] = await page.getByRole("list").all();
  await expect(waiting).toContainText(mk.t("subj.math"));
  await expect(waiting).toContainText(mk.t("pr.state.new"));
  await expect(waiting).toContainText(mk.t("pr.count.other", { n: 4 }));
  await expect(waiting).toContainText("12 окт");
  await expect(finished).toContainText(mk.t("subj.physics"));
  await expect(finished).toContainText(mk.t("pr.state.done", { score: 2, n: 3 }));
});

test("English reads the same, in English", async ({ page }) => {
  await start(page, { state: { signedIn: true }, locale: "en" });
  await page.goto(SET);
  await expect(page.getByText("Question 1 of 4")).toBeVisible();
  await expect(page.getByRole("heading", { name: "What is 2/3 of 12?" })).toBeVisible();
  await page.locator(".q-opt").nth(0).click();
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Not quite")).toBeVisible();
  await expect(page.getByText("The right answer: 8")).toBeVisible();
});

test("a subject shows its practice, its recent lessons and a chart of each topic with the numbers behind it", async ({ page }) => {
  await page.goto("/app/subject/math");
  await expect(page.getByRole("link", { name: new RegExp(mk.t("pr.state.new")) })).toBeVisible();

  // Three lessons are shown, the rest one tap away.
  const lessons = page.getByRole("heading", { name: mk.t("res.recent") }).locator("xpath=ancestor::section[1]");
  await expect(lessons.getByRole("listitem")).toHaveCount(3);
  await lessons.getByRole("button", { name: mk.t("res.all", { n: 4 }) }).click();
  await expect(lessons.getByRole("listitem")).toHaveCount(4);

  // The topic that was tested three times is a line from 40 % to 80 %; the one tested once is only words.
  const equations = page.getByRole("figure").filter({ hasText: "Линеарни равенки" });
  await expect(equations.getByText(mk.t("topic.range", { from: 40, to: 80, n: 3 }))).toBeVisible();
  const table = equations.getByRole("table", { name: mk.t("topic.table", { topic: "Линеарни равенки" }) });
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(table.getByRole("row").nth(1)).toContainText("25 сеп");
  await expect(table.getByRole("row").nth(1)).toContainText("40%");
  await expect(table.getByRole("row").nth(3)).toContainText("80%");
  const fractions = page.getByRole("figure").filter({ hasText: "Дропки" });
  await expect(fractions.getByText(mk.t("topic.one", { right: 4, total: 5 }))).toBeVisible();
  await expect(fractions.locator(".tc__chart")).toHaveCount(0);

  // Tapping a dot says what that lesson was.
  await equations.locator(".tc__dot").nth(1).click();
  await expect(equations.getByText(mk.t("topic.point", { date: "2 окт", right: 3, total: 5, pct: 60 }))).toBeVisible();
});

test("a subject with no history says so and draws no chart", async ({ page }) => {
  await page.goto("/app/subject/german");
  await expect(page.getByText(mk.t("res.none"))).toBeVisible();
  await expect(page.getByRole("heading", { name: mk.t("topic.title") })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: mk.t("pr.title") })).toHaveCount(0);
});

test("results: every lesson newest first, and one lesson's summary with its practice set", async ({ page }) => {
  await page.goto("/app/summary");
  await expect(page.getByRole("heading", { name: mk.t("res.title") })).toBeVisible();
  const rows = page.getByRole("listitem");
  await expect(rows).toHaveCount(8);
  await expect(rows.first()).toContainText("Математика, дропки");
  await expect(rows.first()).toContainText(mk.t("res.score", { right: 4, total: 5 }));

  await rows.filter({ hasText: mk.t("subj.physics") }).first().getByRole("link").click();
  await expect(page).toHaveURL(/\/app\/summary\/session-phys-2$/);
  await expect(page.getByText("Њутнови закони")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(mk.t("pr.fromLesson")) })).toContainText(mk.t("pr.state.done", { score: 2, n: 3 }));

  await page.goto("/app/summary/session-math-1");
  await page.getByRole("link", { name: new RegExp(mk.t("pr.fromLesson")) }).click();
  await expect(page).toHaveURL(new RegExp(`${SET}$`));
});

test("Home's last result opens that lesson's own summary", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("link", { name: new RegExp(mk.t("home.summary")) }).click();
  await expect(page).toHaveURL(/\/app\/summary\/session-math-1$/);
  await expect(page.getByText(exact("Математика, дропки"))).toBeVisible();
});
