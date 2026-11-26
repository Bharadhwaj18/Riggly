'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, PauseCircle, Search, Sparkles, Users } from 'lucide-react'
import { deleteWorkspace, setCoreFeatures, setWorkspaceFeatures, setWorkspaceToday, updateWorkspace } from '@/actions/admin'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { ReasonButton } from '@/components/ui/ReasonButton'
import { Chip, SegmentedTabs } from '@/components/ui/Chip'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { useToast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'
import { SECTIONS, type SectionKey, type WorkspaceFeatures } from '@/lib/workspace-sections'
import { TODAY_CARDS, type TodayCardId } from '@/lib/today-config'
import type { AdminWorkspace } from '@/lib/admin-data'

const card = 'rounded-2xl border border-brand-200 bg-white p-5 shadow-sm'
const field = 'w-full rounded-xl border border-brand-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400'
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const allOn = () => Object.fromEntries(SECTIONS.map(s => [s.key, true])) as WorkspaceFeatures
const fromList = (keys: SectionKey[]) => Object.fromEntries(SECTIONS.map(s => [s.key, keys.includes(s.key)])) as WorkspaceFeatures
const same = (a: WorkspaceFeatures, b: WorkspaceFeatures) => SECTIONS.every(s => a[s.key] === b[s.key])
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))

function ago(iso: string | null) {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : dateLabel(iso)
}

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

