import { readFileSync } from "node:fs";
import { NOTICE_VERSION } from "@/lib/app/privacy";
import { PRIVACY, TERMS } from "@/lib/app/privacy-copy";
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

  test("a class code the API does not know shows the failure screen", async ({ page }) => {
    await page.goto("/app/checkin/MATH-7B");
    await expect(page.getByRole("alert").filter({ hasText: mk.q("q.fail.unknown.title") })).toBeVisible();
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
      // Not "networkidle": the app holds the student's event stream open on every screen, so the network is never quiet.
      await page.waitForLoadState("load");
      await expect(page.locator("main").first()).toBeVisible();
      await page.waitForTimeout(500);
    }
    expect(scripts.length).toBeGreaterThan(0);
    // Strings only the mock adapter, its leaderboard and its quiz driver contain. A count rather than
    // the script in the failure message: one chunk is a quarter of a megabyte.
    for (const needle of ["mock-session-", "flaky-7b", "mock-classmate-", "student-marko", "Виктор Илиевски", "Њутнови закони", "marko.trajkovski@student", "teacheraid-mock-challenge", "opener-7b", "debate-7b", "numeric-7b", "ask-7b", "focus-7b", "teacheraid-mock-console", "Spelling matters, even in a message to a friend"]) {
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
    await expect(page.getByRole("alert").filter({ hasText: mk.q("q.fail.unknown.title") })).toBeVisible();
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

/**
 * A live session against the API: joining, the snapshot, the event stream and the answer, with the test
 * playing the teacher through the fake API's control endpoints. Nothing moves by itself, so each test
 * says when a question opens and closes. The server's questions are the fake's: 2x = 10 (right answer
 * the second option), a true or false (false), and 7 x 8 (second option).
 */
test.describe("a live session", () => {
  test.use({ allowConsoleErrors: [/Failed to load resource: (the server responded with a status of (403|404|409|410|503)|net::ERR_)/] });

  const OPTION = ".q-opt, .q-tf__btn";
  const teacher = (request: import("@playwright/test").APIRequestContext, action: string, data: object = {}) =>
    request.post(`${API}/__control/session/${action}`, { data });
  const control = (request: import("@playwright/test").APIRequestContext, what: string, data: object = {}) =>
    request.post(`${API}/__control/${what}`, { data });
  /** What the fake server holds of the live session: the answers it took, with the time it counted each at. */
  type Held = { answers: Record<string, { response: string; key: string; answeredAt: number; receivedAt: number }>; current: { closesAt: number; status: string } | null };
  const held = async (request: import("@playwright/test").APIRequestContext) =>
    ((await (await request.get(`${API}/__control/state`)).json()) as { session: Held }).session;

  /**
   * A phone that has lost its signal: the browser is offline, and the lesson's stream is cut and refused, so it hears
   * nothing from the class (Playwright's offline mode alone leaves an open stream running).
   */
  const goOffline = async (context: import("@playwright/test").BrowserContext, request: import("@playwright/test").APIRequestContext) => {
    await control(request, "block-streams", { on: true });
    await context.setOffline(true);
    await control(request, "drop-streams");
  };
  const goOnline = async (context: import("@playwright/test").BrowserContext, request: import("@playwright/test").APIRequestContext) => {
    await context.setOffline(false);
    await control(request, "block-streams", { on: false });
  };
  const timerSeconds = async (page: Page) => Number(((await page.getByRole("timer").getAttribute("aria-label")) ?? "").match(/\d+/)?.[0]);

  /** In the lobby, on the event stream. */
  async function inLobby(page: Page, request: import("@playwright/test").APIRequestContext) {
    await page.goto("/app/checkin/LIVE-7B");
    await expect(page).toHaveURL(/\/app\/play\/LIVE-7B$/);
    await expect(page.getByText(mk.q("q.waitTeacher"))).toBeVisible();
    await expect.poll(async () => (await (await request.get(`${API}/__control/state`)).json()).streams).toBeGreaterThan(0);
  }

  test("joining sends the token, asks for the snapshot and opens the event stream", async ({ page, request }) => {
    await inLobby(page, request);
    const { calls, bodies } = await serverState(request);
    expect(bodies["POST /sessions/join"]).toEqual({ token: "LIVE-7B" });
    expect(calls).toEqual(expect.arrayContaining(["POST /sessions/join", "GET /sessions/se-live-1/student-state", "GET /realtime"]));
    // Joining is the attendance, and the lobby shows who else is in.
    await expect(page.getByText(mk.q("q.joinedCount"))).toBeVisible();
    await teacher(request, "joined", { count: 21 });
    await expect(page.locator(".q-joined .q-big")).toHaveText("21");
    await expect(page.getByText("ВЛ")).toBeVisible(); // initials of the newest to arrive
  });

  test("a lesson from the lobby to the end: question, answer, result, reveal, ranking, ending", async ({ page, request }) => {
    await inLobby(page, request);

    // The teacher starts and fires the first question.
    await teacher(request, "fire", { index: 0, timer: 60 });
    await expect(page.getByRole("heading", { name: "2x = 10. What is x?" })).toBeVisible();
    await expect(page.getByRole("timer")).toBeVisible();
    expect(await timerSeconds(page)).toBeGreaterThanOrEqual(55);

    // Answer B (right). The answer goes with its question, a key and a time.
    await page.locator(OPTION).nth(1).click();
    await expect(page.getByText(mk.q("q.locked"))).toBeVisible();
    await expect.poll(async () => (await serverState(request)).bodies["POST /sessions/se-live-1/answers"]).toBeTruthy();
    const body = (await serverState(request)).bodies["POST /sessions/se-live-1/answers"] as Record<string, string>;
    expect(body).toMatchObject({ session_question_id: "fq1", response: "1" });
    expect(body.idempotency_key).toBeTruthy();
    expect(Number.isNaN(Date.parse(body.answered_at))).toBe(false);

    // Others answer: the count follows the server.
    await teacher(request, "progress", { answered: 7 });
    await expect(page.getByText(/од 13 одговорија/)).toBeVisible();

    // It closes; the student's own result arrives on their channel.
    await teacher(request, "close");
    await expect(page.getByRole("heading", { name: mk.q("q.right") })).toBeVisible();
    await expect(page.locator(".q-gain")).toContainText(/\+1\d/);
    await teacher(request, "reveal");

    // Then the ranking, until the next question.
    await expect(page.getByText(mk.q("q.next"))).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(mk.q("q.place"))).toBeVisible();
    await expect(page.getByRole("list", { name: mk.q("q.board") })).toBeVisible();

    // A true or false: answer false (right).
    await teacher(request, "fire", { index: 1, timer: 60 });
    await expect(page.getByText(mk.q("q.tfPrompt"))).toBeVisible();
    await page.locator(".q-tf__btn").nth(1).click();
    await expect.poll(async () => ((await serverState(request)).bodies["POST /sessions/se-live-1/answers"] as Record<string, string>)?.response).toBe("false");
    await teacher(request, "close");
    await expect(page.getByRole("heading", { name: mk.q("q.right") })).toBeVisible();

    // The teacher ends the session mid-lesson: the ending shows the tally, the place and the points.
    await teacher(request, "end");
    const ended = page.getByRole("heading", { name: mk.q("q.ended.title") });
    await expect(ended).toBeVisible();
    await expect(page.getByText(/2 од 4 точни/)).toBeVisible();
    await expect(page.getByText(mk.q("q.place"))).toBeVisible();
    await expect(page.getByText(mk.q("q.total"))).toBeVisible();

    // The summary is the session's own result, which the API wrote when it ended.
    await page.getByRole("link", { name: mk.q("q.ended.summary") }).click();
    await expect(page).toHaveURL(/\/app\/summary\/se-live-1$/);
    await expect(page.getByText("Linear equations")).toBeVisible();
    await expect(page.locator(".tile-big")).toHaveText("2/4");
  });

  test("a wrong answer waits for the teacher to show the right one", async ({ page, request }) => {
    await inLobby(page, request);
    await teacher(request, "fire", { index: 0, timer: 60 });
    await page.locator(OPTION).nth(0).click();
    await teacher(request, "close");
    await expect(page.getByRole("heading", { name: mk.q("q.wrong") })).toBeVisible();
    await expect(page.getByText(mk.q("q.waitReveal"))).toBeVisible();
    await expect(page.getByText(mk.q("q.correctAnswer"))).toHaveCount(0);

    await teacher(request, "reveal");
    await expect(page.getByText(mk.q("q.correctAnswer"))).toBeVisible();
    await expect(page.locator(".q-correct")).toContainText("5");
    await expect(page.getByText(mk.q("q.waitReveal"))).toHaveCount(0);
  });

  test("a question nobody answered closes with no points and says the time ran out", async ({ page, request }) => {
    await inLobby(page, request);
    await teacher(request, "fire", { index: 0, timer: 60 });
    await expect(page.locator(OPTION).first()).toBeVisible();
    await teacher(request, "close");
    await expect(page.getByRole("heading", { name: mk.q("q.timeout") })).toBeVisible();
  });

  test("a skipped question disappears and does not count", async ({ page, request }) => {
    await inLobby(page, request);
    await teacher(request, "fire", { index: 0, timer: 60 });
    await page.locator(OPTION).nth(1).click();
    await expect(page.getByText(mk.q("q.locked"))).toBeVisible();
    // The answer is saved before it is sent, so wait until the server has it before skipping the question.
    await expect.poll(async () => ((await held(request)).answers.fq1 ?? null)?.response).toBe("1");
    await teacher(request, "skip");
    await expect(page.getByText(mk.q("q.next"))).toBeVisible();
    await expect(page.getByText(mk.q("q.locked"))).toHaveCount(0);
    // Nothing is shown of a verdict, and the next question starts clean.
    await teacher(request, "fire", { index: 1, timer: 60 });
    await expect(page.locator(".q-tf__btn").first()).toBeVisible();
  });

  test("the session ending in the middle of a question goes straight to the ending", async ({ page, request }) => {
    await inLobby(page, request);
    await teacher(request, "fire", { index: 0, timer: 60 });
    await expect(page.locator(OPTION).first()).toBeVisible();
    await teacher(request, "end");
    await expect(page.getByRole("heading", { name: mk.q("q.ended.title") })).toBeVisible();
    await expect(page.locator(OPTION)).toHaveCount(0);
  });

  test("the countdown runs on the server's clock, two minutes ahead of this machine's, and so does the answer's time", async ({ page, request }) => {
    await control(request, "skew", { ms: 120_000 });
    await inLobby(page, request);
    await teacher(request, "fire", { index: 0, timer: 45 });
    await expect(page.locator(OPTION).first()).toBeVisible();
    // Had the app trusted this machine's clock, the question would have ended a minute and a half ago, or read 165.
    const seconds = await timerSeconds(page);
    expect(seconds).toBeGreaterThanOrEqual(40);
    expect(seconds).toBeLessThanOrEqual(45);

    await page.locator(OPTION).nth(1).click();
    await expect.poll(async () => (await serverState(request)).bodies["POST /sessions/se-live-1/answers"]).toBeTruthy();
    const { answered_at } = (await serverState(request)).bodies["POST /sessions/se-live-1/answers"] as { answered_at: string };
    const ahead = Date.parse(answered_at) - Date.now();
    expect(ahead).toBeGreaterThan(115_000);
    expect(ahead).toBeLessThan(125_000);
  });

  test("a connection that drops mid-question is noticed, and the screen catches up with what it missed", async ({ page, request }) => {
    await inLobby(page, request);
    await teacher(request, "fire", { index: 0, timer: 60 });
    await expect(page.locator(OPTION).first()).toBeVisible();
    const before = (await serverState(request)).calls.filter((c) => c === "GET /sessions/se-live-1/student-state").length;

    // The link goes, and while it is gone the first question closes and the second opens.
    await control(request, "block-streams", { on: true });
    await control(request, "drop-streams");
    await expect(page.getByText(mk.q("net.reconnecting"))).toBeVisible();
    await teacher(request, "close");
    await teacher(request, "reveal");
    await teacher(request, "fire", { index: 1, timer: 60 });
    await control(request, "block-streams", { on: false });

    // It retries by itself and the snapshot puts the screen where the lesson is.
    await expect(page.getByText(mk.q("net.reconnecting"))).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(mk.q("q.tfPrompt"))).toBeVisible();
    const after = (await serverState(request)).calls.filter((c) => c === "GET /sessions/se-live-1/student-state").length;
    expect(after).toBeGreaterThan(before);

    // And the stream works again: the next thing the teacher does reaches the phone.
    await page.locator(".q-tf__btn").nth(1).click();
    await teacher(request, "close");
    await expect(page.getByRole("heading", { name: mk.q("q.right") })).toBeVisible();
  });

  test("an answer given just as the link drops is kept, and tried again until the server has it", async ({ page, request, context }) => {
    await inLobby(page, request);
    await teacher(request, "fire", { index: 0, timer: 60 });
    await expect(page.locator(OPTION).first()).toBeVisible();

    let refused = 0;
    await context.route(`${API}/api/v1/sessions/se-live-1/answers`, (route) => (refused++ < 2 ? route.abort() : route.continue()));
    await page.locator(OPTION).nth(1).click();
    // The first attempt fails at once: the answer is on the phone, and the student is told so.
    await expect(page.getByText(mk.q("ans.saved"))).toBeVisible();
    await expect.poll(async () => (await serverState(request)).bodies["POST /sessions/se-live-1/answers"], { timeout: 15_000 }).toBeTruthy();
    await expect(page.getByText(mk.q("ans.sent"), { exact: true })).toBeVisible();
    await expect(page.getByText(mk.q("ans.saved"))).toBeHidden();
    await teacher(request, "close");
    await expect(page.getByRole("heading", { name: mk.q("q.right") })).toBeVisible();
    expect(refused).toBeGreaterThanOrEqual(3);
  });

  test("joining after the lobby is a late attendance, and the open question can still be answered", async ({ page, request }) => {
    await teacher(request, "fire", { index: 0, timer: 60 });
    await page.goto("/app/checkin/LIVE-7B");
    await expect(page.getByText(mk.q("q.late.note")).first()).toBeVisible();
    await expect(page.locator(OPTION).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("status").filter({ hasText: mk.q("q.late.note") })).toBeVisible();
    await page.locator(OPTION).nth(1).click();
    await expect(page.getByText(mk.q("q.locked"))).toBeVisible();
  });

  test("a reload mid-lesson, after the class code has rotated, picks the lesson up where it is", async ({ page, request }) => {
    await inLobby(page, request);
    await teacher(request, "fire", { index: 0, timer: 60 });
    await expect(page.locator(OPTION).first()).toBeVisible();

    await control(request, "expire-token");
    await page.reload();
    // The API now calls the code expired; the student is in, so the lesson is read back instead.
    await expect(page.getByRole("heading", { name: "2x = 10. What is x?" })).toBeVisible();
    await expect(page.locator("main[data-failure]")).toHaveCount(0);

    // A phone that never joined has no such luck.
    await page.evaluate(() => sessionStorage.removeItem("teacheraid-session"));
    await page.reload();
    await expect(page.locator('main[data-failure="expired"]')).toBeVisible();
  });

  test("signing in elsewhere, told on the student's channel, shows the full screen", async ({ page, request }) => {
    await inLobby(page, request);
    await teacher(request, "elsewhere");
    await expect(page.getByRole("alert").filter({ hasText: mk.t("elsewhere.title") })).toBeVisible();
  });

  test.describe("answers given with no signal (F-08, BR-NET-01)", () => {
    test("an answer given offline is saved, then counted with the time it was given when the question closed meanwhile", async ({ page, request, context }) => {
      await inLobby(page, request);
      await teacher(request, "fire", { index: 0, timer: 60 });
      await expect(page.locator(OPTION).first()).toBeVisible();

      await goOffline(context, request);
      await expect(page.getByText(mk.q("net.offline"))).toBeVisible();
      await page.locator(OPTION).nth(1).click();
      await expect(page.getByText(mk.q("ans.saved"))).toBeVisible();
      await expect(page.getByText(mk.q("net.saved.one"))).toHaveCount(0); // said once, under the card
      // Nothing reached the server.
      expect((await held(request)).answers.fq1).toBeUndefined();

      // The teacher closes the question while the phone is out of signal; the server settles it without the answer.
      await teacher(request, "close");
      await goOnline(context, request);

      // The saved answer arrives after the close, and counts: the verdict is a right answer.
      await expect(page.getByRole("heading", { name: mk.q("q.right") })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(".q-gain")).toContainText(/\+1\d/);

      const body = (await serverState(request)).bodies["POST /sessions/se-live-1/answers"] as { answered_at: string; idempotency_key: string };
      const server = await held(request);
      // The server counted it by the time the phone gave (server-clock terms), which is before the close, though it arrived after.
      expect(server.answers.fq1.answeredAt).toBe(Date.parse(body.answered_at));
      expect(server.answers.fq1.receivedAt).toBeGreaterThan(server.current!.closesAt);
      expect(server.answers.fq1.key).toBe(body.idempotency_key);
    });

    test("an answer whose own time is past the question's end and the grace is refused, and the student is told it came too late", async ({ page, request, context }) => {
      await inLobby(page, request);
      await teacher(request, "fire", { index: 0, timer: 60 });
      await expect(page.locator(OPTION).first()).toBeVisible();

      await goOffline(context, request);
      await expect(page.getByText(mk.q("net.offline"))).toBeVisible();
      // The server closes the question now; the phone, out of signal, does not know and takes an answer a little later.
      await teacher(request, "close");
      await page.waitForTimeout(3000);
      await page.locator(OPTION).nth(1).click();
      await expect(page.getByText(mk.q("ans.saved"))).toBeVisible();
      await goOnline(context, request);

      // In the quiz the screen says so itself: the verdict, with the reason.
      await expect(page.getByRole("heading", { name: mk.q("q.timeout") })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(mk.q("q.tooLate"), { exact: true })).toBeVisible();
      await expect(page.getByText(mk.q("ans.saved"))).toHaveCount(0);
      expect((await held(request)).answers.fq1).toBeUndefined();
    });

    test("a student who has left the quiz is told on a toast that the saved answer came too late", async ({ page, request, context }) => {
      await inLobby(page, request);
      await teacher(request, "fire", { index: 0, timer: 60 });
      await expect(page.locator(OPTION).first()).toBeVisible();

      // The app cannot reach the answers endpoint or hear the class, though the rest works.
      await context.route(`${API}/api/v1/sessions/se-live-1/answers`, (route) => route.abort());
      await control(request, "block-streams", { on: true });
      await control(request, "drop-streams");
      await teacher(request, "close");
      await page.waitForTimeout(3000);
      await page.locator(OPTION).nth(1).click();
      await expect(page.getByText(mk.q("ans.saved"))).toBeVisible();

      await page.getByRole("button", { name: mk.q("q.leave") }).click();
      await page.getByRole("dialog", { name: mk.q("q.leaveTitle") }).getByRole("button", { name: mk.q("q.leaveConfirm") }).click();
      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByText(mk.q("net.saved.one"))).toBeVisible();

      await context.unroute(`${API}/api/v1/sessions/se-live-1/answers`);
      await expect(page.locator(".toast")).toContainText(mk.q("ans.tooLate"), { timeout: 15_000 });
      await expect(page.getByText(mk.q("net.saved.one"))).toHaveCount(0);
      expect((await held(request)).answers.fq1).toBeUndefined();
    });

    test("an app opened again with no way to reach the server says the answer is saved, and sends it once it can", async ({ page, request, context }) => {
      await inLobby(page, request);
      await teacher(request, "fire", { index: 0, timer: 60 });
      await expect(page.locator(OPTION).first()).toBeVisible();

      await context.route(`${API}/**`, (route) => route.abort());
      await page.locator(OPTION).nth(1).click();
      await expect(page.getByText(mk.q("ans.saved"))).toBeVisible();
      expect((await held(request)).answers.fq1).toBeUndefined();

      // The app is closed and opened again, still with no way to the server: it cannot even say who is signed in,
      // but it knows whose answer it holds, and says it is safe.
      await page.reload();
      await expect(page.getByRole("alert").filter({ hasText: mk.t("err.network") })).toBeVisible();
      await expect(page.getByText(mk.q("net.saved.one"))).toBeVisible();
      expect((await held(request)).answers.fq1).toBeUndefined();

      // The way back opens: the server says who this is, the lesson opens on the question with the answer shown as
      // given, and the answer goes out with the time it was given.
      await context.unroute(`${API}/**`);
      await page.getByRole("button", { name: mk.t("state.retry") }).click();
      await expect.poll(async () => (await held(request)).answers.fq1?.response, { timeout: 25_000 }).toBe("1");
      await expect(page.getByText(mk.q("q.locked"))).toBeVisible({ timeout: 25_000 });
      await expect(page.getByText(mk.q("ans.sent"), { exact: true })).toBeVisible();
      await expect(page.getByText(mk.q("net.saved.one"))).toHaveCount(0);
    });

    test("a reload when only the join cannot be made opens the lesson the tab joined, with the saved answer on the question", async ({ page, request, context }) => {
      await inLobby(page, request);
      await teacher(request, "fire", { index: 0, timer: 60 });
      await expect(page.locator(OPTION).first()).toBeVisible();

      await context.route(`${API}/api/v1/sessions/se-live-1/answers`, (route) => route.abort());
      await page.locator(OPTION).nth(1).click();
      await expect(page.getByText(mk.q("ans.saved"))).toBeVisible();

      await context.route(`${API}/api/v1/sessions/join`, (route) => route.abort());
      await page.reload();
      // Not a failed join: the lesson is open, and the question is already answered, as saved.
      await expect(page.locator("main[data-failure]")).toHaveCount(0);
      await expect(page.getByText(mk.q("q.locked"))).toBeVisible();
      await expect(page.getByText(mk.q("ans.saved"))).toBeVisible();

      await context.unroute(`${API}/api/v1/sessions/se-live-1/answers`);
      await expect.poll(async () => (await held(request)).answers.fq1?.response, { timeout: 25_000 }).toBe("1");
      await expect(page.getByText(mk.q("ans.sent"), { exact: true })).toBeVisible({ timeout: 15_000 });
    });

    test("an answer saved before the app was closed is sent when it opens again, wherever the student opens it", async ({ page, request, context }) => {
      await inLobby(page, request);
      await teacher(request, "fire", { index: 0, timer: 60 });
      await expect(page.locator(OPTION).first()).toBeVisible();
      await context.route(`${API}/**`, (route) => route.abort());
      await page.locator(OPTION).nth(1).click();
      await expect(page.getByText(mk.q("ans.saved"))).toBeVisible();
      await context.unroute(`${API}/**`);
      // Closed, and opened again at Home, not in the lesson.
      await page.goto("/app");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Live");
      await expect.poll(async () => (await held(request)).answers.fq1?.response, { timeout: 15_000 }).toBe("1");
    });

    test("the fake API counts an answer by its own time, within the grace past the close, and refuses one beyond it", async ({ request }) => {
      const post = (key: string, answeredAt: number, response = "1") =>
        request.post(`${API}/api/v1/sessions/se-live-1/answers`, {
          data: { session_question_id: "fq1", response, answered_at: new Date(answeredAt).toISOString(), idempotency_key: key },
        });
      await teacher(request, "fire", { index: 0, timer: 60 });
      await teacher(request, "close");
      const closesAt = (await held(request)).current!.closesAt;

      // One second past the close is inside the grace: counted, and its time clamped to the close.
      const within = await post("k-within", closesAt + 1000);
      expect(within.status()).toBe(200);
      expect(await within.json()).toEqual({ accepted: true, duplicate: false });
      expect((await held(request)).answers.fq1.answeredAt).toBe(closesAt);
      // The same key again is stored once; a different key is the first answer standing.
      expect(await (await post("k-within", closesAt + 1000)).json()).toEqual({ accepted: true, duplicate: true });
      const other = await post("k-other", closesAt - 500, "2");
      expect(other.status()).toBe(409);
      expect(((await other.json()) as { error: { code: string } }).error.code).toBe("already_answered");
      expect((await held(request)).answers.fq1.response).toBe("1");

      // A new lesson: five seconds past the close is beyond the grace.
      await request.post(`${API}/__control/reset`);
      await teacher(request, "fire", { index: 0, timer: 60 });
      await teacher(request, "close");
      const beyond = await post("k-beyond", (await held(request)).current!.closesAt + 5000);
      expect(beyond.status()).toBe(409);
      expect(((await beyond.json()) as { error: { code: string } }).error.code).toBe("question_closed");
      expect((await held(request)).answers.fq1).toBeUndefined();

      // Skipped questions take nothing (EC-NET-03), and an ended session answers session_ended.
      await teacher(request, "fire", { index: 1, timer: 60 });
      await teacher(request, "skip");
      const skipped = await request.post(`${API}/api/v1/sessions/se-live-1/answers`, {
        data: { session_question_id: "fq2", response: "false", answered_at: new Date().toISOString(), idempotency_key: "k-skip" },
      });
      expect(((await skipped.json()) as { error: { code: string } }).error.code).toBe("question_closed");
      await teacher(request, "end");
      const ended = await post("k-ended", Date.now());
      expect(ended.status()).toBe(410);
      expect(((await ended.json()) as { error: { code: string } }).error.code).toBe("session_ended");
    });
  });

  test.describe("when the join fails", () => {
    const failure = (page: Page, kind: string) => page.locator(`main[data-failure="${kind}"]`);

    test("each reason has its own screen", async ({ page }) => {
      const seen: Record<string, string> = {};
      for (const [code, kind, title] of [
        ["EXPIRED-7B", "expired", mk.q("q.fail.expired.title")],
        ["OTHER-8A", "class", mk.q("q.fail.class.title")],
        ["ENDED-7B", "ended", mk.q("q.fail.ended.title")],
        ["NOPE-9", "unknown", mk.q("q.fail.unknown.title")],
      ]) {
        await page.goto(`/app/checkin/${code}`);
        await expect(failure(page, kind).getByRole("alert")).toContainText(title);
        seen[kind] = title;
      }
      expect(new Set(Object.values(seen)).size).toBe(4);
    });

    test("a lesson that has ended refuses the join, and goes home", async ({ page, request }) => {
      await teacher(request, "end");
      await page.goto("/app/checkin/LIVE-7B");
      await failure(page, "ended").getByRole("button", { name: mk.q("q.home") }).click();
      await expect(page).toHaveURL(/\/app$/);
    });

    test("no connection says so and tries again, and the join goes through", async ({ page, request, context }) => {
      await context.route(`${API}/api/v1/sessions/join`, (route) => route.abort());
      await page.goto("/app/checkin/LIVE-7B");
      await expect(failure(page, "offline").getByRole("alert")).toContainText(mk.q("q.fail.network.title"));
      await context.unroute(`${API}/api/v1/sessions/join`);
      await failure(page, "offline").getByRole("button", { name: mk.q("q.fail.retry") }).click();
      await expect(page.getByText(mk.q("q.waitTeacher"))).toBeVisible();
      expect((await serverState(request)).bodies["POST /sessions/join"]).toEqual({ token: "LIVE-7B" });
    });
  });
});

