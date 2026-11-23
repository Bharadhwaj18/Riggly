'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { StatusPill } from '@/components/ui/StatusPill'
import { useToast } from '@/components/ui/Toaster'
import { useMoney } from '@/components/finance/FinanceSettingsContext'
import { cn } from '@/lib/utils'
import { formatDateDMY } from '@/lib/dates'
import { buildMerchLedger, EMPTY_FILTER, filterLedger, ledgerTotals, LEDGER_KIND_LABELS, type LedgerFilter, type LedgerKind, type LedgerRow } from '@/lib/merch-ledger'
import type { MerchBatch, MerchItem, MerchMove, MerchSale, MerchVariant } from '@/lib/merch'
import { deleteMerchBatch, deleteMerchMove, deleteMerchSale } from '@/actions/merch'
import { UpiProofLink } from './UpiProof'
import type { KitWithShow } from './Kits'

type ShowRef = { id: string; title: string; show_date: string | null } | null

const KIND_TONES: Record<LedgerKind, string> = {
  sale: 'bg-emerald-100 text-emerald-800',
  restock: 'bg-sky-100 text-sky-800',
  giveaway: 'bg-amber-100 text-amber-800',
  damaged: 'bg-red-100 text-red-700',
  return: 'bg-gray-100 text-gray-700',
  count_fix: 'bg-gray-100 text-gray-700',
}
const KINDS = Object.keys(LEDGER_KIND_LABELS) as LedgerKind[]
const PAGE = 60

interface Props {
  items: MerchItem[]
  variants: MerchVariant[]
  moves: (MerchMove & { show?: ShowRef })[]
  sales: (MerchSale & { show?: ShowRef })[]
  batches: MerchBatch[]
  kits: KitWithShow[]
  members: { id: string; name: string }[]
  proofsBySale: Record<string, string[]>
  canEdit: boolean
  canApprove: boolean
  userId: string
}

