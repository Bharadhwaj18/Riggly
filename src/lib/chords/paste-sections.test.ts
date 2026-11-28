import { describe, it, expect } from 'vitest'
import { sectionHeader, splitPastedSections } from './paste-sections'

describe('sectionHeader', () => {
  it('spots the usual ways of naming a section', () => {
    expect(sectionHeader('[Verse 1]')?.heading).toBe('Verse 1')
    expect(sectionHeader('[Chorus]')?.heading).toBe('Chorus')
    expect(sectionHeader('Pre-Chorus:')?.heading).toBe('Pre-Chorus')
    expect(sectionHeader('PADS INTRO')?.heading).toBe('PADS INTRO')
    expect(sectionHeader('Chorus x2')?.heading).toBe('Chorus x2')
    expect(sectionHeader('Final chorus')?.heading).toBe('Final chorus')
    expect(sectionHeader('[Second Verse]')?.heading).toBe('Second Verse')
    expect(sectionHeader('GUITAR SOLO')?.heading).toBe('GUITAR SOLO')
    expect(sectionHeader('  Outro  ')?.heading).toBe('Outro')
  })

  it('keeps chords written after the name', () => {
    expect(sectionHeader('VERSE - F# E C#')).toEqual({ heading: 'VERSE', rest: 'F# E C#' })
  })

  it('leaves lyrics and chord lines alone', () => {
    expect(sectionHeader('Break my heart again')).toBeNull()
    expect(sectionHeader('Chorus of angels singing')).toBeNull()
    expect(sectionHeader('Second verse')).toBeNull()
    expect(sectionHeader('Our chorus')).toBeNull()
    expect(sectionHeader('G        D           Em')).toBeNull()
    expect(sectionHeader('Hello there my friend')).toBeNull()
    expect(sectionHeader('')).toBeNull()
  })
})

describe('splitPastedSections', () => {
  it('splits an Ultimate Guitar style sheet into sections, keeping spacing', () => {
    const sheet = 'Capo 2\n\n[Verse 1]\nG        D\nHello  there\n\n[Chorus]\n    C   G\nSing it\n'
    expect(splitPastedSections(sheet)).toEqual({
      before: 'Capo 2',
      sections: [
        { heading: 'Verse 1', text: 'G        D\nHello  there' },
        { heading: 'Chorus', text: '    C   G\nSing it' },
      ],
    })
  })

  it('pastes text with no section names as it is', () => {
    const text = 'G   D\nHello\n\n'
    expect(splitPastedSections(text)).toEqual({ before: text, sections: [] })
  })

  it('keeps a name with chords after it as the first line', () => {
    expect(splitPastedSections('VERSE - F# E C#\nCHORUS - A B').sections).toEqual([
      { heading: 'VERSE', text: 'VERSE - F# E C#' },
      { heading: 'CHORUS', text: 'CHORUS - A B' },
    ])
  })
})
