// Pictures of every student-app screen and state, to look at before and after a change.
//
//   node tests/capture/student-screens.mjs <app-url> <out-dir> [--reduced] [--scale=2]
//
// e.g. NEXT_PUBLIC_E2E=1 pnpm exec next start -p 3110 &
//      node tests/capture/student-screens.mjs http://localhost:3110 /tmp/before
//      node tests/capture/student-screens.mjs http://localhost:3110 /tmp/after --reduced
//
// Writes NN-screen-state.png in flow order, inventory.json (how each state was reached and which component draws it) and
// js-size.json (every same-origin script the browser loaded, raw and gzip, since `next build` no longer prints sizes).
// Every state gets its own browser context, so none leaks into the next. The date is fixed so two runs show the same
// day; the quiz runs on a paused clock that is moved by hand, so its countdown reads the same in every run.
// A state that cannot be reached is logged as SKIP, one that fails as FAILED, and the rest still run.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const [base, out] = args.filter((a) => !a.startsWith("--"));
if (!base || !out) {
  console.error("usage: node tests/capture/student-screens.mjs <app-url> <out-dir> [--reduced] [--scale=2]");
  process.exit(2);
}
const reduced = flags.includes("--reduced");
const scale = Number(flags.find((f) => f.startsWith("--scale="))?.slice(8) ?? 2);
mkdirSync(out, { recursive: true });

const STORE_KEY = "teacheraid-app-v1";
const LOCALE_KEY = "teacheraid-locale";
// Read from the app, so a new notice version does not turn every picture into the notice screen.
const NOTICE_VERSION = /NOTICE_VERSION = "([^"]+)"/.exec(readFileSync(new URL("../../lib/app/privacy.ts", import.meta.url), "utf8"))[1];
// A Thursday morning: the date on Home is the same in every run.
const T0 = Date.parse("2026-10-29T09:30:05+01:00");
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

// ---- JS size ------------------------------------------------------------------------------------------------------------
const scripts = new Map(); // url -> { raw, gzip }, over the whole run
const measure = (into) => (response) => {
  const url = response.url();
  if (!url.startsWith(base) || response.request().resourceType() !== "script") return;
  into.push(
    response.body().then(
      (body) => ({ url: url.slice(base.length), raw: body.length, gzip: gzipSync(body, { level: 9 }).length }),
      () => null,
    ),
  );
};
const collect = async (pending, into) => {
  for (const s of await Promise.all(pending)) if (s && !into.has(s.url)) into.set(s.url, s);
};
const totals = (map) => {
  const files = [...map.values()].sort((a, b) => b.gzip - a.gzip);
  return { files, count: files.length, raw: files.reduce((n, f) => n + f.raw, 0), gzip: files.reduce((n, f) => n + f.gzip, 0) };
};

// ---- Contexts -----------------------------------------------------------------------------------------------------------
/**
 * A fresh phone. `state` is merged into the demo's saved data (a student signed in who has seen the notice, unless it says
 * otherwise); `clock: "paused"` is for the quiz, which is moved by hand with `tick`.
 */
async function phone({ state = {}, locale = "mk", clock = "fixed", js = true, init, userAgent } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: scale,
    isMobile: true,
    hasTouch: true,
    locale: "mk-MK",
    timezoneId: "Europe/Skopje",
    serviceWorkers: "block",
    javaScriptEnabled: js,
    reducedMotion: reduced ? "reduce" : "no-preference",
    ...(userAgent ? { userAgent } : {}),
  });
  const pending = [];
  context.on("response", measure(pending));
  if (js) {
    // Init scripts run on every navigation; the seed acts once, so a reload or a second page keeps what the app saved.
    await context.addInitScript(
      ({ state, locale, storeKey, localeKey, noticeVersion }) => {
        if (sessionStorage.getItem("__capture_seeded")) return;
        sessionStorage.setItem("__capture_seeded", "1");
        localStorage.clear();
        localStorage.setItem(storeKey, JSON.stringify({ signedIn: true, noticeVersion, noticeAt: Date.now(), ...state }));
        localStorage.setItem(localeKey, locale);
      },
      { state, locale, storeKey: STORE_KEY, localeKey: LOCALE_KEY, noticeVersion: NOTICE_VERSION },
    );
    if (init) await context.addInitScript(init);
  }
  if (clock === "paused") {
    await context.clock.install({ time: T0 });
    await context.clock.pauseAt(T0 + 1000);
  } else await context.clock.setFixedTime(T0);
  const page = await context.newPage();
  return { context, page, pending };
}

