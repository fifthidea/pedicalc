// pedicalc PWA service worker.
// IMPORTANT: for every published app update, change BOTH CACHE_NAME and APP_VERSION.
const CACHE_PREFIX = "pedicalc-pwa-";
const CACHE_NAME = "pedicalc-pwa-v1";
const APP_VERSION = "1.0.1";
const META_CACHE_NAME = "pedicalc-meta";
const ACTIVE_INFO_URL = new URL("__pedicalc_active_cache_info__", self.registration.scope).href;
const CACHE_READY_URL = new URL("__pedicalc_cache_ready__", self.registration.scope).href;

const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./dist/app.bundle.js",
  "./manifest.json",
  "./vazirmatn/Vazirmatn-font-face.css",
  "./vazirmatn/fonts/ttf/Vazirmatn-Black.ttf",
  "./vazirmatn/fonts/ttf/Vazirmatn-Bold.ttf",
  "./vazirmatn/fonts/ttf/Vazirmatn-ExtraBold.ttf",
  "./vazirmatn/fonts/ttf/Vazirmatn-ExtraLight.ttf",
  "./vazirmatn/fonts/ttf/Vazirmatn-Light.ttf",
  "./vazirmatn/fonts/ttf/Vazirmatn-Medium.ttf",
  "./vazirmatn/fonts/ttf/Vazirmatn-Regular.ttf",
  "./vazirmatn/fonts/ttf/Vazirmatn-SemiBold.ttf",
  "./vazirmatn/fonts/ttf/Vazirmatn-Thin.ttf",
  "./vazirmatn/fonts/variable/Vazirmatn[wght].ttf",
  "./vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2",
  "./vazirmatn/fonts/webfonts/Vazirmatn-Black.woff2",
  "./vazirmatn/fonts/webfonts/Vazirmatn-Bold.woff2",
  "./vazirmatn/fonts/webfonts/Vazirmatn-ExtraBold.woff2",
  "./vazirmatn/fonts/webfonts/Vazirmatn-ExtraLight.woff2",
  "./vazirmatn/fonts/webfonts/Vazirmatn-Light.woff2",
  "./vazirmatn/fonts/webfonts/Vazirmatn-Medium.woff2",
  "./vazirmatn/fonts/webfonts/Vazirmatn-Regular.woff2",
  "./vazirmatn/fonts/webfonts/Vazirmatn-SemiBold.woff2",
  "./vazirmatn/fonts/webfonts/Vazirmatn-Thin.woff2",
  "./fontawesome/css/all.min.css",
  "./fontawesome/webfonts/fa-brands-400.woff2",
  "./fontawesome/webfonts/fa-regular-400.woff2",
  "./fontawesome/webfonts/fa-solid-900.woff2",
  "./fontawesome/webfonts/fa-v4compatibility.woff2",
  "./assets/your-icon.png",
  "./assets/teacher.png",
  "./assets/settings.png",
  "./assets/programmer.png",
  "./assets/close-icon.png",
  "./assets/favicon.ico",
  "./assets/medmate.png",
  "./assets/my-menu-icon.png",
  "./assets/arrow.png",
  "./assets/about.png",
  "./assets/ABGg.png",
  "./assets/categories/all.png",
  "./assets/categories/ampoule.png",
  "./assets/categories/cream.png",
  "./assets/categories/drop.png",
  "./assets/categories/gel.png",
  "./assets/categories/inhaler.png",
  "./assets/categories/ointment.png",
  "./assets/categories/pill.png",
  "./assets/categories/powder.png",
  "./assets/categories/sachet.png",
  "./assets/categories/spray.png",
  "./assets/categories/suppository.png",
  "./assets/categories/syrup.png",
  "./assets/categories/vial.png",
  "./icon256.png"
];

