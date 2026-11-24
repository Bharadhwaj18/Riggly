'use client'

import { useState } from 'react'
import { CalendarClock, Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addDaysISO } from '@/lib/dates'
import { COMES_ALONG, ITEM_NOUN, PRESETS, formatDay, presetLevels, type AccessGrant, type AccessPreset } from '@/lib/access'
import { SECTIONS, type SectionKey, type SectionLevel, type SectionLevels } from '@/lib/workspace-sections'
import type { ShareItem, ShareableItems } from './settings-types'

export interface AccessValue {
  sections: SectionLevels
  accessUntil: string | null
  grants: AccessGrant[]
}

const LEVEL_OPTIONS: { value: SectionLevel; label: string }[] = [
  { value: 'none', label: 'Off' },
  { value: 'items', label: 'Only these' },
  { value: 'view', label: 'View all' },
  { value: 'edit', label: 'Edit all' },
]

const fieldCls = 'min-h-9 rounded-lg border border-brand-200 bg-white px-2 text-sm text-gray-900 disabled:opacity-60'

/**
 * Who can open what: per feature Off, Only these items, View all or Edit all; for "Only these", pick the items
 * (each View or Edit, each with an optional last day); and an optional last day for everything.
 */
export function AccessEditor({ value, onChange, items, today, offSections = [], disabled, showPresets = true }: {
  value: AccessValue
  onChange: (next: AccessValue) => void
  items: ShareableItems
  /** 'YYYY-MM-DD' in India. */
  today: string
  /** Features this workspace has switched off. */
  offSections?: SectionKey[]
  disabled?: boolean
  showPresets?: boolean
}) {
  const sections = SECTIONS.filter(s => !offSections.includes(s.key))
  const maxDay = addDaysISO(today, 366)
  const setLevel = (key: SectionKey, level: SectionLevel) => onChange({ ...value, sections: { ...value.sections, [key]: level } })
  const setGrants = (key: SectionKey, next: AccessGrant[]) => onChange({ ...value, grants: [...value.grants.filter(g => g.section !== key), ...next] })
  const applyPreset = (p: AccessPreset) => onChange({
    sections: presetLevels(p),
    accessUntil: p === 'setlist_guest' ? value.accessUntil ?? addDaysISO(today, 7) : value.accessUntil,
    grants: value.grants,
  })

  return (
    <div className="space-y-5">
      {showPresets && (
        <div>
          <p className="mb-1.5 text-xs font-bold text-gray-600">Start from</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button key={p.key} type="button" disabled={disabled} onClick={() => applyPreset(p.key)} title={p.text}
                className="min-h-9 rounded-full border border-brand-200 bg-white px-3 text-xs font-extrabold text-gray-700 hover:bg-brand-50">
                {p.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-brand-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <CalendarClock className="h-4 w-4 shrink-0 text-brand-600" />
          <span className="text-sm font-bold text-gray-900">Access ends</span>
          <div role="group" aria-label="Access ends" className="inline-flex rounded-full bg-brand-100 p-0.5">
            {([['Never', false], ['On a date', true]] as const).map(([label, on]) => (
              <button key={label} type="button" disabled={disabled} aria-pressed={!!value.accessUntil === on}
                onClick={() => onChange({ ...value, accessUntil: on ? value.accessUntil ?? addDaysISO(today, 7) : null })}
                className={cn('min-h-8 rounded-full px-3 text-xs font-bold', !!value.accessUntil === on ? 'bg-white text-gray-900 shadow-sm ring-1 ring-brand-200' : 'text-gray-500')}>
                {label}
              </button>
            ))}
          </div>
          {value.accessUntil && (
            <input type="date" value={value.accessUntil} min={today} max={maxDay} disabled={disabled} aria-label="Last day"
              onChange={e => onChange({ ...value, accessUntil: e.target.value || null })} className={fieldCls} />
          )}
        </div>
        {value.accessUntil && <p className="mt-1.5 text-xs text-gray-500">From {formatDay(addDaysISO(value.accessUntil, 1))} they won’t see anything here.</p>}
      </div>

      <ul className="divide-y divide-brand-100 overflow-hidden rounded-xl border border-brand-200 bg-white">
        {sections.map(s => {
          const level = value.sections[s.key]
          const mine = value.grants.filter(g => g.section === s.key)
          return (
            <li key={s.key} className="px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={cn('text-sm font-bold', level === 'none' ? 'text-gray-400' : 'text-gray-900')}>{s.label}</span>
                <div role="radiogroup" aria-label={`${s.label} access`} className="inline-flex flex-wrap rounded-lg border border-brand-200 p-0.5">
                  {LEVEL_OPTIONS.map(o => (
                    <button key={o.value} type="button" role="radio" aria-checked={level === o.value} disabled={disabled}
                      onClick={() => setLevel(s.key, o.value)}
                      className={cn('min-h-8 rounded-md px-2.5 text-xs font-bold transition-colors',
                        level === o.value ? (o.value === 'none' ? 'bg-gray-100 text-gray-700' : 'bg-brand-400 text-white') : 'text-gray-500 hover:bg-brand-50')}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {level === 'items' && (
                <SharedItems section={s.key} grants={mine} onChange={next => setGrants(s.key, next)} options={items[s.key] ?? []}
                  today={today} maxDay={maxDay} disabled={disabled} />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The items shared in one feature: each with View/Edit and an optional last day, plus a search to add more. */
function SharedItems({ section, grants, onChange, options, today, maxDay, disabled }: {
  section: SectionKey
  grants: AccessGrant[]
  onChange: (next: AccessGrant[]) => void
  options: ShareItem[]
  today: string
  maxDay: string
  disabled?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const noun = ITEM_NOUN[section]
  const byId = new Map(options.map(o => [o.id, o]))
  const chosen = new Set(grants.map(g => g.itemId))
  const q = query.trim().toLowerCase()
  // Upcoming first (soonest), then the rest as listed (newest first).
  const upcoming = options.filter(o => o.date && o.date >= today).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const rest = options.filter(o => !upcoming.includes(o))
  const choices = [...upcoming, ...rest].filter(o => !chosen.has(o.id) && (!q || `${o.title} ${o.detail ?? ''}`.toLowerCase().includes(q))).slice(0, 40)
  const update = (id: string, patch: Partial<AccessGrant>) => onChange(grants.map(g => (g.itemId === id ? { ...g, ...patch } : g)))

  return (
    <div className="mt-2.5 rounded-lg bg-brand-50 p-2">
      {grants.length === 0 && <p className="px-1 py-1 text-xs text-gray-500">No {noun.many} shared yet{section === 'merch' ? ' (kits they’re put on still count)' : ''}.</p>}
      <ul className="space-y-1.5">
        {grants.map(g => {
          const item = byId.get(g.itemId)
          return (
            <li key={g.itemId} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-900">{item?.title ?? 'No longer there'}</span>
                {(item?.detail || item?.date) && (
                  <span className="block truncate text-xs text-gray-500">{[item?.detail, item?.date && formatDay(item.date)].filter(Boolean).join(' · ')}</span>
                )}
              </span>
              <select value={g.level} disabled={disabled} aria-label={`What they can do with ${item?.title ?? 'this'}`}
                onChange={e => update(g.itemId, { level: e.target.value === 'edit' ? 'edit' : 'view' })} className={fieldCls}>
                <option value="view">View</option>
                <option value="edit">Edit</option>
              </select>
              <input type="date" value={g.until ?? ''} min={today} max={maxDay} disabled={disabled} aria-label={`Last day for ${item?.title ?? 'this'}`}
                title="Last day (leave empty for no end)" onChange={e => update(g.itemId, { until: e.target.value || null })} className={cn(fieldCls, 'w-[8.5rem]')} />
              <button type="button" disabled={disabled} onClick={() => onChange(grants.filter(x => x.itemId !== g.itemId))} aria-label={`Stop sharing ${item?.title ?? 'this'}`}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><X className="h-4 w-4" /></button>
            </li>
          )
        })}
      </ul>

      {adding ? (
        <div className="mt-2 rounded-lg bg-white p-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={`Find a ${noun.one}`} aria-label={`Find a ${noun.one}`}
              className="min-h-9 w-full rounded-lg border border-brand-200 bg-white pl-8 pr-2 text-sm text-gray-900" />
          </label>
          <ul className="mt-1.5 max-h-56 overflow-y-auto">
            {choices.map(o => (
              <li key={o.id}>
                <button type="button" disabled={disabled}
                  onClick={() => { onChange([...grants, { section, itemId: o.id, level: 'view', until: null }]); setQuery('') }}
                  className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-brand-50">
                  <Plus className="h-4 w-4 shrink-0 text-brand-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">{o.title}</span>
                    {(o.detail || o.date) && <span className="block truncate text-xs text-gray-500">{[o.detail, o.date && formatDay(o.date)].filter(Boolean).join(' · ')}</span>}
                  </span>
                  {o.date && o.date >= today && <span className="shrink-0 text-[11px] font-bold text-emerald-700">Upcoming</span>}
                </button>
              </li>
            ))}
            {choices.length === 0 && <li className="px-2 py-3 text-xs text-gray-500">{options.length === 0 ? `No ${noun.many} yet.` : 'Nothing else matches.'}</li>}
          </ul>
          <button type="button" onClick={() => { setAdding(false); setQuery('') }} className="mt-1 text-xs font-bold text-gray-500 hover:underline">Done</button>
        </div>
      ) : (
        <button type="button" disabled={disabled} onClick={() => setAdding(true)}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-extrabold text-brand-700 hover:bg-white">
          <Plus className="h-4 w-4" /> Share {grants.length ? 'another' : `a ${noun.one}`}
        </button>
      )}
      {COMES_ALONG[section] && <p className="mt-1 px-1 text-xs text-gray-500">Comes along, view only: {COMES_ALONG[section]}</p>}
    </div>
  )
}
