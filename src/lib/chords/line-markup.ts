// One line of a chord chart, as a list of pieces: plain text, chords, and coloured / highlighted text.
//
// Written out, a line is ChordPro: a chord is "[F#]" and coloured text is
// <span foreground="#ef4444" background="#fde047">text</span>. ChordSheetJS reads both, so colours show
// in Stage mode and PDFs too, and survive transposing.

export interface Seg {
  text: string
  chord?: boolean
  /** Text colour. */
  fg?: string
  /** Highlight colour. */
  bg?: string
}

// ---------------------------------------------------------------------------------------------
// Chords

const CHORD_TOKEN =
  /^\(?[A-G](?:#|b|♯|♭)?(?:maj|min|dim|aug|sus|add|m|M|\+|°|ø|Δ|\d|#|b|♯|♭|\(|\)|\/(?=\d))*(?:\/[A-G](?:#|b|♯|♭)?)?\)?$/
/** Things that sit among chords without being chords: bar lines, dashes, repeats, "N.C.", "x2". */
const FILLER_TOKEN = /^(?:\|+:?|:?\|+|[-–—]+|\/+|%|\.+|,|\(?x\d+\)?|\(?\d+x\)?|N\.?C\.?)$/i
/** What may follow the chords on a line that's still "just chords": spaces and punctuation. */
const CHORD_LINE_REST = /^[\s.|\-–—:,()x\d/%]*$/i

export function isChordToken(token: string): boolean {
  return CHORD_TOKEN.test(token)
}

/**
 * Where the chords are in a word: a chord ("F#m"), a run of quick changes joined by dots ("B.C♯.E"),
 * or null for an ordinary word. Offsets are within the word.
 */
export function chordPartsOf(word: string): { start: number; end: number }[] | null {
  if (isChordToken(word)) return [{ start: 0, end: word.length }]
  if (!word.includes('.')) return null
  const parts: { start: number; end: number }[] = []
  let at = 0
  for (const piece of word.split('.')) {
    if (piece && !isChordToken(piece)) return null
    if (piece) parts.push({ start: at, end: at + piece.length })
    at += piece.length + 1
  }
  return parts.length ? parts : null
}

// ---------------------------------------------------------------------------------------------
// Reading and writing a line

const COLOR_VALUE = /^(?:#[0-9a-f]{3,8}|[a-z]{3,20})$/i

function attr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))
  return m && COLOR_VALUE.test(m[1]) ? m[1] : undefined
}

const sameStyle = (a: Seg, b: Seg) => a.fg === b.fg && a.bg === b.bg

export function parseLine(line: string): Seg[] {
  const segs: Seg[] = []
  let fg: string | undefined
  let bg: string | undefined
  const push = (seg: Seg) => {
    if (!seg.text) return
    const prev = segs[segs.length - 1]
    if (prev && !prev.chord && !seg.chord && sameStyle(prev, seg)) prev.text += seg.text
    else segs.push(seg)
  }
  let last = 0
  for (const m of line.matchAll(/\[([^\]]*)\]|<span\b([^>]*)>|<\/span\s*>/gi)) {
    const at = m.index ?? 0
    push({ text: line.slice(last, at), fg, bg })
    if (m[0].startsWith('[')) push({ text: m[1], chord: true, fg, bg })
    else if (m[0].startsWith('</')) { fg = undefined; bg = undefined }
    else { fg = attr(m[2], 'foreground') ?? attr(m[2], 'color'); bg = attr(m[2], 'background') }
    last = at + m[0].length
  }
  push({ text: line.slice(last), fg, bg })
  return segs
}

export function serializeLine(segs: Seg[]): string {
  let out = ''
  let i = 0
  while (i < segs.length) {
    const style = segs[i]
    let inner = ''
    while (i < segs.length && sameStyle(segs[i], style)) {
      inner += segs[i].chord ? `[${segs[i].text}]` : segs[i].text
      i++
    }
    if (style.fg || style.bg) {
      const attrs = [style.fg && `foreground="${style.fg}"`, style.bg && `background="${style.bg}"`].filter(Boolean).join(' ')
      out += `<span ${attrs}>${inner}</span>`
    } else {
      out += inner
    }
  }
  return out
}

export const visibleText = (segs: Seg[]) => segs.map(s => s.text).join('')

// ---------------------------------------------------------------------------------------------
// Spotting chords that weren't marked

/**
 * Which plain words on a line are chords, as [start, end) offsets into the line's visible text.
 *
 * Two kinds of line are read as chords without being marked:
 *  - a line of only chords ("G   D   Em", "| C | G |", "F# A B.C#.E"), usually above the lyrics;
 *  - a label, a dash or colon, then only chords ("VERSE - F# E C#", "Intro: C G Am F").
 * Anything else (like lyrics that happen to start with a capital) is left alone.
 */
