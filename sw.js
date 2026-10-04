const CACHE = "hokkaido-guide-2026-10-04-v2";
const CORE = ["./", "./index.html", "./styles.css", "./app.js", "./data.json",
              "./manifest.webmanifest", "./assets/icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    try {
      const response = await cache.match("./data.json");
      const data = await response.json();
      const images = [...new Set(data.places.map(p => p.image?.path).filter(Boolean))];
      await Promise.allSettled(images.map(path => cache.add("./" + path)));
    } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) {
      fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
      }).catch(() => {});
      return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (_) {
      if (request.mode === "navigate") return cache.match("./index.html");
      throw new Error("offline");
    }
  })());
});