async function readActiveInfo() {
  const metaCache = await caches.open(META_CACHE_NAME);
  const response = await metaCache.match(ACTIVE_INFO_URL);
  if (!response) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function writeActiveInfo(info) {
  const metaCache = await caches.open(META_CACHE_NAME);
  await metaCache.put(
    ACTIVE_INFO_URL,
    new Response(JSON.stringify(info), {
      headers: { "Content-Type": "application/json" }
    })
  );
}

async function cacheIsReady(cacheName, version) {
  if (!cacheName || !(await caches.has(cacheName))) return false;
  const cache = await caches.open(cacheName);
  const marker = await cache.match(CACHE_READY_URL);
  if (!marker) return false;
  try {
    const details = await marker.json();
    return details.version === version;
  } catch {
    return false;
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Fetch each asset with a version query to avoid reusing an old browser HTTP-cache
      // entry, then store it under its normal URL so the app can load normally offline.
      await Promise.all(FILES.map(async filePath => {
        const assetUrl = new URL(filePath, self.registration.scope);
        const downloadUrl = new URL(assetUrl.href);
        downloadUrl.searchParams.set("__pedicalc_version", APP_VERSION);
        const response = await fetch(downloadUrl.href, { cache: "reload" });
        if (!response.ok) {
          throw new Error(`Failed to cache ${filePath}: HTTP ${response.status}`);
        }
        await cache.put(assetUrl.href, response);
      }));
      // This marker tells the page that the entire candidate cache finished downloading.
      await cache.put(
        CACHE_READY_URL,
        new Response(JSON.stringify({ version: APP_VERSION }), {
          headers: { "Content-Type": "application/json" }
        })
      );

      // Keep the currently selected version and this new candidate. Remove older,
      // unselected candidates only when an active-version pointer already exists.
      const activeInfo = await readActiveInfo();
      if (activeInfo && activeInfo.cacheName) {
        const keys = await caches.keys();
        await Promise.all(keys
          .filter(key => key.startsWith(CACHE_PREFIX) &&
            key !== CACHE_NAME && key !== activeInfo.cacheName)
          .map(key => caches.delete(key)));
      }
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
    // Deliberately do NOT call skipWaiting(): choosing an app version is handled by the cache pointer.
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    // Keep the previously selected cache. A new worker activating must not silently
    // switch the user's app version or delete their previously selected version.
    const activeInfo = await readActiveInfo();
    if (!activeInfo || !(await caches.has(activeInfo.cacheName))) {
      await writeActiveInfo({ cacheName: CACHE_NAME, version: APP_VERSION });
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (!event.data || event.data.type !== "PEDICALC_SET_ACTIVE_CACHE") return;

  event.waitUntil((async () => {
    const cacheName = String(event.data.cacheName || "");
    const version = String(event.data.version || "");
    let result = { ok: false };

    // Accept only a completely downloaded pedicalc version cache.
    if (
      cacheName.startsWith(CACHE_PREFIX) &&
      cacheName !== META_CACHE_NAME &&
      version &&
      await cacheIsReady(cacheName, version)
    ) {
      await writeActiveInfo({ cacheName, version });
      // The user explicitly accepted this version, so older pedicalc caches are no
      // longer needed. A later declined candidate remains separate until accepted.
      const keys = await caches.keys();
      await Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== cacheName)
        .map(key => caches.delete(key)));
      result = { ok: true, cacheName, version };
    }

    if (event.ports && event.ports[0]) event.ports[0].postMessage(result);
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Never answer version checks from cache. If offline, the page ignores this failure
  // and continues running the selected cached app.
  if (url.pathname.endsWith("/version.json")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() =>
        new Response("", { status: 503 })
      )
    );
    return;
  }

  event.respondWith((async () => {
    const info = await readActiveInfo();
    let activeCacheName = info && info.cacheName;
    if (!activeCacheName || !(await caches.has(activeCacheName))) {
      activeCacheName = CACHE_NAME;
    }
    const activeCache = await caches.open(activeCacheName);
    const cached = await activeCache.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      if (response.ok) {
        await activeCache.put(event.request, response.clone());
      }
      return response;
    } catch {
      if (event.request.mode === "navigate") {
        const offlinePage = await activeCache.match(
          new URL("index.html", self.registration.scope).href
        );
        return offlinePage || new Response("Offline", { status: 503 });
      }
      return new Response("", { status: 503 });
    }
  })());
});
