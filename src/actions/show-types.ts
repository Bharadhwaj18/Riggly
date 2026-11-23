'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireWorkspaceId } from '@/lib/workspace'
import { cleanTag } from '@/lib/song-tags'

const cleanTags = (tags: string[]) => [...new Map(tags.map(cleanTag).filter(Boolean).map(t => [t.toLowerCase(), t])).values()]

export async function saveShowType(input: { id?: string; name: string; tags: string[] }): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const name = input.name.replace(/\s+/g, ' ').trim()
  if (!name) return { error: 'Give the show type a name.' }
  if (name.length > 60) return { error: 'Keep the name under 60 characters.' }
  const tags = cleanTags(input.tags)

  if (input.id) {
    const { error } = await supabase.from('show_types').update({ name, tags }).eq('id', input.id)
    if (error) return { error: error.code === '23505' ? 'You already have a show type with that name.' : error.message }
    revalidatePath('/setlists')
    return { id: input.id }
  }
  const { data, error } = await supabase
    .from('show_types')
    .insert({ name, tags, created_by: user.id, workspace_id: await requireWorkspaceId() })
    .select('id')
    .single()
  if (error || !data) return { error: error?.code === '23505' ? 'You already have a show type with that name.' : (error?.message ?? 'Could not save') }
  revalidatePath('/setlists')
  return { id: data.id }
}

export async function deleteShowType(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('show_types').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/setlists')
  return {}
}

/** Sets (or clears) the kind of show a setlist is for. */
export async function setSetlistShowType(setlistId: string, showTypeId: string | null): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data, error } = await supabase.from('setlists').update({ show_type_id: showTypeId, updated_by: user.id }).eq('id', setlistId).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'You can’t edit this setlist.' }
  revalidatePath(`/setlists/${setlistId}`)
  return {}
}
