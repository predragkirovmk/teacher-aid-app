import { expect, SETTINGS_KEY, test } from "./fixtures";
import {
  at, cards, go, joinedWhenTeaching, listItem, listSend, next, openProjector, panel, reveal, send, skipInPanel, start, T0, TEACHING_AT, teach, yellow,
} from "./live-helpers";

/**
 * The live lesson, step 9: sending a question, its countdown, closing, the answer shown, skipping, the quick question, the inbox of anonymous questions, the
 * flags and the nudge, on the console and on the projector in a second window. In mock mode, in Macedonian unless a test changes the language. The clock is the
 * test's: it stands still and moves only when a test moves it, so every state is reached on purpose. The lesson is "Проценти и пропорции": its questions are
 * 1 a number (30 s), 2 choices (25 s, the right one A), 3 true or false (15 s, true), 4 a number with a unit, 5 choices, 6 a number with a unit.
 */

const progress = new RegExp(`^\\d+ од ${joinedWhenTeaching()} одговор(ија|и)$`);

test.describe("the life of a question", () => {
  test("a number: the panel and the projector follow it from sending to the answer shown, and the projector never has the answer before", async ({ page, context }) => {
    const projector = await teach(page, context);
    // Nothing is open: the next question is named, with what it is, and the one yellow button sends it.
    await expect(panel(page).getByRole("heading", { name: "Прашањето сега" })).toBeVisible();
    await expect(panel(page)).toContainText("Следно прашање: Прашање 1 од 6, одговор со број");
    await expect(panel(page).getByTestId("panel-prompt")).toHaveText("Колку е 15% од 240?");
    await expect(yellow(page)).toHaveCount(1);
    await expect(yellow(page)).toHaveText("Испрати го прашањето");
    await expect(projector.getByRole("heading", { name: "Часот е во тек" })).toBeVisible();

    await send(page).click();
    // Open: a calm countdown, how many have answered, the way to skip, and no yellow.
    await expect(panel(page).getByTestId("countdown")).toHaveText("Уште 30 секунди");
    await expect(yellow(page)).toHaveCount(0);
    await expect(skipInPanel(page)).toBeVisible();
    await expect(panel(page).getByTestId("progress")).toHaveText(progress);
    await expect(projector.getByTestId("cv-prompt")).toHaveText("Колку е 15% од 240?");
    await expect(projector.getByText("Одговорете со број")).toBeVisible();
    await expect(projector.getByTestId("cv-seconds")).toContainText("30");

    await go(context, TEACHING_AT + 12);
    await expect(panel(page).getByTestId("countdown")).toHaveText("Уште 18 секунди");
    await expect(projector.getByTestId("cv-seconds")).toContainText("18");
    await expect(projector.getByTestId("cv-progress")).toHaveText(progress);
    // The answer is nowhere on the projector while the question is open.
    await expect(projector.getByText("Точен одговор")).toHaveCount(0);
    expect(await projector.locator("main").innerHTML()).not.toMatch(/data-right|cv-right|cv-answer/);

    // Closed: "Времето истече" on both, and the yellow button shows the answer.
    await go(context, TEACHING_AT + 31);
    await expect(panel(page).getByText("Времето истече")).toBeVisible();
    await expect(yellow(page)).toHaveText("Прикажи го точниот одговор");
    await expect(projector.getByText("Времето истече")).toBeVisible();
    await expect(projector.getByText("Точен одговор")).toHaveCount(0);

    await reveal(page).click();
    await expect(panel(page).getByText("Одговорот е прикажан")).toBeVisible();
    await expect(panel(page).getByTestId("right-answer")).toHaveText("Точен одговор: 36");
    await expect(panel(page).getByRole("list").getByRole("listitem")).toHaveText([/Точни\s*\d+/, /Неточни\s*\d+/, /Без одговор\s*\d+/]);
    await expect(yellow(page)).toHaveText("Испрати го следното прашање");
    await expect(panel(page)).toContainText("Следно: Цената на еден производ");
    // The projector: the right number, how many were right, not right and gave none, and the ranking.
    await expect(projector.getByTestId("cv-answer")).toHaveText("Точниот број е 36");
    await expect(projector.locator(".cvq__tile")).toHaveText([/Точни/, /Неточни/, /Без одговор/]);
    await expect(projector.getByTestId("cv-board")).toBeVisible();
  });

  test("choices: letters on the projector, and after the reveal a bar for each with the count and the share, the right one by an icon and words", async ({ page, context }) => {
    const projector = await teach(page, context);
    await listSend(page, 2).click();
    await expect(panel(page).getByTestId("countdown")).toHaveText("Уште 25 секунди");
    await expect(projector.locator(".cvq__letter")).toHaveText(["A", "B", "C", "D"]);
    await expect(projector.getByTestId("cv-option")).toHaveText([/600 денари/, /650 денари/, /200 денари/, /775 денари/]);
    await go(context, TEACHING_AT + 26);
    await expect(yellow(page)).toHaveText("Прикажи го точниот одговор");
    await reveal(page).click();
    await expect(panel(page).getByTestId("right-answer")).toHaveText("Точен одговор: A. 600 денари");
    const bars = projector.getByTestId("cv-bar");
    await expect(bars).toHaveCount(4);
    await expect(projector.getByTestId("cv-right")).toHaveCount(1);
    await expect(bars.first().getByTestId("cv-right")).toHaveText("Точен одговор");
    const shares = await projector.getByTestId("cv-count").allInnerTexts();
    const percents = shares.map((s) => Number(/·\s*(\d+)%/.exec(s)![1]));
    expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
    const counts = shares.map((s) => Number(/^(\d+)/.exec(s)![1]));
    // The counts are the answers: right, wrong, and the console's own counts agree.
    const right = Number(/(\d+)$/.exec(await panel(page).getByRole("list").getByRole("listitem").first().innerText())![1]);
    expect(counts[0]).toBe(right);
    // The explanation, when there is one.
    await expect(projector.getByTestId("cv-why")).toContainText("25% од 800 е 200");
    // Nothing is marked in red or by colour alone: the wrong bars have no mark at all.
    await expect(bars.nth(1).locator(".cvq__rightmark")).toHaveCount(0);
  });

  test("true or false: Точно and Неточно on the projector, two bars at the reveal", async ({ page, context }) => {
    const projector = await teach(page, context);
    await listSend(page, 3).click();
    await expect(projector.getByTestId("cv-option")).toHaveText(["Точно", "Неточно"]);
    await expect(panel(page).getByTestId("countdown")).toHaveText("Уште 15 секунди");
    await go(context, TEACHING_AT + 16);
    await reveal(page).click();
    await expect(panel(page).getByTestId("right-answer")).toHaveText("Точен одговор: Точно");
    await expect(projector.getByTestId("cv-bar")).toHaveCount(2);
    await expect(projector.getByTestId("cv-bar").first().getByTestId("cv-right")).toHaveText("Точен одговор");
  });

  test("a number with a unit says the unit, and the answer shown has it", async ({ page, context }) => {
    const projector = await teach(page, context);
    await listSend(page, 4).click();
    await expect(projector.getByText("Единица: %")).toBeVisible();
    await go(context, TEACHING_AT + 46);
    await reveal(page).click();
    await expect(panel(page).getByTestId("right-answer")).toHaveText("Точен одговор: 25 %");
    await expect(projector.getByTestId("cv-answer")).toHaveText("Точниот број е 25 %");
  });

  test("the countdown runs on the server's time: a computer whose clock is wrong counts the same", async ({ page, context }) => {
    await teach(page, context);
    await send(page).click();
    await expect(panel(page).getByTestId("countdown")).toHaveText("Уште 30 секунди");
    await go(context, TEACHING_AT + 29);
    await expect(panel(page).getByTestId("countdown")).toHaveText("Уште 1 секунда");
  });

  test("when the last question has its answer shown, the panel says plainly that none is left, and does not offer the review", async ({ page, context }) => {
    await teach(page, context);
    const times = [30, 25, 15, 45, 25, 45];
    let t = TEACHING_AT;
    for (const [i, timer] of times.entries()) {
      await go(context, t);
      if (i === 0) await send(page).click();
      else await next(page).click();
      t += timer + 1;
      await go(context, t);
      await reveal(page).click();
      await expect(panel(page).getByText("Одговорот е прикажан")).toBeVisible();
    }
    await expect(panel(page).getByTestId("none-left")).toContainText("Сите прашања се готови");
    await expect(yellow(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Преглед/ })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Каде е часот" }).locator("[aria-current=step]")).toContainText("Предавање");
    await expect(page.locator(".qitem[data-status=shown]")).toHaveCount(6);
  });
});

