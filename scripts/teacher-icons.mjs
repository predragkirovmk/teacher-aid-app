// Draws the teacher app's icons: the official white M on the teacher app's deep teal.
// Run after a logo or colour change: node scripts/teacher-icons.mjs (needs Google Chrome).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOGO_ASPECT, LOGO_BODY, LOGO_EYES, LOGO_VIEWBOX } from "../lib/brand.ts";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEEP = "#124554";
const WHITE = "#FFFFFF";

const shapes = () => `<path d="${LOGO_BODY}"/>${LOGO_EYES.map((e) => `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}"/>`).join("")}`;

// A w x h ground with the logo centred at logoH tall; radius rounds the ground.
function art(w, h, logoH, radius = 0) {
  const lw = logoH * LOGO_ASPECT;
  const [, , vw] = LOGO_VIEWBOX.split(" ").map(Number);
  const s = lw / vw;
  const x = (w - lw) / 2;
  const y = (h - logoH) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}"${radius ? ` rx="${radius}"` : ""} fill="${DEEP}"/>
<g transform="translate(${+x.toFixed(2)} ${+y.toFixed(2)}) scale(${+s.toFixed(5)})" fill="${WHITE}">${shapes()}</g>
</svg>
`;
}

const tmp = mkdtempSync(join(tmpdir(), "teacher-icons-"));
function png(out, w, h, svg) {
  const page = join(tmp, "page.html");
  writeFileSync(page, `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
  execFileSync(CHROME, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--default-background-color=00000000",
    `--window-size=${w},${h}`,
    `--screenshot=${out}`,
    `file://${page}`,
  ], { stdio: "ignore" });
  console.log(out);
}

const DIR = "public/teacher-icons";
// Favicon: rounded, logo at 58% of the side.
writeFileSync(`${DIR}/icon.svg`, art(512, 512, 300, 114.53));
console.log(`${DIR}/icon.svg`);
// Installed app (manifest): rounded, plus a maskable one that keeps the logo inside the safe circle.
png(`${DIR}/icon-192.png`, 192, 192, art(192, 192, 112.5, 42.95));
png(`${DIR}/icon-512.png`, 512, 512, art(512, 512, 300, 114.53));
png(`${DIR}/icon-maskable-512.png`, 512, 512, art(512, 512, 236));
// Apple touch icon: square and opaque (the system rounds it).
png(`${DIR}/apple-icon.png`, 180, 180, art(180, 180, 105));

rmSync(tmp, { recursive: true, force: true });
