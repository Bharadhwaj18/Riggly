'use client'

import { useState } from 'react'
import { CalendarDays, Search } from 'lucide-react'
import { createSetlistFromShow } from '@/actions/setlists'
import { Input } from '@/components/ui/Input'

interface PickShow { id: string; title: string; show_date: string | null; venue: string | null }

const SHOWN_BY_DEFAULT = 3

const dateLabel = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }) : ''

/**
 * Upcoming shows without a setlist, soonest first. The nearest few are listed straight away; typing searches all
 * of them by title, venue or date.
 */
export function UpcomingShowPicker({ shows }: { shows: PickShow[] }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = q
    ? shows.filter(s => [s.title, s.venue ?? '', dateLabel(s.show_date), s.show_date ?? ''].some(t => t.toLowerCase().includes(q)))
    : shows.slice(0, SHOWN_BY_DEFAULT)
  const more = shows.length - SHOWN_BY_DEFAULT

  return (
    <div className="mb-6 space-y-2">
      {shows.length > SHOWN_BY_DEFAULT && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search all ${shows.length} upcoming shows`}
            aria-label="Search upcoming shows"
            className="pl-9"
          />
        </div>
      )}
      {matches.map(s => (
        <form key={s.id} action={createSetlistFromShow.bind(null, s.id)}>
          <button
            type="submit"
            className="flex w-full items-center justify-between rounded-2xl border border-brand-200 bg-white px-4 py-3.5 text-left shadow-sm transition-colors hover:border-brand-400"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900">{s.title}</p>
              <p className="text-xs text-gray-400">
                {dateLabel(s.show_date)}
                {s.venue ? ` · ${s.venue}` : ''}
              </p>
            </div>
            <CalendarDays className="h-4 w-4 shrink-0 text-brand-300" />
          </button>
        </form>
      ))}
      {q && matches.length === 0 && <p className="px-1 py-2 text-sm text-gray-500">No upcoming show matches &ldquo;{query.trim()}&rdquo;.</p>}
      {!q && more > 0 && <p className="px-1 text-xs text-gray-500">{more} more upcoming {more === 1 ? 'show' : 'shows'}. Search to find {more === 1 ? 'it' : 'them'}.</p>}
    </div>
  )
}
