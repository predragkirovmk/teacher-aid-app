import { expect, test } from "@playwright/test";

/**
 * A live build is the real app on app.teacheraid.education and serves the two apps alone (next.config.ts): everything else
 * goes to the main domain. tests/unit/live-build.test.ts checks the rules with Next's matcher; this asks the built server
 * itself, so the paths, the query and the status are what a browser gets. No redirect is followed, so nothing reaches the
 * real site.
 */
const MAIN = "https://teacheraid.education";

const SERVED = [
  "/teacher",
  "/app",
  "/app/checkin/LIVE-7B",
  "/app.webmanifest",
  "/teacher.webmanifest",
  "/app-sw.js",
  "/teacher-sw.js",
  "/teacher-offline.html",
  "/teacher-icons/icon-192.png",
  "/app-icons/icon-192.png",
  "/icon.svg",
  "/apple-icon.png",
];

test("the two apps and the files they load are served here", async ({ request }) => {
  for (const path of SERVED) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.headers().location ?? "", path).not.toContain("teacheraid.education");
    expect(res.status(), path).toBeLessThan(400);
  }
});

test("the apps' own scripts and styles load", async ({ request }) => {
  const html = await (await request.get("/app")).text();
  const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
  expect(assets.length).toBeGreaterThan(0);
  for (const path of assets.slice(0, 5)) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
  }
});

test("the website, the early-access form and the old demo go to the main domain, path and query kept", async ({ request }) => {
  const cases: [string, string][] = [
    ["/", `${MAIN}/`],
    ["/za-nas", `${MAIN}/za-nas`],
    ["/en", `${MAIN}/en`],
    ["/early-access?src=qr", `${MAIN}/early-access?src=qr`],
    ["/host", `${MAIN}/host`],
    ["/j/ABC", `${MAIN}/j/ABC`],
    ["/api/state", `${MAIN}/api/state`],
    ["/sitemap.xml", `${MAIN}/sitemap.xml`],
    ["/teachers", `${MAIN}/teachers`],
  ];
  for (const [path, to] of cases) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(res.headers().location, path).toBe(to);
  }
});

test("a form posted here keeps its method on the way to the main domain", async ({ request }) => {
  const res = await request.post("/api/early-access", { data: { email: "a@b.mk" }, maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers().location).toBe(`${MAIN}/api/early-access`);
});

test("robots.txt shuts every crawler out", async ({ request }) => {
  const res = await request.get("/robots.txt", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe("User-Agent: *\nDisallow: /\n");
});