/** Every sale, restock, giveaway, loss and count fix, searchable and filterable, with totals and a delete on each. */
export function MerchLedger({ items, variants, moves, sales, batches, kits, members, proofsBySale, canEdit, canApprove, userId }: Props) {
  const { money } = useMoney()
  const router = useRouter()
  const toast = useToast()
  const [filter, setFilter] = useState<LedgerFilter>(EMPTY_FILTER)
  const [more, setMore] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()

  const itemName = useMemo(() => new Map(items.map(i => [i.id, i.name])), [items])
  const nameOf = (id: string | null) => members.find(m => m.id === id)?.name ?? 'Someone'
  const kitStatus = useMemo(() => new Map(kits.map(k => [k.id, k.status])), [kits])

  const rows = useMemo(() => buildMerchLedger({
    moves, sales, batches, variants,
    kitShows: Object.fromEntries(kits.map(k => [k.id, k.show ? { id: k.show.id, title: k.show.title, show_date: k.show.show_date } : null])),
  }), [moves, sales, batches, variants, kits])

  const linesText = (r: LedgerRow) => r.lines.map(l => `${itemName.get(l.itemId) ?? 'Item'} ${l.label} ×${Math.abs(l.qty)}`).join(', ')
  const titleOf = (r: LedgerRow) =>
    r.kind === 'sale' ? (r.showTitle ?? 'Not at a show')
      : r.kind === 'restock' ? `Restock${r.supplier ? ` from ${r.supplier}` : ''}`
        : `${LEDGER_KIND_LABELS[r.kind]}${r.showTitle ? ` at ${r.showTitle}` : ''}`
  const textOf = (r: LedgerRow) => [titleOf(r), linesText(r), r.note, r.personId && nameOf(r.personId), r.heldBy && nameOf(r.heldBy)].filter(Boolean).join(' ')

  const filtered = filterLedger(rows, filter, textOf)
  const totals = ledgerTotals(filtered)
  const active = filter.kinds.length + (filter.itemId ? 1 : 0) + (filter.show ? 1 : 0) + (filter.personId ? 1 : 0) + (filter.from ? 1 : 0) + (filter.to ? 1 : 0) + (filter.query.trim() ? 1 : 0)

  const showOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) if (r.showId && r.showTitle) m.set(r.showId, r.showTitle)
    return [...m].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])
  const people = useMemo(() => members.filter(p => rows.some(r => r.personId === p.id || r.heldBy === p.id)), [members, rows])

  const set = (patch: Partial<LedgerFilter>) => { setFilter(f => ({ ...f, ...patch })); setShown(PAGE) }
  const toggleKind = (k: LedgerKind) => set({ kinds: filter.kinds.includes(k) ? filter.kinds.filter(x => x !== k) : [...filter.kinds, k] })

  const canDelete = (r: LedgerRow) => {
    if (r.ref.type !== 'sale') return canEdit
    if (canApprove) return true
    const kitOpen = !r.kitId || kitStatus.get(r.kitId) === 'open'
    return r.status === 'pending' && r.personId === userId && kitOpen
  }

  const remove = (r: LedgerRow) => {
    const what = r.ref.type === 'sale'
      ? (r.status === 'approved'
        ? `Delete this sale of ${money(r.money ?? 0)}? Its stock goes back, and the money comes off the Finance entry.`
        : `Delete this sale of ${money(r.money ?? 0)}? Its stock goes back.`)
      : r.ref.type === 'batch' ? 'Delete this restock and the stock it added?' : 'Undo this stock entry?'
    if (!window.confirm(`${what} This can’t be undone.`)) return
    setBusy(r.key)
    start(async () => {
      const res = r.ref.type === 'sale' ? await deleteMerchSale(r.ref.id) : r.ref.type === 'batch' ? await deleteMerchBatch(r.ref.id) : await deleteMerchMove(r.ref.id)
      setBusy(null)
      if (res.error) { toast(res.error, 'error'); return }
      toast('Deleted', 'success')
      router.refresh()
    })
  }

  if (!rows.length) return <p className="py-6 text-center text-sm text-gray-500">Nothing logged yet. Sales, restocks and stock changes show up here.</p>

  const visible = filtered.slice(0, shown)

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-300" />
          <input
            value={filter.query}
            onChange={e => set({ query: e.target.value })}
            placeholder="Search items, shows, people, notes…"
            aria-label="Search merch history"
            className="w-full rounded-xl border border-brand-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
        <button type="button" onClick={() => setMore(m => !m)} aria-expanded={more}
          className={cn('inline-flex items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold', more ? 'border-brand-400 bg-brand-100 text-brand-700' : 'border-brand-200 bg-white text-gray-700')}>
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </button>
      </div>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {KINDS.map(k => <Chip key={k} active={filter.kinds.includes(k)} onClick={() => toggleKind(k)}>{LEDGER_KIND_LABELS[k]}</Chip>)}
      </div>

      {more && (
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-brand-200 bg-white p-3 sm:grid-cols-5">
          <Select aria-label="Item" value={filter.itemId} onChange={e => set({ itemId: e.target.value })}>
            <option value="">Any item</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
          <Select aria-label="Show" value={filter.show} onChange={e => set({ show: e.target.value })}>
            <option value="">Any show</option>
            <option value="none">Not at a show</option>
            {showOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </Select>
          <Select aria-label="Person" value={filter.personId} onChange={e => set({ personId: e.target.value })}>
            <option value="">Anyone</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Input type="date" aria-label="From" value={filter.from} onChange={e => set({ from: e.target.value })} />
          <Input type="date" aria-label="To" value={filter.to} onChange={e => set({ to: e.target.value })} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Total label="Sold" value={`${totals.sold}`} sub="units" />
        <Total label="Taken" value={money(totals.takings)} sub={totals.waiting ? `${money(totals.waiting)} waiting` : 'all approved'} />
        <Total label="Restocked" value={`${totals.restocked}`} sub={totals.restockCost ? `cost ${money(totals.restockCost)}` : 'units'} />
        <Total label="Given / lost" value={`${totals.givenOrLost}`} sub="units" />
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{filtered.length} of {rows.length} entries</span>
        {active > 0 && <button type="button" onClick={() => set(EMPTY_FILTER)} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"><X className="h-3.5 w-3.5" />Clear filters</button>}
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">Nothing matches these filters.</p>
      ) : (
        <div className="space-y-1">
          {visible.map((r, i) => {
            const header = r.date !== visible[i - 1]?.date ? <SectionLabel className="pb-1 pt-3">{formatDateDMY(r.date)}</SectionLabel> : null
            const pay = r.payment ? [r.payment.cash && `${money(r.payment.cash)} cash`, r.payment.upi && `${money(r.payment.upi)} UPI`, r.payment.card && `${money(r.payment.card)} card`].filter(Boolean).join(' · ') : null
            return (
              <div key={r.key}>
                {header}
                <div className={cn('flex items-start gap-3 rounded-xl border border-brand-100 bg-white px-3 py-2.5 transition-opacity', busy === r.key && 'opacity-50')}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-gray-900">
                      <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide', KIND_TONES[r.kind])}>{LEDGER_KIND_LABELS[r.kind]}</span>
                      <span className="min-w-0 truncate">{titleOf(r)}</span>
                      {r.kitId && <span className="text-[11px] font-normal text-gray-500">kit</span>}
                    </p>
                    {r.lines.length > 0 && <p className="mt-0.5 text-xs text-gray-700">{linesText(r)}</p>}
                    <p className="mt-0.5 text-xs text-gray-500">
                      {[
                        r.kind === 'sale' && r.personId ? `by ${nameOf(r.personId)}` : null,
                        r.kind === 'sale' && r.heldBy && r.heldBy !== r.personId ? `money with ${nameOf(r.heldBy)}` : null,
                        pay, r.note,
                      ].filter(Boolean).join(' · ')}
                    </p>
                    {r.ref.type === 'sale' && <UpiProofLink paths={proofsBySale[r.ref.id] ?? []} />}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {r.money != null && <span className="text-sm font-bold tabular-nums text-gray-900">{r.kind === 'restock' ? '−' : ''}{money(r.money)}</span>}
                    <span className={cn('text-xs font-semibold tabular-nums', r.units > 0 ? 'text-brand-400 dark:text-emerald-400' : 'text-red-700')}>{r.units > 0 ? `+${r.units}` : `−${Math.abs(r.units)}`} units</span>
                    {r.status && <StatusPill tone={r.status === 'approved' ? 'green' : 'amber'}>{r.status === 'approved' ? 'In Finance' : 'Waiting'}</StatusPill>}
                  </div>
                  {canDelete(r) && (
                    <button type="button" onClick={() => remove(r)} disabled={busy === r.key} aria-label="Delete this entry" title="Delete"
                      className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {filtered.length > shown && (
            <button type="button" onClick={() => setShown(n => n + PAGE)} className="mt-2 w-full rounded-xl border border-brand-200 bg-white py-2 text-sm font-semibold text-gray-700 hover:bg-brand-50">
              Show more ({filtered.length - shown} left)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Total({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-brand-200 bg-white px-3 py-2">
      <p className="truncate text-[11px] font-semibold text-gray-500">{label}</p>
      <p className="truncate text-base font-bold tabular-nums text-gray-900">{value}</p>
      <p className="truncate text-[11px] text-gray-500">{sub}</p>
    </div>
  )
}
