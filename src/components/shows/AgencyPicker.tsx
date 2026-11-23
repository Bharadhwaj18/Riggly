'use client'

import { useState, useTransition } from 'react'
import { Check, ChevronDown, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { quickAddAgency } from '@/actions/event-management'

export interface AgencyChoice { id: string; name: string; base_location?: string | null }

/**
 * Pick the agency a show is booked through: type to search, or add a new one by name without leaving the form.
 * `value` is `directValue` for a direct booking.
 */
export function AgencyPicker({ id, agencies, value, directValue, onChange, onAdded, canAdd }: {
  id: string
  agencies: AgencyChoice[]
  value: string
  directValue: string
  onChange: (id: string) => void
  /** A new agency was created; the form adds it to its list. */
  onAdded: (agency: AgencyChoice) => void
  /** Whether this member may add agencies (edit access to Agencies). */
  canAdd: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adding, startAdding] = useTransition()

  const typed = query.trim()
  const q = typed.toLowerCase()
  const matches = q ? agencies.filter(a => a.name.toLowerCase().includes(q) || (a.base_location ?? '').toLowerCase().includes(q)) : agencies
  const exact = agencies.some(a => a.name.trim().toLowerCase() === q)
  const selected = agencies.find(a => a.id === value)

  const close = () => { setOpen(false); setQuery(''); setError(null) }
  const pick = (v: string) => { onChange(v); close() }
  const add = () => {
    setError(null)
    startAdding(async () => {
      const res = await quickAddAgency(typed)
      if (res.error || !res.agency) { setError(res.error ?? 'Couldn’t add that agency.'); return }
      onAdded(res.agency)
      pick(res.agency.id)
    })
  }

  return (
    <div>
      <button
        type="button" id={id} aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
      >
        <span className="min-w-0 truncate">{selected ? selected.name : 'Direct booking'}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-brand-100 px-3">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              value={query} onChange={e => { setQuery(e.target.value); setError(null) }}
              onKeyDown={e => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
                // Enter picks the top match, or adds the typed name when nothing matches.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (matches[0]) pick(matches[0].id)
                  else if (typed && canAdd && !adding) add()
                }
              }}
              placeholder={canAdd ? 'Search or add an agency' : 'Search agencies'}
              aria-label="Search agencies"
              className="min-h-11 w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {!typed && (
              <li>
                <button type="button" onClick={() => pick(directValue)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-600 hover:bg-brand-50">
                  <span className="flex-1">Direct booking</span>
                  {value === directValue && <Check className="h-4 w-4 text-brand-600" />}
                </button>
              </li>
            )}
            {matches.map(a => (
              <li key={a.id}>
                <button type="button" onClick={() => pick(a.id)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-brand-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-gray-900">{a.name}</span>
                    {a.base_location && <span className="block truncate text-xs text-gray-500">{a.base_location}</span>}
                  </span>
                  {value === a.id && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
                </button>
              </li>
            ))}
            {typed && !exact && (
              <li className="border-t border-brand-100">
                {canAdd ? (
                  <button type="button" onClick={add} disabled={adding} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-60">
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{adding ? 'Adding…' : <>Add &ldquo;{typed}&rdquo; as a new agency</>}</span>
                  </button>
                ) : (
                  <p className="px-3 py-2.5 text-xs text-gray-500">
                    {matches.length === 0 ? 'No agency by that name. ' : ''}Only members who can edit Agencies can add one. Ask an admin, or pick Direct booking for now.
                  </p>
                )}
              </li>
            )}
          </ul>
          {error && <p role="alert" className="border-t border-red-100 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
        </div>
      )}
    </div>
  )
}
