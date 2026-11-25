const LS_SETLISTS = 'tarana-offline-setlists'
const LS_SONGS = 'tarana-offline-songs'
const LS_USER = 'tarana-user'

export interface OfflineMeta {
  id: string
  title: string
  songCount: number
  savedAt: string
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

export function isSetlistSavedOffline(id: string): boolean {
  return getOfflineMetas().some(s => s.id === id)
}

// ── Song metadata ───────────────────────────────────────────────

function getOfflineSongs(): OfflineSongMeta[] {
  if (typeof localStorage === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LS_SONGS) ?? '[]') } catch { return [] }
}

// ── Save / remove ───────────────────────────────────────────────

export async function saveSetlistOffline(
  setlistId: string,
  setlistTitle: string,
  html: string,
  songs: OfflineSongMeta[]
): Promise<void> {
  // Setlist metadata
  const metas = getOfflineMetas().filter(s => s.id !== setlistId)
  metas.push({ id: setlistId, title: setlistTitle, songCount: songs.length, savedAt: new Date().toISOString() })
  localStorage.setItem(LS_SETLISTS, JSON.stringify(metas))

  // Song metadata (merge, keeping songs from other setlists)
  const existing = getOfflineSongs().filter(s => s.setlistId !== setlistId)
  localStorage.setItem(LS_SONGS, JSON.stringify([...existing, ...songs]))

  // Send HTML to service worker cache
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready
    const url = `${window.location.origin}/setlists/${setlistId}`
    reg.active?.postMessage({ type: 'CACHE_SETLIST', url, html })
  }
}

export async function removeSetlistOffline(setlistId: string): Promise<void> {
  localStorage.setItem(LS_SETLISTS, JSON.stringify(getOfflineMetas().filter(s => s.id !== setlistId)))
  localStorage.setItem(LS_SONGS, JSON.stringify(getOfflineSongs().filter(s => s.setlistId !== setlistId)))

  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready
    const url = `${window.location.origin}/setlists/${setlistId}`
    reg.active?.postMessage({ type: 'REMOVE_SETLIST', url })
  }
}

// ── Offline everywhere (see public/sw.js and components/offline/OfflineBar) ─────

export const OFFLINE_MESSAGE = 'You’re offline. This needs the internet, so try again once you’re back online.'

/** A request that never reached the server (no internet, or the server is unreachable), in any browser's wording. */
export function isNetworkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|connection closed/i.test(message)
}

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function savedAgo(savedAtMs: number, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - savedAtMs) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

/**
 * Forget everything saved for offline use on this device: saved pages, saved setlists and their lists.
 * Called on sign-out so the next person on a shared phone doesn't see the band's data.
 * Money entries waiting to be sent are kept; they go up next time someone from the band signs in here.
 */
export async function clearOfflineData(): Promise<void> {
  try {
    for (const key of [LS_SETLISTS, LS_SONGS, LS_USER, 'riggly.offline.warmedAt']) localStorage.removeItem(key)
  } catch { /* private mode */ }
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sw = reg?.active
  if (!sw) return
  await new Promise<void>(resolve => {
    const channel = new MessageChannel()
    const done = setTimeout(resolve, 3000)
    channel.port1.onmessage = () => { clearTimeout(done); resolve() }
    sw.postMessage({ type: 'CLEAR' }, [channel.port2])
  })
}
