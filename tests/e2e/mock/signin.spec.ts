import type { Page } from "@playwright/test";
import { MOCK_CODE, MOCK_ROSTER } from "@/lib/app/api/mock/data";
import { MAX_WRONG_CODES } from "@/lib/app/api/mock/signin";
import { expect, mk, en, start, test } from "../fixtures";

const EMAIL = MOCK_ROSTER[0];

const emailField = (page: Page, t = mk) => page.getByLabel(t.t("signin.email"));
const codeField = (page: Page, t = mk) => page.getByLabel(t.t("signin.code"), { exact: true });
/** What the screen says is wrong. Next's own route announcer is an alert too, so it is left out. */
const problem = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
const signedOut = (page: Page, state: Record<string, unknown> = {}) => start(page, { state: { signedIn: false, ...state } });

/** The email stage, filled in and sent: the student is now on the code stage. */
async function toCodeStage(page: Page) {
  await emailField(page).fill(EMAIL);
  await page.getByRole("button", { name: mk.t("signin.next") }).click();
  await expect(page.getByRole("heading", { name: mk.t("signin.codeTitle") })).toBeVisible();
}

test("a phone that has never been used opens on the sign-in screen, whichever address it is opened at", async ({ page }) => {
  await start(page, { state: {} });
  await page.goto("/app/welcome");
  await expect(page.getByRole("heading", { level: 1, name: mk.t("welcome.title") })).toBeVisible();
  await expect(emailField(page)).toBeVisible();

  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/welcome\?next=%2Fapp$/);
});

test.describe("the email stage", () => {
  test("is the first screen of a student who is signed out, and asks for the school email", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");

    await expect(page.getByRole("heading", { level: 1, name: mk.t("welcome.title") })).toBeVisible();
    const email = emailField(page);
    // What lets a phone fill the field and raise the right keyboard.
    await expect(email).toHaveAttribute("type", "email");
    await expect(email).toHaveAttribute("autocomplete", "email");
    await expect(email).toHaveAttribute("inputmode", "email");
    await expect(email).toHaveAttribute("autocapitalize", "none");
    await expect(email).toHaveAttribute("enterkeyhint", "go");
    // One yellow control, and it is the one that moves on.
    await expect(page.locator(".btn--primary")).toHaveCount(1);
  });

  test("says what is wrong with an empty or incomplete email without asking the API", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    const email = emailField(page);
    const next = page.getByRole("button", { name: mk.t("signin.next") });

    await next.click();
    await expect(problem(page)).toContainText(mk.t("signin.err.empty"));
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toBeFocused();

    await email.fill("marko@");
    await expect(problem(page)).toHaveCount(0);
    await email.press("Enter");
    await expect(problem(page)).toContainText(mk.t("signin.err.invalid"));
    await expect(page.getByRole("heading", { name: mk.t("signin.codeTitle") })).toHaveCount(0);
  });

  test("tells a student who is not on the school's list to ask the teacher, and keeps what they typed", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    const email = emailField(page);
    await email.fill("nobody@student.example.mk");
    await email.press("Enter");

    await expect(problem(page)).toContainText(mk.t("err.unknown_email"));
    await expect(email).toHaveValue("nobody@student.example.mk");
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute("aria-describedby", /.+/);
  });

  test("the demo hint fills in a roster email", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    await page.getByRole("button", { name: mk.t("signin.demoUse") }).click();
    await expect(emailField(page)).toHaveValue(EMAIL);
  });

  test("says there is no connection when offline, and clears it when the connection is back", async ({ page, context }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    await emailField(page).fill(EMAIL);
    await context.setOffline(true);
    await page.getByRole("button", { name: mk.t("signin.next") }).click();

    await expect(problem(page)).toContainText(mk.t("err.network"));
    await expect(emailField(page)).toHaveValue(EMAIL);

    await context.setOffline(false);
    await expect(problem(page)).toHaveCount(0);
    await page.getByRole("button", { name: mk.t("signin.next") }).click();
    await expect(page.getByRole("heading", { name: mk.t("signin.codeTitle") })).toBeVisible();
  });
});

