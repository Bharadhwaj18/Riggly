import ChordSheetJS from 'chordsheetjs'

const parser = new ChordSheetJS.ChordProParser()

/**
 * Chords inside [brackets] are written with plain "#" and "b" so they transpose: ChordSheetJS doesn't
 * understand "♯"/"♭", and "A♯m" moved up two came out as "B♯m". Outside brackets, a "#" is swapped for
 * "♯" as before, so a "#" in the lyrics ("Verse #1") can never be read as a comment.
 */
function safeChart(chordChart: string): string {
  return chordChart
    .split(/(\[[^\]\n]*\]|\{[^}\n]*\}|<\/?span\b[^>\n]*>)/)
    .map((part, i) => {
      if (i % 2 === 0) return part.replace(/#/g, '♯')
      // Chords, directives such as {key: F#}, and colour tags (<span foreground="#ef4444">) keep plain sharps.
      return part.startsWith('[') ? part.replace(/♯/g, '#').replace(/♭/g, 'b') : part
    })
    .join('')
}

export function parseSong(chordChart: string) {
  try {
    // A backslash is an escape character in ChordPro and makes the whole parse fail (the catch below
    // would then blank the song), so it's dropped. Lyrics often carry one as a stray line-end mark.
    return parser.parse(safeChart((chordChart || '').replace(/\\/g, '')))
  } catch {
    return parser.parse('')
  }
}
