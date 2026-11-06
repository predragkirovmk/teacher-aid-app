import { en, expect, exact, mk, start, test } from "../fixtures";
import type { Page } from "@playwright/test";

/**
 * Notifications and web push (FR-NOT-01..03, US-S10) in the demo, which has no push server: the browser's permission is real (here played
 * by `permission()`, since a headless browser has nobody to answer its prompt), a subscription is not, so "on" is a permission given and the
 * setting on. The test phone is an iPhone 13 (Safari, not on the Home Screen) unless a test says it is something else.
 */
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

/**
 * Play the browser's notification permission: what it is now, and what the student answers when asked. The answer is kept for the tab, so a
 * reload remembers it as a browser does. `window.__asked` counts the times the browser was asked.
 */
async function permission(page: Page, initial: NotificationPermission, answer: NotificationPermission = "granted") {
  await page.addInitScript(
    ({ initial, answer }) => {
      const KEY = "__e2e_permission";
      const read = () => (sessionStorage.getItem(KEY) as NotificationPermission | null) ?? initial;
      Object.defineProperty(Notification, "permission", { get: read, configurable: true });
      Notification.requestPermission = async () => {
        sessionStorage.setItem("__e2e_asked", String(Number(sessionStorage.getItem("__e2e_asked") ?? 0) + 1));
        if (answer !== "default") sessionStorage.setItem(KEY, answer);
        return read();
      };
    },
    { initial, answer },
  );
}

const asked = (page: Page) => page.evaluate(() => Number(sessionStorage.getItem("__e2e_asked") ?? 0));
const toggle = (page: Page) => page.getByRole("switch", { name: mk.t("settings.notifications") });
const hint = (page: Page) => page.locator("#push-hint");
const dialog = (page: Page) => page.getByRole("dialog");
const said = (page: Page, text: string) => page.getByRole("status").filter({ hasText: exact(text) });

test.describe("the switch in Settings, on an Android phone", () => {
  test.use({ userAgent: ANDROID });

  test("shows what is true, and turns on and off through the browser and the setting", async ({ page }) => {
    await permission(page, "default");
    await page.goto("/app/settings");
    // The demo starts with the setting on, but nothing has been allowed on this phone: the switch tells the truth.
    await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
    await expect(hint(page)).toHaveText(mk.t("settings.push.off"));

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
    await expect(hint(page)).toHaveText(mk.t("settings.push.on"));
    await expect(said(page, mk.t("push.on"))).toBeAttached();
    expect(await asked(page)).toBe(1);

    await page.reload();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "true");

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
    await expect(hint(page)).toHaveText(mk.t("settings.push.off"));
    await expect(said(page, mk.t("push.off"))).toBeAttached();

    // Off is the student's own choice: the setting is saved, so the browser's yes does not bring it back, and nobody is asked again.
    await page.reload();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
    expect(await asked(page)).toBe(1);
  });

  test("says the browser said no, and shows how to turn it back on for this kind of phone", async ({ page }) => {
    await permission(page, "denied");
    await page.goto("/app/settings");
    await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
    await expect(hint(page)).toHaveText(mk.t("settings.push.blocked"));

    await page.getByRole("button", { name: new RegExp(mk.t("settings.push.helpRow")) }).click();
    await expect(dialog(page)).toContainText(mk.t("push.help.title"));
    for (const step of ["push.help.android.1", "push.help.android.2", "push.help.android.3"] as const) await expect(dialog(page)).toContainText(mk.t(step));
    await expect(dialog(page)).not.toContainText(mk.t("push.help.ios.1"));
    await page.getByRole("button", { name: mk.t("install.ok") }).click();
    await expect(dialog(page)).toHaveCount(0);

    // The switch itself says the same thing, and the browser is never asked again.
    await toggle(page).click();
    await expect(dialog(page)).toContainText(mk.t("push.help.title"));
    expect(await asked(page)).toBe(0);
  });

  test("when the browser says no to the question, the switch stays off and says why", async ({ page }) => {
    await permission(page, "default", "denied");
    await page.goto("/app/settings");
    await toggle(page).click();
    await expect(said(page, mk.t("push.denied"))).toBeAttached();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
    await expect(hint(page)).toHaveText(mk.t("settings.push.blocked"));
    await expect(page.getByRole("button", { name: new RegExp(mk.t("settings.push.helpRow")) })).toBeVisible();
  });

  test("a prompt that is closed without an answer changes nothing", async ({ page }) => {
    await permission(page, "default", "default");
    await page.goto("/app/settings");
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
    await expect(hint(page)).toHaveText(mk.t("settings.push.off"));
    await expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveCount(0);
  });

  test("a browser with no push says so, and the switch cannot be turned", async ({ page }) => {
    await permission(page, "default");
    await page.addInitScript(() => {
      // @ts-expect-error a browser without the Push API
      delete window.PushManager;
    });
    await page.goto("/app/settings");
    await expect(hint(page)).toHaveText(mk.t("settings.push.unsupported"));
    await expect(toggle(page)).toHaveAttribute("aria-disabled", "true");
    // Pressing it does nothing: there is nothing to turn on, and nothing is asked.
    await toggle(page).click({ force: true });
    await expect(dialog(page)).toHaveCount(0);
    expect(await asked(page)).toBe(0);
  });

  test("English reads the same states in English", async ({ page }) => {
    await permission(page, "denied");
    await start(page, { locale: "en" });
    await page.goto("/app/settings");
    await expect(hint(page)).toHaveText("Blocked in your browser settings.");
    await expect(page.getByRole("button", { name: /How to turn them back on/ })).toBeVisible();
  });
});

