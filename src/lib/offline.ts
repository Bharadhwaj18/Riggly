// Saving a setlist for offline use.
//
// The real pages are saved, not a hand-made copy: the setlist page, the page of every song in it
// (as reached from the setlist, so the setlist bar, previous / next and Stage mode work) and the
// app's own code and styles. With no connection the service worker (public/sw.js) serves these,
// so the app looks and works the same: blocks, colours, transposing, text size and Stage mode.
// Editing needs a connection, so the lock says "Offline" until it's back.

const LS_SETLISTS = 'tarana-offline-setlists'
const LS_SONGS = 'tarana-offline-songs'
const LS_USER = 'tarana-user'

/** Must match public/sw.js. */
export const PAGES_CACHE = 'tarana-offline-v1'
export const STATIC_CACHE = 'riggly-static-v2'

/** Bumped when what's saved changes, so older saves are redone when next online. */
export const OFFLINE_VERSION = 2

export interface OfflineMeta {
  id: string
  title: string
  songCount: number
  savedAt: string
  /** Which way of saving made this copy (missing = the old hand-made page). */
  version?: number
  /** The pages saved, so they can be removed again. */
  urls?: string[]
}

export interface OfflineSongMeta {
  id: string
  title: string
  artist: string | null
  song_key: string | null
  setlistId: string
  setlistTitle: string
}

export interface OfflineUser {
  email: string
  displayName: string
}

// ── User session ────────────────────────────────────────────────

export function saveUserOffline(user: OfflineUser) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(LS_USER, JSON.stringify(user))
}

// ── Setlist metadata ────────────────────────────────────────────

export function getOfflineMetas(): OfflineMeta[] {
  if (typeof localStorage === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LS_SETLISTS) ?? '[]') } catch { return [] }
}

export function getOfflineMeta(id: string): OfflineMeta | undefined {
  return getOfflineMetas().find(s => s.id === id)
}

export function isSetlistSavedOffline(id: string): boolean {
  return !!getOfflineMeta(id)
}

// ── Song metadata ───────────────────────────────────────────────

function getOfflineSongs(): OfflineSongMeta[] {
  if (typeof localStorage === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LS_SONGS) ?? '[]') } catch { return [] }
}

// ── Finding what a page needs ───────────────────────────────────

const decodeEntities = (s: string) => s.replace(/&amp;/g, '&')

/**
 * The songs in this setlist a page links to, one address per song: "/songs/<id>?from=/setlists/<id>".
 * Pages spell these links a few ways (an encoded "from", "&stage=1" for Stage mode); they're all the
 * same page, and the service worker finds it for any of them, so each song is saved once.
 */
export function songLinksIn(html: string, songIds: Set<string>): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/href="(\/songs\/([^"/?#]+)(?:\?[^"#]*)?)"/g)) {
    if (!songIds.has(m[2])) continue
    const from = new URL(decodeEntities(m[1]), 'http://x').searchParams.get('from')
    out.add(from ? `/songs/${m[2]}?from=${from}` : `/songs/${m[2]}`)
  }
  return [...out]
}

