// Renders the owner's review page from its source file, the way the Artifact host wraps it, at a laptop and a phone width, and
// reports sideways overflow and script errors. Look at the two pictures before publishing.
//
//   node scripts/teacher-redesign/review-page-check.mjs <dir-with-index.html-and-img> <section-id>
//
// It writes <dir>/_check-1280.png and <dir>/_check-400.png, cut at the end of the section named (for example step-4-review).
import { chromium } from "@playwright/test";
import fs from "node:fs";

const dir = process.argv[2];
const section = process.argv[3];
const head = "<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width, initial-scale=1'><style>body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>";
fs.writeFileSync(`${dir}/_preview.html`, head + fs.readFileSync(`${dir}/index.html`, "utf8") + "</body></html>");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
for (const [w, h] of [[1280, 900], [400, 800]]) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`file://${dir}/_preview.html`);
  await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelectorAll("img").forEach((i) => (i.loading = "eager")));
  await p.waitForTimeout(800);
  const box = await p.locator(`#${section}`).boundingBox();
  await p.screenshot({ path: `${dir}/_check-${w}.png`, fullPage: true, clip: { x: 0, y: 0, width: w, height: Math.min(box.y + box.height + 40, 9000) } });
  console.log(w, "overflow", await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), "errors", errors.length, errors[0] || "");
  await p.close();
}
await browser.close();
fs.unlinkSync(`${dir}/_preview.html`);
