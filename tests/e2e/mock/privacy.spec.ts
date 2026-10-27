import type { Page } from "@playwright/test";
import { MOCK_CODE, MOCK_ROSTER } from "@/lib/app/api/mock/roster";
import { NOTICE_VERSION } from "@/lib/app/privacy";
import { PRIVACY, TERMS } from "@/lib/app/privacy-copy";
import { en, expect, mk, start, test, untilStage } from "../fixtures";

/**
 * Privacy and the terms (spec 1.3, 7.13, 7.20, 13.4, F-16). The school is the controller and TeacherAid the processor, so the first
 * sign-in shows a notice with one Continue and no consent box. The screens in this file are readable without signing in.
 */
const STORE = "teacheraid-app-v1";
const state = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}") as Record<string, unknown>, STORE);
const dock = (page: Page) => page.getByRole("navigation", { name: mk.t("nav.main") });
const title = (page: Page, key: "notice.title" | "notice.titleUpdated", t = mk) => page.getByRole("heading", { level: 1, name: t.t(key) });
const cont = (page: Page, t = mk) => page.getByRole("button", { name: t.t("notice.continue") });

async function signIn(page: Page) {
  await page.getByLabel(mk.t("signin.email")).fill(MOCK_ROSTER[0]);
  await page.getByRole("button", { name: mk.t("signin.next") }).click();
  await page.getByLabel(mk.t("signin.code"), { exact: true }).fill(MOCK_CODE);
}

/** The phone's idea of its connection, which is all the app asks (lib/app/session/net.ts). */
const signal = (page: Page, on: boolean) =>
  page.evaluate((up) => {
    Object.defineProperty(navigator, "onLine", { get: () => up, configurable: true });
    window.dispatchEvent(new Event(up ? "online" : "offline"));
  }, on);

const NEW_STUDENT = { signedIn: false, noticeVersion: null };

test.describe("the first sign-in", () => {
  test("the welcome screen lets a student read the notice and the terms before signing in", async ({ page }) => {
    await start(page, { state: NEW_STUDENT });
    await page.goto("/app/welcome");
    await expect(page.getByText(mk.t("privacy.welcome"))).toBeVisible();
    await expect(page.getByRole("link", { name: mk.t("privacy.row") })).toHaveAttribute("href", "/app/privacy");
    await expect(page.getByRole("link", { name: mk.t("terms.row") })).toHaveAttribute("href", "/app/terms");

    await page.getByRole("link", { name: mk.t("privacy.row") }).click();
    await expect(page).toHaveURL(/\/app\/privacy$/);
    await expect(page.getByRole("heading", { level: 1, name: PRIVACY.mk.title })).toBeVisible();
    // Nobody is signed in: no tab bar, and the page is not sent to sign in.
    await expect(dock(page)).toHaveCount(0);
  });

  test("shows a notice with a short summary, two links and one Continue, and no consent box", async ({ page }) => {
    await start(page, { state: NEW_STUDENT });
    await page.goto("/app/welcome");
    await signIn(page);

    await expect(title(page, "notice.title")).toBeVisible();
    for (const key of ["notice.b1", "notice.b2", "notice.b3", "notice.b4"] as const) await expect(page.getByText(mk.t(key))).toBeVisible();
    await expect(page.getByRole("link", { name: mk.t("notice.readPrivacy") })).toHaveAttribute("href", "/app/privacy");
    await expect(page.getByRole("link", { name: mk.t("notice.readTerms") })).toHaveAttribute("href", "/app/terms");
    // A notice, not a consent: nothing to tick, and it says what Continue records.
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByText(mk.t("notice.foot"))).toBeVisible();
    await expect(page.getByRole("button", { name: mk.t("drawer.logout") })).toBeVisible();
    // Nothing behind it: no tab bar, no Home.
    await expect(dock(page)).toHaveCount(0);
    await expect(cont(page)).toBeFocused();
    expect((await state(page)).noticeVersion).toBeNull();
  });

  test("Continue records the version and the time, shows Home, and the notice does not come back", async ({ page }) => {
    await start(page, { state: NEW_STUDENT });
    await page.goto("/app/welcome");
    await signIn(page);
    await cont(page).click();

    await expect(dock(page)).toBeVisible();
    await expect(title(page, "notice.title")).toHaveCount(0);
    const saved = await state(page);
    expect(saved.noticeVersion).toBe(NOTICE_VERSION);
    expect(saved.noticeAt).toBeGreaterThan(Date.now() - 60_000);

    await page.reload();
    await expect(dock(page)).toBeVisible();
    await expect(title(page, "notice.title")).toHaveCount(0);
  });

  test("goes on to the check-in link that was asked for, and records no attendance before the student has seen the notice", async ({ page }) => {
    await start(page, { state: NEW_STUDENT });
    await page.goto("/app/checkin/MATH-7B");
    await expect(page).toHaveURL(/welcome\?next=%2Fapp%2Fcheckin%2FMATH-7B$/);
    await signIn(page);

    await expect(title(page, "notice.title")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/checkin\/MATH-7B$/);
    expect((await state(page)).checkins ?? []).toEqual([]);

    await cont(page).click();
    await expect(page).toHaveURL(/\/app\/play\/MATH-7B$/);
    expect(((await state(page)).checkins as unknown[]).length).toBe(1);
  });

  test("can be read in full from the notice, and Back comes back to it", async ({ page }) => {
    await start(page, { state: NEW_STUDENT });
    await page.goto("/app/welcome");
    await signIn(page);
    await page.getByRole("link", { name: mk.t("notice.readTerms") }).click();
    await expect(page.getByRole("heading", { level: 1, name: TERMS.mk.title })).toBeVisible();
    await page.getByRole("button", { name: mk.t("back") }).click();
    await expect(title(page, "notice.title")).toBeVisible();
  });

  test("a student who would rather not go on can sign out from it", async ({ page }) => {
    await start(page, { state: NEW_STUDENT });
    await page.goto("/app/welcome");
    await signIn(page);
    await page.getByRole("button", { name: mk.t("drawer.logout") }).click();
    await expect(page).toHaveURL(/\/app\/welcome/);
    await expect(page.getByRole("heading", { level: 1, name: mk.t("welcome.title") })).toBeVisible();
    expect((await state(page)).noticeVersion).toBeNull();
  });

  test("is in English when the phone is", async ({ page }) => {
    await start(page, { state: NEW_STUDENT, locale: "en" });
    await page.goto("/app/welcome");
    await page.getByLabel(en.t("signin.email")).fill(MOCK_ROSTER[0]);
    await page.getByRole("button", { name: en.t("signin.next") }).click();
    await page.getByLabel(en.t("signin.code"), { exact: true }).fill(MOCK_CODE);
    await expect(title(page, "notice.title", en)).toBeVisible();
    await expect(cont(page, en)).toHaveText("Continue");
  });
});

