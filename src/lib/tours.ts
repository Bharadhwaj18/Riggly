// Guided tours: short step-by-step walkthroughs that point at the real buttons.
//
// A step can sit on a page (`path`), point at an element (`target`, the first visible match wins, so one step can
// name the desktop and the phone version of a thing) and either wait for Next or for the person to tap the
// highlighted thing (`action: 'tap'`), which is how a tour moves between pages.

import type { SectionKey } from '@/lib/workspace-sections'

export interface TourStep {
  /** The page this step is on, as a regular expression source matched against the path. */
  path: string
  /** CSS selectors; the first one that's visible is highlighted. None: a card in the middle of the screen. */
  target?: string[]
  title: string
  body: string
  /** This step is about a section; it's left out when that section is off. */
  section?: SectionKey
  /** 'tap': the tour moves on when the highlighted thing is tapped (no Next button). */
  action?: 'tap'
  /** Next goes to this page (used to move between sections in the full walkthrough). */
  goTo?: string
  /** Part of the short full walkthrough, which takes one or two key steps from each tour. */
  brief?: boolean
}

export interface Tour {
  id: string
  /** The section it teaches; hidden when that section is switched off or hidden for this person. */
  section: SectionKey | null
  title: string
  /** One line for the Help list. */
  blurb: string
  /** Where it starts; it's offered on this page the first time someone opens it in a demo. */
  startPath: string
  steps: TourStep[]
}

const NAV = ['[data-tour="nav"]']

export const TOURS: Tour[] = [
  {
    id: 'today',
    section: null,
    title: 'Getting around',
    blurb: 'Today, the menu, and adding things from anywhere.',
    startPath: '/',
    steps: [
      { path: '^/$', title: 'Welcome to Rigly', brief: true, body: 'This is Today: what’s coming up for your band, at a glance. It takes a minute to show you around.' },
      { path: '^/$', target: ['[data-tour="today-hero-show"]', '[data-tour="today-hero-event"]', '[data-tour="today-hero-empty"]'], title: 'What’s next', brief: true, body: 'Your next show or event, with its setlist. Tap through to everything about it.' },
      { path: '^/$', section: 'tasks', target: ['[data-tour="today-tasks"]'], title: 'Your tasks', body: 'Things assigned to you, soonest first. Overdue ones turn red.' },
      { path: '^/$', target: ['[data-tour="today-actions"]', '[aria-label="Add something"]'], title: 'Add things fast', body: 'Add a show, setlist or song from here. On a phone, the + button does the same from any page.' },
      { path: '^/$', target: NAV, title: 'Everything else', body: 'Every part of your workspace lives here. Each one has its own short tour under Settings → Help & tours.' },
    ],
  },
  {
    id: 'shows',
    section: 'shows',
    title: 'Shows',
    blurb: 'Bookings from first enquiry to paid and split.',
    startPath: '/shows',
    steps: [
      { path: '^/shows$', target: ['main a[href="/shows/new"]'], title: 'Add a show', brief: true, body: 'Every gig starts here, even a first enquiry. Add the date, venue, fee and the agency it came through.' },
      { path: '^/shows$', target: ['[data-tour="shows-tabs"]'], title: 'Upcoming and played', body: 'Upcoming shows are on top. Played shows keep their money and whether it’s been split. Insights shows the trends.' },
      { path: '^/shows$', target: ['[data-tour="show-status"]'], title: 'Move a show along', brief: true, body: 'Tap a status to change it: Inquiry, Quotation Shared, Confirmed, Advance Received, Completed. Everyone is told when a show gets booked.' },
      { path: '^/shows$', target: ['[data-tour="show-row"]'], title: 'Open a show', body: 'Tap this show to open it.', action: 'tap' },
      { path: '^/shows/[^/]+$', target: ['[data-tour="show-progress"]'], title: 'Where it stands', body: 'Booked, setlist ready, paid and split: what’s done and what isn’t, for this show.' },
      { path: '^/shows/[^/]+$', title: 'All in one place', body: 'Everything about this show sits below: its setlist, contacts and documents, plus money and merch if your workspace uses them.' },
    ],
  },
  {
    id: 'setlists',
    section: 'setlists',
    title: 'Setlists',
    blurb: 'Build a set from your songs and take it on stage.',
    startPath: '/setlists',
    steps: [
      { path: '^/setlists$', target: ['main a[href="/setlists/new"]'], title: 'New setlist', brief: true, body: 'Make one for a show (it picks up the date and venue) or start blank.' },
      { path: '^/setlists$', target: ['[data-tour="setlist-open"]', '[data-tour="setlist-row"]'], title: 'Open a setlist', body: 'Tap here to open the setlist.', action: 'tap' },
      { path: '^/setlists/[^/]+$', target: ['[data-tour="setlist-add-songs"]'], title: 'Add songs', body: 'Search your songs and add them. Group them into sections like Entry or Main Set, and drag to reorder.' },
      { path: '^/setlists/[^/]+$', title: 'On stage', body: 'Stage mode shows one song at a time, big and readable, with its chords. You can also save the setlist for offline or print it as a PDF.' },
    ],
  },
  {
    id: 'songs',
    section: 'songs',
    title: 'Songs',
    blurb: 'Your repertoire, with keys and chord charts.',
    startPath: '/songs',
    steps: [
      { path: '^/songs$', target: ['main a[href="/songs/new"]'], title: 'Add a song', body: 'Title, artist, key and tempo, plus a chord chart you can type or import.' },
      { path: '^/songs$', target: ['[data-tour="song-search"]'], title: 'Find a song', brief: true, body: 'Search by title, artist, key or tag. Tap tags like Hindi and Retro to narrow the list.' },
      { path: '^/songs$', target: ['[data-tour="song-row"]'], title: 'Open a song', body: 'Tap a song to open it.', action: 'tap' },
      { path: '^/songs/[^/]+$', target: ['[data-tour="song-chart"]'], title: 'The chart', body: 'The chord chart, ready to play from. Edit the song to change chords or add notes for the band.' },
      { path: '^/songs/[^/]+$', target: ['div:has(> [aria-label="Transpose up"])'], title: 'Change the key', body: 'Tap + or − and every chord moves with it. Handy when a singer wants it lower.' },
    ],
  },
  {
    id: 'finance',
    section: 'finance',
    title: 'Money',
    blurb: 'Who got paid, who paid for what, and splitting a show’s money.',
    startPath: '/finance',
    steps: [
      { path: '^/finance$', target: ['[aria-label="Add money in or out"]'], title: 'Log money', brief: true, body: 'Every fee, advance and expense goes in here: who got the money or who paid, what for, and which show it belongs to.' },
      { path: '^/finance$', target: ['[data-tour="finance-balances"]'], title: 'Balances', body: 'What each person holds right now. It adds up from every entry, so it’s always current.' },
      { path: '^/finance$', target: ['nav[aria-label="Money tools"]'], title: 'Splitting and history', body: 'After a show, Split divides what’s left between the band. History shows every entry, and Reports show where the money went.' },
    ],
  },
  {
    id: 'calendar',
    section: 'calendar',
    title: 'Calendar',
    blurb: 'Shows, events, tasks and who’s away, on one calendar.',
    startPath: '/calendar',
    steps: [
      { path: '^/calendar$', target: ['[data-tour="calendar-month"]'], title: 'The month', brief: true, body: 'Shows, events, task due dates and who’s away, all together. Swipe or use the arrows to change month.' },
      { path: '^/calendar$', target: ['[aria-label="What to show"]'], title: 'Only what you need', body: 'Tap a kind to hide or show it. Rigly remembers your choice on this device.' },
      { path: '^/calendar$', target: ['[data-tour="calendar-day"]'], title: 'A day', body: 'Tap any day to see what’s on, and add an event, a show, a task or mark yourself away.' },
    ],
  },
  {
    id: 'tasks',
    section: 'tasks',
    title: 'Tasks',
    blurb: 'Who’s doing what, by when.',
    startPath: '/tasks',
    steps: [
      { path: '^/tasks$', target: ['[role="tablist"][aria-label="View"]'], title: 'List or board', body: 'See tasks as a list, or as a board with columns like To do, Doing and Done.' },
      { path: '^/tasks$', target: ['input[aria-label="Search tasks"]'], title: 'Find and filter', body: 'Search, or filter by who it’s assigned to.' },
      { path: '^/tasks$', target: ['[data-tour="task-add"]'], title: 'Add a task', brief: true, body: 'Type it, press Enter. Then give it a due date and people. They see it on their Today.' },
    ],
  },
]

