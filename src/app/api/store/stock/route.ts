import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rejectUnlessStore, storeConfig } from '@/lib/store-api'

// What the band website can sell: every live item and size with its stock, the units out in kits not yet approved,
// and what's left for online orders.
export async function GET(request: NextRequest) {
  const rejected = rejectUnlessStore(request)
  if (rejected) return rejected

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('merch_online_stock', { p_ws: storeConfig().workspaceId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = new Map<string, { id: string; name: string; kind: string | null; variants: { id: string; label: string; stock: number; inKits: number; available: number }[] }>()
  for (const row of data ?? []) {
    const item = items.get(row.item_id) ?? { id: row.item_id, name: row.item_name, kind: row.item_kind, variants: [] }
    item.variants.push({ id: row.variant_id, label: row.label, stock: row.stock, inKits: row.in_kits, available: row.available })
    items.set(row.item_id, item)
  }
  return NextResponse.json({ items: [...items.values()] }, { headers: { 'Cache-Control': 'no-store' } })
}
