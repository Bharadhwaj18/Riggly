'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireWorkspaceId } from '@/lib/workspace'
import type { EventManagementFormData } from '@/lib/validators'

export async function createEventManagement(data: EventManagementFormData): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: company, error } = await supabase
    .from('event_management')
    .insert({ ...data, created_by: user.id, workspace_id: await requireWorkspaceId(), })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/event-management')
  redirect(`/event-management/${company.id}`)
}

/** Adds an agency by name from the show form, without leaving it. Contact details can be filled in later. */
export async function quickAddAgency(name: string): Promise<{ error?: string; agency?: { id: string; name: string } }> {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (!clean) return { error: 'Type the agency’s name first.' }
  if (clean.length > 120) return { error: 'That name is too long.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const workspaceId = await requireWorkspaceId()

  // Same name already there (any case)? Use it rather than making a duplicate.
  const { data: existing } = await supabase.from('event_management').select('id, name').eq('workspace_id', workspaceId).ilike('name', clean.replace(/[%_\\]/g, '\\$&')).limit(1).maybeSingle()
  if (existing) return { agency: existing }

  const { data: agency, error } = await supabase
    .from('event_management')
    .insert({ name: clean, created_by: user.id, workspace_id: workspaceId })
    .select('id, name')
    .single()
  if (error) return { error: error.code === '42501' ? 'You can’t add agencies in this workspace.' : error.message }

  revalidatePath('/event-management')
  return { agency }
}

export async function updateEventManagement(id: string, data: EventManagementFormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.from('event_management').update({ ...data, updated_by: user.id }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/event-management')
  revalidatePath(`/event-management/${id}`)
  redirect(`/event-management/${id}`)
}

export async function deleteEventManagement(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('event_management').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/event-management')
  revalidatePath('/shows')
  redirect('/event-management')
}
