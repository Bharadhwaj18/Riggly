// Server only: data for the admin dashboard. The database refuses every one of these calls for anyone who isn't a
// platform admin; requireAdmin() also turns them away with a plain "not found", so the pages don't advertise themselves.

import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { featuresFrom, type WorkspaceFeatures } from '@/lib/workspace-sections'
import { cardIds, todayContentFrom, type Announcement, type TodayCardId, type TodayContent } from '@/lib/today-config'

export const requireAdmin = cache(async () => {
  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  if (isAdmin !== true) notFound()
  return supabase
})

export interface AdminWorkspace {
  id: string
  name: string
  type: string
  kind: string | null
  color: string
  plan: string
  status: string
  createdAt: string
  ownerName: string | null
  ownerEmail: string | null
  members: number
  features: WorkspaceFeatures
  /** A sample band someone is trying things in. */
  demo: boolean
  todayOff: TodayCardId[]
  /** When anyone in it last signed in. */
  lastActive: string | null
}

export async function adminWorkspaces(): Promise<AdminWorkspace[]> {
  const supabase = await requireAdmin()
  const { data, error } = await supabase.rpc('admin_workspaces')
  if (error) throw new Error(error.message)
  return (data ?? []).map(w => ({
    id: w.id, name: w.name, type: w.type, kind: w.kind, color: w.color, plan: w.plan, status: w.status,
    createdAt: w.created_at, ownerName: w.owner_name, ownerEmail: w.owner_email, members: w.members,
    features: featuresFrom({ features: w.features }), demo: w.demo === true,
    todayOff: cardIds(w.today_off), lastActive: w.last_active ?? null,
  }))
}

export interface AdminUser {
  id: string
  email: string
  name: string | null
  createdAt: string
  lastSignIn: string | null
  confirmed: boolean
  isAdmin: boolean
  workspaces: { id: string; name: string; role: string }[]
}

export async function adminUsers(): Promise<AdminUser[]> {
  const supabase = await requireAdmin()
  const { data, error } = await supabase.rpc('admin_users')
  if (error) throw new Error(error.message)
  return (data ?? []).map(u => ({
    id: u.id, email: u.email, name: u.name, createdAt: u.created_at, lastSignIn: u.last_sign_in_at,
    confirmed: u.confirmed, isAdmin: u.is_admin,
    workspaces: Array.isArray(u.workspaces) ? (u.workspaces as { id: string; name: string; role: string }[]) : [],
  }))
}

export interface AdminOverview {
  users: number
  confirmed: number
  signups_7d: number
  signups_30d: number
  active_7d: number
  active_30d: number
  bands: number
  demos: number
  personal: number
  paused: number
  bands_7d: number
  plans: Record<string, number>
  signups_by_day: { day: string; n: number }[]
  announcements_live: number
}

export async function adminOverview(): Promise<AdminOverview> {
  const supabase = await requireAdmin()
  const { data, error } = await supabase.rpc('admin_overview')
  if (error) throw new Error(error.message)
  return data as unknown as AdminOverview
}

export async function adminToday(): Promise<{ content: TodayContent; core: string[] }> {
  const supabase = await requireAdmin()
  const { data, error } = await supabase.from('platform_settings').select('today, core_features').eq('id', 1).maybeSingle()
  if (error) throw new Error(error.message)
  return { content: todayContentFrom(data?.today ?? null), core: data?.core_features ?? [] }
}

export interface AdminAnnouncement extends Announcement {
  workspaceIds: string[] | null
  startsAt: string
  endsAt: string | null
  createdAt: string
}

export async function adminAnnouncements(): Promise<AdminAnnouncement[]> {
  const supabase = await requireAdmin()
  const { data, error } = await supabase.from('announcements').select('*').order('starts_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(a => ({
    id: a.id, title: a.title, body: a.body, link_url: a.link_url, link_label: a.link_label,
    tone: (['info', 'good', 'warn'].includes(a.tone) ? a.tone : 'info') as Announcement['tone'],
    workspaceIds: a.workspace_ids, startsAt: a.starts_at, endsAt: a.ends_at, createdAt: a.created_at,
  }))
}