test.describe("when the notice changes", () => {
  test("a student who saw an older version sees the screen again, saying it was updated", async ({ page }) => {
    await start(page, { state: { signedIn: true, noticeVersion: "2026-01-01" } });
    await page.goto("/app");
    await expect(title(page, "notice.titleUpdated")).toBeVisible();
    await expect(page.getByText(mk.t("notice.subUpdated"))).toBeVisible();
    await cont(page).click();
    await expect(dock(page)).toBeVisible();
    expect((await state(page)).noticeVersion).toBe(NOTICE_VERSION);
  });

  test("never comes in the middle of a lesson: it waits for the student to leave it", async ({ page }) => {
    await start(page, { state: { signedIn: true, noticeVersion: "2026-01-01" } });
    await page.clock.install();
    await page.goto("/app/play/MATH-7B");
    await untilStage(page, "waiting_start");
    await expect(title(page, "notice.titleUpdated")).toHaveCount(0);

    await page.getByRole("button", { name: mk.q("q.leave") }).click();
    await page.getByRole("dialog", { name: mk.q("q.leaveTitle") }).getByRole("button", { name: mk.q("q.leaveConfirm") }).click();
    await expect(title(page, "notice.titleUpdated")).toBeVisible();
  });

  test("the demo can show it again, as for a new student", async ({ page }) => {
    await page.goto("/app/settings");
    await page.getByRole("button", { name: new RegExp(mk.t("settings.demo.notice")) }).click();
    await expect(title(page, "notice.title")).toBeVisible();
  });
});

