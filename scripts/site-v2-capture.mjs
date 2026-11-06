// Captures the real app screens the website shows in its devices, in Macedonian and English.
//
//   node scripts/site-v2-capture.mjs <teacher-app-url> <student-app-url> <out-dir>
//
// The teacher app (/teacher, on its own branch) is signed in through its demo sheet as the teacher
// with a full season; the student app (/app) is seeded as a signed-in student, then plays the scripted
// maths lesson (MATH-7B) and answers its first question right. Teacher screens are 1440x900 for the
// laptop's 16:10 screen; student screens are 390x798, the phone's screen under its status bar.
// The PNGs land in <out-dir>; scripts/site-v2-screens.py turns them into the site's WebP files.
// Re-run both when an app's screens change.
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
  await ctx.close();
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
await browser.close();