/**
 * The question kinds beyond multiple choice and true or false, against the fake API: a numeric answer, and the
 * opener's vote and reason on their own endpoints (spec 7.6, 7.7, F-08), with the test playing the teacher. The
 * fake's opener is a prediction ("which is the biggest fraction?", right answer the first option, a class of
 * 13) or a debate; its fourth question is "7 divided by 4", right within 0.01, no minus.
 */
test.describe("a live session with an opener and a number", () => {
  test.use({ allowConsoleErrors: [/Failed to load resource: (the server responded with a status of (403|404|409|410|422|503)|net::ERR_)/] });

  type Req = import("@playwright/test").APIRequestContext;
  const OPTION = ".q-opt, .q-tf__btn";
  const teacher = (request: Req, action: string, data: object = {}) => request.post(`${API}/__control/session/${action}`, { data });
  const stageOf = (page: Page) => page.locator("main.q");
  const VOTE = "POST /sessions/se-live-1/opener/vote";
  const REASON = "POST /sessions/se-live-1/opener/reason";
  const ANSWER = "POST /sessions/se-live-1/answers";

  async function inLobby(page: Page, request: Req) {
    await page.goto("/app/checkin/LIVE-7B");
    await expect(page.getByText(mk.q("q.waitTeacher"))).toBeVisible();
    await expect.poll(async () => (await (await request.get(`${API}/__control/state`)).json()).streams).toBeGreaterThan(0);
  }

  test("a vote and a reason each go to their endpoint with a key and the time they were given, and the result adds them up", async ({ page, request }) => {
    await inLobby(page, request);
    await teacher(request, "opener");
    await expect(stageOf(page)).toHaveAttribute("data-stage", "voting");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Which is the biggest fraction?");
    expect((await serverState(request)).calls.filter((c) => c === "GET /sessions/se-live-1/student-state").length).toBeGreaterThan(0);

    await page.locator(OPTION).nth(0).click();
    await expect(stageOf(page)).toHaveAttribute("data-stage", "reasoning");
    await expect.poll(async () => (await serverState(request)).bodies[VOTE]).toMatchObject({ session_question_id: "fo1", response: "0" });
    const vote = (await serverState(request)).bodies[VOTE] as { answered_at: string; idempotency_key: string };
    expect(Number.isNaN(Date.parse(vote.answered_at))).toBe(false);
    expect(vote.idempotency_key).toMatch(/\S{8,}/);

    // Mid-vote the class's counts are not shown (the stage after voting is where they live).
    await teacher(request, "progress", { answered: 5 });
    await expect(page.locator(".o-bars")).toHaveCount(0);

    await page.getByRole("textbox").fill("  Half is   more than a third.  ");
    await page.getByRole("textbox").press("Enter");
    await expect.poll(async () => (await serverState(request)).bodies[REASON]).toMatchObject({ session_question_id: "fo1", text: "Half is more than a third." });
    // The reason goes after the vote, and under its own key.
    const { calls } = await serverState(request);
    expect(calls.indexOf(VOTE)).toBeLessThan(calls.indexOf(REASON));
    await expect(stageOf(page)).toHaveAttribute("data-stage", "opener_wait");

    // Voting closes: the class's votes, and the student's own among them.
    await teacher(request, "opener-voting-end");
    const bars = page.locator(".o-bar");
    await expect(bars).toHaveCount(3);
    await expect(bars.nth(0).locator(".o-bar__n")).toHaveText("10");
    await expect(bars.nth(0).locator(".o-tag").filter({ hasText: mk.q("o.yourVote") })).toBeVisible();

    await teacher(request, "opener-close");
    await expect(stageOf(page)).toHaveAttribute("data-stage", "opener_result");
    await expect(page.getByRole("heading", { name: mk.q("q.right") })).toBeVisible();
    await expect(page.locator(".o-chips")).toContainText(mk.q("o.pts.vote", { n: 10 }));
    await expect(page.locator(".o-chips")).toContainText(mk.q("o.pts.reason", { n: 8 }));
    await expect(page.locator(".q-total .q-big")).toHaveText("18");
    // The right answer and the class's reasons wait for the teacher's reveal.
    await expect(page.locator(".o-tag--right")).toHaveCount(0);
    await expect(page.locator(".o-reason")).toHaveCount(0);
    await teacher(request, "opener-reveal");
    await expect(page.locator('.o-bar[data-right="true"]')).toContainText("1/2");
    await expect(page.locator(".o-tag--right")).toContainText(mk.q("q.correctAnswer"));
    await expect(page.locator(".o-reason")).toHaveCount(2);
    await expect(page.locator(".o-reason").first()).toContainText("Half is more than a third.");

    // The lesson goes on: the first question opens and the opener is gone.
    await teacher(request, "fire", { index: 0, timer: 60 });
    await expect(stageOf(page)).toHaveAttribute("data-stage", "answering");
    await expect(page.locator(".o-bars")).toHaveCount(0);
  });

  test("a wrong vote with a reason is worth the reason's points, and a vote with no reason is worth the vote's", async ({ page, request }) => {
    await inLobby(page, request);
    await teacher(request, "opener");
    await page.locator(OPTION).nth(2).click();
    await page.getByRole("textbox").fill("Four is the biggest number.");
    await page.getByRole("button", { name: mk.q("o.send") }).click();
    await expect.poll(async () => (await serverState(request)).bodies[REASON]).toBeTruthy();
    await teacher(request, "opener-close");
    await expect(page.getByRole("heading", { name: mk.q("q.wrong") })).toBeVisible();
    await expect(page.getByText(mk.q("o.voteWrongReason"))).toBeVisible();
    await expect(page.locator(".q-total .q-big")).toHaveText("8");
  });

  test("an empty reason is never sent, and skipping sends nothing", async ({ page, request }) => {
    await inLobby(page, request);
    await teacher(request, "opener");
    await page.locator(OPTION).nth(0).click();
    await expect(stageOf(page)).toHaveAttribute("data-stage", "reasoning");
    await page.getByRole("button", { name: mk.q("o.send") }).click();
    await expect(page.locator(".n-err")).toContainText(mk.q("o.err.empty"));
    await page.getByRole("button", { name: mk.q("o.skip") }).click();
    await expect(stageOf(page)).toHaveAttribute("data-stage", "opener_wait");
    await teacher(request, "opener-close");
    await expect(page.locator(".q-total .q-big")).toHaveText("10");
    expect((await serverState(request)).calls).not.toContain(REASON);
  });

  test("a debate has no right side: the split, and only the reason's points", async ({ page, request }) => {
    await inLobby(page, request);
    await teacher(request, "opener", { kind: "debate" });
    await expect(page.locator(".q-tf__btn")).toHaveCount(2);
    await page.getByRole("button", { name: mk.q("o.disagree") }).click();
    await expect.poll(async () => (await serverState(request)).bodies[VOTE]).toMatchObject({ session_question_id: "fo2", response: "disagree" });
    await page.getByRole("textbox").fill("Without it nobody would practise.");
    await page.getByRole("textbox").press("Enter");
    await teacher(request, "opener-voting-end");
    await expect(page.locator(".o-bar")).toHaveCount(2);
    await expect(page.locator(".o-bar").nth(1).locator(".o-bar__n")).toHaveText("9");
    await teacher(request, "opener-close");
    await teacher(request, "opener-reveal");
    await expect(page.getByRole("heading", { name: mk.q("o.side.disagree") })).toBeVisible();
    await expect(page.getByText(mk.q("o.noRight"))).toBeVisible();
    await expect(page.locator(".o-tag--right")).toHaveCount(0);
    await expect(page.locator(".q-total .q-big")).toHaveText("8");
  });

  test("a vote and a reason given with no signal are kept, in order, and counted when it returns", async ({ page, request, context }) => {
    await inLobby(page, request);
    await teacher(request, "opener");
    await expect(stageOf(page)).toHaveAttribute("data-stage", "voting");

    let refused = 0;
    await context.route(`${API}/api/v1/sessions/se-live-1/opener/*`, (route) => (refused++ < 3 ? route.abort() : route.continue()));
    await page.locator(OPTION).nth(0).click();
    // The vote is on the phone, not lost: the reason can be written on top of it.
    await expect(page.getByText(mk.q("ans.saved"))).toBeVisible();
    await page.getByRole("textbox").fill("Half is more than a third.");
    await page.getByRole("textbox").press("Enter");

    // Both arrive once the road is open, the vote first.
    await expect.poll(async () => (await serverState(request)).bodies[REASON], { timeout: 20_000 }).toBeTruthy();
    const { calls } = await serverState(request);
    expect(calls.indexOf(VOTE)).toBeGreaterThan(-1);
    expect(calls.indexOf(VOTE)).toBeLessThan(calls.indexOf(REASON));
    expect(refused).toBeGreaterThanOrEqual(3);
    await expect(page.getByText(mk.q("ans.saved"))).toHaveCount(0);

    await teacher(request, "opener-close");
    await expect(page.locator(".q-total .q-big")).toHaveText("18");
  });

  test("a reason saved while the opener closed is counted by the time it was given, and corrects the points", async ({ page, request, context }) => {
    await inLobby(page, request);
    await teacher(request, "opener", { vote: 30, reason: 60 });
    await page.locator(OPTION).nth(0).click();
    await expect.poll(async () => (await serverState(request)).bodies[VOTE]).toBeTruthy();

    // The reason cannot leave the phone; the opener closes meanwhile, and the student's result is 10 without it.
    await context.route(`${API}/api/v1/sessions/se-live-1/opener/reason`, (route) => route.abort());
    await page.getByRole("textbox").fill("Half is more than a third.");
    await page.getByRole("textbox").press("Enter");
    await expect(page.getByText(mk.q("ans.saved"))).toBeVisible();
    await teacher(request, "opener-close");
    await expect(page.getByText(mk.q("q.checking")).or(page.locator(".o-own"))).toBeVisible();

    await context.unroute(`${API}/api/v1/sessions/se-live-1/opener/reason`);
    // It arrives after the close and counts: the points are corrected to 18.
    await expect(stageOf(page)).toHaveAttribute("data-stage", "opener_result", { timeout: 20_000 });
    await expect(page.locator(".q-total .q-big")).toHaveText("18", { timeout: 20_000 });
    await expect(page.locator(".o-chips")).toContainText(mk.q("o.pts.reason", { n: 8 }));
  });

  test("a reload after the vote and the reason picks up where the student was", async ({ page, request }) => {
    await inLobby(page, request);
    await teacher(request, "opener");
    await page.locator(OPTION).nth(1).click();
    await page.getByRole("textbox").fill("Because.");
    await page.getByRole("textbox").press("Enter");
    await expect.poll(async () => (await serverState(request)).bodies[REASON]).toBeTruthy();

    await page.reload();
    await expect(stageOf(page)).toHaveAttribute("data-stage", "opener_wait");
    await expect(page.locator(".o-vote")).toContainText("1/3");
    await expect(page.locator(".o-own")).toContainText("Because.");
    // And the class's votes, once voting has closed, come with the snapshot.
    await teacher(request, "opener-voting-end");
    await expect(page.locator(".o-bar")).toHaveCount(3);
    await page.reload();
    await expect(page.locator(".o-bar")).toHaveCount(3);
  });

  test("a number is sent as plain text with a point, whichever separator was typed, and counted within the tolerance", async ({ page, request }) => {
    await inLobby(page, request);
    await teacher(request, "fire", { index: 3, timer: 60 });
    await expect(stageOf(page)).toHaveAttribute("data-stage", "answering");
    await expect(page.getByLabel(mk.q("n.label"))).toHaveAttribute("inputmode", "decimal");
    await expect(page.getByRole("button", { name: mk.q("n.minus") })).toHaveCount(0);
    await expect(page.locator(".n-unit")).toHaveCount(0);

    await page.getByLabel(mk.q("n.label")).fill("-1,75");
    await page.getByLabel(mk.q("n.label")).press("Enter");
    await expect(page.locator(".n-err")).toContainText(mk.q("n.err.negative"));
    expect((await serverState(request)).calls).not.toContain(ANSWER);

    await page.getByLabel(mk.q("n.label")).fill("1,76");
    await page.getByLabel(mk.q("n.label")).press("Enter");
    await expect.poll(async () => ((await serverState(request)).bodies[ANSWER] as Record<string, string>)?.response).toBe("1.76");
    await expect(page.locator(".q-locked")).toContainText("1,76");
    await teacher(request, "close");
    // 1.76 is within 0.01 of 1.75, so it is right, and the student is told the exact value.
    await expect(page.getByRole("heading", { name: mk.q("q.right") })).toBeVisible();
    await teacher(request, "reveal");
    await expect(page.getByText(mk.q("n.exactValue", { text: "1,75" }))).toBeVisible();
  });

  test("a wrong number shows the correct value and the student's own", async ({ page, request }) => {
    await inLobby(page, request);
    await teacher(request, "fire", { index: 3, timer: 60 });
    await page.getByLabel(mk.q("n.label")).fill("2");
    await page.getByLabel(mk.q("n.label")).press("Enter");
    await expect.poll(async () => ((await serverState(request)).bodies[ANSWER] as Record<string, string>)?.response).toBe("2");
    await teacher(request, "close");
    await teacher(request, "reveal");
    await expect(page.getByRole("heading", { name: mk.q("q.wrong") })).toBeVisible();
    await expect(page.locator(".q-correct")).toContainText("1,75");
    await expect(page.locator(".q-correct")).toContainText(mk.q("n.tolerance", { tol: "0,01" }));
    await expect(page.getByText(mk.q("n.yours", { text: "2" }))).toBeVisible();
  });
});

