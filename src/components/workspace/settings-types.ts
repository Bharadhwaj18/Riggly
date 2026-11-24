import type { SectionKey, SectionLevels } from '@/lib/workspace-sections'
import type { SetlistGuest } from '@/lib/setlist-guest'

/** A setlist an admin can share with a setlist guest. */
export interface SetlistOption {
  id: string
  title: string
  showDate: string | null
}

export interface MemberRow {
  sections: SectionLevels
  userId: string
  name: string
  role: string
  treasurer: boolean
  /** Can approve merch takings into Finance. */
  merchManager: boolean
  /** Merch crew: sees only the show kits they run. */
  merchCrew: boolean
  /** Setlist guest: sees only these setlists, view only, until a date. Filled in for admins only. */
  guest: SetlistGuest | null
  isYou: boolean
  /** Their profile photo, when they have one. */
  avatarUrl?: string | null
}

export interface InviteRow {
  id: string
  token: string
  role: string
  expiresAt: string
  maxUses: number | null
  useCount: number
  /** Access a member joining with this link gets; null means everything. */
  sections: SectionLevels | null
  /** Joins as Merch crew. */
  crew: boolean
  /** Joins as a setlist guest. */
  guest: { count: number; accessUntil: string | null } | null
}

export interface WorkspaceSummary {
  id: string
  name: string
  kind: string | null
  description: string | null
  color: string
  avatarUrl: string | null
  /** Sections this workspace has switched off; they aren't offered when setting member access. */
  offSections: SectionKey[]
}