test.describe("the list of questions", () => {
  test("each question says where it stands in words, any one not sent can be sent with an outlined button, and only the panel has the yellow one", async ({ page, context }) => {
    await teach(page, context);
    await expect(page.locator(".qitem")).toHaveCount(6);
    await expect(page.locator(".qitem .qitem__word")).toHaveText(Array(6).fill("Не е испратено"));
    await expect(yellow(page)).toHaveCount(1);
    await expect(page.locator(".qlist .btn--primary:visible")).toHaveCount(0);
    await expect(listSend(page, 1)).toHaveText("Испрати");
  });

  test("out of order: question 3 first; its answer shown, the panel offers question 1 as next, and the list says sent, answer shown", async ({ page, context }) => {
    const projector = await teach(page, context);
    await listSend(page, 3).click();
    await expect(listItem(page, 3)).toContainText("Испратено");
    await expect(panel(page)).toContainText("Прашање 3 од 6");
    // While it is open another cannot be sent, and the list says why.
    await expect(listSend(page, 1)).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("Друго прашање може да се испрати откако ќе го прикажете одговорот")).toBeVisible();
    await expect(page.getByRole("button", { name: "Брзо прашање" })).toBeDisabled();
    await expect(projector.getByTestId("cv-prompt")).toContainText("Ако 3 тетратки");
    await go(context, TEACHING_AT + 16);
    await reveal(page).click();
    await expect(listItem(page, 3)).toContainText("Одговорот е прикажан");
    await expect(panel(page)).toContainText("Следно: Колку е 15% од 240?");
    await expect(yellow(page)).toHaveText("Испрати го следното прашање");
    await expect(listSend(page, 1)).toHaveAttribute("aria-disabled", "false");
    // The yellow button sends question 1, the next in the lesson's order.
    await next(page).click();
    await expect(projector.getByTestId("cv-prompt")).toHaveText("Колку е 15% од 240?");
  });
});

