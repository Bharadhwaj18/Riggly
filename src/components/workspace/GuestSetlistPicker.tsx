'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatGuestDate } from '@/lib/setlist-guest'
import type { SetlistOption } from './settings-types'

const fieldCls = 'block w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm text-gray-900'

/** Tick the setlists a setlist guest can see. Upcoming shows first, then the most recent; a search box once there are many. */
export function GuestSetlistPicker({ setlists, value, onChange, today, disabled }: {
  setlists: SetlistOption[]
  value: string[]
  onChange: (ids: string[]) => void
  /** 'YYYY-MM-DD', to put upcoming shows first. */
  today: string
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const upcoming = setlists.filter(s => s.showDate && s.showDate >= today).sort((a, b) => (a.showDate ?? '').localeCompare(b.showDate ?? ''))
  const rest = setlists.filter(s => !upcoming.includes(s))
  const q = query.trim().toLowerCase()
  const shown = [...upcoming, ...rest].filter(s => !q || s.title.toLowerCase().includes(q))
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])

  if (setlists.length === 0) {
    return <p className="rounded-xl border border-dashed border-brand-200 px-4 py-6 text-center text-sm text-gray-500">No setlists yet. Make one in Setlists first.</p>
  }

  return (
    <div>
      {setlists.length > 8 && (
        <label className="relative mb-2 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a setlist" aria-label="Find a setlist"
            className={cn(fieldCls, 'pl-9')} />
        </label>
      )}
      <ul className="max-h-64 divide-y divide-brand-100 overflow-y-auto rounded-xl border border-brand-200 bg-white">
        {shown.map(s => {
          const on = value.includes(s.id)
          return (
            <li key={s.id}>
              <label className={cn('flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2', on ? 'bg-brand-50' : 'hover:bg-brand-50')}>
                <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(s.id)} className="h-4 w-4 shrink-0 accent-brand-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-gray-900">{s.title}</span>
                  {s.showDate && (
                    <span className="block text-xs text-gray-500">
                      {formatGuestDate(s.showDate)}{s.showDate >= today && <span className="ml-1.5 font-bold text-emerald-700">Upcoming</span>}
                    </span>
                  )}
                </span>
              </label>
            </li>
          )
        })}
        {shown.length === 0 && <li className="px-3 py-4 text-sm text-gray-500">No setlists match that.</li>}
      </ul>
      <p className="mt-1.5 text-xs text-gray-500">{value.length === 0 ? 'None picked yet.' : `${value.length} picked.`}</p>
    </div>
  )
}

/** The last day a guest can look. */
export function GuestUntilField({ value, onChange, today, max, disabled }: { value: string; onChange: (v: string) => void; today: string; max: string; disabled?: boolean }) {
  return (
    <label className="block max-w-xs text-xs font-semibold text-gray-600">
      Can look until (the end of this day)
      <input type="date" value={value} min={today} max={max} disabled={disabled} onChange={e => onChange(e.target.value)} className={cn(fieldCls, 'mt-1')} />
    </label>
  )
}
