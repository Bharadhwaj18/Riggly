'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceContext } from '@/lib/workspace'
import { chooseWorkspace } from '@/lib/workspace-cookies'
import { PENDING_INVITE_COOKIE } from '@/lib/workspace-shared'
import { isDemoWorkspace } from '@/lib/demo'

/** Opens your demo band, making it first if you don't have one yet. */
export async function openDemo(): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_demo_workspace')
  if (error || !data) return { error: error?.message ?? 'Couldn’t open the demo.' }
  await chooseWorkspace(data)
  return { id: data }
}

/**
 * Right after sign-up: start a brand-new person in their demo band. Not for someone who came in through an invite
 * link (they go to the band that invited them) or who is already in a band.
 */
export async function openDemoForNewUser(): Promise<{ error?: string; id?: string }> {
  if ((await cookies()).get(PENDING_INVITE_COOKIE)?.value) return {}
  const ctx = await getWorkspaceContext()
  if (ctx?.memberships.some(m => m.workspace.type !== 'personal' && !isDemoWorkspace(m.workspace))) return {}
  return openDemo()
}

/** Throws the current demo away and starts a fresh one with the sample data. */
export async function resetDemo(): Promise<{ error?: string; id?: string }> {
  const ctx = await getWorkspaceContext()
  if (!ctx || !isDemoWorkspace(ctx.current.workspace)) return { error: 'You’re not in a demo band.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('reset_demo_workspace', { p_ws: ctx.current.workspace.id })
  if (error || !data) return { error: error?.message ?? 'Couldn’t reset the demo.' }
  await chooseWorkspace(data)
  return { id: data }
}
