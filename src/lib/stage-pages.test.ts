import { describe, it, expect } from 'vitest'
import { paginateSections, pageOfSection, mergeHeadingOnlySections } from './stage-pages'

describe('paginateSections', () => {
  it('packs whole sections onto each page, in order', () => {
    // Screen of 300, gaps of 10: 100+10+100+10+80 = 300 fits; the next 150 starts a new page.
    expect(paginateSections([100, 100, 80, 150, 140], 300, 10)).toEqual([[0, 1, 2], [3, 4]])
  })

  it('gives a section taller than the screen a page of its own', () => {
    expect(paginateSections([50, 500, 50], 300, 10)).toEqual([[0], [1], [2]])
  })

  it('handles a song with no sections', () => {
    expect(paginateSections([], 300, 10)).toEqual([])
  })
})

describe('pageOfSection', () => {
  it('finds the page a section is on', () => {
    expect(pageOfSection([[0, 1], [2, 3], [4]], 3)).toBe(1)
    expect(pageOfSection([[0, 1]], 9)).toBe(0)
  })
})

describe('keeping a heading with what follows', () => {
  it('keeps a heading-only section on the same page as the next one', () => {
    // Without keepWithNext: [[0, 1], [2]]. Section 1 is a lone heading, so it moves on with section 2.
    expect(paginateSections([150, 40, 200], 300, 10, [false, true, false])).toEqual([[0], [1, 2]])
  })

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
