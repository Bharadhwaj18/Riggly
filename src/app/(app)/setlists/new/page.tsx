import Link from 'next/link'
import { sectionGuard } from '@/lib/section-guard'
import { redirect } from 'next/navigation'
import { ChevronLeft, Plus } from 'lucide-react'
import { SetlistForm } from '@/components/setlists/SetlistForm'
import { createSetlist } from '@/actions/setlists'
import { UpcomingShowPicker } from '@/components/setlists/UpcomingShowPicker'
import { getCachedShow, getCachedShows, getCachedSetlistsByShow } from '@/lib/data'
import { todayISO, isUpcoming } from '@/lib/shows'

interface Props {
  searchParams: Promise<{ showId?: string; blank?: string }>
}

export default async function NewSetlistPage({ searchParams }: Props) {
  const denied = await sectionGuard('setlists')
  if (denied) return denied
  const { showId, blank } = await searchParams
  const show = showId ? await getCachedShow(showId) : undefined
  if (showId) {
    const existing = (await getCachedSetlistsByShow()).find(sl => sl.show_id === showId)
    if (existing) redirect(`/setlists/${existing.id}`)
  }

  // No show picked yet and not explicitly starting from scratch — offer the
  // nearest upcoming shows so their title/date/venue don't need retyping
  // when a show record already has all of it. `?blank=1` skips straight to
  // the plain form (used by the "start blank" link below).
  if (!show && !blank) {
    const [shows, setlistsByShow] = await Promise.all([getCachedShows(), getCachedSetlistsByShow()])
    const today = todayISO()
    // A show that already has a setlist has nothing left to quick-pick for
    // — skip it so the next upcoming show without one takes its place.
    const showIdsWithSetlist = new Set(setlistsByShow.map(s => s.show_id))
    const upcoming = shows
      .filter(s => isUpcoming(s.show_date, today) && !showIdsWithSetlist.has(s.id))
      .sort((a, b) => (a.show_date ?? '').localeCompare(b.show_date ?? ''))

    return (
      <div className="max-w-xl">
        <Link href="/setlists" className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> Setlists
        </Link>
        <h1 className="mb-1 text-3xl font-bold text-gray-900">New setlist</h1>
        <p className="mb-7 text-sm text-gray-500">
          {upcoming.length > 0 ? 'Pick an upcoming show to create its setlist immediately, or start blank.' : 'Give your setlist a title to get started.'}
        </p>

        {upcoming.length > 0 && (
          <UpcomingShowPicker shows={upcoming.map(s => ({ id: s.id, title: s.title, show_date: s.show_date, venue: s.venue }))} />
        )}

        <Link
          href="/setlists/new?blank=1"
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gray-300 px-4 py-3.5 text-sm font-medium text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
        >
          <Plus className="h-4 w-4" /> New Setlist (start blank)
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-xl">
      <Link href={show ? `/shows/${show.id}` : '/setlists'} className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft className="h-4 w-4" /> {show ? show.title : 'Setlists'}
      </Link>
      <h1 className="mb-1 text-3xl font-bold text-gray-900">New setlist</h1>
      {show && <p className="mb-7 text-sm text-gray-500">For the show &ldquo;{show.title}&rdquo;</p>}
      {!show && <div className="mb-7" />}
      <SetlistForm onSubmit={createSetlist} linkedShow={show ? { id: show.id, title: show.title, show_date: show.show_date, venue: show.venue } : undefined} />
    </div>
  )
}