/** One chip per Today card: on means it shows. `forcedOff` are off for everyone and can't be turned on here. */
export function TodayCardChips({ off, onChange, disabled, forcedOff = [] }: { off: TodayCardId[]; onChange: (off: TodayCardId[]) => void; disabled?: boolean; forcedOff?: TodayCardId[] }) {
  const toast = useToast()
  return (
    <div className="space-y-2">
      {(['band', 'info'] as const).map(group => (
        <div key={group}>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-gray-500">{group === 'band' ? "The band's own" : 'Info cards'}</p>
          <div className="flex flex-wrap gap-1.5">
            {TODAY_CARDS.filter(c => c.group === group).map(c => {
              const forced = forcedOff.includes(c.id)
              return (
                <Chip key={c.id} active={!forced && !off.includes(c.id)} disabled={disabled} title={forced ? 'Off for every workspace (Today page)' : c.hint}
                  className={cn(forced && 'opacity-50 line-through')}
                  onClick={() => {
                    if (forced) { toast(`${c.label} is off for every workspace. Turn it back on from the Today page.`, 'info'); return }
                    onChange(off.includes(c.id) ? off.filter(x => x !== c.id) : [...off, c.id])
                  }}>
                  {c.label}
                </Chip>
              )
            })}
          </div>
        </div>
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
      <SectionLabel className="mb-1 flex items-center gap-2"><Sparkles className="h-4 w-4" /> New workspaces start with</SectionLabel>
      <p className="mb-3 text-sm text-gray-500">The sections a brand-new workspace gets. Changing this doesn&rsquo;t touch workspaces that already exist.</p>
      <FeatureChips value={value} onChange={setValue} disabled={pending} />
      <div className="mt-4 flex items-center gap-2">
        <ReasonButton size="sm" onClick={save} loading={pending} blocked={same(value, saved) && 'Nothing has changed yet.'}>Save</ReasonButton>
        {!same(value, saved) && <button type="button" onClick={() => setValue(saved)} className="text-xs font-semibold text-gray-500 underline">Undo</button>}
      </div>
    </section>
  )
}

type Tab = 'sections' | 'today' | 'details' | 'delete'

function SectionsTab({ w, core }: { w: AdminWorkspace; core: SectionKey[] }) {
  const [saved, setSaved] = useState(w.features)
  const [value, setValue] = useState(w.features)
  const [pending, start] = useTransition()
  const toast = useToast()
  const save = () => start(async () => {
    const res = await setWorkspaceFeatures(w.id, value)
    if (res.error) { toast(res.error, 'error'); return }
    setSaved(value)
    toast(`Sections saved for ${w.name}`, 'success')
  })
  return (
    <div>
      <FeatureChips value={value} onChange={setValue} disabled={pending} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ReasonButton size="sm" onClick={save} loading={pending} blocked={same(value, saved) && 'Nothing has changed yet.'}>Save</ReasonButton>
        <button type="button" onClick={() => setValue(allOn())} disabled={pending} className="rounded-lg px-2 py-1 text-xs font-bold text-brand-700 hover:bg-brand-50">All on</button>
        <button type="button" onClick={() => setValue(fromList(core))} disabled={pending} className="rounded-lg px-2 py-1 text-xs font-bold text-brand-700 hover:bg-brand-50">Core only</button>
        {!same(value, saved) && <button type="button" onClick={() => setValue(saved)} className="text-xs font-semibold text-gray-500 underline">Undo</button>}
      </div>
      <p className="mt-2 text-xs text-gray-500">Switched-off sections disappear for everyone in this workspace, owners included. Their data stays and comes back when switched on.</p>
    </div>
  )
}

function TodayTab({ w, globalOff }: { w: AdminWorkspace; globalOff: TodayCardId[] }) {
  const [saved, setSaved] = useState(w.todayOff)
  const [off, setOff] = useState(w.todayOff)
  const [pending, start] = useTransition()
  const toast = useToast()
  const save = () => start(async () => {
    const res = await setWorkspaceToday(w.id, off)
    if (res.error) { toast(res.error, 'error'); return }
    setSaved(off)
    toast(`Today saved for ${w.name}`, 'success')
  })
  return (
    <div>
      <TodayCardChips off={off} onChange={setOff} disabled={pending} forcedOff={globalOff} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ReasonButton size="sm" onClick={save} loading={pending} blocked={sameSet(off, saved) && 'Nothing has changed yet.'}>Save</ReasonButton>
        <button type="button" onClick={() => setOff([])} disabled={pending} className="rounded-lg px-2 py-1 text-xs font-bold text-brand-700 hover:bg-brand-50">All on</button>
        {!sameSet(off, saved) && <button type="button" onClick={() => setOff(saved)} className="text-xs font-semibold text-gray-500 underline">Undo</button>}
      </div>
      <p className="mt-2 text-xs text-gray-500">Only changes Today for this workspace. Cards for a section that&rsquo;s switched off, or that a member can&rsquo;t open, never show anyway.</p>
    </div>
  )
}

function DetailsTab({ w }: { w: AdminWorkspace }) {
  const [name, setName] = useState(w.name)
  const [plan, setPlan] = useState(w.plan)
  const [pending, start] = useTransition()
  const toast = useToast()
  const paused = w.status === 'blocked'
  const changed = name.trim() !== w.name || plan.trim().toLowerCase() !== w.plan
  const save = (status: 'active' | 'blocked', message: string) => start(async () => {
    const res = await updateWorkspace(w.id, { name, plan, status })
    if (res.error) { toast(res.error, 'error'); return }
    toast(message, 'success')
  })
  const nameBlocked = !name.trim() ? 'Give it a name.' : !plan.trim() ? 'Give it a plan.' : !changed && 'Nothing has changed yet.'

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-bold text-gray-600">Name
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60} className={cn(field, 'mt-1')} />
        </label>
        <label className="block text-xs font-bold text-gray-600">Plan
          <input value={plan} onChange={e => setPlan(e.target.value)} maxLength={30} list="admin-plans" placeholder="free" className={cn(field, 'mt-1')} />
        </label>
      </div>
      <ReasonButton size="sm" onClick={() => save(paused ? 'blocked' : 'active', `Saved ${name.trim()}`)} loading={pending} blocked={nameBlocked}>Save name and plan</ReasonButton>

      <div className={cn('rounded-xl border p-3', paused ? 'border-amber-300 bg-amber-50' : 'border-brand-200')}>
        <p className="text-sm font-bold text-gray-900">{paused ? 'Paused' : 'Pause this workspace'}</p>
        <p className="mt-0.5 text-xs text-gray-600">
          {paused
            ? 'Members see a "paused" note instead of their pages. Nothing has been deleted.'
            : 'Members will see a "paused" note instead of their pages until you resume it. Nothing is deleted. The phone app is not blocked yet.'}
        </p>
        <Button size="sm" variant={paused ? 'primary' : 'secondary'} className="mt-2" loading={pending}
          onClick={() => {
            if (!paused && !window.confirm(`Pause ${w.name}? Its ${w.members} member(s) won't be able to use it until you resume it.`)) return
            save(paused ? 'active' : 'blocked', paused ? `${w.name} resumed` : `${w.name} paused`)
          }}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
      </div>
    </div>
  )
}

function DeleteTab({ w }: { w: AdminWorkspace }) {
  const [typed, setTyped] = useState('')
  const [pending, start] = useTransition()
  const toast = useToast()
  const router = useRouter()
  if (w.type === 'personal') return <p className="text-sm text-gray-600">A personal space can&rsquo;t be deleted.</p>
  const go = () => start(async () => {
    const res = await deleteWorkspace(w.id, typed)
    if (res.error) { toast(res.error, 'error'); return }
    toast(`${w.name} deleted`, 'success')
    router.refresh()
  })
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-700">
        Deletes <b>{w.name}</b> and everything in it, for all {w.members} member(s): shows, setlists, songs, money, merch and notes. <b>This can&rsquo;t be undone.</b>
      </p>
      <label className="block text-xs font-bold text-gray-600">Type <span className="font-mono">{w.name}</span> to confirm
        <input value={typed} onChange={e => setTyped(e.target.value)} className={cn(field, 'mt-1')} autoComplete="off" />
      </label>
      <ReasonButton variant="danger" size="sm" onClick={go} loading={pending}
        blocked={typed.trim() !== w.name && 'Type the workspace name exactly to confirm.'}>
        Delete for good
      </ReasonButton>
    </div>
  )
}

