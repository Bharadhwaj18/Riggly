'use client'

import { useState, useRef, useEffect } from 'react'
import { useEditor, EditorContent, type Editor, type JSONContent } from '@tiptap/react'
import { Extension, Mark } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { TextStyle, Color, BackgroundColor } from '@tiptap/extension-text-style'
import { UndoRedo, Placeholder } from '@tiptap/extensions'
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Fragment, Slice, type Node as PMNode, type Schema } from '@tiptap/pm/model'
import { Ban, Baseline, Highlighter, Music, RemoveFormatting } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseLine, serializeLine, autoChordRanges, chordPartsOf, type Seg } from '@/lib/chords/line-markup'
import { SECTION_COLORS, sectionType } from '@/lib/chords/blocks'
import { splitPastedSections, type PastedSection } from '@/lib/chords/paste-sections'

const TEXT_COLORS = Object.values(SECTION_COLORS)
const HIGHLIGHTS = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74', '#d8b4fe']
const SAFE_COLOR = /^(?:#[0-9a-f]{3,8}|[a-z]{3,20})$/i

const PLACEHOLDER = `Type chords and words here. Chords are picked up when they're on their own line above the words,
or after a dash or colon:  VERSE - F# E C#
For anything else, select it and tap Chord.`

// ---------------------------------------------------------------------------------------------
// Block text (ChordPro markup, one line per paragraph)  ⇄  editor content

function markupToContent(text: string): JSONContent {
  return {
    type: 'doc',
    content: text.split('\n').map(line => {
      const content = parseLine(line).filter(s => s.text).map(seg => {
        const marks: JSONContent['marks'] = []
        if (seg.chord) marks.push({ type: 'chord' })
        if (seg.fg || seg.bg) marks.push({ type: 'textStyle', attrs: { color: seg.fg ?? null, backgroundColor: seg.bg ?? null } })
        return { type: 'text', text: seg.text, ...(marks.length ? { marks } : {}) }
      })
      return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
    }),
  }
}

function segsOfParagraph(node: { content?: JSONContent[] }): Seg[] {
  return (node.content ?? []).map(n => {
    const style = n.marks?.find(m => m.type === 'textStyle')?.attrs ?? {}
    const fg = typeof style.color === 'string' && SAFE_COLOR.test(style.color) ? style.color : undefined
    const bg = typeof style.backgroundColor === 'string' && SAFE_COLOR.test(style.backgroundColor) ? style.backgroundColor : undefined
    return { text: n.text ?? '', chord: !!n.marks?.some(m => m.type === 'chord'), fg, bg }
  })
}

function contentToMarkup(doc: JSONContent): string {
  return (doc.content ?? []).map(p => serializeLine(segsOfParagraph(p))).join('\n')
}

/** Pasted plain text as editor lines: every line kept (blank ones too) and every space, since chords line up with spaces. */
function plainTextSlice(text: string, schema: Schema): Slice {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[\u00a0\u2007\u202f]/g, ' ') // non-breaking spaces from web pages
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '') // invisible characters
    .split('\n')
  return new Slice(Fragment.from(lines.map(l => schema.nodes.paragraph.create(null, l ? schema.text(l) : null))), 1, 1)
}

// ---------------------------------------------------------------------------------------------
// Editor extensions

/** A chord someone marked by hand. Saved as [F#]. */
const ChordMark = Mark.create({
  name: 'chord',
  inclusive: false,
  parseHTML: () => [{ tag: 'span[data-chord]' }],
  renderHTML: () => ['span', { 'data-chord': '', class: 'chord-mark' }, 0],
})

/** Colours the chords the app spots by itself, as you type, so you can see what it understood. */
const AutoChords = Extension.create({
  name: 'autoChords',
  addProseMirrorPlugins() {
    const build = (state: EditorState) => {
      const decorations: Decoration[] = []
      state.doc.forEach((para: PMNode, offset: number) => {
        const segs: Seg[] = []
        para.forEach(child => segs.push({ text: child.text ?? '', chord: child.marks.some(m => m.type.name === 'chord') }))
        for (const [s, e] of autoChordRanges(segs)) {
          decorations.push(Decoration.inline(offset + 1 + s, offset + 1 + e, { class: 'chord-auto' }))
        }
      })
      return DecorationSet.create(state.doc, decorations)
    }
    return [new Plugin({
      key: new PluginKey('autoChords'),
      state: {
        init: (_, state) => build(state),
        apply: (tr, old, _oldState, newState) => (tr.docChanged ? build(newState) : old),
      },
      props: { decorations(state) { return this.getState(state) } },
    })]
  },
})

