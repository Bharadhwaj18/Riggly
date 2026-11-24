import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { rejectUnlessStore, storeConfig } from '@/lib/store-api'

// The website tells Rigly an order was shipped or cancelled (whichever side the button was pressed on).
// Cancelling puts the stock back; money already approved stays in Finance until the refund is taken off by hand.
export async function POST(request: NextRequest) {
  const rejected = rejectUnlessStore(request)
  if (rejected) return rejected

  const body = await request.json().catch(() => null)
  const orderId = typeof body?.websiteOrderId === 'string' ? body.websiteOrderId.trim() : ''
  const status = body?.status
  if (!orderId || (status !== 'shipped' && status !== 'cancelled')) {
    return NextResponse.json({ error: 'Send the order id and a status of shipped or cancelled.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('set_online_order_status', {
    p_ws: storeConfig().workspaceId,
    p_website_order_id: orderId,
    p_status: status,
    p_tracking: typeof body?.tracking === 'string' ? body.tracking.slice(0, 200) : undefined,
    p_reason: typeof body?.reason === 'string' ? body.reason.slice(0, 1000) : undefined,
  })
  if (error) {
    const missing = /isn’t in Rigly/.test(error.message)
    return NextResponse.json({ error: error.message }, { status: missing ? 404 : 400 })
  }
  revalidatePath('/merch')
  return NextResponse.json(data)
}