function WorkspaceRow({ w, core, globalOff }: { w: AdminWorkspace; core: SectionKey[]; globalOff: TodayCardId[] }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('sections')
  const onCount = SECTIONS.filter(s => w.features[s.key]).length
  const paused = w.status === 'blocked'

  return (
    <li className={cn(card, 'p-0', paused && 'border-amber-300')}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-[15px] font-bold text-gray-900">{w.name}</span>
            {paused && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-px text-[10px] font-bold text-amber-800"><PauseCircle className="h-3 w-3" />Paused</span>}
            {w.demo && <span className="rounded-full bg-amber-100 px-2 py-px text-[10px] font-bold text-amber-800">Demo</span>}
            {w.type === 'personal' && <span className="rounded-full bg-gray-100 px-2 py-px text-[10px] font-bold text-gray-600">Personal</span>}
            {w.type !== 'personal' && !w.demo && <span className="rounded-full bg-brand-100 px-2 py-px text-[10px] font-bold capitalize text-brand-700">{w.plan}</span>}
            {w.kind && !w.demo && <span className="rounded-full bg-gray-100 px-2 py-px text-[10px] font-bold text-gray-600">{w.kind}</span>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-gray-500">
            {[w.ownerName, w.ownerEmail].filter(Boolean).join(' · ') || 'No owner'} · created {dateLabel(w.createdAt)} · active {ago(w.lastActive)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
          <span className={cn('font-bold', onCount === SECTIONS.length ? 'text-emerald-700' : 'text-amber-700')}>{onCount}/{SECTIONS.length} on</span>
          <span className="inline-flex items-center gap-1 text-gray-500"><Users className="h-3 w-3" />{w.members}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-brand-100 px-4 py-4">
          <SegmentedTabs<Tab> value={tab} onChange={setTab} tabs={[
            { value: 'sections', label: 'Sections' }, { value: 'today', label: 'Today' },
            { value: 'details', label: 'Details' }, { value: 'delete', label: 'Delete' },
          ]} />
          {tab === 'sections' && <SectionsTab w={w} core={core} />}
          {tab === 'today' && <TodayTab w={w} globalOff={globalOff} />}
          {tab === 'details' && <DetailsTab w={w} />}
          {tab === 'delete' && <DeleteTab w={w} />}
        </div>
      )}
    </li>
  )
}

type Filter = 'bands' | 'paused' | 'demos' | 'personal' | 'all'
type Sort = 'newest' | 'active' | 'members' | 'name'

export function AdminPanel({ workspaces, core, globalOff }: { workspaces: AdminWorkspace[]; core: SectionKey[]; globalOff: TodayCardId[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('bands')
  const [sort, setSort] = useState<Sort>('newest')
  const q = query.trim().toLowerCase()
  const isBand = (w: AdminWorkspace) => w.type !== 'personal' && !w.demo
  const counts: Record<Filter, number> = {
    bands: workspaces.filter(isBand).length,
    paused: workspaces.filter(w => w.status === 'blocked').length,
    demos: workspaces.filter(w => w.demo).length,
    personal: workspaces.filter(w => w.type === 'personal').length,
    all: workspaces.length,
  }
  const list = workspaces
    .filter(w => filter === 'all' || (filter === 'bands' ? isBand(w) : filter === 'paused' ? w.status === 'blocked' : filter === 'demos' ? w.demo : w.type === 'personal'))
    .filter(w => !q || [w.name, w.kind ?? '', w.plan, w.ownerName ?? '', w.ownerEmail ?? ''].some(t => t.toLowerCase().includes(q)))
    .sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name)
      : sort === 'members' ? b.members - a.members
      : sort === 'active' ? (b.lastActive ?? '').localeCompare(a.lastActive ?? '')
      : b.createdAt.localeCompare(a.createdAt))
  const plans = [...new Set(['free', ...workspaces.map(w => w.plan)])]

  return (
    <div className="space-y-5">
      <PageHeader title="Workspaces" subtitle="Which sections each band has, what its Today shows, its plan, and pausing or deleting it." />
      <datalist id="admin-plans">{plans.map(p => <option key={p} value={p} />)}</datalist>

      <CoreCard initial={core} />

      <section className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(['bands', 'paused', 'demos', 'personal', 'all'] as Filter[]).map(f => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)} className="capitalize">{f} {counts[f]}</Chip>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by workspace, plan, owner or email"
              aria-label="Search workspaces" className={cn(field, 'pl-9')} />
          </div>
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort workspaces" className={cn(field, 'sm:w-48')}>
            <option value="newest">Newest first</option>
            <option value="active">Recently active</option>
            <option value="members">Most members</option>
            <option value="name">Name</option>
          </select>
        </div>
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">No workspace matches.</p>
        ) : (
          <ul className="space-y-2">{list.map(w => <WorkspaceRow key={w.id} w={w} core={core} globalOff={globalOff} />)}</ul>
        )}
      </section>
    </div>
  )
}