test.describe("the privacy notice", () => {
  test("opens without signing in, with a short version, a list to jump by, and every section", async ({ page }) => {
    await start(page, { state: NEW_STUDENT });
    await page.goto("/app/privacy");
    await expect(page).toHaveURL(/\/app\/privacy$/);
    const doc = PRIVACY.mk;
    await expect(page.getByRole("heading", { level: 1, name: doc.title })).toBeVisible();
    const summary = page.getByRole("region", { name: doc.summaryTitle });
    for (const line of doc.summary) await expect(summary.getByText(line)).toBeVisible();
    await expect(page.getByRole("navigation", { name: doc.jump }).getByRole("link")).toHaveCount(doc.sections.filter((s) => s.level === 2).length);
    for (const s of doc.sections) await expect(page.locator(`#${s.id}`), s.id).toBeAttached();
    await expect(dock(page)).toHaveCount(0);
  });

  test("says what is collected and why, one item at a time, and who sees what", async ({ page }) => {
    await page.goto("/app/privacy");
    for (const id of ["account", "profile", "attendance", "answers", "topics", "ask", "focus", "practice", "alerts", "signin", "not-collected"]) {
      await expect(page.locator(`#${id}`), id).toContainText(PRIVACY.mk.sections.find((s) => s.id === id)!.title);
    }
    for (const id of ["sees-teacher", "sees-class", "sees-admin", "sees-head", "sees-staff", "sees-other"]) await expect(page.locator(`#${id}`), id).toBeAttached();
  });

  test("shows the app's own lines for leaving the quiz, asking the teacher and notifications, word for word", async ({ page }) => {
    await page.goto("/app/privacy");
    await expect(page.locator("#focus")).toContainText(mk.q("fair.note"));
    await expect(page.locator("#ask")).toContainText(mk.q("ask.honest"));
    await expect(page.locator("#alerts")).toContainText(mk.t("push.ask.body"));
  });

  test("is in English when the phone is", async ({ page }) => {
    await start(page, { state: { signedIn: true }, locale: "en" });
    await page.goto("/app/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy notice" })).toBeVisible();
    await expect(page.locator("#focus")).toContainText(en.q("fair.note"));
    await expect(page.locator("#ask")).toContainText(en.q("ask.honest"));
    await expect(page.locator("#alerts")).toContainText(en.t("push.ask.body"));
    await expect(page.getByText("Updated 27 October 2026")).toBeVisible();
  });

  test("opens at the section a link names", async ({ page }) => {
    await page.goto("/app/privacy#phone");
    await expect(page.locator("#phone h2")).toBeInViewport();
    await expect(page.locator("#who h2")).not.toBeInViewport();
    await page.goto("/app/privacy#focus");
    await expect(page.locator("#focus h3")).toBeInViewport();
  });

  test("jumps from the list to a section, and puts the keyboard there", async ({ page }) => {
    await page.goto("/app/privacy");
    const keep = PRIVACY.mk.sections.find((s) => s.id === "keep")!;
    await page.getByRole("navigation", { name: PRIVACY.mk.jump }).getByRole("link", { name: keep.title }).click();
    await expect(page.locator("#keep h2")).toBeInViewport();
    await expect(page.locator("#keep h2")).toBeFocused();
    await expect(page).toHaveURL(/#keep$/);
  });

  test("tells a student the three things the spec decides: who is responsible, how long, and how to ask", async ({ page }) => {
    await page.goto("/app/privacy");
    await expect(page.locator("#who")).toContainText("Училиштето е одговорно");
    await expect(page.locator("#keep")).toContainText("30 дена");
    await expect(page.locator("#rights")).toContainText("Во апликацијата нема копче за ова");
    await expect(page.locator("#contact").getByRole("link")).toHaveAttribute("href", "mailto:hello@teacheraid.education");
  });
});

test.describe("the terms of use", () => {
  test("open without signing in, with the three rules of fair use", async ({ page }) => {
    await start(page, { state: NEW_STUDENT });
    await page.goto("/app/terms");
    await expect(page).toHaveURL(/\/app\/terms$/);
    await expect(page.getByRole("heading", { level: 1, name: TERMS.mk.title })).toBeVisible();
    for (const id of ["yourself", "respect", "qr"]) await expect(page.locator(`#${id}`), id).toContainText(TERMS.mk.sections.find((s) => s.id === id)!.title);
    await expect(page.locator("#data").getByRole("link")).toHaveAttribute("href", "/app/privacy");
  });
});

