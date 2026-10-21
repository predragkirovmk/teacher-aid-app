/**
 * The student app's offline worker, scoped to /app. All demo data lives on the phone, so once the
 * pages and their files are cached the whole app, scanning included, opens with no signal.
 *
 * Pages: network first, the cached copy when offline or slow. /_next/static: cache first, the
 * names are content-hashed. Icons and the manifest: cached copy, refreshed in the background.
 * The page posts { type: "warm", routes } after load; the worker then caches every route and every
 * file those pages reference, and drops what a previous deploy left behind.
 *
 * Answers are not the worker's business. It never sees, caches, queues or replays an API request: the
 * fetch handler below answers GET navigations and same-origin static files and nothing else, and the API
 * is another origin besides. The student's answers wait in the page's own outbox (IndexedDB) and the page
 * sends them. Where the browser has Background Sync (Chromium, not iOS) the page registers the tag
 * below; when the network returns the worker only wakes the open pages so they flush. A closed app is
 * not woken: its answers go out the next time it opens.
 */

const PAGES = "app-pages";
const STATIC = "app-static";
const META = "app-meta";
const BUILD_KEY = "/__app-sw-build";
const ASSETS = ["/app.webmanifest", "/app-icons/icon-192.png", "/app-icons/icon-512.png", "/app-icons/icon-maskable-512.png"];
/** How long a page load waits for the network before it settles for the cached copy. */
const NETWORK_WAIT = 3000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** Registered by the page (lib/app/session/background-sync.ts) when an answer is saved for later. */
const SYNC_TAG = "teacheraid-answers";

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(wakePages());
});

/** Tell every open page to flush its answers; the page does the sending. */
async function wakePages() {
  const pages = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const page of pages) page.postMessage({ type: "flush-outbox" });
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "warm" && Array.isArray(data.routes)) event.waitUntil(warm(data.routes));
});

const isPage = (url) => url.pathname === "/app" || url.pathname.startsWith("/app/");
const isStatic = (url) => url.pathname.startsWith("/_next/static/");
const isAsset = (url) => ASSETS.includes(url.pathname) || /^\/app\/(apple-)?icon[^/]*\.(png|svg)$/.test(url.pathname);
/** Path and query: on Vercel static files can carry a deployment query. */
const keyOf = (u, base = self.location.origin) => {
  const url = new URL(u, base);
  return url.pathname + url.search;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only reads are ever answered from here: a POST (an answer, a sign-in) goes straight to the network.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Only real page loads get a cached page; the router's own data requests go to the network, and
  // when they fail offline Next falls back to a full page load, which lands here.
  if (request.mode === "navigate" && isPage(url)) event.respondWith(page(event, url));
  else if (isStatic(url)) event.respondWith(cacheFirst(request));
  else if (isAsset(url)) event.respondWith(refreshInBackground(event, request));
});

async function page(event, url) {
  const cache = await caches.open(PAGES);
  const network = fetch(event.request);
  event.waitUntil(
    network.then((res) => (res.ok && !res.redirected ? cache.put(url.pathname, res.clone()) : undefined)).catch(() => undefined),
  );
  const cached = await cache.match(url.pathname, { ignoreVary: true });
  if (!cached) return network;
  // A classroom connection that hangs is worse than none: after a few seconds take the cached page
  // and let the network finish into the cache.
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_WAIT));
  return Promise.race([network.catch(() => cached), timeout]);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

async function refreshInBackground(event, request) {
  const cache = await caches.open(STATIC);
  const network = fetch(request);
  event.waitUntil(network.then((res) => (res.ok ? cache.put(request, res.clone()) : undefined)).catch(() => undefined));
  const hit = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
  return hit ?? network;
}

/** Fetch every route, cache it and the files it uses; on a new deploy, drop files it no longer uses. */
async function warm(routes) {
  const pages = await caches.open(PAGES);
  const statics = await caches.open(STATIC);
  const used = new Set(ASSETS);

  await pool(routes, 4, async (path) => {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok || res.redirected) return;
      const html = await res.clone().text();
      await pages.put(path, res);
      for (const ref of html.matchAll(/\/_next\/static\/[^"'\s)\\]+|\/app\/(?:apple-)?icon[^"'\s?\\]*\.(?:png|svg)/g)) {
        used.add(keyOf(ref[0]));
      }
    } catch {
      // offline or a failed route: keep what is cached
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
