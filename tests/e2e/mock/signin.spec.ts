import type { Page } from "@playwright/test";
import { NOTICE_VERSION } from "@/lib/app/privacy";
import { expect, mk, en, start, test } from "../fixtures";

type Provider = "google" | "microsoft";
type Account = "marko" | "personal" | "cancel";
const NAMES: Record<Provider, string> = { google: "Google", microsoft: "Microsoft" };

const providerButton = (page: Page, which: Provider, t = mk) => page.getByRole("button", { name: t.t(`signin.${which}`) });
/** What the screen says is wrong. Next's own route announcer is an alert too, so it is left out. */
const problem = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
const signedOut = (page: Page, state: Record<string, unknown> = {}) => start(page, { state: { signedIn: false, ...state } });

/** The demo's stand-in for the provider's own page: the sheet the browser lands on after the redirect. */
const providerSheet = (page: Page, which: Provider = "google", t = mk) => page.getByRole("dialog", { name: t.t("signin.demo.title", { provider: NAMES[which] }) });

/** Press a provider button, and choose an account at the provider's page, which returns through the callback. */
async function signInWith(page: Page, account: Account = "marko", which: Provider = "google") {
  await providerButton(page, which).click();
  const key = `signin.demo.${account}` as const;
  await providerSheet(page, which)
    .getByRole("button", { name: mk.t(key, { provider: NAMES[which] }) })
    .click();
}

test("a phone that has never been used opens on the sign-in screen, whichever address it is opened at", async ({ page }) => {
  await start(page, { state: {} });
  await page.goto("/app/welcome");
  await expect(page.getByRole("heading", { level: 1, name: mk.t("welcome.title") })).toBeVisible();
  await expect(providerButton(page, "google")).toBeVisible();

  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/welcome\?next=%2Fapp$/);
});

test.describe("the sign-in screen", () => {
  test("offers Google and Microsoft and nothing else: no email, no code", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");

    await expect(page.getByRole("heading", { level: 1, name: mk.t("welcome.title") })).toBeVisible();
    await expect(page.getByText(mk.t("welcome.sub"))).toBeVisible();
    await expect(page.getByRole("button", { name: "Продолжи со Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Продолжи со Microsoft" })).toBeVisible();
    // Nothing to type: the provider asks for the account and the password.
    await expect(page.locator("input, textarea")).toHaveCount(0);
    await expect(page.getByText(mk.t("signin.safe"))).toBeVisible();
  });

  test("draws the providers' marks inline and asks nobody else for anything", async ({ page }) => {
    const outside: string[] = [];
    const origin = new URL(test.info().project.use.baseURL ?? "http://localhost:3100").origin;
    page.on("request", (r) => {
      if (!r.url().startsWith(origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) outside.push(r.url());
    });
    await signedOut(page);
    await page.goto("/app/welcome");
    for (const which of ["google", "microsoft"] as const) {
      const button = providerButton(page, which);
      // The mark is an svg inside the button, hidden from a screen reader: the words name the provider.
      await expect(button.locator("svg[aria-hidden='true']")).toHaveCount(1);
      await expect(button.locator("img")).toHaveCount(0);
    }
    // The Google G is its four colours, the Microsoft mark its four squares.
    await expect(providerButton(page, "google").locator("path")).toHaveCount(4);
    await expect(providerButton(page, "microsoft").locator("path")).toHaveCount(4);
    expect(outside, "requests to another origin").toEqual([]);
  });

  test("follows each provider's own button: white, with the words in the provider's colour, and 56 points high", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    for (const which of ["google", "microsoft"] as const) {
      const button = providerButton(page, which);
      await expect(button).toHaveCSS("background-color", "rgb(255, 255, 255)");
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(56);
    }
    await expect(providerButton(page, "google")).toHaveCSS("color", "rgb(31, 31, 31)");
    await expect(providerButton(page, "microsoft")).toHaveCSS("color", "rgb(94, 94, 94)");
    // No yellow control: the providers' buttons are the only actions.
    await expect(page.locator(".btn--primary")).toHaveCount(0);
  });

  test("keeps the privacy notice and the terms a tap away", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    await expect(page.getByRole("link", { name: mk.t("privacy.row") })).toBeVisible();
    await expect(page.getByRole("link", { name: mk.t("terms.row") })).toBeVisible();
  });
});