test.describe("skipping", () => {
  test("asks first in plain words that the question will not count, with the safe answer as the default; saying no changes nothing", async ({ page, context }) => {
    await teach(page, context);
    await skipInPanel(page).click();
    const dialog = page.getByRole("alertdialog", { name: "Да го прескокнеме ли прашањето?" });
    await expect(dialog).toContainText("Прашањето не е испратено. Ако го прескокнете, нема да се испрати и нема да се брои.");
    const stay = dialog.getByRole("button", { name: "Не, остави го" });
    await expect(stay).toBeFocused();
    await stay.click();
    await expect(dialog).toBeHidden();
    await expect(listItem(page, 1)).toContainText("Не е испратено");
    await expect(panel(page).getByTestId("panel-prompt")).toHaveText("Колку е 15% од 240?");
  });

  test("a question not sent is skipped from the panel or the list: it is listed as skipped, the panel moves to the next, and the projector says nothing of it", async ({ page, context }) => {
    const projector = await teach(page, context);
    await skipInPanel(page).click();
    await page.getByRole("button", { name: "Да, прескокни го" }).click();
    await expect(listItem(page, 1)).toContainText("Прескокнато");
    await expect(panel(page)).toContainText("Прескокнато: „Колку е 15% од 240?“. Не се брои.");
    await expect(panel(page).getByTestId("panel-prompt")).toContainText("Цената на еден производ");
    await expect(projector.getByRole("heading", { name: "Часот е во тек" })).toBeVisible();
    // From the list, with the quiet link.
    await listItem(page, 3).getByRole("button", { name: "Прескокни го прашањето 3" }).click();
    await page.getByRole("button", { name: "Да, прескокни го" }).click();
    await expect(listItem(page, 3)).toContainText("Прескокнато");
    await expect(page.locator(".qitem[data-status=skipped]")).toHaveCount(2);
  });

  test("an open question is skipped: the projector says it does not count, nobody scores, and the next may be sent", async ({ page, context }) => {
    const projector = await teach(page, context);
    await send(page).click();
    await go(context, TEACHING_AT + 10);
    await skipInPanel(page).click();
    await expect(page.getByRole("alertdialog")).toContainText("Прашањето нема да се брои. Никој нема да добие поени за него");
    await page.getByRole("button", { name: "Да, прескокни го" }).click();
    await expect(listItem(page, 1)).toContainText("Прескокнато");
    await expect(projector.getByTestId("cv-skipped")).toHaveText("Ова прашање не се брои");
    await expect(projector.getByTestId("cv-board")).toHaveCount(0);
    await expect(yellow(page)).toHaveText("Испрати го прашањето");
    await expect(panel(page)).toContainText("Прашање 2 од 6");
  });

  test("a closed question can be skipped before its answer is shown", async ({ page, context }) => {
    await teach(page, context);
    await send(page).click();
    await go(context, TEACHING_AT + 31);
    await expect(yellow(page)).toHaveText("Прикажи го точниот одговор");
    await skipInPanel(page).click();
    await page.getByRole("button", { name: "Да, прескокни го" }).click();
    await expect(listItem(page, 1)).toContainText("Прескокнато");
    await expect(yellow(page)).toHaveText("Испрати го прашањето");
  });
});