/**
 * A question to the teacher (F-09) and the web focus flag (7.10), against the fake API: `POST /sessions/{id}/anon-questions`
 * and `POST /sessions/{id}/focus-events`. The fake keeps what its teacher's console would have (state.session.asks, .focus).
 */
test.describe("a live session with questions to the teacher and the focus flag", () => {
  test.use({ allowConsoleErrors: [/Failed to load resource: (the server responded with a status of (403|404|409|410|422|503)|net::ERR_)/] });

  type Req = import("@playwright/test").APIRequestContext;
  type Context = import("@playwright/test").BrowserContext;
  type Held = {
    asks: { key: string; text: string; askedAt: number; sender: string }[];
    askLimit: number;
    focus: { type: string; at: number; sessionQuestionId: string; flagged: boolean }[];
    focusBatches: { type: string; at: string; session_question_id: string }[][];
  };
  const teacher = (request: Req, action: string, data: object = {}) => request.post(`${API}/__control/session/${action}`, { data });
  const held = async (request: Req) => ((await (await request.get(`${API}/__control/state`)).json()) as { session: Held }).session;
  const ASK = "POST /sessions/se-live-1/anon-questions";
  const FOCUS = "POST /sessions/se-live-1/focus-events";
  const OPTION = ".q-opt, .q-tf__btn";

  async function inLobby(page: Page, request: Req) {
    await page.goto("/app/checkin/LIVE-7B");
    await expect(page.getByText(mk.q("q.waitTeacher"))).toBeVisible();
    await expect.poll(async () => (await (await request.get(`${API}/__control/state`)).json()).streams).toBeGreaterThan(0);
  }

  const entry = (page: Page) => page.getByRole("button", { name: mk.q("ask.entry") });
  const sheet = (page: Page) => page.getByRole("dialog", { name: mk.q("ask.title") });
  const box = (page: Page) => sheet(page).getByRole("textbox", { name: mk.q("ask.label") });
  const setHidden = (page: Page, hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, "visibilityState", { value: h ? "hidden" : "visible", configurable: true });
      Object.defineProperty(document, "hidden", { value: h, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  const offline = async (context: Context, request: Req) => {
    await request.post(`${API}/__control/block-streams`, { data: { on: true } });
    await context.setOffline(true);
    await request.post(`${API}/__control/drop-streams`);
  };
  const online = async (context: Context, request: Req) => {
    await context.setOffline(false);
    await request.post(`${API}/__control/block-streams`, { data: { on: false } });
  };

  test.describe("a question to the teacher", () => {
    test("goes to its endpoint with the text, the time it was written and a key, is stored with the sender, and the student's own endpoints never give it back", async ({ page, request }) => {
      await inLobby(page, request);
      // The snapshot says what the limit is, and the sheet shows what is left.
      await entry(page).click();
      await expect(sheet(page).getByText(mk.q("ask.left.many", { n: 3 }))).toBeVisible();
      await box(page).fill("  Зошто е x = 5?  ");
      await box(page).press("Enter");
      await expect(sheet(page).getByRole("heading", { name: mk.q("ask.sent") })).toBeVisible();

      const { bodies } = await serverState(request);
      const body = bodies[ASK] as { text: string; asked_at: string; idempotency_key: string };
      expect(body.text).toBe("Зошто е x = 5?");
      expect(Number.isNaN(Date.parse(body.asked_at))).toBe(false);
      expect(body.idempotency_key).toMatch(/\S{8,}/);
      expect(Object.keys(body).sort()).toEqual(["asked_at", "idempotency_key", "text"]);
      const server = await held(request);
      expect(server.asks).toMatchObject([{ text: "Зошто е x = 5?", sender: "st-1" }]);

      // AC-ANON-01: the sender is the teacher's to see, and nothing a student can read has the question or its sender.
      const snapshot = await (await request.get(`${API}/api/v1/sessions/se-live-1/student-state`)).text();
      expect(snapshot).toContain('"anon_questions":{"used":1,"limit":3}');
      expect(snapshot).not.toContain("Зошто");
      expect(snapshot).not.toContain("sender");

      // Two left, as the server counts them.
      await sheet(page).getByRole("button", { name: mk.q("ask.another") }).click();
      await expect(sheet(page).getByText(mk.q("ask.left.many", { n: 2 }))).toBeVisible();
    });

    test("the server's limit is shown as what is left, and a student who has used it is told so", async ({ page, request }) => {
      await teacher(request, "anon-limit", { limit: 1 });
      await inLobby(page, request);
      await entry(page).click();
      await expect(sheet(page).getByText(mk.q("ask.left.one"))).toBeVisible();
      await box(page).fill("Единствено");
      await box(page).press("Enter");
      await expect(sheet(page).getByRole("heading", { name: mk.q("ask.sent") })).toBeVisible();
      await expect(sheet(page).getByRole("button", { name: mk.q("ask.another") })).toHaveCount(0);
      await sheet(page).getByRole("button", { name: mk.q("ask.done") }).click();
      await expect(sheet(page)).toHaveCount(0);
      await entry(page).click();
      await expect(sheet(page).getByRole("heading", { name: mk.q("ask.limit.title") })).toBeVisible();
      expect((await held(request)).asks).toHaveLength(1);
    });

    test("one written with no signal is kept, and sent with its first key when the signal returns", async ({ page, request, context }) => {
      await inLobby(page, request);
      await entry(page).click();
      await offline(context, request);
      await expect(page.getByText(mk.q("net.offline"))).toBeVisible();
      await box(page).fill("Без интернет");
      await box(page).press("Enter");
      await expect(sheet(page).getByRole("heading", { name: mk.q("ans.saved") })).toBeVisible();
      expect((await held(request)).asks).toHaveLength(0);

      await online(context, request);
      await expect(sheet(page).getByRole("heading", { name: mk.q("ask.sent") })).toBeVisible({ timeout: 20_000 });
      const server = await held(request);
      expect(server.asks).toMatchObject([{ text: "Без интернет" }]);
      // However many tries it took, it is one question.
      expect(server.asks).toHaveLength(1);
    });

    test("refused for the limit when the server has less room than the phone thought: the sheet says so and the count shows none left", async ({ page, request, context }) => {
      await inLobby(page, request);
      await entry(page).click();
      await offline(context, request);
      await box(page).fill("Прво");
      await box(page).press("Enter");
      await sheet(page).getByRole("button", { name: mk.q("ask.another") }).click();
      await box(page).fill("Второ");
      await box(page).press("Enter");
      await expect(sheet(page).getByRole("heading", { name: mk.q("ans.saved") })).toBeVisible();

      // Meanwhile another device used the room the phone thought it had.
      await teacher(request, "anon-limit", { limit: 1 });
      await online(context, request);
      await expect(sheet(page).getByRole("heading", { name: mk.q("ask.limit.title") })).toBeVisible({ timeout: 20_000 });
      const server = await held(request);
      expect(server.asks.map((a) => a.text)).toEqual(["Прво"]);
    });

    test("one that reaches the server after the lesson ended is refused, and the student is told", async ({ page, request, context }) => {
      await inLobby(page, request);
      await entry(page).click();
      await offline(context, request);
      await box(page).fill("Предоцна");
      await box(page).press("Enter");
      await expect(sheet(page).getByRole("heading", { name: mk.q("ans.saved") })).toBeVisible();
      await teacher(request, "end");
      await online(context, request);
      await expect(sheet(page).getByRole("heading", { name: mk.q("ask.ended.title") })).toBeVisible({ timeout: 20_000 });
      expect((await held(request)).asks).toHaveLength(0);
    });

    test("is not offered while a question is open, and a sheet that is open when one starts steps aside", async ({ page, request }) => {
      await inLobby(page, request);
      await entry(page).click();
      await box(page).fill("Не го испрати");
      await teacher(request, "fire", { index: 0, timer: 60 });
      await expect(page.locator(OPTION).first()).toBeVisible();
      await expect(sheet(page)).toHaveCount(0);
      await expect(entry(page)).toHaveCount(0);
      expect((await held(request)).asks).toHaveLength(0);
    });
  });

  test.describe("the focus flag", () => {
    // Real time: the threshold for a departure is 3 s.
    test.setTimeout(90_000);

    test("a departure during a question is sent as lost and back with server-clock times and the question's id, and the student can still answer", async ({ page, request }) => {
      await inLobby(page, request);
      await expect(page.getByRole("note")).toContainText(mk.q("fair.note"));
      await teacher(request, "fire", { index: 0, timer: 60 });
      await expect(page.locator(OPTION).first()).toBeVisible();

      await setHidden(page, true);
      // Confirmed while still away, so the console shows it at once: lost goes before the student is back.
      await expect.poll(async () => (await held(request)).focus.map((f) => f.type), { timeout: 15_000 }).toEqual(["lost"]);
      await setHidden(page, false);
      await expect.poll(async () => (await held(request)).focus.map((f) => f.type), { timeout: 15_000 }).toEqual(["lost", "back"]);

      const server = await held(request);
      expect(server.focus[0]).toMatchObject({ type: "lost", sessionQuestionId: "fq1", flagged: true });
      expect(server.focus[1]).toMatchObject({ type: "back", sessionQuestionId: "fq1", flagged: false });
      expect(server.focus[1].at - server.focus[0].at).toBeGreaterThanOrEqual(3000);
      // Each item is a type, a time and the question, nothing more.
      for (const batch of server.focusBatches) for (const e of batch) expect(Object.keys(e).sort()).toEqual(["at", "session_question_id", "type"]);
      expect(await serverState(request).then((s) => s.calls)).toContain(FOCUS);

      // Nobody was blocked.
      await page.locator(OPTION).nth(1).click();
      await expect(page.getByText(mk.q("q.locked"))).toBeVisible();
    });

    test("a flicker is nothing, and neither is leaving between questions", async ({ page, request }) => {
      await inLobby(page, request);
      await teacher(request, "fire", { index: 0, timer: 60 });
      await expect(page.locator(OPTION).first()).toBeVisible();
      await setHidden(page, true);
      await page.waitForTimeout(1000);
      await setHidden(page, false);
      await page.waitForTimeout(3500);
      expect((await held(request)).focus).toEqual([]);

      // The question closes: the time between questions is the student's own.
      await teacher(request, "close");
      await expect(page.getByRole("heading", { name: mk.q("q.timeout") })).toBeVisible();
      await setHidden(page, true);
      await page.waitForTimeout(4000);
      await setHidden(page, false);
      await page.waitForTimeout(500);
      expect((await held(request)).focus).toEqual([]);
      expect((await serverState(request)).calls).not.toContain(FOCUS);
    });

    test("leaving with no signal is kept with its own times, and sent together when the signal returns (EC-FOC-04)", async ({ page, request, context }) => {
      await inLobby(page, request);
      await teacher(request, "fire", { index: 0, timer: 120 });
      await expect(page.locator(OPTION).first()).toBeVisible();

      await offline(context, request);
      await setHidden(page, true);
      await page.waitForTimeout(4000);
      await setHidden(page, false);
      await page.waitForTimeout(500);
      expect((await held(request)).focus).toEqual([]);

      await online(context, request);
      await expect.poll(async () => (await held(request)).focus.map((f) => f.type), { timeout: 20_000 }).toEqual(["lost", "back"]);
      const server = await held(request);
      // The times are those of the departure, not of the delivery; and what had piled up went in one request.
      expect(server.focus[1].at - server.focus[0].at).toBeGreaterThanOrEqual(3500);
      expect(Date.now() - server.focus[0].at).toBeGreaterThanOrEqual(3500);
      expect(server.focusBatches.at(-1)!.map((e) => e.type)).toEqual(["lost", "back"]);
    });

    test("a student who has not seen the line has not been told, so nothing is recorded until they have", async ({ page, request }) => {
      // Joined in the middle of a question: no lobby, so no line yet.
      await teacher(request, "state", { state: "teaching" });
      await teacher(request, "fire", { index: 0, timer: 120 });
      await page.goto("/app/checkin/LIVE-7B");
      await expect(page.locator(OPTION).first()).toBeVisible();
      await expect(page.getByRole("note")).toHaveCount(0);
      await setHidden(page, true);
      await page.waitForTimeout(4000);
      await setHidden(page, false);
      await page.waitForTimeout(500);
      expect((await held(request)).focus).toEqual([]);
    });
  });
});

/**
 * Practice sets and the results history against the API (F-12, US-S07, US-S08). The fake server holds the right answers and says right or wrong
 * for each answer as it comes; the first set is three questions on the maths lesson: 2x = 6 (the second choice), a square's sides (true) and
 * 9 divided by 4 (2.25). A right answer is 5 points.
 */
test.describe("practice and the history of results", () => {
  type Req = import("@playwright/test").APIRequestContext;
  const SET = "/app/practice/ps-1";
  const progress = (n: number) => mk.t("pr.progress", { n, total: 3 });
  const bodies = async (request: Req) => (await serverState(request)) as unknown as { practiceBodies: { id: string; body: { answers: { question_id: string; response: string }[] } }[]; queries: Record<string, string> };
  const check = (page: Page) => page.getByRole("button", { name: mk.t("pr.check") });

  test("Home offers the set the API lists, and a subject draws its lessons and topics from the API", async ({ page, request }) => {
    await page.goto("/app");
    await expect(page.getByRole("link", { name: new RegExp(`^${mk.t("pr.title")}`) })).toContainText(mk.t("pr.home.new1", { subject: mk.t("subj.math") }));

    await page.goto("/app/subject/c-math");
    // The lessons of this course only, asked of the API with the course; the other course's lesson is not here.
    const lessons = page.getByRole("heading", { name: mk.t("res.recent") }).locator("xpath=ancestor::section[1]");
    await expect(lessons.getByRole("listitem")).toHaveCount(2);
    await expect(lessons).toContainText("Linear equations");
    await expect(lessons).toContainText("Fractions");
    await expect(lessons).not.toContainText("Motion");
    expect((await bodies(request)).queries["GET /me/results"]).toBe("?course=c-math");

    // A topic with three lessons is a line, with its numbers behind it.
    const equations = page.getByRole("figure").filter({ hasText: "Linear equations" });
    await expect(equations.getByText(mk.t("topic.range", { from: 40, to: 80, n: 3 }))).toBeVisible();
    await expect(equations.getByRole("table").getByRole("row")).toHaveCount(4);
    await expect(page.getByRole("figure").filter({ hasText: "Motion" })).toHaveCount(0);
    // The set is in its subject, new.
    await expect(page.getByRole("link", { name: new RegExp(mk.t("pr.state.new")) })).toBeVisible();

    await page.goto("/app/subject/c-phys");
    const motion = page.getByRole("figure").filter({ hasText: "Motion" });
    await expect(motion.getByText(mk.t("topic.one", { right: 3, total: 4 }))).toBeVisible();
    await expect(motion.locator(".tc__chart")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: mk.t("pr.title") })).toHaveCount(0);
  });

  test("a set is answered one question at a time, each verdict from the server, and the progress is the server's", async ({ page, request }) => {
    await page.goto(SET);
    await expect(page.getByText(progress(1))).toBeVisible();
    // Reading the set tells nothing of the right answers.
    await page.locator(".q-opt").nth(1).click();
    await check(page).click();
    const verdict = page.getByRole("status").filter({ hasText: mk.t("pr.right") });
    await expect(verdict).toContainText(mk.t("pr.gain", { n: 5 }));
    await expect(verdict).toContainText("Divide both sides by 2");
    expect((await bodies(request)).practiceBodies).toEqual([{ id: "ps-1", body: { answers: [{ question_id: "pq-1", response: "1" }] } }]);

    // Leave and come back: the API has the first answer, so the set opens on the second question.
    await page.reload();
    await expect(page.getByText(progress(2))).toBeVisible();
    await page.locator(".q-tf__btn").nth(1).click();
    await check(page).click();
    const wrong = page.getByRole("status").filter({ hasText: mk.t("pr.wrong") });
    await expect(wrong).toContainText(mk.t("pr.correctIs", { a: mk.q("q.true") }));
    await expect(page.locator(".q-tf__btn").nth(0)).toHaveAttribute("data-state", "right");
    await expect(page.locator(".q-tf__btn").nth(1)).toHaveAttribute("data-state", "miss");
    await page.getByRole("button", { name: mk.t("pr.next") }).click();

    // A number typed with a comma goes as plain text with a point.
    await expect(page.getByText(progress(3))).toBeVisible();
    await page.locator(".n-input").fill("2,25");
    await page.locator(".n-input").press("Enter");
    await expect(page.getByRole("status").filter({ hasText: mk.t("pr.right") })).toBeVisible();
    await page.getByRole("button", { name: mk.t("pr.result") }).click();

    await expect(page.getByRole("heading", { name: mk.t("pr.done.score", { score: 2, total: 3 }) })).toBeVisible();
    await expect(page.getByText(mk.t("pr.gain", { n: 10 }))).toBeVisible();
    const sent = (await bodies(request)).practiceBodies.map((b) => b.body.answers[0]);
    expect(sent).toEqual([
      { question_id: "pq-1", response: "1" },
      { question_id: "pq-2", response: "false" },
      { question_id: "pq-3", response: "2.25" },
    ]);

    // Done is done: Home no longer offers it, and the list says how it went.
    await page.getByRole("button", { name: mk.t("close"), exact: true }).click();
    await page.goto("/app");
    await expect(page.getByRole("link", { name: new RegExp(`^${mk.t("pr.title")}`) })).toHaveCount(0);
    await page.goto("/app/practice");
    await expect(page.getByRole("link", { name: new RegExp(mk.t("pr.state.done", { score: 2, n: 3 })) })).toBeVisible();
  });

  test("a set finished somewhere else opens on its result", async ({ page, request }) => {
    const answers = [
      { question_id: "pq-1", response: "1" },
      { question_id: "pq-2", response: "true" },
      { question_id: "pq-3", response: "2.25" },
    ];
    const res = await request.post(`${API}/api/v1/practice-sets/ps-1/answers`, { data: { answers } });
    expect(await res.json()).toMatchObject({ score: 3, total: 3, points: 15, completed: true });
    await page.goto(SET);
    await expect(page.getByRole("heading", { name: mk.t("pr.done.score", { score: 3, total: 3 }) })).toBeVisible();
    await expect(page.getByText(mk.t("pr.done.all"))).toBeVisible();
  });

  test.describe("with no signal", () => {
    // The browser logs the requests that a dead signal refuses.
    test.use({ allowConsoleErrors: [/Failed to load resource: net::ERR_/] });

    test("an answer given with no signal waits on the phone and is sent, with its verdict shown, when the signal is back", async ({ page, request, context }) => {
      await page.goto(SET);
      await expect(page.getByText(progress(1))).toBeVisible();
      await context.setOffline(true);
      await expect(page.getByText(mk.q("net.offline"))).toBeVisible();

      await page.locator(".q-opt").nth(1).click();
      await check(page).click();
      // Saved and said so, nothing called right or wrong, and the way on is offered.
      await expect(page.getByText(mk.t("pr.saved"))).toBeVisible();
      await expect(page.getByText(mk.t("pr.wrong"))).toHaveCount(0);
      await expect(page.locator(".q-opt").nth(1)).toBeDisabled();
      expect((await bodies(request)).practiceBodies).toEqual([]);

      await context.setOffline(false);
      await expect(page.getByRole("status").filter({ hasText: mk.t("pr.right") })).toBeVisible({ timeout: 15_000 });
      expect((await bodies(request)).practiceBodies).toHaveLength(1);
      await expect(page.locator(".q-opt").nth(1)).toHaveAttribute("data-state", "right");
    });
  });

  test("a set the teacher sends arrives as an alert, and opens", async ({ page, request }) => {
    await request.post(`${API}/__control/practice/send`);
    await page.goto("/app/notifications");
    await page.getByRole("link", { name: new RegExp(mk.t("notif.practice_set_sent.title", { subject: mk.t("subj.math") })) }).click();
    await page.getByRole("link", { name: mk.t("notif.open.practice") }).click();
    await expect(page).toHaveURL(/\/app\/practice\/ps-2$/);
    await expect(page.getByText(progress(1))).toBeVisible();
    await expect(page.getByRole("heading", { name: "2x = 10. What is x?" })).toBeVisible();
    // Two sets now, the newest first, and opening it read its alert.
    await page.goto("/app/practice");
    await expect(page.getByRole("list").first().getByRole("listitem")).toHaveCount(2);
    await page.goto("/app/notifications");
    await expect(page.locator(".item--unread")).toHaveCount(2);
  });
});

