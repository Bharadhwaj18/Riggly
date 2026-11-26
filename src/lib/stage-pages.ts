/**
 * Splits a song's sections into pages that each fit the screen, so Stage mode turns pages instead of scrolling.
 *
 * Each page takes as many whole sections, in order, as fit in `available` pixels (with `gap` between cards). A
 * section that doesn't fit on the page it would start on moves to the next page whole, unless it's taller than a
 * whole page by itself (a long verse, or a chart typed without section names, which is one big section): then it's
 * cut between lines across as many pages as it needs, and its last part shares a page with what follows.
 */

/** One section card, measured: its heading and padding, its lines' height, and where it may be cut. */
export interface MeasuredSection {
  /** Card height without its lines: padding, border and heading. */
  header: number
  /** Height of the lines. 0 for a heading with nothing under it. */
  content: number
  /** Offsets (from the top of the lines, ascending, between 0 and `content`) where a new page may start. */
  breaks: number[]
  /** Keep this card on the same page as the next one (a heading with nothing under it). */
  keepWithNext?: boolean
}

/** The part of a section shown on a page: its lines from `start` to `end` (pixels from the top of its lines). */
export interface StageSlice {
  section: number
  start: number
  end: number
}

const height = (s: MeasuredSection, start: number, end: number) => s.header + (end - start)

/** Where the first part of a section would end if it had to be cut to fit `room`. */
function cutAt(s: MeasuredSection, start: number, room: number): number {
  let end = start
  for (const b of s.breaks) {
    if (b <= start) continue
    if (height(s, start, b) > room) break
    end = b
  }
  // Not even one line fits: take the first line anyway (it's shown a little cut off rather than never).
  if (end === start) end = s.breaks.find(b => b > start) ?? s.content
  return end
}

export function paginateSections(sections: MeasuredSection[], available: number, gap: number): StageSlice[][] {
  const pages: StageSlice[][] = []
  let page: StageSlice[] = []
  let used = 0
  const newPage = () => { if (page.length) pages.push(page); page = []; used = 0 }
  const place = (slice: StageSlice, h: number) => { used += (page.length ? gap : 0) + h; page.push(slice) }
  const room = () => available - used - (page.length ? gap : 0)

  sections.forEach((s, i) => {
    let needed = height(s, 0, s.content)
    // A lone heading only stays on this page if the start of what follows fits under it.
    const next = sections[i + 1]
    if (s.keepWithNext && next) {
      const nextWhole = height(next, 0, next.content)
      needed += gap + (nextWhole <= available ? nextWhole : height(next, 0, cutAt(next, 0, available)))
    }
    if (needed <= room()) { place({ section: i, start: 0, end: s.content }, height(s, 0, s.content)); return }
    if (page.length) newPage()

    // Taller than a whole page: cut it between lines.
    let start = 0
    while (height(s, start, s.content) > available) {
      const end = cutAt(s, start, available)
      place({ section: i, start, end }, height(s, start, end))
      newPage()
      start = end
    }
    place({ section: i, start, end: s.content }, height(s, start, s.content))
  })
  if (page.length) pages.push(page)
  return pages
}

/** The page showing a spot in the song (a section, and how far into its lines), for keeping your place. */
export function pageOf(pages: StageSlice[][], section: number, offset = 0): number {
  const exact = pages.findIndex(p => p.some(s => s.section === section && s.start <= offset && (offset < s.end || s.start === s.end)))
  if (exact >= 0) return exact
  const any = pages.findIndex(p => p.some(s => s.section === section))
  return any < 0 ? 0 : any
}

export interface StageSectionLike { heading: string; html: string }

/**
 * A section that's only a heading, followed by one with no heading, becomes one card: that heading
 * over those chords. (Splitting an old chart into blocks easily leaves "VERSE" on its own.)
 */
export function mergeHeadingOnlySections<T extends StageSectionLike>(sections: T[]): T[] {
  const out: T[] = []
  for (const s of sections) {
    const prev = out[out.length - 1]
    if (prev && prev.heading && !prev.html && !s.heading && s.html) {
      out[out.length - 1] = { ...prev, html: s.html }
    } else {
      out.push(s)
    }
  }
  return out
}
