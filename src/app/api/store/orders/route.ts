import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { rejectUnlessStore, storeConfig } from '@/lib/store-api'

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

// A paid website order: saved with its pending online sale and the stock it takes, in one step.
// Safe to send twice: the same website order id returns what was saved the first time.
export async function POST(request: NextRequest) {
  const rejected = rejectUnlessStore(request)
  if (rejected) return rejected

  const body = await request.json().catch(() => null)
  const orderId = text(body?.websiteOrderId, 100)
  const lines = Array.isArray(body?.lines) ? body.lines : []
  const total = Number(body?.total)
  if (!orderId || !lines.length || !(total >= 0)) {
    return NextResponse.json({ error: 'The order is missing its id, items or total.' }, { status: 400 })
  }

  type LineIn = { variantId?: unknown; item?: unknown; label?: unknown; qty?: unknown; price?: unknown }
  const cleanLines = (lines as LineIn[]).map(l => ({
    variant_id: text(l?.variantId, 64),
    item: text(l?.item, 120),
    label: text(l?.label, 40),
    qty: Math.trunc(Number(l?.qty)),
    price: l?.price != null && Number.isFinite(Number(l.price)) ? Math.max(0, Number(l.price)) : null,
  }))
  if (cleanLines.some(l => !l.variant_id || !(l.qty > 0))) {
    return NextResponse.json({ error: 'Every item needs a Riggly size and a quantity.' }, { status: 400 })
  }

  const { workspaceId, holderId } = storeConfig()
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('record_online_order', {
    p_ws: workspaceId,
    p_holder: holderId ?? undefined,
    p_order: {
      website_order_id: orderId,
      customer_name: text(body?.customer?.name, 200),
      email: text(body?.customer?.email, 320),
      phone: text(body?.customer?.phone, 40),
      address: text(body?.customer?.address, 1000),
      city: text(body?.customer?.city, 120),
      state: text(body?.customer?.state, 120),
      pincode: text(body?.customer?.pincode, 20),
      total: Math.round(total * 100) / 100,
      payment_ref: text(body?.paymentRef, 200),
      paid_at: text(body?.paidAt, 40),
      lines: cleanLines,
    },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidatePath('/merch')
  return NextResponse.json(data)
}
