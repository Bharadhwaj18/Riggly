// Saved pages (setlists and their songs, saved by src/lib/offline.ts) and the offline home page.
const CACHE_NAME = 'tarana-offline-v1'
// The app's code, styles and fonts (/_next/static/…, named by content so they never change).
const STATIC_CACHE = 'riggly-static-v2'
const OFFLINE_PAGE = '/offline.html'

self.addEventListener('install', event => {
  // Pre-cache the offline hub page so it works immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_PAGE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => event.waitUntil(
  // Drop older copies of the app's files (v1 could go stale in development), then take over open pages.
  caches.keys()
    .then(names => Promise.all(names.filter(n => n.startsWith('riggly-static-') && n !== STATIC_CACHE).map(n => caches.delete(n))))
    .then(() => clients.claim())
))

self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // Not JSON — fall through to the defaults below.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Riggly', {
      body: data.body || '',
      data: { link: data.link || '/' },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'
  event.waitUntil(clients.openWindow(link))
})

/**
 * A saved page for this address. Song pages are saved as the setlist links to them, so an address
 * spelled a little differently (an encoded "from", or "&stage=1") still finds the right one: same song,
 * then same setlist, then Stage mode.
 */
async function savedPage(cache, request) {
  const exact = await cache.match(request.url)
  if (exact) return exact
  const url = new URL(request.url)
  if (!/^\/(songs|setlists)\/[^/]+$/.test(url.pathname)) return null
  let best = null
  let bestScore = -1
  for (const key of await cache.keys()) {
    const k = new URL(key.url)
    if (k.pathname !== url.pathname) continue
    const score = (k.searchParams.get('from') === url.searchParams.get('from') ? 2 : 0)
      + (k.searchParams.get('stage') === url.searchParams.get('stage') ? 1 : 0)
    if (score > bestScore) { best = key; bestScore = score }
  }
  return best ? cache.match(best) : null
}

const isHtml = res => (res.headers.get('content-type') || '').includes('text/html')

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // App code, styles and fonts: from the network (the browser's own cache keeps them fast), saved for
  // offline as they load, and from the saved copy when there's no connection. Network first matters:
  // in development the file names don't change between edits, so a cache-first copy would go stale.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      fetch(request).then(res => {
        if (res.ok) {
          const copy = res.clone()
          event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.put(request.url, copy)))
        }
        return res
      }).catch(async () => {
        const hit = await caches.match(request.url, { cacheName: STATIC_CACHE })
        return hit || new Response('', { status: 503 })
      })
    )
    return
  }

  if (request.mode !== 'navigate') return

  event.respondWith(
    fetch(request).then(res => {
      // A saved page opened online: keep the saved copy up to date.
      if (res.ok && !res.redirected && isHtml(res)) {
        const copy = res.clone()
        event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
          if (await cache.match(request.url)) await cache.put(request.url, copy)
        }))
      }
      return res
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME)
      const saved = await savedPage(cache, request)
      if (saved) return saved
      // Anything else (setlists list, songs, home): the offline home page, which lists what's saved.
      // The URL stays the same — offline.html reads window.location.pathname.
      const offlinePage = await cache.match(OFFLINE_PAGE)
      return offlinePage || new Response('Offline', { status: 503 })
    })
  )
})