// ---------------------------------------------------------------------------------------------
// Several bits selected at once: hold Cmd (Ctrl on Windows), with or without Shift, and select the next
// bit. The bits selected before stay tinted, and Chord, Not a chord, colour and highlight act on all of them.

type Span = { from: number; to: number }
const multiKey = new PluginKey<Span[]>('multiSelect')
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const addsToSelection = (e: MouseEvent | KeyboardEvent) => (isMac() ? e.metaKey : e.ctrlKey)

const MultiSelect = Extension.create({
  name: 'multiSelect',
  addProseMirrorPlugins() {
    const clear = (view: { state: EditorState; dispatch: (tr: EditorState['tr']) => void }) => {
      if (multiKey.getState(view.state)?.length) view.dispatch(view.state.tr.setMeta(multiKey, []))
    }
    return [new Plugin<Span[]>({
      key: multiKey,
      state: {
        init: () => [],
        apply(tr, spans) {
          const set = tr.getMeta(multiKey) as Span[] | undefined
          if (set) return set
          if (!tr.docChanged || !spans.length) return spans
          return spans.map(r => ({ from: tr.mapping.map(r.from), to: tr.mapping.map(r.to) })).filter(r => r.to > r.from)
        },
      },
      props: {
        decorations(state) {
          const spans = multiKey.getState(state) ?? []
          return spans.length ? DecorationSet.create(state.doc, spans.map(r => Decoration.inline(r.from, r.to, { class: 'multi-sel' }))) : null
        },
        handleDOMEvents: {
          mousedown(view, event) {
            if (event.button !== 0) return false
            if (!addsToSelection(event)) { clear(view); return false }
            // Keep what's selected now, and start the next bit fresh where the click is (so Shift
            // doesn't stretch the old selection over to it).
            const spans = multiKey.getState(view.state) ?? []
            const { from, to, empty } = view.state.selection
            const next = empty || spans.some(r => r.from === from && r.to === to) ? spans : [...spans, { from, to }]
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
            let tr = view.state.tr.setMeta(multiKey, next)
            if (at) tr = tr.setSelection(TextSelection.create(tr.doc, at.pos))
            view.dispatch(tr)
            return false
          },
        },
        handleKeyDown(view, event) {
          if (event.key === 'Escape') clear(view)
          return false
        },
        handleTextInput(view) { clear(view); return false },
      },
    })]
  },
})

/** Runs `run` on each bit selected (the extra bits and the current selection), then puts the selection back. */
function forEachSelected(editor: Editor, run: () => number | void): number {
  const extra = multiKey.getState(editor.state) ?? []
  if (!extra.length) return run() || 0
  const { from, to, empty } = editor.state.selection
  const spans = empty ? extra : [...extra, { from, to }]
  let total = 0
  for (const r of spans) {
    editor.commands.setTextSelection(r)
    total += run() || 0
  }
  editor.commands.setTextSelection({ from, to })
  return total
}

// ---------------------------------------------------------------------------------------------
// Marking chords

type Range = { from: number; to: number; word: string }

/** The words the selection touches (or the word at the cursor), with their document positions. */
function wordsInSelection(editor: Editor): Range[] {
  const { state } = editor
  const { from, to, empty, $from } = state.selection
  const words: Range[] = []
  const scan = (para: PMNode, start: number) => {
    for (const m of para.textContent.matchAll(/[^\s,;:|]+/g)) {
      const s = start + (m.index ?? 0)
      const e = s + m[0].length
      if (empty ? from >= s && from <= e : e > from && s < to) words.push({ from: s, to: e, word: m[0] })
    }
  }
  if (empty) scan($from.parent, $from.start())
  else state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'paragraph') return true
    scan(node, pos + 1)
    return false
  })
  return words
}

/** Marks every chord-looking word in the selection as a chord. Returns how many it marked. */
function markChordsInSelection(editor: Editor): number {
  const type = editor.schema.marks.chord
  const tr = editor.state.tr
  let count = 0
  for (const { from, word } of wordsInSelection(editor)) {
    for (const part of chordPartsOf(word) ?? []) {
      tr.addMark(from + part.start, from + part.end, type.create())
      count++
    }
  }
  if (count) editor.view.dispatch(tr)
  return count
}

/** How many chord-looking parts the selection has (`onlyUnmarked`: of those not marked yet). */
function chordPartsInSelection(editor: Editor, onlyUnmarked: boolean): number {
  const type = editor.schema.marks.chord
  let n = 0
  for (const { from, word } of wordsInSelection(editor)) {
    for (const part of chordPartsOf(word) ?? []) {
      if (!onlyUnmarked || !editor.state.doc.rangeHasMark(from + part.start, from + part.end, type)) n++
    }
  }
  return n
}

