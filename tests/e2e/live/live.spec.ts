import { expect, mk, test } from "../fixtures";
import type { Page } from "@playwright/test";

/**
 * The student app built with NEXT_PUBLIC_API_MODE=live, talking to tests/fake-api over HTTP. It
 * checks that Home, Alerts and Profile draw what the API sends, and that what the API cannot back
 * (the demo's timetable, its reset and clock, its test QR codes) is not there.
 */
const API = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 3101}`;

// One fake server holds the state, so the live project runs one worker and each test starts from the
// starting data (see playwright.config.ts).
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${API}/__control/reset`)).ok()).toBe(true);
});

const serverState = async (request: import("@playwright/test").APIRequestContext) =>
  (await (await request.get(`${API}/__control/state`)).json()) as { calls: string[]; bodies: Record<string, unknown> };

test("Home draws the API's student, rank, attendance and latest result", async ({ page, request }) => {
  await page.goto("/app");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Live");
  await expect(page.getByRole("link", { name: new RegExp(mk.t("home.leaderboard")) })).toContainText("#3");
  await expect(page.getByRole("link", { name: new RegExp(mk.t("home.attendance")) })).toContainText("90%");
  await expect(page.getByRole("link", { name: new RegExp(mk.t("home.attendance")) })).toContainText("+2%");
  const latest = page.getByRole("link", { name: new RegExp(mk.t("home.summary")) });
  await expect(latest).toContainText("4/5");
  await expect(latest).toContainText(mk.t("subj.math"));
  await expect(page.getByRole("link", { name: new RegExp(mk.t("home.allSubjects")) })).toContainText(mk.t("home.subjectCount", { n: 3 }));

  const { calls } = await serverState(request);
  expect(calls).toEqual(expect.arrayContaining(["GET /me", "GET /me/leaderboard", "GET /me/attendance", "GET /me/results", "GET /me/courses"]));
});

test("Home hides the demo-only cards", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("link", { name: new RegExp(mk.t("home.summary")) })).toContainText("4/5");

  await expect(page.getByText(mk.t("home.nextLesson"), { exact: true })).toHaveCount(0);
  await expect(page.getByText(mk.t("home.nextTest"), { exact: true })).toHaveCount(0);
  await expect(page.getByText(mk.t("home.nextPop"), { exact: true })).toHaveCount(0);
  await expect(page.getByText(mk.t("home.scanNow"), { exact: true })).toHaveCount(0);
  await expect(page.getByText(mk.t("home.demoTime"), { exact: true })).toHaveCount(0);
});

test("Alerts lists the API's notifications and marks them all read", async ({ page, request }) => {
  await page.goto("/app/notifications");
  const tabs = page.getByRole("navigation", { name: mk.t("nav.main") });

  await expect(page.getByRole("link", { name: new RegExp(mk.t("notif.result_ready.title", { subject: mk.t("subj.math") })) })).toBeVisible();
  await expect(page.getByRole("link", { name: /Parents evening/ })).toBeVisible();
  await expect(page.locator(".item--unread")).toHaveCount(2);
  await expect(tabs).toContainText(mk.t("notif.unreadCount", { n: 2 }));
  // A check-in record is the demo's own; the API sends none.
  await expect(page.getByText(new RegExp(mk.t("notif.checkin.title", { subject: "" })))).toHaveCount(0);

  await page.getByRole("button", { name: mk.t("notif.markAll") }).click();
  await expect(page.locator(".item--unread")).toHaveCount(0);
  await expect(tabs).not.toContainText(mk.t("notif.unreadCount", { n: 2 }));

  const { bodies } = await serverState(request);
  expect(bodies["POST /me/notifications/read"]).toEqual({ all: true });
});

