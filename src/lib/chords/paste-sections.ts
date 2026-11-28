// Spotting the sections in a whole chord sheet pasted into a song ("[Verse 1]", "Chorus:", "PADS INTRO",
// "VERSE - F# E C#"), so each one becomes its own section card instead of one long block.

const SECTION_WORDS =
  'intro|verse|pre[- ]?chorus|post[- ]?chorus|chorus|bridge|outro|solo|interlude|instrumental|hook|refrain|' +
  'tag|coda|breakdown|ending|riff|turnaround|vamp|drop|build|break|prelude|middle 8|alap|pallavi|anupallavi|charanam'

const QUALIFIERS = new Set(['final', 'last', 'guitar', 'piano', 'keys', 'pad', 'pads', 'drum', 'drums', 'bass', 'acoustic', 'double', 'half', 'short', 'big', 'instrumental', 'vocal'])

// Up to two words in front ("Pads intro", "Final chorus"), the section word, then only a number, "x2",
// "(soft)" and the like. Square brackets around it are fine. Anything after a dash or colon is kept too.
const HEADER = new RegExp(
  String.raw`^\s*\[?\s*((?:[a-z][\w'&]*\s+){0,2}(?:${SECTION_WORDS})(?:\s*(?:\d+|[ivx]+|x\s*\d+|\d+\s*x|\([^)]*\)))*)\s*\]?\s*(?:([:\-–—])\s*(.*))?$`,
  'i',
)

export interface PastedSection {
  heading: string
  text: string
}

export interface SplitPaste {
  /** Lines before the first section name, which belong to wherever the paste went. */
  before: string
  sections: PastedSection[]
}

/** The section name a line starts, or null if it isn't one. `rest` is anything after a dash or colon. */
export function sectionHeader(line: string): { heading: string; rest: string } | null {
  if (line.length > 120) return null
  const m = line.match(HEADER)
  if (!m) return null
  const heading = m[1].replace(/\s+/g, ' ').trim()
  // A lyric line starting with a section word ("Break my heart") isn't a name: it has to be short and,
  // without brackets, a colon or capitals, on its own.
  const bracketed = /^\s*\[/.test(line)
  const shouted = heading === heading.toUpperCase()
  if (!bracketed && !m[2] && !shouted) {
    // Plain "Verse 2" or "Chorus" alone is a name. A word in front only counts if it's one people put
    // there ("Final chorus", "Guitar solo"), so a lyric like "Second verse" stays a lyric.
    const front = heading.toLowerCase().match(new RegExp(`^(.*?)\\b(?:${SECTION_WORDS})`))?.[1].trim() ?? ''
    if (front && !front.split(/\s+/).every(w => QUALIFIERS.has(w))) return null
  }
  return { heading, rest: (m[3] ?? '').trim() }
}

const trimBlankLines = (lines: string[]) => {
  let s = 0
  let e = lines.length
  while (s < e && !lines[s].trim()) s++
  while (e > s && !lines[e - 1].trim()) e--
  return lines.slice(s, e)
}

/**
 * Splits pasted text at its section names. With none found, everything is `before` and `sections` is
 * empty, so the paste goes in as it is. A name with chords after it ("VERSE - F# E C#") keeps that line
 * as the section's first line, so the chords are still read the same way.
 */
export function splitPastedSections(text: string): SplitPaste {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const before: string[] = []
  const sections: { heading: string; lines: string[] }[] = []
  for (const line of lines) {
    const header = sectionHeader(line)
    if (header) {
      sections.push({ heading: header.heading, lines: header.rest ? [line.trim()] : [] })
    } else if (sections.length) {
      sections[sections.length - 1].lines.push(line)
    } else {
      before.push(line)
    }
  }
  return {
    before: sections.length ? trimBlankLines(before).join('\n') : text,
    sections: sections.map(s => ({ heading: s.heading, text: trimBlankLines(s.lines).join('\n') })),
  }
}
