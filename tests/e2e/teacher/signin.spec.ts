import type { Page } from "@playwright/test";
import { expect, MOCK_KEY, SESSION_KEY, SETTINGS_KEY, sessionOf, test } from "./fixtures";

/**
 * Signing in, the guide of a first run and signing out, in mock mode, in Macedonian unless a test changes the language. The
 * demo's provider page is a sheet on the sign-in screen: pressing a provider's button opens it, and each choice returns the
 * way the API's callback does, signed in or with `?error=` and nobody signed in.
 */

type Provider = "Google" | "Microsoft";
type Who = "veteran" | "novice" | "not_invited" | "personal" | "cancelled" | "offline";

const title = (page: Page) => page.getByRole("heading", { level: 1 });
const providerButton = (page: Page, provider: Provider) => page.getByRole("button", { name: `Најави се со ${provider}` });
const sheet = (page: Page, provider: Provider = "Google") => page.getByRole("dialog", { name: `Страница за најава на ${provider}` });
/** What the screen says is wrong. Next's own route announcer is an alert too, so it is left out. */
const problem = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
const note = (page: Page) => page.getByRole("status").filter({ hasText: /Успешно се одјавивте|Ве одјавивме/ });

const CHOICE: Record<Who, RegExp> = {
  veteran: /^Марија Петровска/,
  novice: /^Нов (наставник|професор)/,
  not_invited: /^Сметка што никој не ја поканил/,
  personal: /^Лична сметка/,
  cancelled: /^Откажан прозорец на/,
  offline: /^Нема интернет$/,
};

/** Press a provider's button, and choose who signs in at the provider's page, which returns through the callback. */
async function signInWith(page: Page, who: Who = "veteran", provider: Provider = "Google") {
  await providerButton(page, provider).click();
  await sheet(page, provider).getByRole("button", { name: CHOICE[who] }).click();
}

const TODAY_GREETING = /^(Добро утро|Добар ден|Добра вечер), (Марија|Игор)$/;
const mockState = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), MOCK_KEY);

