// Precaches the whole game so a second scan works offline on bad venue wifi.
const CACHE = "boss-v3";
const ASSETS = [
  "/boss/index.html",
  "/boss/game.css",
  "/boss/game.js",
  "/boss/prof.png",
  "/boss/field.png",
  "/boss/scare.webp",
  "/boss/pressstart.woff2",
  "/boss/pixelify.woff2",
  "/boss/manifest.webmanifest",
  "/boss/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// The page goes network-first; assets come straight from cache and refresh in the background,
// so a redeploy shows up on the next visit without bumping CACHE.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/boss/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/boss/index.html")),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => hit);
      if (hit) {
        event.waitUntil(fresh);
        return hit;
      }
      return fresh;
    }),
  );
});
