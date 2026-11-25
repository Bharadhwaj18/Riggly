import { SECTIONS, type SectionKey } from '@/lib/workspace-sections'

/**
 * The pages to keep ready for offline use (the service worker refreshes them in the background):
 * every section's main page, upcoming and recent shows and setlists, the songs in those setlists,
 * and each task board. Sections hidden from this person are left out.
 */
export interface OfflinePagesInput {
  today: string
  hidden: SectionKey[]
  setlists: { id: string; show_date: string | null }[]
  shows: { id: string; show_date: string | null }[]
  setlistSongs: { setlist_id: string; song_id: string }[]
  boardIds: string[]
}

const RECENT_SETLISTS = 10
const RECENT_SHOWS = 5
const MAX_SONGS = 150

/** Upcoming first (soonest first), then the most recent past ones, capped. Undated ones count as recent. */
function pick<T extends { show_date: string | null }>(rows: T[], today: string, recent: number): T[] {
  const upcoming = rows.filter(r => r.show_date && r.show_date >= today).sort((a, b) => a.show_date!.localeCompare(b.show_date!))
  const past = rows.filter(r => !r.show_date || r.show_date < today).sort((a, b) => (b.show_date ?? '').localeCompare(a.show_date ?? ''))
  return [...upcoming, ...past.slice(0, recent)]
}

export function offlinePages(input: OfflinePagesInput): string[] {
  const open = (key: SectionKey) => !input.hidden.includes(key)
  const urls = ['/', ...SECTIONS.filter(s => open(s.key)).map(s => s.href), '/more', '/notifications', '/settings']

  if (open('shows')) urls.push(...pick(input.shows, input.today, RECENT_SHOWS).map(s => `/shows/${s.id}`))

  if (open('setlists')) {
    const setlists = pick(input.setlists, input.today, RECENT_SETLISTS)
    urls.push(...setlists.map(s => `/setlists/${s.id}`))
    if (open('songs')) {
      const chosen = new Set(setlists.map(s => s.id))
      const songIds = [...new Set(input.setlistSongs.filter(r => chosen.has(r.setlist_id)).map(r => r.song_id))]
      urls.push(...songIds.slice(0, MAX_SONGS).map(id => `/songs/${id}`))
    }
  }

  if (open('tasks')) urls.push(...input.boardIds.map(id => `/tasks/${id}`))
  return urls
}
