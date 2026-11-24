'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Mail, MapPin, Phone, Truck, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { StatusPill, type PillTone } from '@/components/ui/StatusPill'
import { useToast } from '@/components/ui/Toaster'
import { useMoney } from '@/components/finance/FinanceSettingsContext'
import { formatDateDMY } from '@/lib/dates'
import { cancelOnlineOrder, shipOnlineOrder } from '@/actions/merch-online'
import type { Database } from '@/types/database'

export type OnlineOrder = Database['public']['Tables']['merch_online_orders']['Row']
type Line = { variant_id: string; item: string | null; label: string | null; qty: number; price: number | null }
type Filter = 'paid' | 'shipped' | 'cancelled' | 'all'

const STATUS: Record<string, { tone: PillTone; label: string }> = {
  paid: { tone: 'amber', label: 'To ship' },
  shipped: { tone: 'green', label: 'Shipped' },
  cancelled: { tone: 'gray', label: 'Cancelled' },
}

const linesOf = (o: OnlineOrder): Line[] => (Array.isArray(o.lines) ? (o.lines as unknown as Line[]) : [])
const dayOf = (iso: string) => formatDateDMY(iso.slice(0, 10))

/** Orders paid on the band website: who bought what, where it goes, and shipping or cancelling it. */
export function OnlineOrders({ orders, canAct }: { orders: OnlineOrder[]; canAct: boolean }) {
  const { money } = useMoney()
  const toShip = orders.filter(o => o.status === 'paid').length
  const [filter, setFilter] = useState<Filter>(toShip ? 'paid' : 'all')
  const [shipping, setShipping] = useState<OnlineOrder | null>(null)
  const [cancelling, setCancelling] = useState<OnlineOrder | null>(null)
  const shown = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  if (orders.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-500">No website orders yet. Paid orders from the band website show up here with their money waiting for approval.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Chip active={filter === 'paid'} onClick={() => setFilter('paid')}>To ship ({toShip})</Chip>
        <Chip active={filter === 'shipped'} onClick={() => setFilter('shipped')}>Shipped</Chip>
        <Chip active={filter === 'cancelled'} onClick={() => setFilter('cancelled')}>Cancelled</Chip>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All ({orders.length})</Chip>
      </div>
      {shown.length === 0 && <p className="py-6 text-center text-sm text-gray-500">Nothing here.</p>}
      <ul className="space-y-3">
        {shown.map(o => {
          const pill = STATUS[o.status] ?? STATUS.paid
          const place = [o.address, o.city, o.state, o.pincode].filter(Boolean).join(', ')
          return (
            <li key={o.id} className="rounded-2xl border border-brand-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900">{o.customer_name}</p>
                  <p className="text-xs text-gray-500">#{o.website_order_id.slice(0, 8)} · paid {dayOf(o.paid_at)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-bold tabular-nums text-gray-900">{money(Number(o.total))}</span>
                  <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                </div>
              </div>

              <ul className="mt-2 space-y-0.5 text-sm text-gray-800">
                {linesOf(o).map((l, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="min-w-0 flex-1 break-words">{l.item ?? 'Item'}{l.label ? ` · ${l.label}` : ''}</span>
                    <span className="shrink-0 tabular-nums text-gray-500">× {l.qty}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 space-y-1 text-xs text-gray-600">
                {place && <p className="flex gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-words">{place}</span></p>}
                {o.phone && <p className="flex gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" /><a className="underline" href={`tel:${o.phone}`}>{o.phone}</a></p>}
                {o.email && <p className="flex gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" /><a className="min-w-0 break-all underline" href={`mailto:${o.email}`}>{o.email}</a></p>}
                {o.payment_ref && <p className="break-all">PhonePe payment {o.payment_ref}</p>}
                {o.status === 'shipped' && <p className="flex gap-1.5"><Truck className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-all">Shipped {o.shipped_at ? dayOf(o.shipped_at) : ''}{o.tracking_number ? ` · tracking ${o.tracking_number}` : ''}</span></p>}
                {o.status === 'cancelled' && <p className="flex gap-1.5"><XCircle className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-words">Cancelled {o.cancelled_at ? dayOf(o.cancelled_at) : ''}{o.cancel_reason ? ` · ${o.cancel_reason}` : ''}</span></p>}
              </div>

              {o.stock_short && o.status !== 'cancelled' && (
                <p className="mt-3 flex gap-1.5 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Riggly didn’t have enough of this left when it was paid for. Check the box before shipping, or cancel and refund.</span>
                </p>
              )}
              {o.refund_in_finance && (
                <p className="mt-3 flex gap-1.5 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>The money for this order was already approved. Take the refund off in Finance once it’s paid back.</span>
                </p>
              )}

              {canAct && o.status !== 'cancelled' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {o.status === 'paid' && <Button size="sm" onClick={() => setShipping(o)}><Truck className="h-4 w-4" />Mark shipped</Button>}
                  <Button size="sm" variant="secondary" onClick={() => setCancelling(o)}>Cancel order</Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <ShipModal order={shipping} onClose={() => setShipping(null)} />
      <CancelModal order={cancelling} onClose={() => setCancelling(null)} />
    </div>
  )
}

function ShipModal({ order, onClose }: { order: OnlineOrder | null; onClose: () => void }) {
  const toast = useToast()
  const router = useRouter()
  const [tracking, setTracking] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!order) return
    if (!tracking.trim()) { toast('Add the India Post tracking number.', 'info'); return }
    setPending(true)
    const res = await shipOnlineOrder(order.id, tracking)
    setPending(false)
    if (res.error) { toast(res.error, 'error'); return }
    toast('Marked shipped. The customer has been emailed the tracking number.', 'success')
    setTracking('')
    onClose()
    router.refresh()
  }

  return (
    <Modal open={!!order} onOpenChange={open => { if (!open) onClose() }} title="Mark shipped" description={order ? `${order.customer_name} · #${order.website_order_id.slice(0, 8)}` : undefined} className="max-w-[440px] rounded-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="ship-tracking">India Post tracking number</Label>
          <Input id="ship-tracking" value={tracking} onChange={e => setTracking(e.target.value)} placeholder="e.g. EK123456789IN" autoFocus />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Back</Button>
          <Button type="submit" loading={pending}>Mark shipped</Button>
        </div>
      </form>
    </Modal>
  )
}

function CancelModal({ order, onClose }: { order: OnlineOrder | null; onClose: () => void }) {
  const toast = useToast()
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!order) return
    if (!reason.trim()) { toast('Say why it’s being cancelled. The customer sees this.', 'info'); return }
    setPending(true)
    const res = await cancelOnlineOrder(order.id, reason)
    setPending(false)
    if (res.error) { toast(res.error, 'error'); return }
    toast(res.refundInFinance
      ? 'Cancelled and stock put back. The money was already approved, so take the refund off in Finance.'
      : 'Cancelled, stock put back and the customer emailed.', 'success')
    setReason('')
    onClose()
    router.refresh()
  }

  return (
    <Modal open={!!order} onOpenChange={open => { if (!open) onClose() }} title="Cancel this order?" description={order ? `${order.customer_name} · #${order.website_order_id.slice(0, 8)}` : undefined} className="max-w-[440px] rounded-2xl">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-600">The stock goes back and the customer gets an email. Refund the money from the PhonePe dashboard yourself: Riggly and the website don’t send refunds.</p>
        <div>
          <Label htmlFor="cancel-reason">Why (the customer sees this)</Label>
          <Textarea id="cancel-reason" value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="e.g. That size sold out at a show." />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Keep it</Button>
          <Button type="submit" loading={pending}>Cancel order</Button>
        </div>
      </form>
    </Modal>
  )
}