test.describe("the sign-in screen", () => {
  test.use({ account: null });

  test("a computer that has never signed in opens on it, whichever page it is opened at, and remembers the page", async ({ page }) => {
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/teacher\/sign-in$/);
    await expect(title(page)).toHaveText("Најава");

    await page.goto("/teacher/lessons");
    await expect(page).toHaveURL(/\/teacher\/sign-in\?next=%2Fteacher%2Flessons$/);
    await expect(page).toHaveTitle("Најава · TeacherAid");
  });

  test("is a plain title, one sentence, two big buttons and a way to ask for help: nothing to type, no password anywhere", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await expect(title(page)).toHaveText("Најава");
    // The type of institution is not known yet on a computer that has never been signed in on.
    await expect(page.getByText("Најавете се со сметката од Вашата установа.")).toBeVisible();
    await expect(providerButton(page, "Google")).toBeVisible();
    await expect(providerButton(page, "Microsoft")).toBeVisible();
    await expect(page.locator("input, textarea, select")).toHaveCount(0);
    await expect(page.getByText(/лозинк|password/i)).toHaveCount(0);
    // One link to ask for help, which opens Help and its answer about not being able to sign in, with the address written out
    // beside it in case the computer has no mail program.
    const help = page.getByRole("link", { name: "Потребна е помош?" });
    await expect(help).toHaveAttribute("href", "/teacher/help");
    await expect(page.getByText("hello@teacheraid.education")).toBeVisible();
  });

  test("its help link opens Help, which needs no sign-in, and Sign in comes back", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await page.getByRole("link", { name: "Потребна е помош?" }).click();
    await expect(page).toHaveURL(/\/teacher\/help$/);
    await expect(page.getByText("Не можам да се најавам. Што да правам?")).toBeVisible();
    await page.getByRole("link", { name: "Најави се", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher\/sign-in$/);
  });

  test("the provider buttons follow each provider's guidelines: white, their own logo and grey, and as big as the app's buttons", async ({ page }) => {
    const outside: string[] = [];
    const origin = new URL(test.info().project.use.baseURL ?? "http://localhost:3100").origin;
    page.on("request", (r) => {
      if (!r.url().startsWith(origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) outside.push(r.url());
    });
    await page.goto("/teacher/sign-in");

    const google = providerButton(page, "Google");
    const microsoft = providerButton(page, "Microsoft");
    for (const button of [google, microsoft]) {
      await expect(button).toHaveCSS("background-color", "rgb(255, 255, 255)");
      // The logo is inline and hidden from a screen reader: the words name the provider.
      await expect(button.locator("svg[aria-hidden='true']")).toHaveCount(1);
      await expect(button.locator("img")).toHaveCount(0);
    }
    await expect(google).toHaveCSS("color", "rgb(31, 31, 31)");
    await expect(google).toHaveCSS("border-top-color", "rgb(116, 119, 117)");
    await expect(microsoft).toHaveCSS("color", "rgb(94, 94, 94)");
    await expect(microsoft).toHaveCSS("border-top-color", "rgb(140, 140, 140)");
    // The four colours of the G, the four squares of Microsoft.
    await expect(google.locator("path")).toHaveCount(4);
    await expect(microsoft.locator("path")).toHaveCount(4);
    // Equal, and no smaller than 56px, with text of at least 18px.
    const [a, b] = [(await google.boundingBox())!, (await microsoft.boundingBox())!];
    expect(a.height).toBeGreaterThanOrEqual(56);
    expect(b.height).toBe(a.height);
    expect(b.width).toBe(a.width);
    expect(parseFloat(await google.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
    // These are not the screen's yellow.
    await expect(google).not.toHaveCSS("background-color", "rgb(255, 200, 62)");
    expect(outside, "requests to another origin").toEqual([]);
  });

  test("has no yellow button: the two provider buttons are the main actions and keep the providers' look", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await expect(page.locator(".btn--primary")).toHaveCount(0);
  });

  test("a small MK/EN switch changes the language of the screen, and keeps it", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    const mk = page.getByRole("button", { name: "МК, Македонски" });
    const en = page.getByRole("button", { name: "EN, English" });
    await expect(mk).toHaveAttribute("aria-pressed", "true");
    await expect(en).toHaveAttribute("aria-pressed", "false");

    await en.click();
    await expect(title(page)).toHaveText("Sign in");
    await expect(page.getByText("Sign in with the account from your institution.")).toBeVisible();
    await expect(providerButton(page, "Google")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with Microsoft" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Need help?" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(en).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(title(page)).toHaveText("Sign in");
    await mk.click();
    await expect(title(page)).toHaveText("Најава");
  });

  test("names the school, or the faculty, once the type of institution is known", async ({ page }) => {
    // Set once, when the tab opens: the test changes it later and reloads.
    await page.addInitScript((key) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem(key, JSON.stringify({ locale: "mk", schoolType: "university", schoolSeen: true }));
    }, SETTINGS_KEY);
    await page.goto("/teacher/sign-in");
    await expect(page.getByText("Најавете се со сметката од Вашиот факултет.")).toBeVisible();

    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ locale: "mk", schoolType: "school", schoolSeen: true })), SETTINGS_KEY);
    await page.reload();
    await expect(page.getByText("Најавете се со сметката од Вашето училиште.")).toBeVisible();
  });

  test("can be used with the keyboard alone: the buttons are in reading order, and the demo page takes the focus", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      order.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? ""));
    }
    expect(order).toEqual(["МК, Македонски", "EN, English", "Најави се со Google", "Најави се со Microsoft", "Потребна е помош?"]);

    await providerButton(page, "Google").focus();
    await page.keyboard.press("Enter");
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: CHOICE.veteran })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();
    // Back from the provider's page, the button that was pressed has the focus again, not nothing.
    await expect(providerButton(page, "Google")).toBeFocused();
  });

  test("fits a window 1024 wide and a narrow one, with no sideways scrolling", async ({ page }) => {
    for (const width of [1024, 640, 360]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/teacher/sign-in");
      await expect(title(page)).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${width}px wide`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("the demo's provider page", () => {
  test.use({ account: null });

  test("opens in place of the provider, says it is a demo, and leads back with nothing changed", async ({ page }) => {
    await page.goto("/teacher/sign-in?next=%2Fteacher%2Fclasses");
    await providerButton(page, "Google").click();
    const dialog = sheet(page, "Google");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Демо", { exact: true })).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription(/Ова е само демо/);
    // Who to sign in as, and what happens when something goes wrong.
    await expect(dialog.getByRole("button", { name: CHOICE.veteran })).toBeVisible();
    await expect(dialog.getByRole("button", { name: CHOICE.novice })).toBeVisible();
    for (const who of ["not_invited", "personal", "cancelled", "offline"] as const) await expect(dialog.getByRole("button", { name: CHOICE[who] })).toBeVisible();
    // One yellow button: the teacher with history.
    await expect(dialog.locator(".btn--primary")).toHaveCount(1);

    // Back: the screen as it was, where it was heading still remembered.
    await dialog.getByRole("button", { name: "Назад" }).click();
    await expect(dialog).toBeHidden();
    await expect(providerButton(page, "Google")).toBeFocused();
    await expect(page).toHaveURL(/\/teacher\/sign-in\?next=%2Fteacher%2Fclasses$/);
    expect(await sessionOf(page)).toBeNull();
    await expect(problem(page)).toHaveCount(0);
  });

  test("Microsoft's button opens Microsoft's page, with the same choices", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await providerButton(page, "Microsoft").click();
    await expect(sheet(page, "Microsoft")).toBeVisible();
    await expect(sheet(page, "Microsoft").getByText("Во вистинската верзија тука се отвора страницата на Microsoft.")).toBeVisible();
    await expect(sheet(page, "Microsoft").getByRole("button", { name: CHOICE.novice })).toBeVisible();
  });

  test("fits a 1280 x 720 window whole, with no scrolling inside it", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await providerButton(page, "Google").click();
    const room = await sheet(page).evaluate((d) => d.clientHeight - d.scrollHeight);
    expect(room).toBeGreaterThanOrEqual(0);
  });

  test("the buttons are as big as the app's: 56px and up", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await providerButton(page, "Google").click();
    for (const button of await sheet(page).getByRole("button").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    }
  });

  test("is in English when the screen is", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await page.getByRole("button", { name: "EN, English" }).click();
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    const dialog = page.getByRole("dialog", { name: "Google sign-in page" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Demo", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Marija Petrovska/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^A new teacher/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "No internet" })).toBeVisible();
  });
});

test.describe("signing in", () => {
  test.use({ account: null });

  test("as the teacher with history, with Google: lands on Today, with the season's lessons behind it and no guide", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await signInWith(page, "veteran", "Google");
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(title(page)).toHaveText("Денес");
    await expect(page.getByText(TODAY_GREETING)).toContainText("Марија");
    await expect(page.getByRole("link", { name: "Марија Петровска, поставки" })).toBeVisible();
    expect(await sessionOf(page)).toBe("veteran");
    // Not a first run: the guide does not show, and the first run is done.
    expect((await mockState(page)).school.first_run_done).toBe(true);
    // The sidebar is the teacher's, with a way to sign out.
    await expect(page.getByRole("button", { name: "Одјави се" })).toBeVisible();
  });

  test("with Microsoft too", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await signInWith(page, "veteran", "Microsoft");
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(title(page)).toHaveText("Денес");
    expect(await sessionOf(page)).toBe("veteran");
  });

  test("as a new teacher: the guide first, one thing at a time, and the first run is done only when it is finished", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await signInWith(page, "novice");
    await expect(page).toHaveURL(/\/teacher\/welcome$/);
    expect(await sessionOf(page)).toBe("novice");
    expect((await mockState(page)).novice.school.first_run_done).toBe(false);

    await expect(title(page)).toHaveText("Добредојдовте");
    await expect(page.getByText("Чекор 1 од 3")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText("Подгответе лекција");
    await expect(page.getByRole("button", { name: "Назад" })).toHaveCount(0);
    // One yellow button, and a way out that is always in view.
    await expect(page.locator(".btn--primary")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Прескокни го водичот" })).toBeVisible();
    // Skipping is not a trap: it says where the guide is when the teacher wants it again.
    await expect(page.getByText("Водичот можете да го погледнете повторно во Поставки.")).toBeVisible();

    await page.getByRole("button", { name: "Следно" }).click();
    await expect(page.getByText("Чекор 2 од 3")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText("Одржете ја лекцијата");
    await expect(page.getByRole("heading", { level: 2 })).toBeFocused();
    await expect(page.getByText("Вашите ученици го скенираат")).toBeVisible();

    // A labelled Back, and back again.
    await page.getByRole("button", { name: "Назад" }).click();
    await expect(page.getByText("Чекор 1 од 3")).toBeVisible();
    await page.getByRole("button", { name: "Следно" }).click();
    await page.getByRole("button", { name: "Следно" }).click();
    await expect(page.getByText("Чекор 3 од 3")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText("Видете кој бил присутен и што да се повтори");
    // The last step leads into the first lesson (the one yellow button), and "Не сега" is the way out; there is nothing to skip.
    await expect(page.getByRole("button", { name: "Следно" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Прескокни го водичот" })).toHaveCount(0);
    await expect(page.locator(".btn--primary")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Подготви ја првата лекција" })).toHaveClass(/btn--primary/);
    expect((await mockState(page)).novice.school.first_run_done).toBe(false);

    await page.getByRole("button", { name: "Не сега, оди на Денес", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(title(page)).toHaveText("Денес");
    await expect(page.getByText(TODAY_GREETING)).toContainText("Игор");
    // Nothing prepared yet, and the one yellow button says what to do.
    await expect(page.getByRole("heading", { name: "Немате подготвени лекции" })).toBeVisible();
    await expect(page.locator(".btn--primary:visible")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Подготви лекција" })).toBeVisible();
    expect((await mockState(page)).novice.school.first_run_done).toBe(true);

    // Done for good: a reload, and signing in again, go straight to Today.
    await page.reload();
    await expect(title(page)).toHaveText("Денес");
    await expect(page).toHaveURL(/\/teacher$/);
  });

  test("as a new teacher who skips the guide: the first run is done all the same", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await signInWith(page, "novice", "Microsoft");
    await expect(page).toHaveURL(/\/teacher\/welcome$/);
    await page.getByRole("button", { name: "Прескокни го водичот" }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(title(page)).toHaveText("Денес");
    await expect(page.getByRole("link", { name: "Подготви лекција" })).toBeVisible();
    expect((await mockState(page)).novice.school.first_run_done).toBe(true);
    await page.reload();
    await expect(page).toHaveURL(/\/teacher$/);
  });

  test("a new teacher who leaves the guide half way is still a new teacher: the guide is there on the next visit", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await signInWith(page, "novice");
    await page.getByRole("button", { name: "Следно" }).click();
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/teacher\/welcome$/);
    await expect(page.getByText("Чекор 1 од 3")).toBeVisible();
    expect((await mockState(page)).novice.school.first_run_done).toBe(false);
  });

  test("the guide speaks of the students of a faculty", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ locale: "mk", schoolType: "university", schoolSeen: true })), SETTINGS_KEY);
    await page.goto("/teacher/sign-in");
    await signInWith(page, "novice");
    await page.getByRole("button", { name: "Следно" }).click();
    await expect(page.getByText("Вашите студенти го скенираат")).toBeVisible();
  });

  test("the guide is in English when the screen is", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await page.getByRole("button", { name: "EN, English" }).click();
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.getByRole("dialog", { name: "Google sign-in page" }).getByRole("button", { name: /^A new teacher/ }).click();
    await expect(page).toHaveURL(/\/teacher\/welcome$/);
    await expect(title(page)).toHaveText("Welcome");
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText("Prepare a lesson");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Not now, go to Today", exact: true }).click();
    await expect(title(page)).toHaveText("Today");
    await expect(page.getByText(/^Good (morning|afternoon|evening), Igor$/)).toBeVisible();
  });

  test("a first run that is told to go somewhere else goes there once the guide is done", async ({ page }) => {
    await page.goto("/teacher/classes");
    await expect(page).toHaveURL(/\/teacher\/sign-in\?next=%2Fteacher%2Fclasses$/);
    await signInWith(page, "novice");
    await expect(page).toHaveURL(/\/teacher\/welcome\?next=%2Fteacher%2Fclasses$/);
    await page.getByRole("button", { name: "Прескокни го водичот" }).click();
    await expect(page).toHaveURL(/\/teacher\/classes$/);
    await expect(title(page)).toHaveText("Класови");
  });

  test("a teacher who is already signed in is taken from the sign-in screen to Today, without it being drawn", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ persona: "veteran" })), SESSION_KEY);
    await page.goto("/teacher/sign-in");
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(title(page)).toHaveText("Денес");
  });
});

test.describe("when signing in does not work", () => {
  test.use({ account: null });

  const states: { who: Who; heading: string; words: RegExp }[] = [
    {
      who: "not_invited",
      heading: "Оваа сметка не е на списокот",
      words: /Оваа сметка не е меѓу поканетите наставници\. Најавете се со сметката од Вашата установа, преку Google или Microsoft\. Ако не помага, побарајте од администраторот да Ве покани\./,
    },
    {
      who: "personal",
      heading: "Оваа сметка не е на списокот",
      words: /Најавете се со сметката од Вашата установа, преку Google или Microsoft/,
    },
    { who: "cancelled", heading: "Најавувањето не успеа", words: /Најавата не беше завршена\. Можеби сте го затвориле прозорецот\. Обидете се повторно\./ },
    { who: "offline", heading: "Нема интернет", words: /Проверете ја врската на компјутерот и обидете се повторно\./ },
  ];

  for (const { who, heading, words } of states) {
    test(`${who}: says what happened and what to do next, signs nobody in, and says it once`, async ({ page }) => {
      await page.goto("/teacher/sign-in");
      await signInWith(page, who);

      const alert = problem(page);
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(heading);
      await expect(alert).toContainText(words);
      // A warning is led by a red badge with a mark, and has no coloured edge down one side.
      // Each button says it too when the teacher comes to it, since either one is the next try.
      await expect(providerButton(page, "Google")).toHaveAccessibleDescription(new RegExp(heading));
      await expect(providerButton(page, "Microsoft")).toHaveAccessibleDescription(new RegExp(heading));
      await expect(alert.locator(".problem__badge")).toHaveCSS("background-color", "rgb(236, 34, 31)");
      await expect(alert).toHaveCSS("border-left-width", "0px");
      await expect(title(page)).toHaveText("Најава");
      expect(await sessionOf(page)).toBeNull();
      // The refusal is taken off the address, so a reload does not tell it again.
      await expect(page).toHaveURL(/\/teacher\/sign-in$/);
      await expect(sheet(page)).toBeHidden();
      // The buttons are there to try again.
      await expect(providerButton(page, "Google")).toBeEnabled();
      await page.reload();
      await expect(title(page)).toHaveText("Најава");
      await expect(problem(page)).toHaveCount(0);
    });
  }

  test("a try after a failure works, and takes the old message away as soon as it is made", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await signInWith(page, "personal");
    await expect(problem(page)).toBeVisible();
    await providerButton(page, "Microsoft").click();
    await expect(problem(page)).toHaveCount(0);
    await sheet(page, "Microsoft").getByRole("button", { name: CHOICE.veteran }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(title(page)).toHaveText("Денес");
  });

  test("a refusal keeps where the teacher was heading, so the second try still gets there", async ({ page }) => {
    await page.goto("/teacher/library");
    await signInWith(page, "not_invited");
    await expect(problem(page)).toBeVisible();
    await expect(page).toHaveURL(/\/teacher\/sign-in\?next=%2Fteacher%2Flibrary$/);
    await signInWith(page, "veteran");
    await expect(page).toHaveURL(/\/teacher\/library$/);
    await expect(title(page)).toHaveText("Библиотека");
  });

  test("with the computer really offline, the button says there is no internet, and coming back online clears it", async ({ page, context }) => {
    await page.goto("/teacher/sign-in");
    await context.setOffline(true);
    await providerButton(page, "Google").click();
    await expect(sheet(page)).toBeHidden();
    await expect(problem(page)).toContainText("Нема интернет");
    await expect(problem(page)).toContainText("Проверете ја врската на компјутерот и обидете се повторно.");
    await context.setOffline(false);
    await expect(problem(page)).toHaveCount(0);
    await signInWith(page, "veteran");
    await expect(title(page)).toHaveText("Денес");
  });

  test("the message is in English when the screen is", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await page.getByRole("button", { name: "EN, English" }).click();
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await page.getByRole("dialog", { name: "Google sign-in page" }).getByRole("button", { name: /^An account nobody invited/ }).click();
    await expect(problem(page)).toContainText("This account is not on the list");
    await expect(problem(page)).toContainText("ask the administrator to invite you");
  });

  test("only the two refusals the API's callback sends are taken from the address; anything else in it is ignored", async ({ page }) => {
    await page.goto("/teacher/sign-in?error=server_error");
    await expect(title(page)).toHaveText("Најава");
    await expect(problem(page)).toHaveCount(0);
    await page.goto("/teacher/sign-in?error=unknown_email");
    await expect(problem(page)).toContainText("Оваа сметка не е на списокот");
    await page.goto("/teacher/sign-in?error=sign_in_failed");
    await expect(problem(page)).toContainText("Најавувањето не успеа");
  });
});

test.describe("going back to the page that was asked for", () => {
  test.use({ account: null });

  test("a link to a page opened while signed out comes back to it after signing in", async ({ page }) => {
    await page.goto("/teacher/classes");
    await expect(page).toHaveURL(/\/teacher\/sign-in\?next=%2Fteacher%2Fclasses$/);
    await signInWith(page);
    await expect(page).toHaveURL(/\/teacher\/classes$/);
    await expect(title(page)).toHaveText("Класови");
    await expect(page.getByRole("navigation").first().getByRole("link", { name: "Класови" })).toHaveAttribute("aria-current", "page");
  });

  test("a page that does not exist is remembered too, and says so after signing in", async ({ page }) => {
    await page.goto("/teacher/nowhere");
    await expect(page).toHaveURL(/\/teacher\/sign-in\?next=%2Fteacher%2Fnowhere$/);
    await signInWith(page);
    await expect(title(page)).toHaveText("Оваа страница не постои");
  });

  for (const next of ["//evil.example/teacher", "https://evil.example/teacher", "/app", "/app/welcome", "/teacher/../app", "javascript:alert(1)", "/teacher//evil.example", "/teacher/sign-in"]) {
    test(`an address that leads somewhere else is not followed: ${next}`, async ({ page }) => {
      await page.goto(`/teacher/sign-in?next=${encodeURIComponent(next)}`);
      await signInWith(page);
      await expect(page).toHaveURL(/\/teacher$/);
      await expect(title(page)).toHaveText("Денес");
      expect(new URL(page.url()).origin).toBe(new URL(test.info().project.use.baseURL ?? "http://localhost:3100").origin);
    });
  }
});

test.describe("when the session ends while the teacher is working", () => {
  test("another window signing out ends this one calmly, and signing in again returns to the page", async ({ page }) => {
    await page.goto("/teacher/classes");
    await expect(title(page)).toHaveText("Класови");

    // The session cookie is gone, and this window is told so, as a browser tells every window of a change to its storage.
    await page.evaluate((key) => {
      localStorage.removeItem(key);
      window.dispatchEvent(new StorageEvent("storage", { key }));
    }, SESSION_KEY);

    await expect(page).toHaveURL(/\/teacher\/sign-in\?next=%2Fteacher%2Fclasses$/);
    await expect(note(page)).toHaveText("Ве одјавивме поради безбедност. Најавете се повторно.");
    // Calm: no red box, no alert.
    await expect(problem(page)).toHaveCount(0);

    await signInWith(page);
    await expect(page).toHaveURL(/\/teacher\/classes$/);
    await expect(title(page)).toHaveText("Класови");
  });

  test("a button pressed after the session ended is refused, and sends the teacher to sign in without losing the page", async ({ page }) => {
    await page.goto("/teacher/settings");
    await page.evaluate((key) => localStorage.removeItem(key), SESSION_KEY);
    await page.getByRole("button", { name: "Ресетирај ги демо податоците" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Да, ресетирај" }).click();

    await expect(page).toHaveURL(/\/teacher\/sign-in\?next=%2Fteacher%2Fsettings$/);
    await expect(note(page)).toHaveText("Ве одјавивме поради безбедност. Најавете се повторно.");
    await signInWith(page);
    await expect(page).toHaveURL(/\/teacher\/settings$/);
    await expect(title(page)).toHaveText("Поставки");
  });

  test("nothing of the teacher's page stays on screen once the session has ended", async ({ page }) => {
    await page.goto("/teacher/classes");
    await expect(page.getByRole("link", { name: "Марија Петровска, поставки" })).toBeVisible();
    await page.evaluate((key) => {
      localStorage.removeItem(key);
      window.dispatchEvent(new StorageEvent("storage", { key }));
    }, SESSION_KEY);
    await expect(title(page)).toHaveText("Најава");
    await expect(page.getByText("Марија Петровска")).toHaveCount(0);
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });
});

test.describe("signing out", () => {
  test("goes to the sign-in screen with a note, forgets the page it was on, and the pages are closed again", async ({ page }) => {
    await page.goto("/teacher");
    await page.getByRole("navigation").first().getByRole("link", { name: "Класови" }).click();
    await expect(title(page)).toHaveText("Класови");
    await page.getByRole("button", { name: "Одјави се" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Да, одјави ме" }).click();

    await expect(page).toHaveURL(/\/teacher\/sign-in$/);
    await expect(note(page)).toHaveText("Успешно се одјавивте.");
    expect(await sessionOf(page)).toBeNull();
    // The school's type is known now, so the sentence names it.
    await expect(page.getByText("Најавете се со сметката од Вашето училиште.")).toBeVisible();
    // The demo's school keeps its lessons (it is the API's data); only the session is gone.
    expect(await mockState(page)).not.toBeNull();

    // A protected page is closed again, and Back does not open it: it leads to the sign-in screen, which says the teacher signed out.
    await page.goBack();
    await expect(page).toHaveURL(/\/teacher\/sign-in$/);
    await expect(note(page)).toHaveText("Успешно се одјавивте.");
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await page.goto("/teacher/library");
    await expect(page).toHaveURL(/\/teacher\/sign-in\?next=%2Fteacher%2Flibrary$/);

    // Signing in again does not carry the teacher back to the page they left on purpose.
    await page.goto("/teacher/sign-in");
    await signInWith(page);
    await expect(page).toHaveURL(/\/teacher$/);
  });

  test("the next person to sign in on the computer finds nothing of the last one", async ({ page }) => {
    await page.goto("/teacher");
    await expect(page.getByText(TODAY_GREETING)).toContainText("Марија");
    await page.getByRole("button", { name: "Одјави се" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Да, одјави ме" }).click();
    await expect(title(page)).toHaveText("Најава");

    await signInWith(page, "novice");
    await page.getByRole("button", { name: "Прескокни го водичот" }).click();
    await expect(page.getByText(TODAY_GREETING)).toContainText("Игор");
    await expect(page.getByText("Марија")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Игор Арсовски, поставки" })).toBeVisible();
  });

});

test.describe("what is shown before the answer is known", () => {
  test.use({ account: null });

  test("the server sends nothing of a protected page: only the logo", async ({ request }) => {
    for (const path of ["/teacher", "/teacher/lessons", "/teacher/classes", "/teacher/settings", "/teacher/welcome"]) {
      const html = await (await request.get(path)).text();
      for (const secret of ["Марија", "Петровска", "Игор", "Одјави се", "Библиотека", "Подготви лекција", "Немате подготвени лекции", "Чекор 1"]) {
        expect(html, `${path}: ${secret}`).not.toContain(secret);
      }
      expect(html, path).toContain("<title>TeacherAid</title>");
    }
  });

  test("a signed-out visit to a protected page never draws it, not even for a moment", async ({ page }) => {
    // Every heading that is ever on screen is written down as it appears.
    await page.addInitScript(() => {
      const seen = new Set<string>();
      (window as unknown as { __seen: Set<string> }).__seen = seen;
      const look = () => document.querySelectorAll("h1, h2, nav, [role='navigation']").forEach((el) => seen.add(el.tagName === "NAV" ? "nav" : (el.textContent ?? "")));
      new MutationObserver(look).observe(document, { childList: true, subtree: true });
    });
    await page.goto("/teacher/lessons");
    await expect(title(page)).toHaveText("Најава");
    const seen = await page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen]);
    expect(seen).not.toContain("Лекции");
    expect(seen).not.toContain("nav");
  });

  test("the sign-in screen and the pages it leads to load without a console error, a hydration mismatch or a failed request", async ({ page }) => {
    for (const path of ["/teacher/sign-in", "/teacher/lessons", "/teacher/help", "/teacher/sign-in?error=unknown_email", "/teacher/sign-in?reason=expired"]) {
      const problems: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" || /hydrat/i.test(m.text())) problems.push(`${m.type()}: ${m.text()}`);
      });
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      page.on("requestfailed", (r) => problems.push(`failed: ${r.url()} ${r.failure()?.errorText}`));
      await page.goto(path);
      await expect(title(page)).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(problems, path).toEqual([]);
      page.removeAllListeners();
    }
  });

  test("the guide, the sign-in screen and the pages after signing in load clean for a new teacher too", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || /hydrat/i.test(m.text())) problems.push(`${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto("/teacher/sign-in");
    await signInWith(page, "novice");
    await expect(page.getByText("Чекор 1 од 3")).toBeVisible();
    await page.getByRole("button", { name: "Следно" }).click();
    await page.getByRole("button", { name: "Следно" }).click();
    await page.getByRole("button", { name: "Не сега, оди на Денес", exact: true }).click();
    await expect(title(page)).toHaveText("Денес");
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });
});