test.describe("the code stage", () => {
  test("signs in on the sixth digit, with no button to find, and lands on Home", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/welcome\?next=%2Fapp$/);
    await toCodeStage(page);

    await expect(page.getByText(EMAIL)).toBeVisible();
    const code = codeField(page);
    await expect(code).toBeFocused();
    await expect(code).toHaveAttribute("autocomplete", "one-time-code");
    await expect(code).toHaveAttribute("inputmode", "numeric");
    await expect(code).toHaveAttribute("maxlength", "6");

    await code.pressSequentially(MOCK_CODE);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Марко");
  });

  test("signs in with Enter too, and takes a pasted code with spaces", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    await toCodeStage(page);
    // A paste can bring spaces and fewer digits than the field holds; only digits stay.
    await codeField(page).fill("123 45");
    await expect(codeField(page)).toHaveValue("12345");
    await codeField(page).fill(MOCK_CODE.slice(0, 5));
    await codeField(page).press("Enter");
    await expect(problem(page)).toHaveCount(0); // too short to send: nothing asked, nothing said
    await codeField(page).fill(MOCK_CODE);
    await expect(page).toHaveURL(/\/app$/);
  });

  test("says a wrong code is wrong, empties the field and lets the student try again", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    await toCodeStage(page);
    await codeField(page).fill("000000");

    await expect(problem(page)).toContainText(mk.t("err.invalid_code"));
    await expect(codeField(page)).toHaveValue("");
    await expect(codeField(page)).toBeFocused();
    await expect(codeField(page)).toHaveAttribute("aria-invalid", "true");

    await codeField(page).fill(MOCK_CODE);
    await expect(page).toHaveURL(/\/app$/);
  });

  test("locks after too many wrong codes and says for how long", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    await toCodeStage(page);
    for (let i = 0; i < MAX_WRONG_CODES; i++) {
      await codeField(page).fill("000000");
      await expect(problem(page)).toBeVisible();
      if (i < MAX_WRONG_CODES - 1) await expect(codeField(page)).toHaveValue("");
    }

    await expect(codeField(page)).toBeDisabled();
    await expect(page.getByText(/Премногу погрешни кодови/)).toBeVisible();
    await expect(page.getByRole("button", { name: mk.t("signin.verify") })).toBeDisabled();
    // The way out is still there.
    await page.getByRole("button", { name: mk.t("signin.change") }).click();
    await expect(emailField(page)).toBeVisible();
  });

  test("says a code has expired, and a new one fixes it", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-20T08:00:00Z") });
    await signedOut(page);
    await page.goto("/app/welcome");
    await toCodeStage(page);

    await page.clock.fastForward("11:00");
    await codeField(page).fill(MOCK_CODE);
    await expect(problem(page)).toContainText(mk.t("err.code_expired"));

    await page.getByRole("button", { name: mk.t("signin.resend") }).click();
    await expect(page.getByRole("status").filter({ hasText: mk.t("signin.resent") })).toBeVisible();
    await codeField(page).fill(MOCK_CODE);
    await expect(page).toHaveURL(/\/app$/);
  });

  test("lets a new code be asked for only after the wait, and counts it down", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-20T08:00:00Z") });
    await signedOut(page);
    await page.goto("/app/welcome");
    await toCodeStage(page);

    const resend = page.getByRole("button", { name: /Нов код за \d+ с/ });
    await expect(resend).toBeVisible();
    await expect(resend).toHaveAttribute("aria-disabled", "true");
    await page.clock.fastForward("00:31");
    await expect(page.getByRole("button", { name: mk.t("signin.resend") })).toHaveAttribute("aria-disabled", "false");
  });

  test("is still there after the page was away (a mail app in between), and the email can be changed", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    await toCodeStage(page);

    await page.reload();
    await expect(page.getByRole("heading", { name: mk.t("signin.codeTitle") })).toBeVisible();
    await expect(page.getByText(EMAIL)).toBeVisible();

    await page.getByRole("button", { name: mk.t("signin.change") }).click();
    await expect(emailField(page)).toHaveValue(EMAIL);
    await page.reload();
    await expect(page.getByRole("heading", { name: mk.t("welcome.title") })).toBeVisible();
  });

  test("speaks English when asked to, in every stage", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { name: en.t("welcome.title") })).toBeVisible();
    await emailField(page, en).fill("nobody@student.example.mk");
    await emailField(page, en).press("Enter");
    await expect(problem(page)).toContainText(en.t("err.unknown_email"));

    await emailField(page, en).fill(EMAIL);
    await emailField(page, en).press("Enter");
    await expect(page.getByRole("heading", { name: en.t("signin.codeTitle") })).toBeVisible();
    await codeField(page, en).fill("000000");
    await expect(problem(page)).toContainText(en.t("err.invalid_code"));
  });

  test("keeps the message and drops the movement when the phone asks for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signedOut(page);
    await page.goto("/app/welcome");
    await emailField(page).press("Enter");
    await expect(problem(page)).toContainText(mk.t("signin.err.empty"));
    // Nothing moves: no running animation, the stage change and the message included, carries a transform.
    const moving = await page.evaluate(() =>
      document
        .getAnimations()
        .flatMap((a) => (a.effect as KeyframeEffect).getKeyframes())
        .filter((k) => k.transform && k.transform !== "none" && k.transform !== "translateX(0px)").length,
    );
    expect(moving).toBe(0);
  });
});

