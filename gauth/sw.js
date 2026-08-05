self.addEventListener('install', function() { self.skipWaiting() })
self.addEventListener('activate', function(e) { e.waitUntil(self.clients.claim()) })
self.addEventListener('fetch', function(e) {
  if (e.request.url.includes('index.html') || e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(function() { return caches.match(e.request) }))
  }
})