/** Let the screen come to rest, so a before and an after picture of one state can be compared. */
async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => undefined)).catch(() => {});
  // Animations that end. The wait is on this side: a page timer would never fire on a paused clock. Infinite ones (spinner, ring) are left running.
  const ending = page
    .evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => null)),
      ),
    )
    .catch(() => {});
  await Promise.race([ending, new Promise((r) => setTimeout(r, 4000))]);
  await page.waitForTimeout(200);
}

// ---- The quiz, on a clock that only moves when asked ---------------------------------------------------------------------
const OPTION = ".q-opt, .q-tf__btn";
const stageOf = (page) => page.locator("main.q").getAttribute("data-stage", { timeout: 500 }).catch(() => null);
async function tick(page, ms) {
  await page.clock.runFor(ms);
  await page.waitForTimeout(20);
}
async function until(page, test, what, step = 250) {
  for (let i = 0; i < 2400; i++) {
    if (await test()) return;
    await tick(page, step);
  }
  throw new Error(`never reached ${what}`);
}
const untilStage = (page, stage) => until(page, async () => (await stageOf(page)) === stage, `stage ${stage}`);
async function openQuiz(page, code) {
  await page.goto(`${base}/app/checkin/${code}`);
  await until(page, () => page.locator("main.q").count().then((n) => n > 0), "the quiz", 100);
}
/** Answer and run on to the question's verdict. `index` 1 is the right option of the first maths question. */
async function answerFirst(page, index) {
  await untilStage(page, "answering");
  await page.locator(OPTION).nth(index).click();
  await tick(page, 100);
}

// ---- The states ---------------------------------------------------------------------------------------------------------
const states = [];
/** run(page, { context }) gets the screen to the state; the shot is taken after. `phone` options go in `opts`. */
const add = (name, route, how, renderedBy, run, opts = {}) => states.push({ name, route, how, renderedBy, run, opts });
const skip = (name, route, renderedBy, reason) => states.push({ name, route, how: "", renderedBy, skipped: reason });
const go = (path) => async (page) => {
  await page.goto(base + path);
};
const APP = "app/(app)/app";
const C = "components/app";
const SIGNED_OUT = { signedIn: false };

