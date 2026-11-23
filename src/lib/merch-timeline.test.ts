import { describe, it, expect } from 'vitest'
import { buildMerchTimeline } from './merch-timeline'

const show = (id: string, date: string) => ({ id, title: `Show ${id}`, show_date: date })
const sale = (id: string, o: Partial<{ kit_id: string | null; show_id: string | null; date: string; status: string; cash: number }> = {}) => ({
  id, kit_id: o.kit_id ?? null, show_id: o.show_id ?? null, date: o.date ?? '2026-01-01', status: o.status ?? 'approved',
  cash_amount: o.cash ?? 0, upi_amount: 0, card_amount: 0,
  show: o.show_id ? show(o.show_id, o.date ?? '2026-01-01') : null,
})

describe('buildMerchTimeline', () => {
  it('puts kits and Sell-page sales on one list, newest first', () => {
    const rows = buildMerchTimeline({
      kits: [{ id: 'k1', status: 'approved', cash_in: 1000, upi_in: 600, card_in: 0, show: show('a', '2026-03-01') }],
      moves: [
        { kit_id: 'k1', variant_id: 'v', qty: -2, reason: 'sale', sale_id: null },
        { kit_id: null, variant_id: 'v', qty: -3, reason: 'sale', sale_id: 's1' },
      ],
      sales: [sale('s1', { show_id: 'b', date: '2026-04-01', status: 'pending', cash: 2400 })],
    })
    expect(rows.map(r => r.title)).toEqual(['Show b', 'Show a'])
    expect(rows[0]).toMatchObject({ units: 3, money: 2400, status: 'waiting', kitId: null, href: '/shows/b' })
    expect(rows[1]).toMatchObject({ units: 2, money: 1600, status: 'done', kitId: 'k1', href: '/merch/kits/k1' })
  })

  it('counts an open kit’s money from what the stall has rung up so far', () => {
    const rows = buildMerchTimeline({
      kits: [{ id: 'k1', status: 'open', cash_in: null, upi_in: null, card_in: null, show: show('a', '2026-03-01') }],
      moves: [],
      sales: [sale('s1', { kit_id: 'k1', cash: 800 }), sale('s2', { kit_id: 'k1', cash: 800 })],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'open', money: 1600 })
  })

  it('keeps sales not at a show as their own row', () => {
    const rows = buildMerchTimeline({ kits: [], moves: [], sales: [sale('s1', { date: '2026-05-02', cash: 100 })] })
    expect(rows[0]).toMatchObject({ title: 'Not at a show', date: '2026-05-02', href: null })
  })
})
