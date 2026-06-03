// ── Time App Service Worker ──
// v66 — network-first strategi: brugeren får ALTID seneste version når online,
// cache bruges kun som fallback når offline. Tidligere cache-first fastholdt
// brugere på gamle versioner indtil CACHE-konstanten blev bumped manuelt.
const CACHE = 'timeapp-v71';
const ASSETS = ['/app.html', '/rekl.html', '/se-ftv.html', '/icon.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first: prøv altid net først, opdater cache, fallback til cache offline
self.addEventListener('fetch', e => {
  // Kun GET — POST/andet sendes direkte
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(response => {
      // Kun cache succes-svar fra samme origin
      if (response && response.status === 200 && response.type === 'basic') {
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return response;
    }).catch(() => caches.match(e.request))
  );
});

// Opdater straks når appen beder om det
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
