// Caches only the app shell so the home-screen app opens offline; live data always comes from the network.
// Network first, bypassing the HTTP cache, so a new version on GitHub Pages shows up on the next load.
const CACHE = "vdgs-shell-v5";
const SHELL = ["./", "index.html", "airserbia/", "airserbia/manifest.webmanifest", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-512.png",
  "vendor/fonts.css", "vendor/leaflet.css", "vendor/leaflet.js", "vendor/fonts/B612-400-latin.woff2","vendor/fonts/B612-700-latin.woff2","vendor/fonts/B612Mono-400-latin.woff2","vendor/fonts/B612Mono-700-latin.woff2","vendor/fonts/BarlowCondensed-500-latin-ext.woff2","vendor/fonts/BarlowCondensed-500-latin.woff2","vendor/fonts/BarlowCondensed-600-latin-ext.woff2","vendor/fonts/BarlowCondensed-600-latin.woff2","vendor/fonts/BarlowCondensed-700-latin-ext.woff2","vendor/fonts/BarlowCondensed-700-latin.woff2","vendor/fonts/Roboto-italic-cyrillic-0.woff2","vendor/fonts/Roboto-italic-latin-2.woff2","vendor/fonts/Roboto-italic-latin-ext-1.woff2","vendor/fonts/Roboto-normal-cyrillic-3.woff2","vendor/fonts/Roboto-normal-latin-5.woff2","vendor/fonts/Roboto-normal-latin-ext-4.woff2","vendor/fonts/RobotoCondensed-normal-cyrillic-6.woff2","vendor/fonts/RobotoCondensed-normal-latin-8.woff2","vendor/fonts/RobotoCondensed-normal-latin-ext-7.woff2"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: "no-store" }).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
