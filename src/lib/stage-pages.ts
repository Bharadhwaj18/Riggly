/**
 * Splits a song's sections into pages that each fit the screen, so Stage mode turns pages instead of
 * scrolling. Sections are never cut in half: each page takes as many whole sections, in order, as fit
 * in `available` pixels (with `gap` between them). `keepWithNext[i]` holds section i on the same page
 * as the one after it (a heading with nothing under it stays with what follows). Anything taller than
 * the screen gets a page to itself.
 *
 * Returns the section indexes on each page, e.g. [[0, 1], [2], [3, 4]].
 */
export function paginateSections(heights: number[], available: number, gap: number, keepWithNext: boolean[] = []): number[][] {
  // Sections that must stay together, as one unit each.
  const units: { items: number[]; height: number }[] = []
  heights.forEach((h, i) => {
    const last = units[units.length - 1]
    if (last && keepWithNext[i - 1]) {
      last.items.push(i)
      last.height += gap + h
    } else {
      units.push({ items: [i], height: h })
    }
  })

  const pages: number[][] = []
  let page: number[] = []
  let used = 0
  for (const unit of units) {
    const needed = page.length ? used + gap + unit.height : unit.height
    if (page.length && needed > available) {
      pages.push(page)
      page = [...unit.items]
      used = unit.height
    } else {
      page.push(...unit.items)
      used = needed
    }
  }
  if (page.length) pages.push(page)
  return pages
}

/** Total height of a page's sections, gaps included. */
export function pageHeight(page: number[], heights: number[], gap: number): number {
  return page.reduce((sum, i, n) => sum + heights[i] + (n ? gap : 0), 0)
}

/** Which page holds a section (for keeping your place when the pages are worked out again). */
export function pageOfSection(pages: number[][], section: number): number {
  const found = pages.findIndex(p => p.includes(section))
  return found < 0 ? 0 : found
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
