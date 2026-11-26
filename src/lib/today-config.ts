// What Today shows, as set from the admin dashboard. The database keeps only what the admin changed; anything
// missing falls back to the built-in text here, so Today looks the same until something is edited.

import type { Json } from '@/types/database'

/** Every card Today can show, in the order the admin dashboard lists them. Ids match today_card_ids() in SQL. */
export const TODAY_CARDS = [
  { id: 'next', label: 'Next show or event', group: 'band', hint: 'The big card with the next date' },
  { id: 'actions', label: 'Quick buttons', group: 'band', hint: 'Log money, New show, New setlist, New song' },
  { id: 'jump-to', label: 'Jump to', group: 'band', hint: 'Shortcuts to each section with counts' },
  { id: 'tasks', label: 'Your tasks', group: 'band', hint: 'Open tasks given to this person' },
  { id: 'money', label: 'Owed and owe', group: 'band', hint: 'You are owed / You owe' },
  { id: 'coming-up', label: 'Coming up', group: 'band', hint: 'The next few shows and events' },
  { id: 'tip', label: 'Tip of the day', group: 'info', hint: 'Rotates daily through the tips' },
  { id: 'updates', label: "What's new", group: 'info', hint: 'Your list of recent changes' },
  { id: 'review', label: 'Review', group: 'info', hint: 'Rotates daily through the reviews' },
  { id: 'news', label: 'Artist news', group: 'info', hint: 'One short paragraph' },
  { id: 'start', label: 'Get started', group: 'info', hint: 'A nudge for new bands' },
  { id: 'tip2', label: 'Quick tip', group: 'info', hint: 'A second tip, two days ahead' },
] as const

export type TodayCardId = (typeof TODAY_CARDS)[number]['id']
const CARD_IDS = new Set<string>(TODAY_CARDS.map(c => c.id))

export interface Review { quote: string; by: string }

export interface TodayContent {
  tips: string[]
  updates: string[]
  reviews: Review[]
  news: string
  start: string
  /** Cards switched off for every workspace. */
  off: TodayCardId[]
}

export const DEFAULT_TODAY: TodayContent = {
  tips: [
    'Press and hold any setlist, show or song to open its actions.',
    'Swipe the phone calendar left or right to change month.',
    'Tap the workspace name at the top to switch between workspaces.',
    'Pin a note to keep it at the top of Notes.',
    'Tasks can be sorted by deadline, so the most urgent ones come first.',
  ],
  updates: [
    'Tasks: list view with sorting and filters',
    'Notes: private by default, linked to shows and songs',
    'Calendar: add events from a pop-up on any day',
  ],
  reviews: [
    { quote: 'Finally one place for setlists, shows and who owes what.', by: 'A band manager' },
    { quote: 'The stage view alone saved us at our last festival set.', by: 'A solo artist' },
  ],
  news: 'Festival line-ups and studio news from artists you follow will appear here.',
  start: 'Add your next show, then build its setlist. Everything for the gig stays in one place.',
  off: [],
}

export interface Announcement {
  id: string
  title: string
  body: string | null
  link_url: string | null
  link_label: string | null
  tone: 'info' | 'good' | 'warn'
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const strings = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : null

export function cardIds(v: unknown): TodayCardId[] {
  return (strings(v) ?? []).filter(id => CARD_IDS.has(id)) as TodayCardId[]
}

/** The stored Today object with the built-in text filled in for anything not set. */
export function todayContentFrom(raw: Json | unknown): TodayContent {
  const o = isObj(raw) ? raw : {}
  const reviews = Array.isArray(o.reviews)
    ? o.reviews.filter((r): r is Review => isObj(r) && typeof r.quote === 'string' && typeof r.by === 'string')
    : null
  return {
    tips: strings(o.tips) ?? DEFAULT_TODAY.tips,
    updates: strings(o.updates) ?? DEFAULT_TODAY.updates,
    reviews: reviews ?? DEFAULT_TODAY.reviews,
    news: typeof o.news === 'string' ? o.news : DEFAULT_TODAY.news,
    start: typeof o.start === 'string' ? o.start : DEFAULT_TODAY.start,
    off: 'off' in o ? cardIds(o.off) : DEFAULT_TODAY.off,
  }
}

export interface TodayConfig {
  content: TodayContent
  /** Off for everyone or for this workspace. */
  off: Set<TodayCardId>
  announcements: Announcement[]
}

/** today_config(ws) from the database, made safe to use. Null (not a member, or the migration not run yet) gives the defaults. */
export function todayConfigFrom(raw: Json | unknown): TodayConfig {
  const o = isObj(raw) ? raw : {}
  const content = todayContentFrom(o.content)
  const announcements = Array.isArray(o.announcements)
    ? o.announcements.filter((a): a is Announcement => isObj(a) && typeof a.id === 'string' && typeof a.title === 'string')
    : []
  return { content, off: new Set([...content.off, ...cardIds(o.workspace_off)]), announcements }
}
