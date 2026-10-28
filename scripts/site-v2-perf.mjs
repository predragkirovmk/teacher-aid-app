// Scroll smoothness and screenshots for the v2 website.
//
//   node scripts/site-v2-perf.mjs <url> [--shots <dir>] [--cpu 4]
//
// Perf: a 390px phone with a 4x slower CPU swipes from the top to the bottom of the page with
// real touch gestures, while every frame's duration is recorded. The budget in
// docs/site-v2/DESIGN.md: 95 % of frames under 20 ms. Exits 1 when the budget is missed.
// Shots: full-page screenshots at 1440 and 390 wide with Reduce Motion on, so every scene is in
// its final state.
import { chromium, devices } from "@playwright/test";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--") && /^https?:/.test(a));
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const shots = flag("--shots");
const cpu = Number(flag("--cpu") ?? 4);
if (!url) {
  console.error("usage: node scripts/site-v2-perf.mjs <url> [--shots <dir>] [--cpu 4]");
  process.exit(2);
}

const browser = await chromium.launch();

if (shots) {
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["phone", { width: 390, height: 844 }],
  ]) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
    await ctx.close();
    console.log(`shot ${shots}/${name}.png`);
  }
}

const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => (window).__taMotion === true, null, { timeout: 15000 }).catch(() => {});

await page.evaluate(() => {
  const w = window;
  w.__frames = [];
  w.__long = [];
  let last = performance.now();
  const tick = (t) => {
    w.__frames.push(t - last);
    last = t;
    w.__raf = requestAnimationFrame(tick);
  };
  w.__raf = requestAnimationFrame(tick);
  new PerformanceObserver((list) => list.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ type: "longtask", buffered: false });
});

const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
let y = 0;
while (y < height - 4) {
  await cdp.send("Input.synthesizeScrollGesture", {
    x: 195,
    y: 600,
    yDistance: -500,
    speed: 1400,
    gestureSourceType: "touch",
    repeatCount: 1,
  });
  y = await page.evaluate(() => scrollY);
}
await page.waitForTimeout(600);

const { frames, long } = await page.evaluate(() => {
  cancelAnimationFrame((window).__raf);
  return { frames: (window).__frames.slice(2), long: (window).__long };
});
await browser.close();

const sorted = [...frames].sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const under = frames.filter((f) => f < 20).length / frames.length;
console.log(
  JSON.stringify(
    {
      url,
      cpuThrottle: cpu,
      frames: frames.length,
      under20ms: `${(under * 100).toFixed(1)}%`,
      p50: +pct(0.5).toFixed(1),
      p95: +pct(0.95).toFixed(1),
      worst: +sorted[sorted.length - 1].toFixed(1),
      longTasks: long.length,
      longestTask: long.length ? +Math.max(...long).toFixed(0) : 0,
    },
    null,
    2,
  ),
);
process.exit(under >= 0.95 ? 0 : 1);
