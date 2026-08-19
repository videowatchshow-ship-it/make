var CACHE = 'gauth-v36'
var ASSETS = ['/', 'index.html', 'manifest.json', 'xlsx.core.min.js']
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return Promise.allSettled(ASSETS.map(function(url) { return c.add(url) }))
    }).then(function() { return self.skipWaiting() })
  )
})
self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(ks) {
    return Promise.all(ks.filter(function(k) { return k !== CACHE }).map(function(k) { return caches.delete(k) }))
  }).then(function() { return self.clients.claim() }))
})
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return
  var url = new URL(e.request.url)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/codes/')) return
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).then(function(r) {
      if (r && r.status === 200) {
        var rc = r.clone()
        e.waitUntil(caches.open(CACHE).then(function(c) { c.put(e.request, rc) }))
      }
      return r
    }).catch(function() {
      return caches.match(e.request).then(function(cached) {
        return cached || new Response('오프라인 — 네트워크 연결을 확인하세요', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })
      })
    })
  )
})
