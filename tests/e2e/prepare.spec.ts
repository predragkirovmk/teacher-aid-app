import type { Page } from "@playwright/test";
import { makeDocx } from "./docx";
import { expect, MOCK_KEY, SETTINGS_KEY, test } from "./fixtures";

/**
 * Prepare a lesson (F-03): the three parts and the one yellow button, the wait on the same page in its two parts, every
 * failure, and the draft page the wait ends on, in mock mode, in Macedonian unless a test changes the language. The demo
 * school is a gymnasium: the demo teacher has one subject (Математика) in three years (II-4, III-5, IV-1), so the subject is
 * stated and the year is offered; at the faculty it is the other way round. The demo's AI takes 1.5 s to read a document
 * and 8 s to write the questions, and can be made to fail with `[fail]`, to fail once with `[fail-once]` and to never answer
 * with `[slow]` in what is typed (or in a document's name).
 */

const NEW = "/teacher/lessons/new";
const TYPED = "Равенки од втор степен и дискриминантата. Учениците треба да знаат да ги решаваат.";

const title = (page: Page) => page.getByRole("heading", { level: 1 });
const yellow = (page: Page) => page.locator(".btn--primary:visible");
const go = (page: Page) => page.getByRole("button", { name: "Подготви прашања", exact: true });
const cancel = (page: Page) => page.getByRole("button", { name: "Откажи", exact: true });
const retry = (page: Page) => page.getByRole("button", { name: "Обиди се повторно", exact: true });
const backToForm = (page: Page) => page.getByRole("button", { name: "Промени го внесеното", exact: true });
// Inside the page: Next keeps an empty alert of its own, to announce a new page.
const alerts = (page: Page) => page.locator("main").getByRole("alert");
const textbox = (page: Page) => page.getByRole("textbox", { name: "Напишете неколку реченици за темата" });
const emphasis = (page: Page) => page.getByRole("textbox", { name: /^3\. Што да се нагласи\?/ });
const fileInput = (page: Page) => page.locator('input[type="file"]');
const menu = (page: Page) => page.getByRole("navigation", { name: "Главно мени" });
const leaveDialog = (page: Page) => page.getByRole("alertdialog", { name: "Дали сакате да ја напуштите страницата?" });
const phase = (page: Page, words: string) => page.getByRole("heading", { level: 2, name: words });

const demo = (page: Page) =>
  page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) ?? "null");
    return { sources: state?.school?.sources ?? [], drafts: state?.school?.drafts ?? [] } as {
      sources: { kind: string; file_name: string | null; text: string }[];
      drafts: { id: string; title: string }[];
    };
  }, MOCK_KEY);

const sourcesMade = async (page: Page) => (await demo(page)).sources.length;

