const CACHE = 'centbeam-v2';
const ASSETS = ['./studio.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});

// 문서(HTML)는 네트워크 우선 — 항상 서버의 최신본을 먼저 시도하고, 오프라인일 때만 캐시로 대체.
// 그 외 정적 자산(아이콘 등)은 캐시 우선 — 어차피 안 바뀌는 파일이라 빠른 응답이 이득.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const isDoc = e.request.mode === 'navigate' || /\.html$|\/$/.test(new URL(e.request.url).pathname);
  if (isDoc) {
    e.respondWith(
      fetch(e.request)
        .then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
