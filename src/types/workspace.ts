import type { Database } from './database'
import type { SectionLevels, WorkspaceFeatures } from '@/lib/workspace-sections'
import type { AccessGrant } from '@/lib/access'

export type Workspace = Database['public']['Tables']['workspaces']['Row']
export type WorkspaceMember = Database['public']['Tables']['workspace_members']['Row']

/** A user's membership in one workspace, with permissions normalised to a flat flag map. */
export interface WorkspaceMembership {
  workspace: Workspace
  role: string
  permissions: Record<string, boolean>
  /** Per-section access for this member (owners and admins are always full edit). */
  sections: SectionLevels
  /** Sections this workspace has switched on (set in the admin panel). Off means hidden for everyone. */
  features: WorkspaceFeatures
  /** Their last day here ('YYYY-MM-DD', India time), or null for no end. */
  accessUntil?: string | null
  /** Past their last day: they see nothing. */
  accessEnded?: boolean
  /** Can change other members' access (owners and admins always can). */
  accessManager?: boolean
  /** Items shared with them (filled in for the current workspace only). */
  grants?: AccessGrant[]
}

export interface WorkspaceContext {
  userId: string
  current: WorkspaceMembership
  memberships: WorkspaceMembership[]
}