add("01-splash", "/app", "javaScriptEnabled false, so only the server-rendered launch picture exists", `${C}/SessionScreens.tsx (Splash)`, go("/app"), { js: false });
add("02-welcome", "/app/welcome", "signed out, notice already seen", `${APP}/welcome/page.tsx, ${C}/SignIn.tsx`, go("/app/welcome"), { state: SIGNED_OUT });
add("03-welcome-provider-sheet", "/app/welcome", "press Continue with Google; the demo provider page opens as a sheet", `${C}/DemoProviderSheet.tsx`, async (page) => {
  await page.goto(`${base}/app/welcome`);
  await page.getByRole("button", { name: /Google/ }).click();
  await page.getByRole("dialog").waitFor();
}, { state: SIGNED_OUT });
add("04-welcome-error", "/app/welcome?error=sign_in_failed", "the provider sent the browser back with an error", `${APP}/welcome/page.tsx, ${C}/SignIn.tsx`, go("/app/welcome?error=sign_in_failed"), { state: SIGNED_OUT });
add("05-notice-first", "/app", "signed in, noticeVersion null", `${C}/NoticeScreen.tsx`, go("/app"), { state: { noticeVersion: null } });
add("06-notice-updated", "/app", "signed in, an older noticeVersion", `${C}/NoticeScreen.tsx`, go("/app"), { state: { noticeVersion: "2026-01-01" } });
add("07-home", "/app", "signed in", `${APP}/page.tsx`, go("/app"));
add("08-home-clock-sheet", "/app", "demo clock set to midday so the pill shows; press it", `${C}/ClockOptions.tsx via ${C}/Shell.tsx`, async (page) => {
  await page.goto(`${base}/app`);
  await page.locator("button.pill").click();
  await page.getByRole("dialog").waitFor();
}, { state: { clock: "midday" } });
add("09-subjects", "/app/subjects", "signed in", `${APP}/subjects/page.tsx`, go("/app/subjects"));
add("10-subject-detail", "/app/subject/math", "signed in", `${APP}/subject/[id]/page.tsx`, go("/app/subject/math"));
add("11-schedule", "/app/schedule", "signed in", `${APP}/schedule/page.tsx`, go("/app/schedule"));
add("12-attendance", "/app/attendance", "signed in", `${APP}/attendance/page.tsx`, go("/app/attendance"));
add("13-achievements", "/app/achievements", "signed in", `${APP}/achievements/page.tsx`, go("/app/achievements"));
add("14-leaderboard", "/app/leaderboard", "signed in", `${APP}/leaderboard/page.tsx`, go("/app/leaderboard"));
add("15-summary-list", "/app/summary", "signed in", `${APP}/summary/page.tsx`, go("/app/summary"));
add("16-summary-detail", "/app/summary/mock-session-math", "signed in; the maths lesson the demo starts with", `${APP}/summary/[id]/page.tsx, ${C}/Summary.tsx`, go("/app/summary/mock-session-math"));
add("17-scan", "/app/scan", "camera intro, shown before the camera is asked for", `${APP}/scan/page.tsx`, go("/app/scan"));
add("18-qr-kit", "/app/qr-kit", "signed in", `${APP}/qr-kit/page.tsx`, go("/app/qr-kit"));
add("19-quiz-connecting", "/app/checkin/MATH-7B", "clock paused right after the page opens, before any timer ran; the earliest stage a shot can catch is joined, because syncing ends in one microtask", `${C}/quiz/Play.tsx`, async (page) => {
  await page.goto(`${base}/app/checkin/MATH-7B`);
  await page.locator("main.q").waitFor();
  if (!["syncing", "joined"].includes(await stageOf(page))) throw new Error(`stage was ${await stageOf(page)}`);
}, { clock: "paused", reachable: "maybe" });
add("20-quiz-lobby", "/app/play/MATH-7B", "join MATH-7B, clock moved to waiting_start", `${C}/quiz/Play.tsx`, async (page) => {
  await openQuiz(page, "MATH-7B");
  await untilStage(page, "waiting_start");
}, { clock: "paused" });
add("21-quiz-question-choice", "/app/play/MATH-7B", "clock moved to the first question (multiple choice)", `${C}/quiz/Play.tsx, ${C}/quiz/choices.tsx`, async (page) => {
  await openQuiz(page, "MATH-7B");
  await untilStage(page, "answering");
}, { clock: "paused" });
add("22-quiz-question-picked", "/app/play/MATH-7B", "first question, the right option picked, waiting for the class", `${C}/quiz/Play.tsx`, async (page) => {
  await openQuiz(page, "MATH-7B");
  await answerFirst(page, 1);
  await untilStage(page, "waiting_others");
}, { clock: "paused" });
add("23-quiz-right", "/app/play/MATH-7B", "first question, the right option, clock moved to the verdict", `${C}/quiz/Play.tsx`, async (page) => {
  await openQuiz(page, "MATH-7B");
  await answerFirst(page, 1);
  await untilStage(page, "right");
}, { clock: "paused" });
add("24-quiz-wrong", "/app/play/MATH-7B", "first question, a wrong option, clock moved to the verdict", `${C}/quiz/Play.tsx`, async (page) => {
  await openQuiz(page, "MATH-7B");
  await answerFirst(page, 0);
  await untilStage(page, "wrong");
}, { clock: "paused" });
add("25-quiz-between", "/app/play/MATH-7B", "first question answered, clock moved to the pause before the next", `${C}/quiz/Play.tsx`, async (page) => {
  await openQuiz(page, "MATH-7B");
  await answerFirst(page, 1);
  await untilStage(page, "waiting_next");
}, { clock: "paused" });
add("26-quiz-ended", "/app/play/MATH-7B", "every question answered, clock moved to the ending", `${C}/quiz/Play.tsx, ${C}/Results.tsx`, async (page) => {
  await openQuiz(page, "MATH-7B");
  for (let i = 0; i < 400 && (await stageOf(page)) !== "ended"; i++) {
    if ((await stageOf(page)) === "answering") {
      const number = page.locator(".n-input");
      if (await number.isVisible()) {
        await number.fill("3,25");
        await number.press("Enter");
      } else await page.locator(OPTION).first().click();
    }
    await tick(page, 1000);
  }
  await untilStage(page, "ended");
}, { clock: "paused" });
add("27-quiz-true-false", "/app/play/MATH-7B", "second question of the lesson (true or false)", `${C}/quiz/Play.tsx, ${C}/quiz/choices.tsx`, async (page) => {
  await openQuiz(page, "MATH-7B");
  await answerFirst(page, 1);
  await untilStage(page, "waiting_next");
  await untilStage(page, "answering");
}, { clock: "paused" });
add("28-quiz-numeric", "/app/play/NUMERIC-7B", "NUMERIC-7B, clock moved to the question", `${C}/quiz/Numeric.tsx`, async (page) => {
  await openQuiz(page, "NUMERIC-7B");
  await untilStage(page, "answering");
}, { clock: "paused" });
add("29-quiz-ask-sheet", "/app/play/ASK-7B", "ASK-7B lobby, press Ask your teacher", `${C}/quiz/Ask.tsx`, async (page) => {
  await openQuiz(page, "ASK-7B");
  await untilStage(page, "waiting_start");
  await page.getByRole("button", { name: "Прашај го наставникот" }).click();
  await page.getByRole("dialog").waitFor();
  await tick(page, 400);
}, { clock: "paused" });
add("30-quiz-focus-notice", "/app/play/FOCUS-7B", "FOCUS-7B lobby, where the fair-play note is shown once", `${C}/quiz/Play.tsx`, async (page) => {
  await openQuiz(page, "FOCUS-7B");
  await untilStage(page, "waiting_start");
}, { clock: "paused" });
add("31-quiz-late", "/app/play/LATE-7B", "LATE-7B, joined a lesson in progress", `${C}/quiz/Play.tsx`, async (page) => {
  await openQuiz(page, "LATE-7B");
  await tick(page, 2000);
}, { clock: "paused" });
add("32-quiz-connection-lost", "/app/play/FLAKY-7B", "FLAKY-7B, clock moved until the link drops during the first question", `${C}/ConnectionPill.tsx`, async (page) => {
  await openQuiz(page, "FLAKY-7B");
  await until(page, () => page.getByText("Се поврзуваме повторно").isVisible(), "the reconnecting strip");
}, { clock: "paused" });
for (const [n, kind, code, title] of [
  ["33", "expired", "EXPIRED-7B", "the code has expired"],
  ["34", "class", "OTHER-8A", "another class's code"],
  ["35", "ended", "ENDED-7B", "the lesson is over"],
  ["36", "unknown", "NOPE-9", "a code nobody issued"],
  ["37", "offline", "OFFLINE-7B", "no connection the first time"],
])
  add(`${n}-join-${kind}`, `/app/checkin/${code}`, `${code}: ${title}`, `${C}/quiz/JoinFailure.tsx`, async (page) => {
    await page.goto(`${base}/app/checkin/${code}`);
    await page.locator(`main.q[data-failure="${kind}"]`).waitFor();
  });
