var CACHE = 'gauth-v1'
var ASSETS = ['/', 'index.html', 'manifest.json', 'xlsx.core.min.js']
self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(ASSETS) }))
  self.skipWaiting()
})
self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(ks) {
    return Promise.all(ks.filter(function(k) { return k !== CACHE }).map(function(k) { return caches.delete(k) }))
  }).then(function() { return self.clients.claim() }))
})
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('/api/')) return
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).then(function(r) {
      if (r && r.status === 200) {
        var rc = r.clone()
        caches.open(CACHE).then(function(c) { c.put(e.request, rc) })
      }
      return r
    }).catch(function() { return caches.match(e.request) })
  )
})
