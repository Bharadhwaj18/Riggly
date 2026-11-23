'use client'

import { useMemo, useState } from 'react'
import { useTransition } from 'react'
import { Plus, Sparkles, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { addSongToSetlist } from '@/actions/setlists'
import { suggestSongs } from '@/lib/song-tags'
import { useToast } from '@/components/ui/Toaster'
import { SetlistShowType, type ShowTypeRow } from './ShowTypeField'
import type { Song } from '@/types'

interface Props {
  setlistId: string
  songs: Song[]
  currentSongIds: string[]
  /** In how many setlists each song has been. */
  plays: Record<string, number>
  showTypes: ShowTypeRow[]
  showTypeId: string | null
  knownTags: string[]
  /** New songs go into the section the setlist is currently in. */
  section: string | null
  canEdit: boolean
}

const SHOWN = 8

/** The songs that suit this kind of show, most played first. Adding one refills the list with the next. */
export function SuggestedSongs({ setlistId, songs, currentSongIds, plays, showTypes, showTypeId, knownTags, section, canEdit }: Props) {
  const toast = useToast()
  const [, start] = useTransition()
  const [adding, setAdding] = useState<string | null>(null)
  // Songs added from here, hidden at once; the page's own list catches up a moment later.
  const [justAdded, setJustAdded] = useState<string[]>([])
  const [seenIds, setSeenIds] = useState(currentSongIds)
  if (currentSongIds !== seenIds) { setSeenIds(currentSongIds); setJustAdded([]) }

  const type = showTypes.find(t => t.id === showTypeId) ?? null
  const suggestions = useMemo(
    () => (type ? suggestSongs(songs, type.tags, { exclude: new Set([...currentSongIds, ...justAdded]), plays, limit: SHOWN }) : []),
    [type, songs, currentSongIds, justAdded, plays],
  )

  const add = (songId: string) => {
    setAdding(songId)
    start(async () => {
      try {
        await addSongToSetlist(setlistId, songId, section)
        setJustAdded(prev => [...prev, songId])
      } catch {
        toast('Couldn’t add that song', 'error')
      } finally {
        setAdding(null)
      }
    })
  }

  return (
    <section className="mt-6 rounded-2xl border border-brand-200 bg-white p-4" aria-label="Suggested songs">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900"><Sparkles className="h-4 w-4 text-brand-500" /> Suggested songs</h2>
        <div className="w-full sm:w-auto sm:min-w-72">
          <SetlistShowType setlistId={setlistId} types={showTypes} value={showTypeId} knownTags={knownTags} canEdit={canEdit} />
        </div>
      </div>

      {!type ? (
        <p className="text-sm text-gray-500">Pick the type of show and the songs that suit it show up here.</p>
      ) : type.tags.length === 0 ? (
        <p className="text-sm text-gray-500">“{type.name}” has no tags yet. Edit the types and add the tags that suit it, like Hindi or Commercial.</p>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-gray-500">No more songs tagged {type.tags.join(', ')}. Tag more songs, or add any song with Add Songs.</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-gray-500">Tagged {type.tags.join(', ')}. Most matching first, then most played.</p>
          <ul className="divide-y divide-brand-100">
            {suggestions.map(({ song, matched }) => (
              <li key={song.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{song.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                    {matched.map(t => <span key={t} className="rounded bg-brand-100 px-1.5 py-px text-[10px] font-bold text-brand-700">{t}</span>)}
                    <span>{plays[song.id] ? `In ${plays[song.id]} setlist${plays[song.id] === 1 ? '' : 's'}` : 'Not in a setlist yet'}</span>
                    {!song.chord_chart?.trim() && <span className="inline-flex items-center gap-0.5 text-amber-700"><FileText className="h-3 w-3" /> No chart</span>}
                  </p>
                </div>
                {song.song_key && <span className="text-xs font-bold text-brand-500">{song.song_key}</span>}
                {canEdit && (
                  <Button size="sm" variant="ghost" loading={adding === song.id} onClick={() => add(song.id)}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
