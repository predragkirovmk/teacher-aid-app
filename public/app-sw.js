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
 *
 * Web push (spec FR-NOT-02) is the same kind of errand: a message comes in, a notification goes out, and the page does
 * everything else. The worker reads the payload (app-push.js), always shows a notification for it, and tells the open
 * pages that one arrived so they read the feed. A tap focuses an open window of the app and posts it the screen to
 * go to (and the alert to mark read), or opens a new window on that screen. It makes no request of its own: the
 * subscription is sent to the API by the page (lib/app/push), and a subscription that changes is noticed there the next
 * time the app opens.
 */

importScripts("/app-push.js");
const Push = self.TeacherAidPush;

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
const wakePages = () => tell({ type: "flush-outbox" });

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === "warm" && Array.isArray(data.routes)) event.waitUntil(warm(data.routes));
  // The demo's "send a test notification": the same path a push takes, after a few seconds so the phone can be locked first.
  else if (data.type === "show-notification") event.waitUntil(showAfter(data.payload, data.delayMs));
});

// ---- Web push ---------------------------------------------------------------------------------------

self.addEventListener("push", (event) => event.waitUntil(onPush(event)));

async function onPush(event) {
  let raw = null;
  try {
    raw = event.data ? event.data.json() : null;
  } catch {
    try {
      raw = { body: event.data.text() };
    } catch {
      raw = null;
    }
  }
  // Always a notification, whatever came in: Safari drops the subscription of an app that is pushed and shows nothing.
  const n = Push.parse(raw);
  await self.registration.showNotification(n.title, Push.options(n));
  await tell({ type: "push-received", id: n.id });
}

async function showAfter(payload, delayMs) {
  const wait = Math.min(Math.max(Number(delayMs) || 0, 0), 10000);
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  const n = Push.parse(payload);
  await self.registration.showNotification(n.title, Push.options(n));
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(onTap(event.notification.data));
});

async function onTap(data) {
  const id = data && typeof data.id === "string" ? data.id : "";
  const link = Push.appPath(data && data.link) || "/app/notifications";
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const target = Push.pickWindow(windows, self.location.origin);
  if (target) {
    target.postMessage({ type: "open-alert", id, link });
    try {
      await target.focus();
    } catch {
      // the browser would not raise it; the page has the message
    }
    return;
  }
  await self.clients.openWindow(Push.withAlert(link, id));
}

/** Tell every open page something; the page does the rest. */
async function tell(message) {
  try {
    const pages = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const page of pages) page.postMessage(message);
  } catch {
    // nobody to tell
  }
}

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
