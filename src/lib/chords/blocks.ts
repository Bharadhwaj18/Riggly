// Turns a stored ChordPro chart into editable blocks (one per song section) and back again.
//
// The chart is still saved as plain ChordPro in `songs.chord_chart`, so Stage mode, PDF export and
// offline copies keep reading it exactly as before. Blocks are only how the song page edits it.
//
// Inside a block, chords can be typed the easy way: a line of chords above the lyric line it belongs
// to ("G       D" over "Amazing grace"). A line made only of chords is spotted automatically and merged
// into the lyric line below it as inline ChordPro ("[G]Amazing [D]grace"), so it transposes. Inline
// [brackets] still work too.

import { parseLine, serializeLine, withAutoChords, isChordRow, isInlineChordLine, type Seg } from './line-markup'

export interface ChartBlock {
  id: string
  /** Section name shown above the block, e.g. "Verse 1" or "Chorus". May be empty. */
  heading: string
  /** Chords-over-lyrics text as the person typed it. */
  text: string
  /** ChordPro section type it came from ("tab" and "grid" render differently, so they're kept). */
  kind?: string
}

export interface ChartDoc {
  /** Song-wide directives such as {title: …} and {key: …}, kept at the top of the chart. */
  preamble: string[]
  blocks: ChartBlock[]
  /** Heading colour per section type ("verse" → "blue"), so every verse shares one colour. */
  colors: Record<string, SectionColor>
}

// ---------------------------------------------------------------------------------------------
// Section colours

export const SECTION_COLORS = {
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  green: '#22c55e',
  teal: '#14b8a6',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
} as const
export type SectionColor = keyof typeof SECTION_COLORS

/** What a heading counts as for colouring: "Verse 2" and "verse 1" are both "verse", "Chorus x2" is "chorus". */
export function sectionType(heading: string): string {
  let h = heading.trim().toLowerCase().replace(/\s+/g, ' ')
  let prev = ''
  while (h !== prev) {
    prev = h
    h = h.replace(/\s*(?:\d+|x\s*\d+|\d+\s*x|\([^)]*\)|[:.\-–])\s*$/, '').trim()
  }
  return h
}

export function colorFor(doc: Pick<ChartDoc, 'colors'>, heading: string): SectionColor | undefined {
  const type = sectionType(heading)
  return type ? doc.colors[type] : undefined
}

// Stored in the chart as a custom ChordPro directive, which every renderer (Stage mode, PDF) ignores:
// {x_rigly_colors: verse=blue, chorus=amber}
const COLOR_DIRECTIVE = /^\s*\{\s*x_rigly_colors\s*:\s*([^}]*)\}\s*$/i

function parseColors(value: string): Record<string, SectionColor> {
  const colors: Record<string, SectionColor> = {}
  for (const pair of value.split(',')) {
    const [type, color] = pair.split('=').map(x => x?.trim().toLowerCase())
    if (type && color && color in SECTION_COLORS) colors[type] = color as SectionColor
  }
  return colors
}

function colorsDirective(colors: Record<string, SectionColor>): string | null {
  const pairs = Object.entries(colors).filter(([type]) => type && !/[,=}]/.test(type))
  return pairs.length ? `{x_rigly_colors: ${pairs.map(([t, c]) => `${t}=${c}`).join(', ')}}` : null
}

let nextId = 0
export function newBlockId(): string {
  nextId += 1
  return `b${Date.now().toString(36)}${nextId}`
}

// ---------------------------------------------------------------------------------------------
// Block text  ⇄  ChordPro
//
// A block's text is its lines as laid out in the editor, in ChordPro markup: a marked chord is "[F#]"
// right where it sits, so a chord line above the lyrics reads "[G]       [D]". Saving merges a chord
// line into the lyric line under it ("[G]Amazing [D]grace") so ChordSheetJS puts the chords above
// the right words; opening splits it back out.

const isDirective = (line: string) => /^\s*\{.*\}\s*$/.test(line)

