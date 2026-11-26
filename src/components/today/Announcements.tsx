'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Megaphone, PartyPopper, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Announcement } from '@/lib/today-config'

const KEY = 'riggly-dismissed-announcements'

const TONES = {
  info: { icon: Megaphone, box: 'border-brand-300 bg-brand-100', icn: 'text-brand-700' },
  good: { icon: PartyPopper, box: 'border-emerald-300 bg-emerald-50', icn: 'text-emerald-700' },
  warn: { icon: AlertTriangle, box: 'border-amber-300 bg-amber-50', icn: 'text-amber-700' },
} as const

function readDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[] } catch { return [] }
}

/** Notes from Riggly at the top of Today. Each can be closed, and stays closed on this device. */
export function Announcements({ items }: { items: Announcement[] }) {
  const [dismissed, setDismissed] = useState<string[] | null>(null)
  // Read after mounting: the server doesn't know what this device closed.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDismissed(readDismissed()) }, [])
  if (dismissed === null) return null
  const shown = items.filter(a => !dismissed.includes(a.id))
  if (shown.length === 0) return null

  const close = (id: string) => {
    // Only keep ids still live, so the list doesn't grow forever.
    const next = [...dismissed.filter(d => items.some(a => a.id === d)), id]
    setDismissed(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private window: closes for this visit only */ }
  }

  return (
    <div className="space-y-2">
      {shown.map(a => {
        const tone = TONES[a.tone] ?? TONES.info
        const Icon = tone.icon
        return (
          <section key={a.id} className={cn('animate-fade-up flex items-start gap-3 rounded-2xl border p-4', tone.box)}>
            <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', tone.icn)} />
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-gray-900">{a.title}</h2>
              {a.body && <p className="mt-0.5 whitespace-pre-line text-sm text-gray-700">{a.body}</p>}
              {a.link_url && (
                a.link_url.startsWith('/')
                  ? <Link href={a.link_url} className="mt-2 inline-block text-sm font-bold text-brand-700 underline">{a.link_label || 'Open'}</Link>
                  : <a href={a.link_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-bold text-brand-700 underline">{a.link_label || 'Open'}</a>
              )}
            </div>
            <button type="button" onClick={() => close(a.id)} aria-label={`Close “${a.title}”`}
              className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-black/5 hover:text-gray-800">
              <X className="h-4 w-4" />
            </button>
          </section>
        )
      })}
    </div>
  )
}