/** The year of the lesson (the demo teacher has II-4, III-5 and IV-1) and the sentences. */
async function yearTwo(page: Page) {
  await page.getByRole("radio", { name: /^II година/ }).check();
  await expect(page.getByRole("radio", { name: /^II година/ })).toBeChecked();
}
async function typeSentences(page: Page, text = TYPED) {
  await page.getByRole("radio", { name: /^Неколку реченици/ }).check();
  await textbox(page).fill(text);
}
const docx = (name = "Логаритми.docx") => ({
  name,
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  buffer: makeDocx(["Логаритми", "Дефиниција и својства на логаритам."]),
});
async function chooseDocument(page: Page, file: { name: string; mimeType: string; buffer: Buffer } = docx()) {
  await page.getByRole("radio", { name: /^Документ/ }).check();
  await fileInput(page).setInputFiles(file);
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.beforeEach(async ({ page }) => {
  await page.goto(NEW);
  await expect(title(page)).toHaveText("Подготви лекција");
});

// ---- The form -------------------------------------------------------------------------------------------------------

test.describe("the form", () => {
  test("has three numbered parts and one yellow button that is never disabled, and nothing is chosen but what is only one", async ({ page }) => {
    for (const heading of ["1. Предмет и година", "2. Материјал", "3. Што да се нагласи?"]) {
      await expect(page.getByRole("heading", { level: 2, name: new RegExp(`^${heading.replace("?", "\\?")}`) })).toBeVisible();
    }
    // One subject: stated as a plain line, not offered and not a row that looks chosen. Several years: offered, none chosen.
    await expect(page.getByRole("radio", { name: /^Математика/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 3, name: "Предмет" })).toHaveCount(0);
    await expect(page.locator(".prepare__stated")).toHaveText("Предмет: Математика");
    const stated = page.locator(".prepare__stated");
    await expect(stated.locator("svg")).toHaveCount(0);
    expect(await stated.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
    expect(await stated.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    const years = page.getByRole("radio", { name: / година/ });
    await expect(years).toHaveCount(3);
    for (const radio of await years.all()) await expect(radio).not.toBeChecked();
    // The years are told by the classes.
    await expect(page.getByRole("radio", { name: /^II година\s*II-4/ })).toBeVisible();
    // Two ways to add the material, neither chosen, and nothing shown of either until one is.
    await expect(page.getByRole("radio", { name: /^Документ/ })).not.toBeChecked();
    await expect(page.getByRole("radio", { name: /^Неколку реченици/ })).not.toBeChecked();
    await expect(fileInput(page)).toHaveCount(0);
    await expect(textbox(page)).toHaveCount(0);
    // The third part says it is optional once: in its badge, and not again in the words under it.
    await expect(page.getByText("По желба", { exact: true })).toBeVisible();
    await expect(page.getByText("Не мора", { exact: false })).toHaveCount(0);
    await expect(page.getByText(/^Една реченица, на пример:/)).toBeVisible();

    await expect(yellow(page)).toHaveCount(1);
    await expect(go(page)).toHaveClass(/btn--primary/);
    await expect(go(page)).toBeEnabled();
    expect((await go(page).boundingBox())!.height).toBeGreaterThanOrEqual(56);
  });

  test("the sentences go in an 18px box, with a hint and no count, and the document has a big button on a real file input", async ({ page }) => {
    await page.getByRole("radio", { name: /^Неколку реченици/ }).check();
    await expect(page.getByText(/^Најмалку 40 знаци/)).toBeVisible();
    expect(await textbox(page).evaluate((el) => getComputedStyle(el).fontSize)).toBe("18px");
    // Typing is not counted, aloud or on screen.
    await textbox(page).pressSequentially("Логаритми");
    await expect(page.getByText(/^\d+ од \d+$/)).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: /\d/ })).toHaveCount(0);

    await page.getByRole("radio", { name: /^Документ/ }).check();
    await expect(fileInput(page)).toHaveAttribute("type", "file");
    await expect(fileInput(page)).toHaveAttribute("accept", /\.pdf.*\.docx/);
    const pick = page.locator("label.btn", { hasText: "Избери документ" });
    await expect(pick).toBeVisible();
    expect((await pick.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    // The two plain rules under it: size, and no students' data (EC-LES-05).
    await expect(page.getByText("PDF или Word (.docx), најмногу 20 MB.")).toBeVisible();
    await expect(page.getByText("Не прикачувајте документи со имиња или други податоци на Вашите ученици.")).toBeVisible();
  });

  test("a chosen document shows its name and size, with 'Избери друг' and 'Отстрани', and Remove puts the focus back on the choosing", async ({ page }) => {
    await chooseDocument(page);
    await expect(page.locator(".drop__name")).toHaveText("Логаритми.docx");
    await expect(page.locator(".drop__size")).toHaveText(/^\d+ KB$/);
    await expect(page.locator("label.btn", { hasText: "Избери друг" })).toBeVisible();
    await page.getByRole("button", { name: "Отстрани", exact: true }).click();
    await expect(page.locator(".drop__name")).toHaveCount(0);
    await expect(page.locator("label.btn", { hasText: "Избери документ" })).toBeVisible();
    await expect(fileInput(page)).toBeFocused();
  });

  test("a document dropped on the area is taken too", async ({ page }) => {
    await page.getByRole("radio", { name: /^Документ/ }).check();
    const data = await page.evaluateHandle((bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], "Фрлен.docx"));
      return transfer;
    }, [...docx().buffer]);
    await page.locator(".drop").dispatchEvent("drop", { dataTransfer: data });
    await expect(page.locator(".drop__name")).toHaveText("Фрлен.docx");
  });

  test("the sentence of emphasis has a count only near its limit, says when it is reached, and takes no more", async ({ page }) => {
    await emphasis(page).fill("x".repeat(150));
    await expect(page.getByText(/ од 200$/)).toHaveCount(0);
    await emphasis(page).fill("x".repeat(170));
    await expect(page.getByText("170 од 200")).toBeVisible();
    await emphasis(page).fill("x".repeat(250));
    await expect(emphasis(page)).toHaveValue("x".repeat(200));
    await expect(page.getByText("200 од 200")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Тоа е најмногу што може да се напише: 200 знаци." })).toHaveCount(1);
  });

  test("Back names where the teacher came from and goes there: Today, else Lessons", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Назад кон Лекции", exact: true })).toHaveAttribute("href", "/teacher/lessons");
    await page.goto("/teacher");
    await page.getByRole("link", { name: "Подготви лекција" }).click();
    await expect(title(page)).toHaveText("Подготви лекција");
    await expect(page).toHaveURL(/\/teacher\/lessons\/new\?from=today$/);
    await page.getByRole("link", { name: "Назад кон Денес", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(title(page)).toHaveText("Денес");
  });
});

// ---- What is missing or wrong, said before anything is sent -------------------------------------------------------

test.describe("what is missing or wrong", () => {
  test("the button with nothing chosen says what is missing next to each part and puts the focus on the first", async ({ page }) => {
    await go(page).click();
    // The year and how the material is added; the subject is stated, so there is nothing to ask about it.
    await expect(alerts(page)).toHaveCount(2);
    await expect(alerts(page).nth(0)).toHaveText("Изберете година.");
    await expect(alerts(page).nth(1)).toHaveText("Изберете како ќе го додадете материјалот: со документ или со неколку реченици.");
    await expect(page.getByRole("radio", { name: /^II година/ })).toBeFocused();
    // Each is inside its own part.
    await expect(page.getByRole("region", { name: /^1\. Предмет и година/ }).getByRole("alert")).toHaveText("Изберете година.");
    await expect(page.getByRole("region", { name: /^2\. Материјал/ }).getByRole("alert")).toHaveText(/^Изберете како/);

    // Fixing one removes its words, and the next press goes to the next.
    await yearTwo(page);
    await expect(alerts(page)).toHaveCount(1);
    await go(page).click();
    await expect(alerts(page)).toHaveCount(1);
    await expect(page.getByRole("radio", { name: /^Документ/ })).toBeFocused();
    // Nothing was sent.
    expect(await sourcesMade(page)).toBe(0);
  });

  test("a document kind with no document asks for one, and the focus goes to the file input", async ({ page }) => {
    await yearTwo(page);
    await page.getByRole("radio", { name: /^Документ/ }).check();
    await go(page).click();
    await expect(alerts(page)).toHaveText("Изберете документ или напишете неколку реченици наместо тоа.");
    await expect(fileInput(page)).toBeFocused();
  });

  test("typed sentences that are missing, or under 40 characters, say so at the box and keep the focus there", async ({ page }) => {
    await yearTwo(page);
    await page.getByRole("radio", { name: /^Неколку реченици/ }).check();
    await go(page).click();
    await expect(alerts(page)).toHaveText("Напишете неколку реченици за темата.");
    await expect(textbox(page)).toBeFocused();
    await expect(textbox(page)).toHaveAttribute("aria-invalid", "true");

    await textbox(page).fill("Кратко.");
    await expect(alerts(page)).toHaveCount(0);
    await go(page).click();
    await expect(alerts(page)).toContainText("Текстот е прекраток");
    await expect(alerts(page)).toContainText("Напишете барем 40 знаци");
    await expect(textbox(page)).toBeFocused();
    // The wait never began, and nothing was sent.
    await expect(cancel(page)).toHaveCount(0);
    expect(await sourcesMade(page)).toBe(0);

    await textbox(page).fill(TYPED);
    await expect(alerts(page)).toHaveCount(0);
  });

  test("a document that is not a PDF or Word is said so where it was chosen, and the button does not send it", async ({ page }) => {
    await yearTwo(page);
    await chooseDocument(page, { name: "слика.png", mimeType: "image/png", buffer: Buffer.from("png") });
    await expect(alerts(page)).toContainText("Ова не е PDF или Word документ");
    await expect(alerts(page)).toContainText("Изберете друг документ.");
    // The name is still there to read, and "Избери друг" is the way forward.
    await expect(page.locator(".drop__name")).toHaveText("слика.png");
    await go(page).click();
    await expect(cancel(page)).toHaveCount(0);
    await expect(fileInput(page)).toBeFocused();
    expect(await sourcesMade(page)).toBe(0);
    // Choosing another one clears it.
    await fileInput(page).setInputFiles(docx());
    await expect(alerts(page)).toHaveCount(0);
  });

  test("a document over 20 MB says so, and offers typing instead; an empty one says it is empty", async ({ page }) => {
    await yearTwo(page);
    await chooseDocument(page, { name: "голем.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(21 * 1024 * 1024, 1) });
    await expect(alerts(page)).toContainText("Документот е преголем");
    await expect(alerts(page)).toContainText("Поголем е од 20 MB. Изберете помал документ или напишете неколку реченици.");
    await expect(page.locator(".drop__size")).toHaveText("21 MB");
    await go(page).click();
    expect(await sourcesMade(page)).toBe(0);

    await fileInput(page).setInputFiles({ name: "празен.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) });
    await expect(alerts(page)).toContainText("Документот е празен");
    await expect(alerts(page)).toContainText("Изберете друг документ.");
  });

  test("a scan has no text: the document is read, then the form says so and offers typing, with everything kept", async ({ page }) => {
    await yearTwo(page);
    await chooseDocument(page, { name: "скен-1.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 a picture of a page") });
    await emphasis(page).fill("Повеќе примери.");
    await go(page).click();
    await expect(phase(page, "Го читаме документот")).toBeVisible();
    // Back on the form, at part 2, with the reason in words.
    await expect(alerts(page)).toContainText("Во документот нема текст");
    await expect(alerts(page)).toContainText("Веројатно е скениран");
    await expect(page.locator(".drop__name")).toHaveText("скен-1.pdf");
    await expect(page.getByRole("radio", { name: /^II година/ })).toBeChecked();
    await expect(emphasis(page)).toHaveValue("Повеќе примери.");
    await expect(fileInput(page)).toBeFocused();
    expect(await sourcesMade(page)).toBe(0);

    // The button switches part 2 to typing, and the focus goes to the box.
    await page.getByRole("button", { name: "Напиши неколку реченици", exact: true }).click();
    await expect(page.getByRole("radio", { name: /^Неколку реченици/ })).toBeChecked();
    await expect(alerts(page)).toHaveCount(0);
    await expect(textbox(page)).toBeFocused();
    await expect(page.getByRole("radio", { name: /^II година/ })).toBeChecked();
    await expect(emphasis(page)).toHaveValue("Повеќе примери.");
  });
});

// ---- The wait, and what comes of it ---------------------------------------------------------------------------------

test.describe("the wait", () => {
  test.slow();

  test("typed sentences: one honest phase, no percentage, Cancel outlined, and the draft opens in place of the wait", async ({ page }) => {
    await page.goto("/teacher");
    await page.getByRole("link", { name: "Подготви лекција" }).click();
    await yearTwo(page);
    await typeSentences(page);
    await emphasis(page).fill("Повеќе примери.");
    await go(page).click();

    // The wait is on the same page. The sentences were taken at once, so there is no reading part.
    await expect(page).toHaveURL(/\/teacher\/lessons\/new/);
    await expect(phase(page, "Ги пишуваме прашањата")).toBeFocused();
    await expect(page.getByText(/^Чекор \d од 2$/)).toHaveCount(0);
    await expect(page.getByText("Ова може да потрае до 3 минути. Оставете ја оваа страница отворена.")).toBeVisible();
    await expect(cancel(page)).toHaveClass(/btn--secondary/);
    await expect(yellow(page)).toHaveCount(0);
    await expect(page.locator("main").getByText(/\d\s*%/)).toHaveCount(0);

    await expect(title(page)).toHaveText("Квадратни равенки", { timeout: 20_000 });
    await expect(page).toHaveURL(/\/teacher\/lessons\/drafts\/d\d+\?from=today$/);
    // Back from the draft goes to where the teacher started, not to the wait.
    await page.goBack();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(title(page)).toHaveText("Денес");
  });

  test("a document: first it is read, then the questions are written, and the file is named Word's own", async ({ page }) => {
    await yearTwo(page);
    await chooseDocument(page);
    await go(page).click();
    await expect(phase(page, "Го читаме документот")).toBeVisible();
    await expect(page.getByText("Чекор 1 од 2", { exact: true })).toBeVisible();
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Чекор 2 од 2", { exact: true })).toBeVisible();
    await expect(title(page)).toHaveText("Логаритми", { timeout: 20_000 });
    const { sources } = await demo(page);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ kind: "upload", file_name: "Логаритми.docx" });
  });

  test("Cancel returns to the form with everything kept, and nothing is made", async ({ page }) => {
    await yearTwo(page);
    await typeSentences(page);
    await emphasis(page).fill("Повеќе примери.");
    await go(page).click();
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
    await cancel(page).click();
    await expect(go(page)).toBeFocused();
    // The focus lands on a button that says nothing of what happened, so the form says it, aloud only.
    await expect(page.getByRole("status").filter({ hasText: "Откажано. Сè што внесовте е сочувано." })).toHaveCount(1);
    await expect(page.getByRole("radio", { name: /^II година/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /^Неколку реченици/ })).toBeChecked();
    await expect(textbox(page)).toHaveValue(TYPED);
    await expect(emphasis(page)).toHaveValue("Повеќе примери.");
    // The request was dropped: no draft turns up later.
    await page.waitForTimeout(9_000);
    await expect(page).toHaveURL(/\/teacher\/lessons\/new/);
    expect((await demo(page)).drafts).toHaveLength(0);
  });

  test("Cancel while the document is being read keeps the document", async ({ page }) => {
    await yearTwo(page);
    await chooseDocument(page);
    await go(page).click();
    await expect(phase(page, "Го читаме документот")).toBeVisible();
    await cancel(page).click();
    await expect(page.locator(".drop__name")).toHaveText("Логаритми.docx");
    await expect(page.getByRole("radio", { name: /^Документ/ })).toBeChecked();
    await page.waitForTimeout(2_000);
    expect(await sourcesMade(page)).toBe(0);
  });

  test("when the AI cannot write the questions: plain words, the yellow button to try again, Back to the form with everything kept", async ({ page }) => {
    await yearTwo(page);
    await typeSentences(page, `${TYPED} [fail]`);
    await go(page).click();
    await expect(alerts(page)).toContainText("Не успеавме да ги напишеме прашањата", { timeout: 20_000 });
    await expect(alerts(page)).toContainText("Вашиот материјал и сè што внесовте се сочувани.");
    await expect(retry(page)).toHaveClass(/btn--primary/);
    await expect(retry(page)).toBeFocused();
    await expect(yellow(page)).toHaveCount(1);
    await expect(backToForm(page)).toHaveClass(/btn--secondary/);
    // The focus is on the way forward, which is read together with what went wrong; and there is no second "Назад" beside the
    // page's own Back, which leaves the page.
    await expect(retry(page)).toHaveAccessibleDescription(/Не успеавме да ги напишеме прашањата.*Обидете се повторно\./);
    await expect(page.getByRole("button", { name: "Назад", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Назад кон Лекции" })).toBeVisible();

    await backToForm(page).click();
    await expect(textbox(page)).toHaveValue(`${TYPED} [fail]`);
    await expect(page.getByRole("radio", { name: /^II година/ })).toBeChecked();
    await expect(go(page)).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: "Сè што внесовте е сочувано." })).toHaveCount(1);
  });

  test("a retry after the questions failed asks again with the same document: no second upload, no second reading", async ({ page }) => {
    await yearTwo(page);
    await chooseDocument(page, docx("Логаритми [fail-once].docx"));
    await go(page).click();
    await expect(alerts(page)).toContainText("Не успеавме да ги напишеме прашањата", { timeout: 20_000 });
    expect(await sourcesMade(page)).toBe(1);

    await retry(page).click();
    // Straight to the questions: the document is not read, or sent, again.
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
    await expect(phase(page, "Го читаме документот")).toHaveCount(0);
    await expect(title(page)).toHaveText("Логаритми", { timeout: 20_000 });
    expect(await sourcesMade(page)).toBe(1);
  });

  test("the same for typed sentences, and a retry that fails again is still one source", async ({ page }) => {
    await yearTwo(page);
    await typeSentences(page, `${TYPED} [fail]`);
    await go(page).click();
    await expect(alerts(page)).toContainText("Не успеавме да ги напишеме прашањата", { timeout: 20_000 });
    await retry(page).click();
    await expect(alerts(page)).toHaveCount(0);
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
    await expect(alerts(page)).toContainText("Не успеавме да ги напишеме прашањата", { timeout: 20_000 });
    expect(await sourcesMade(page)).toBe(1);
  });

  test("with no connection it says so and keeps everything; with the connection back, Try again goes on", async ({ page, context }) => {
    await yearTwo(page);
    await typeSentences(page);
    await go(page).click();
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
    await context.setOffline(true);
    await expect(alerts(page)).toContainText("Нема врска со интернет");
    await expect(alerts(page)).toContainText("Сè што внесовте е сочувано.");
    await expect(retry(page)).toBeVisible();
    // Trying with no connection fails at once, the same way.
    await retry(page).click();
    await expect(alerts(page)).toContainText("Нема врска со интернет");

    await context.setOffline(false);
    await retry(page).click();
    await expect(title(page)).toHaveText("Квадратни равенки", { timeout: 20_000 });
    // The sentences were taken once.
    expect(await sourcesMade(page)).toBe(1);
  });

  test("no empty gap on the wait: the calm line comes under Cancel, and Cancel does not move when it comes", async ({ page }) => {
    await yearTwo(page);
    await typeSentences(page, `${TYPED} [slow]`);
    await page.clock.install();
    await go(page).click();
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
    const sentence = (await page.getByText("Ова може да потрае до 3 минути.").boundingBox())!;
    const before = (await cancel(page).boundingBox())!;
    // The button is the next thing under the sentence, one gap apart (16px), not a line's room further.
    expect(before.y - (sentence.y + sentence.height)).toBeLessThanOrEqual(20);
    // The card ends one padding under the button while there is nothing more to say.
    const card = (await page.locator(".waiting").boundingBox())!;
    expect(card.y + card.height - (before.y + before.height)).toBeLessThanOrEqual(34);

    await page.clock.runFor(21_000);
    const line = page.getByText("Сè уште работиме на тоа.");
    await expect(line).toBeVisible();
    const after = (await cancel(page).boundingBox())!;
    expect(after.y).toBe(before.y);
    expect((await line.boundingBox())!.y).toBeGreaterThan(after.y + after.height);
  });

  test("an AI that does not answer: a calm line at 20 seconds, and at 3 minutes it is a failure with the same retry", async ({ page }) => {
    await yearTwo(page);
    await typeSentences(page, `${TYPED} [slow]`);
    await page.clock.install();
    await go(page).click();
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
    await expect(page.getByText("Сè уште работиме на тоа.")).toHaveCount(0);

    await page.clock.runFor(21_000);
    await expect(page.getByText("Сè уште работиме на тоа. Благодариме за трпението.")).toBeVisible();
    // Said once, in a region that was there before it.
    await expect(page.getByRole("status").filter({ hasText: "Сè уште работиме" })).toHaveCount(1);

    await page.clock.runFor(161_000);
    await expect(alerts(page)).toContainText("Ова трае предолго");
    await expect(alerts(page)).toContainText("Чекавме 3 минути");
    await expect(retry(page)).toHaveClass(/btn--primary/);
    expect(await sourcesMade(page)).toBe(1);
  });
});

// ---- Leaving during the wait ----------------------------------------------------------------------------------------

test.describe("leaving during the wait", () => {
  test.slow();

  test("the app's own links ask first with 'Остани' ready; staying keeps the wait, leaving ends it and makes nothing", async ({ page }) => {
    await yearTwo(page);
    await typeSentences(page);
    await go(page).click();
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();

    await menu(page).getByRole("link", { name: "Денес" }).click();
    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Ако излезете, работата запира");
    await expect(dialog.getByRole("button", { name: "Остани" })).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Остани" })).toHaveClass(/btn--primary/);
    await expect(page).toHaveURL(/\/teacher\/lessons\/new/);

    // Escape is "stay" too.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();

    // The Back link asks as well, and "Остани" stays.
    await page.getByRole("link", { name: "Назад кон Лекции" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Остани" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/teacher\/lessons\/new/);

    await menu(page).getByRole("link", { name: "Библиотека" }).click();
    await dialog.getByRole("button", { name: "Излези" }).click();
    await expect(page).toHaveURL(/\/teacher\/library$/);
    await expect(title(page)).toHaveText("Библиотека");
    // Nobody is waiting any more: no draft turns up.
    await page.waitForTimeout(9_000);
    expect((await demo(page)).drafts).toHaveLength(0);
  });

  test("the form itself is left without a question, and closing the tab during the wait is the browser's own question", async ({ page }) => {
    await menu(page).getByRole("link", { name: "Денес" }).click();
    await expect(title(page)).toHaveText("Денес");
    await expect(leaveDialog(page)).toHaveCount(0);

    await page.getByRole("link", { name: "Подготви лекција" }).click();
    await yearTwo(page);
    await typeSentences(page);
    await go(page).click();
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
    const asked = page.waitForEvent("dialog");
    const closing = page.close({ runBeforeUnload: true });
    const dialog = await asked;
    expect(dialog.type()).toBe("beforeunload");
    // Staying: the wait is still there.
    await dialog.dismiss();
    await closing;
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
  });
});

// ---- Leaving a form that holds work ---------------------------------------------------------------------------------

test.describe("leaving a form that holds work", () => {
  test("typed sentences are asked about before the page is left: Остани keeps them, Излези goes", async ({ page }) => {
    await yearTwo(page);
    await typeSentences(page);
    await menu(page).getByRole("link", { name: "Денес" }).click();
    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Ако излезете, она што го внесовте се губи.");
    // The question about the wait is not the one asked here: nothing is being prepared.
    await expect(dialog).not.toContainText("Прашањата уште се подготвуваат");
    await expect(dialog.getByRole("button", { name: "Остани" })).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Остани" })).toHaveClass(/btn--primary/);
    await dialog.getByRole("button", { name: "Остани" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/teacher\/lessons\/new/);
    await expect(textbox(page)).toHaveValue(TYPED);

    // The page's own Back asks too.
    await page.getByRole("link", { name: "Назад кон Лекции" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Излези" }).click();
    await expect(title(page)).toHaveText("Лекции");
  });

  test("a chosen document, or only a sentence of emphasis, is work too; a year and a way of adding the material are not", async ({ page }) => {
    await yearTwo(page);
    await page.getByRole("radio", { name: /^Документ/ }).check();
    await page.getByRole("radio", { name: /^Неколку реченици/ }).check();
    await menu(page).getByRole("link", { name: "Денес" }).click();
    await expect(title(page)).toHaveText("Денес");
    await expect(leaveDialog(page)).toHaveCount(0);

    await page.goto(NEW);
    await emphasis(page).fill("Повеќе примери.");
    await menu(page).getByRole("link", { name: "Денес" }).click();
    await expect(leaveDialog(page)).toBeVisible();
    await leaveDialog(page).getByRole("button", { name: "Остани" }).click();
    await emphasis(page).fill("");
    await chooseDocument(page);
    await menu(page).getByRole("link", { name: "Денес" }).click();
    await expect(leaveDialog(page)).toBeVisible();
  });

  test("a failure that says everything is kept does not let it be lost with a click: the page asks first there too", async ({ page }) => {
    test.slow();
    await yearTwo(page);
    await typeSentences(page, `${TYPED} [fail]`);
    await go(page).click();
    await expect(retry(page)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("link", { name: "Назад кон Лекции" }).click();
    await expect(leaveDialog(page)).toBeVisible();
    await expect(leaveDialog(page)).toContainText("Ако излезете, она што го внесовте се губи.");
    await leaveDialog(page).getByRole("button", { name: "Остани" }).click();
    await expect(retry(page)).toBeVisible();
    await backToForm(page).click();
    await expect(textbox(page)).toHaveValue(`${TYPED} [fail]`);
  });

  test("an empty form is left without a question, in the drawer layout too", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.getByRole("button", { name: "Мени", exact: true }).click();
    await menu(page).getByRole("link", { name: "Денес" }).click();
    await expect(title(page)).toHaveText("Денес");
    await expect(leaveDialog(page)).toHaveCount(0);
  });
});

// ---- The draft ------------------------------------------------------------------------------------------------------

test.describe("the draft page", () => {
  test.slow();

  /** Make a draft and stand on its page. */
  async function makeDraft(page: Page) {
    await yearTwo(page);
    await typeSentences(page);
    await emphasis(page).fill("Повеќе примери.");
    await go(page).click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/drafts\/d\d+(\?from=today)?$/, { timeout: 20_000 });
    await expect(title(page)).toHaveText("Квадратни равенки");
  }

  test("is read only: the title, subject and year, what was stressed, 5 to 8 questions in order, and the review summary after them", async ({ page }) => {
    await makeDraft(page);
    await expect(page.locator(".head__sub")).toHaveText("Математика · II година");
    await expect(page.getByRole("heading", { level: 2, name: "Што сакавте да се нагласи" })).toBeVisible();
    await expect(page.getByText("„Повеќе примери.“")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Резиме за повторување" })).toBeVisible();
    const questions = page.locator(".questions > li");
    expect(await questions.count()).toBeGreaterThanOrEqual(5);
    expect(await questions.count()).toBeLessThanOrEqual(8);
    await expect(questions.first().getByRole("heading", { level: 3 })).toHaveText(/^Прашање 1 од \d$/);
    await expect(questions.first().getByText("Точен одговор")).toBeVisible();
    // The questions are what is read and checked: they come first, and the summary closes the page.
    const summary = await page.getByRole("heading", { level: 2, name: "Резиме за повторување" }).boundingBox();
    const last = await questions.last().boundingBox();
    expect(summary!.y).toBeGreaterThan(last!.y + last!.height);
    // Nothing to press: it can only be read.
    await expect(page.locator("main").getByRole("button")).toHaveCount(0);
    await expect(page.locator("main textarea, main input")).toHaveCount(0);
  });

  test("the questions start in the first screen of a laptop: the note is a line or two, and nothing stands in front of them", async ({ page }) => {
    await makeDraft(page);
    const note = page.locator(".draft__note");
    await expect(note).toBeVisible();
    // 1280 x 720: the note and the sentence that was stressed, then the first question begins within the window.
    expect((await note.boundingBox())!.height).toBeLessThanOrEqual(120);
    const first = (await page.locator(".questions > li").first().boundingBox())!;
    expect(first.y).toBeGreaterThan(0);
    expect(first.y + 200).toBeLessThanOrEqual(720);
    await expect(page.getByRole("heading", { level: 2, name: "Прашања" })).toBeInViewport();
  });

  test("says honestly, in a line or two, that it is a suggestion, that editing and saving come next, and that it is not on Today yet", async ({ page }) => {
    await makeDraft(page);
    const note = page.locator(".draft__note");
    await expect(note).toContainText("Ова е предлог за читање.");
    await expect(note).toContainText("Следно ќе можете да ги менувате прашањата и да ја зачувате лекцијата.");
    await expect(note).toContainText("Дотогаш таа не се појавува на Денес.");
    await expect(page.getByRole("heading", { level: 2, name: "Наскоро" })).toHaveCount(0);
    // It started on the page that prepares a lesson, opened from Lessons, so that is where Back goes.
    await page.getByRole("link", { name: "Назад кон Лекции", exact: true }).click();
    await expect(title(page)).toHaveText("Лекции");
  });

  test("Back from the draft goes to where the teacher started: Today when it began there", async ({ page }) => {
    await page.goto("/teacher");
    await page.getByRole("link", { name: "Подготви лекција" }).click();
    await makeDraft(page);
    await expect(page).toHaveURL(/\/teacher\/lessons\/drafts\/d\d+\?from=today$/);
    await page.getByRole("link", { name: "Назад кон Денес", exact: true }).click();
    await expect(title(page)).toHaveText("Денес");
    // The draft is not a lesson yet, so Today does not list it.
    await expect(page.locator(".lessons > li")).toHaveCount(2);
  });

  test("a reload finds it again, from the API (EC-LES-09), and so does its link in a new tab", async ({ page, context }) => {
    await makeDraft(page);
    const url = page.url();
    await page.reload();
    await expect(title(page)).toHaveText("Квадратни равенки");
    await expect(page.locator(".questions > li").first()).toBeVisible();
    await expect(page.getByText("„Повеќе примери.“")).toBeVisible();
    const other = await context.newPage();
    await other.goto(url);
    await expect(title(other)).toHaveText("Квадратни равенки");
  });

  test("an address the API does not know says so plainly, with the way to prepare a lesson", async ({ page }) => {
    await page.goto("/teacher/lessons/drafts/d-none");
    await expect(title(page)).toHaveText("Предложена лекција");
    await expect(page.getByRole("heading", { level: 2, name: "Не ја најдовме оваа лекција" })).toBeVisible();
    await expect(page.getByText("Можеби е отстранета или врската е стара.")).toBeVisible();
    const prepare = page.getByRole("link", { name: "Подготви лекција", exact: true });
    await expect(prepare).toHaveClass(/btn--primary/);
    await expect(prepare).toHaveAttribute("href", NEW);
    await expect(yellow(page)).toHaveCount(1);
    await prepare.click();
    await expect(page).toHaveURL(/\/teacher\/lessons\/new/);
  });
});

// ---- Words, wording and zoom -----------------------------------------------------------------------------------------

test.describe("keyboard only", () => {
  test.slow();

  test("a whole lesson can be prepared with the keyboard alone, and the way back from the wait too", async ({ page }) => {
    // Start from the Back link; every step after is a key.
    await page.getByRole("link", { name: "Назад кон Лекции" }).focus();
    await page.keyboard.press("Tab"); // the teacher's name
    await page.keyboard.press("Tab"); // the years: the radio group is one stop
    await expect(page.getByRole("radio", { name: /^II година/ })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: /^III година/ })).toBeChecked();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByRole("radio", { name: /^II година/ })).toBeChecked();

    await page.keyboard.press("Tab"); // material
    await expect(page.getByRole("radio", { name: /^Документ/ })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: /^Неколку реченици/ })).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(textbox(page)).toBeFocused();
    await page.keyboard.type(TYPED);
    await page.keyboard.press("Tab");
    await expect(emphasis(page)).toBeFocused();
    await page.keyboard.type("Повеќе примери.");
    // Enter in the one-line box asks for the questions.
    await page.keyboard.press("Enter");
    await expect(phase(page, "Ги пишуваме прашањата")).toBeFocused();

    // The focus is on the wait, and Cancel is the next stop; Enter returns to the form, on the button.
    await page.keyboard.press("Tab");
    await expect(cancel(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(go(page)).toBeFocused();
    await expect(textbox(page)).toHaveValue(TYPED);

    await page.keyboard.press("Enter");
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
    await expect(title(page)).toHaveText("Квадратни равенки", { timeout: 20_000 });
  });

  test("the question about leaving is answered with the keyboard: Enter stays", async ({ page }) => {
    await yearTwo(page);
    await typeSentences(page);
    await go(page).focus();
    await page.keyboard.press("Enter");
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
    await menu(page).getByRole("link", { name: "Денес" }).focus();
    await page.keyboard.press("Enter");
    await expect(leaveDialog(page)).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(leaveDialog(page)).toBeHidden();
    await expect(page).toHaveURL(/\/teacher\/lessons\/new/);
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
  });
});

test.describe("wording", () => {
  test("is in English when the screen is, at a school", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "en", schoolType: "school", schoolSeen: true })), SETTINGS_KEY);
    await page.goto(NEW);
    await expect(title(page)).toHaveText("Prepare a lesson");
    for (const heading of ["1. Subject and year", "2. Material", "3. What should be stressed?"]) {
      await expect(page.getByRole("heading", { level: 2, name: new RegExp(`^${heading.replace("?", "\\?")}`) })).toBeVisible();
    }
    await expect(page.getByText("Optional", { exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Year 2/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare questions", exact: true })).toBeVisible();
    await page.getByRole("radio", { name: /^A document/ }).check();
    await expect(page.getByText("Do not upload documents with the names or other data of your students.")).toBeVisible();
    await page.getByRole("button", { name: "Prepare questions", exact: true }).click();
    await expect(alerts(page).first()).toHaveText("Choose a year.");
    await expect(alerts(page).nth(1)).toHaveText("Choose a document, or write a few sentences instead.");
    await expect(page.getByRole("link", { name: "Back to Lessons" })).toBeVisible();
  });

  test("at a faculty the subjects are offered and the year is stated, in groups and study years, with 'студенти'", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "mk", schoolType: "university", schoolSeen: true })), SETTINGS_KEY);
    await page.goto(NEW);
    await expect(title(page)).toHaveText("Подготви лекција");
    // Three subjects, none chosen, and no year to ask about until one is.
    const subjects = page.getByRole("radio", { name: /Математичка анализа 1|Линеарна алгебра|Веројатност и статистика/ });
    await expect(subjects).toHaveCount(3);
    for (const radio of await subjects.all()) await expect(radio).not.toBeChecked();
    await expect(page.getByRole("heading", { level: 3, name: "Година" })).toHaveCount(0);

    await go(page).click();
    await expect(alerts(page).first()).toHaveText("Изберете предмет.");
    await expect(subjects.first()).toBeFocused();

    await page.getByRole("radio", { name: /Линеарна алгебра/ }).check();
    // One year for the subject: stated, with its group, not offered.
    await expect(page.locator(".prepare__stated").nth(0)).toHaveText("Година: 2 · Група 2Б");
    await expect(page.getByRole("radio", { name: /година/ })).toHaveCount(0);
    await page.getByRole("radio", { name: /^Документ/ }).check();
    await expect(page.getByText("Не прикачувајте документи со имиња или други податоци на Вашите студенти.")).toBeVisible();
    // Changing the subject changes the year with it.
    await page.getByRole("radio", { name: /Веројатност и статистика/ }).check();
    await expect(page.locator(".prepare__stated").nth(0)).toHaveText("Година: 3 · Група 3А");
  });

  test("a faculty teacher prepares a lesson for the subject they chose, in English too", async ({ page }) => {
    test.slow();
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "en", schoolType: "university", schoolSeen: true })), SETTINGS_KEY);
    await page.goto(NEW);
    await page.getByRole("radio", { name: /Линеарна алгебра/ }).check();
    await expect(page.locator(".prepare__stated").nth(0)).toHaveText("Year: 2 · Група 2Б");
    await page.getByRole("radio", { name: /^A few sentences/ }).check();
    await page.getByRole("textbox", { name: "Write a few sentences about the topic" }).fill("Вектори и матрици. Операции со матрици и детерминанти на матрици.");
    await page.getByRole("button", { name: "Prepare questions", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "We are writing the questions" })).toBeVisible();
    await expect(page.getByText("This can take up to 3 minutes. Please keep this page open.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveClass(/btn--secondary/);
    await expect(page).toHaveURL(/\/teacher\/lessons\/drafts\/d\d+$/, { timeout: 20_000 });
    await expect(page.locator(".head__sub")).toContainText("Линеарна алгебра · Year 2");
    await expect(page.getByRole("link", { name: "Back to Lessons", exact: true })).toBeVisible();
  });
});

