// The detailed merch history: every sale, restock, giveaway, loss, return and count fix as one row, newest first,
// with the filters and totals the History tab shows. Kept free of React so it can be tested on its own.

import { saleTakings, type MerchBatch, type MerchMove, type MerchSale } from '@/lib/merch'

export type LedgerKind = 'sale' | 'restock' | 'giveaway' | 'damaged' | 'return' | 'count_fix'

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  sale: 'Sale', restock: 'Restock', giveaway: 'Given away', damaged: 'Damaged / lost', return: 'Returned', count_fix: 'Count fix',
}

type ShowRef = { id: string; title: string; show_date: string | null } | null

export interface LedgerLine { variantId: string; itemId: string; label: string; qty: number }

export interface LedgerRow {
  key: string
  kind: LedgerKind
  date: string
  created: string
  /** Units in (+) or out (−). */
  units: number
  lines: LedgerLine[]
  showId: string | null
  showTitle: string | null
  /** Who recorded it (sales). */
  personId: string | null
  /** Who's holding the money (sales). */
  heldBy: string | null
  /** Money taken (sales) or spent (restocks). */
  money: number | null
  payment: { cash: number; upi: number; card: number } | null
  status: 'pending' | 'approved' | null
  note: string | null
  supplier: string | null
  kitId: string | null
  /** What deleting it removes. */
  ref: { type: 'sale'; id: string } | { type: 'batch'; id: string } | { type: 'move'; id: string }
}

type MoveIn = Pick<MerchMove, 'id' | 'variant_id' | 'qty' | 'reason' | 'date' | 'created_at' | 'sale_id' | 'batch_id' | 'kit_id' | 'note' | 'unit_price'> & { show?: ShowRef }
type SaleIn = Pick<MerchSale, 'id' | 'date' | 'created_at' | 'show_id' | 'kit_id' | 'created_by' | 'held_by' | 'status' | 'notes' | 'cash_amount' | 'upi_amount' | 'card_amount'> & { show?: ShowRef }

export function buildMerchLedger({ moves, sales, batches, variants, kitShows }: {
  moves: MoveIn[]
  sales: SaleIn[]
  batches: Pick<MerchBatch, 'id' | 'date' | 'created_at' | 'supplier' | 'notes' | 'total_cost'>[]
  variants: { id: string; item_id: string; label: string }[]
  /** Each kit's show, so a kit sale shows where it was. */
  kitShows: Record<string, ShowRef>
}): LedgerRow[] {
  const variantById = new Map(variants.map(v => [v.id, v]))
  const line = (m: MoveIn, sign = 1): LedgerLine => {
    const v = variantById.get(m.variant_id)
    return { variantId: m.variant_id, itemId: v?.item_id ?? '', label: v?.label ?? '', qty: sign * m.qty }
  }
  const bySale = new Map<string, MoveIn[]>()
  const byBatch = new Map<string, MoveIn[]>()
  const rows: LedgerRow[] = []
  const base = { lines: [], showId: null, showTitle: null, personId: null, heldBy: null, money: null, payment: null, status: null, note: null, supplier: null, kitId: null }

  for (const m of moves) {
    if (m.sale_id) { bySale.set(m.sale_id, [...(bySale.get(m.sale_id) ?? []), m]); continue }
    if (m.batch_id) { byBatch.set(m.batch_id, [...(byBatch.get(m.batch_id) ?? []), m]); continue }
    const kind = (['restock', 'giveaway', 'damaged', 'return', 'count_fix', 'sale'] as const).includes(m.reason as LedgerKind) ? (m.reason as LedgerKind) : 'count_fix'
    rows.push({
      ...base, key: `move-${m.id}`, kind, date: m.date, created: m.created_at, units: m.qty, lines: [line(m, Math.sign(m.qty) || 1)],
      showId: m.show?.id ?? null, showTitle: m.show?.title ?? null, note: m.note, kitId: m.kit_id,
      money: kind === 'sale' && m.unit_price != null ? -m.qty * Number(m.unit_price) : null,
      ref: { type: 'move', id: m.id },
    })
  }

  for (const s of sales) {
    const ms = bySale.get(s.id) ?? []
    const show = s.show ?? (s.kit_id ? kitShows[s.kit_id] ?? null : null)
    rows.push({
      ...base, key: `sale-${s.id}`, kind: 'sale', date: s.date, created: s.created_at,
      units: ms.reduce((n, m) => n + m.qty, 0), lines: ms.map(m => line(m, -1)),
      showId: show?.id ?? null, showTitle: show?.title ?? null, personId: s.created_by, heldBy: s.held_by,
      money: saleTakings(s), payment: { cash: Number(s.cash_amount), upi: Number(s.upi_amount), card: Number(s.card_amount) },
      status: s.status === 'approved' ? 'approved' : 'pending', note: s.notes, kitId: s.kit_id,
      ref: { type: 'sale', id: s.id },
    })
  }

  for (const b of batches) {
    const ms = byBatch.get(b.id) ?? []
    rows.push({
      ...base, key: `batch-${b.id}`, kind: 'restock', date: b.date, created: b.created_at,
      units: ms.reduce((n, m) => n + m.qty, 0), lines: ms.map(m => line(m)),
      money: Number(b.total_cost) > 0 ? Number(b.total_cost) : null, note: b.notes, supplier: b.supplier,
      ref: { type: 'batch', id: b.id },
    })
  }

  return rows.sort((a, b) => (a.date === b.date ? b.created.localeCompare(a.created) : b.date.localeCompare(a.date)))
}

export interface LedgerFilter {
  kinds: LedgerKind[]
  itemId: string
  /** A show id, 'none' for rows not at a show, or '' for any. */
  show: string
  personId: string
  from: string
  to: string
  query: string
}

export const EMPTY_FILTER: LedgerFilter = { kinds: [], itemId: '', show: '', personId: '', from: '', to: '', query: '' }

export function filterLedger(rows: LedgerRow[], f: LedgerFilter, textOf: (r: LedgerRow) => string): LedgerRow[] {
  const q = f.query.trim().toLowerCase()
  return rows.filter(r =>
    (!f.kinds.length || f.kinds.includes(r.kind)) &&
    (!f.itemId || r.lines.some(l => l.itemId === f.itemId)) &&
    (!f.show || (f.show === 'none' ? !r.showId : r.showId === f.show)) &&
    (!f.personId || r.personId === f.personId || r.heldBy === f.personId) &&
    (!f.from || r.date >= f.from) &&
    (!f.to || r.date <= f.to) &&
    (!q || textOf(r).toLowerCase().includes(q)))
}

export function ledgerTotals(rows: LedgerRow[]) {
  const t = { sold: 0, takings: 0, waiting: 0, restocked: 0, restockCost: 0, givenOrLost: 0 }
  for (const r of rows) {
    if (r.kind === 'sale') {
      t.sold += -r.units
      t.takings += r.money ?? 0
      if (r.status === 'pending') t.waiting += r.money ?? 0
    } else if (r.kind === 'restock') {
      t.restocked += r.units
      t.restockCost += r.money ?? 0
    } else if (r.kind === 'giveaway' || r.kind === 'damaged') t.givenOrLost += -r.units
  }
  return t
}
