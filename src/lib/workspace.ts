import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth-cache'
import { WORKSPACE_COOKIE, pickCurrentWorkspace, normalisePermissions } from '@/lib/workspace-shared'
import type { WorkspaceContext, WorkspaceMembership } from '@/types/workspace'
import { featuresFrom, hiddenSectionsOf, withFeatures, type SectionKey } from '@/lib/workspace-sections'
import { accessUntilFrom, grantsFromRows, isAccessManager, isPastLastDay, liveGrants, scopesFrom } from '@/lib/access'
import { SECTIONS } from '@/lib/workspace-sections'

/**
 * The signed-in user's workspaces plus which one is currently selected
 * (cookie, validated against their memberships — a stale or forged cookie
 * just falls back to the default). Null when signed out or, defensively,
 * when the user somehow has no membership at all.
 */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const { data: { user } } = await getCachedUser()
  if (!user) return null

  const supabase = await createClient()
  const { data: members } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, permissions')
    .eq('user_id', user.id)
  if (!members?.length) return null

  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('*')
    .in('id', members.map(m => m.workspace_id))
  if (!workspaces?.length) return null

  const memberships: WorkspaceMembership[] = members
    .map(m => {
      const workspace = workspaces.find(w => w.id === m.workspace_id)
      return workspace
        ? ((): WorkspaceMembership => {
            const features = featuresFrom(workspace.settings)
            const accessUntil = accessUntilFrom(m.permissions, m.role)
            return {
              workspace, role: m.role, permissions: normalisePermissions(m.permissions), features,
              sections: withFeatures(scopesFrom(m.permissions, m.role), features),
              accessUntil, accessEnded: isPastLastDay(accessUntil), accessManager: isAccessManager(m.permissions, m.role),
            }
          })()
        : null
    })
    .filter((m): m is WorkspaceMembership => m !== null)
  if (!memberships.length) return null

  const cookieStore = await cookies()
  // The phone app names its workspace in a header; it's checked against your memberships like the cookie is.
  const wanted = (await headers()).get('x-workspace-id') ?? cookieStore.get(WORKSPACE_COOKIE)?.value
  const picked = pickCurrentWorkspace(memberships, wanted)
  // What's shared with them here (only matters where a feature is set to 'only these items').
  let grants: ReturnType<typeof grantsFromRows> = []
  if (Object.values(picked.sections).includes('items')) {
    const { data } = await supabase.from('access_grants').select('section, item_id, level, until').eq('workspace_id', picked.workspace.id).eq('user_id', user.id)
    grants = grantsFromRows(data ?? [])
  }
  const current = { ...picked, grants }
  return { userId: user.id, current, memberships: memberships.map(m => (m === picked ? current : m)) }
})

/** The workspace id every read/write should be scoped to. Throws if there isn't one. */
export async function requireWorkspaceId(): Promise<string> {
  const ctx = await getWorkspaceContext()
  if (!ctx) throw new Error('No workspace available for this user.')
  return ctx.current.workspace.id
}

export function hasPermission(membership: WorkspaceMembership, permission: string): boolean {
  return membership.permissions[permission] === true
}

/** Can approve finance entries (and change them while approval is on): owners, admins and treasurers. */
export function isFinanceApprover(membership: WorkspaceMembership): boolean {
  return membership.role === 'owner' || membership.role === 'admin' || hasPermission(membership, 'treasurer')
}

/** Can approve merch takings into Finance: owners, admins and members given the Merch role. */
export function isMerchApprover(membership: WorkspaceMembership): boolean {
  return membership.role === 'owner' || membership.role === 'admin' || hasPermission(membership, 'merch_manager')
}

export type MerchScope = 'full' | 'crew' | 'none'

/**
 * What of Merch this member sees. Mirrors merch_scope() in the database:
 * 'full' for owners, admins, the Merch role and anyone whose Merch section isn't hidden;
 * 'crew' for Merch crew (only their own show kits); 'none' otherwise.
 */
export function merchScopeOf(membership: WorkspaceMembership): MerchScope {
  if (!membership.features.merch) return 'none'
  if (membership.accessEnded) return 'none'
  if (isMerchApprover(membership)) return 'full'
  if (membership.sections.merch === 'items' || hasPermission(membership, 'merch_crew')) return 'crew'
  return membership.sections.merch === 'none' ? 'none' : 'full'
}

/** Where a shared item opens on its own, by feature (features without a page per item open their list). */
const ITEM_PATH: Partial<Record<SectionKey, (id: string) => string>> = {
  shows: id => `/shows/${id}`,
  setlists: id => `/setlists/${id}`,
  songs: id => `/songs/${id}`,
  merch: id => `/merch/kits/${id}`,
}

/**
 * For someone whose only access is a few shared items in one feature: the page to open instead of Today
 * (the item itself when there's just one). Null for everyone else.
 */
export function focusedShare(m: WorkspaceMembership): string | null {
  if (m.role === 'owner' || m.role === 'admin') return null
  const open = SECTIONS.filter(s => m.sections[s.key] !== 'none')
  if (open.length !== 1 || m.sections[open[0].key] !== 'items') return null
  const sec = open[0]
  const mine = liveGrants(m.grants ?? []).filter(g => g.section === sec.key)
  const path = ITEM_PATH[sec.key]
  return mine.length === 1 && path ? path(mine[0].itemId) : sec.href
}

/** Sections hidden from the nav: the ones set to nothing. 'Only these items' still shows (it opens what's shared). */
export function navHiddenSections(membership: WorkspaceMembership): SectionKey[] {
  return hiddenSectionsOf(membership.sections)
}

/** Treasurer in the currently selected workspace. */
export async function isCurrentTreasurer(): Promise<boolean> {
  const ctx = await getWorkspaceContext()
  return !!ctx && hasPermission(ctx.current, 'treasurer')
}

/** Permission check against a specific workspace's membership row (for rows that carry their own workspace_id). */
export async function hasWorkspacePermission(userId: string, workspaceId: string, permission: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('workspace_members')
    .select('permissions')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data && normalisePermissions(data.permissions)[permission] === true
}
