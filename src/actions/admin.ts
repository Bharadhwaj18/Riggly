'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { SECTIONS, type SectionKey, type WorkspaceFeatures } from '@/lib/workspace-sections'

const KEYS = SECTIONS.map(s => s.key) as SectionKey[]

/** Switch sections on or off for one workspace. Platform admins only (checked in the database). */
export async function setWorkspaceFeatures(workspaceId: string, features: WorkspaceFeatures): Promise<{ error?: string }> {
  const supabase = await createClient()
  const clean = Object.fromEntries(KEYS.map(k => [k, features[k] !== false]))
  const { error } = await supabase.rpc('admin_set_workspace_features', { p_workspace: workspaceId, p_features: clean })
  if (error) return { error: error.message }
  // Every page reads the current workspace's features through the layout.
  revalidatePath('/', 'layout')
  return {}
}

/** The sections a brand-new workspace starts with. */
export async function setCoreFeatures(sections: SectionKey[]): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_core_features', { p_sections: sections.filter(s => KEYS.includes(s)) })
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return {}
}
