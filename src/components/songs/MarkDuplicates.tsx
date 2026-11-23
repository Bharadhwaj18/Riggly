'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Search } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { linkDuplicates } from '@/actions/songs'
import { useToast } from '@/components/ui/Toaster'
import { normalizeTitle, soundKey } from '@/lib/song-match'
import { cn } from '@/lib/utils'
import type { DuplicateSong } from './DuplicateGroups'

/** Pick two or more songs that are really the same song, for the ones the title matching doesn't catch. */
export function MarkDuplicates({ songs }: { songs: DuplicateSong[] }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [pending, start] = useTransition()

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const qs = soundKey(query)
    const list = q
      ? songs.filter(s => s.title.toLowerCase().includes(q) || normalizeTitle(s.title).includes(normalizeTitle(query)) || (qs.length >= 3 && soundKey(s.title).includes(qs)))
      : songs
    // What's already picked stays on top so it can't scroll out of sight.
    return [...list].sort((a, b) => Number(picked.includes(b.id)) - Number(picked.includes(a.id)) || a.title.localeCompare(b.title)).slice(0, 60)
  }, [songs, query, picked])

  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
  const close = (o: boolean) => { setOpen(o); if (!o) { setQuery(''); setPicked([]) } }

  const save = () => start(async () => {
    const res = await linkDuplicates(picked)
    if (res.error) { toast(res.error, 'error'); return }
    toast('Marked as duplicates. Pick the one to keep below.', 'success')
    close(false)
    router.refresh()
  })

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Copy className="h-4 w-4" /> Mark as duplicates</Button>
      <Modal open={open} onOpenChange={close} title="Mark songs as duplicates" description="Search and tick every copy of the same song. They’ll show up here so you can merge them." className="max-w-xl">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-300" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search songs…"
            className="w-full rounded-md border border-brand-200 py-2 pl-9 pr-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {shown.map(s => {
            const on = picked.includes(s.id)
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-pressed={on}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm', on ? 'bg-brand-100' : 'hover:bg-brand-50')}
                >
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-300')}>
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-gray-900">{s.title}</span>
                    <span className="block text-xs text-gray-500">{s.hasChart ? 'Has chord chart' : 'No chord chart'} · {s.setlists === 0 ? 'in no setlists' : `in ${s.setlists} setlist${s.setlists === 1 ? '' : 's'}`}</span>
                  </span>
                </button>
              </li>
            )
          })}
          {shown.length === 0 && <li className="py-6 text-center text-sm text-gray-400">No songs match</li>}
        </ul>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">{picked.length} selected</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => close(false)}>Cancel</Button>
            <Button onClick={save} loading={pending} disabled={picked.length < 2}>Mark as duplicates</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