test.describe("on an iPhone", () => {
  test("in Safari it says the app has to be on the Home Screen first, and never asks the browser", async ({ page }) => {
    await permission(page, "default");
    await page.goto("/app/settings");
    await expect(hint(page)).toHaveText(mk.t("settings.push.install"));
    await expect(toggle(page)).toHaveAttribute("aria-checked", "false");

    await toggle(page).click();
    await expect(dialog(page)).toContainText(mk.t("install.title"));
    await expect(dialog(page)).toContainText(mk.t("install.ios.share"));
    await expect(dialog(page)).toContainText(mk.t("install.pushNote"));
    await page.getByRole("button", { name: mk.t("install.ok") }).click();

    await page.getByRole("button", { name: new RegExp(mk.t("settings.push.installRow")) }).click();
    await expect(dialog(page)).toContainText(mk.t("install.pushNote"));
    expect(await asked(page)).toBe(0);
  });

  test("from the Home Screen it asks like any other phone", async ({ page }) => {
    await permission(page, "default");
    await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true, configurable: true }));
    await page.goto("/app/settings");
    await expect(hint(page)).toHaveText(mk.t("settings.push.off"));
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
    expect(await asked(page)).toBe(1);
  });

  test("the iOS steps for a blocked permission name the Settings app", async ({ page }) => {
    await permission(page, "denied");
    await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true, configurable: true }));
    await page.goto("/app/settings");
    await toggle(page).click();
    await expect(dialog(page)).toContainText(mk.t("push.help.ios.1"));
    await expect(dialog(page)).toContainText(mk.t("push.help.ios.3"));
  });
});