test.describe("the quick question", () => {
  const open = async (page: import("@playwright/test").Page) => {
    await page.getByRole("button", { name: "Брзо прашање" }).click();
    return page.getByRole("dialog", { name: "Брзо прашање" });
  };

  test("true or false: one short screen, the checks said in plain words, then it is sent at once and the panel takes it over", async ({ page, context }) => {
    const projector = await teach(page, context);
    const dialog = await open(page);
    await expect(dialog.getByRole("radiogroup").first()).toBeVisible();
    await expect(dialog.getByLabel("Време, во секунди")).toHaveValue("15");
    await dialog.getByRole("button", { name: "Испрати го веднаш" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Напишете го прашањето.");
    await expect(dialog.getByRole("alert")).toContainText("Изберете го точниот одговор.");
    await dialog.getByLabel("Прашањето").fill("Дали 7 е прост број?");
    await dialog.getByRole("radio", { name: "Точно", exact: true }).check();
    await dialog.getByLabel("Време, во секунди").fill("3");
    await dialog.getByRole("button", { name: "Испрати го веднаш" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Напишете време од 5 до 300 секунди.");
    await dialog.getByLabel("Време, во секунди").fill("12");
    await dialog.getByRole("button", { name: "Испрати го веднаш" }).click();
    await expect(dialog).toBeHidden();
    await expect(panel(page).getByTestId("countdown")).toHaveText("Уште 12 секунди");
    await expect(panel(page)).toContainText("Брзо прашање, точно или неточно");
    await expect(projector.getByTestId("cv-prompt")).toHaveText("Дали 7 е прост број?");
    await expect(projector.getByTestId("cv-option")).toHaveText(["Точно", "Неточно"]);
    await expect(projector.getByText("Брзо прашање")).toBeVisible();
    // It is listed after the others, and plays like a prepared one.
    await expect(page.locator(".qitem")).toHaveCount(7);
    await expect(listItem(page, 7)).toContainText("Брзо прашање");
    await go(context, TEACHING_AT + 13);
    await reveal(page).click();
    await expect(panel(page).getByTestId("right-answer")).toHaveText("Точен одговор: Точно");
    await expect(projector.getByTestId("cv-bar")).toHaveCount(2);
  });

  test("choices: two to four answers and which is right", async ({ page, context }) => {
    const projector = await teach(page, context);
    const dialog = await open(page);
    await dialog.getByRole("radio", { name: "Понудени одговори" }).check();
    await dialog.getByLabel("Прашањето").fill("Главниот град на Македонија е ...");
    await dialog.getByLabel("Одговор A", { exact: true }).fill("Битола");
    await dialog.getByRole("button", { name: "Испрати го веднаш" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Напишете најмалку два одговори.");
    await dialog.getByLabel("Одговор B", { exact: true }).fill("Скопје");
    await dialog.getByLabel("Одговор C", { exact: true }).fill("Охрид");
    await dialog.getByRole("button", { name: "Испрати го веднаш" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Изберете го точниот одговор.");
    await dialog.getByRole("radio", { name: "Одговорот B е точниот" }).check();
    await expect(dialog.getByLabel("Време, во секунди")).toHaveValue("25");
    await dialog.getByRole("button", { name: "Испрати го веднаш" }).click();
    await expect(dialog).toBeHidden();
    await expect(projector.locator(".cvq__letter")).toHaveText(["A", "B", "C"]);
    await go(context, TEACHING_AT + 26);
    await reveal(page).click();
    await expect(panel(page).getByTestId("right-answer")).toHaveText("Точен одговор: B. Скопје");
    await expect(projector.getByTestId("cv-bar").nth(1).getByTestId("cv-right")).toHaveText("Точен одговор");
  });

  test("a number, with a unit if there is one", async ({ page, context }) => {
    const projector = await teach(page, context);
    const dialog = await open(page);
    await dialog.getByRole("radio", { name: "Број" }).check();
    await expect(dialog.getByLabel("Време, во секунди")).toHaveValue("45");
    await dialog.getByLabel("Прашањето").fill("Колку метри има во 3,5 километри?");
    await dialog.getByLabel("Точниот број").fill("три");
    await dialog.getByRole("button", { name: "Испрати го веднаш" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Точниот одговор мора да биде број");
    await dialog.getByLabel("Точниот број").fill("3500");
    await dialog.getByLabel("Единица (ако има)").fill("m");
    await dialog.getByRole("button", { name: "Испрати го веднаш" }).click();
    await expect(dialog).toBeHidden();
    await expect(projector.getByText("Единица: m")).toBeVisible();
    await go(context, TEACHING_AT + 46);
    await reveal(page).click();
    await expect(panel(page).getByTestId("right-answer")).toHaveText("Точен одговор: 3500 m");
    await expect(projector.getByTestId("cv-answer")).toHaveText("Точниот број е 3500 m");
  });

  test("Cancel sends nothing, and the form is one screen at 1280 x 720 and 1024 x 768 even with four answers", async ({ page, context }) => {
    await teach(page, context);
    for (const size of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size);
      const dialog = await open(page);
      await dialog.getByRole("radio", { name: "Понудени одговори" }).check();
      const box = (await dialog.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      await dialog.getByRole("button", { name: "Откажи" }).click();
      await expect(dialog).toBeHidden();
    }
    await expect(page.locator(".qitem")).toHaveCount(6);
    await expect(yellow(page)).toHaveText("Испрати го прашањето");
  });
});

test.describe("the inbox of anonymous questions", () => {
  // The class writes to the teacher 20 to 28 s after teaching begins, then every 40 s or so.
  test("a question arrives with the sender's name, the text and the time; it is announced once, politely, and never as a window", async ({ page, context }) => {
    const projector = await teach(page, context);
    await expect(page.getByRole("heading", { name: "Анонимни прашања (0)" })).toBeVisible();
    await expect(page.getByText("Уште нема прашања.")).toBeVisible();
    await go(context, TEACHING_AT + 30);
    const first = page.getByTestId("anon").first();
    await expect(page.getByRole("heading", { name: "Анонимни прашања (1)" })).toBeVisible();
    await expect(first.locator(".inbox__who strong")).not.toBeEmpty();
    await expect(first.locator(".inbox__who")).toContainText(/\d\d:\d\d/);
    await expect(first.locator(".inbox__text")).not.toBeEmpty();
    await expect(page.getByTestId("inbox-said")).toHaveText(/^Ново прашање од /);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByTestId("inbox-said")).toHaveAttribute("role", "status");
    // The projector shows nothing of it.
    const text = await first.locator(".inbox__text").innerText();
    await expect(projector.getByText(text)).toHaveCount(0);
  });

  test("newest first; marking one answered moves it down and dims it; taking it back puts it where its time puts it", async ({ page, context }) => {
    await teach(page, context);
    await go(context, TEACHING_AT + 80);
    const items = page.getByTestId("anon");
    await expect(items).toHaveCount(2);
    const texts = await items.locator(".inbox__text").allInnerTexts();
    const times = await items.locator(".inbox__who").allInnerTexts();
    // Newest first: the times do not go up.
    expect(times[0].slice(-5) >= times[1].slice(-5)).toBe(true);
    const newest = items.first();
    const name = await newest.locator(".inbox__who strong").innerText();
    await newest.getByRole("button", { name: `Означи како одговорено: прашање од ${name}` }).click();
    await expect(items.last().locator(".inbox__text")).toHaveText(texts[0]);
    await expect(items.last()).toHaveAttribute("data-answered", "true");
    await expect(items.last()).toContainText("Одговорено");
    await expect(items.first()).toHaveAttribute("data-answered", "false");
    expect(await items.last().evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(1);
    // Taking it back.
    await items.last().getByRole("button", { name: `Врати: прашање од ${name}` }).click();
    await expect(items.first().locator(".inbox__text")).toHaveText(texts[0]);
    await expect(items.first()).toHaveAttribute("data-answered", "false");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the text goes to the projector never, not in its page and not in what it keeps; and a reload of the console keeps what was marked", async ({ page, context }) => {
    const projector = await teach(page, context);
    await go(context, TEACHING_AT + 80);
    const items = page.getByTestId("anon");
    await expect(items).toHaveCount(2);
    const texts = await items.locator(".inbox__text").allInnerTexts();
    const name = await items.first().locator(".inbox__who strong").innerText();
    await items.first().getByRole("button", { name: `Означи како одговорено: прашање од ${name}` }).click();
    for (const text of texts) {
      expect(await projector.content()).not.toContain(text);
      expect(await projector.evaluate(() => JSON.stringify([sessionStorage, ...Object.values(window)].filter((v) => typeof v === "string"))).catch(() => "")).not.toContain(text);
    }
    await page.reload();
    await expect(page.getByTestId("anon")).toHaveCount(2);
    await expect(page.getByTestId("anon").last()).toHaveAttribute("data-answered", "true");
  });
});

test.describe("flags and the nudge", () => {
  test("a student who leaves the app during a question is shown quietly in the roster, in an icon and words, never as a warning", async ({ page, context }) => {
    await teach(page, context);
    // Questions are sent and closed until a student has left the app: it happens in most of them, and the same way every time.
    let t = TEACHING_AT;
    for (let n = 1; n <= 3; n++) {
      await go(context, t);
      await listSend(page, n).click();
      t += 14;
      await go(context, t);
      if ((await page.getByTestId("focus").count()) > 0) break;
      t += 20;
      await go(context, t);
      await reveal(page).click();
    }
    const flag = page.getByTestId("focus").first();
    await expect(flag).toBeVisible();
    await expect(flag).toHaveText(/^Излезе од апликацијата (1 пат|\d+ пати)$/);
    await expect(flag.locator("svg")).toHaveCount(1);
    await expect(page.locator(".person__focus [role=alert], .person__focus .problem")).toHaveCount(0);
    const color = await flag.evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toMatch(/^rgb\(2[2-4]\d, [0-5]?\d, [0-5]?\d\)/);
  });

  test("while a question is open each student who is here says answered or not answered, in an icon and a word, and one is offline", async ({ page, context }) => {
    await teach(page, context);
    await send(page).click();
    let saw = { answered: false, not: false, offline: false };
    for (let s = 3; s < 30; s += 3) {
      await go(context, TEACHING_AT + s);
      await expect(panel(page).getByTestId("countdown")).toHaveText(new RegExp(`^Уште ${30 - s} секунд(а|и)$`));
      saw = {
        answered: saw.answered || (await page.locator(".person__answer[data-answer=answered]").count()) > 0,
        not: saw.not || (await page.locator(".person__answer[data-answer=not_answered]").count()) > 0,
        offline: saw.offline || (await page.locator(".person[data-state=offline]").count()) > 0,
      };
    }
    expect(saw).toEqual({ answered: true, not: true, offline: true });
    const one = page.locator(".person__answer[data-answer=answered]").first();
    await expect(one).toHaveText("Одговори");
    await expect(one.locator("svg")).toHaveCount(1);
    await go(context, TEACHING_AT + 31);
    await expect(page.locator(".person__answer")).toHaveCount(0);
  });

  test("the nudge: after a while with no question one quiet line near the yellow button, no window and no sound, gone when a question is sent", async ({ page, context }) => {
    await teach(page, context);
    await go(context, TEACHING_AT + 80);
    await expect(page.getByTestId("nudge")).toHaveCount(0);
    await go(context, TEACHING_AT + 90);
    const nudge = page.getByTestId("nudge");
    await expect(nudge).toHaveText("Помина 1 минута без прашање.");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    // It is in the panel with the yellow button, not elsewhere.
    await expect(panel(page).getByTestId("nudge")).toBeVisible();
    expect(await page.locator("audio").count()).toBe(0);
    await send(page).click();
    await expect(nudge).toHaveCount(0);
  });
});

test.describe("coming back", () => {
  test("a reload of the console in the middle of a question finds the panel as it was, with the time left", async ({ page, context }) => {
    await teach(page, context);
    await send(page).click();
    await go(context, TEACHING_AT + 10);
    await expect(panel(page).getByTestId("countdown")).toHaveText("Уште 20 секунди");
    await page.reload();
    await expect(panel(page).getByTestId("countdown")).toHaveText("Уште 20 секунди");
    await expect(panel(page).getByTestId("progress")).toHaveText(progress);
    await expect(listItem(page, 1)).toContainText("Испратено");
    await expect(yellow(page)).toHaveCount(0);
    await go(context, TEACHING_AT + 31);
    await page.reload();
    await expect(yellow(page)).toHaveText("Прикажи го точниот одговор");
    await reveal(page).click();
    await page.reload();
    await expect(panel(page).getByTestId("right-answer")).toHaveText("Точен одговор: 36");
    await expect(yellow(page)).toHaveText("Испрати го следното прашање");
  });

  test("a reload of the projector in the middle of a question, and after it, finds the same screen", async ({ page, context }) => {
    const projector = await teach(page, context);
    await send(page).click();
    await go(context, TEACHING_AT + 10);
    await expect(projector.getByTestId("cv-seconds")).toContainText("20");
    await projector.reload();
    await expect(projector.getByTestId("cv-prompt")).toHaveText("Колку е 15% од 240?");
    await expect(projector.getByTestId("cv-seconds")).toContainText("20");
    await expect(projector.getByText("Точен одговор")).toHaveCount(0);
    await go(context, TEACHING_AT + 31);
    await reveal(page).click();
    await projector.reload();
    await expect(projector.getByTestId("cv-answer")).toHaveText("Точниот број е 36");
    await expect(projector.getByTestId("cv-board")).toBeVisible();
  });

  test("a second console window, opened in the middle, shows the same panel", async ({ page, context }) => {
    await teach(page, context);
    await send(page).click();
    await go(context, TEACHING_AT + 10);
    const other = await context.newPage();
    await other.goto(page.url());
    await expect(other.locator(".qpanel").getByTestId("countdown")).toHaveText("Уште 20 секунди");
    await other.close();
  });
});

test.describe("the projector shows no private thing", () => {
  test("not the answer before the reveal, not the names of the class but in the ranking, and nothing of the inbox", async ({ page, context }) => {
    const projector = await teach(page, context);
    await listSend(page, 2).click();
    await go(context, TEACHING_AT + 26);
    await expect(projector.getByText("Времето истече")).toBeVisible();
    const html = await projector.content();
    expect(html).not.toContain("Точен одговор");
    expect(html).not.toContain("data-right");
    expect(html).not.toContain("25% од 800 е 200");
    await go(context, TEACHING_AT + 90);
    await expect(page.getByTestId("anon")).not.toHaveCount(0);
    for (const text of await page.getByTestId("anon").locator(".inbox__text").allInnerTexts()) expect(await projector.content()).not.toContain(text);
    await expect(projector.getByText("Анонимни")).toHaveCount(0);
  });
});

test.describe("a picture on a projected question", () => {
  test("the picture is shown with its words as its name, and the question still reads", async ({ page, context }) => {
    await context.clock.setFixedTime(T0);
    await page.goto("/teacher/library/lib-planimetrija");
    await page.getByRole("button", { name: "Копирај во моите лекции" }).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/l-n\d+$/);
    await page.goto("/teacher");
    await cards(page).filter({ hasText: "Планиметрија" }).getByRole("button", { name: "Започни час" }).click();
    await page.getByRole("dialog").getByRole("radio", { name: /II-4/ }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Започни со II-4" }).click();
    await expect(page).toHaveURL(/\/teacher\/live\//);
    const projector = await openProjector(page, context);
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    const item = page.locator(".qitem", { hasText: "хипотенузата" });
    await item.getByRole("button", { name: /^Испрати го прашањето/ }).click();
    const picture = projector.getByTestId("cv-picture");
    await expect(picture).toBeVisible();
    expect(await picture.getAttribute("alt")).toMatch(/\S/);
    await expect(projector.getByTestId("cv-prompt")).toContainText("хипотенузата");
    expect(await picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    // The whole screen still fits, with the picture.
    for (const size of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
      await projector.setViewportSize(size);
      expect(await projector.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight])).toEqual([0, 0]);
      const foot = (await projector.locator(".cvq__foot").boundingBox())!;
      expect(foot.y + foot.height).toBeLessThanOrEqual(size.height);
    }
  });
});

test.describe("the keyboard alone", () => {
  test("send, skip's question, the answer and the next, with the focus always where the next thing to do is", async ({ page, context }) => {
    await teach(page, context);
    const inPanel = () => page.evaluate(() => !!document.activeElement?.closest(".qpanel"));
    await send(page).focus();
    await page.keyboard.press("Enter");
    await expect(panel(page).getByTestId("countdown")).toBeVisible();
    // The button that had the focus is gone: the focus is in the panel, so Tab goes on to Skip.
    expect(await inPanel()).toBe(true);
    await page.keyboard.press("Tab");
    await expect(skipInPanel(page)).toBeFocused();
    await page.keyboard.press("Enter");
    // The safe answer has the focus; Enter on it changes nothing.
    await expect(page.getByRole("button", { name: "Не, остави го" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel(page).getByTestId("countdown")).toBeVisible();
    await go(context, TEACHING_AT + 31);
    // The time is up while the focus is on Skip: it stays where the teacher is.
    await expect(yellow(page)).toHaveText("Прикажи го точниот одговор");
    await yellow(page).focus();
    await page.keyboard.press("Enter");
    // The yellow button of the next step has the focus.
    await expect(yellow(page)).toHaveText("Испрати го следното прашање");
    await expect(yellow(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel(page)).toContainText("Прашање 2 од 6");
    expect(await inPanel()).toBe(true);
  });

  test("the quick question and the inbox work with the keyboard", async ({ page, context }) => {
    await teach(page, context);
    await go(context, TEACHING_AT + 30);
    await page.getByRole("button", { name: "Брзо прашање" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Брзо прашање" });
    await expect(dialog.getByLabel("Прашањето")).toBeFocused();
    await page.keyboard.type("Дали е 9 квадрат?");
    await dialog.getByRole("radio", { name: "Точно", exact: true }).focus();
    await page.keyboard.press("Space");
    await dialog.getByRole("button", { name: "Испрати го веднаш" }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(panel(page)).toContainText("Брзо прашање");
    const mark = page.getByTestId("anon").first().getByRole("button", { name: /^Означи како одговорено/ });
    await mark.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("anon").last()).toHaveAttribute("data-answered", "true");
  });
});

test.describe("words and zoom", () => {
  test("in English, a school: the panel, the list, the dialog, the inbox and the projector speak English", async ({ page, context }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "en", schoolType: "school", schoolSeen: true })), SETTINGS_KEY);
    await context.clock.setFixedTime(T0);
    await page.goto("/teacher");
    await cards(page).filter({ hasText: "Проценти и пропорции" }).getByRole("button", { name: "Start lesson" }).click();
    await page.getByRole("dialog", { name: "Which class?" }).getByRole("radio", { name: /II-4/ }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Start with II-4" }).click();
    const projector = await openProjector(page, context, "Open the projector screen");
    await at(context, TEACHING_AT, page);
    await page.getByRole("button", { name: "Start the lesson" }).click();
    await page.getByRole("button", { name: "Yes, start the lesson" }).click();
    await expect(page.getByRole("heading", { name: "The question now" })).toBeVisible();
    await expect(panel(page)).toContainText("Next question: Question 1 of 6, answer with a number");
    await expect(page.getByRole("button", { name: "Send the question", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "The questions of this lesson" })).toBeVisible();
    await expect(listItem(page, 1)).toContainText("Not sent");
    await expect(page.getByRole("heading", { name: "Questions from the class (0)" })).toBeVisible();
    await page.getByRole("button", { name: "Quick question" }).click();
    await expect(page.getByRole("dialog", { name: "Quick question" }).getByRole("radio", { name: "True or false" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Skip", exact: true }).first().click();
    await expect(page.getByRole("alertdialog")).toContainText("Skip this question?");
    await page.getByRole("button", { name: "No, keep it" }).click();
    await page.getByRole("button", { name: "Send the question", exact: true }).click();
    await expect(panel(page).getByTestId("countdown")).toHaveText("30 seconds left");
    await expect(projector.getByText("Answer with a number")).toBeVisible();
    await go(context, TEACHING_AT + 31);
    await page.getByRole("button", { name: "Show the right answer" }).click();
    await expect(panel(page).getByTestId("right-answer")).toHaveText("Right answer: 36");
    await expect(projector.getByTestId("cv-answer")).toHaveText("The right number is 36");
    await expect(projector.getByRole("heading", { name: "Best so far" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Help/ })).toHaveAttribute("target", "_blank");
  });

  test("at a faculty the panel and the inbox say students", async ({ page, context }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "mk", schoolType: "university", schoolSeen: true })), SETTINGS_KEY);
    await context.clock.setFixedTime(T0);
    await page.goto("/teacher");
    await cards(page).first().getByRole("button", { name: "Започни час" }).click();
    await page.getByRole("dialog", { name: "Со која група?" }).getByRole("button", { name: /^Започни со Група 1А$/ }).click();
    await page.getByRole("button", { name: "Почни го часот" }).click();
    await page.getByRole("button", { name: "Да, почни го часот" }).click();
    await expect(panel(page).getByText(/Вашите студенти го гледаат на телефон/)).toBeVisible();
    await expect(page.getByText(/Вашите студенти Ви пишуваат овде/)).toBeVisible();
  });

  test("Help opens in a new window from a running lesson, so the console is never left", async ({ page, context }) => {
    await start(page, context);
    const help = page.getByRole("link", { name: /^Помош/ });
    await expect(help).toHaveAttribute("target", "_blank");
    await expect(page.getByRole("link", { name: /Како да го наместам/ })).toHaveAttribute("target", "_blank");
    const opened = context.waitForEvent("page");
    await help.click();
    const popup = await opened;
    await expect(popup).toHaveURL(/\/teacher\/help/);
    await expect(page).toHaveURL(/\/teacher\/live\//);
  });

  test("the console works at 200% zoom while teaching: no sideways scroll, the yellow button in reach, and every button 48px tall", async ({ page, context }) => {
    await teach(page, context);
    await page.setViewportSize({ width: 640, height: 360 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await send(page).scrollIntoViewIfNeeded();
    await expect(send(page)).toBeInViewport();
    for (const h of await page.locator(".live button:visible, .live a.btn:visible").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(47.5);
  });

  test("the panel and its yellow button are in the first screen at 1280 x 720 and 1024 x 768, and nothing scrolls sideways", async ({ page, context }) => {
    await teach(page, context);
    for (const size of [{ width: 1024, height: 768 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(size);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(send(page)).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    }
  });

  test("the projector fits 1920 x 1080, 1280 x 720 and 1024 x 768 in every state with no scroll, and nothing on it is under 20px", async ({ page, context }) => {
    const projector = await teach(page, context);
    await listSend(page, 2).click();
    const check = async (label: string) => {
      for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
        await projector.setViewportSize(size);
        expect(await projector.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight]), `${label} ${size.width}`).toEqual([0, 0]);
        const small = await projector.evaluate(() =>
          [...document.querySelectorAll("main *")]
            .filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()) && getComputedStyle(el).display !== "none" && !el.closest(".sr"))
            .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 20 && !el.classList.contains("sr"))
            .map((el) => el.textContent),
        );
        expect(small, `${label} ${size.width}`).toEqual([]);
      }
    };
    await expect(projector.getByTestId("cv-option")).toHaveCount(4);
    await check("open");
    await go(context, TEACHING_AT + 26);
    await expect(projector.getByText("Времето истече")).toBeVisible();
    await check("closed");
    await reveal(page).click();
    await expect(projector.getByTestId("cv-bar")).toHaveCount(4);
    await check("revealed");
  });
});
