const CACHE = 'safesignal-v1'
const SHELL = ['/', '/setup', '/help', '/manifest.json', '/icon.svg']

self.addEventListener('install', (event) => {
  // Individual failures must not abort the whole install.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))),
    ),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Warnings: prefer fresh, but never leave the screen empty when offline.
  if (url.pathname === '/api/warnings') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ??
              new Response(
                JSON.stringify({ warnings: [], fetchedAt: null, stale: true, dropped: 0 }),
                { headers: { 'content-type': 'application/json' } },
              ),
          ),
        ),
    )
    return
  }

  // Everything else: network first, falling back to cache when offline, so a
  // fresh deploy is not pinned to a stale shell.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy))
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/'))),
  )
})