/** True for a line the app reads as only chords (typed or marked), with at least one chord. */
export function isChordLine(line: string): boolean {
  return !isDirective(line) && isChordRow(withAutoChords(parseLine(line)))
}

/** Inserts a chord at a column of the lyric's visible text (chords already placed take no room). */
function insertChordAt(segs: Seg[], col: number, text: string): Seg[] {
  const out: Seg[] = []
  let at = 0
  let placed = false
  for (const s of segs) {
    if (placed || s.chord) { out.push(s); continue }
    const end = at + s.text.length
    if (col < end) {
      if (col > at) out.push({ ...s, text: s.text.slice(0, col - at) })
      out.push({ text, chord: true }, { ...s, text: s.text.slice(col - at) })
      placed = true
    } else out.push(s)
    at = end
  }
  if (!placed) {
    if (col > at) out.push({ text: ' '.repeat(col - at) })
    out.push({ text, chord: true })
  }
  return out
}

/** Puts each chord from a chord line into the lyric line under it, at the same column. */
function mergeRowIntoLyrics(row: Seg[], lyric: Seg[]): string {
  const marks: { col: number; text: string }[] = []
  let col = 0
  for (const s of row) {
    if (s.chord) marks.push({ col, text: s.text })
    else for (const m of s.text.matchAll(/\S+/g)) marks.push({ col: col + (m.index ?? 0), text: m[0] })
    col += s.text.length
  }
  // Right to left, so each insert leaves the columns to its left where they were.
  let out = lyric
  for (const { col: c, text } of [...marks].reverse()) out = insertChordAt(out, c, text)
  return serializeLine(out).trimEnd()
}

export function textToChordPro(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (isDirective(lines[i])) { out.push(lines[i].trimEnd()); continue }
    const cur = withAutoChords(parseLine(lines[i]))
    const nextLine = lines[i + 1]
    if (isChordRow(cur) && nextLine !== undefined && nextLine.trim() && !isDirective(nextLine)) {
      const next = withAutoChords(parseLine(nextLine))
      if (!isChordRow(next) && !next.some(s => s.chord)) {
        out.push(mergeRowIntoLyrics(cur, next))
        i += 1
        continue
      }
    }
    out.push(serializeLine(cur).trimEnd())
  }
  return out.join('\n')
}

/** "[G]Amazing [D]grace" → "[G]       [D]\nAmazing grace". Inline chord lines and plain lines are kept as they are. */
function chordProLineToText(line: string): string {
  if (!line.includes('[') || isDirective(line) || isInlineChordLine(line)) return line
  const segs = parseLine(line)
  if (!segs.some(s => s.chord)) return line
  const lyric: Seg[] = []
  let lyricLen = 0
  let row = ''
  let rowLen = 0
  for (const s of segs) {
    if (!s.chord) { lyric.push(s); lyricLen += s.text.length; continue }
    // Keep one space between neighbouring chords; push the lyrics along if a chord needs the room.
    const minCol = rowLen ? rowLen + 1 : 0
    if (lyricLen < minCol) { lyric.push({ text: ' '.repeat(minCol - lyricLen) }); lyricLen = minCol }
    row += ' '.repeat(lyricLen - rowLen) + `[${s.text}]`
    rowLen = lyricLen + s.text.length
  }
  return `${row}\n${serializeLine(lyric).trimEnd()}`
}

export function chordProToText(chordPro: string): string {
  return chordPro.split('\n').map(chordProLineToText).join('\n')
}

// ---------------------------------------------------------------------------------------------
// Whole chart  ⇄  blocks

const META_DIRECTIVE =
  /^\s*\{\s*(title|t|subtitle|st|artist|key|capo|tempo|time|album|year|composer|lyricist|copyright|duration|meta)\s*[:}\s]/i
