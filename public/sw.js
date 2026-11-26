// Riggly's service worker: push notifications, and offline use.
//
// Offline works like this:
// - The app's code (JS, CSS, fonts under /_next/static) is kept the first time it loads; those files never change.
// - Every app page that loads from the server is kept as "the last copy" (riggly-pages). When there's no internet,
//   opening that page shows the last copy, with a small note saying how old it is (see OfflineBar).
// - Moving between pages inside the app asks the server for page data rather than HTML. When that can't reach the
//   server, the worker answers with an error so Next.js loads the page fully instead, which then comes from the
//   last copy. (Next.js would otherwise wait for the internet to come back.)
// - The app asks the worker to refresh key pages in the background while online (WARM), so pages you haven't
//   opened lately are ready too.
// - "Save offline" on a setlist (src/lib/offline.ts) keeps the setlist and its songs' pages in their own cache
//   (CACHE_NAME), so the last-copy limit never pushes them out. They're used the same way as last copies.
// - A song page saved from its setlist is found however its address is spelled (an encoded "from", "&stage=1").
// - Pages nobody has saved fall back to /offline.html, which lists what is saved.
// - Signing out clears it all (CLEAR).

// Cache names must match src/lib/offline.ts.
const CACHE_NAME = 'tarana-offline-v1' // setlists and their songs saved with the "Save offline" button
const PAGES = 'riggly-pages-v1'
const ASSETS = 'riggly-assets-v1'
const OFFLINE_PAGE = '/offline.html'
const SAVED_AT = 'x-riggly-saved-at'
const MAX_PAGES = 400
// How long to wait for the server before showing the saved copy (a weak signal at a venue).
const SLOW_NETWORK_MS = 6000

// Pages that are never kept: signing in, setup, and the add/edit forms (they can't save offline anyway).
function keepable(url) {
  const p = url.pathname
  if (/^\/(login|auth|api|invite|setup|choose-workspace|offline\.html)(\/|$)/.test(p)) return false
  if (/\/(new|edit)$/.test(p)) return false
  return true
}

function pageKey(url) {
  const u = new URL(url)
  u.searchParams.delete('_rsc')
  u.hash = ''
  return u.toString()
}

self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_PAGE)),
      caches.open(ASSETS).then(cache => cache.add('/icon-192.png')).catch(() => {}),
    ]).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => event.waitUntil(clients.claim()))

/** A copy of a page response, stamped with when it was saved. */
async function stamped(res) {
  const body = await res.clone().text()
  const headers = new Headers(res.headers)
  headers.set(SAVED_AT, String(Date.now()))
  return new Response(body, { status: 200, headers })
}

async function savePage(key, res) {
  const cache = await caches.open(PAGES)
  await cache.put(key, res.headers.has(SAVED_AT) ? res.clone() : await stamped(res))
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - MAX_PAGES; i++) await cache.delete(keys[i])
}

function isSaveableHtml(res) {
  return res && res.ok && res.type === 'basic' && !res.redirected && (res.headers.get('content-type') || '').includes('text/html')
}

/**
 * The saved copy of a page: the last copy, or one kept with "Save offline". A song or setlist page saved under a
 * slightly different address still counts: same page, then the same "from" setlist, then the same Stage mode.
 */
async function findSaved(key) {
  const caches2 = [await caches.open(PAGES), await caches.open(CACHE_NAME)]
  for (const cache of caches2) {
    const hit = await cache.match(key, { ignoreVary: true })
    if (hit) return hit
  }
  const url = new URL(key)
  if (!/^\/(songs|setlists)\/[^/]+$/.test(url.pathname)) return null
  let best = null
  let bestScore = -1
  for (const cache of caches2) {
    for (const req of await cache.keys()) {
      const k = new URL(req.url)
      if (k.pathname !== url.pathname) continue
      const score = (k.searchParams.get('from') === url.searchParams.get('from') ? 2 : 0)
        + (k.searchParams.get('stage') === url.searchParams.get('stage') ? 1 : 0)
      if (score > bestScore) { best = { cache, req }; bestScore = score }
    }
  }
  return best ? best.cache.match(best.req, { ignoreVary: true }) : null
}

