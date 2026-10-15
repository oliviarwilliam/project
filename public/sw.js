// Service worker. It only ever stores public, unchanging files (scripts, styles, fonts, icons).
// Pages, API answers and anything that belongs to a signed in member are never cached.
const VERSION = "v2";
const STATIC = `teenvest-static-${VERSION}`;
const RUNTIME = `teenvest-runtime-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];
const MAX_RUNTIME_ENTRIES = 60;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

// Files in /_next/static have a hash in their name, so they can be kept forever.
async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) (await caches.open(STATIC)).put(request, response.clone());
  return response;
}

// Show what we have straight away and refresh it in the background.
async function staleWhileRevalidate(event) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(event.request);
  const refresh = fetch(event.request).then((response) => {
    if (response.ok) { cache.put(event.request, response.clone()).then(() => trim(RUNTIME, MAX_RUNTIME_ENTRIES)); }
    return response;
  });
  if (hit) { event.waitUntil(refresh.catch(() => undefined)); return hit; }
  return refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (/^\/(api|auth|admin)(\/|$)/.test(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try { return (await event.preloadResponse) || (await fetch(request)); }
      catch { return (await caches.match(OFFLINE_URL)) || Response.error(); }
    })());
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) event.respondWith(cacheFirst(request));
  else if (url.pathname.startsWith("/icons/")) event.respondWith(staleWhileRevalidate(event));
});
