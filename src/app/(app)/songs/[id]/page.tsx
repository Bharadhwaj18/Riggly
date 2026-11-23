import { notFound } from 'next/navigation'
import { sectionGuard } from '@/lib/section-guard'
import { LinkedNotes } from '@/components/notes/LinkedNotes'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { getCachedSong, getCachedSetlist, getCachedAllProfiles, getCachedSetlistSongs, getCachedUser, getCachedRecordings, getCachedSongs, getCachedSongReferences, getCachedWorkspaceGroups, getCachedSongGroupNotes } from '@/lib/data'
import { SongViews, type NoteView } from '@/components/groups/SongViews'
import { getWorkspaceContext } from '@/lib/workspace'
import { toPlayable, type PlayableReference } from '@/lib/song-references'
import { SongReferences } from '@/components/references/SongReferences'
import { Cover } from '@/components/references/Cover'
import { ServiceMark } from '@/components/references/ServiceMark'
import { availableSearchSources } from '@/lib/reference-lookup'
import { SOURCE_NAMES } from '@/lib/song-references'
import { ChordViewer } from '@/components/songs/ChordViewer'
import { SongEditProvider, LockToggle } from '@/components/songs/SongEditContext'
import { SongDetails, SongNotesCard } from '@/components/songs/SongDetails'
import { ActiveSetlistSync } from '@/components/setlists/ActiveSetlistSync'
import { RecordingsList } from '@/components/recordings/RecordingsList'
import { Button } from '@/components/ui/Button'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { SongPdfExport } from '@/components/pdf/SongPdfExport'
import { ACTIVE_SETLIST_COOKIE } from '@/lib/setlist-context'
import type { RecordingWithSong } from '@/types'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; stage?: string }>
}