test("Profile draws the API's student and saves a new display name through it", async ({ page, request }) => {
  await page.goto("/app/profile");
  await expect(page.locator(".profile__name")).toContainText("Live Student");
  await expect(page.getByText(/Test School/)).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(mk.t("home.attendance")) })).toContainText("90%");

  // The documents list is the demo's own.
  await expect(page.getByRole("link", { name: mk.t("drawer.documents") })).toHaveCount(0);

  await page.getByRole("button", { name: mk.q("p.edit") }).click();
  await page.getByRole("textbox", { name: mk.q("p.name") }).fill("Liv");
  await page.getByRole("button", { name: mk.q("p.save") }).click();
  await expect(page.locator(".profile__name")).toContainText("Liv");

  const { bodies } = await serverState(request);
  expect(bodies["PATCH /me/profile"]).toEqual({ display_name: "Liv" });
});

test.describe("what the live build leaves out or refuses", () => {
  // The browser logs every response that is not a success: a page that is not there (404), a class
  // code the API refuses (410), a student who is not signed in (401).
  test.use({ allowConsoleErrors: [/Failed to load resource: the server responded with a status of (401|404|410)/] });

  test("the demo-only screens and settings are not there", async ({ page }) => {
    for (const path of ["/app/schedule", "/app/qr-kit", "/app/documents"]) {
      await page.goto(path);
      await expect(page.getByText(mk.t("notfound.title")).first(), path).toBeVisible();
    }

    await page.goto("/app/settings");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(mk.t("settings.demo"), { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: new RegExp(mk.t("settings.reset")) })).toHaveCount(0);
    await expect(page.getByText(mk.t("settings.clock"))).toHaveCount(0);

    await page.goto("/app/achievements");
    await expect(page.getByText(mk.t("ach.answer.title"))).toBeVisible();
    await expect(page.getByText(mk.t("ach.streak.title"))).toHaveCount(0);
  });

  test("a class code the API refuses shows the failure screen", async ({ page }) => {
    await page.goto("/app/checkin/MATH-7B");
    await expect(page.getByRole("alert").filter({ hasText: mk.q("q.unknown.title") })).toBeVisible();
  });

  test("a 401 from the API sends the student to the welcome screen", async ({ page, request }) => {
    await request.post(`${API}/__control/signed-out`);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/welcome/);
    await expect(page.getByRole("heading", { name: mk.t("welcome.title") })).toBeVisible();
  });

  test("the bundle the browser loads carries no mock adapter, classmates or quiz script", async ({ page }) => {
    const scripts: string[] = [];
    page.on("response", async (res) => {
      if (/\.js(\?|$)/.test(res.url())) scripts.push(await res.text().catch(() => ""));
    });
    for (const path of ["/app", "/app/notifications", "/app/profile", "/app/settings", "/app/checkin/MATH-7B"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(scripts.length).toBeGreaterThan(0);
    // Strings only the mock adapter, its leaderboard and its quiz driver contain. A count rather than
    // the script in the failure message: one chunk is a quarter of a megabyte.
    for (const needle of ["mock-session-", "student-marko", "Виктор Илиевски", "Њутнови закони", "marko.trajkovski@student", "teacheraid-mock-challenge"]) {
      expect(scripts.filter((source) => source.includes(needle)).length, `scripts containing "${needle}"`).toBe(0);
    }
  });
});

/**
 * Signing in against the API: the proposed `/auth/student/start` and `/auth/student/verify` (spec 11.1),
 * the codes it answers with, and the session ending behind the app's back.
 */
