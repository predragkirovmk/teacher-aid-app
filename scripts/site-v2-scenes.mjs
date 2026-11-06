// Screenshots of the v2 website's pinned scenes at points through the scroll, with motion on.
//
//   node scripts/site-v2-scenes.mjs <url> <out-dir>
//
// Desktop (1440x900) and phone (390x760) shots at 0 %, 15 %, 35 %, 55 %, 75 %, 100 % and 120 %
// of two screens of scroll, the length of the hero's pin. Page errors are printed.
import { chromium } from "@playwright/test";
const [url, out] = process.argv.slice(2);
const b = await chromium.launch();
for (const [name, vp, mobile] of [["d", { width: 1440, height: 900 }, false], ["m", { width: 390, height: 760 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  p.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.__taMotion === true);
  await p.waitForTimeout(1800);
  for (const f of [0, 0.15, 0.35, 0.55, 0.75, 1, 1.2]) {
    await p.evaluate((f) => window.scrollTo(0, Math.round(innerHeight * 2 * f)), f);
    await p.waitForTimeout(1300);
    await p.screenshot({ path: `${out}/${name}-${String(Math.round(f * 100)).padStart(3, "0")}.png` });
  }
  await ctx.close();
}
await b.close();
