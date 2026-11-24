'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotification } from '@/actions/notifications'
import { DOCUMENT_BUCKET } from '@/types/show-document'
import { getWorkspaceContext } from '@/lib/workspace'
import { PENDING_INVITE_COOKIE, WORKSPACE_COOKIE } from '@/lib/workspace-shared'
import { chooseWorkspace } from '@/lib/workspace-cookies'
import { SECTIONS, type SectionLevel, type SectionKey } from '@/lib/workspace-sections'
import { istToday, type AccessGrant } from '@/lib/access'
import type { Json } from '@/types/database'
import { addDaysISO } from '@/lib/dates'
import { createWorkspaceInputSchema, updateWorkspaceDetailsSchema, type CreateWorkspaceInput, type UpdateWorkspaceDetailsInput } from '@/lib/validators'

async function selectWorkspace(workspaceId: string) {
  await chooseWorkspace(workspaceId)
}

/** The current workspace, only if the caller is an owner/admin of it. */
async function requireAdminContext() {
  const ctx = await getWorkspaceContext()
  if (!ctx) return { error: 'Not authenticated' as const }
  const { workspace, role } = ctx.current
  if (workspace.type === 'personal') return { error: 'This is your personal space, it has no members to manage.' as const }
  if (role !== 'owner' && role !== 'admin') return { error: 'Only a workspace admin can do that.' as const }
  return { ctx, workspaceId: workspace.id }
}

export async function switchWorkspace(workspaceId: string): Promise<{ error?: string }> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!ctx.memberships.some(m => m.workspace.id === workspaceId)) return { error: 'You’re not a member of that workspace.' }

  await selectWorkspace(workspaceId)
  return {}
}

/** Accepts just a name (older callers) or the full form: name, optional kind and avatar colour. */
export async function createWorkspace(input: string | CreateWorkspaceInput): Promise<{ error?: string; id?: string }> {
  const parsed = createWorkspaceInputSchema.safeParse(typeof input === 'string' ? { name: input } : input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_workspace', {
    p_name: parsed.data.name,
    p_type: 'band',
    p_kind: parsed.data.kind || null,
    p_color: parsed.data.color ?? 'forest',
  })
  if (error) return { error: error.message }
  await selectWorkspace(data)
  return { id: data }
}

export async function renameWorkspace(name: string): Promise<{ error?: string }> {
  const auth = await requireAdminContext()
  if ('error' in auth) return { error: auth.error }
  const supabase = await createClient()
  const { error } = await supabase.rpc('rename_workspace', { p_ws: auth.workspaceId, p_name: name })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

/** Name, kind, description, colour and logo/photo of the current workspace. Omitted fields stay as they are; avatarUrl null removes the image. */
export async function updateWorkspaceDetails(input: UpdateWorkspaceDetailsInput): Promise<{ error?: string }> {
  const auth = await requireAdminContext()
  if ('error' in auth) return { error: auth.error }
  const parsed = updateWorkspaceDetailsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_workspace_details', {
    p_ws: auth.workspaceId,
    p_name: d.name ?? null,
    p_kind: d.kind ?? null,
    p_description: d.description ?? null,
    p_color: d.color ?? null,
    p_avatar_url: typeof d.avatarUrl === 'string' ? d.avatarUrl : null,
    p_clear_avatar: d.avatarUrl === null,
  })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

/** Sets (or, with null, removes) the logo/photo after the image has been uploaded to the workspace-avatars bucket. */
export async function setWorkspaceAvatar(publicUrl: string | null): Promise<{ error?: string }> {
  return updateWorkspaceDetails({ avatarUrl: publicUrl })
}

