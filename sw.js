// Service worker: makes the app work offline.
// Bump VERSION whenever app files change so installed copies update.
const VERSION = "v2";
const CACHE = `health-tracker-${VERSION}`;
const SHELL = [
  "./", "index.html", "styles.css", "manifest.webmanifest", "food_nutrition.json",
  "js/app.js", "js/badges.js", "js/calc.js", "js/calendar.js", "js/chart.js", "js/dates.js", "js/compare.js", "js/estimator.js", "js/favorites.js", "js/nutrients.js",
  "js/store.js", "js/ui.js", "js/views.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png",
];

// Local development: always fetch fresh files so edits show up immediately (no stale service-worker copies).
const IS_DEV = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);

self.addEventListener("install", e => {
  // cache: "reload" skips the browser's HTTP cache, so we never precache a stale copy of a file.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("health-tracker-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const offlineFallback = () => cached || (req.mode === "navigate" ? cache.match("index.html") : Response.error());
      const fetchFresh = () => fetch(req, { cache: IS_DEV ? "no-store" : "no-cache" }).then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      });
      // Dev: network first. Production: stale-while-revalidate (instant load, updates in the background).
      if (IS_DEV) return fetchFresh().catch(offlineFallback);
      const network = fetchFresh().catch(() => null);
      return cached || (await network) || offlineFallback();
    }));
});
