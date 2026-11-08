import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

// The matcher Next itself uses for a redirect's source; it ships without types.
const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as {
  pathToRegexp: (path: string, keys: unknown[]) => RegExp;
};

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

type Redirect = { source: string; destination: string; permanent?: boolean; has?: unknown[] };

async function redirects(mode?: "live"): Promise<Redirect[]> {
  if (mode) vi.stubEnv("NEXT_PUBLIC_API_MODE", mode);
  const config = (await import("../../next.config")).default;
  return (await config.redirects!()) as Redirect[];
}

/** Where a request for this path goes, matched the way Next matches a redirect's source; null when it is served. */
function target(rules: Redirect[], path: string): string | null {
  const rule = rules.filter((r) => !r.has).find((r) => pathToRegexp(r.source, []).test(path));
  return rule ? rule.destination.replace(":path", path.slice(1)) : null;
}

async function robots(mode?: "live"): Promise<string> {
  if (mode) vi.stubEnv("NEXT_PUBLIC_API_MODE", mode);
  const { GET } = await import("../../app/robots.txt/route");
  return GET().text();
}

const APP_PATHS = [
  "/teacher",
  "/teacher/",
  "/teacher/lessons/new",
  "/teacher/live/s-n1",
  "/teacher-sw.js",
  "/teacher-offline.html",
  "/teacher-icons/icon-192.png",
  "/teacher.webmanifest",
  "/app",
  "/app/checkin/LIVE-7B",
  "/app/build",
  "/app-sw.js",
  "/app-push.js",
  "/app-icons/badge-96.png",
  "/app-launch/launch-1170x2532.png",
  "/app-screens/home.webp",
  "/app.webmanifest",
  "/_next/static/chunks/main.js",
  "/icon.svg",
  "/apple-icon.png",
  "/robots.txt",
];

const SITE_PATHS = ["/en", "/za-nas", "/prasanja", "/early-access", "/api/early-access", "/host", "/demo", "/j/ABC", "/print", "/sitemap.xml", "/llms.txt", "/manifest.webmanifest", "/site-v2/hero.jpg", "/brand/teacheraid-logo-black.svg"];

describe("a live build (the real app on app.teacheraid.education)", () => {
  it("serves the two apps and the files they load", async () => {
    const rules = await redirects("live");
    for (const path of APP_PATHS) expect(target(rules, path), path).toBeNull();
  });

  it("sends the website, the early-access form and the old demo to the main domain, path kept", async () => {
    const rules = await redirects("live");
    expect(target(rules, "/")).toBe("https://teacheraid.education/");
    for (const path of SITE_PATHS) expect(target(rules, path), path).toBe(`https://teacheraid.education${path}`);
  });

  it("does not take a path that only starts like an app's for the app", async () => {
    const rules = await redirects("live");
    for (const path of ["/teachers", "/apple", "/application", "/teacherx/y"]) expect(target(rules, path), path).not.toBeNull();
  });

  it("redirects temporarily, so a later use of a path on the app's domain is not cached", async () => {
    const rules = await redirects("live");
    for (const rule of rules.filter((r) => !r.has)) expect(rule.permanent).toBe(false);
  });

  it("shuts every crawler out", async () => {
    expect(await robots("live")).toBe("User-Agent: *\nDisallow: /\n");
  });
});

describe("the demo build (teacheraid.education)", () => {
  it("redirects nothing but www", async () => {
    const rules = await redirects();
    expect(rules).toHaveLength(1);
    expect(rules[0].has).toEqual([{ type: "host", value: "www.teacheraid.education" }]);
    for (const path of [...APP_PATHS, ...SITE_PATHS, "/"]) expect(target(rules, path), path).toBeNull();
  });

  it("keeps the website open to crawlers", async () => {
    const body = await robots();
    expect(body).toContain("Allow: /\n");
    expect(body).toContain("Sitemap: ");
    expect(body).not.toContain("Disallow: /\n");
  });
});