export function autoChordRanges(segs: Seg[]): [number, number][] {
  const text = visibleText(segs)
  // Which characters are already marked as chords.
  const marked = new Array<boolean>(text.length).fill(false)
  let at = 0
  for (const s of segs) {
    if (s.chord) marked.fill(true, at, at + s.text.length)
    at += s.text.length
  }

  type Tok = { start: number; end: number; kind: 'chord' | 'chordlike' | 'filler' | 'word'; parts?: { start: number; end: number }[] }
  const toks: Tok[] = []
  for (const m of text.matchAll(/\S+/g)) {
    const start = m.index ?? 0
    const word = m[0]
    const end = start + word.length
    if (marked.slice(start, end).some(Boolean)) { toks.push({ start, end, kind: 'chord' }); continue }
    const parts = chordPartsOf(word)
    if (parts) toks.push({ start, end, kind: 'chordlike', parts: parts.map(p => ({ start: start + p.start, end: start + p.end })) })
    else if (FILLER_TOKEN.test(word)) toks.push({ start, end, kind: 'filler' })
    else toks.push({ start, end, kind: 'word' })
  }

  const chordsIn = (list: Tok[]) => list.some(t => t.kind === 'chord' || t.kind === 'chordlike') && !list.some(t => t.kind === 'word')
  let from = -1
  if (chordsIn(toks)) from = 0
  else {
    // A label, then "-" / "–" / ":" (or a word ending in ":"), then only chords.
    const sep = toks.findIndex(t => {
      const w = text.slice(t.start, t.end)
      return /^[-–—:]+$/.test(w) || (t.kind === 'word' && w.endsWith(':'))
    })
    if (sep >= 0 && chordsIn(toks.slice(sep + 1))) from = sep + 1
  }
  if (from < 0) return []
  return toks.slice(from).flatMap(t => (t.kind === 'chordlike' ? t.parts!.map(p => [p.start, p.end] as [number, number]) : []))
}

/** Marks the given [start, end) ranges of visible text as chords, splitting pieces where needed. */
export function markChords(segs: Seg[], ranges: [number, number][]): Seg[] {
  if (!ranges.length) return segs
  const out: Seg[] = []
  let at = 0
  for (const s of segs) {
    const end = at + s.text.length
    if (s.chord) { out.push(s); at = end; continue }
    let cut = at
    for (const [rs, re] of ranges) {
      if (re <= at || rs >= end) continue
      const a = Math.max(rs, at)
      const b = Math.min(re, end)
      if (a > cut) out.push({ ...s, text: s.text.slice(cut - at, a - at) })
      out.push({ ...s, text: s.text.slice(a - at, b - at), chord: true })
      cut = b
    }
    if (cut < end) out.push({ ...s, text: s.text.slice(cut - at) })
    at = end
  }
  return out
}

export function withAutoChords(segs: Seg[]): Seg[] {
  return markChords(segs, autoChordRanges(segs))
}

/** A line whose words are all chords (plus bar lines and such): a chord line above the lyrics. */
export function isChordRow(segs: Seg[]): boolean {
  let chords = 0
  for (const s of segs) {
    if (s.chord) { chords++; continue }
    for (const w of s.text.split(/\s+/)) if (w && !FILLER_TOKEN.test(w)) return false
  }
  return chords > 0
}

/**
 * A line with chords where everything after the first chord is only spaces and punctuation, like
 * "VERSE - [F#] [E] [B].[C#].[E] |". It's shown as written, chords inline, not chords above lyrics.
 */
export function isInlineChordLine(line: string): boolean {
  if (/^\s*\{.*\}\s*$/.test(line)) return false
  const segs = parseLine(line)
  const first = segs.findIndex(s => s.chord)
  if (first < 0) return false
  if (CHORD_LINE_REST.test(segs.slice(first + 1).filter(s => !s.chord).map(s => s.text).join(''))) return true
  // Chords marked among words after a label ("VIOLIN INTRO - [A] [B] [E] then a lick"): none of them sits
  // on a word, so they stay inline. A chord written onto a word ("[G]Amazing") is a chord above lyrics.
  if (!segs.slice(0, first).some(s => s.text.trim())) return false
  return segs.every((s, i) => {
    if (!s.chord) return true
    const next = segs.slice(i + 1).find(n => !n.chord)
    return !next || /^[\s.|,:)\-–—]/.test(next.text) || segs[i + 1]?.chord
  })
}
