"use strict";
const NAME = "cijian-static-v1";
const FILES = ["./", "./index.html", "./core.js", "./app.js", "./style.css", "./icon.png", "./icon-192.png", "./manifest.webmanifest"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(NAME).then(cache => cache.addAll(FILES))));
self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys().then(names => Promise.all(names.filter(name => name.startsWith("cijian-static-") && name !== NAME)
    .map(name => caches.delete(name)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !FILES.some(path => new URL(path, self.registration.scope).href === url.href)) return;
  event.respondWith(fetch(event.request).then(response => response.ok ? response : caches.match(event.request).then(cached => cached || response))
    .catch(async () => (await caches.match(event.request)) || Response.error()));
});