test.describe("Help needs no sign-in", () => {
  test.use({ account: null });

  test("opens for anyone, without a sidebar, with a way to sign in and a question about not being able to", async ({ page }) => {
    await page.goto("/teacher/help");
    await expect(page).toHaveURL(/\/teacher\/help$/);
    await expect(title(page)).toHaveText("Помош");
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Одјави се" })).toHaveCount(0);
    await expect(page.getByText("Не можам да се најавам. Што да правам?")).toBeVisible();
    await page.getByText("Не можам да се најавам. Што да правам?").click();
    await expect(page.getByText(/побарајте од администраторот на Вашата установа да ја покани/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Пишете ни" })).toHaveAttribute("href", "mailto:hello@teacheraid.education");

    await page.getByRole("link", { name: "Најави се", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher\/sign-in$/);
    await expect(title(page)).toHaveText("Најава");
  });

  test("and has its sidebar back for a teacher who is signed in", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await signInWith(page);
    await page.getByRole("navigation").nth(1).getByRole("link", { name: "Помош" }).click();
    await expect(title(page)).toHaveText("Помош");
    await expect(page.getByRole("navigation")).toHaveCount(2);
  });

  test("is not held back by the first run of a teacher who has not finished the guide", async ({ page }) => {
    await page.goto("/teacher/sign-in");
    await signInWith(page, "novice");
    await page.goto("/teacher/help");
    await expect(page).toHaveURL(/\/teacher\/help$/);
    await expect(title(page)).toHaveText("Помош");
  });
});

test.describe("the guide again", () => {
  test("Settings shows it again, and finishing it changes nothing for a teacher who has done it", async ({ page }) => {
    await page.goto("/teacher/settings");
    await expect(page.getByRole("heading", { name: "Водич за почеток" })).toBeVisible();
    await page.getByRole("link", { name: "Прикажи го водичот повторно" }).click();
    await expect(page).toHaveURL(/\/teacher\/welcome\?next=%2Fteacher%2Fsettings$/);
    await expect(page.getByText("Чекор 1 од 3")).toBeVisible();
    const before = await mockState(page);
    await page.getByRole("button", { name: "Следно" }).click();
    await page.getByRole("button", { name: "Следно" }).click();
    // It goes back to where it was shown from, and says so.
    await page.getByRole("button", { name: "Назад во Поставки" }).click();
    await expect(page).toHaveURL(/\/teacher\/settings$/);
    await expect(title(page)).toHaveText("Поставки");
    expect(await mockState(page)).toEqual(before);
  });

  test("and skipping it, when it was opened by its address alone, goes to Today", async ({ page }) => {
    await page.goto("/teacher/welcome");
    await page.getByRole("button", { name: "Прескокни го водичот" }).click();
    await expect(title(page)).toHaveText("Денес");
  });
});

test.describe("when the first run cannot be saved", () => {
  test.use({ account: "novice" });

  test("the guide stays, says there is no internet, and the same button tries again", async ({ page, context }) => {
    await page.goto("/teacher/welcome");
    await page.getByRole("button", { name: "Прескокни го водичот" }).waitFor();
    await context.setOffline(true);
    await page.getByRole("button", { name: "Прескокни го водичот" }).click();
    await expect(problem(page)).toContainText("Не успеавме да продолжиме");
    await expect(problem(page)).toContainText("Нема врска со интернет. Проверете ја врската и обидете се повторно.");
    await expect(page).toHaveURL(/\/teacher\/welcome$/);
    expect((await mockState(page)).novice.school.first_run_done).toBe(false);

    await context.setOffline(false);
    await page.getByRole("button", { name: "Прескокни го водичот" }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(title(page)).toHaveText("Денес");
    expect((await mockState(page)).novice.school.first_run_done).toBe(true);
  });

  test("and a teacher the save keeps failing for can go on anyway: nothing sends them back, and the guide is there on the next visit", async ({ page }) => {
    await page.goto("/teacher/welcome");
    await page.getByRole("button", { name: "Прескокни го водичот" }).waitFor();
    // Not offered while nothing has gone wrong.
    await expect(page.getByRole("button", { name: "Продолжи сепак" })).toHaveCount(0);
    // The page says it is offline, which refuses the save, while the pages it goes on to can still be reached.
    await page.evaluate(() => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }));
    await page.getByRole("button", { name: "Прескокни го водичот" }).click();
    await expect(problem(page)).toContainText("Не успеавме да продолжиме");
    // Trying again and going on are both there.
    await expect(page.getByRole("button", { name: "Прескокни го водичот" })).toBeVisible();
    await page.getByRole("button", { name: "Продолжи сепак" }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(title(page)).toHaveText("Денес");
    // Moving about is not sent back to the guide.
    await page.getByRole("navigation").first().getByRole("link", { name: "Библиотека" }).click();
    await expect(title(page)).toHaveText("Библиотека");
    expect((await mockState(page)).novice.school.first_run_done).toBe(false);

    // A page loaded afresh asks the server again, and the guide is shown once more.
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/teacher\/welcome$/);
  });

  test("on the last step the only way on is the main button, and going on anyway is offered beside it once that fails", async ({ page, context }) => {
    await page.goto("/teacher/welcome");
    await page.getByRole("button", { name: "Следно" }).click();
    await page.getByRole("button", { name: "Следно" }).click();
    await context.setOffline(true);
    await page.getByRole("button", { name: "Не сега, оди на Денес", exact: true }).click();
    await expect(problem(page)).toContainText("Не успеавме да продолжиме");
    await expect(page.getByRole("button", { name: "Продолжи сепак" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Прескокни го водичот" })).toHaveCount(0);
  });
});

test.describe("when signing out cannot reach the server", () => {
  test("the teacher stays signed in, and the question says why", async ({ page, context }) => {
    await page.goto("/teacher/help");
    await page.getByRole("button", { name: "Одјави се" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Дали сакате да се одјавите?" });
    await context.setOffline(true);
    await dialog.getByRole("button", { name: "Да, одјави ме" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Не успеавме да Ве одјавиме. Сѐ уште сте најавени. Нема врска со интернет.");
    await expect(page).toHaveURL(/\/teacher\/help$/);
    expect(await sessionOf(page)).toBe("veteran");

    await context.setOffline(false);
    await dialog.getByRole("button", { name: "Да, одјави ме" }).click();
    await expect(page).toHaveURL(/\/teacher\/sign-in$/);
    await expect(note(page)).toHaveText("Успешно се одјавивте.");
  });

  test("No clears the message, so the next time the question is asked it starts clean", async ({ page, context }) => {
    await page.goto("/teacher/help");
    await page.getByRole("button", { name: "Одјави се" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Дали сакате да се одјавите?" });
    await context.setOffline(true);
    await dialog.getByRole("button", { name: "Да, одјави ме" }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await dialog.getByRole("button", { name: "Не, остани" }).click();
    await page.getByRole("button", { name: "Одјави се" }).click();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
  });
});
