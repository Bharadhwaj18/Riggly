'use client'

import { useState, useTransition } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { saveToday } from '@/actions/admin'
import { PageHeader } from '@/components/ui/PageHeader'
import { ReasonButton } from '@/components/ui/ReasonButton'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { useToast } from '@/components/ui/Toaster'
import { infoCards } from '@/components/today/InfoWidgets'
import { cn } from '@/lib/utils'
import { DEFAULT_TODAY, type Review, type TodayContent } from '@/lib/today-config'
import { TodayCardChips } from './AdminPanel'

const card = 'rounded-2xl border border-brand-200 bg-white p-5 shadow-sm'
const field = 'w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400'

function ListEditor({ label, hint, items, onChange, max, maxLength, placeholder }: {
  label: string; hint: string; items: string[]; onChange: (v: string[]) => void; max: number; maxLength: number; placeholder: string
}) {
  return (
    <section className={card}>
      <SectionLabel>{label}</SectionLabel>
      <p className="mb-3 mt-0.5 text-xs text-gray-500">{hint}</p>
      <ul className="space-y-2">
        {items.map((t, i) => (
          <li key={i} className="flex items-center gap-2">
            <input value={t} maxLength={maxLength} placeholder={placeholder} aria-label={`${label} ${i + 1}`}
              onChange={e => onChange(items.map((x, j) => j === i ? e.target.value : x))} className={field} />
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      {items.length < max && (
        <button type="button" onClick={() => onChange([...items, ''])} className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-bold text-brand-700 hover:bg-brand-50">
          <Plus className="h-4 w-4" />Add
        </button>
      )}
    </section>
  )
}

/** Edit what every band's Today shows: which cards appear, and what the info cards say. */
export function AdminToday({ initial }: { initial: TodayContent }) {
  const [saved, setSaved] = useState(initial)
  const [c, setC] = useState(initial)
  const [pending, start] = useTransition()
  const toast = useToast()
  const set = <K extends keyof TodayContent>(k: K, v: TodayContent[K]) => setC(prev => ({ ...prev, [k]: v }))
  const changed = JSON.stringify(c) !== JSON.stringify(saved)
  const today = new Date().toISOString().slice(0, 10)
  const preview = infoCards(today, {
    ...c,
    tips: c.tips.filter(t => t.trim()),
    updates: c.updates.filter(t => t.trim()),
    reviews: c.reviews.filter(r => r.quote.trim() && r.by.trim()),
  }).filter(p => !c.off.includes(p.id as never))

  const save = () => start(async () => {
    const res = await saveToday(c)
    if (res.error) { toast(res.error, 'error'); return }
    setSaved(c)
    toast('Today saved. Bands see it on their next visit.', 'success')
  })
  const setReview = (i: number, r: Partial<Review>) => set('reviews', c.reviews.map((x, j) => j === i ? { ...x, ...r } : x))

  return (
    <div className="space-y-5 pb-20">
      <PageHeader title="Today" subtitle="What every band sees on its Today screen. Switch a card off for one band from Workspaces." />

      <section className={card}>
        <SectionLabel>Cards for every workspace</SectionLabel>
        <p className="mb-3 mt-0.5 text-xs text-gray-500">Switched off here, a card is hidden for every band.</p>
        <TodayCardChips off={c.off} onChange={off => set('off', off)} disabled={pending} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <ListEditor label="Tips" hint="One shows each day as Tip of the day, another as Quick tip." items={c.tips} onChange={v => set('tips', v)} max={30} maxLength={200} placeholder="Press and hold a song to open its actions." />
          <ListEditor label="What's new" hint="Short lines about recent changes, newest first." items={c.updates} onChange={v => set('updates', v)} max={10} maxLength={200} placeholder="Setlists: share a link with a guest player" />

          <section className={card}>
            <SectionLabel>Reviews</SectionLabel>
            <p className="mb-3 mt-0.5 text-xs text-gray-500">One shows each day. Only use real quotes you have permission to share.</p>
            <ul className="space-y-3">
              {c.reviews.map((r, i) => (
                <li key={i} className="space-y-1.5 rounded-xl border border-brand-100 p-2.5">
                  <textarea value={r.quote} maxLength={300} rows={2} placeholder="What they said" aria-label={`Review ${i + 1} quote`} onChange={e => setReview(i, { quote: e.target.value })} className={field} />
                  <div className="flex items-center gap-2">
                    <input value={r.by} maxLength={60} placeholder="Who said it" aria-label={`Review ${i + 1} by`} onChange={e => setReview(i, { by: e.target.value })} className={field} />
                    <button type="button" onClick={() => set('reviews', c.reviews.filter((_, j) => j !== i))} aria-label={`Remove review ${i + 1}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
            {c.reviews.length < 20 && (
              <button type="button" onClick={() => set('reviews', [...c.reviews, { quote: '', by: '' }])} className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-bold text-brand-700 hover:bg-brand-50">
                <Plus className="h-4 w-4" />Add
              </button>
            )}
          </section>

          <section className={cn(card, 'space-y-3')}>
            <label className="block"><SectionLabel>Artist news</SectionLabel>
              <textarea value={c.news} maxLength={300} rows={3} onChange={e => set('news', e.target.value)} className={cn(field, 'mt-2')} placeholder="Leave empty to hide the card" />
            </label>
            <label className="block"><SectionLabel>Get started</SectionLabel>
              <textarea value={c.start} maxLength={300} rows={3} onChange={e => set('start', e.target.value)} className={cn(field, 'mt-2')} placeholder="Leave empty to hide the card" />
            </label>
          </section>
        </div>

        <section className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <SectionLabel>Preview of today&rsquo;s info cards</SectionLabel>
          {preview.length === 0 ? <p className="text-sm text-gray-500">No info cards would show.</p> : (
            <div className="grid gap-3 sm:grid-cols-2">{preview.map(p => <div key={p.id}>{p.node}</div>)}</div>
          )}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-brand-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <ReasonButton onClick={save} loading={pending} blocked={!changed && 'Nothing has changed yet.'}>Save Today</ReasonButton>
          {changed && <button type="button" onClick={() => setC(saved)} className="text-sm font-semibold text-gray-500 underline">Undo changes</button>}
          <button type="button" onClick={() => setC({ ...DEFAULT_TODAY, off: c.off })} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-gray-500 hover:bg-brand-50">
            <RotateCcw className="h-3.5 w-3.5" />Built-in text
          </button>
        </div>
      </div>
    </div>
  )
}