const SECTION_START = /^\s*\{\s*(?:start_of_([a-z_]+)|so([cvbt]))\s*(?::\s*([^}]*?)|\s+label\s*=\s*"([^"]*)")?\s*\}\s*$/i
const SECTION_END = /^\s*\{\s*(?:end_of_[a-z_]+|eo[cvbt])\s*\}\s*$/i
const SHORT_KIND: Record<string, string> = { c: 'chorus', v: 'verse', b: 'bridge', t: 'tab' }
const DEFAULT_HEADING: Record<string, string> = {
  verse: 'Verse', chorus: 'Chorus', bridge: 'Bridge', tab: 'Tab', grid: 'Grid',
}

/** Removes blank lines from both ends of a block's lines. */
function trimBlankEnds(lines: string[]): string[] {
  let start = 0
  let end = lines.length
  while (start < end && !lines[start].trim()) start++
  while (end > start && !lines[end - 1].trim()) end--
  return lines.slice(start, end)
}

export function chordProToDoc(chart: string): ChartDoc {
  const lines = (chart ?? '').replace(/\r\n?/g, '\n').split('\n')
  const preamble: string[] = []
  const blocks: ChartBlock[] = []
  let colors: Record<string, SectionColor> = {}
  let loose: string[] = []

  const flushLoose = () => {
    // Content outside any section stays together as one block; people split it up themselves.
    const body = trimBlankEnds(loose)
    loose = []
    if (body.length) blocks.push({ id: newBlockId(), heading: '', text: chordProToText(body.join('\n')) })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const start = line.match(SECTION_START)
    if (start) {
      flushLoose()
      const kind = (start[1] ?? SHORT_KIND[start[2].toLowerCase()] ?? 'part').toLowerCase()
      const label = (start[3] ?? start[4] ?? '').trim()
      const body: string[] = []
      i += 1
      while (i < lines.length && !SECTION_END.test(lines[i])) body.push(lines[i++])
      blocks.push({
        id: newBlockId(),
        heading: label || DEFAULT_HEADING[kind] || '',
        text: chordProToText(trimBlankEnds(body).join('\n')),
        kind,
      })
      continue
    }
    const colorLine = line.match(COLOR_DIRECTIVE)
    if (colorLine) { colors = { ...colors, ...parseColors(colorLine[1]) }; continue }
    if (META_DIRECTIVE.test(line)) { preamble.push(line.trim()); continue }
    loose.push(line)
  }
  flushLoose()

  return { preamble, blocks, colors }
}

/** The ChordPro section type to save a block as. Tab and grid keep theirs; the rest follow the heading. */
function kindFor(block: ChartBlock): string {
  if (block.kind === 'tab' || block.kind === 'grid') return block.kind
  const h = block.heading.trim().toLowerCase()
  if (h.startsWith('chorus')) return 'chorus'
  if (h.startsWith('verse')) return 'verse'
  if (h.startsWith('bridge')) return 'bridge'
  return 'part'
}

/** One block as ChordPro. `withHeading: false` leaves the section wrapper off (for rendering a block alone). */
export function blockToChordPro(block: ChartBlock, { withHeading = true } = {}): string {
  const body = trimBlankEnds(textToChordPro(block.text).split('\n')).join('\n')
  if (!withHeading) return body
  // Every block is saved as a section, even one without a name, so blocks stay apart when reopened.
  const heading = block.heading.trim().replace(/[{}]/g, '')
  const kind = kindFor(block)
  return `{start_of_${kind}${heading ? `: ${heading}` : ''}}\n${body}${body ? '\n' : ''}{end_of_${kind}}`
}

export function docToChordPro(doc: ChartDoc): string {
  const parts: string[] = []
  // Only keep colours for section types still in the song.
  const used = new Set(doc.blocks.map(b => sectionType(b.heading)).filter(Boolean))
  const colorLine = colorsDirective(Object.fromEntries(Object.entries(doc.colors).filter(([t]) => used.has(t))))
  const top = colorLine ? [...doc.preamble, colorLine] : doc.preamble
  if (top.length) parts.push(top.join('\n'))
  for (const block of doc.blocks) {
    if (!block.heading.trim() && !block.text.trim()) continue
    parts.push(blockToChordPro(block))
  }
  return parts.join('\n\n')
}
