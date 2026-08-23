const CACHE_VERSION = "sejoura-v3";
const APP_SHELL = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/icon-maskable-512x512.png",
  "/icons/apple-touch-icon.png",
];

const DB_NAME = "sejoura-offline";
const QUEUE_STORE = "sync-queue";
const SYNC_TAG = "sejoura-sync";

const HEADERS_TO_SKIP = new Set([
  "cookie",
  "set-cookie",
  "host",
  "origin",
  "referer",
  "referrer",
  "content-length",
  "accept-encoding",
  "user-agent",
  "connection",
  "keep-alive",
  "proxy-connection",
  "upgrade",
]);

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getQueueCount() {
  try {
    const db = await openDB();
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const count = await idbRequest(tx.objectStore(QUEUE_STORE).count());
    await tx.done;
    return count;
  } catch {
    return 0;
  }
}

async function enqueueRequest(request) {
  let body = null;
  try {
    body = await request.clone().text();
  } catch {
    body = null;
  }
  const headers = {};
  for (const [name, value] of request.headers) {
    if (!HEADERS_TO_SKIP.has(name.toLowerCase())) {
      headers[name] = value;
    }
  }
  const db = await openDB();
  const tx = db.transaction(QUEUE_STORE, "readwrite");
  await idbRequest(tx.objectStore(QUEUE_STORE).add({
    url: request.url,
    method: request.method,
    headers,
    body,
    createdAt: Date.now(),
  }));
  await tx.done;
}

async function deleteFromQueue(id) {
  const db = await openDB();
  const tx = db.transaction(QUEUE_STORE, "readwrite");
  await idbRequest(tx.objectStore(QUEUE_STORE).delete(id));
  await tx.done;
}

function broadcast(payload) {
  self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      for (const client of clients) client.postMessage(payload);
    })
    .catch(() => {});
}

async function replayQueue() {
  const db = await openDB();
  let items = [];
  try {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    items = await idbRequest(tx.objectStore(QUEUE_STORE).getAll());
    await tx.done;
  } catch {
    items = [];
  }

  if (!items.length) return;

  broadcast({ type: "SEJOURA_SYNC_START", pending: items.length });

  let synced = 0;
  let failed = 0;
  let networkError = false;

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers || {},
        body: item.body || undefined,
      });
      if (response.status >= 200 && response.status < 300) {
        await deleteFromQueue(item.id);
        synced++;
      } else {
        await deleteFromQueue(item.id);
        failed++;
      }
    } catch {
      networkError = true;
      break;
    }
  }

  const pending = await getQueueCount();
  broadcast({
    type: "SEJOURA_SYNC_RESULT",
    synced,
    failed,
    pending,
    offline: networkError,
  });

  if (pending > 0 && !networkError && "sync" in self.registration) {
    self.registration.sync
      .register(SYNC_TAG)
      .catch(() => {});
  }
}

function isDataUrl(url) {
  const sameOriginApi = url.origin === self.location.origin && url.pathname.startsWith("/api/");
  const supabase = /(^|\.)supabase\.co$/.test(url.hostname);
  const nextImage = url.origin === self.location.origin && url.pathname.startsWith("/_next/image");
  return sameOriginApi || supabase || nextImage;
}

function isAuthUrl(url) {
  return /(^|\.)supabase\.co$/.test(url.hostname) && url.pathname.includes("/auth/v1/");
}

function isStaticUrl(url) {
  return (
    (url.origin === self.location.origin &&
      (url.pathname.startsWith("/_next/static/") ||
        url.pathname.startsWith("/icons/") ||
        url.pathname === "/manifest.webmanifest"))
  );
}

function isNavigation(url) {
  return url.origin === self.location.origin;
}

function networkFirst(request, cacheName) {
  return fetch(request)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(cacheName).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() =>
      caches.open(cacheName).then((cache) => cache.match(request))
    );
}

function cacheFirstStale(request, cacheName) {
  return caches.open(cacheName).then(async (cache) => {
    const cached =
      (await cache.match(request)) || (await caches.match(request));
    const network = fetch(request)
      .then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
      .catch(() => cached);
    return cached || network;
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("sejoura-") &&
                key !== APP_SHELL &&
                key !== STATIC_CACHE &&
                key !== DATA_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayQueue());
  }
});

self.addEventListener("online", () => {
  replayQueue();
});

self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "SEJOURA_SYNC_NOW") {
    event.waitUntil(replayQueue());
  } else if (msg.type === "SEJOURA_GET_STATUS") {
    getQueueCount().then((count) => {
      event.ports[0] && event.ports[0].postMessage({ count });
      broadcast({ type: "SEJOURA_STATUS", count });
    });
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    const url = new URL(request.url);
    if (!isDataUrl(url) || isAuthUrl(url)) return;
    const clone = request.clone();
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(async (err) => {
          try {
            await enqueueRequest(clone);
            if ("sync" in self.registration) {
              self.registration.sync.register(SYNC_TAG).catch(() => {});
            }
            broadcast({
              type: "SEJOURA_QUEUE_CHANGED",
              count: await getQueueCount(),
            });
          } catch (enqueueErr) {
            broadcast({
              type: "SEJOURA_QUEUE_ERROR",
              message: String(enqueueErr && enqueueErr.message ? enqueueErr.message : enqueueErr),
            });
          }
          return new Response(
            JSON.stringify({ queued: true, offline: true }),
            {
              status: 202,
              headers: { "Content-Type": "application/json" },
            }
          );
        })
    );
    return;
  }

  const url = new URL(request.url);

  if (request.mode === "navigate" && isNavigation(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(APP_SHELL).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.open(APP_SHELL).then((cache) => cache.match("/"))
        )
    );
    return;
  }

  if (isStaticUrl(url)) {
    event.respondWith(cacheFirstStale(request, STATIC_CACHE));
    return;
  }

  if (isDataUrl(url) && !isAuthUrl(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
});
