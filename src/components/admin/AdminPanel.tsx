'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, Search, Sparkles, Users } from 'lucide-react'
import { setCoreFeatures, setWorkspaceFeatures } from '@/actions/admin'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { useToast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'
import { SECTIONS, type SectionKey, type WorkspaceFeatures } from '@/lib/workspace-sections'

export interface AdminWorkspace {
  id: string
  name: string
  type: string
  kind: string | null
  color: string
  plan: string
  createdAt: string
  ownerName: string | null
  ownerEmail: string | null
  members: number
  features: WorkspaceFeatures
}

const card = 'rounded-2xl border border-brand-200 bg-white p-5 shadow-sm'
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const allOn = () => Object.fromEntries(SECTIONS.map(s => [s.key, true])) as WorkspaceFeatures
const fromList = (keys: SectionKey[]) => Object.fromEntries(SECTIONS.map(s => [s.key, keys.includes(s.key)])) as WorkspaceFeatures
const same = (a: WorkspaceFeatures, b: WorkspaceFeatures) => SECTIONS.every(s => a[s.key] === b[s.key])

/** Tap-to-toggle chips, one per section. */
function FeatureChips({ value, onChange, disabled }: { value: WorkspaceFeatures; onChange: (v: WorkspaceFeatures) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SECTIONS.map(s => (
        <Chip key={s.key} active={value[s.key]} disabled={disabled} onClick={() => onChange({ ...value, [s.key]: !value[s.key] })}>
          {s.label}
        </Chip>
      ))}
    </div>
  )
}

function CoreCard({ initial }: { initial: SectionKey[] }) {
  const [saved, setSaved] = useState(fromList(initial))
  const [value, setValue] = useState(saved)
  const [pending, start] = useTransition()
  const toast = useToast()
  const save = () => start(async () => {
    const res = await setCoreFeatures(SECTIONS.filter(s => value[s.key]).map(s => s.key))
    if (res.error) { toast(res.error, 'error'); return }
    setSaved(value)
    toast('Core features saved', 'success')
  })
  return (
    <section className={card}>
      <SectionLabel className="mb-1 flex items-center gap-2"><Sparkles className="h-4 w-4" /> Core features</SectionLabel>
      <p className="mb-3 text-sm text-gray-500">What a brand-new workspace starts with. Changing this doesn&rsquo;t touch workspaces that already exist.</p>
      <FeatureChips value={value} onChange={setValue} disabled={pending} />
      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" onClick={save} loading={pending} disabled={same(value, saved)}>Save core features</Button>
        {!same(value, saved) && <button type="button" onClick={() => setValue(saved)} className="text-xs font-semibold text-gray-500 underline">Undo</button>}
      </div>
    </section>
  )
}

function WorkspaceRow({ w, core }: { w: AdminWorkspace; core: SectionKey[] }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(w.features)
  const [value, setValue] = useState(w.features)
  const [pending, start] = useTransition()
  const toast = useToast()
  const onCount = SECTIONS.filter(s => saved[s.key]).length
  const save = () => start(async () => {
    const res = await setWorkspaceFeatures(w.id, value)
    if (res.error) { toast(res.error, 'error'); return }
    setSaved(value)
    toast(`Saved for ${w.name}`, 'success')
  })

  return (
    <li className={cn(card, 'p-0')}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-[15px] font-bold text-gray-900">{w.name}</span>
            {w.type === 'personal' && <span className="rounded-full bg-gray-100 px-2 py-px text-[10px] font-bold text-gray-600">Personal</span>}
            {w.kind && <span className="rounded-full bg-brand-100 px-2 py-px text-[10px] font-bold text-brand-700">{w.kind}</span>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-gray-500">
            {[w.ownerName, w.ownerEmail].filter(Boolean).join(' · ') || 'No owner'} · created {dateLabel(w.createdAt)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
          <span className={cn('font-bold', onCount === SECTIONS.length ? 'text-emerald-700' : 'text-amber-700')}>{onCount}/{SECTIONS.length} on</span>
          <span className="inline-flex items-center gap-1 text-gray-500"><Users className="h-3 w-3" />{w.members}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-brand-100 px-4 py-3.5">
          <FeatureChips value={value} onChange={setValue} disabled={pending} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} loading={pending} disabled={same(value, saved)}>Save</Button>
            <button type="button" onClick={() => setValue(allOn())} disabled={pending} className="rounded-lg px-2 py-1 text-xs font-bold text-brand-700 hover:bg-brand-50">All on</button>
            <button type="button" onClick={() => setValue(fromList(core))} disabled={pending} className="rounded-lg px-2 py-1 text-xs font-bold text-brand-700 hover:bg-brand-50">Core only</button>
            {!same(value, saved) && <button type="button" onClick={() => setValue(saved)} className="text-xs font-semibold text-gray-500 underline">Undo</button>}
          </div>
          <p className="mt-2 text-xs text-gray-500">Switched-off sections disappear for everyone in this workspace, owners included. Their data stays and comes back when switched on.</p>
        </div>
      )}
    </li>
  )
}

export function AdminPanel({ workspaces, core }: { workspaces: AdminWorkspace[]; core: SectionKey[] }) {
  const [query, setQuery] = useState('')
  const [showPersonal, setShowPersonal] = useState(false)
  const q = query.trim().toLowerCase()
  const list = workspaces
    .filter(w => showPersonal || w.type !== 'personal')
    .filter(w => !q || [w.name, w.kind ?? '', w.ownerName ?? '', w.ownerEmail ?? ''].some(t => t.toLowerCase().includes(q)))
  const bands = workspaces.filter(w => w.type !== 'personal').length

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Admin" subtitle={`${bands} workspaces · ${workspaces.length - bands} personal spaces`} />

      <CoreCard initial={core} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Workspaces</SectionLabel>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600">
            <input type="checkbox" checked={showPersonal} onChange={e => setShowPersonal(e.target.checked)} className="h-4 w-4 accent-brand-400" />
            Show personal spaces
          </label>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by workspace, owner or email"
            aria-label="Search workspaces"
            className="w-full rounded-xl border border-brand-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">No workspace matches.</p>
        ) : (
          <ul className="space-y-2">{list.map(w => <WorkspaceRow key={w.id} w={w} core={core} />)}</ul>
        )}
      </section>
    </div>
  )
}