test.describe("signing in", () => {
  test.use({ allowConsoleErrors: [/Failed to load resource: the server responded with a status of (400|401|404|410|429)/] });

  const EMAIL = "live.student@school.example";
  const CODE = "424242";
  const control = (request: import("@playwright/test").APIRequestContext, what: string) => request.post(`${API}/__control/${what}`);
  const email = (page: Page) => page.getByLabel(mk.t("signin.email"));
  const code = (page: Page) => page.getByLabel(mk.t("signin.code"), { exact: true });
  const problem = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
  const toCodeStage = async (page: Page) => {
    await email(page).fill(EMAIL);
    await email(page).press("Enter");
    await expect(page.getByRole("heading", { name: mk.t("signin.codeTitle") })).toBeVisible();
  };

  test("a signed-out student asks for a code, types it, and is in", async ({ page, request }) => {
    await control(request, "signed-out");
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/welcome\?next=%2Fapp$/);
    await expect(page.getByRole("heading", { name: mk.t("welcome.title") })).toBeVisible();
    // The demo's hint is the mock's own.
    await expect(page.getByText(mk.t("signin.demoUse"), { exact: true })).toHaveCount(0);

    await email(page).fill(`  ${EMAIL.toUpperCase()} `);
    await email(page).press("Enter");
    await expect(page.getByText(EMAIL)).toBeVisible();
    await code(page).fill(CODE);

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Live");

    const { calls, bodies } = await serverState(request);
    // The email goes out trimmed and in lower case, with where to come back to for a redirect; the code with the email it is for.
    expect(bodies["POST /auth/student/start"]).toEqual({ school_email: EMAIL, return_to: "/app" });
    expect(bodies["POST /auth/student/verify"]).toEqual({ school_email: EMAIL, code: CODE });
    // Nothing of the student was asked for before they were signed in, bar the one question who is there.
    const verify = calls.indexOf("POST /auth/student/verify");
    expect(calls.slice(0, verify).filter((c) => c.startsWith("GET") && c !== "GET /me")).toEqual([]);
  });

  test("an email that is not on the school's list is refused with a word to the teacher", async ({ page, request }) => {
    await control(request, "signed-out");
    await page.goto("/app/welcome");
    await email(page).fill("nobody@school.example");
    await email(page).press("Enter");
    await expect(problem(page)).toContainText(mk.t("err.unknown_email"));
    await expect(email(page)).toHaveValue("nobody@school.example");
  });

  test("a wrong code is refused, and too many lock the sign-in for as long as the API says", async ({ page, request }) => {
    await control(request, "signed-out");
    await page.goto("/app/welcome");
    await toCodeStage(page);

    await code(page).fill("111111");
    await expect(problem(page)).toContainText(mk.t("err.invalid_code"));
    await code(page).fill("111111");
    await expect(problem(page)).toContainText(mk.t("err.invalid_code"));
    await code(page).fill("111111");

    // Retry-After crosses origins only because the API exposes it (CORS): the wait shown is the API's 2 seconds, not a guess.
    await expect(code(page)).toBeDisabled();
    await expect(page.getByText(/Премногу погрешни кодови. Обиди се повторно за [12] секунди/)).toBeVisible();
    await expect(code(page)).toBeEnabled({ timeout: 6000 });
    await code(page).fill(CODE);
    await expect(page).toHaveURL(/\/app$/);
  });

  test("a code that has expired is refused, and a new one is asked for", async ({ page, request }) => {
    await control(request, "signed-out");
    await page.goto("/app/welcome");
    await toCodeStage(page);
    await control(request, "expire-code");
    await code(page).fill(CODE);
    await expect(problem(page)).toContainText(mk.t("err.code_expired"));
    await expect(code(page)).toHaveValue("");
  });

  test("a school that signs in through its own identity provider takes the student there", async ({ page, request }) => {
    await control(request, "signed-out");
    await control(request, "redirect");
    await page.goto("/app/welcome?next=%2Fapp%2Fattendance");
    await email(page).fill(EMAIL);
    await email(page).press("Enter");

    await expect(page).toHaveURL(`${API}/__idp`);
    await expect(page.getByRole("heading", { name: "School sign-in" })).toBeVisible();
    const { bodies } = await serverState(request);
    expect(bodies["POST /auth/student/start"]).toEqual({ school_email: EMAIL, return_to: "/app/attendance" });
  });

  test("a class QR opened while signed out signs in, then joins with the same code (EC-JOIN-05)", async ({ page, request }) => {
    await control(request, "signed-out");
    await page.goto("/app/checkin/MATH-7B");
    await expect(page).toHaveURL(/\/app\/welcome\?next=%2Fapp%2Fcheckin%2FMATH-7B$/);
    await toCodeStage(page);
    await code(page).fill(CODE);

    // The API refuses this fake code, which is not the point: it was asked, once, after the sign-in, with the scanned token.
    await expect(page.getByRole("alert").filter({ hasText: mk.q("q.unknown.title") })).toBeVisible();
    const { calls, bodies } = await serverState(request);
    expect(bodies["POST /sessions/join"]).toEqual({ token: "MATH-7B" });
    expect(calls.filter((c) => c === "POST /sessions/join")).toHaveLength(1);
    expect(calls.indexOf("POST /sessions/join")).toBeGreaterThan(calls.indexOf("POST /auth/student/verify"));
    expect(bodies["POST /auth/student/start"]).toEqual({ school_email: EMAIL, return_to: "/app/checkin/MATH-7B" });
  });

  test("signing in on another device ends this session: any call that hears of it shows the full screen", async ({ page, request }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Live");

    // Home is already drawn, and so are the alerts the tab bar counts. What the student does next
    // asks the API something it has not been asked before, and is told.
    await control(request, "elsewhere");
    await page.getByRole("navigation", { name: mk.t("nav.main") }).getByRole("link", { name: mk.t("nav.alerts") }).click();
    await expect(page).toHaveURL(/\/app\/notifications$/);
    await page.getByRole("button", { name: mk.t("notif.markAll") }).click();

    const screen = page.getByRole("alert").filter({ hasText: mk.t("elsewhere.title") });
    await expect(screen).toContainText(mk.t("elsewhere.body"));
    await expect(page.getByRole("navigation", { name: mk.t("nav.main") })).toHaveCount(0);

    await page.getByRole("button", { name: mk.t("elsewhere.cta") }).click();
    await expect(page).toHaveURL(/\/app\/welcome\?next=%2Fapp%2Fnotifications$/);
    await toCodeStage(page);
    await code(page).fill(CODE);
    await expect(page).toHaveURL(/\/app\/notifications$/);
    await expect(page.getByRole("link", { name: /Parents evening/ })).toBeVisible();
  });

  test("the API's own word on a fresh load is enough: signed in elsewhere shows the same screen", async ({ page, request }) => {
    await control(request, "elsewhere");
    await page.goto("/app/profile");
    await expect(page.getByRole("alert").filter({ hasText: mk.t("elsewhere.title") })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/profile$/);
  });

  test("signing out tells the API, clears what was shown and starts the next student at Home", async ({ page, request }) => {
    await page.goto("/app/profile");
    await expect(page.locator(".profile__name")).toContainText("Live Student");
    await page.getByRole("main").getByRole("button", { name: mk.t("drawer.logout") }).click();
    await page.getByRole("dialog", { name: mk.t("confirm.logout") }).getByRole("button", { name: mk.t("drawer.logout") }).click();

    await expect(page).toHaveURL(/\/app\/welcome$/);
    expect((await serverState(request)).calls).toContain("POST /auth/logout");
    await expect(page.getByText("Live Student")).toHaveCount(0);

    await toCodeStage(page);
    await code(page).fill(CODE);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Live");
  });

  test.describe("with the API out of reach", () => {
    test.use({ allowConsoleErrors: [/net::ERR_FAILED/] });

    test("a student is told so, with a way to try again", async ({ page, context }) => {
      await context.route(`${API}/**`, (route) => route.abort());
      await page.goto("/app");
      await expect(page.getByRole("alert").filter({ hasText: mk.t("err.network") })).toBeVisible();
      await context.unroute(`${API}/**`);
      await page.getByRole("button", { name: mk.t("state.retry") }).click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Live");
    });
  });
});