test.describe("continuing what the student came for (EC-JOIN-05)", () => {
  test("a class QR opened while signed out signs in, then checks in with the same code", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/checkin/MATH-7B");

    await expect(page).toHaveURL(/\/app\/welcome\?next=%2Fapp%2Fcheckin%2FMATH-7B$/);
    await toCodeStage(page);
    // The code stage keeps the address, so a reload there still knows where to go.
    await expect(page).toHaveURL(/next=%2Fapp%2Fcheckin%2FMATH-7B$/);
    await codeField(page).fill(MOCK_CODE);

    await expect(page).toHaveURL(/\/app\/play\/MATH-7B$/);
    await expect(page.getByText(mk.q("q.live"))).toBeVisible();

    // Joining was the attendance: 21 of 24, up from 20 of 23.
    await page.goto("/app");
    await expect(page.getByRole("link", { name: new RegExp(mk.t("home.attendance")) })).toContainText("88%");
  });

  test("a link to another place goes there, and an address that is not this app's goes Home", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/attendance");
    await expect(page).toHaveURL(/welcome\?next=%2Fapp%2Fattendance$/);
    await toCodeStage(page);
    await codeField(page).fill(MOCK_CODE);
    await expect(page).toHaveURL(/\/app\/attendance$/);

    await page.evaluate(() => localStorage.setItem("teacheraid-app-v1", JSON.stringify({ signedIn: false })));
    await page.goto("/app/welcome?next=https%3A%2F%2Fevil.example%2Fapp");
    await toCodeStage(page);
    await codeField(page).fill(MOCK_CODE);
    await expect(page).toHaveURL(/\/app$/);
  });
});

test.describe("signed in elsewhere (BR-AUTH-03)", () => {
  test("is a full screen with one way forward, which signs in and comes back", async ({ page }) => {
    await signedOut(page, { endedElsewhere: true });
    await page.goto("/app/attendance");

    // The address stays: this is where the student was.
    await expect(page).toHaveURL(/\/app\/attendance$/);
    const screen = problem(page).filter({ hasText: mk.t("elsewhere.title") });
    await expect(screen).toContainText(mk.t("elsewhere.body"));
    await expect(page.getByRole("button")).toHaveCount(1);
    await expect(page.getByRole("button", { name: mk.t("elsewhere.cta") })).toBeFocused();
    await expect(page.getByRole("navigation", { name: mk.t("nav.main") })).toHaveCount(0);

    await page.getByRole("button", { name: mk.t("elsewhere.cta") }).click();
    await expect(page).toHaveURL(/\/app\/welcome\?next=%2Fapp%2Fattendance$/);
    await toCodeStage(page);
    await codeField(page).fill(MOCK_CODE);
    await expect(page).toHaveURL(/\/app\/attendance$/);
    await expect(page.getByText(mk.t("elsewhere.title"))).toHaveCount(0);
  });

  test("appears from whatever call the API refuses, wherever the student is", async ({ page }) => {
    await page.goto("/app/settings");
    await page.getByRole("button", { name: new RegExp(mk.t("settings.simElsewhere")) }).click();

    await expect(problem(page).filter({ hasText: mk.t("elsewhere.title") })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByRole("heading", { name: mk.t("settings.title") })).toHaveCount(0);

    await page.getByRole("button", { name: mk.t("elsewhere.cta") }).click();
    await toCodeStage(page);
    await codeField(page).fill(MOCK_CODE);
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByRole("heading", { name: mk.t("settings.title") })).toBeVisible();
  });

  test("is told in English too", async ({ page }) => {
    await start(page, { state: { signedIn: false, endedElsewhere: true }, locale: "en" });
    await page.goto("/app");
    await expect(problem(page).filter({ hasText: en.t("elsewhere.title") })).toContainText(en.t("elsewhere.body"));
    await expect(page.getByRole("button", { name: en.t("elsewhere.cta") })).toBeVisible();
  });
});

