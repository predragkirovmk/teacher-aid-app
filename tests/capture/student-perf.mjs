// How the student app behaves on a slow phone: long tasks and dropped frames while a student does things.
//
//   node tests/capture/student-perf.mjs <app-url> [--out=<file.json>]
//
// The CPU is slowed 4x through DevTools. Each scenario runs in its own phone, and only the part of it that is the
// interaction is measured: getting to the start (a lobby, a clock moved on) is not. It measures; it does not judge, and it
// always exits 0, so the numbers can be read by whoever is deciding.
// The page's own clock is Playwright's fake one in the quiz, so the frame recorder takes the real rAF and performance.now
// before the fake is installed (the init script below must be added first), and a jump of the fake clock shows as the work it is.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--"));
const outFile = args.find((a) => a.startsWith("--out="))?.slice(6);
if (!base) {
  console.error("usage: node tests/capture/student-perf.mjs <app-url> [--out=<file.json>]");
  process.exit(2);
}
const NOTICE_VERSION = /NOTICE_VERSION = "([^"]+)"/.exec(readFileSync(new URL("../../lib/app/privacy.ts", import.meta.url), "utf8"))[1];
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const OPTION = ".q-opt, .q-tf__btn";

/** A fresh phone with the recorders installed, signed in, CPU 4x slower. */
async function phone({ clock = false, state = {} } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "mk-MK",
    timezoneId: "Europe/Skopje",
    serviceWorkers: "block",
  });
  await context.addInitScript(
    ({ state, noticeVersion }) => {
      if (!sessionStorage.getItem("__perf_seeded")) {
        sessionStorage.setItem("__perf_seeded", "1");
        localStorage.clear();
        localStorage.setItem("teacheraid-app-v1", JSON.stringify({ signedIn: true, noticeVersion, noticeAt: Date.now(), ...state }));
        localStorage.setItem("teacheraid-locale", "mk");
      }
      const now = performance.now.bind(performance);
      const raf = window.requestAnimationFrame.bind(window);
      const p = { long: [], frames: [], now };
      window.__perf = p;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) p.long.push({ start: e.startTime, ms: e.duration });
      }).observe({ type: "longtask", buffered: true });
      let last = now();
      const loop = () => {
        const t = now();
        p.frames.push({ t, gap: t - last });
        last = t;
        raf(loop);
      };
      raf(loop);
    },
    { state, noticeVersion: NOTICE_VERSION },
  );
  if (clock) await context.clock.install({ time: Date.parse("2026-10-29T09:30:05+01:00") });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  return { context, page };
}

const mark = (page) => page.evaluate(() => (window.__perf.mark = window.__perf.now()));
async function report(page) {
  return page.evaluate(() => {
    const p = window.__perf;
    const end = p.now();
    const long = p.long.filter((e) => e.start >= p.mark && e.start <= end);
    const frames = p.frames.filter((f) => f.t >= p.mark && f.t <= end);
    return {
      windowMs: Math.round(end - p.mark),
      longTasks: long.length,
      longestMs: Math.round(Math.max(0, ...long.map((e) => e.ms))),
      framesOver50: frames.filter((f) => f.gap > 50).length,
      worstGapMs: Math.round(Math.max(0, ...frames.map((f) => f.gap))),
    };
  });
}

const tick = async (page, ms) => {
  await page.clock.fastForward(ms);
  await page.waitForTimeout(20);
};
const stageOf = (page) => page.locator("main.q").getAttribute("data-stage", { timeout: 500 }).catch(() => null);
async function untilStage(page, stage, step = 250) {
  for (let i = 0; i < 2400 && (await stageOf(page)) !== stage; i++) await tick(page, step);
  if ((await stageOf(page)) !== stage) throw new Error(`never reached ${stage}`);
}
async function join(page, code) {
  await page.goto(`${base}/app/checkin/${code}`);
  await page.locator("main.q").waitFor();
}

