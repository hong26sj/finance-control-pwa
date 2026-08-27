const CACHE = 'flow-shell-v14'
const ROOT = new URL('./', self.registration.scope).pathname
const SHELL = [ROOT, `${ROOT}offline/`, `${ROOT}manifest.webmanifest`, `${ROOT}icon.svg`]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  const isAppFile =
    request.mode === 'navigate' ||
    url.pathname.includes('/_next/static/') ||
    ['style', 'script'].includes(request.destination) ||
    url.pathname.endsWith('/manifest.webmanifest') ||
    url.pathname.endsWith('/sw.js')

  if (isAppFile) {
    event.respondWith(networkFirst(request))
    return
  }

  if (['font', 'image'].includes(request.destination)) {
    event.respondWith(cacheFirst(request))
  }
})

async function networkFirst(request) {
  try {
    const fresh = await fetch(request, { cache: 'no-store' })
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE)
      cache.put(request, fresh.clone())
    }
    return fresh
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) return cached
    if (request.mode === 'navigate') {
      const offline = await caches.match(`${ROOT}offline/`)
      if (offline) return offline
    }
    throw error
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.ok) {
    const cache = await caches.open(CACHE)
    cache.put(request, response.clone())
  }
  return response
}
