import { NextResponse } from 'next/server'
import { getCachedSetlists, getCachedSetlistSongCounts, getCachedShows, getCachedTaskData } from '@/lib/data'
import { offlinePages } from '@/lib/offline-pages'
import { todayISO } from '@/lib/shows'
import { getWorkspaceContext, navHiddenSections } from '@/lib/workspace'

// The pages the app keeps ready for offline use; the service worker fetches and saves each one.
export async function GET() {
  const ctx = await getWorkspaceContext()
  if (!ctx) return NextResponse.json({ urls: [] })
  const [setlists, shows, setlistSongs, tasks] = await Promise.all([
    getCachedSetlists(), getCachedShows(), getCachedSetlistSongCounts(), getCachedTaskData(),
  ])
  const urls = offlinePages({
    today: todayISO(),
    hidden: navHiddenSections(ctx.current),
    setlists,
    shows,
    setlistSongs,
    boardIds: tasks.boards.map(b => b.id),
  })
  return NextResponse.json({ urls }, { headers: { 'Cache-Control': 'no-store' } })
}
