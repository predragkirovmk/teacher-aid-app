// Before and after pictures of the screens of one step of the teacher redesign (docs/teacher-redesign-handoff.md).
//
//   node scripts/teacher-redesign/step-shots.mjs <out-dir> [width] [height] [scale]
//
// It walks the screens of step 3 (a lesson's page, a Library lesson, the prepare form, the wait, the editor, an open question) and
// writes <name>-fold.png (the first screen) and <name>-full.png (the whole page) for each. For another step, change the list of
// `step(...)` calls below to that step's screens; keep the rest. Run it against the old build and the new one, into two folders.
// Scale 1 is for looking at yourself, scale 2 for pictures the owner will see. The clock is fixed, as it is in the tests, and is
// moved by hand where the mock needs time to pass (a draft being written).
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3100", OUT = process.argv[2], W = +process.argv[3] || 1280, H = +process.argv[4] || 800, SC = +process.argv[5] || 1;
const T0 = Date.parse("2026-10-29T09:30:05+01:00");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SC, timezoneId: "Europe/Skopje", locale: "mk-MK", serviceWorkers: "block" });
await context.addInitScript(() => { if (!localStorage.getItem("teacheraid-teacher-session-v1")) localStorage.setItem("teacheraid-teacher-session-v1", JSON.stringify({ persona: "veteran" })); });
const p = await context.newPage();
await context.clock.setFixedTime(T0);
const settle = async (top = true) => { await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(600); if (top) await p.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); }); await p.waitForTimeout(150); };
const shot = async (n, top = true) => { await settle(top); await p.screenshot({ path: `${OUT}/${n}-fold.png` }); await p.screenshot({ path: `${OUT}/${n}-full.png`, fullPage: true }); console.log("shot", n, await p.evaluate(() => document.documentElement.scrollHeight)); };
const step = async (name, fn) => { try { await fn(); } catch (e) { console.log("FAILED", name, String(e).split("\n")[0]); } };

await step("lesson", async () => { await p.goto(BASE + "/teacher/lessons"); await p.locator("section[aria-labelledby=prepared] .lessons > li").nth(1).getByRole("link").first().click(); await p.waitForURL(/lessons\/l-/); await shot("lesson"); });
await step("library", async () => { await p.goto(BASE + "/teacher/library"); await p.locator(".lessons > li").first().getByRole("link").first().click(); await p.waitForURL(/library\/.+/); await shot("library-lesson"); });
await step("prepare", async () => { await p.goto(BASE + "/teacher/lessons/new?from=today"); await shot("prepare"); });
await step("prepare-filled", async () => {
  await p.getByRole("radio", { name: /^II година/ }).check();
  await p.getByRole("radio", { name: /^Неколку реченици/ }).check();
  await p.getByRole("textbox", { name: "Напишете неколку реченици за темата" }).fill("Равенки од втор степен и дискриминантата. Учениците треба да знаат да ги решаваат.");
  await shot("prepare-filled");
});
await step("wait", async () => { await p.getByRole("button", { name: "Подготви прашања", exact: true }).click(); await p.waitForURL(/drafts\//); await shot("wait"); });
await step("editor", async () => {
  for (let s = 4; s <= 40; s += 4) { await context.clock.setFixedTime(T0 + s * 1000); await p.waitForTimeout(1200); if (await p.locator(".btn--primary:visible").filter({ hasText: /Зачувај/ }).count()) break; }
  await shot("editor");
});
await step("editor-edit", async () => { await p.getByRole("button", { name: /^Уреди/ }).first().click(); await shot("editor-edit", false); });
await browser.close();
