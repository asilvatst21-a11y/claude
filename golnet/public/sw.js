const CACHE = "palpitai-v1";
const OFFLINE_URLS = ["/", "/predictions", "/rankings", "/offline.html"];

// Install: pre-cache shell pages
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // API routes: network only (never cache)
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((res) => {
        // Cache successful navigation responses
        if (res.ok && (request.mode === "navigate" || url.pathname.match(/\.(png|jpg|svg|ico|webp|woff2?)$/))) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          // Offline fallback for navigations
          if (request.mode === "navigate") return caches.match("/");
        })
      )
  );
});

// Push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "PalpitaAí", {
      body: data.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url ?? "/" },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url === url && "focus" in client) { client.focus(); return; }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
