import type { SectionKey, SectionLevels } from '@/lib/workspace-sections'

/** Something in a feature that can be shared with one person (a show, a setlist, a task list...). */
export interface ShareItem {
  id: string
  title: string
  /** A second line: venue, artist, "Project" / "Budget"... */
  detail: string | null
  /** 'YYYY-MM-DD', to sort upcoming first. */
  date: string | null
}

export type ShareableItems = Record<SectionKey, ShareItem[]>

export interface MemberRow {
  /** What they can open, per feature (filled in only for people who manage access). */
  sections: SectionLevels
  userId: string
  name: string
  role: string
  treasurer: boolean
  /** Can approve merch takings into Finance. */
  merchManager: boolean
  /** Can change other members' access. */
  accessManager: boolean
  /** Their last day ('YYYY-MM-DD'), or null. Filled in only for people who manage access. */
  accessUntil: string | null
  /** Past their last day. */
  accessEnded: boolean
  /** No whole feature open to them: only shared items, or nothing. */
  limited: boolean
  /** How many items are shared with them, per feature (people who manage access only). */
  grantCounts: Partial<Record<SectionKey, number>>
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
  /** Last day for whoever joins, or null. */
  accessUntil: string | null
  /** Items shared through the link, per feature. */
  grantCounts: Partial<Record<SectionKey, number>>
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