/**
 * Notifications (FR-NOT-01..03, US-S10) against the API: the feed read a page at a time, a new alert arriving on the student's own channel
 * wherever the app is open, and web push. A headless browser has no push service, so `PushManager` is played here (what it is asked for is
 * recorded and the server's own VAPID key is checked); the phone itself, an installed iPhone's push above all, is for a real device.
 */
test.describe("alerts and push", () => {
  const control = (request: import("@playwright/test").APIRequestContext, what: string, data: object = {}) =>
    request.post(`${API}/__control/${what}`, { data });
  const calls = async (request: import("@playwright/test").APIRequestContext) => (await serverState(request)).calls;
  const tabs = (page: Page) => page.getByRole("navigation", { name: mk.t("nav.main") });
  const unread = (n: number | string) => mk.t("notif.unreadCount", { n });

  test.describe("the feed", () => {
    test("listens to the student's own channel, and only that, wherever the app is", async ({ page, request }) => {
      await page.goto("/app");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Live");
      await expect.poll(async () => ((await (await request.get(`${API}/__control/state`)).json()) as { streams: number }).streams).toBe(1);
    });

    test("a new alert ticks the badge on a screen that is not Alerts", async ({ page, request }) => {
      await page.goto("/app");
      await expect(tabs(page)).toContainText(unread(2));
      await control(request, "notify", { title: "Quiz moved", body: "To Friday." });
      await expect(tabs(page)).toContainText(unread(3));
      await page.getByRole("link", { name: mk.t("nav.alerts"), exact: false }).first().click();
      await expect(page.getByRole("link", { name: /Quiz moved/ })).toBeVisible();
    });

    test("a new alert slides into the open list, on top, and is said to a screen reader", async ({ page, request }) => {
      await page.goto("/app/notifications");
      await expect(page.locator(".item--unread")).toHaveCount(2);
      await expect(page.locator(".item--fresh")).toHaveCount(0);
      await control(request, "notify", { title: "Quiz moved" });
      const first = page.getByRole("list").first().getByRole("listitem").first();
      await expect(first).toContainText("Quiz moved");
      await expect(first.locator("a")).toHaveClass(/item--fresh/);
      await expect(page.locator(".item--unread")).toHaveCount(3);
      await expect(page.getByRole("status").filter({ hasText: mk.t("notif.arrived", { n: 3 }) })).toBeAttached();
      // Older ones do not slide in again: the second alert is one more at the top.
      await control(request, "notify", { title: "Another" });
      await expect(page.locator(".item--fresh")).toHaveCount(2);
    });

    test.describe("a link that is cut", () => {
      test.use({ allowConsoleErrors: [/https:\/\/vercel\.live\/|ERR_INCOMPLETE_CHUNKED_ENCODING/] });
    test("after the link drops and comes back, what was missed is read", async ({ page, request }) => {
      await page.goto("/app");
      await expect(tabs(page)).toContainText(unread(2));
      await control(request, "block-streams", { on: true });
      await control(request, "drop-streams");
      await control(request, "notify", { title: "While away" });
      await control(request, "block-streams", { on: false });
      await expect(tabs(page)).toContainText(unread(3), { timeout: 20_000 });
    });
    });

    test("signed in elsewhere is the full screen at once, with no request to be refused first", async ({ page, request }) => {
      await page.goto("/app");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Live");
      await control(request, "session/elsewhere");
      await expect(page.getByRole("alert").filter({ hasText: mk.t("elsewhere.title") })).toBeVisible();
    });

    test("marking one alert read shows at once and is told to the API", async ({ page, request }) => {
      await page.goto("/app/notifications");
      await expect(page.locator(".item--unread")).toHaveCount(2);
      await page.getByRole("link", { name: new RegExp(mk.t("notif.result_ready.title", { subject: mk.t("subj.math") })) }).click();
      await expect(page).toHaveURL(/\/app\/notifications\/n-1$/);
      await page.getByRole("link", { name: mk.t("nav.alerts") }).click();
      await expect(page.locator(".item--unread")).toHaveCount(1);
      expect((await serverState(request)).bodies["POST /me/notifications/read"]).toEqual({ ids: ["n-1"] });
    });
  });

  test.describe("paging", () => {
    test("reads the newest 30, offers the older ones, and reads each next page from where the last ended", async ({ page, request }) => {
      await control(request, "notifications/seed", { count: 70 });
      await page.goto("/app/notifications");
      const rows = page.getByRole("list").first().getByRole("listitem");
      await expect(rows).toHaveCount(30);
      const queries = async () => ((await serverState(request)) as unknown as { queries: Record<string, string> }).queries["GET /me/notifications"];
      expect(await queries()).toBe("?limit=30");

      const more = page.getByRole("button", { name: mk.t("notif.more") });
      await more.click();
      await expect(rows).toHaveCount(60);
      expect(await queries()).toMatch(/^\?limit=30&before=n-/);
      await more.click();
      // 73 in all: the last page is short, so there is no more to ask for.
      await expect(rows).toHaveCount(73);
      await expect(more).toHaveCount(0);
      await expect(page.getByText("Older alert 70")).toBeAttached();
    });

    test("a full feed of unread alerts says 30+ on the badge, and marking all read tells the API once", async ({ page, request }) => {
      for (let i = 0; i < 30; i++) await control(request, "notify", { title: `Burst ${i}` });
      await page.goto("/app/notifications");
      await expect(tabs(page)).toContainText(unread("30+"));
      await page.getByRole("button", { name: mk.t("notif.markAll") }).click();
      await expect(page.locator(".item--unread")).toHaveCount(0);
      await expect(tabs(page)).not.toContainText(unread("30+"));
      expect(((await calls(request)).filter((c) => c === "POST /me/notifications/read"))).toHaveLength(1);
    });

    test("one page of a short feed offers nothing more", async ({ page }) => {
      await page.goto("/app/notifications");
      await expect(page.getByRole("link", { name: /Parents evening/ })).toBeVisible();
      await expect(page.getByRole("button", { name: mk.t("notif.more") })).toHaveCount(0);
    });
  });

  test.describe("web push", () => {
    // An Android phone: on the iPhone of the config the switch asks for the Home Screen first (the mock suite covers that).
    test.use({
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
      serviceWorkers: "allow",
      // A session that ends is a 401 the browser logs; an API that refuses a subscription is a 500.
      allowConsoleErrors: [/https:\/\/vercel\.live\/|Failed to load resource: the server responded with a status of (401|500)/],
    });

    const vapid = JSON.parse(readFileSync("tests/fake-api/vapid.json", "utf8")) as { publicKey: string };
    const SUB = { p256dh: "BP-test-key", auth: "test-auth" };

    /**
     * The browser's permission and push manager, played: what the student answers to the prompt, the subscription the phone holds (kept for the
     * tab, as a browser keeps it), the key it was subscribed with, and how many times a subscription was cancelled.
     */
    async function phone(page: Page, permission: NotificationPermission, answer: NotificationPermission = "granted") {
      await page.addInitScript(
        ({ permission, answer, keys }) => {
          const get = (k: string) => sessionStorage.getItem(k);
          const set = (k: string, v: string) => sessionStorage.setItem(k, v);
          Object.defineProperty(Notification, "permission", { get: () => (get("__e2e_permission") as NotificationPermission | null) ?? permission, configurable: true });
          Notification.requestPermission = async () => {
            set("__e2e_asked", String(Number(get("__e2e_asked") ?? 0) + 1));
            set("__e2e_permission", answer);
            return answer;
          };
          const make = (endpoint: string) => ({
            endpoint,
            toJSON: () => ({ endpoint, expirationTime: null, keys }),
            unsubscribe: async () => {
              sessionStorage.removeItem("__e2e_sub");
              set("__e2e_unsubscribed", String(Number(get("__e2e_unsubscribed") ?? 0) + 1));
              return true;
            },
          });
          PushManager.prototype.getSubscription = async () => (get("__e2e_sub") ? (make(get("__e2e_sub")!) as unknown as PushSubscription) : null);
          PushManager.prototype.subscribe = async function (options?: PushSubscriptionOptionsInit) {
            set("__e2e_key", Array.from(new Uint8Array(options!.applicationServerKey as ArrayBuffer)).join(","));
            set("__e2e_userVisibleOnly", String(options!.userVisibleOnly));
            const endpoint = `https://push.example/sub-${Number(get("__e2e_subs") ?? 0) + 1}`;
            set("__e2e_subs", String(Number(get("__e2e_subs") ?? 0) + 1));
            set("__e2e_sub", endpoint);
            return make(endpoint) as unknown as PushSubscription;
          };
        },
        { permission, answer, keys: SUB },
      );
    }
    const seen = (page: Page, key: string) => page.evaluate((k) => sessionStorage.getItem(k), key);
    const toggle = (page: Page) => page.getByRole("switch", { name: mk.t("settings.notifications") });
    const hint = (page: Page) => page.locator("#push-hint");
    const bytes = (b64url: string) => Array.from(Buffer.from(b64url, "base64url")).join(",");
    const held = async (request: import("@playwright/test").APIRequestContext) => ((await serverState(request)) as unknown as { pushToken: { endpoint: string } | null }).pushToken;
    /** Turn it on and wait until the API has the subscription: the switch moves at once, the API answers after. */
    async function turnOn(page: Page, request: import("@playwright/test").APIRequestContext) {
      await toggle(page).click();
      await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
      await expect.poll(() => held(request)).not.toBeNull();
    }

    test("turning it on saves the setting, subscribes with the server's key, and sends the subscription to PUT /me/push-token", async ({ page, request }) => {
      await phone(page, "default");
      await page.goto("/app/settings");
      await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
      await turnOn(page, request);
      await expect(hint(page)).toHaveText(mk.t("settings.push.on"));

      const { bodies, pushToken } = (await serverState(request)) as unknown as { bodies: Record<string, unknown>; pushToken: unknown };
      expect(bodies["PATCH /me/settings"]).toEqual({ notifications_on: true });
      expect(bodies["PUT /me/push-token"]).toEqual({ endpoint: "https://push.example/sub-1", expirationTime: null, keys: { p256dh: SUB.p256dh, auth: SUB.auth }, platform: "android" });
      expect(pushToken).toMatchObject({ endpoint: "https://push.example/sub-1" });
      // The setting first, then the subscription (so a failed subscription is retried the next time the app opens).
      const all = await calls(request);
      expect(all.indexOf("PATCH /me/settings")).toBeLessThan(all.indexOf("PUT /me/push-token"));
      // The key the phone subscribed with is the server's, and the subscription is for notifications the student sees.
      expect(await seen(page, "__e2e_key")).toBe(bytes(vapid.publicKey));
      expect(await seen(page, "__e2e_userVisibleOnly")).toBe("true");
      expect(await seen(page, "__e2e_asked")).toBe("1");
    });

    test("turning it off saves the setting, has the API forget the subscription, and cancels the phone's", async ({ page, request }) => {
      await phone(page, "default");
      await page.goto("/app/settings");
      await turnOn(page, request);
      await toggle(page).click();
      // The switch moves at once; the API has the last word once it has answered.
      await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
      await expect(hint(page)).toHaveText(mk.t("settings.push.off"));
      await expect.poll(async () => ((await serverState(request)) as unknown as { pushToken: unknown }).pushToken).toBeNull();

      const { bodies } = (await serverState(request)) as unknown as { bodies: Record<string, unknown> };
      expect(bodies["PATCH /me/settings"]).toEqual({ notifications_on: false });
      const all = await calls(request);
      expect(all.indexOf("PATCH /me/settings")).toBeLessThan(all.lastIndexOf("DELETE /me/push-token"));
      expect(await seen(page, "__e2e_unsubscribed")).toBe("1");
    });

    test("signing out has the API forget it first, and leaves nothing on the phone", async ({ page, request }) => {
      await phone(page, "default");
      await page.goto("/app/settings");
      await turnOn(page, request);

      await page.goto("/app/profile");
      await page.getByRole("main").getByRole("button", { name: mk.t("drawer.logout") }).click();
      await page.getByRole("dialog", { name: mk.t("confirm.logout") }).getByRole("button", { name: mk.t("drawer.logout") }).click();
      await expect(page).toHaveURL(/\/app\/welcome$/);

      const all = await calls(request);
      // The API needs the session to forget the subscription: it is asked before the session is ended.
      expect(all.indexOf("DELETE /me/push-token")).toBeGreaterThan(-1);
      expect(all.indexOf("DELETE /me/push-token")).toBeLessThan(all.indexOf("POST /auth/logout"));
      expect(((await serverState(request)) as unknown as { pushToken: unknown }).pushToken).toBeNull();
      expect(await seen(page, "__e2e_sub")).toBeNull();
      expect(await seen(page, "__e2e_unsubscribed")).toBe("1");
    });

    test("a session that ends behind the app's back still cancels the phone's subscription, with no call it would only be refused", async ({ page, request }) => {
      test.info().annotations.push({ type: "note", description: "allow the 401s the server answers" });
      await phone(page, "default");
      await page.goto("/app/settings");
      await turnOn(page, request);

      await control(request, "elsewhere");
      await page.reload();
      await expect(page.getByRole("alert").filter({ hasText: mk.t("elsewhere.title") })).toBeVisible();
      await expect.poll(() => seen(page, "__e2e_unsubscribed")).toBe("1");
      expect((await calls(request)).filter((c) => c === "DELETE /me/push-token")).toHaveLength(0);
    });

    test("opening the app again does not tell the API about the same subscription twice, and tells it about one that changed", async ({ page, request }) => {
      await phone(page, "default");
      await page.goto("/app/settings");
      await turnOn(page, request);
      await page.reload();
      await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
      expect((await calls(request)).filter((c) => c === "PUT /me/push-token")).toHaveLength(1);

      // The browser rotated the subscription behind the app's back.
      await page.evaluate(() => sessionStorage.setItem("__e2e_sub", "https://push.example/rotated"));
      await page.reload();
      await expect.poll(async () => ((await serverState(request)) as unknown as { pushToken: { endpoint: string } | null }).pushToken?.endpoint).toBe("https://push.example/rotated");
      expect((await calls(request)).filter((c) => c === "PUT /me/push-token")).toHaveLength(2);
    });

    test("a subscription nobody asked for on this phone is cancelled, and never sent to the API", async ({ page, request }) => {
      await phone(page, "granted");
      await page.addInitScript(() => {
        // Left over from someone else: the phone holds a subscription this student never turned on.
        if (!sessionStorage.getItem("__e2e_seeded_sub")) {
          sessionStorage.setItem("__e2e_seeded_sub", "1");
          sessionStorage.setItem("__e2e_sub", "https://push.example/leftover");
        }
      });
      await page.goto("/app/settings");
      await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
      await expect.poll(() => seen(page, "__e2e_unsubscribed")).toBe("1");
      expect((await calls(request)).filter((c) => c === "PUT /me/push-token" || c === "DELETE /me/push-token")).toHaveLength(0);
    });

    test("a permission already given, for a student who never turned it on here, is not a reason to subscribe", async ({ page, request }) => {
      await phone(page, "granted");
      await page.goto("/app/settings");
      await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
      await page.waitForTimeout(1000);
      expect(await seen(page, "__e2e_subs")).toBeNull();
      expect((await calls(request)).filter((c) => c === "PUT /me/push-token")).toHaveLength(0);
    });

    test("a no from the browser calls nothing, and the switch says it is blocked", async ({ page, request }) => {
      await phone(page, "default", "denied");
      await page.goto("/app/settings");
      await toggle(page).click();
      await expect(hint(page)).toHaveText(mk.t("settings.push.blocked"));
      const all = await calls(request);
      expect(all.filter((c) => c === "PATCH /me/settings" || c.endsWith("/me/push-token"))).toEqual([]);
    });

    test("an API that refuses the subscription leaves the switch off and says so", async ({ page, request }) => {
      await phone(page, "default");
      // The server will not take a subscription with no platform.
      await page.route("**/api/v1/me/push-token", (route) => (route.request().method() === "PUT" ? route.fulfill({ status: 500, body: JSON.stringify({ error: { code: "server_error", message: "x" } }), contentType: "application/json" }) : route.continue()));
      await page.goto("/app/settings");
      await toggle(page).click();
      await expect(page.getByRole("status").filter({ hasText: mk.t("push.failed") })).toBeAttached();
      await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
      expect(await calls(request)).toContain("PATCH /me/settings");
    });

    test("the demo's test notification is not offered", async ({ page }) => {
      await page.goto("/app/settings");
      await expect(page.getByRole("button", { name: new RegExp(mk.t("settings.testPush")) })).toHaveCount(0);
    });
  });
});

