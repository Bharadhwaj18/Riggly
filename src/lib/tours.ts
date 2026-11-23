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
  /** 'tap': the tour moves on when the highlighted thing is tapped (no Next button). */
  action?: 'tap'
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
      { path: '^/$', title: 'Welcome to Rigly', body: 'This is Today: what’s coming up for your band, at a glance. It takes a minute to show you around.' },
      { path: '^/$', target: ['[data-tour="today-hero-show"]', '[data-tour="today-hero-event"]', '[data-tour="today-hero-empty"]'], title: 'What’s next', body: 'Your next show or event, with its setlist. Tap through to everything about it.' },
      { path: '^/$', target: ['[data-tour="today-tasks"]'], title: 'Your tasks', body: 'Things assigned to you, soonest first. Overdue ones turn red.' },
      { path: '^/$', target: ['[data-tour="today-actions"]', '[aria-label="Add something"]'], title: 'Add things fast', body: 'Add a show, setlist, song or money from here. On a phone, the + button does the same from any page.' },
      { path: '^/$', target: NAV, title: 'Everything else', body: 'Shows, setlists, songs, calendar, tasks and money all live here. Each one has its own short tour under Settings → Help & tours.' },
    ],
  },
  {
    id: 'shows',
    section: 'shows',
    title: 'Shows',
    blurb: 'Bookings from first enquiry to paid and split.',
    startPath: '/shows',
    steps: [
      { path: '^/shows$', target: ['main a[href="/shows/new"]'], title: 'Add a show', body: 'Every gig starts here, even a first enquiry. Add the date, venue, fee and the agency it came through.' },
      { path: '^/shows$', target: ['[data-tour="shows-tabs"]'], title: 'Upcoming and played', body: 'Upcoming shows are on top. Played shows keep their money and whether it’s been split. Insights shows the trends.' },
      { path: '^/shows$', target: ['[data-tour="show-status"]'], title: 'Move a show along', body: 'Tap a status to change it: Inquiry, Quotation Shared, Confirmed, Advance Received, Completed. Everyone is told when a show gets booked.' },
      { path: '^/shows$', target: ['[data-tour="show-row"]'], title: 'Open a show', body: 'Tap this show to open it.', action: 'tap' },
      { path: '^/shows/[^/]+$', target: ['[data-tour="show-progress"]'], title: 'Where it stands', body: 'Booked, setlist ready, paid and split: what’s done and what isn’t, for this show.' },
      { path: '^/shows/[^/]+$', title: 'All in one place', body: 'Below: the setlist, the money in and out, merch sold at this show, contacts and documents. That’s Shows. Try changing anything, it’s only the demo.' },
    ],
  },
  {
    id: 'setlists',
    section: 'setlists',
    title: 'Setlists',
    blurb: 'Build a set from your songs and take it on stage.',
    startPath: '/setlists',
    steps: [
      { path: '^/setlists$', target: ['main a[href="/setlists/new"]'], title: 'New setlist', body: 'Make one for a show (it picks up the date and venue) or start blank.' },
      { path: '^/setlists$', target: ['[data-tour="setlist-row"]'], title: 'Open a setlist', body: 'Tap a setlist to open it.', action: 'tap' },
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
      { path: '^/songs$', target: ['main input[type="search"]'], title: 'Find a song', body: 'Search by title or artist. On a long list, jump by letter.' },
      { path: '^/songs$', target: ['[data-tour="song-row"]'], title: 'Open a song', body: 'Tap a song to open it.', action: 'tap' },
      { path: '^/songs/[^/]+$', title: 'The chart', body: 'The chord chart, ready to play from. Change the key and everything moves with it. Edit to fix chords or add notes for the band.' },
    ],
  },
  {
    id: 'calendar',
    section: 'calendar',
    title: 'Calendar',
    blurb: 'Shows, events, tasks and who’s away, on one calendar.',
    startPath: '/calendar',
    steps: [
      { path: '^/calendar$', target: ['[data-tour="calendar-month"]'], title: 'The month', body: 'Shows, events, task due dates and who’s away, all together. Swipe or use the arrows to change month.' },
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
      { path: '^/tasks$', target: ['[data-tour="task-add"]'], title: 'Add a task', body: 'Type it, press Enter. Then give it a due date and people. They see it on their Today.' },
    ],
  },
]

export const tourById = (id: string) => TOURS.find(t => t.id === id)

/** The tour that starts on this page, if any. */
export const tourForPath = (path: string) => TOURS.find(t => t.startPath === path)

export const pathMatches = (step: TourStep, path: string) => new RegExp(step.path).test(path)
