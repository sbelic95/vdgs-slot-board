// Haus-Kosten: App-Hülle offline verfügbar halten. Daten liegen im Gerät (localStorage) und in der Datenbank, nie im Cache.
const CACHE = "hauskosten-v2";
const SHELL = ["./", "index.html", "app.css", "core.js", "app.js", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png",
  "vendor/chart.umd.js", "vendor/xlsx.mini.min.js", "vendor/jspdf.umd.min.js", "vendor/jspdf.plugin.autotable.min.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("hauskosten-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: "no-store" }).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
