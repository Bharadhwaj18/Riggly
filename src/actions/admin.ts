'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { SECTIONS, type SectionKey, type WorkspaceFeatures } from '@/lib/workspace-sections'
import { cardIds, type TodayCardId, type TodayContent } from '@/lib/today-config'

// Every action here is checked again in the database: each RPC and the announcements table refuse anyone who
// isn't a platform admin.

const KEYS = SECTIONS.map(s => s.key) as SectionKey[]
type Result = { error?: string }

/** Admin pages, and every app page, since features, Today and pausing change what bands see. */
function refresh() {
  revalidatePath('/admin', 'layout')
  revalidatePath('/', 'layout')
}

/** Switch sections on or off for one workspace. */
export async function setWorkspaceFeatures(workspaceId: string, features: WorkspaceFeatures): Promise<Result> {
  const supabase = await createClient()
  const clean = Object.fromEntries(KEYS.map(k => [k, features[k] !== false]))
  const { error } = await supabase.rpc('admin_set_workspace_features', { p_workspace: workspaceId, p_features: clean })
  if (error) return { error: error.message }
  refresh()
  return {}
}

/** The sections a brand-new workspace starts with. */
export async function setCoreFeatures(sections: SectionKey[]): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_core_features', { p_sections: sections.filter(s => KEYS.includes(s)) })
  if (error) return { error: error.message }
  revalidatePath('/admin', 'layout')
  return {}
}

/** Today cards switched off for one workspace. */
export async function setWorkspaceToday(workspaceId: string, off: TodayCardId[]): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_workspace_today', { p_workspace: workspaceId, p_off: cardIds(off) })
  if (error) return { error: error.message }
  refresh()
  return {}
}

export type WorkspaceStatus = 'active' | 'blocked'

/** Rename, change plan, pause or resume. */
export async function updateWorkspace(workspaceId: string, v: { name: string; plan: string; status: WorkspaceStatus }): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_update_workspace', { p_workspace: workspaceId, p_name: v.name, p_plan: v.plan, p_status: v.status })
  if (error) return { error: error.message }
  refresh()
  return {}
}

/** Deletes a band workspace and everything in it, for good. The exact name must be typed. */
export async function deleteWorkspace(workspaceId: string, confirmName: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_delete_workspace', { p_workspace: workspaceId, p_confirm_name: confirmName })
  if (error) return { error: error.message }
  refresh()
  return {}
}

/** What Today's info cards say, and which cards are off for everyone. */
export async function saveToday(content: TodayContent): Promise<Result> {
  const supabase = await createClient()
  const tidy = (list: string[]) => list.map(s => s.trim()).filter(Boolean)
  const { error } = await supabase.rpc('admin_set_today', {
    p_today: {
      tips: tidy(content.tips),
      updates: tidy(content.updates),
      reviews: content.reviews.map(r => ({ quote: r.quote.trim(), by: r.by.trim() })).filter(r => r.quote && r.by),
      news: content.news.trim(),
      start: content.start.trim(),
      off: cardIds(content.off),
    },
  })
  if (error) return { error: error.message }
  refresh()
  return {}
}

export interface AnnouncementInput {
  title: string
  body: string
  linkUrl: string
  linkLabel: string
  tone: 'info' | 'good' | 'warn'
  /** Empty: every workspace. */
  workspaceIds: string[]
  /** ISO times; empty start means now, empty end means until it's ended by hand. */
  startsAt: string
  endsAt: string
}

export async function saveAnnouncement(id: string | null, v: AnnouncementInput): Promise<Result> {
  const supabase = await createClient()
  const title = v.title.trim()
  if (!title) return { error: 'Give the announcement a title.' }
  const linkUrl = v.linkUrl.trim()
  if (linkUrl && !/^(https:\/\/|\/)/.test(linkUrl)) return { error: 'Links must start with https:// or with / for a page in the app.' }
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) return { error: 'The end has to be after the start.' }
  const row = {
    title,
    body: v.body.trim() || null,
    link_url: linkUrl || null,
    link_label: linkUrl ? v.linkLabel.trim() || null : null,
    tone: v.tone,
    workspace_ids: v.workspaceIds.length ? v.workspaceIds : null,
    starts_at: v.startsAt || new Date().toISOString(),
    ends_at: v.endsAt || null,
  }
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = id
    ? await supabase.from('announcements').update(row).eq('id', id)
    : await supabase.from('announcements').insert({ ...row, created_by: user?.id ?? null })
  if (error) return { error: error.message }
  refresh()
  return {}
}

/** Ends an announcement now. It stays in the list as ended. */
export async function endAnnouncement(id: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.from('announcements').update({ ends_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  refresh()
  return {}
}

export async function deleteAnnouncement(id: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.from('announcements').delete().eq('id', id)
  if (error) return { error: error.message }
  refresh()
  return {}
}