/**
 * Privacy against the API: the acknowledgement of the notice (PROPOSED `POST /me/acknowledgements`, carried on `GET /me`),
 * the count of what the API holds (PROPOSED `GET /me/data-summary`), and the notice and terms read without signing in.
 */
test.describe("privacy and consent", () => {
  test.use({ allowConsoleErrors: [/Failed to load resource: (the server responded with a status of (401|422)|net::ERR_)/] });

  const notice = (request: import("@playwright/test").APIRequestContext, version: string | null) =>
    request.post(`${API}/__control/notice`, { data: { version } });
  const cont = (page: Page) => page.getByRole("button", { name: mk.t("notice.continue") });
  const heading = (page: Page, key: "notice.title" | "notice.titleUpdated") => page.getByRole("heading", { level: 1, name: mk.t(key) });

  test("a student the API has no acknowledgement for sees the notice, and Continue sends the version and nothing else", async ({ page, request }) => {
    await notice(request, null);
    await page.goto("/app");
    await expect(heading(page, "notice.title")).toBeVisible();
    // Nothing of the student's is read behind the notice but who they are (and the stream that tells them of a new alert).
    expect((await serverState(request)).calls.filter((c) => c.startsWith("GET") && !["GET /me", "GET /realtime"].includes(c))).toEqual([]);

    await cont(page).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Live");
    await expect(heading(page, "notice.title")).toHaveCount(0);
    const { calls, bodies } = await serverState(request);
    expect(calls).toContain("POST /me/acknowledgements");
    expect(bodies["POST /me/acknowledgements"]).toEqual({ notice_version: NOTICE_VERSION });
    // The API now has it, so a reload goes straight on.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Live");
    await expect(heading(page, "notice.title")).toHaveCount(0);
  });

  test("a student who acknowledged an older version is told the notice was updated", async ({ page, request }) => {
    await notice(request, "2026-01-01");
    await page.goto("/app/profile");
    await expect(heading(page, "notice.titleUpdated")).toBeVisible();
    await cont(page).click();
    await expect(page.locator(".profile__name")).toContainText("Live Student");
    const state = (await (await request.get(`${API}/__control/state`)).json()) as { acknowledgements: { notice_version: string }[] };
    expect(state.acknowledgements.map((a) => a.notice_version)).toEqual(["2026-01-01", NOTICE_VERSION]);
  });

  test("with the API out of reach Continue says so, keeps the screen, and works when the signal is back", async ({ page, request, context }) => {
    await notice(request, null);
    await page.goto("/app");
    await expect(heading(page, "notice.title")).toBeVisible();
    await context.route(`${API}/api/v1/me/acknowledgements`, (route) => route.abort());
    await cont(page).click();
    await expect(page.getByRole("alert").filter({ hasText: mk.t("err.network") })).toBeVisible();
    await expect(heading(page, "notice.title")).toBeVisible();
    await context.unroute(`${API}/api/v1/me/acknowledgements`);
    await cont(page).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Live");
  });

  test("a class QR scanned by a student who has not seen the notice joins only after Continue", async ({ page, request }) => {
    await notice(request, null);
    await page.goto("/app/checkin/LIVE-7B");
    await expect(heading(page, "notice.title")).toBeVisible();
    expect((await serverState(request)).calls).not.toContain("POST /sessions/join");
    await cont(page).click();
    await expect(page).toHaveURL(/\/app\/play\/LIVE-7B$/);
    expect((await serverState(request)).calls).toContain("POST /sessions/join");
  });

  test("the notice and the terms open for a signed-out student, and nothing but who is signed in is asked of the API", async ({ page, request }) => {
    await request.post(`${API}/__control/signed-out`);
    await page.goto("/app/privacy#rights");
    await expect(page).toHaveURL(/\/app\/privacy#rights$/);
    await expect(page.getByRole("heading", { level: 1, name: PRIVACY.mk.title })).toBeVisible();
    await page.goto("/app/terms");
    await expect(page.getByRole("heading", { level: 1, name: TERMS.mk.title })).toBeVisible();
    expect((await serverState(request)).calls.filter((c) => c !== "GET /me")).toEqual([]);
  });

  test("Your data draws the API's account and its counts, and a request goes through the school", async ({ page, request }) => {
    await page.goto("/app/data");
    await expect(page.getByText("live.student@school.example")).toBeVisible();
    const row = (key: Parameters<typeof mk.t>[0]) => page.locator("main.screen .list .item").filter({ has: page.getByText(mk.t(key), { exact: true }) });
    await expect(row("data.n.attendance")).toContainText("18");
    await expect(row("data.n.answers")).toContainText("12");
    await expect(row("data.n.alerts")).toContainText("3");
    await expect(row("data.n.push")).toContainText(mk.t("data.no"));
    expect((await serverState(request)).calls).toContain("GET /me/data-summary");
    await expect(page.getByText(mk.t("data.requestBody"))).toBeVisible();
  });

  test("Your data counts a question to the teacher once the lesson has one", async ({ page, request }) => {
    await page.goto("/app/checkin/LIVE-7B");
    await expect(page.getByText(mk.q("q.waitTeacher"))).toBeVisible();
    await page.getByRole("button", { name: mk.q("ask.entry") }).click();
    await page.getByRole("textbox", { name: mk.q("ask.label") }).fill("Може ли пример?");
    await page.getByRole("textbox", { name: mk.q("ask.label") }).press("Enter");
    await expect(page.getByRole("dialog").getByRole("heading", { name: mk.q("ask.sent") })).toBeVisible();
    await page.goto("/app/data");
    await expect(page.locator("main.screen .list .item").filter({ has: page.getByText(mk.t("data.n.asks"), { exact: true }) })).toContainText("1");
    expect((await serverState(request)).calls).toContain("POST /sessions/se-live-1/anon-questions");
  });

  test("clearing the phone keeps the student signed in, reads the screens again, and does not sign out", async ({ page, request }) => {
    await page.goto("/app/data");
    await page.evaluate(() => localStorage.setItem("teacheraid-camera-intro", "1"));
    const before = (await serverState(request)).calls.filter((c) => c === "GET /me").length;
    await page.getByRole("button", { name: new RegExp(mk.t("data.clear")) }).click();
    await page.getByRole("dialog", { name: mk.t("data.clearTitle") }).getByRole("button", { name: mk.t("data.clearConfirm") }).click();
    await expect(page.getByText(mk.t("data.cleared")).first()).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("teacheraid-camera-intro"))).toBeNull();
    await expect(page.getByRole("heading", { level: 1, name: mk.t("data.title") })).toBeVisible();
    await expect.poll(async () => (await serverState(request)).calls.filter((c) => c === "GET /me").length).toBeGreaterThan(before);
    expect((await serverState(request)).calls).not.toContain("POST /auth/logout");
  });
});