test.describe("the way to them from the app", () => {
  test("Profile has Your data, the notice and the terms", async ({ page }) => {
    await page.goto("/app/profile");
    await expect(page.getByRole("link", { name: new RegExp(mk.t("data.row")) })).toHaveAttribute("href", "/app/data");
    await expect(page.getByRole("link", { name: mk.t("privacy.row") })).toHaveAttribute("href", "/app/privacy");
    await expect(page.getByRole("link", { name: mk.t("terms.row") })).toHaveAttribute("href", "/app/terms");
    await page.getByRole("link", { name: mk.t("terms.row") }).click();
    await expect(page.getByRole("heading", { level: 1, name: TERMS.mk.title })).toBeVisible();
    // Signed in, the tab bar stays.
    await expect(dock(page)).toBeVisible();
  });

  test("Settings has the same, and a line under the notifications switch that goes to how alerts use data", async ({ page }) => {
    await page.goto("/app/settings");
    await expect(page.getByRole("link", { name: new RegExp(mk.t("data.row")) })).toHaveAttribute("href", "/app/data");
    await page.getByRole("link", { name: mk.t("privacy.alertsLink") }).click();
    await expect(page).toHaveURL(/\/app\/privacy#alerts$/);
    await expect(page.locator("#alerts h3")).toBeInViewport();
  });

  test("the first line about leaving the quiz opens its detail in place and links to its section, without leaving the lesson", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/FOCUS-7B");
    await untilStage(page, "waiting_start");
    const note = page.getByRole("note");
    await expect(note).toContainText(mk.q("fair.note"));
    await note.getByText(mk.t("privacy.focusLink")).click();
    await expect(note).toContainText("Подетално");
    await expect(note.getByRole("link", { name: mk.t("privacy.fullNotice") })).toHaveAttribute("href", "/app/privacy#focus");
    await expect(page).toHaveURL(/\/app\/play\/FOCUS-7B$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("the notifications ask", () => {
  // On an iPhone in the browser the ask is the one about the Home Screen; the link belongs to the ask that turns notifications on.
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36" });

  test("after a practice set links to how alerts use data, and following it closes the ask", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "default", configurable: true }));
    await start(page, { state: { signedIn: true, practiceAnswers: { "ps-session-math-1": { pf1: "1", pf2: "0", pf3: "true" } } } });
    await page.goto("/app/practice/ps-session-math-1");
    await page.locator(".n-input").fill("15");
    await page.locator(".n-input").press("Enter");
    await page.getByRole("button", { name: mk.t("pr.result") }).click();
    await page.getByRole("button", { name: mk.t("close"), exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(mk.t("push.ask.title"), { timeout: 5000 });
    const link = dialog.getByRole("link", { name: mk.t("privacy.alertsLink") });
    await expect(link).toHaveAttribute("href", "/app/privacy#alerts");
    await link.click();
    await expect(page).toHaveURL(/\/app\/privacy#alerts$/);
    await expect(dialog).toHaveCount(0);
  });
});

test.describe("Your data", () => {
  /** The row whose label is exactly this (a count's label can be the start of another's). */
  const row = (page: Page, key: Parameters<typeof mk.t>[0]) => page.locator("main.screen .list .item").filter({ has: page.getByText(mk.t(key), { exact: true }) });

  test("shows the account and a count of each kind of record, and says they are counts", async ({ page }) => {
    await page.goto("/app/data");
    await expect(page.getByRole("heading", { level: 1, name: mk.t("data.title") })).toBeVisible();
    await expect(page.getByText("marko.trajkovski@student.gnaumov.edu.mk")).toBeVisible();
    await expect(page.getByText(mk.t("data.displayNone"))).toBeVisible();
    for (const key of ["data.n.attendance", "data.n.answers", "data.n.asks", "data.n.focus", "data.n.practice", "data.n.alerts", "data.n.push"] as const) {
      await expect(row(page, key), key).toBeVisible();
    }
    await expect(row(page, "data.n.attendance")).toContainText("20");
    await expect(row(page, "data.n.asks")).toContainText("0");
    await expect(row(page, "data.n.push")).toContainText(mk.t("data.no"));
    await expect(page.getByText(mk.t("data.counts"))).toBeVisible();
  });

  test("grows with what the student does: a check-in and a question to the teacher", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/ASK-7B");
    await untilStage(page, "waiting_start");
    await page.getByRole("button", { name: mk.q("ask.entry") }).click();
    await page.getByRole("textbox", { name: mk.q("ask.label") }).fill("Може ли пример?");
    await page.getByRole("textbox", { name: mk.q("ask.label") }).press("Enter");
    await expect(page.getByRole("dialog").getByRole("heading", { name: mk.q("ask.sent") })).toBeVisible();
    await page.goto("/app/data");
    await expect(row(page, "data.n.attendance")).toContainText("21");
    await expect(row(page, "data.n.asks")).toContainText("1");
  });

  test("explains that a copy or a deletion goes through the school, with no button to delete, and gives the contact", async ({ page }) => {
    await page.goto("/app/data");
    await expect(page.getByText(mk.t("data.requestBody"))).toBeVisible();
    await expect(page.getByRole("button", { name: /избриши|delete/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: mk.t("data.requestRights") })).toHaveAttribute("href", "/app/privacy#rights");
    await expect(page.getByRole("link", { name: "hello@teacheraid.education" })).toHaveAttribute("href", "mailto:hello@teacheraid.education");
  });

  test("clearing the phone asks first, keeps the student signed in and the language, and clears what the app saved", async ({ page }) => {
    await page.goto("/app/data");
    await page.evaluate(() => {
      localStorage.setItem("teacheraid-camera-intro", "1");
      localStorage.setItem("teacheraid-shown-attendance", "87");
      sessionStorage.setItem("teacheraid-home-rise", "1");
    });
    await page.getByRole("button", { name: new RegExp(mk.t("data.clear")) }).click();
    const sheet = page.getByRole("dialog", { name: mk.t("data.clearTitle") });
    await expect(sheet).toContainText(mk.t("data.clearHint"));
    // Nothing is unsent, so there is no warning about lost answers.
    await expect(sheet).not.toContainText("не е испратено");

    // Cancel is the safe, highlighted choice and changes nothing.
    await sheet.getByRole("button", { name: mk.t("confirm.cancel") }).click();
    expect(await page.evaluate(() => localStorage.getItem("teacheraid-camera-intro"))).toBe("1");

    await page.getByRole("button", { name: new RegExp(mk.t("data.clear")) }).click();
    await sheet.getByRole("button", { name: mk.t("data.clearConfirm") }).click();
    await expect(page.getByText(mk.t("data.cleared")).first()).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("teacheraid-camera-intro"))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("teacheraid-shown-attendance"))).toBeNull();
    expect(await page.evaluate(() => sessionStorage.getItem("teacheraid-home-rise"))).toBeNull();
    // Still signed in, same screen, same language.
    await expect(page.getByRole("heading", { level: 1, name: mk.t("data.title") })).toBeVisible();
    expect((await state(page)).signedIn).toBe(true);
  });

  test("warns about answers and questions that are not sent yet, and loses them only if the student says so", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/ASK-7B");
    await untilStage(page, "waiting_start");
    await page.getByRole("button", { name: mk.q("ask.entry") }).click();
    // The phone loses its signal. (Only the phone's say-so: the pages the app opens next still load.)
    await signal(page, false);
    const box = page.getByRole("textbox", { name: mk.q("ask.label") });
    await box.fill("Прашање без интернет");
    await box.press("Enter");
    await expect(page.getByRole("dialog").getByRole("heading", { name: mk.q("ans.saved") })).toBeVisible();

    // Leave the lesson (still offline) and go to Your data.
    await page.getByRole("dialog").getByRole("button", { name: mk.q("ask.done") }).click();
    await page.getByRole("button", { name: mk.q("q.leave") }).click();
    await page.getByRole("dialog", { name: mk.q("q.leaveTitle") }).getByRole("button", { name: mk.q("q.leaveConfirm") }).click();
    await dock(page).getByRole("link", { name: mk.t("nav.profile") }).click();
    await page.getByRole("link", { name: new RegExp(mk.t("data.row")) }).click();
    await expect(page.getByRole("heading", { level: 1, name: mk.t("data.title") })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(mk.t("data.clear")) }).click();
    const warning = page.getByRole("dialog", { name: mk.t("data.clearUnsent.one") });
    await expect(warning).toBeVisible();

    // Keeping is the highlighted choice: nothing is lost.
    await warning.getByRole("button", { name: mk.t("confirm.cancel") }).click();
    await page.getByRole("button", { name: new RegExp(mk.t("data.clear")) }).click();
    await expect(page.getByRole("dialog", { name: mk.t("data.clearUnsent.one") })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: mk.t("data.clearAnyway") }).click();
    await expect(page.getByText(mk.t("data.cleared")).first()).toBeVisible();

    // Back online: nothing is sent, because nothing is left.
    await signal(page, true);
    await page.waitForTimeout(500);
    expect((await page.evaluate(() => localStorage.getItem("teacheraid-mock-console"))) ?? "").not.toContain("Прашање без интернет");
  });
});