/** The saved copy of a page, with a note added so the page can say how old it is. */
async function savedCopy(key) {
  const hit = await findSaved(key)
  if (!hit) return null
  const savedAt = hit.headers.get(SAVED_AT) || ''
  const html = (await hit.text()).replace('</head>', `<script>window.__RIGGLY_SAVED_AT=${JSON.stringify(savedAt)}</script></head>`)
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

async function offlineFallback() {
  const setlists = await caches.open(CACHE_NAME)
  return (await setlists.match(OFFLINE_PAGE)) || new Response('Offline', { status: 503 })
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('slow')), ms)
    promise.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

async function handleNavigation(event, url) {
  const key = pageKey(url)
  const network = fetch(event.request)
  if (keepable(url)) {
    // Keep the fresh copy even if the saved one was shown because the server was slow.
    event.waitUntil(network.then(async res => {
      if (!isSaveableHtml(res)) return
      const copy = await stamped(res) // read now, before the page uses up the response
      await savePage(key, copy)
      // A page kept with "Save offline" is kept up to date as well.
      const pinned = await caches.open(CACHE_NAME)
      if (await pinned.match(key, { ignoreVary: true })) await pinned.put(key, copy.clone())
    }).catch(() => {}))
  }
  try {
    const hasCopy = keepable(url) && ((await caches.match(key, { cacheName: PAGES, ignoreVary: true }))
      || (await caches.match(key, { cacheName: CACHE_NAME, ignoreVary: true })))
    return await (hasCopy ? withTimeout(network, SLOW_NETWORK_MS) : network)
  } catch {
    return (await savedCopy(key)) || (await offlineFallback())
  }
}

// The dev server reuses file names while their contents change, so there the network comes first.
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname)

async function handleAsset(request) {
  const cache = await caches.open(ASSETS)
  if (DEV) {
    try {
      const res = await fetch(request)
      if (res.ok) cache.put(request, res.clone())
      return res
    } catch {
      return (await cache.match(request)) || Response.error()
    }
  }
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) cache.put(request, res.clone())
  return res
}

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigation(event, url))
    return
  }

  // App code and fonts: file names change with every release, so a kept copy is always right.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(handleAsset(req))
    return
  }

  // Icons and the manifest: fresh when online, the kept copy when not.
  if (/^\/(icon[^/]*\.(png|svg)|manifest\.json|apple-icon\.png)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req).then(res => { if (res.ok) caches.open(ASSETS).then(c => c.put(req, res.clone())); return res })
        .catch(() => caches.match(req).then(hit => hit || Response.error()))
    )
    return
  }

  // In-app page moves (Next.js asks for page data with an RSC header). Offline, answer with a plain error:
  // Next.js then loads the page in full, and that comes from the saved copy above.
  if (req.headers.get('RSC') === '1') {
    event.respondWith(
      fetch(req).catch(() => new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
    )
  }
})

// ── Background refresh ───────────────────────────────────────────────────────────

let warming = false
async function warm(urls, maxAgeMs) {
  if (warming) return
  warming = true
  try {
    const cache = await caches.open(PAGES)
    for (const raw of urls) {
      const url = new URL(raw, self.location.origin)
      if (url.origin !== self.location.origin || !keepable(url)) continue
      const key = pageKey(url)
      const hit = await cache.match(key, { ignoreVary: true })
      const age = hit ? Date.now() - Number(hit.headers.get(SAVED_AT) || 0) : Infinity
      if (age < maxAgeMs) continue
      try {
        const res = await fetch(url.toString(), { credentials: 'same-origin', headers: { 'x-riggly-warm': '1' } })
        if (isSaveableHtml(res)) await savePage(key, res)
      } catch {
        break // offline again: stop and try next time
      }
    }
  } finally {
    warming = false
  }
}

async function clearAll() {
  await Promise.all([caches.delete(PAGES), caches.delete(CACHE_NAME)])
  // Put the offline page back for next time.
  await caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_PAGE)).catch(() => {})
}

self.addEventListener('message', event => {
  const data = event.data
  if (!data) return

  if (data.type === 'WARM' && Array.isArray(data.urls)) {
    event.waitUntil(warm(data.urls, typeof data.maxAgeMs === 'number' ? data.maxAgeMs : 30 * 60 * 1000))
  }

  if (data.type === 'CLEAR') {
    event.waitUntil(clearAll().then(() => event.ports[0] && event.ports[0].postMessage('cleared')))
  }
})

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