test.describe("signing out", () => {
  test("asks first, then leaves the app clean and starts the next student at Home", async ({ page }) => {
    await page.goto("/app/profile");
    await page.getByRole("main").getByRole("button", { name: mk.t("drawer.logout") }).click();
    const sheet = page.getByRole("dialog", { name: mk.t("confirm.logout") });

    // Cancel keeps the student where they are.
    await sheet.getByRole("button", { name: mk.t("confirm.cancel") }).click();
    await expect(page).toHaveURL(/\/app\/profile$/);

    await page.getByRole("main").getByRole("button", { name: mk.t("drawer.logout") }).click();
    await page.getByRole("dialog", { name: mk.t("confirm.logout") }).getByRole("button", { name: mk.t("drawer.logout") }).click();

    // Their own choice carries nothing: no screen to come back to.
    await expect(page).toHaveURL(/\/app\/welcome$/);
    await expect(page.getByRole("heading", { name: mk.t("welcome.title") })).toBeVisible();
    // Nothing the student saw is left on the page.
    await expect(page.getByText("Марко")).toHaveCount(0);

    await toCodeStage(page);
    await codeField(page).fill(MOCK_CODE);
    await expect(page).toHaveURL(/\/app$/);
  });

  test("forgets what the student had seen on this phone", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Марко");
    await page.evaluate(() => localStorage.setItem("teacheraid-achievements-seen", "answer"));

    await page.goto("/app/profile");
    await page.getByRole("main").getByRole("button", { name: mk.t("drawer.logout") }).click();
    await page.getByRole("dialog", { name: mk.t("confirm.logout") }).getByRole("button", { name: mk.t("drawer.logout") }).click();
    await expect(page).toHaveURL(/\/app\/welcome$/);
    expect(await page.evaluate(() => localStorage.getItem("teacheraid-achievements-seen"))).toBeNull();
  });

  test("Back after signing out does not bring the student's screens back", async ({ page }) => {
    await page.goto("/app");
    await page.goto("/app/profile");
    await page.getByRole("main").getByRole("button", { name: mk.t("drawer.logout") }).click();
    await page.getByRole("dialog", { name: mk.t("confirm.logout") }).getByRole("button", { name: mk.t("drawer.logout") }).click();
    await expect(page).toHaveURL(/\/app\/welcome$/);

    await page.goBack();
    await expect(page.getByRole("heading", { name: mk.t("welcome.title") })).toBeVisible();
    await expect(page.getByRole("navigation", { name: mk.t("nav.main") })).toHaveCount(0);
  });
});

test.describe("the route guard", () => {
  const ROUTES = ["/app", "/app/profile", "/app/notifications", "/app/settings", "/app/attendance", "/app/leaderboard", "/app/scan", "/app/subjects"];

  for (const route of ROUTES) {
    test(`${route} sends a signed-out student to sign in without drawing a screen of the app first`, async ({ page }) => {
      await signedOut(page);
      // Everything that ever appears in the page, from the first byte on.
      await page.addInitScript(() => {
        const seen: string[] = [];
        (window as unknown as { __seen: string[] }).__seen = seen;
        const note = () => seen.push(document.body?.innerText ?? "");
        new MutationObserver(note).observe(document, { childList: true, subtree: true, characterData: true });
      });
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`/app/welcome\\?next=${encodeURIComponent(route)}$`));
      await expect(page.getByRole("heading", { name: mk.t("welcome.title") })).toBeVisible();

      const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
      expect(seen.length, "the observer saw the page being drawn").toBeGreaterThan(0);
      for (const text of seen) {
        expect(text, "a signed-in screen was drawn").not.toContain("Марко");
        expect(text).not.toContain(mk.t("nav.alerts"));
      }
      await expect(page.getByRole("navigation", { name: mk.t("nav.main") })).toHaveCount(0);
    });
  }

  test("the server's own page is the launch picture, not a screen of the app", async ({ request }) => {
    const html = await (await request.get("/app/profile")).text();
    expect(html).not.toContain("Марко");
    expect(html).not.toContain(mk.t("drawer.logout"));
  });

  test("a signed-in student goes straight to the screen asked for, and the welcome screen is not kept in history", async ({ page }) => {
    await page.goto("/app/profile");
    await page.goto("/app/welcome?next=%2Fapp%2Fattendance");
    await expect(page).toHaveURL(/\/app\/attendance$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/app\/profile$/);
  });
});
