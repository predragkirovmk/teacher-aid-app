/**
 * The teacher app's offline worker, scoped to /teacher. It keeps the shell of the app (the pages that are the same for
 * everybody, their scripts, styles, fonts and icons) so the installed app opens with no signal, and an honest page
 * (/teacher-offline.html) for anywhere else.
 *
 * It never keeps data. Only the pages listed by the app, files under /_next/static and the icons are ever stored; every
 * other request, an API call, a lesson, a class view, a student's name, goes to the network untouched and is not stored.
 *
 * Pages: network first, the cached copy when offline or slow. /_next/static: cache first, the names are content-hashed.
 * The page posts { type: "warm", routes } after load; the worker then caches those pages and the files they use, and
 * drops what a previous deploy left behind.
 */

const PAGES = "teacher-pages";
const STATIC = "teacher-static";
const META = "teacher-meta";
const BUILD_KEY = "/__teacher-sw-build";
const OFFLINE = "/teacher-offline.html";
const ASSETS = [
  OFFLINE,
  "/teacher.webmanifest",
  "/teacher-icons/icon-192.png",
  "/teacher-icons/icon-512.png",
  "/teacher-icons/icon-maskable-512.png",
  "/teacher-icons/icon.svg",
  "/teacher-icons/apple-icon.png",
];
/** How long a page load waits for the network before it settles for the cached copy. */
const NETWORK_WAIT = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "warm" && Array.isArray(data.routes)) event.waitUntil(warm(data.routes));
});

const isPage = (url) => url.pathname === "/teacher" || url.pathname.startsWith("/teacher/");
const isStatic = (url) => url.pathname.startsWith("/_next/static/");
const isAsset = (url) => ASSETS.includes(url.pathname);
/** Path and query: on Vercel static files can carry a deployment query. */
const keyOf = (u, base = self.location.origin) => {
  const url = new URL(u, base);
  return url.pathname + url.search;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Only real page loads are answered here; the router's own data requests go to the network, and when they fail
  // offline Next falls back to a full page load, which lands here.
  if (request.mode === "navigate" && isPage(url)) event.respondWith(page(event, url));
  else if (isStatic(url) || isAsset(url)) event.respondWith(cacheFirst(request));
});

async function page(event, url) {
  const cache = await caches.open(PAGES);
  const cached = await cache.match(url.pathname, { ignoreVary: true });
  const network = fetch(event.request);
  // Only the pages the app listed are kept; any other page (a lesson, a class view) is never stored.
  if (cached) {
    event.waitUntil(
      network.then((res) => (res.ok && !res.redirected ? cache.put(url.pathname, res.clone()) : undefined)).catch(() => undefined),
    );
    // A classroom connection that hangs is worse than none: after a few seconds take the cached page and let the
    // network finish into the cache.
    const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_WAIT));
    // A server that answers with an error is no better than none: the kept page opens instead.
    const answer = network.then((res) => (res.status >= 500 ? cached : res)).catch(() => cached);
    return Promise.race([answer, timeout]);
  }
  try {
    return await network;
  } catch {
    const offline = await (await caches.open(STATIC)).match(OFFLINE);
    return offline ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

/** Fetch every listed page, cache it and the files it uses; on a new deploy, drop files it no longer uses. */
async function warm(routes) {
  const pages = await caches.open(PAGES);
  const statics = await caches.open(STATIC);
  const used = new Set(ASSETS);
  // False once a page could not be read: what it uses is then unknown, so nothing is dropped as left behind.
  let complete = true;

  await pool(routes, 4, async (path) => {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok || res.redirected) {
        complete = false;
        return;
      }
      const html = await res.clone().text();
      await pages.put(path, res);
      for (const ref of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) used.add(keyOf(ref[0]));
    } catch {
      // offline or a failed route: keep what is cached
      complete = false;
    }
  });

  // Stylesheets name the remaining font files.
  for (const css of [...used].filter((u) => new URL(u, self.location.origin).pathname.endsWith(".css"))) {
    try {
      const text = await (await fetch(css)).text();
      for (const m of text.matchAll(/url\(([^)"']+)\)/g)) used.add(keyOf(m[1], new URL(css, self.location.origin)));
    } catch {
      // the next warm-up tries again
    }
  }

  await pool([...used], 6, async (path) => {
    if (await statics.match(path, { ignoreVary: true })) return;
    try {
      const res = await fetch(path);
      if (res.ok) await statics.put(path, res);
    } catch {
      // the next warm-up tries again
    }
  });

  // A warm-up that missed a page learns nothing about a new deploy: the next complete one does the clearing.
  if (!complete) return;
  const key = [...used].sort().join("\n");
  const meta = await caches.open(META);
  const previous = await meta.match(BUILD_KEY);
  if (previous && (await previous.text()) !== key) {
    for (const req of await statics.keys()) {
      if (!used.has(keyOf(req.url))) await statics.delete(req);
    }
    const wanted = new Set(routes);
    for (const req of await pages.keys()) {
      if (!wanted.has(new URL(req.url).pathname)) await pages.delete(req);
    }
  }
  await meta.put(BUILD_KEY, new Response(key));
}

async function pool(items, size, run) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) await run(queue.shift());
    }),
  );
}
