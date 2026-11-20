import { describe, it, expect } from 'vitest'
import { renderBlockHtml, renderChartHtml, transposeChordName } from './render'

describe('transposeChordName', () => {
  it('moves chords, sharps and flats included', () => {
    expect(transposeChordName('F♯', 2)).toBe('G#')
    expect(transposeChordName('Bb', 2)).toBe('C')
    expect(transposeChordName('C#m7/G#', 1)).toBe('Dm7/A')
  })

  it('leaves the name as typed when not transposing, or when it isn’t a chord', () => {
    expect(transposeChordName('F♯', 0)).toBe('F♯')
    expect(transposeChordName('|', 3)).toBe('|')
  })
})

describe('renderBlockHtml', () => {
  it('shows a "label - chords" line as written, chords inline and transposed', () => {
    const html = renderBlockHtml('VERSE - [F♯] [E] [B].[C♯].[E] |', 2)
    expect(html).toContain('<div class="inline-line">VERSE - <span class="ichord">G#</span> <span class="ichord">F#</span> <span class="ichord">C#</span>.<span class="ichord">D#</span>.<span class="ichord">F#</span> |</div>')
  })

  it('puts chords above the lyrics on lyric lines', () => {
    const html = renderBlockHtml('[G]Amazing [D]grace', 0)
    expect(html).toContain('class="chord">G<')
    expect(html).not.toContain('inline-line')
  })

  it('escapes text and only keeps safe colour values', () => {
    const html = renderBlockHtml('<b>hi</b> - [C] <span foreground="red;x:expression(1)">[D]</span>', 0)
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;')
    expect(html).not.toContain('expression')
  })

  it('shows coloured and highlighted text', () => {
    const html = renderBlockHtml('INTRO - <span foreground="#ef4444">[C]</span> <span background="#fde047">[G]</span>', 0)
    expect(html).toContain('<span style="color: #ef4444"><span class="ichord">C</span></span>')
    expect(html).toContain('<span style="background-color: #fde047"><span class="ichord">G</span></span>')
  })
})

describe('renderChartHtml', () => {
  it('shows each section with its name and colour', () => {
    const html = renderChartHtml('{x_rigly_colors: verse=blue}\n\n{start_of_verse: Verse 1}\n[G]la\n{end_of_verse}', 0)
    expect(html).toContain('<div class="section-label" style="color: #3b82f6">Verse 1</div>')
  })
})

describe('chords marked among words', () => {
  it('stay inline when none of them sits on a word', () => {
    const html = renderBlockHtml('VIOLIN INTRO - [A] [B] [E] Intro then some lick', 2)
    expect(html).toContain('<div class="inline-line">VIOLIN INTRO - <span class="ichord">B</span> <span class="ichord">C#</span> <span class="ichord">F#</span> Intro then some lick</div>')
  })

  it('go above the lyrics when written onto words', () => {
    expect(renderBlockHtml('Hello [G]Amazing [D]grace', 0)).not.toContain('inline-line')
    expect(renderBlockHtml('[G] Amazing [D] grace', 0)).not.toContain('inline-line')
  })
})
