import { describe, it, expect } from 'vitest'
import { isChordLine, textToChordPro, chordProToText, chordProToDoc, docToChordPro, blockToChordPro, sectionType, colorFor } from './blocks'
import { parseSong } from './parser'
import { formatSongAsChordPro } from './formatter'

describe('isChordLine', () => {
  it('spots a line of chords', () => {
    expect(isChordLine('G       D     Em')).toBe(true)
    expect(isChordLine('  F#m7b5  C/G  Dsus4  Cadd9  Bb  E7(#9)')).toBe(true)
    expect(isChordLine('| C | G | Am | F |  x2')).toBe(true)
  })

  it('leaves lyrics alone, even ones that start with a capital', () => {
    expect(isChordLine('Amazing grace how sweet the sound')).toBe(false)
    expect(isChordLine('A Bad Day')).toBe(false)
    expect(isChordLine('Am I wrong')).toBe(false)
    expect(isChordLine('')).toBe(false)
    expect(isChordLine('| | |')).toBe(false)
  })

  it('counts [bracketed] chords, but never directives', () => {
    expect(isChordLine('[G] [D]')).toBe(true)
    expect(isChordLine('{key: G}')).toBe(false)
  })
})

describe('textToChordPro', () => {
  it('merges a chord line into the lyric line under it', () => {
    expect(textToChordPro('G       D\nAmazing grace')).toBe('[G]Amazing [D]grace')
  })

  it('keeps chords past the end of the lyric', () => {
    expect(textToChordPro('G   D      A\nHi there')).toBe('[G]Hi t[D]here   [A]')
  })

  it('writes a chord line with nothing under it as chords only', () => {
    expect(textToChordPro('C   G\n\nAm')).toBe('[C]   [G]\n\n[Am]')
  })

  it('leaves inline [chords] and plain lyrics untouched', () => {
    expect(textToChordPro('[G]Amazing [D]grace\nno chords here')).toBe('[G]Amazing [D]grace\nno chords here')
  })
})

describe('chordProToText', () => {
  it('lays inline chords out above the lyrics', () => {
    expect(chordProToText('[G]Amazing [D]grace')).toBe('[G]       [D]\nAmazing grace')
  })

  it('keeps a chord-only line as it is', () => {
    expect(chordProToText('[C]   [G]')).toBe('[C]   [G]')
  })

  it('round-trips with textToChordPro', () => {
    for (const line of ['[G]Amazing [D]grace, how [Em]sweet the [C]sound', '[C]   [G]', 'just words', '[F#m]Hey [Bb/D]you']) {
      expect(textToChordPro(chordProToText(line))).toBe(line)
    }
  })

  it('makes room when two chords are closer than their names', () => {
    const text = chordProToText('[Gmaj7]A[D]h')
    expect(text).toBe('[Gmaj7] [D]\nA     h')
    // Stable from then on.
    expect(chordProToText(textToChordPro(text))).toBe(text)
  })
})

describe('chordProToDoc / docToChordPro', () => {
  const chart = [
    '{title: Test}',
    '{key: G}',
    '',
    '{start_of_verse: Verse 1}',
    '[G]Amazing [D]grace',
    '{end_of_verse}',
    '',
    '{start_of_chorus}',
    '[Em]How sweet',
    '{end_of_chorus}',
  ].join('\n')

  it('makes one block per section and keeps song-wide directives aside', () => {
    const doc = chordProToDoc(chart)
    expect(doc.preamble).toEqual(['{title: Test}', '{key: G}'])
    expect(doc.blocks.map(b => b.heading)).toEqual(['Verse 1', 'Chorus'])
    expect(doc.blocks[0].text).toBe('[G]       [D]\nAmazing grace')
  })

  it('writes sections back out', () => {
    expect(docToChordPro(chordProToDoc(chart))).toBe([
      '{title: Test}',
      '{key: G}',
      '',
      '{start_of_verse: Verse 1}',
      '[G]Amazing [D]grace',
      '{end_of_verse}',
      '',
      '{start_of_chorus: Chorus}',
      '[Em]How sweet',
      '{end_of_chorus}',
    ].join('\n'))
  })

  it('keeps an old chart without sections in one block', () => {
    const doc = chordProToDoc('{title: Old}\n[G]Line one\n[C]Line two\n\nChorus:\n[D]Sing it')
    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0].heading).toBe('')
    expect(doc.blocks[0].text).toBe('[G]\nLine one\n[C]\nLine two\n\nChorus:\n[D]\nSing it')
  })

  it('saves blocks without a name as sections too, so they stay apart when reopened', () => {
    const out = docToChordPro({ preamble: [], colors: {}, blocks: [{ id: 'a', heading: '', text: 'C\none' }, { id: 'b', heading: '', text: 'D\ntwo' }] })
    expect(out).toBe('{start_of_part}\n[C]one\n{end_of_part}\n\n{start_of_part}\n[D]two\n{end_of_part}')
    expect(chordProToDoc(out).blocks.map(b => b.text)).toEqual(['[C]\none', '[D]\ntwo'])
  })

  it('saves typed chord lines so they transpose', () => {
    const chartOut = docToChordPro({ preamble: ['{key: G}'], colors: {}, blocks: [{ id: 'a', heading: 'Verse', text: 'G       D\nAmazing grace' }] })
    expect(chartOut).toBe('{key: G}\n\n{start_of_verse: Verse}\n[G]Amazing [D]grace\n{end_of_verse}')
    expect(formatSongAsChordPro(parseSong(chartOut).transpose(2))).toContain('[A]Amazing [E]grace')
  })

  it('reads typed sharp chords whole, so A# goes up to B (never A##)', () => {
    const chartOut = docToChordPro({ preamble: [], colors: {}, blocks: [{ id: 'a', heading: '', text: 'A#      D#m\nAmazing grace\nF#  C#7' }] })
    expect(chartOut).toContain('[A#]Amazing [D#m]grace')
    const up = formatSongAsChordPro(parseSong(chartOut).transpose(1))
    expect(up).toContain('[B]Amazing [Em]grace')
    expect(up).toContain('[G]  [D7]')
    expect(up).not.toContain('##')
  })

  it('names the section type after the heading', () => {
    expect(blockToChordPro({ id: 'a', heading: 'Chorus 2', text: 'C\nla' })).toBe('{start_of_chorus: Chorus 2}\n[C]la\n{end_of_chorus}')
    expect(blockToChordPro({ id: 'a', heading: 'Guitar solo', text: 'C\nla' })).toBe('{start_of_part: Guitar solo}\n[C]la\n{end_of_part}')
    expect(blockToChordPro({ id: 'a', heading: 'Guitar solo', text: 'C\nla' }, { withHeading: false })).toBe('[C]la')
  })

  it('handles an empty chart', () => {
    expect(chordProToDoc('')).toEqual({ preamble: [], blocks: [], colors: {} })
    expect(docToChordPro({ preamble: [], blocks: [], colors: {} })).toBe('')
  })
})

