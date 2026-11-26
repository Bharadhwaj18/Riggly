'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Plus, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'
import { updateSongReference } from '@/actions/song-references'
import { MAX_LABEL_LENGTH, MAX_MOMENTS, REFERENCE_LABELS, formatTime, parseTime, type Moment, type PlayableReference } from '@/lib/song-references'
import { ServiceMark } from './ServiceMark'
import { Cover } from './Cover'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The saved reference whose label and moments are being edited; the link itself stays. */
  editing: PlayableReference | null
}

/** Edit a saved reference's label and moments. (Adding happens in the References section, via ReferenceFinder.) */
export function ReferenceSheet({ open, onOpenChange, editing }: Props) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit reference" className="max-w-[480px] rounded-2xl">
      {/* Mounted only while open, so every opening starts fresh. */}
      {open && editing && <ReferenceForm editing={editing} onDone={() => onOpenChange(false)} />}
    </Modal>
  )
}

interface DraftMoment { key: number; label: string; time: string }

const eyebrow = 'text-[11px] font-extrabold uppercase tracking-[0.12em] text-gray-500'
const field = 'w-full rounded-xl border border-brand-200 bg-white px-3 text-[15px] text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30'

function ReferenceForm({ editing, onDone }: { editing: PlayableReference; onDone: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const [label, setLabel] = useState(editing.label)
  const [ownLabel, setOwnLabel] = useState(!(REFERENCE_LABELS as readonly string[]).includes(editing.label))
  const [moments, setMoments] = useState<DraftMoment[]>(() => editing.moments.map((m, i) => ({ key: i, label: m.label, time: formatTime(m.at) })))
  const [saving, startSaving] = useTransition()
  const nextKey = useRef(moments.length)

  const addMoment = () => {
    if (moments.length >= MAX_MOMENTS) return
    setMoments(m => [...m, { key: nextKey.current++, label: '', time: '' }])
  }
  const setMoment = (key: number, patch: Partial<DraftMoment>) => setMoments(list => list.map(m => (m.key === key ? { ...m, ...patch } : m)))

  const submit = () => {
    const parsed: Moment[] = []
    for (const m of moments) {
      if (!m.label.trim() && !m.time.trim()) continue
      const at = parseTime(m.time)
      if (!m.label.trim() || at === null) {
        toast('Give each moment a name and a time like 2:41.', 'error')
        return
      }
      parsed.push({ label: m.label.trim(), at })
    }
    if (!label.trim()) { toast('Give the reference a label, like Original.', 'error'); return }
    startSaving(async () => {
      const res = await updateSongReference(editing.id, { label, moments: parsed })
      if (res.error) { toast(res.error, 'error'); return }
      toast('Reference saved', 'success')
      router.refresh()
      onDone()
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-2.5">
        <Cover url={editing.thumbnailUrl} title={editing.title ?? 'Reference'} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-extrabold text-gray-900">{editing.title ?? 'Reference'}</span>
          {editing.artist && <span className="block truncate text-xs font-semibold text-gray-500">{editing.artist}</span>}
        </span>
        <a href={editing.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-extrabold text-emerald-800 hover:bg-emerald-100">
          <ServiceMark source={editing.source} size={16} />Open<ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="space-y-2">
        <p className={eyebrow}>What is it?</p>
        <div className="flex flex-wrap gap-1.5">
          {REFERENCE_LABELS.map(l => (
            <button key={l} type="button" aria-pressed={!ownLabel && label === l} onClick={() => { setOwnLabel(false); setLabel(l) }}
              className={cn('min-h-9 rounded-full px-3 text-sm font-extrabold', !ownLabel && label === l ? 'bg-brand-600 text-white' : 'bg-brand-100 text-gray-800 hover:bg-brand-200')}>
              {l}
            </button>
          ))}
          <button type="button" aria-pressed={ownLabel} onClick={() => { setOwnLabel(true); setLabel(ownLabel ? label : '') }}
            className={cn('inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-extrabold', ownLabel ? 'bg-brand-600 text-white' : 'border border-dashed border-brand-300 text-gray-600')}>
            <Plus className="h-3.5 w-3.5" />Your own
          </button>
        </div>
        {ownLabel && (
          <input autoFocus value={label} maxLength={MAX_LABEL_LENGTH} onChange={e => setLabel(e.target.value)} aria-label="Label"
            placeholder="e.g. Acoustic version" className={cn(field, 'min-h-11')} />
        )}
      </div>

      <div className="space-y-2">
        <p className={eyebrow}>Moments <span className="font-semibold normal-case tracking-normal text-gray-400">· optional</span></p>
        {moments.map(m => (
          <div key={m.key} className="flex items-center gap-2">
            <input value={m.label} onChange={e => setMoment(m.key, { label: e.target.value })} aria-label="Moment name" maxLength={MAX_LABEL_LENGTH}
              placeholder="Solo" className={cn(field, 'min-h-11 min-w-0 flex-1 font-semibold')} />
            <input value={m.time} onChange={e => setMoment(m.key, { time: e.target.value })} aria-label="Time" inputMode="numeric"
              placeholder="2:41" className={cn(field, 'min-h-11 w-20 text-center font-mono')} />
            <button type="button" onClick={() => setMoments(list => list.filter(x => x.key !== m.key))} aria-label="Remove moment"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {moments.length < MAX_MOMENTS && (
          <button type="button" onClick={addMoment}
            className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-brand-300 px-3 text-sm font-extrabold text-gray-600 hover:bg-brand-50">
            <Plus className="h-3.5 w-3.5" />Add a moment
          </button>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="button" onClick={submit} loading={saving}>Save</Button>
      </div>
    </div>
  )
}
