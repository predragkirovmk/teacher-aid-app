import { expect, mk, test } from "../fixtures";

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
    for (const needle of ["mock-session-", "student-marko", "Виктор Илиевски", "Њутнови закони"]) {
      expect(scripts.filter((source) => source.includes(needle)).length, `scripts containing "${needle}"`).toBe(0);
    }
  });
});