export default async function SongPage({ params, searchParams }: Props) {
  const denied = await sectionGuard('songs')
  if (denied) return denied
  const { id } = await params
  const { from, stage } = await searchParams

  // `from` in the URL is the explicit, authoritative source. When it's
  // missing — browser back/forward, a bookmarked/shared link, or any link
  // that simply forgot to carry it — fall back to the last setlist we know
  // was active, so context isn't lost just because one hop dropped it.
  const explicitSetlistId = from?.match(/^\/setlists\/([^/]+)$/)?.[1] ?? null
  const cookieSetlistId = explicitSetlistId
    ? null
    : (await cookies()).get(ACTIVE_SETLIST_COOKIE)?.value ?? null
  const setlistId = explicitSetlistId ?? cookieSetlistId
  const canonicalFrom = setlistId ? `/setlists/${setlistId}` : null

  const [song, setlist, profiles, { data: { user } }, setlistSongs, recordings, allSongs, referenceRows, ctx, groups, groupNotes] = await Promise.all([
    getCachedSong(id),
    setlistId ? getCachedSetlist(setlistId) : Promise.resolve(null),
    getCachedAllProfiles(),
    getCachedUser(),
    setlistId ? getCachedSetlistSongs(setlistId) : Promise.resolve([]),
    getCachedRecordings(),
    getCachedSongs(),
    getCachedSongReferences(id),
    getWorkspaceContext(),
    getCachedWorkspaceGroups(),
    getCachedSongGroupNotes(id),
  ])

  if (!song) notFound()

  const references = referenceRows.map(toPlayable).filter((r): r is PlayableReference => !!r)
  const canEditSongs = ctx?.current.sections.songs !== 'view'
  // The reference the cover art came from, linked under the title (Spotify requires a link back for its artwork).
  const coverFrom = song.cover_url ? references.find(r => r.thumbnailUrl === song.cover_url) : undefined

  const taggedRecordings = (recordings as RecordingWithSong[]).filter(r => r.song_id === id)

  const nameOf = (uid: string) =>
    uid === user?.id ? 'You' : (profiles.find(p => p.id === uid)?.display_name ?? 'Band member')

  const notesForView: Record<string, NoteView> = Object.fromEntries(Object.entries(groupNotes).map(([groupId, note]) => [
    groupId, { content: note.content, updatedAt: note.updatedAt, updatedByName: note.updatedBy ? nameOf(note.updatedBy) : null },
  ]))

  // Where this song sits in the setlist we arrived from, for the previous / next bar.
  const position = setlistSongs.findIndex(ss => ss.song_id === id)
  const prevSong = position > 0 ? setlistSongs[position - 1] : null
  const nextSong = position >= 0 && position < setlistSongs.length - 1 ? setlistSongs[position + 1] : null
  const songHref = (songId: string) => `/songs/${songId}?from=${encodeURIComponent(canonicalFrom ?? '')}`

  const editHref = canonicalFrom ? `/songs/${id}/edit?from=${encodeURIComponent(canonicalFrom)}` : `/songs/${id}/edit`

  return (
    <div>
      <ActiveSetlistSync setlistId={setlistId} />

      {canonicalFrom ? (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-emerald-100 px-4 py-2.5 text-sm font-semibold text-emerald-800">
          <Link href={canonicalFrom} className="inline-flex min-w-0 items-center gap-1 hover:underline">
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {setlist?.title ?? 'Setlist'}{position >= 0 && ` · song ${position + 1} of ${setlistSongs.length}`}
            </span>
          </Link>
          <span className="flex shrink-0 items-center gap-3 font-bold">
            {prevSong ? <Link href={songHref(prevSong.song_id)} className="inline-flex items-center hover:underline"><ChevronLeft className="h-4 w-4" />Previous</Link> : null}
            {nextSong ? <Link href={songHref(nextSong.song_id)} className="inline-flex items-center hover:underline">Next<ChevronRight className="h-4 w-4" /></Link> : null}
          </span>
        </div>
      ) : (
        <Link href="/songs" className="mb-5 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> Songs
        </Link>
      )}

      <SongEditProvider
        songId={id}
        canEdit={canEditSongs}
        initial={{
          title: song.title,
          artist: song.artist ?? '',
          song_key: song.song_key ?? '',
          bpm: song.bpm ?? null,
          time_signature: song.time_signature ?? '',
          notes: song.notes ?? '',
        }}
      >
      {/* Header: the details become fields when the song is unlocked. */}
      {/* Phone: the details take the full width, with the buttons under them. */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 sm:flex-1">
          <SongDetails
            cover={song.cover_url ? <Cover url={song.cover_url} title={song.title} size={72} /> : undefined}
            coverLink={coverFrom ? (
              <a href={coverFrom.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-800">
                <ServiceMark source={coverFrom.source} size={12} />Cover from {SOURCE_NAMES[coverFrom.source]}
              </a>
            ) : undefined}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {/* On a phone the lock sits on the chart bar just below, so it isn't shown twice. */}
          <LockToggle showStatus={false} className="hidden sm:flex" />
          <SongPdfExport song={song} />
          <Button variant="secondary" size="sm" asChild>
            <Link href={editHref}><Pencil className="h-4 w-4" /> Edit details</Link>
          </Button>
        </div>
      </div>

      {/* Phone: references, then the chord chart, then the rest. Desktop: chart on the left, references heading the right column. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* Chord chart — keyed by song id so navigating between songs (e.g. via
            setlist prev/next, which reuse this same route) remounts with fresh
            state instead of needing an effect to manually reset it. */}
        <SongViews
          songId={id}
          groups={groups}
          myGroupIds={groups.filter(g => user && g.memberIds.includes(user.id)).map(g => g.id)}
          isAdmin={ctx?.current.role === 'owner' || ctx?.current.role === 'admin'}
          canEditSongs={canEditSongs}
          notes={notesForView}
          chart={<div data-tour="song-chart"><ChordViewer
          key={id}
          chordChart={song.chord_chart ?? ''}
          songKey={song.song_key}
          songId={id}
          songTitle={song.title}
          bpm={song.bpm}
          setlistId={setlistId ?? undefined}
          setlistTitle={setlist?.title}
          notes={song.notes}
          autoStage={stage === '1'}
          setlistSongs={setlistSongs.map(ss => ({
            id: ss.song_id,
            title: ss.song.title,
            chord_chart: ss.song.chord_chart ?? '',
            song_key: ss.song.song_key ?? null,
            bpm: ss.song.bpm ?? null,
            notes: ss.song.notes ?? null,
            section: ss.section ?? null,
          }))}
        /></div>}
        />

        <aside className="contents lg:block lg:space-y-4">
          <div className="order-first lg:order-none"><SongReferences songId={id} references={references} canEdit={canEditSongs} searchSources={availableSearchSources()} /></div>
          <SongNotesCard />

          <div className="mb-6"><LinkedNotes songId={id} /></div>

      {/* Recordings tagged to this song — reuses the same list component as
              /recordings, filtered down to this song's own tag. */}
          {taggedRecordings.length > 0 && (
            <div>
              <SectionLabel className="mb-2">Recordings · {taggedRecordings.length}</SectionLabel>
              <RecordingsList
                recordings={taggedRecordings}
                songs={allSongs.map(s => ({ id: s.id, title: s.title }))}
              />
            </div>
          )}

          <p className="px-1 text-xs leading-relaxed text-gray-400">
            Added by <span className="font-medium text-gray-600">{nameOf(song.created_by)}</span>
            {song.updated_by && <> · Last edited by <span className="font-medium text-gray-600">{nameOf(song.updated_by)}</span></>}
          </p>
        </aside>
      </div>
      </SongEditProvider>
    </div>
  )
}
