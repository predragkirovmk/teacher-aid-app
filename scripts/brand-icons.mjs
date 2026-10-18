// Draws every icon, launch screen and the logo kit from the official logo in lib/brand.ts.
// Run after a logo or colour change: node scripts/brand-icons.mjs (needs Google Chrome and zip).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOGO_ASPECT, LOGO_BODY, LOGO_EYES, LOGO_VIEWBOX } from "../lib/brand.ts";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const GROUND = ["#1A5DAE", "#134785"];
const YELLOW = "#FFC83D";
const WHITE = "#FFFFFF";
const INK = "#07162F";
const BLUE = "#1A5DAE";
const BLACK = "#000000";

const shapes = () => `<path d="${LOGO_BODY}"/>${LOGO_EYES.map((e) => `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}"/>`).join("")}`;

// The logo alone, in its own box.
const logoSvg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}" fill="${fill}">${shapes()}</svg>\n`;

// A w x h ground with the logo centred at logoH tall. ground: two gradient stops, one colour, or
// null for transparent; radius rounds the ground.
function art(w, h, logoH, { radius = 0, ground = GROUND, logo = YELLOW } = {}) {
  const lw = logoH * LOGO_ASPECT;
  const [, , vw] = LOGO_VIEWBOX.split(" ").map(Number);
  const s = lw / vw;
  const x = (w - lw) / 2;
  const y = (h - logoH) / 2;
  const fill = Array.isArray(ground) ? "url(#g)" : ground;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${Array.isArray(ground) ? `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ground[0]}"/><stop offset="1" stop-color="${ground[1]}"/></linearGradient></defs>\n` : ""}${ground ? `<rect width="${w}" height="${h}"${radius ? ` rx="${radius}"` : ""} fill="${fill}"/>\n` : ""}<g transform="translate(${+x.toFixed(2)} ${+y.toFixed(2)}) scale(${+s.toFixed(5)})" fill="${logo}">${shapes()}</g>
</svg>
`;
}

const tmp = mkdtempSync(join(tmpdir(), "brand-icons-"));
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
function svg(out, text) {
  writeFileSync(out, text);
  console.log(out);
}

// Favicon and browser icon: rounded, logo at 58% of the side.
svg("app/icon.svg", art(512, 512, 300, { radius: 114.53 }));

// iOS home screen: square and opaque (iOS rounds it).
png("app/apple-icon.png", 180, 180, art(180, 180, 105));

// Installed app (manifest): rounded, plus a maskable one that keeps the logo inside the safe circle.
png("public/app-icons/icon-192.png", 192, 192, art(192, 192, 112.5, { radius: 42.95 }));
png("public/app-icons/icon-512.png", 512, 512, art(512, 512, 300, { radius: 114.53 }));
png("public/app-icons/icon-maskable-512.png", 512, 512, art(512, 512, 236));

// iPhone launch screens: the logo at a quarter of the width.
for (const f of readdirSync("public/app-launch")) {
  const m = f.match(/^launch-(\d+)x(\d+)\.png$/);
  if (!m) continue;
  const [w, h] = [+m[1], +m[2]];
  png(`public/app-launch/${f}`, w, h, art(w, h, Math.round(w * 0.26)));
}

// The logo kit, served at /brand/ and zipped for handing out.
const KIT = "public/brand";
rmSync(KIT, { recursive: true, force: true });
mkdirSync(KIT, { recursive: true });
const colours = { yellow: YELLOW, white: WHITE, ink: INK, blue: BLUE, black: BLACK };
for (const [name, c] of Object.entries(colours)) {
  svg(`${KIT}/teacheraid-logo-${name}.svg`, logoSvg(c));
  png(`${KIT}/teacheraid-logo-${name}.png`, Math.round(2048 * LOGO_ASPECT), 2048, art(Math.round(2048 * LOGO_ASPECT), 2048, 2048, { ground: null, logo: c }));
}
const grounds = {
  "yellow-on-blue": { ground: GROUND, logo: YELLOW },
  "white-on-blue": { ground: GROUND, logo: WHITE },
  "blue-on-white": { ground: WHITE, logo: BLUE },
  "ink-on-yellow": { ground: YELLOW, logo: INK },
};
for (const [name, o] of Object.entries(grounds)) {
  svg(`${KIT}/teacheraid-${name}.svg`, art(2048, 2048, 1200, o));
  png(`${KIT}/teacheraid-${name}.png`, 2048, 2048, art(2048, 2048, 1200, o));
}
svg(`${KIT}/teacheraid-app-icon.svg`, art(1024, 1024, 600, { radius: 229.06 }));
png(`${KIT}/teacheraid-app-icon.png`, 1024, 1024, art(1024, 1024, 600, { radius: 229.06 }));
// Square and full bleed: app stores and profile pictures (the logo stays inside a circle crop).
png(`${KIT}/teacheraid-app-icon-square.png`, 1024, 1024, art(1024, 1024, 600));
png(`${KIT}/teacheraid-profile-1080.png`, 1080, 1080, art(1080, 1080, 600));

const files = readdirSync(KIT).filter((f) => /\.(svg|png)$/.test(f)).map((f) => join(KIT, f));
execFileSync("zip", ["-qj", `${KIT}/teacheraid-logo-kit.zip`, ...files]);
console.log(`${KIT}/teacheraid-logo-kit.zip`);

rmSync(tmp, { recursive: true, force: true });
