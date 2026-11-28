// Captures the real app screens the website shows in its devices, in Macedonian and English.
//
//   node scripts/site-v2-capture.mjs <teacher-app-url> <student-app-url> <out-dir>
//
// The teacher app (/teacher, on its own branch) is signed in through its demo sheet as the teacher
// with a full season; the student app (/app) is seeded as a signed-in student, then plays the scripted
// maths lesson (MATH-7B) and answers its first question right. Teacher screens are 1440x900 for the
// laptop's 16:10 screen; student screens are 390x798, the phone's screen under its status bar.
// Then one real lesson is played for the scroll scene "In class": the teacher starts "Основи на
// веројатноста", opens the projector screen (1600x900, the board's 16:9), lets the class join, starts
// the lesson, sends the first question and lets the time run out. At each beat both screens are
// captured (t-live-* on the laptop, b-live-* on the board), and where the question sits on each is
// written to content/site-v2/live-capture.json, so the website can fly it from the laptop to the board.
// The PNGs land in <out-dir>; scripts/site-v2-screens.py turns them into the site's WebP files.
// Re-run both when an app's screens change.
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [teacherUrl, studentUrl, out] = process.argv.slice(2);
if (!teacherUrl || !studentUrl || !out) {
  console.error("usage: node scripts/site-v2-capture.mjs <teacher-app-url> <student-app-url> <out-dir>");
  process.exit(2);
}

const NOTICE_VERSION = "2026-10-27";
// Next's dev indicator, if a capture runs against a dev server.
const HIDE = "nextjs-portal { display: none !important; }";
const browser = await chromium.launch();

async function teacher(locale) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 });
  const p = await ctx.newPage();
  await p.goto(`${teacherUrl}/teacher/sign-in?next=%2Fteacher`, { waitUntil: "networkidle" });
  if (locale === "en") {
    await p.getByText("EN", { exact: true }).first().click();
    await p.waitForTimeout(500);
  }
  await p.getByRole("button", { name: /Google/ }).first().click();
  await p.waitForTimeout(800);
  await p.getByRole("button", { name: /Марија|Marija/ }).first().click();
  await p.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 20000 });
  await p.addStyleTag({ content: HIDE });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/t-today-${locale}.png` });
  await p.goto(`${teacherUrl}/teacher/lessons/l-verojatnost?from=today`, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: HIDE });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/t-lesson-${locale}.png` });
  live[locale] = await lesson(ctx, p, locale);
  await ctx.close();
}

// The lesson for the scroll scene. The mock's class joins and answers on the clock, so the clock is
// fixed and moved on by hand: every run shows the same counts.
const T0 = Date.parse("2026-10-29T09:30:05+01:00");
const live = {};

async function lesson(ctx, p, locale) {
  const en = locale === "en";
  await ctx.clock.setFixedTime(T0);
  await p.goto(`${teacherUrl}/teacher`, { waitUntil: "networkidle" });
  await p.locator(".lessons > li").filter({ hasText: "Основи на веројатноста" }).getByRole("button", { name: en ? "Start lesson" : "Започни час" }).click();
  await p.waitForURL(/\/teacher\/live\//);
  await p.locator(".roster__count").waitFor();
  const opened = ctx.waitForEvent("page");
  await p.getByRole("button", { name: en ? "Open the projector screen" : "Отвори го екранот за проектор" }).click();
  const board = await opened;
  await board.setViewportSize({ width: 1600, height: 900 });
  await board.waitForLoadState("networkidle");

  // Both screens at one moment of the lesson.
  const beat = async (name, seconds) => {
    if (seconds !== undefined) await ctx.clock.setFixedTime(T0 + seconds * 1000);
    await p.waitForTimeout(1500);
    for (const [page, prefix] of [[p, "t"], [board, "b"]]) {
      await page.addStyleTag({ content: HIDE });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/${prefix}-live-${name}-${locale}.png` });
    }
  };
  // Where an element sits (a question: its words, not its box), as a share of its screen; the type
  // in percent of the screen's width.
  const where = (page, sel, words = false) =>
    page.locator(sel).first().evaluate((el, words) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = (words ? range : el).getBoundingClientRect();
      const W = innerWidth;
      const H = innerHeight;
      const cs = getComputedStyle(el);
      return {
        x: r.x / W,
        y: r.y / H,
        w: r.width / W,
        h: r.height / H,
        text: el.textContent.trim(),
        size: (parseFloat(cs.fontSize) / W) * 100,
        weight: cs.fontWeight,
        line: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize),
        tracking: cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize),
      };
    }, words);

  await beat("join1", 5);
  await beat("join2", 30);
  await p.getByRole("button", { name: en ? "Start the lesson" : "Почни го часот", exact: true }).click();
  await p.getByRole("button", { name: en ? "Yes, start the lesson" : "Да, почни го часот" }).click();
  await p.locator(".qpanel").waitFor();
  await beat("ready");
  const send = p.locator(".qpanel").getByRole("button", { name: en ? "Send the question" : "Испрати го прашањето", exact: true });
  const from = await where(p, ".qpanel__prompt", true);
  const press = await where(p, `.qpanel__actions button:has-text("${en ? "Send the question" : "Испрати го прашањето"}")`);
  await send.click();
  await beat("open1", 33);
  const to = await where(board, ".cvq__prompt", true);
  await beat("open2", 41);
  await beat("shown", 50);
  await board.close();
  const box = ({ x, y, w, h }) => ({ x, y, w, h });
  return { question: to.text, from: box(from), send: box(press), to: { ...box(to), size: to.size, weight: to.weight, line: to.line, tracking: to.tracking } };
}

async function student(locale) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 798 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(
    ({ locale, notice }) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.clear();
      localStorage.setItem("teacheraid-app-v1", JSON.stringify({ signedIn: true, noticeVersion: notice, noticeAt: Date.now() }));
      localStorage.setItem("teacheraid-locale", locale);
    },
    { locale, notice: NOTICE_VERSION },
  );
  const p = await ctx.newPage();
  const shot = async (name) => {
    await p.addStyleTag({ content: HIDE });
    await p.screenshot({ path: `${out}/s-${name}-${locale}.png` });
  };
  await p.goto(`${studentUrl}/app/scan`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await shot("scan");

  // The scripted lesson: the lobby, the first question, the answer, the result, the standings.
  await p.goto(`${studentUrl}/app/play/MATH-7B`, { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  await shot("lobby");
  const options = p.locator("main button").filter({ hasText: /x\s*=\s*5/ });
  await options.first().waitFor({ state: "visible", timeout: 30000 });
  await p.waitForTimeout(900);
  await shot("question");
  await options.first().click();
  await p.waitForTimeout(1200);
  await shot("answered");
  await p.getByText(/\+15/).first().waitFor({ timeout: 30000 });
  await p.waitForTimeout(900);
  await shot("verdict");
  await p.getByText(/1\.\s*(место|place)/i).first().waitFor({ timeout: 30000 });
  await p.waitForTimeout(900);
  await shot("standings");
  await ctx.close();
}

for (const locale of ["mk", "en"]) {
  await teacher(locale);
  await student(locale);
  console.log(`captured ${locale}`);
}
writeFileSync(new URL("../content/site-v2/live-capture.json", import.meta.url), JSON.stringify(live, null, 2) + "\n");
await browser.close();
