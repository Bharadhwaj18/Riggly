'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceContext, isMerchApprover } from '@/lib/workspace'
import { callWebsite, storeConfig } from '@/lib/store-api'

type Result = { error?: string; refundInFinance?: boolean }

// Website orders are shipped and cancelled through the website, which emails the customer and then tells Rigly,
// so both sides always agree. Only owners, admins and the Merch role can do either.
async function orderFor(id: string): Promise<{ error: string } | { websiteOrderId: string }> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return { error: 'Sign in again.' }
  if (!isMerchApprover(ctx.current)) return { error: 'Only an admin or someone with the Merch role can do this.' }
  if (ctx.current.workspace.id !== storeConfig().workspaceId) return { error: 'This workspace isn’t linked to the website.' }
  const supabase = await createClient()
  const { data: order } = await supabase.from('merch_online_orders').select('website_order_id, status')
    .eq('id', id).eq('workspace_id', ctx.current.workspace.id).maybeSingle()
  if (!order) return { error: 'That order is no longer there.' }
  if (order.status === 'cancelled') return { error: 'This order is already cancelled.' }
  return { websiteOrderId: order.website_order_id }
}

export async function shipOnlineOrder(id: string, tracking: string): Promise<Result> {
  const trackingNumber = (tracking ?? '').trim().slice(0, 200)
  if (!trackingNumber) return { error: 'Add the India Post tracking number.' }
  const order = await orderFor(id)
  if ('error' in order) return order
  const res = await callWebsite('/api/store/orders/ship', { orderId: order.websiteOrderId, tracking: trackingNumber })
  revalidatePath('/merch')
  return res.ok ? {} : { error: res.error }
}

export async function cancelOnlineOrder(id: string, reason: string): Promise<Result> {
  const why = (reason ?? '').trim().slice(0, 1000)
  if (!why) return { error: 'Say why it’s being cancelled. The customer sees this.' }
  const order = await orderFor(id)
  if ('error' in order) return order
  const res = await callWebsite('/api/store/orders/cancel', { orderId: order.websiteOrderId, reason: why })
  revalidatePath('/merch')
  revalidatePath('/finance')
  return res.ok ? { refundInFinance: !!res.data?.rigly?.refund_in_finance } : { error: res.error }
}
