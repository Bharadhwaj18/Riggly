import { describe, it, expect } from 'vitest'
import { buildMerchLedger, filterLedger, ledgerTotals, EMPTY_FILTER, type LedgerRow } from './merch-ledger'

const variants = [{ id: 'vM', item_id: 'tee', label: 'M' }, { id: 'vB', item_id: 'badge', label: 'One size' }]
const move = (o: Partial<Parameters<typeof buildMerchLedger>[0]['moves'][number]>) => ({
  id: 'm', variant_id: 'vM', qty: -1, reason: 'sale', date: '2026-03-01', created_at: '2026-03-01T10:00:00Z',
  sale_id: null, batch_id: null, kit_id: null, note: null, unit_price: null, ...o,
})

const rows = buildMerchLedger({
  variants,
  kitShows: { k1: { id: 'showA', title: 'Show A', show_date: '2026-03-01' } },
  batches: [{ id: 'b1', date: '2026-02-01', created_at: '2026-02-01T09:00:00Z', supplier: 'Printer', notes: null, total_cost: 4000 }],
  moves: [
    move({ id: 'r1', qty: 20, reason: 'restock', batch_id: 'b1', date: '2026-02-01' }),
    move({ id: 's1', qty: -2, sale_id: 'sale1' }),
    move({ id: 's2', qty: -1, variant_id: 'vB', sale_id: 'sale1' }),
    move({ id: 'g1', qty: -1, reason: 'giveaway', date: '2026-03-02', created_at: '2026-03-02T10:00:00Z', note: 'For the venue' }),
  ],
  sales: [{
    id: 'sale1', date: '2026-03-01', created_at: '2026-03-01T10:00:00Z', show_id: null, kit_id: 'k1', created_by: 'ana', held_by: 'ana',
    status: 'pending', notes: null, cash_amount: 1000, upi_amount: 625, card_amount: 0,
  }],
})

describe('buildMerchLedger', () => {
  it('makes one row per sale, restock and other change, newest first', () => {
    expect(rows.map(r => r.kind)).toEqual(['giveaway', 'sale', 'restock'])
  })
  it('gathers a sale’s items and money, and finds its show through the kit', () => {
    const sale = rows.find(r => r.kind === 'sale')!
    expect(sale).toMatchObject({ units: -3, money: 1625, showTitle: 'Show A', status: 'pending', ref: { type: 'sale', id: 'sale1' } })
    expect(sale.lines.map(l => [l.itemId, l.qty])).toEqual([['tee', 2], ['badge', 1]])
  })
  it('keeps a restock as one row with its cost', () => {
    expect(rows.find(r => r.kind === 'restock')).toMatchObject({ units: 20, money: 4000, supplier: 'Printer', ref: { type: 'batch', id: 'b1' } })
  })
})

describe('filterLedger', () => {
  const text = (r: LedgerRow) => [r.showTitle, r.note, r.supplier].join(' ')
  it('filters by kind, item, show, dates and words', () => {
    expect(filterLedger(rows, { ...EMPTY_FILTER, kinds: ['sale'] }, text)).toHaveLength(1)
    expect(filterLedger(rows, { ...EMPTY_FILTER, itemId: 'badge' }, text).map(r => r.kind)).toEqual(['sale'])
    expect(filterLedger(rows, { ...EMPTY_FILTER, show: 'none' }, text).map(r => r.kind)).toEqual(['giveaway', 'restock'])
    expect(filterLedger(rows, { ...EMPTY_FILTER, from: '2026-03-01', to: '2026-03-01' }, text).map(r => r.kind)).toEqual(['sale'])
    expect(filterLedger(rows, { ...EMPTY_FILTER, query: 'venue' }, text).map(r => r.kind)).toEqual(['giveaway'])
  })
})

describe('ledgerTotals', () => {
  it('adds up what was sold, taken, restocked and given away', () => {
    expect(ledgerTotals(rows)).toEqual({ sold: 3, takings: 1625, waiting: 1625, restocked: 20, restockCost: 4000, givenOrLost: 1 })
  })
})
