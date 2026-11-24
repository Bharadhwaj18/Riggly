import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceContext } from '@/lib/workspace'
import { getCachedAllProfilesWithCrew, getCachedProfileAvatars, getCachedUser } from '@/lib/data'
import { normalisePermissions } from '@/lib/workspace-shared'
import { SECTIONS, type SectionKey } from '@/lib/workspace-sections'
import { accessUntilFrom, grantsFromRows, isAccessManager, isLimitedMember, isPastLastDay, liveGrants, scopesFrom, type AccessGrant } from '@/lib/access'
import type { InviteRow, MemberRow, ShareableItems, WorkspaceSummary } from '@/components/workspace/settings-types'

/** Who is looking at Settings, and which workspace's settings they're seeing. Shared by the layout and every page. */
export const getSettingsContext = cache(async () => {
  const [ctx, { data: { user } }] = await Promise.all([getWorkspaceContext(), getCachedUser()])
  if (!ctx || !user) redirect('/login')
  const { workspace, role } = ctx.current
  const isOwner = role === 'owner'
  const isAdmin = isOwner || role === 'admin'
  const isPersonal = workspace.type === 'personal'

  const [profiles, avatars] = await Promise.all([getCachedAllProfilesWithCrew(), getCachedProfileAvatars()])
  const supabase = await createClient()
  const [{ data: me }, { data: platformAdmin }] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
    supabase.rpc('is_platform_admin'),
  ])

  const summary: WorkspaceSummary = {
    id: workspace.id,
    name: workspace.name,
    kind: workspace.kind ?? null,
    description: workspace.description ?? null,
    color: workspace.color,
    avatarUrl: workspace.avatar_url ?? null,
    offSections: SECTIONS.filter(sec => !ctx.current.features[sec.key]).map(sec => sec.key),
  }

  return {
    userId: user.id,
    email: user.email ?? '',
    name: me?.display_name?.trim() || profiles.find(p => p.id === user.id)?.display_name?.trim() || '',
    avatarUrl: avatars[user.id] ?? null,
    workspace: summary,
    isPersonal,
    isOwner,
    isAdmin,
    /** Can change other members' access: owner, admins and Access managers. */
    canManageAccess: isAdmin || (!isPersonal && !!ctx.current.accessManager && !ctx.current.accessEnded),
    /** Can open the admin panel (every workspace's features). Not the same as a workspace admin. */
    isPlatformAdmin: platformAdmin === true,
  }
})

/** Everyone in the current workspace. What each person can open is only filled in for people who manage access. */
export const getSettingsMembers = cache(async (): Promise<MemberRow[]> => {
  const s = await getSettingsContext()
  const supabase = await createClient()
  const [{ data: rows }, profiles, avatars, grantRows] = await Promise.all([
    supabase.from('workspace_members').select('user_id, role, permissions, created_at').eq('workspace_id', s.workspace.id).order('created_at'),
    getCachedAllProfilesWithCrew(),
    getCachedProfileAvatars(),
    s.canManageAccess
      ? supabase.from('access_grants').select('user_id, section, item_id, level, until').eq('workspace_id', s.workspace.id).then(r => r.data ?? [])
      : Promise.resolve([] as { user_id: string; section: string; item_id: string; level: string; until: string | null }[]),
  ])
  // People with only a few shared items are listed for those who manage access; the band doesn't see them as members.
  return (rows ?? []).filter(m => s.canManageAccess || m.user_id === s.userId || !isLimitedMember(m)).map(m => {
    const accessUntil = accessUntilFrom(m.permissions, m.role)
    const grants = liveGrants(grantsFromRows(grantRows.filter(g => g.user_id === m.user_id)))
    const grantCounts: Partial<Record<SectionKey, number>> = {}
    for (const g of grants) grantCounts[g.section] = (grantCounts[g.section] ?? 0) + 1
    return {
      userId: m.user_id,
      name: profiles.find(p => p.id === m.user_id)?.display_name?.trim() || 'Unnamed member',
      role: m.role,
      treasurer: normalisePermissions(m.permissions).treasurer === true,
      merchManager: normalisePermissions(m.permissions).merch_manager === true,
      accessManager: m.role === 'member' && isAccessManager(m.permissions, m.role),
      sections: scopesFrom(s.canManageAccess ? m.permissions : null, m.role),
      accessUntil: s.canManageAccess ? accessUntil : null,
      accessEnded: s.canManageAccess && isPastLastDay(accessUntil),
      limited: isLimitedMember(m),
      grantCounts,
      isYou: m.user_id === s.userId,
      avatarUrl: avatars[m.user_id] ?? null,
    }
  })
})

/** One member's access, for their Access page. Null when it isn't yours to change. */
export const getMemberAccess = cache(async (userId: string): Promise<{ member: MemberRow; grants: AccessGrant[] } | null> => {
  const s = await getSettingsContext()
  if (!s.canManageAccess || s.isPersonal || userId === s.userId) return null
  const member = (await getSettingsMembers()).find(m => m.userId === userId)
  if (!member || member.role === 'owner' || member.role === 'admin') return null
  const supabase = await createClient()
  const { data } = await supabase.from('access_grants').select('section, item_id, level, until').eq('workspace_id', s.workspace.id).eq('user_id', userId)
  return { member, grants: grantsFromRows(data ?? []) }
})

