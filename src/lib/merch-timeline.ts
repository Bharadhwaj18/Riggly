// The Shows timeline on the Merch page: one row per show that had merch, whether it was sold through a kit or
// recorded on the Sell page, newest first. Kept free of React so it can be tested on its own.

import { groupSalesByShow, kitSoldByVariant, saleTakings, type KitStatus, type MerchKit, type MerchMove, type MerchSale } from '@/lib/merch'

type ShowRef = { id: string; title: string; show_date: string | null } | null

export type TimelineStatus = 'open' | 'waiting' | 'done'

export interface TimelineEntry {
  key: string
  title: string
  date: string | null
  showId: string | null
  kitId: string | null
  kitStatus: KitStatus | null
  units: number
  money: number
  status: TimelineStatus
  /** Where tapping the row goes: the kit when there is one, else the show. */
  href: string | null
}

const KIT_TO_STATUS: Record<KitStatus, TimelineStatus> = { open: 'open', closed: 'waiting', approved: 'done' }

export function buildMerchTimeline({ kits, moves, sales }: {
  kits: (Pick<MerchKit, 'id' | 'status' | 'cash_in' | 'upi_in' | 'card_in'> & { show: ShowRef })[]
  moves: Pick<MerchMove, 'kit_id' | 'variant_id' | 'qty' | 'reason' | 'sale_id'>[]
  sales: (Pick<MerchSale, 'id' | 'kit_id' | 'show_id' | 'date' | 'status' | 'cash_amount' | 'upi_amount' | 'card_amount'> & { show: ShowRef })[]
}): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  for (const k of kits) {
    const status = k.status as KitStatus
    const units = [...kitSoldByVariant(k.id, moves).values()].reduce((a, b) => a + b, 0)
    // While the stall is open the money is what's been rung up so far; once closed it's what was counted.
    const money = status === 'open'
      ? sales.filter(s => s.kit_id === k.id).reduce((n, s) => n + saleTakings(s), 0)
      : Number(k.cash_in ?? 0) + Number(k.upi_in ?? 0) + Number(k.card_in ?? 0)
    entries.push({
      key: `kit-${k.id}`, title: k.show?.title ?? 'Deleted show', date: k.show?.show_date ?? null,
      showId: k.show?.id ?? null, kitId: k.id, kitStatus: status, units, money,
      status: KIT_TO_STATUS[status] ?? 'open', href: `/merch/kits/${k.id}`,
    })
  }

  for (const g of groupSalesByShow(sales.filter(s => !s.kit_id))) {
    const ids = new Set(g.sales.map(s => s.id))
    const units = moves.reduce((n, m) => (m.sale_id && ids.has(m.sale_id) ? n - m.qty : n), 0)
    const first = g.sales[0]
    entries.push({
      key: `sales-${g.showId ?? first?.date ?? 'none'}`,
      title: first?.show?.title ?? 'Not at a show',
      date: first?.show?.show_date ?? first?.date ?? null,
      showId: g.showId, kitId: null, kitStatus: null, units,
      money: g.sales.reduce((n, s) => n + saleTakings(s), 0),
      status: g.sales.some(s => s.status === 'pending') ? 'waiting' : 'done',
      href: g.showId ? `/shows/${g.showId}` : null,
    })
  }

  return entries.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}