describe('section colours', () => {
  it('groups headings by type', () => {
    expect(sectionType('Verse 2')).toBe('verse')
    expect(sectionType('  CHORUS x2 ')).toBe('chorus')
    expect(sectionType('Chorus (last time)')).toBe('chorus')
    expect(sectionType('Pre-chorus')).toBe('pre-chorus')
    expect(sectionType('')).toBe('')
  })

  it('saves colours in the chart and reads them back', () => {
    const doc = {
      preamble: ['{title: T}'],
      colors: { verse: 'blue' as const, chorus: 'amber' as const, bridge: 'purple' as const },
      blocks: [{ id: 'a', heading: 'Verse 1', text: 'C\nla' }, { id: 'b', heading: 'Chorus', text: 'G\nla' }],
    }
    const out = docToChordPro(doc)
    // Bridge is gone from the song, so its colour isn't kept.
    expect(out.split('\n').slice(0, 2)).toEqual(['{title: T}', '{x_rigly_colors: verse=blue, chorus=amber}'])
    const back = chordProToDoc(out)
    expect(back.colors).toEqual({ verse: 'blue', chorus: 'amber' })
    expect(back.preamble).toEqual(['{title: T}'])
    expect(colorFor(back, 'Verse 3')).toBe('blue')
    expect(colorFor(back, 'Outro')).toBeUndefined()
  })

  it('ignores colour names it does not know', () => {
    expect(chordProToDoc('{x_rigly_colors: verse=blue, chorus=chartreuse}').colors).toEqual({ verse: 'blue' })
  })
})

describe('the "label - chords" way of writing', () => {
  const sample = [
    'PADS INTRO, TEACHING THE AUDIENCE',
    'THAKITA THADHIM - E F♯ A B',
    'VERSE - F♯ E C♯ B.C♯.E | F♯ E A F♯.F.E',
    'DROP ENDING : BASS JOIN FROM 2ND CYCLE',
    '- F♯ G♯ A D | F♯ F.D C♯.F G♯ A',
    'Intro: C G Am F (x2)',
  ].join('\n')

  it('picks up the chords after the dash or colon and leaves the labels alone', () => {
    expect(textToChordPro(sample).split('\n')).toEqual([
      'PADS INTRO, TEACHING THE AUDIENCE',
      'THAKITA THADHIM - [E] [F♯] [A] [B]',
      'VERSE - [F♯] [E] [C♯] [B].[C♯].[E] | [F♯] [E] [A] [F♯].[F].[E]',
      'DROP ENDING : BASS JOIN FROM 2ND CYCLE',
      '- [F♯] [G♯] [A] [D] | [F♯] [F].[D] [C♯].[F] [G♯] [A]',
      'Intro: [C] [G] [Am] [F] (x2)',
    ])
  })

  it('opens again exactly as written', () => {
    const saved = textToChordPro(sample)
    expect(textToChordPro(chordProToText(saved))).toBe(saved)
    expect(chordProToText(saved).split('\n')[1]).toBe('THAKITA THADHIM - [E] [F♯] [A] [B]')
  })

  it('transposes every chord, including quick runs', () => {
    const up = formatSongAsChordPro(parseSong(textToChordPro('VERSE - F♯ E C♯ B.C♯.E')).transpose(2))
    expect(up).toBe('VERSE - [G#] [F#] [D#] [C#].[D#].[F#]')
  })

  it('keeps a line with lyrics after the chords as lyrics', () => {
    expect(textToChordPro('VIOLIN INTRO - A B E Intro then some lick')).toBe('VIOLIN INTRO - A B E Intro then some lick')
  })

  it('takes chords someone marked by hand, even mixed in with words', () => {
    expect(textToChordPro('VIOLIN INTRO - [A] [B] [E] Intro then some lick')).toBe('VIOLIN INTRO - [A] [B] [E] Intro then some lick')
  })
})

describe('coloured and highlighted text', () => {
  it('keeps colours when a chord line merges into the lyrics', () => {
    const text = 'G       D\nAmazing <span background="#fde047">grace</span>'
    expect(textToChordPro(text)).toBe('[G]Amazing [D]<span background="#fde047">grace</span>')
    expect(chordProToText(textToChordPro(text))).toBe('[G]       [D]\nAmazing <span background="#fde047">grace</span>')
  })

  it('survives transposing', () => {
    const up = formatSongAsChordPro(parseSong('[G]Amazing <span foreground="#ef4444">grace</span>').transpose(2))
    expect(up).toBe('[A]Amazing <span foreground="#ef4444">grace</span>')
  })
})