test.describe("zoomed", () => {
  // 200% on a 1280 x 720 window leaves 640 x 360 CSS pixels; 400% leaves 320 x 180.
  for (const [zoom, viewport] of [
    ["200%", { width: 640, height: 360 }],
    ["400%", { width: 320, height: 180 }],
  ] as const) {
    test(`at ${zoom} the form, its problems and a long file name do not run off the side`, async ({ page }) => {
      await page.setViewportSize(viewport);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await go(page).click();
      await expect(alerts(page)).toHaveCount(2);
      expect(await overflow(page)).toBeLessThanOrEqual(0);

      await yearTwo(page);
      await chooseDocument(page, docx("Многу долго име на документ за лекцијата за равенки од втор степен и нивните решенија.docx"));
      await expect(page.locator(".drop__name")).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.getByRole("radio", { name: /^Неколку реченици/ }).check();
      await textbox(page).fill("Кратко.");
      await go(page).click();
      await expect(alerts(page)).toContainText("Текстот е прекраток");
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      // The one button is still there to reach, and as wide as the window lets it be.
      await go(page).scrollIntoViewIfNeeded();
      const box = (await go(page).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    });
  }

  test("at 200% and 400% the draft, with its note and its questions, does not run off the side", async ({ page }) => {
    test.slow();
    await yearTwo(page);
    await typeSentences(page);
    await emphasis(page).fill("Повеќе примери со многу долг збор: " + "дискриминантата".repeat(4));
    await go(page).click();
    await expect(title(page)).toHaveText("Квадратни равенки", { timeout: 20_000 });
    for (const viewport of [
      { width: 640, height: 360 },
      { width: 320, height: 180 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(page.locator(".draft__note")).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    }
  });

  test("at 200% the wait and a failure fit too, and Cancel is reachable", async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 640, height: 360 });
    await yearTwo(page);
    await typeSentences(page, `${TYPED} [fail]`);
    await go(page).click();
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
    await expect(cancel(page)).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await expect(retry(page)).toBeVisible({ timeout: 20_000 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("the dots stand still when the computer asks for less motion", async ({ page }) => {
    test.slow();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await yearTwo(page);
    await typeSentences(page);
    await go(page).click();
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
    const names = await page.locator(".waiting__dots span").evaluateAll((spans) => spans.map((s) => getComputedStyle(s).animationName));
    expect(names).toEqual(["none", "none", "none"]);
    await cancel(page).click();
  });
});

test.describe("the drawer layout and a laptop's small window", () => {
  test.slow();

  test("at 900 wide the wait is in the page, the drawer's links ask first, Cancel is a full-height button, and the failure fits", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await yearTwo(page);
    await typeSentences(page, `${TYPED} [fail]`);
    await go(page).click();
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
    expect((await cancel(page).boundingBox())!.height).toBeGreaterThanOrEqual(56);
    await expect(cancel(page)).toBeInViewport();

    await page.getByRole("button", { name: "Мени", exact: true }).click();
    await menu(page).getByRole("link", { name: "Библиотека" }).click();
    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Остани" }).click();
    // Staying leaves the drawer as it was and the wait going on.
    await expect(page).toHaveURL(/\/teacher\/lessons\/new/);
    await expect(phase(page, "Ги пишуваме прашањата")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(retry(page)).toBeVisible({ timeout: 20_000 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    for (const button of [retry(page), backToForm(page)]) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  });

  test("at 1024 x 768 the sidebar and the whole form are there with nothing running off the side", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(menu(page)).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await go(page).click();
    await expect(alerts(page)).toHaveCount(2);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // Everything that can be pressed is at least 48px tall, and the one that matters 56px.
    const buttons = await page.locator("main button:visible, main a.btn:visible").all();
    for (const button of buttons) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    expect((await go(page).boundingBox())!.height).toBeGreaterThanOrEqual(56);
  });

  test("the words on the ground are large text, the only kind that white has enough contrast for there", async ({ page }) => {
    await expect(page.locator(".head__sub")).toBeVisible();
    // 24px and up on the gradient (white on #32878C is 4.2:1; 3:1 is what large text needs). Everything smaller sits on a panel.
    const size = (selector: string) => page.locator(selector).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(await size(".head__sub")).toBeGreaterThanOrEqual(24);
    expect(await size(".prepare__go p")).toBeGreaterThanOrEqual(24);
    // Nothing on the form is under 16px, and the text that is read (not a badge or a label) is 18px or more.
    const small = await page.locator("main *:visible").evaluateAll((els) =>
      els
        .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== ""))
        .filter((el) => !el.closest(".sr, .me"))
        .map((el) => ({ text: el.textContent!.trim().slice(0, 30), size: parseFloat(getComputedStyle(el).fontSize), tag: el.classList.contains("tag") }))
        .filter((x) => x.size < 18),
    );
    expect(small.filter((x) => x.size < 16)).toEqual([]);
    // The one text under 18px is the "По желба" badge.
    expect(small.filter((x) => !x.tag)).toEqual([]);
  });
});