function unmarkChordsInSelection(editor: Editor) {
  const type = editor.schema.marks.chord
  const { empty, from, to } = editor.state.selection
  const tr = editor.state.tr
  if (empty) for (const w of wordsInSelection(editor)) tr.removeMark(w.from, w.to, type)
  else tr.removeMark(from, to, type)
  editor.view.dispatch(tr)
}

// ---------------------------------------------------------------------------------------------

interface Props {
  value: string
  onChange: (value: string) => void
  label: string
  /** The section's name, to tell whether a pasted chart's first section belongs in this one. */
  heading?: string
  /**
   * A pasted chord sheet had section names in it. `text` is this section's text after the paste,
   * `heading` its new name (if the paste named it), and `sections` the ones to add after it.
   */
  onPasteSections?: (paste: { text: string; heading?: string; sections: PastedSection[] }) => void
}

// Cmd+K is the workspace switcher, and browsers leave Cmd+Shift+K alone.
const shortcutLabel = () => (isMac() ? '⌘⇧K' : 'Ctrl+Shift+K')

/** One section's chords and words: typed straight into, with chord marking, colours and highlights. */
export function RichBlockEditor({ value, onChange, label, heading = '', onPasteSections }: Props) {
  const [palette, setPalette] = useState<'text' | 'highlight' | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChangeRef = useRef(onChange)
  const pasteRef = useRef({ onPasteSections, heading })
  const shortcutRef = useRef<() => void>(() => {})
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { pasteRef.current = { onPasteSections, heading } }, [onPasteSections, heading])
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current) }, [])

  const editor = useEditor({
    // Rendered on the client only (the editor is shown once the chart is unlocked).
    immediatelyRender: false,
    extensions: [
      Document, Paragraph, Text, TextStyle, Color, BackgroundColor, UndoRedo, ChordMark, AutoChords, MultiSelect,
      Placeholder.configure({ placeholder: PLACEHOLDER }),
    ],
    content: markupToContent(value),
    editorProps: {
      attributes: {
        class: 'rich-chart min-h-9 px-3 py-1.5 font-mono text-sm leading-normal text-gray-900 focus:outline-none',
        'aria-label': label,
        spellcheck: 'false',
      },
      // Pasted text keeps every line, blank ones included, and every space (chords line up with spaces).
      clipboardTextParser: (text, _context, _plain, view) => plainTextSlice(text, view.state.schema),
      // A copy from a website (Ultimate Guitar, a chords blog…) also carries the page's HTML, and reading
      // that squashes the spaces chords are lined up with and can join lines. Use its plain text instead.
      // A copy from another section of this app is still pasted as is, keeping chords and colours.
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain')
        const html = event.clipboardData?.getData('text/html') ?? ''
        if (!text || html.includes('data-pm-slice')) return false
        const { schema } = view.state
        const split = pasteRef.current.onPasteSections ? splitPastedSections(text) : { before: text, sections: [] }
        if (!split.sections.length) {
          view.dispatch(view.state.tr.replaceSelection(plainTextSlice(text, schema)).scrollIntoView())
          return true
        }
        // A whole chord sheet with section names: each section gets a card of its own. Lines before the
        // first name go where the paste was; an empty section takes the first one.
        let sections = split.sections
        let newHeading: string | undefined
        let insert = split.before
        const own = pasteRef.current.heading.trim()
        if (!insert && !view.state.doc.textContent && (!own || sectionType(own) === sectionType(sections[0].heading))) {
          insert = sections[0].text
          if (!own) newHeading = sections[0].heading
          sections = sections.slice(1)
        }
        if (insert) view.dispatch(view.state.tr.replaceSelection(plainTextSlice(insert, schema)))
        pasteRef.current.onPasteSections?.({ text: contentToMarkup(view.state.doc.toJSON()), heading: newHeading, sections })
        return true
      },
      handleKeyDown: (_view, event) => {
        // Cmd+Shift+K (Ctrl+Shift+K on Windows) marks the selected chords, or unmarks them if they're marked.
        if ((isMac() ? event.metaKey : event.ctrlKey) && event.shiftKey && !event.altKey && event.code === 'KeyK') {
          event.preventDefault()
          event.stopPropagation() // not the workspace switcher's Cmd+K
          shortcutRef.current()
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(contentToMarkup(e.getJSON())),
  })

  useEffect(() => {
    if (editor && !editor.isDestroyed && contentToMarkup(editor.getJSON()) !== value) {
      editor.commands.setContent(markupToContent(value), { emitUpdate: false })
    }
  }, [editor, value])

  const flash = (text: string) => {
    setHint(text)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHint(null), 2500)
  }

  const markChords = () => {
    if (!editor) return
    const n = forEachSelected(editor, () => markChordsInSelection(editor))
    flash(n ? `Marked ${n} chord${n === 1 ? '' : 's'}` : 'Nothing there looks like a chord (A–G, then #, b, m, 7…)')
    editor.commands.focus()
  }
  const unmarkChords = () => {
    if (!editor) return
    forEachSelected(editor, () => unmarkChordsInSelection(editor))
    editor.commands.focus()
  }
  /** Colour, highlight or clear every selected bit. */
  const style = (apply: (e: Editor) => void) => {
    if (!editor) return
    forEachSelected(editor, () => apply(editor))
    editor.commands.focus()
  }
  useEffect(() => {
    shortcutRef.current = () => {
      if (!editor) return
      const parts = forEachSelected(editor, () => chordPartsInSelection(editor, false))
      const unmarked = forEachSelected(editor, () => chordPartsInSelection(editor, true))
      if (parts && !unmarked) { unmarkChords(); flash('Unmarked') } else markChords()
    }
  })

  const tool = 'flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  // Keep the text selection when a toolbar button is pressed.
  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault()

  return (
    // The toolbar only shows on the section being typed in, so the others stay short.
    <div className="group/rich">
      <div className="hidden flex-wrap items-center gap-0.5 border-b border-brand-100 px-2 py-1 group-focus-within/rich:flex">
        <button type="button" onMouseDown={keep} onClick={markChords} className={cn(tool, 'text-brand-700')} title={`Mark the selected chords (${shortcutLabel()} marks or unmarks)`}>
          <Music className="h-3.5 w-3.5" /> Chord <kbd className="hidden font-sans text-[10px] font-semibold text-gray-400 sm:inline">{shortcutLabel()}</kbd>
        </button>
        <button type="button" onMouseDown={keep} onClick={unmarkChords} className={tool} title="Unmark chords marked by hand">
          Not a chord
        </button>
        <span className="mx-1 h-5 w-px bg-brand-100" aria-hidden />
        <button type="button" onMouseDown={keep} onClick={() => setPalette(p => (p === 'text' ? null : 'text'))} aria-expanded={palette === 'text'} className={tool} title="Text colour">
          <Baseline className="h-4 w-4" /> <span className="hidden sm:inline">Colour</span>
        </button>
        <button type="button" onMouseDown={keep} onClick={() => setPalette(p => (p === 'highlight' ? null : 'highlight'))} aria-expanded={palette === 'highlight'} className={tool} title="Highlight">
          <Highlighter className="h-4 w-4" /> <span className="hidden sm:inline">Highlight</span>
        </button>
        <button type="button" onMouseDown={keep} onClick={() => style(e => e.chain().unsetColor().unsetBackgroundColor().run())} className={tool} title="Remove colour and highlight" aria-label="Remove colour and highlight">
          <RemoveFormatting className="h-4 w-4" />
        </button>
        {hint && <span role="status" className="ml-1 text-xs font-semibold text-gray-500">{hint}</span>}
      </div>

      {palette && (
        <div className="hidden flex-wrap items-center gap-2 border-b border-brand-100 px-3 py-2 group-focus-within/rich:flex">
          <span className="mr-1 text-xs font-bold text-gray-500">{palette === 'text' ? 'Text colour:' : 'Highlight:'}</span>
          {(palette === 'text' ? TEXT_COLORS : HIGHLIGHTS).map(c => (
            <button
              key={c}
              type="button"
              onMouseDown={keep}
              onClick={() => {
                if (palette === 'text') style(e => e.chain().setColor(c).run())
                else style(e => e.chain().setBackgroundColor(c).run())
                setPalette(null)
              }}
              aria-label={`${palette === 'text' ? 'Colour' : 'Highlight'} ${c}`}
              className="h-7 w-7 rounded-full border border-black/10"
              style={{ background: c }}
            />
          ))}
          <button
            type="button"
            onMouseDown={keep}
            onClick={() => {
              if (palette === 'text') style(e => e.chain().unsetColor().run())
              else style(e => e.chain().unsetBackgroundColor().run())
              setPalette(null)
            }}
            aria-label={palette === 'text' ? 'No colour' : 'No highlight'}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-brand-200 text-gray-400 hover:text-gray-700"
          >
            <Ban className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