export const tourById = (id: string) => TOURS.find(t => t.id === id)

/** The tour that starts on this page, if any. */
export const tourForPath = (path: string) => TOURS.find(t => t.startPath === path)

export const pathMatches = (step: TourStep, path: string) => new RegExp(step.path).test(path)

/** The tours a person can take: only their sections, and within a tour only the steps for sections they have. */
export function toursFor(hidden: SectionKey[]): Tour[] {
  return TOURS
    .filter(t => !t.section || !hidden.includes(t.section))
    .map(t => ({ ...t, steps: t.steps.filter(s => !s.section || !hidden.includes(s.section)) }))
}

/** The most steps the full walkthrough has: short enough to finish. */
export const WALKTHROUGH_MAX_STEPS = 10

/**
 * The full walkthrough: the key steps of each tour this person can take, one after another. The last step of one
 * section carries Next on to the next section's page. The full tours stay under Help & tours.
 */
export function buildWalkthrough(tours: Tour[]): Tour {
  const steps: TourStep[] = []
  for (const t of tours) {
    const brief = t.steps.filter(s => s.brief && !s.action)
    if (!brief.length) continue
    const prev = steps[steps.length - 1]
    if (prev && brief[0].path !== prev.path) steps[steps.length - 1] = { ...prev, goTo: t.startPath }
    steps.push(...brief.map(s => ({ ...s })))
  }
  const last = steps[steps.length - 1]
  steps.push({ path: last?.path ?? '.*', title: 'That’s Rigly', body: 'Try things out here in the demo, then create your own workspace and invite your band. Settings → Help & tours has a longer tour of each part.' })
  return {
    id: WALKTHROUGH_ID,
    section: null,
    title: 'Quick walkthrough',
    blurb: 'The key parts of Rigly in under a minute.',
    startPath: '/',
    steps,
  }
}

export const WALKTHROUGH_ID = 'walkthrough'
