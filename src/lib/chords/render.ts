// Turns a chart into the HTML shown on the song page, in Stage mode, in PDFs and in offline copies.
//
// Most lines go through ChordSheetJS, which puts chords above the lyrics. A line that's only a label
// and chords ("VERSE - [F#] [E] [B].[C#].[E] |") is shown as written instead, chords inline, because
// lifting them above an almost empty line would scatter them.

import ChordSheetJS from 'chordsheetjs'
import { parseSong } from './parser'
import { formatSong } from './formatter'
import { transposeSong } from './transposer'
import { parseLine, isInlineChordLine } from './line-markup'
import { chordProToDoc, blockToChordPro, colorFor, SECTION_COLORS } from './blocks'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Moves one chord name by some semitones; anything it can't read is left as typed. */
export function transposeChordName(name: string, semitones: number): string {
  if (!semitones) return name
  const chord = ChordSheetJS.Chord.parse(name.replace(/♯/g, '#').replace(/♭/g, 'b'))
  return chord ? chord.transpose(semitones).toString() : name
}

function inlineLineHtml(line: string, semitones: number): string {
  const html = parseLine(line).map(seg => {
    // parseLine only lets through colour values that are a hex code or a plain word.
    const style = [seg.fg && `color: ${seg.fg}`, seg.bg && `background-color: ${seg.bg}`].filter(Boolean).join('; ')
    const text = escapeHtml(seg.chord ? transposeChordName(seg.text, semitones) : seg.text)
    const inner = seg.chord ? `<span class="ichord">${text}</span>` : text
    return style ? `<span style="${style}">${inner}</span>` : inner
  }).join('')
  return `<div class="inline-line">${html}</div>`
}

/** One block's ChordPro (no section wrapper) as HTML, transposed. */
export function renderBlockHtml(body: string, semitones = 0): string {
  const out: string[] = []
  let chunk: string[] = []
  const flush = () => {
    if (chunk.some(l => l.trim())) {
      // A blank line just before a chunk would be swallowed by ChordSheetJS; keep the gap.
      if (!chunk[0].trim() && out.length) out.push('<div class="line-gap"></div>')
      out.push(formatSong(transposeSong(parseSong(chunk.join('\n')), semitones)))
    } else if (chunk.length && out.length) out.push('<div class="line-gap"></div>')
    chunk = []
  }
  for (const line of body.split('\n')) {
    if (isInlineChordLine(line)) { flush(); out.push(inlineLineHtml(line, semitones)) }
    else chunk.push(line)
  }
  flush()
  return `<div class="chord-sheet">${out.join('')}</div>`
}

/** A whole chart as HTML: each section with its (coloured) name, transposed. */
export function renderChartHtml(chart: string, semitones = 0): string {
  const doc = chordProToDoc(chart)
  const sections = doc.blocks.map(block => {
    const body = renderBlockHtml(blockToChordPro(block, { withHeading: false }), semitones)
    const heading = block.heading.trim()
    if (!heading) return `<div class="chart-section">${body}</div>`
    const color = colorFor(doc, heading)
    const style = color ? ` style="color: ${SECTION_COLORS[color]}"` : ''
    return `<div class="chart-section"><div class="section-label"${style}>${escapeHtml(heading)}</div>${body}</div>`
  })
  return `<div class="chord-sheet">${sections.join('')}</div>`
}