test.describe("never asking cold", () => {
  test.use({ userAgent: ANDROID });

  test("no ask appears on any screen until something worth telling the student about has happened", async ({ page }) => {
    await permission(page, "default");
    for (const path of ["/app", "/app/notifications", "/app/profile", "/app/settings", "/app/practice", "/app/summary"]) {
      await page.goto(path);
      await page.waitForTimeout(1800);
      await expect(dialog(page), path).toHaveCount(0);
    }
    expect(await asked(page)).toBe(0);
  });

  // The fractions set with three answers in, so one question finishes it.
  const NEARLY_DONE = { signedIn: true, practiceAnswers: { "ps-session-math-1": { pf1: "1", pf2: "0", pf3: "true" } } };

  async function finishTheSet(page: Page) {
    await page.goto("/app/practice/ps-session-math-1");
    await page.locator(".n-input").fill("15");
    await page.locator(".n-input").press("Enter");
    await page.getByRole("button", { name: mk.t("pr.result") }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("4");
    await page.getByRole("button", { name: mk.t("close"), exact: true }).click();
  }

  test("after a finished practice set, on the screen the student comes back to, a soft ask with Not now", async ({ page }) => {
    await permission(page, "default");
    await start(page, { state: NEARLY_DONE });
    await finishTheSet(page);
    // The result is read first; the ask comes after a beat, over a calm screen.
    await expect(dialog(page)).toHaveCount(0);
    await expect(dialog(page)).toContainText(mk.t("push.ask.title"), { timeout: 5000 });
    await expect(dialog(page)).toContainText(mk.t("push.ask.body"));
    await expect(page.getByRole("button", { name: mk.t("push.ask.cta") })).toBeVisible();

    // Not now is a way out as easy to press as the yes: nothing is asked of the browser, and nothing comes back this week.
    await page.getByRole("button", { name: mk.t("push.ask.later") }).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(await asked(page)).toBe(0);
    await page.reload();
    await page.waitForTimeout(1800);
    await expect(dialog(page)).toHaveCount(0);
  });

  test("Turn on asks the browser, then Settings shows the switch on", async ({ page }) => {
    await permission(page, "default");
    await start(page, { state: NEARLY_DONE });
    await finishTheSet(page);
    await page.getByRole("button", { name: mk.t("push.ask.cta") }).click();
    await expect(said(page, mk.t("push.on"))).toBeAttached();
    expect(await asked(page)).toBe(1);
    await page.goto("/app/settings");
    await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  });

  test("a no from the browser ends it kindly, and the switch says it is blocked", async ({ page }) => {
    await permission(page, "default", "denied");
    await start(page, { state: NEARLY_DONE });
    await finishTheSet(page);
    await page.getByRole("button", { name: mk.t("push.ask.cta") }).click();
    await expect(said(page, mk.t("push.denied"))).toBeAttached();
    await page.goto("/app/settings");
    await expect(hint(page)).toHaveText(mk.t("settings.push.blocked"));
  });

  test("a phone that has already said no is not asked", async ({ page }) => {
    await permission(page, "denied");
    await start(page, { state: NEARLY_DONE });
    await finishTheSet(page);
    await page.waitForTimeout(2000);
    await expect(dialog(page)).toHaveCount(0);
  });

  test("a student who turned them off in Settings is not asked", async ({ page }) => {
    await permission(page, "granted");
    await start(page, { state: { ...NEARLY_DONE, notificationsOn: false } });
    await finishTheSet(page);
    await page.waitForTimeout(2000);
    await expect(dialog(page)).toHaveCount(0);
  });
});

test.describe("the ask on an iPhone", () => {
  test("says how to put the app on the Home Screen instead of asking the browser", async ({ page }) => {
    await permission(page, "default");
    await start(page, { state: { signedIn: true, practiceAnswers: { "ps-session-math-1": { pf1: "1", pf2: "0", pf3: "true" } } } });
    await page.goto("/app/practice/ps-session-math-1");
    await page.locator(".n-input").fill("15");
    await page.locator(".n-input").press("Enter");
    await page.getByRole("button", { name: mk.t("pr.result") }).click();
    await page.getByRole("button", { name: mk.t("close"), exact: true }).click();
    await expect(dialog(page)).toContainText(mk.t("push.ask.ios.body"), { timeout: 5000 });
    await expect(dialog(page)).toContainText(mk.t("install.ios.share"));
    await page.getByRole("button", { name: mk.t("install.ok") }).click();
    expect(await asked(page)).toBe(0);
  });
});

test.describe("the demo's test notification", () => {
  test.use({ userAgent: ANDROID, serviceWorkers: "allow" });

  // A headless browser has no notification centre to look into, so what the worker is asked to show is read at the door; what the worker
  // does with it (unit tests of public/app-sw.js) and how it looks on a phone are not this test's.
  test("hands the worker a push-shaped payload in the student's language, to show in a few seconds, and a tap's message opens its screen", async ({ page }) => {
    await permission(page, "granted");
    await page.addInitScript(() => {
      const send = ServiceWorker.prototype.postMessage;
      (window as unknown as { __posted: unknown[] }).__posted = [];
      ServiceWorker.prototype.postMessage = function (message: unknown, ...rest: never[]) {
        (window as unknown as { __posted: unknown[] }).__posted.push(JSON.parse(JSON.stringify(message)));
        return send.call(this, message, ...rest);
      };
    });
    await page.goto("/app/settings");
    // The worker has to be there before it can be asked for anything.
    await page.evaluate(async () => void (await navigator.serviceWorker.ready));

    await page.getByRole("button", { name: new RegExp(mk.t("settings.testPush")) }).click();
    await expect(said(page, mk.t("settings.testPushSent"))).toBeAttached();

    const posted = await page.evaluate(() => (window as unknown as { __posted: { type: string }[] }).__posted.filter((m) => m.type === "show-notification"));
    expect(posted).toEqual([
      {
        type: "show-notification",
        delayMs: 5000,
        payload: {
          v: 1,
          id: "n-practice-ps-session-math-1",
          kind: "practice_set_sent",
          locale: "mk",
          title: mk.t("notif.practice_set_sent.title", { subject: mk.t("subj.math") }),
          body: mk.t("notif.practice_set_sent.body"),
          payload: { course_id: "math", subject_id: "math", practice_set_id: "ps-session-math-1" },
        },
      },
    ]);

    // What the worker posts to the open page when the notification is tapped: the page goes there and reads the alert.
    await page.evaluate(() =>
      navigator.serviceWorker.dispatchEvent(
        new MessageEvent("message", { data: { type: "open-alert", id: "n-practice-ps-session-math-1", link: "/app/practice/ps-session-math-1" } }),
      ),
    );
    await expect(page).toHaveURL(/\/app\/practice\/ps-session-math-1$/);
  });

  test("in English the payload is English", async ({ page }) => {
    await permission(page, "granted");
    await start(page, { locale: "en" });
    await page.addInitScript(() => {
      const send = ServiceWorker.prototype.postMessage;
      (window as unknown as { __posted: unknown[] }).__posted = [];
      ServiceWorker.prototype.postMessage = function (message: unknown, ...rest: never[]) {
        (window as unknown as { __posted: unknown[] }).__posted.push(JSON.parse(JSON.stringify(message)));
        return send.call(this, message, ...rest);
      };
    });
    await page.goto("/app/settings");
    await page.evaluate(async () => void (await navigator.serviceWorker.ready));
    await page.getByRole("button", { name: /Send a test notification/ }).click();
    const [payload] = await page.evaluate(() => (window as unknown as { __posted: { type: string; payload: unknown }[] }).__posted.filter((m) => m.type === "show-notification").map((m) => m.payload));
    expect(payload).toMatchObject({ locale: "en", title: en.t("notif.practice_set_sent.title", { subject: en.t("subj.math") }) });
  });
});

test.describe("a tap on a notification while the app was closed", () => {
  test("opens its screen, marks the alert read and cleans the address", async ({ page }) => {
    await page.goto("/app/notifications");
    const tabs = page.getByRole("navigation", { name: mk.t("nav.main") });
    await expect(tabs).toContainText(mk.t("notif.unreadCount", { n: 3 }));

    await page.goto("/app/practice/ps-session-math-1?from_push=n-practice-ps-session-math-1");
    await expect(page).toHaveURL(/\/app\/practice\/ps-session-math-1$/);
    await page.goto("/app/notifications");
    await expect(tabs).toContainText(mk.t("notif.unreadCount", { n: 2 }));
  });

  test("a push that arrives while the app is open is read into the feed", async ({ page }) => {
    await page.goto("/app/notifications");
    await expect(page.locator(".item--unread")).toHaveCount(3);
    // The worker tells the page; nothing in the demo has changed, so the count stands, and nothing breaks.
    await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "push-received", id: "n-x" } })));
    await expect(page.locator(".item--unread")).toHaveCount(3);
  });
});

