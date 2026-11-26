import { describe, it, expect } from 'vitest'
import { paginateSections, pageOf, mergeHeadingOnlySections, type MeasuredSection } from './stage-pages'

// A card with a 20px header and lines every 30px.
const card = (lines: number, o: Partial<MeasuredSection> = {}): MeasuredSection => ({
  header: 20,
  content: lines * 30,
  breaks: Array.from({ length: lines }, (_, i) => i * 30),
  ...o,
})
const sections = (pages: ReturnType<typeof paginateSections>) => pages.map(p => p.map(s => s.section))

describe('paginateSections', () => {
  it('packs whole sections onto each page, in order', () => {
    // Screen 300, gap 10: 80 + 10 + 80 + 10 + 110 = 290 fits; the next card starts a new page.
    const pages = paginateSections([card(2), card(2), card(3), card(4)], 300, 10)
    expect(sections(pages)).toEqual([[0, 1, 2], [3]])
    expect(pages[0][0]).toEqual({ section: 0, start: 0, end: 60 })
  })

  it('moves a section that would fit on a page of its own to the next page, rather than cutting it', () => {
    expect(sections(paginateSections([card(5), card(5)], 300, 10))).toEqual([[0], [1]])
  })

  it('cuts a section taller than the screen between lines, across as many pages as it needs', () => {
    // One big section of 20 lines (a chart typed without section names): 9 lines fit under the header per page.
    const pages = paginateSections([card(20), card(2)], 300, 10)
    expect(pages.map(p => p.map(s => [s.section, s.start, s.end]))).toEqual([
      [[0, 0, 270]],
      [[0, 270, 540]],
      [[0, 540, 600], [1, 0, 60]],
    ])
  })

  it('starts a long section on a fresh page and never cuts after a chord line', () => {
    // Three lines fit under the header per page. Line 3 is a chord line, so there's no break at 90 (under it):
    // the first part stops at 60 and that chord line goes over with its words.
    const long = card(10, { breaks: [0, 30, 60, 120, 150, 180, 210, 240, 270] })
    const pages = paginateSections([card(3), long], 110, 10)
    expect(pages.map(p => p.map(s => [s.section, s.start, s.end]))).toEqual([
      [[0, 0, 90]],
      [[1, 0, 60]],
      [[1, 60, 150]],
      [[1, 150, 240]],
      [[1, 240, 300]],
    ])
  })

  it('keeps a heading with nothing under it on the same page as the next section', () => {
    const heading = card(0, { keepWithNext: true })
    expect(sections(paginateSections([card(5), heading, card(5)], 300, 10))).toEqual([[0], [1, 2]])
  })

  it('handles a song with no sections', () => {
    expect(paginateSections([], 300, 10)).toEqual([])
  })
})

describe('pageOf', () => {
  const pages = paginateSections([card(20), card(2)], 300, 10)
  it('finds the page showing a spot in a section', () => {
    expect(pageOf(pages, 0, 0)).toBe(0)
    expect(pageOf(pages, 0, 300)).toBe(1)
    expect(pageOf(pages, 1)).toBe(2)
    expect(pageOf(pages, 9)).toBe(0)
  })
})

describe('mergeHeadingOnlySections', () => {
  it('merges a heading-only section with an unnamed one after it into one card', () => {
    const merged = mergeHeadingOnlySections([
      { heading: 'Intro', html: '<p>A</p>' },
      { heading: 'Verse', html: '' },
      { heading: '', html: '<p>B</p>' },
      { heading: 'Chorus', html: '' },
      { heading: 'Bridge', html: '<p>C</p>' },
    ])
    expect(merged).toEqual([
      { heading: 'Intro', html: '<p>A</p>' },
      { heading: 'Verse', html: '<p>B</p>' },
      { heading: 'Chorus', html: '' },
      { heading: 'Bridge', html: '<p>C</p>' },
    ])
  })
})
