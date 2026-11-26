'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Plus, Search } from 'lucide-react'
import { useToast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'
import { addSongReference, searchReferences } from '@/actions/song-references'
import type { SearchResult } from '@/lib/reference-lookup'
import { formatTime } from '@/lib/song-references'
import { Cover } from './Cover'

interface Props {
  songId: string
  /** The song's title and artist: searched for as soon as the finder opens. */
  songTitle: string
  songArtist: string | null
  /** YouTube ids already saved on this song, shown as added. */
  addedIds: string[]
}

const field = 'w-full rounded-xl border border-brand-200 bg-white px-3 text-[15px] text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30'

/** Find a song's YouTube versions without leaving the page: results for its title come up already, tap one to add it. */
export function ReferenceFinder({ songId, songTitle, songArtist, addedIds }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [query, setQuery] = useState(() => [songTitle, songArtist].filter(Boolean).join(' '))
  const [results, setResults] = useState<SearchResult[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [searching, setSearching] = useState(() => [songTitle, songArtist].filter(Boolean).join(' ').trim().length >= 2)
  const [adding, setAdding] = useState<string | null>(null)
  // Added just now, before the refreshed page lists them.
  const [justAdded, setJustAdded] = useState<string[]>([])
  const [, startTransition] = useTransition()
  const latest = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Only the newest search may land, so a slow older answer can't overwrite a newer one.
  const load = async (q: string, ticket: number) => {
    const res = await searchReferences('youtube', q)
    if (ticket !== latest.current) return
    setSearching(false)
    setResults(res.results ?? [])
    setNote(res.error ?? null)
  }

  const onType = (q: string) => {
    setQuery(q)
    clearTimeout(timer.current)
    if (q.trim().length < 2) { latest.current++; setResults([]); setNote(null); setSearching(false); return }
    const ticket = ++latest.current
    setSearching(true)
    // Each YouTube search uses part of a daily allowance, so typing waits for a pause.
    timer.current = setTimeout(() => load(q, ticket), 600)
  }

  // The first search happens at once; the finder is only mounted when the section opens.
  useEffect(() => {
    if (!searching) return
    load(query, ++latest.current)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const add = (r: SearchResult) => {
    setAdding(r.id)
    startTransition(async () => {
      const res = await addSongReference({ songId, link: r.url, label: 'Original', moments: [] })
      setAdding(null)
      if (res.error) { toast(res.error, 'error'); return }
      setJustAdded(a => [...a, r.id])
      toast('Reference added. Change its label from its ⋮ menu.', 'success')
      router.refresh()
    })
  }

  return (
    <div className="animate-fade-up space-y-2 rounded-2xl border border-brand-200 bg-white p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input value={query} onChange={e => onType(e.target.value)} type="search" aria-label="Search YouTube"
          placeholder="Search YouTube" className={cn(field, 'min-h-12 pl-9')} />
      </div>
      {note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{note}</p>}
      {searching && results.length === 0 && <p className="px-1 text-sm text-gray-500">Searching YouTube…</p>}
      {!searching && !note && results.length === 0 && query.trim().length >= 2 && <p className="px-1 text-sm text-gray-500">Nothing found. Try different words.</p>}
      <div className="max-h-80 space-y-0.5 overflow-y-auto">
        {results.map(r => {
          const done = addedIds.includes(r.id) || justAdded.includes(r.id)
          return (
            <div key={r.id} className="flex items-center gap-1 rounded-xl hover:bg-brand-50">
              <button type="button" disabled={done || adding !== null} onClick={() => add(r)}
                aria-label={done ? `${r.title} is already added` : `Add ${r.title}`}
                className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 px-2 text-left disabled:cursor-default">
                <Cover url={r.thumbnailUrl} title={r.title} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-gray-900">{r.title}</span>
                  <span className="block truncate text-xs font-semibold text-gray-500">{r.artist}{r.durationMs !== null ? ` · ${formatTime(r.durationMs / 1000)}` : ''}</span>
                </span>
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', done ? 'bg-brand-600 text-white' : 'border border-brand-200 text-gray-500', adding === r.id && 'animate-pulse')}>
                  {done ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </span>
              </button>
              <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`Open “${r.title}” on YouTube`}
                className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:text-gray-700">
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}
