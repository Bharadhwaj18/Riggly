'use client'

import { useState, useTransition } from 'react'
import { Pencil, Plus, Search, Square, Trash2 } from 'lucide-react'
import { deleteAnnouncement, endAnnouncement, saveAnnouncement, type AnnouncementInput } from '@/actions/admin'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { ReasonButton } from '@/components/ui/ReasonButton'
import { Chip, SegmentedTabs } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toaster'
import { Announcements } from '@/components/today/Announcements'
import { cn } from '@/lib/utils'
import type { AdminAnnouncement } from '@/lib/admin-data'

const card = 'rounded-2xl border border-brand-200 bg-white p-4 shadow-sm'
const field = 'w-full rounded-xl border border-brand-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400'
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** datetime-local works in local time without a zone; convert both ways. */
const toLocal = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const fromLocal = (v: string) => v ? new Date(v).toISOString() : ''

type State = 'live' | 'scheduled' | 'ended'
function stateOf(a: AdminAnnouncement, now: number): State {
  if (a.endsAt && Date.parse(a.endsAt) <= now) return 'ended'
  return Date.parse(a.startsAt) > now ? 'scheduled' : 'live'
}

const EMPTY: AnnouncementInput = { title: '', body: '', linkUrl: '', linkLabel: '', tone: 'info', workspaceIds: [], startsAt: '', endsAt: '' }

