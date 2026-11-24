import { SECTIONS, type SectionLevels } from '@/lib/workspace-sections'

/**
 * A setlist guest sees only the setlists picked for them (view only: songs, chord charts, lyrics, notes), until the
 * end of their last day. Mirrors setlist_guest_state() / guest_setlist_ids() in the database.
 *
 * Stored on the member (and on the invite link) as
 *   { setlist_guest: true, setlist_ids: [...], access_until: 'YYYY-MM-DD' }
 */
export interface SetlistGuest {
  setlistIds: string[]
  /** Last day they can look, 'YYYY-MM-DD' (India time). Null: no end date. */
  accessUntil: string | null
  /** Past the last day: they see nothing. */
  ended: boolean
}

const asObject = (raw: unknown): Record<string, unknown> | null =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Today's date in India, 'YYYY-MM-DD'. */
export function istToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Access runs through the whole of the last day, India time. */
export function guestAccessEnded(accessUntil: string | null, now: Date = new Date()): boolean {
  return !!accessUntil && DATE.test(accessUntil) && istToday(now) > accessUntil
}

/** The guest settings on a member or invite, or null when it isn't a setlist guest. Owners and admins never are. */
export function setlistGuestFrom(permissions: unknown, role: string, now: Date = new Date()): SetlistGuest | null {
  const p = asObject(permissions)
  if (!p || p.setlist_guest !== true || role === 'owner' || role === 'admin') return null
  const setlistIds = Array.isArray(p.setlist_ids) ? p.setlist_ids.filter((x): x is string => typeof x === 'string') : []
  const accessUntil = typeof p.access_until === 'string' && DATE.test(p.access_until) ? p.access_until : null
  return { setlistIds, accessUntil, ended: guestAccessEnded(accessUntil, now) }
}

/** Setlists and Songs view only (Songs so a chord chart opens from the setlist); everything hidden once it's ended. */
export function guestSectionLevels(ended: boolean): SectionLevels {
  return Object.fromEntries(
    SECTIONS.map(s => [s.key, !ended && (s.key === 'setlists' || s.key === 'songs') ? 'view' : 'none']),
  ) as SectionLevels
}

export const isSetlistGuestRow = (m: { role: string; permissions: unknown }) =>
  m.role !== 'owner' && m.role !== 'admin' && asObject(m.permissions)?.setlist_guest === true

/** "12 Dec 2026" from '2026-12-12'. */
export function formatGuestDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'))
}
