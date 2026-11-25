// "__BUILD__" is replaced with the commit SHA by the deploy workflow,
// so every deploy gets a fresh cache.
const VERSION = "__BUILD__";
const SHELL_CACHE = `mp-shell-${VERSION}`;
const ASSET_CACHE = "mp-assets-v1";

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./games.json",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("mp-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

const scope = new URL(self.registration.scope);

// Launcher files: network first so a deploy shows up right away, cache when offline.
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === "navigate") return cache.match("./index.html");
    throw new Error("offline");
  }
}

// Icons and fonts: serve the cached copy instantly, refresh in the background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((res) => { if (res.ok || res.type === "opaque") cache.put(request, res.clone()); return res; })
    .catch(() => hit);
  return hit || fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }
  const isFont = url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";
  if (isFont || request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request));
  }
});
