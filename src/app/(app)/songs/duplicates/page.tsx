import Link from 'next/link'
import { ChevronLeft, Sparkles } from 'lucide-react'
import { sectionGuard } from '@/lib/section-guard'
import { getWorkspaceContext } from '@/lib/workspace'
import { getCachedSongs, getCachedSetlistSongCounts } from '@/lib/data'
import { getDuplicateGroups } from '@/lib/duplicates'
import { DuplicateGroups, type DuplicateSong } from '@/components/songs/DuplicateGroups'
import { MarkDuplicates } from '@/components/songs/MarkDuplicates'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'

export default async function DuplicateSongsPage() {
  const denied = await sectionGuard('songs')
  if (denied) return denied
  const [ctx, songs, usage] = await Promise.all([getWorkspaceContext(), getCachedSongs(), getCachedSetlistSongCounts()])

  const setlistCounts: Record<string, number> = {}
  for (const row of usage) setlistCounts[row.song_id] = (setlistCounts[row.song_id] ?? 0) + 1

  const canEdit = ctx?.current.sections.songs === 'edit'
  const toRow = (s: (typeof songs)[number]): DuplicateSong => ({
    id: s.id, title: s.title, artist: s.artist, song_key: s.song_key, hasChart: !!s.chord_chart?.trim(), setlists: setlistCounts[s.id] ?? 0,
  })
  const groups = (await getDuplicateGroups(songs)).map(g => g.map(toRow))

  return (
    <div>
      <Link href="/songs" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft className="h-4 w-4" /> Songs
      </Link>
      <PageHeader
        title="Possible duplicates"
        subtitle={groups.length ? `${groups.length} ${groups.length === 1 ? 'song looks' : 'songs look'} like it’s in your list more than once` : undefined}
        action={canEdit ? <MarkDuplicates songs={songs.map(toRow)} /> : undefined}
      />
      {groups.length ? (
        <>
          <p className="mb-4 text-sm text-gray-600">
            These have the same title, a spelling that looks alike, or you marked them yourself. Pick the one to keep: its setlists, notes and links stay, and anything it’s missing (like a chord chart) is filled in from the others.
          </p>
          <DuplicateGroups groups={groups} canEdit={canEdit} />
        </>
      ) : (
        <EmptyState icon={<Sparkles className="h-12 w-12" />} title="No duplicates" description="Every song in your list looks different from the others. If two are really the same song, mark them yourself." />
      )}
    </div>
  )
}