add("38-practice-list", "/app/practice", "signed in", `${APP}/practice/page.tsx, ${C}/practice/PracticeRows.tsx`, go("/app/practice"));
const SET = "/app/practice/ps-session-math-1";
const check = (page) => page.getByRole("button", { name: "Провери" }).click();
add("39-practice-question", SET, "first question of the set, nothing picked", `${APP}/practice/[id]/page.tsx, ${C}/practice/Player.tsx`, go(SET));
add("40-practice-right", SET, "first question, the right option (second), Check", `${C}/practice/Player.tsx`, async (page) => {
  await page.goto(base + SET);
  await page.locator(".q-opt").nth(1).click();
  await check(page);
  await page.getByRole("status").filter({ hasText: "Точен одговор" }).waitFor();
});
add("41-practice-wrong", SET, "first question, a wrong option (first), Check", `${C}/practice/Player.tsx`, async (page) => {
  await page.goto(base + SET);
  await page.locator(".q-opt").nth(0).click();
  await check(page);
  await page.locator(".q-opt[data-state=miss]").waitFor();
});
add("42-practice-done", SET, "three answers seeded, the last one typed, then See your result", `${C}/practice/Player.tsx`, async (page) => {
  await page.goto(base + SET);
  await page.locator(".n-input").fill("15");
  await page.locator(".n-input").press("Enter");
  await page.getByRole("button", { name: "Види го резултатот" }).click();
  await page.getByRole("region", { name: /./ }).first().waitFor();
}, { state: { practiceAnswers: { "ps-session-math-1": { pf1: "1", pf2: "0", pf3: "true" } } } });
add("43-practice-missing", "/app/practice/ps-nothing", "a set that does not exist", `${C}/practice/Player.tsx`, go("/app/practice/ps-nothing"));
add("44-notifications", "/app/notifications", "signed in", `${APP}/notifications/page.tsx`, go("/app/notifications"));
add("45-notification-detail", "/app/notifications/n-math", "signed in", `${APP}/notifications/[id]/page.tsx`, go("/app/notifications/n-math"));
add("46-profile", "/app/profile", "signed in", `${APP}/profile/page.tsx`, go("/app/profile"));
add("47-profile-editor", "/app/profile", "press Edit", `${C}/ProfileEditor.tsx`, async (page) => {
  await page.goto(`${base}/app/profile`);
  await page.getByRole("button", { name: "Уреди", exact: true }).click();
  await page.getByRole("textbox").first().waitFor();
});
add("48-settings", "/app/settings", "signed in", `${APP}/settings/page.tsx`, go("/app/settings"));
add("49-settings-push-sheet", "/app/settings", "browser permission denied (played by a stub), press How to turn them back on", `${C}/PushSheets.tsx`, async (page) => {
  await page.goto(`${base}/app/settings`);
  await page.getByRole("button", { name: /Како да ги вклучиш повторно/ }).click();
  await page.getByRole("dialog").waitFor();
}, {
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  init: () => Object.defineProperty(Notification, "permission", { get: () => "denied", configurable: true }),
});
add("50-data", "/app/data", "signed in", `${APP}/data/page.tsx`, go("/app/data"));
add("51-documents", "/app/documents", "signed in", `${APP}/documents/page.tsx`, go("/app/documents"));
add("52-faq", "/app/faq", "signed in", `${APP}/faq/page.tsx`, go("/app/faq"));
add("53-privacy", "/app/privacy", "signed in", `${APP}/privacy/page.tsx`, go("/app/privacy"));
add("54-terms", "/app/terms", "signed in", `${APP}/terms/page.tsx`, go("/app/terms"));
add("55-signed-elsewhere", "/app/attendance", "state endedElsewhere with signedIn false (the demo's stand-in for another phone)", `${C}/SessionScreens.tsx (SignedElsewhere)`, go("/app/attendance"), { state: { signedIn: false, endedElsewhere: true } });
skip("56-unreachable", "/app", `${C}/SessionScreens.tsx (Unreachable)`, "the mock's getMe only fails with unauthenticated or signed_in_elsewhere; no setting, code or offline switch makes it throw a network or server error");
add("57-offline-pill", "/app", "Home loaded, then the browser goes offline", `${C}/ConnectionPill.tsx`, async (page, { context }) => {
  await page.goto(`${base}/app`);
  await page.waitForLoadState("networkidle");
  await context.setOffline(true);
  await page.locator(".net-pill").waitFor();
});
add("58-not-found", "/app/does-not-exist", "an address the app has no screen for", `${APP}/not-found.tsx, ${APP}/[...rest]/page.tsx`, go("/app/does-not-exist"));
add("59-toast", "/app/profile", "edit the name and save; the toast says it is saved", `${C}/Shell.tsx (toast)`, async (page) => {
  await page.goto(`${base}/app/profile`);
  await page.getByRole("button", { name: "Уреди", exact: true }).click();
  await page.getByRole("textbox").first().fill("Мики Т");
  await page.getByRole("button", { name: "Зачувај" }).click();
  await page.locator(".toast").waitFor();
});
// Found beyond the list: states the app has that it did not name.
add("60-settings-language-sheet", "/app/settings", "press Language", `${C}/Shell.tsx (LangOptions)`, async (page) => {
  await page.goto(`${base}/app/settings`);
  await page.getByRole("button", { name: /Јазик/ }).first().click();
  await page.getByRole("dialog").waitFor();
});
add("61-profile-logout-confirm", "/app/profile", "press Log out; the confirm sheet", `${C}/Shell.tsx (confirm sheet)`, async (page) => {
  await page.goto(`${base}/app/profile`);
  await page.getByRole("main").getByRole("button", { name: "Одјави се" }).click();
  await page.getByRole("dialog").waitFor();
});
add("62-quiz-leave-confirm", "/app/play/MATH-7B", "press Leave the quiz in the lobby", `${C}/quiz/Play.tsx`, async (page) => {
  await openQuiz(page, "MATH-7B");
  await untilStage(page, "waiting_start");
  await page.getByRole("button", { name: "Напушти го квизот" }).click();
  await page.getByRole("dialog").waitFor();
  await tick(page, 400);
}, { clock: "paused" });
add("63-settings-install-sheet", "/app/settings", "an iPhone in Safari presses the notifications switch: it must be on the Home Screen first", `${C}/Shell.tsx (install sheet)`, async (page) => {
  await page.goto(`${base}/app/settings`);
  await page.getByRole("switch").first().click();
  await page.getByRole("dialog").waitFor();
}, { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
add("64-quiz-answer-saved", "/app/play/OFFLINE-ANSWER-7B", "OFFLINE-ANSWER-7B, answer sent while the network drops: saved, will be sent", `${C}/ConnectionPill.tsx`, async (page) => {
  await openQuiz(page, "OFFLINE-ANSWER-7B");
  await answerFirst(page, 1);
  await until(page, () => page.getByText("Зачувано").first().isVisible(), "the saved note");
}, { clock: "paused" });
add("65-quiz-ask-sent", "/app/play/ASK-7B", "a question typed and sent from the sheet", `${C}/quiz/Ask.tsx`, async (page) => {
  await openQuiz(page, "ASK-7B");
  await untilStage(page, "waiting_start");
  await page.getByRole("button", { name: "Прашај го наставникот" }).click();
  const box = page.getByRole("dialog").getByRole("textbox");
  await box.fill("Може ли да го објасниш повторно?");
  await box.press("Enter");
  await tick(page, 800);
  await page.getByRole("dialog").getByRole("heading").waitFor();
}, { clock: "paused" });
add("66-scan-no-camera", "/app/scan", "camera intro already seen; this browser has no camera", `${APP}/scan/page.tsx`, go("/app/scan"), { init: () => localStorage.setItem("teacheraid-camera-intro", "1") });

// ---- Run ----------------------------------------------------------------------------------------------------------------
const inventory = [];
for (const s of states) {
  const file = `${s.name}.png`;
  const entry = { file, route: s.route, how: s.how, renderedBy: s.renderedBy };
  inventory.push(entry);
  if (s.skipped) {
    entry.skipped = s.skipped;
    console.log(`SKIP ${s.name}: ${s.skipped}`);
    continue;
  }
  let session;
  try {
    session = await phone(s.opts);
    const { page, context } = session;
    await s.run(page, { context });
    await settle(page);
    await page.screenshot({ path: `${out}/${file}` });
    console.log("captured", s.name);
  } catch (e) {
    entry.skipped = `FAILED: ${String(e).split("\n")[0]}`;
    console.log(`SKIP ${s.name}: ${entry.skipped}`);
  } finally {
    if (session) {
      await collect(session.pending, scripts).catch(() => {});
      await session.context.close().catch(() => {});
    }
  }
}

// Home alone, first load: what a student downloads to open the app.
const home = await phone();
await home.page.goto(`${base}/app`);
await home.page.locator("main.screen").waitFor();
await home.page.waitForLoadState("networkidle");
const homeScripts = new Map();
await collect(home.pending, homeScripts);
await home.context.close();

writeFileSync(`${out}/inventory.json`, JSON.stringify(inventory, null, 2));
const all = totals(scripts);
const first = totals(homeScripts);
writeFileSync(
  `${out}/js-size.json`,
  JSON.stringify({ allScreens: { count: all.count, raw: all.raw, gzip: all.gzip }, homeFirstLoad: { count: first.count, raw: first.raw, gzip: first.gzip }, allScreensFiles: all.files, homeFirstLoadFiles: first.files }, null, 2),
);
console.log(`js: all screens ${all.count} files, ${all.raw} raw, ${all.gzip} gzip; Home first load ${first.count} files, ${first.raw} raw, ${first.gzip} gzip`);
await browser.close();