/** A press and a release away from the target: the press feedback shows and nothing is opened. */
async function press(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("nothing to press");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(220);
  await page.mouse.move(2, 400, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}
async function swipe(page, from, to) {
  await page.mouse.move(from, 420);
  await page.mouse.down();
  await page.mouse.move(to, 424, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(900);
}

const scenarios = [
  ["home-press-feedback", {}, async (page, m) => {
    await page.goto(`${base}/app`);
    await page.locator("main.screen:not([data-pending])").waitFor();
    await page.waitForTimeout(1500);
    await m();
    for (const sel of [".card.tile >> nth=0", ".card.tile >> nth=1", ".item >> nth=0", "button.btn >> nth=0"]) {
      const target = page.locator(sel.split(" >> ")[0]).nth(Number(sel.split("nth=")[1] ?? 0));
      if (await target.count()) await press(page, target);
    }
  }],
  ["tabs-tap", {}, async (page, m) => {
    await page.goto(`${base}/app`);
    await page.locator("main.screen:not([data-pending])").waitFor();
    await page.waitForTimeout(1500);
    const tabs = page.getByRole("navigation", { name: "Делови" });
    await m();
    for (const href of ["/app/notifications", "/app/profile", "/app"]) {
      await tabs.locator(`a[href="${href}"]`).click();
      await page.waitForURL(`**${href}`);
      await page.waitForTimeout(700);
    }
  }],
  ["tabs-swipe-pager", {}, async (page, m) => {
    await page.goto(`${base}/app`);
    await page.locator("main.screen:not([data-pending])").waitFor();
    await page.waitForTimeout(1500);
    await m();
    await swipe(page, 330, 60);
    await swipe(page, 330, 60);
    await swipe(page, 60, 330);
    await swipe(page, 60, 330);
  }],
  ["subject-open-and-back", {}, async (page, m) => {
    await page.goto(`${base}/app`);
    await page.locator("main.screen:not([data-pending])").waitFor();
    await page.waitForTimeout(1500);
    await m();
    await page.locator('a[href^="/app/subject/"]').first().click();
    await page.waitForURL(/\/app\/subject\//);
    await page.waitForTimeout(900);
    await page.goBack();
    await page.waitForURL(/\/app$/);
    await page.waitForTimeout(900);
  }],
  ["sheet-open-close", {}, async (page, m) => {
    await page.goto(`${base}/app/settings`);
    await page.getByRole("button", { name: /Јазик/ }).first().waitFor();
    await page.waitForTimeout(1000);
    await m();
    await page.getByRole("button", { name: /Јазик/ }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(700);
    await page.keyboard.press("Escape");
    if (await page.getByRole("dialog").count()) await page.mouse.click(195, 60);
    await page.waitForTimeout(700);
  }],
  ["quiz-question-open-verdict-between", { clock: true }, async (page, m) => {
    await join(page, "MATH-7B");
    await untilStage(page, "waiting_start");
    await m();
    await untilStage(page, "answering");
    await page.locator(OPTION).nth(1).click();
    await untilStage(page, "waiting_others");
    for (let i = 0; i < 80 && !["right", "wrong"].includes(await stageOf(page)); i++) await tick(page, 250);
    await untilStage(page, "waiting_next");
    await page.waitForTimeout(500);
  }],
  ["practice-answer-and-check", {}, async (page, m) => {
    await page.goto(`${base}/app/practice/ps-session-math-1`);
    await page.locator(".q-opt").first().waitFor();
    await page.waitForTimeout(1000);
    await m();
    await page.locator(".q-opt").nth(1).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Провери" }).click();
    await page.getByRole("status").filter({ hasText: "Точен одговор" }).waitFor();
    await page.waitForTimeout(900);
  }],
  ["quiz-ended-screen", { clock: true }, async (page, m) => {
    await join(page, "MATH-7B");
    // The whole lesson runs unmeasured; the window is the last step into the ending and the moment after.
    for (let i = 0; i < 400 && (await stageOf(page)) !== "ended"; i++) {
      if ((await stageOf(page)) === "answering") {
        const number = page.locator(".n-input");
        if (await number.isVisible()) {
          await number.fill("3,25");
          await number.press("Enter");
        } else await page.locator(OPTION).first().click();
      }
      await m();
      await tick(page, 1000);
    }
    await untilStage(page, "ended");
    await page.waitForTimeout(1500);
  }],
];

const results = [];
for (const [name, opts, run] of scenarios) {
  let session;
  try {
    session = await phone(opts);
    await run(session.page, () => mark(session.page));
    results.push({ scenario: name, ...(await report(session.page)) });
  } catch (e) {
    results.push({ scenario: name, error: String(e).split("\n")[0] });
  } finally {
    await session?.context.close().catch(() => {});
  }
}

const cols = ["scenario", "windowMs", "longTasks", "longestMs", "framesOver50", "worstGapMs"];
const width = (c) => Math.max(c.length, ...results.map((r) => String(r[c] ?? "").length));
const line = (r) => cols.map((c) => String(r[c] ?? "").padEnd(width(c))).join("  ");
console.log(line(Object.fromEntries(cols.map((c) => [c, c]))));
for (const r of results) console.log(r.error ? `${r.scenario}  ERROR ${r.error}` : line(r));
if (outFile) writeFileSync(outFile, JSON.stringify({ cpuThrottle: 4, results }, null, 2));
await browser.close();
process.exit(0);