test.describe("signing in through the provider", () => {
  test("Google: the redirect lands on the demo's provider page, and the account on the roster signs in and lands on Home", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/welcome\?next=%2Fapp$/);

    await providerButton(page, "google").click();
    await expect(page).toHaveURL(/demo_provider=google/);
    const sheet = providerSheet(page);
    await expect(sheet).toContainText(mk.t("signin.demo.note", { provider: "Google" }));
    await sheet.getByRole("button", { name: mk.t("signin.demo.marko") }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Марко");
  });

  test("Microsoft goes the same way", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    await signInWith(page, "marko", "microsoft");
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Марко");
  });

  test("a personal account is not on the list", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    await signInWith(page, "personal");

    // The provider sent the browser back with the reason, which the screen has read and taken off the address; nobody is signed in.
    await expect(page).toHaveURL(/\/app\/welcome$/);
    await expect(problem(page)).toContainText(mk.t("signin.err.unknown_email.title"));
    await expect(problem(page)).toContainText(mk.t("signin.err.unknown_email.body"));
    await expect(providerButton(page, "google")).toBeEnabled();
  });

  test("tells the student the sign-in did not finish when they cancel at the provider, and nothing was changed", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    await signInWith(page, "cancel", "microsoft");

    await expect(problem(page)).toContainText(mk.t("signin.err.sign_in_failed.title"));
    await expect(problem(page)).toContainText(mk.t("signin.err.sign_in_failed.body"));
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/welcome\?next=%2Fapp$/);
  });

  test("says it once: the reason leaves the address, so a reload does not repeat it, and trying again clears it", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome?next=%2Fapp%2Fattendance");
    await signInWith(page, "personal");
    await expect(problem(page)).toContainText(mk.t("signin.err.unknown_email.title"));
    // The way on is kept; the reason is not.
    await expect(page).toHaveURL(/\/app\/welcome\?next=%2Fapp%2Fattendance$/);
    await page.reload();
    await expect(page.getByRole("heading", { name: mk.t("welcome.title") })).toBeVisible();
    await expect(problem(page)).toHaveCount(0);

    await signInWith(page, "personal");
    await expect(problem(page)).toHaveCount(1);
    await providerButton(page, "google").click();
    await expect(providerSheet(page)).toBeVisible();
  });

  test("leaving the provider's page without choosing changes nothing and says nothing", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    await providerButton(page, "google").click();
    await expect(providerSheet(page)).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(providerSheet(page)).toHaveCount(0);
    await expect(providerButton(page, "google")).toBeVisible();
    await expect(problem(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/app\/welcome$/);
  });

  test("an error in the address that the API does not send is ignored", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome?error=%3Cb%3Ehello%3C%2Fb%3E");
    await expect(problem(page)).toHaveCount(0);
  });

  // Going offline fails the requests that are in flight, and the browser logs each one.
  test.describe("with no connection", () => {
    test.use({ allowConsoleErrors: [/https:\/\/vercel\.live\/|net::ERR_INTERNET_DISCONNECTED/] });

    test("says there is no connection when offline, and clears it when the connection is back", async ({ page, context }) => {
      await signedOut(page);
      await page.goto("/app/welcome");
      await context.setOffline(true);
      await providerButton(page, "google").click();

      await expect(problem(page)).toContainText(mk.t("err.network"));
      await expect(providerButton(page, "google")).toBeEnabled();

      await context.setOffline(false);
      await expect(problem(page)).toHaveCount(0);
      await providerButton(page, "google").click();
      await expect(providerSheet(page)).toBeVisible();
    });
    });

  test("speaks English when asked to, buttons and reasons included", async ({ page }) => {
    await signedOut(page);
    await page.goto("/app/welcome");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { name: en.t("welcome.title") })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await providerButton(page, "microsoft", en).click();
    await providerSheet(page, "microsoft", en).getByRole("button", { name: en.t("signin.demo.personal") }).click();
    await expect(problem(page)).toContainText(en.t("signin.err.unknown_email.title"));
    await expect(problem(page)).toContainText(en.t("signin.err.unknown_email.body"));
  });

  test("keeps the message and drops the movement when the phone asks for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signedOut(page);
    await page.goto("/app/welcome?error=sign_in_failed");
    await expect(problem(page)).toContainText(mk.t("signin.err.sign_in_failed.title"));
    // Nothing moves: no running animation, the message included, carries a transform.
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
    // The provider's page and the way back keep the address, so a reload anywhere on the way still knows where to go.
    await providerButton(page, "google").click();
    await expect(page).toHaveURL(/demo_provider=google&return_to=.*checkin/);
    await providerSheet(page).getByRole("button", { name: mk.t("signin.demo.marko") }).click();

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
    await signInWith(page);
    await expect(page).toHaveURL(/\/app\/attendance$/);

    await page.evaluate((noticeVersion) => localStorage.setItem("teacheraid-app-v1", JSON.stringify({ signedIn: false, noticeVersion })), NOTICE_VERSION);
    await page.goto("/app/welcome?next=https%3A%2F%2Fevil.example%2Fapp");
    await signInWith(page);
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
    await signInWith(page);
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
    await signInWith(page);
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

    await signInWith(page);
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