test.describe("when a lesson ends", () => {
  test.use({ userAgent: ANDROID });

  const OPTION = ".q-opt, .q-tf__btn";
  const stage = (page: Page) => page.locator("main.q").getAttribute("data-stage");

  /** Play the scripted maths lesson to its ending on a controlled clock (the lesson paces itself on real timers for three minutes). */
  async function playLesson(page: Page) {
    await page.clock.install();
    await page.goto("/app/checkin/MATH-7B");
    const ended = page.getByRole("heading", { name: mk.q("q.ended.title") });
    for (let i = 0; i < 400 && !(await ended.isVisible()); i++) {
      const s = await stage(page).catch(() => null);
      if (s === "answering") {
        const number = page.locator(".n-input");
        if (await number.isVisible()) {
          await number.fill("3,25");
          await number.press("Enter");
        } else await page.locator(OPTION).first().click();
      }
      await page.clock.fastForward(1_500);
      await page.waitForTimeout(40);
    }
    await expect(ended).toBeVisible();
  }

  test("the alerts for its result and its practice set arrive, and the soft ask follows on the screen the student goes to", async ({ page }) => {
    await permission(page, "default");
    await playLesson(page);
    await page.getByRole("button", { name: mk.q("q.home") }).click();
    await expect(page).toHaveURL(/\/app$/);

    // The result and the practice set the teacher sent after it: two more than the three the demo starts with.
    const tabs = page.getByRole("navigation", { name: mk.t("nav.main") });
    await expect(tabs).toContainText(mk.t("notif.unreadCount", { n: 5 }));

    // The ask waits a beat after the student lands, so the Home screen is seen first.
    await expect(dialog(page)).toHaveCount(0);
    await page.clock.fastForward(1_500);
    await expect(dialog(page)).toContainText(mk.t("push.ask.title"));
    await page.getByRole("button", { name: mk.t("push.ask.later") }).click();

    await page.getByRole("link", { name: mk.t("nav.alerts") }).click();
    await expect(page.getByRole("link", { name: new RegExp(mk.t("notif.result_ready.title", { subject: mk.t("subj.math") })) }).first()).toBeVisible();
    await expect(page.locator(".item--unread")).toHaveCount(5);
    expect(await asked(page)).toBe(0);
  });
});