function Editor({ open, onClose, editing, workspaces }: {
  open: boolean; onClose: () => void; editing: AdminAnnouncement | null; workspaces: { id: string; name: string }[]
}) {
  const [v, setV] = useState<AnnouncementInput>(() => editing ? {
    title: editing.title, body: editing.body ?? '', linkUrl: editing.link_url ?? '', linkLabel: editing.link_label ?? '', tone: editing.tone,
    workspaceIds: editing.workspaceIds ?? [], startsAt: editing.startsAt, endsAt: editing.endsAt ?? '',
  } : EMPTY)
  const [who, setWho] = useState<'all' | 'some'>(editing?.workspaceIds?.length ? 'some' : 'all')
  const [find, setFind] = useState('')
  const [pending, start] = useTransition()
  const toast = useToast()
  const set = <K extends keyof AnnouncementInput>(k: K, x: AnnouncementInput[K]) => setV(p => ({ ...p, [k]: x }))

  const blocked = !v.title.trim() ? 'Give it a title.'
    : who === 'some' && v.workspaceIds.length === 0 ? 'Pick at least one workspace, or choose Every band.'
    : v.linkUrl.trim() && !/^(https:\/\/|\/)/.test(v.linkUrl.trim()) ? 'Links start with https:// or with / for a page in the app.'
    : v.startsAt && v.endsAt && v.endsAt <= v.startsAt ? 'The end has to be after the start.'
    : null
  const save = () => start(async () => {
    const res = await saveAnnouncement(editing?.id ?? null, { ...v, workspaceIds: who === 'all' ? [] : v.workspaceIds })
    if (res.error) { toast(res.error, 'error'); return }
    toast(editing ? 'Announcement saved' : 'Announcement posted', 'success')
    onClose()
  })
  const q = find.trim().toLowerCase()

  return (
    <Modal open={open} onOpenChange={o => { if (!o) onClose() }} title={editing ? 'Edit announcement' : 'New announcement'} description="Shows at the top of Today. Each person can close it on their device.">
      <div className="space-y-3">
        <input value={v.title} onChange={e => set('title', e.target.value)} maxLength={80} placeholder="Title" aria-label="Title" className={field} />
        <textarea value={v.body} onChange={e => set('body', e.target.value)} maxLength={500} rows={3} placeholder="More detail (optional)" aria-label="Body" className={field} />
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
          <input value={v.linkUrl} onChange={e => set('linkUrl', e.target.value)} placeholder="Link: https://… or /setlists (optional)" aria-label="Link" className={field} />
          <input value={v.linkLabel} onChange={e => set('linkLabel', e.target.value)} maxLength={30} placeholder="Button text" aria-label="Link button text" className={field} />
        </div>
        <div>
          <p className="mb-1 text-xs font-bold text-gray-600">Look</p>
          <SegmentedTabs value={v.tone} onChange={t => set('tone', t)} tabs={[{ value: 'info', label: 'News' }, { value: 'good', label: 'Good news' }, { value: 'warn', label: 'Heads up' }]} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs font-bold text-gray-600">Starts
            <input type="datetime-local" value={toLocal(v.startsAt || null)} onChange={e => set('startsAt', fromLocal(e.target.value))} className={cn(field, 'mt-1')} />
            <span className="mt-0.5 block font-normal text-gray-500">Empty: now</span>
          </label>
          <label className="block text-xs font-bold text-gray-600">Ends
            <input type="datetime-local" value={toLocal(v.endsAt || null)} onChange={e => set('endsAt', fromLocal(e.target.value))} className={cn(field, 'mt-1')} />
            <span className="mt-0.5 block font-normal text-gray-500">Empty: until you end it</span>
          </label>
        </div>
        <div>
          <p className="mb-1 text-xs font-bold text-gray-600">Who sees it</p>
          <SegmentedTabs value={who} onChange={setWho} tabs={[{ value: 'all', label: 'Every band' }, { value: 'some', label: `Chosen bands${v.workspaceIds.length ? ` (${v.workspaceIds.length})` : ''}` }]} />
          {who === 'some' && (
            <div className="mt-2 space-y-2">
              <input type="search" value={find} onChange={e => setFind(e.target.value)} placeholder="Find a band" aria-label="Find a band" className={field} />
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {workspaces.filter(w => !q || w.name.toLowerCase().includes(q) || v.workspaceIds.includes(w.id)).map(w => (
                  <Chip key={w.id} active={v.workspaceIds.includes(w.id)}
                    onClick={() => set('workspaceIds', v.workspaceIds.includes(w.id) ? v.workspaceIds.filter(x => x !== w.id) : [...v.workspaceIds, w.id])}>
                    {w.name}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
        {v.title.trim() && (
          <div className="pointer-events-none">
            <p className="mb-1 text-xs font-bold text-gray-600">Preview</p>
            <Announcements items={[{ id: 'preview', title: v.title, body: v.body || null, link_url: v.linkUrl || null, link_label: v.linkLabel || null, tone: v.tone }]} />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <ReasonButton onClick={save} loading={pending} blocked={blocked}>{editing ? 'Save' : 'Post'}</ReasonButton>
        </div>
      </div>
    </Modal>
  )
}

/** Notes from Riggly that show at the top of Today, for every band or chosen ones, between two times. */
export function AdminAnnouncements({ items, workspaces }: { items: AdminAnnouncement[]; workspaces: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<AdminAnnouncement | null>(null)
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<State>('live')
  const [query, setQuery] = useState('')
  const [, start] = useTransition()
  const toast = useToast()
  // Read the clock once per render pass for the whole list.
  const [now] = useState(() => Date.now())
  const names = new Map(workspaces.map(w => [w.id, w.name]))
  const q = query.trim().toLowerCase()
  const byState = (s: State) => items.filter(a => stateOf(a, now) === s)
  const list = byState(tab).filter(a => !q || [a.title, a.body ?? ''].some(t => t.toLowerCase().includes(q)))

  const act = (fn: () => Promise<{ error?: string }>, ok: string) => start(async () => {
    const res = await fn()
    if (res.error) { toast(res.error, 'error'); return }
    toast(ok, 'success')
  })

  return (
    <div className="space-y-5">
      <PageHeader title="Announcements" subtitle="Notes from Riggly at the top of every band's Today, or chosen bands'."
        action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New</Button>} />
      <SegmentedTabs value={tab} onChange={setTab} tabs={[
        { value: 'live', label: 'Live', count: byState('live').length },
        { value: 'scheduled', label: 'Scheduled', count: byState('scheduled').length },
        { value: 'ended', label: 'Ended', count: byState('ended').length },
      ]} />
      {items.length > 5 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search announcements" aria-label="Search announcements" className={cn(field, 'pl-9')} />
        </div>
      )}

      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">{tab === 'live' ? 'Nothing is showing on Today right now.' : tab === 'scheduled' ? 'Nothing scheduled.' : 'Nothing has ended yet.'}</p>
      ) : (
        <ul className="space-y-2">
          {list.map(a => (
            <li key={a.id} className={card}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-900">{a.title}</p>
                  {a.body && <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{a.body}</p>}
                  <p className="mt-1.5 text-xs text-gray-500">
                    {a.workspaceIds?.length ? a.workspaceIds.map(id => names.get(id) ?? 'Deleted band').join(', ') : 'Every band'}
                    {' · '}{when(a.startsAt)}{a.endsAt ? ` to ${when(a.endsAt)}` : ', no end'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  {tab !== 'ended' && (
                    <button type="button" onClick={() => setEditing(a)} aria-label={`Edit ${a.title}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-brand-50"><Pencil className="h-4 w-4" /></button>
                  )}
                  {tab === 'live' && (
                    <button type="button" onClick={() => act(() => endAnnouncement(a.id), 'Ended. It no longer shows on Today.')} aria-label={`End ${a.title} now`} title="End now"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-amber-50 hover:text-amber-700"><Square className="h-4 w-4" /></button>
                  )}
                  <button type="button" aria-label={`Delete ${a.title}`}
                    onClick={() => { if (window.confirm(`Delete “${a.title}”? This can't be undone.`)) act(() => deleteAnnouncement(a.id), 'Announcement deleted') }}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <Editor key={editing?.id ?? 'new'} open onClose={() => { setCreating(false); setEditing(null) }} editing={editing} workspaces={workspaces} />
      )}
    </div>
  )
}