/** The app's code, styles and fonts a page loads (all under /_next/static/). */
export function staticAssetsIn(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/\/_next\/static\/[^"'\\\s)<>]+/g)) out.add(m[0])
  // The page's data names further chunks without the /_next/ prefix.
  for (const m of text.matchAll(/(?<![\w/])static\/(?:chunks|css|media)\/[^"'\\\s)<>]+/g)) out.add(`/_next/${m[0]}`)
  return [...out]
}

// ── Save / remove ───────────────────────────────────────────────

/** Fetches a page as a signed-in visit would and keeps it. Returns its HTML, or null if it couldn't be saved. */
async function savePage(cache: Cache, path: string): Promise<string | null> {
  const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'text/html' } })
  // A redirect means the page wasn't there for us (signed out, no access); don't keep the page it led to.
  if (!res.ok || res.redirected || !(res.headers.get('content-type') ?? '').includes('text/html')) return null
  await cache.put(new URL(path, window.location.origin).href, res.clone())
  return res.text()
}

async function saveAssets(cache: Cache, urls: string[]) {
  const pending = [...urls]
  const found = new Set(urls)
  const worker = async () => {
    for (let url = pending.shift(); url; url = pending.shift()) {
      if (await cache.match(url)) continue
      try {
        const res = await fetch(url, { credentials: 'same-origin' })
        if (!res.ok) continue
        if (url.endsWith('.css')) {
          // Fonts and images a stylesheet points at.
          for (const more of staticAssetsIn(await res.clone().text())) {
            if (!found.has(more)) { found.add(more); pending.push(more) }
          }
        }
        await cache.put(url, res)
      } catch {
        // One missing file shouldn't stop the rest.
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
}

/**
 * Saves a setlist, its songs' pages and everything they load. `onProgress` hears how many pages are
 * done. Throws if the setlist page itself couldn't be saved.
 */
export async function saveSetlistOffline(
  setlistId: string,
  setlistTitle: string,
  songs: OfflineSongMeta[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (typeof caches === 'undefined') throw new Error('This browser can’t save pages for offline use')
  const pages = await caches.open(PAGES_CACHE)
  const assets = await caches.open(STATIC_CACHE)

  const setlistPath = `/setlists/${setlistId}`
  const setlistHtml = await savePage(pages, setlistPath)
  if (setlistHtml === null) throw new Error('Couldn’t save the setlist page')

  // Each song's page as reached from the setlist (so the setlist bar, previous / next and Stage mode
  // work), once per song.
  const songIds = new Set(songs.map(s => s.id))
  const queue = songLinksIn(setlistHtml, songIds)
  for (const id of songIds) {
    if (!queue.some(p => p.startsWith(`/songs/${id}?`))) queue.push(`/songs/${id}?from=${setlistPath}`)
  }
  const seen = new Set(queue)
  const saved = [setlistPath]
  const htmls = [setlistHtml]
  const limit = songIds.size * 4 + 4
  let done = 0
  while (queue.length && saved.length < limit) {
    const path = queue.shift()!
    onProgress?.(done, done + queue.length + 1)
    const html = await savePage(pages, path).catch(() => null)
    done++
    if (html === null) continue
    saved.push(path)
    htmls.push(html)
    for (const link of songLinksIn(html, songIds)) {
      if (!seen.has(link)) { seen.add(link); queue.push(link) }
    }
  }
  onProgress?.(done, done)

  await saveAssets(assets, [...new Set(htmls.flatMap(staticAssetsIn))])

  // Pages saved last time and not this time (a song taken out of the setlist) go.
  const previous = getOfflineMeta(setlistId)?.urls ?? []
  await Promise.all(previous.filter(p => !saved.includes(p)).map(p => pages.delete(new URL(p, window.location.origin).href)))

  const metas = getOfflineMetas().filter(s => s.id !== setlistId)
  metas.push({ id: setlistId, title: setlistTitle, songCount: songs.length, savedAt: new Date().toISOString(), version: OFFLINE_VERSION, urls: saved })
  localStorage.setItem(LS_SETLISTS, JSON.stringify(metas))

  // Song list for the offline home page (merged, keeping songs from other setlists).
  const existing = getOfflineSongs().filter(s => s.setlistId !== setlistId)
  localStorage.setItem(LS_SONGS, JSON.stringify([...existing, ...songs]))
}

export async function removeSetlistOffline(setlistId: string): Promise<void> {
  const meta = getOfflineMeta(setlistId)
  localStorage.setItem(LS_SETLISTS, JSON.stringify(getOfflineMetas().filter(s => s.id !== setlistId)))
  localStorage.setItem(LS_SONGS, JSON.stringify(getOfflineSongs().filter(s => s.setlistId !== setlistId)))

  if (typeof caches === 'undefined') return
  const pages = await caches.open(PAGES_CACHE)
  const urls = meta?.urls ?? [`/setlists/${setlistId}`]
  await Promise.all(urls.map(p => pages.delete(new URL(p, window.location.origin).href)))
}