/** Hands the workspace to another member; the current owner becomes an admin. Owner only. */
export async function transferOwnership(userId: string): Promise<{ error?: string }> {
  const auth = await requireAdminContext()
  if ('error' in auth) return { error: auth.error }
  if (auth.ctx.current.role !== 'owner') return { error: 'Only the owner can transfer this workspace.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('transfer_workspace_ownership', { p_ws: auth.workspaceId, p_new_owner: userId })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export interface AccessInput {
  /** Per feature: 'none' | 'items' | 'view' | 'edit'. */
  sections: Partial<Record<SectionKey, SectionLevel>>
  /** Last day, 'YYYY-MM-DD', or null for no end. */
  accessUntil: string | null
  /** The items shared with them (used where a feature is 'items'). */
  grants: AccessGrant[]
}

/** The longest anyone's access, or one shared item, can be set to run. */
const MAX_ACCESS_DAYS = 366

/** Cleans up an access choice: known features and levels only, valid days, grants only for 'items' features. */
function cleanAccess(input: AccessInput): { error: string } | { sections: Record<string, SectionLevel>; accessUntil: string | null; grants: { section: string; item_id: string; level: string; until: string | null }[] } {
  const today = istToday()
  const latest = addDaysISO(today, MAX_ACCESS_DAYS)
  const isDay = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  const sections: Record<string, SectionLevel> = {}
  for (const s of SECTIONS) {
    const v = input.sections?.[s.key]
    if (v === 'none' || v === 'items' || v === 'view' || v === 'edit') sections[s.key] = v
  }
  if (input.accessUntil !== null && input.accessUntil !== undefined) {
    if (!isDay(input.accessUntil)) return { error: 'Pick a last day, or choose no end date.' }
    if (input.accessUntil < today) return { error: 'The last day can’t be in the past.' }
    if (input.accessUntil > latest) return { error: 'Access can be set for up to a year at a time.' }
  }
  const seen = new Set<string>()
  const grants = (Array.isArray(input.grants) ? input.grants : [])
    .filter(g => sections[g.section] === 'items' && typeof g.itemId === 'string' && !seen.has(g.section + g.itemId) && seen.add(g.section + g.itemId))
    .map(g => ({ section: g.section, item_id: g.itemId, level: g.level === 'edit' ? 'edit' : 'view', until: isDay(g.until) ? g.until : null }))
  if (grants.some(g => g.until && (g.until < today || g.until > latest))) return { error: 'A shared item’s last day must be between today and a year from now.' }
  return { sections, accessUntil: input.accessUntil ?? null, grants }
}

export interface CreateInviteInput {
  role: 'member' | 'admin'
  expiresInDays: number
  maxUses: number | null
  /** What a member joining with this link gets. Ignored for admins, who always get everything. */
  access?: AccessInput
}

export async function createInvite(input: CreateInviteInput): Promise<{ error?: string; token?: string }> {
  const auth = await requireAdminContext()
  if ('error' in auth) return { error: auth.error }
  if (!Number.isInteger(input.expiresInDays) || input.expiresInDays < 1 || input.expiresInDays > 30) {
    return { error: 'Expiry must be between 1 and 30 days.' }
  }
  if (input.maxUses !== null && (!Number.isInteger(input.maxUses) || input.maxUses < 1)) {
    return { error: 'Max uses must be at least 1.' }
  }
  let permissions: Record<string, unknown> = {}
  if (input.role !== 'admin' && input.access) {
    const access = cleanAccess(input.access)
    if ('error' in access) return { error: access.error }
    permissions = { sections: access.sections, grants: access.grants, ...(access.accessUntil ? { access_until: access.accessUntil } : {}) }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workspace_invites')
    .insert({
      workspace_id: auth.workspaceId,
      role: input.role,
      permissions: permissions as Json,
      max_uses: input.maxUses,
      expires_at: new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString(),
    })
    .select('token')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/settings', 'layout')
  return { token: data.token }
}

export async function revokeInvite(inviteId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('revoke_workspace_invite', { p_invite: inviteId })
  if (error) return { error: error.message }
  revalidatePath('/settings', 'layout')
  return {}
}

/** "Not now" on an invite: stop sending this person back to it. */
export async function dismissPendingInvite(): Promise<void> {
  ;(await cookies()).delete(PENDING_INVITE_COOKIE)
}

export async function acceptInvite(token: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  // join_with_invite also applies the access chosen on the invite. Until its SQL has been run, fall back to the plain join.
  let { data, error } = await supabase.rpc('join_with_invite', { p_token: token })
  if (error?.code === 'PGRST202') ({ data, error } = await supabase.rpc('accept_workspace_invite', { p_token: token }))
  if (error || !data) return { error: error?.message ?? 'Couldn’t join this workspace.' }
  ;(await cookies()).delete(PENDING_INVITE_COOKIE)
  await selectWorkspace(data)
  return {}
}

export async function setMemberTreasurer(userId: string, isTreasurer: boolean): Promise<{ error?: string }> {
  return setMemberPermission(userId, 'treasurer', isTreasurer)
}

/** The Merch role: can approve merch takings into Finance. */
export async function setMemberMerchManager(userId: string, on: boolean): Promise<{ error?: string }> {
  return setMemberPermission(userId, 'merch_manager', on)
}

async function setMemberPermission(userId: string, key: 'treasurer' | 'merch_manager', on: boolean): Promise<{ error?: string }> {
  const auth = await requireAdminContext()
  if ('error' in auth) return { error: auth.error }
  const supabase = await createClient()
  const { data: member } = await supabase
    .from('workspace_members')
    .select('permissions, role')
    .eq('workspace_id', auth.workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!member) return { error: 'Member not found.' }
  const raw = member.permissions && typeof member.permissions === 'object' && !Array.isArray(member.permissions) ? member.permissions : {}
  const permissions = { ...raw, [key]: on }
  const { error } = await supabase
    .from('workspace_members')
    .update({ permissions })
    .eq('workspace_id', auth.workspaceId)
    .eq('user_id', userId)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

/**
 * Everything about one member's access at once: per-feature levels, the items shared with them, their last day,
 * and (admins only) whether they're an Access manager. Owner, admins and Access managers; never the owner, an
 * admin or yourself. The database checks all of this again.
 */
export async function setMemberAccess(userId: string, input: AccessInput & { accessManager?: boolean }): Promise<{ error?: string }> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { workspace } = ctx.current
  if (workspace.type === 'personal') return { error: 'This is your personal space, it has no members to manage.' }
  const access = cleanAccess(input)
  if ('error' in access) return { error: access.error }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_member_access', {
    p_ws: workspace.id,
    p_user: userId,
    p_sections: access.sections as Json,
    p_access_until: access.accessUntil,
    p_grants: access.grants as Json,
    p_access_manager: input.accessManager ?? null,
  })
  if (error) return { error: error.code === 'PGRST202' ? 'Run the new access SQL in Supabase first.' : error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function setMemberRole(userId: string, role: 'admin' | 'member'): Promise<{ error?: string }> {
  const auth = await requireAdminContext()
  if ('error' in auth) return { error: auth.error }
  const supabase = await createClient()
  const { error } = await supabase
    .from('workspace_members')
    .update({ role })
    .eq('workspace_id', auth.workspaceId)
    .eq('user_id', userId)
  if (error) return { error: error.message }
  revalidatePath('/settings', 'layout')
  return {}
}

export async function removeMember(userId: string): Promise<{ error?: string }> {
  const auth = await requireAdminContext()
  if ('error' in auth) return { error: auth.error }
  if (userId === auth.ctx.userId) return { error: 'Use “Leave workspace” to remove yourself.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', auth.workspaceId)
    .eq('user_id', userId)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function leaveWorkspace(): Promise<{ error?: string }> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return { error: 'Not authenticated' }
  const { workspace, role } = ctx.current
  if (workspace.type === 'personal') return { error: 'You can’t leave your personal space.' }
  if (role === 'owner') return { error: 'The owner can’t leave their own workspace.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspace.id)
    .eq('user_id', ctx.userId)
  if (error) return { error: error.message }
  const cookieStore = await cookies()
  cookieStore.delete(WORKSPACE_COOKIE)
  revalidatePath('/', 'layout')
  return {}
}

/**
 * Permanently deletes the current workspace and everything in it. Owner/admin only, never a
 * personal space, and the caller must type the workspace's exact name.
 */
export async function deleteWorkspace(confirmName: string): Promise<{ error?: string }> {
  const auth = await requireAdminContext()
  if ('error' in auth) return { error: auth.error }
  const { workspace } = auth.ctx.current
  if (confirmName.trim() !== workspace.name) return { error: 'Type the workspace name exactly to confirm.' }

  const supabase = await createClient()
  const [{ data: recordings }, { data: documents }, { data: members }] = await Promise.all([
    supabase.from('recordings').select('file_path').eq('workspace_id', workspace.id),
    supabase.from('show_documents').select('file_path').eq('workspace_id', workspace.id),
    supabase.from('workspace_members').select('user_id').eq('workspace_id', workspace.id),
  ])

  const { error } = await supabase.rpc('delete_workspace', { p_ws: workspace.id })
  if (error) return { error: error.message }

  // Uploaded files live in storage, not in the tables that just cascaded away. Best effort:
  // the workspace is already gone, so a failure here only leaves orphaned files behind.
  try {
    const storage = createServiceClient().storage
    const recordingPaths = (recordings ?? []).map(r => r.file_path)
    const documentPaths = (documents ?? []).map(d => d.file_path)
    if (recordingPaths.length) await storage.from('recordings').remove(recordingPaths)
    if (documentPaths.length) await storage.from(DOCUMENT_BUCKET).remove(documentPaths)
  } catch {}

  const cookieStore = await cookies()
  cookieStore.delete(WORKSPACE_COOKIE)

  const others = (members ?? []).map(m => m.user_id).filter(id => id !== auth.ctx.userId)
  await Promise.all(others.map(recipientId => sendNotification({
    recipientId,
    title: `"${workspace.name}" was deleted`,
    body: 'An admin deleted this workspace.',
    link: '/',
    type: 'workspace_deleted',
  })))

  revalidatePath('/', 'layout')
  return {}
}
