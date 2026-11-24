import { SECTIONS, type SectionKey, type SectionLevel, type SectionLevels } from '@/lib/workspace-sections'

/**
 * The access model, mirrored from the database (section_scope / item_level / read_level / write_ok).
 *
 * Per feature a member has 'none' | 'items' (only what's shared with them) | 'view' | 'edit'.
 * Shared items are access_grants rows (view or edit, optional last day). What's inside a shared item comes along,
 * view only. A member can also have a last day (access_until) after which they see nothing at all.
 */

export interface AccessGrant {
  section: SectionKey
  itemId: string
  level: 'view' | 'edit'
  /** Last day, 'YYYY-MM-DD' (India time). Null: no end. */
  until: string | null
}

/** What a feature's items are called, for the access editor. */
export const ITEM_NOUN: Record<SectionKey, { one: string; many: string }> = {
  shows: { one: 'show', many: 'shows' },
  setlists: { one: 'setlist', many: 'setlists' },
  songs: { one: 'song', many: 'songs' },
  recordings: { one: 'recording', many: 'recordings' },
  finance: { one: 'project or budget', many: 'projects and budgets' },
  merch: { one: 'show kit', many: 'show kits' },
  calendar: { one: 'event', many: 'events' },
  tasks: { one: 'list', many: 'lists' },
  notes: { one: 'note', many: 'notes' },
  agencies: { one: 'agency', many: 'agencies' },
}

/** What comes along, view only, when one of a feature's items is shared. */
export const COMES_ALONG: Partial<Record<SectionKey, string>> = {
  shows: 'Its setlists (with their songs and chords), documents and linked notes',
  setlists: 'Its songs, chord charts, references and song notes',
  tasks: 'Every task in the list',
  notes: 'Its checklist',
  finance: 'The entries tagged to it',
  merch: 'What’s in the kit and its sales. Kits they’re put on are shared automatically.',
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const asObject = (raw: unknown): Record<string, unknown> | null =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null

/** Today's date in India, 'YYYY-MM-DD'. */
export function istToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** A last day runs through the whole of that day, India time. */
export function isPastLastDay(lastDay: string | null | undefined, now: Date = new Date()): boolean {
  return !!lastDay && DATE.test(lastDay) && istToday(now) > lastDay
}

/** "12 Dec 2026" from '2026-12-12'. */
export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'))
}

/** A member's last day ('YYYY-MM-DD'), or null. Owners and admins never have one. */
export function accessUntilFrom(permissions: unknown, role: string): string | null {
  if (role === 'owner' || role === 'admin') return null
  const v = asObject(permissions)?.access_until
  return typeof v === 'string' && DATE.test(v) ? v : null
}

export function isAccessManager(permissions: unknown, role: string): boolean {
  return role === 'owner' || role === 'admin' || asObject(permissions)?.access_manager === true
}

/** Section levels from stored permissions. Old Merch crew count as Merch 'items'. Past their last day: nothing. */
export function scopesFrom(permissions: unknown, role: string, now: Date = new Date()): SectionLevels {
  const full = role === 'owner' || role === 'admin'
  const p = asObject(permissions)
  const stored = asObject(p?.sections) ?? {}
  const ended = !full && isPastLastDay(accessUntilFrom(permissions, role), now)
  return Object.fromEntries(SECTIONS.map(s => {
    if (full) return [s.key, 'edit']
    if (ended) return [s.key, 'none']
    if (s.key === 'merch' && p?.merch_crew === true) return [s.key, 'items']
    const v = stored[s.key]
    return [s.key, v === 'none' || v === 'items' || v === 'view' || v === 'edit' ? v : 'edit']
  })) as SectionLevels
}

/**
 * Outside the band's day-to-day: no whole feature open to them (only shared items, or nothing). Left out of member
 * counts, pickers and band-wide notifications. Mirrors is_limited_member() in the database.
 */
export function isLimitedMember(m: { role: string; permissions: unknown }): boolean {
  if (m.role === 'owner' || m.role === 'admin') return false
  if (asObject(m.permissions)?.merch_crew === true) return true
  const stored = asObject(asObject(m.permissions)?.sections) ?? {}
  return !SECTIONS.some(s => {
    const v = stored[s.key] ?? 'edit'
    return v === 'view' || v === 'edit'
  })
}

/** Grants still in force. */
export const liveGrants = (grants: AccessGrant[], now: Date = new Date()) => grants.filter(g => !isPastLastDay(g.until, now))

/** Can change this one item (whole-section edit, or an edit grant on it). */
export function canEditItem(level: SectionLevel, grants: AccessGrant[], section: SectionKey, itemId: string | null | undefined): boolean {
  if (level === 'edit') return true
  if (level !== 'items' || !itemId) return false
  return liveGrants(grants).some(g => g.section === section && g.itemId === itemId && g.level === 'edit')
}

/** Rows from access_grants into AccessGrant. */
export function grantsFromRows(rows: { section: string; item_id: string; level: string; until: string | null }[]): AccessGrant[] {
  const keys = new Set<string>(SECTIONS.map(s => s.key))
  return rows
    .filter(r => keys.has(r.section))
    .map(r => ({ section: r.section as SectionKey, itemId: r.item_id, level: r.level === 'edit' ? 'edit' : 'view', until: r.until }))
}

/** Short summary for lists: "Everything", "View only", or e.g. "Setlists: 2 shared · No Finance". */
export function accessSummary(levels: SectionLevels, grantCounts: Partial<Record<SectionKey, number>> = {}, hide: SectionKey[] = []): string {
  const shown = SECTIONS.filter(s => !hide.includes(s.key))
  const by = (l: SectionLevel) => shown.filter(s => levels[s.key] === l)
  if (by('edit').length === shown.length) return 'Everything'
  if (by('none').length === shown.length) return 'Nothing yet'
  if (by('view').length === shown.length) return 'View only'
  const parts: string[] = []
  for (const s of by('items')) {
    const n = grantCounts[s.key] ?? 0
    parts.push(`${s.label}: ${n} ${n === 1 ? ITEM_NOUN[s.key].one : ITEM_NOUN[s.key].many}`)
  }
  const open = by('edit').concat(by('view'))
  if (open.length && open.length <= 4) parts.push(open.map(s => (levels[s.key] === 'view' ? `${s.label} (view)` : s.label)).join(', '))
  else if (open.length) parts.push(`${open.length} sections open`)
  return parts.join(' · ') || 'Nothing yet'
}

/** Starting points for the access editor and invite links. */
export type AccessPreset = 'member' | 'viewer' | 'crew' | 'setlist_guest' | 'nothing'

export function presetLevels(preset: AccessPreset): SectionLevels {
  const all = (l: SectionLevel) => Object.fromEntries(SECTIONS.map(s => [s.key, l])) as SectionLevels
  switch (preset) {
    case 'member': return all('edit')
    case 'viewer': return all('view')
    case 'crew': return { ...all('none'), merch: 'items' }
    case 'setlist_guest': return { ...all('none'), setlists: 'items' }
    case 'nothing': return all('none')
  }
}

export const PRESETS: { key: AccessPreset; title: string; text: string }[] = [
  { key: 'member', title: 'Band member', text: 'Everything, can add and change things.' },
  { key: 'viewer', title: 'View only', text: 'Can see everything, change nothing.' },
  { key: 'crew', title: 'Merch crew', text: 'Only the show kits they’re put on.' },
  { key: 'setlist_guest', title: 'Setlist guest', text: 'Only the setlists you pick, with songs and chords.' },
]