/** Invite links still working in the current workspace. Admins only; everyone else gets none. */
export const getSettingsInvites = cache(async (): Promise<InviteRow[]> => {
  const s = await getSettingsContext()
  if (!s.isAdmin || s.isPersonal) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('workspace_invites')
    .select('id, token, role, permissions, expires_at, max_uses, use_count')
    .eq('workspace_id', s.workspace.id)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  return (data ?? [])
    .filter(i => i.max_uses === null || i.use_count < i.max_uses)
    .map(i => {
      const p = i.permissions && typeof i.permissions === 'object' && !Array.isArray(i.permissions) ? (i.permissions as Record<string, unknown>) : {}
      const grants = Array.isArray(p.grants) ? (p.grants as { section?: string }[]) : []
      const grantCounts: Partial<Record<SectionKey, number>> = {}
      for (const g of grants) if (typeof g.section === 'string') grantCounts[g.section as SectionKey] = (grantCounts[g.section as SectionKey] ?? 0) + 1
      return {
        id: i.id, token: i.token, role: i.role, expiresAt: i.expires_at, maxUses: i.max_uses, useCount: i.use_count,
        sections: 'sections' in p || p.merch_crew === true ? scopesFrom(p, 'member') : null,
        accessUntil: accessUntilFrom(p, i.role),
        grantCounts,
      }
    })
})

/**
 * Everything that can be shared, by feature, for the access editor: newest or upcoming first.
 * Read with the signed-in person's own access, so they can only share what they can see.
 */
export const getShareableItems = cache(async (): Promise<ShareableItems> => {
  const s = await getSettingsContext()
  const empty = Object.fromEntries(SECTIONS.map(sec => [sec.key, []])) as unknown as ShareableItems
  if (!s.canManageAccess || s.isPersonal) return empty
  const ws = s.workspace.id
  const supabase = await createClient()
  const [shows, setlists, songs, recordings, events, boards, notes, agencies, projects, budgets, kits] = await Promise.all([
    supabase.from('shows').select('id, title, show_date, venue').eq('workspace_id', ws).order('show_date', { ascending: false, nullsFirst: false }),
    supabase.from('setlists').select('id, title, show_date, venue').eq('workspace_id', ws).order('show_date', { ascending: false, nullsFirst: false }),
    supabase.from('songs').select('id, title, artist').eq('workspace_id', ws).order('title'),
    supabase.from('recordings').select('id, title, created_at').eq('workspace_id', ws).order('created_at', { ascending: false }),
    supabase.from('calendar_events').select('id, title, start_date').eq('workspace_id', ws).order('start_date', { ascending: false }),
    supabase.from('task_boards').select('id, name').eq('workspace_id', ws).is('archived_at', null).order('name'),
    supabase.from('notes').select('id, title, updated_at').eq('workspace_id', ws).is('deleted_at', null).order('updated_at', { ascending: false }),
    supabase.from('event_management').select('id, name, base_location').eq('workspace_id', ws).order('name'),
    supabase.from('finance_projects').select('id, name, start_date').eq('workspace_id', ws).order('created_at', { ascending: false }),
    supabase.from('budgets').select('id, name, start_date').eq('workspace_id', ws).order('created_at', { ascending: false }),
    supabase.from('merch_kits').select('id, show_id, created_at').eq('workspace_id', ws).order('created_at', { ascending: false }),
  ])
  const showById = new Map((shows.data ?? []).map(r => [r.id, r]))
  return {
    shows: (shows.data ?? []).map(r => ({ id: r.id, title: r.title, detail: r.venue, date: r.show_date })),
    setlists: (setlists.data ?? []).map(r => ({ id: r.id, title: r.title, detail: r.venue, date: r.show_date })),
    songs: (songs.data ?? []).map(r => ({ id: r.id, title: r.title, detail: r.artist, date: null })),
    recordings: (recordings.data ?? []).map(r => ({ id: r.id, title: r.title, detail: null, date: r.created_at.slice(0, 10) })),
    calendar: (events.data ?? []).map(r => ({ id: r.id, title: r.title, detail: null, date: r.start_date })),
    tasks: (boards.data ?? []).map(r => ({ id: r.id, title: r.name, detail: null, date: null })),
    notes: (notes.data ?? []).map(r => ({ id: r.id, title: r.title?.trim() || 'Untitled note', detail: null, date: null })),
    agencies: (agencies.data ?? []).map(r => ({ id: r.id, title: r.name, detail: r.base_location, date: null })),
    finance: [
      ...(projects.data ?? []).map(r => ({ id: r.id, title: r.name, detail: 'Project', date: r.start_date })),
      ...(budgets.data ?? []).map(r => ({ id: r.id, title: r.name, detail: 'Budget', date: r.start_date })),
    ],
    merch: (kits.data ?? []).map(r => {
      const show = r.show_id ? showById.get(r.show_id) : undefined
      return { id: r.id, title: show ? `Kit · ${show.title}` : 'Kit (no show)', detail: show?.venue ?? null, date: show?.show_date ?? null }
    }),
  }
})

/** Tags already on entries in the current workspace, so Money settings can list and rename them. */
export async function getUsedTags(workspaceId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('finance_transactions').select('tags').eq('workspace_id', workspaceId)
  return [...new Set((data ?? []).flatMap(r => r.tags ?? []))]
}
