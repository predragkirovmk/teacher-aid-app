// Pictures of the teacher app's screens, to look at before and after a change.
//
//   node scripts/teacher-capture.mjs <app-url> <out-dir> [width] [height] [scale]
//
// e.g. node scripts/teacher-capture.mjs http://localhost:3100 /tmp/before 1440 900
//      node scripts/teacher-capture.mjs http://localhost:3100 /tmp/phone 390 844
//
// The demo teacher with a full season is signed in, the clock is fixed so two runs show the same day,
// and each screen is captured twice: `<name>-fold.png` (what the window shows) and `<name>-full.png`
// (the whole page). It walks the main screens, a lesson being started and the live console with a
// question open. Run it on the old build, make the change, rebuild, run it again, and compare.
// A step that fails is reported and the rest still run. Use scale 2 for pictures people will see.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const [base, out, w = "1440", h = "900", scale = "1"] = process.argv.slice(2);
if (!base || !out) {
  console.error("usage: node scripts/teacher-capture.mjs <app-url> <out-dir> [width] [height] [scale]");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const SESSION_KEY = "teacheraid-teacher-session-v1";
const T0 = Date.parse("2026-10-29T09:30:05+01:00");
// A cloud container has its browser here; elsewhere Playwright finds its own.
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: Number(scale),
  timezoneId: "Europe/Skopje",
  locale: "mk-MK",
  serviceWorkers: "block",
});
await context.addInitScript(([key]) => {
  if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ persona: "veteran" }));
}, [SESSION_KEY]);
await context.clock.setFixedTime(T0);
const page = await context.newPage();

async function settle() {
  await page.waitForLoadState("networkidle").catch(() => {});
  // What arrives fades in: let it finish, so the picture is of the screen at rest.
  await page.evaluate(async () => {
    const ending = document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.all(ending.map((a) => a.finished.catch(() => null)));
  });
  await page.waitForTimeout(300);
}
async function shot(name) {
  await settle();
  await page.screenshot({ path: `${out}/${name}-fold.png` });
  await page.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
  console.log("captured", name);
}
async function step(name, run) {
  try {
    await run();
  } catch (e) {
    console.log("FAILED", name, String(e).split("\n")[0]);
  }
}

for (const [name, path] of [
  ["today", "/teacher"],
  ["lessons", "/teacher/lessons"],
  ["lesson", "/teacher/lessons/l-procenti"],
  ["prepare", "/teacher/lessons/new"],
  ["classes", "/teacher/classes"],
  ["class", "/teacher/classes/course-ii-4"],
  ["library", "/teacher/library"],
  ["settings", "/teacher/settings"],
  ["help", "/teacher/help"],
]) {
  await step(name, async () => {
    await page.goto(base + path);
    await shot(name);
  });
}

// A lesson: the window that asks which class, the lobby, then a question that is open.
await step("start", async () => {
  await page.goto(base + "/teacher");
  await page.locator(".lessons > li").filter({ hasText: "Проценти и пропорции" }).getByRole("button", { name: "Започни час" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /II-4/ }).check();
  await shot("start-dialog");
  await dialog.getByRole("button", { name: "Започни со II-4" }).click();
  await page.waitForURL(/\/teacher\/live\//);
  await page.locator(".roster__count").waitFor();
  await context.clock.setFixedTime(T0 + 30_000);
  await page.waitForTimeout(2500);
  await shot("live-lobby");
});
await step("teaching", async () => {
  await page.getByRole("button", { name: "Почни го часот" }).click();
  await page.getByRole("button", { name: "Да, почни го часот" }).click();
  await page.locator(".qpanel").waitFor();
  await shot("live-teaching");
  await page.locator(".qpanel").getByRole("button", { name: "Испрати го прашањето", exact: true }).click();
  await context.clock.setFixedTime(T0 + 42_000);
  await page.waitForTimeout(2500);
  await shot("live-question");
});
// With the lesson still running: the band on Today and the tile in the sidebar.
await step("running", async () => {
  await page.goto(base + "/teacher");
  await shot("running-today");
  await page.goto(base + "/teacher/lessons");
  await shot("running-lessons");
});

// Signed out.
await step("sign-in", async () => {
  const fresh = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: Number(scale), locale: "mk-MK", serviceWorkers: "block" });
  const signedOut = await fresh.newPage();
  await signedOut.goto(base + "/teacher/sign-in");
  await signedOut.waitForLoadState("networkidle").catch(() => {});
  await signedOut.waitForTimeout(400);
  await signedOut.screenshot({ path: `${out}/sign-in-fold.png` });
  console.log("captured sign-in");
  await fresh.close();
});

await browser.close();
