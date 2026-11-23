'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, FileText, ListMusic } from 'lucide-react'
import { mergeSongs, markNotDuplicates } from '@/actions/songs'
import { useToast } from '@/components/ui/Toaster'
import { Button } from '@/components/ui/Button'

export interface DuplicateSong {
  id: string
  title: string
  artist: string | null
  song_key: string | null
  hasChart: boolean
  setlists: number
}

/** Songs that look like copies of each other: pick the one to keep and the rest fold into it. */
export function DuplicateGroups({ groups, canEdit }: { groups: DuplicateSong[][]; canEdit: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  const merge = (group: DuplicateSong[], keep: DuplicateSong) => {
    const others = group.filter(s => s.id !== keep.id)
    const used = others.reduce((n, s) => n + s.setlists, 0)
    const ok = window.confirm(
      `Keep “${keep.title}” and merge ${others.length === 1 ? 'the other copy' : `the other ${others.length} copies`} into it?` +
      (used ? ` ${used === 1 ? 'The setlist' : `The ${used} setlists`} using the other ${others.length === 1 ? 'copy' : 'copies'} will use “${keep.title}” instead.` : '') +
      ' Any chord chart, key or notes it’s missing are filled in from the copies. This can’t be undone.'
    )
    if (!ok) return
    setBusy(keep.id)
    start(async () => {
      for (const other of others) {
        const res = await mergeSongs(keep.id, other.id)
        if (res.error) { toast(res.error, 'error'); setBusy(null); router.refresh(); return }
      }
      toast('Merged', 'success')
      setBusy(null)
      router.refresh()
    })
  }

  const notTheSame = (group: DuplicateSong[]) => {
    setBusy(group[0].id)
    start(async () => {
      const res = await markNotDuplicates(group.map(s => s.id))
      if (res.error) toast(res.error, 'error')
      else toast('Got it, these won’t be suggested again', 'success')
      setBusy(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {groups.map(group => {
        // The suggested one to keep: has a chord chart, then used in the most setlists.
        const best = [...group].sort((a, b) => Number(b.hasChart) - Number(a.hasChart) || b.setlists - a.setlists)[0]
        return (
          <section key={group.map(s => s.id).join()} className="rounded-2xl border border-brand-200 bg-white p-4">
            <ul className="divide-y divide-brand-100">
              {group.map(s => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/songs/${s.id}`} target="_blank" className="font-bold text-gray-900 underline-offset-2 hover:underline">{s.title}</Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
                      {s.song_key && <span>Key {s.song_key}</span>}
                      <span className={s.hasChart ? 'inline-flex items-center gap-1 font-medium text-green-700' : 'inline-flex items-center gap-1'}>
                        <FileText className="h-3 w-3" /> {s.hasChart ? 'Has chord chart' : 'No chord chart'}
                      </span>
                      <span className="inline-flex items-center gap-1"><ListMusic className="h-3 w-3" /> {s.setlists === 0 ? 'In no setlists' : `In ${s.setlists} setlist${s.setlists === 1 ? '' : 's'}`}</span>
                    </p>
                  </div>
                  {canEdit && (
                    <Button size="sm" variant={s.id === best.id ? 'primary' : 'secondary'} disabled={pending} loading={busy === s.id && pending} onClick={() => merge(group, s)}>
                      <Check className="h-4 w-4" /> Keep this one
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-brand-100 pt-3 text-xs text-gray-500">
                <span>Keeping one moves the setlists and notes of the others onto it.</span>
                <button type="button" disabled={pending} onClick={() => notTheSame(group)} className="shrink-0 font-bold text-brand-700 underline underline-offset-2 disabled:opacity-60">
                  These are different songs
                </button>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
