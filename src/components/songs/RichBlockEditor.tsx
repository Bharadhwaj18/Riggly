'use client'

import { useState, useRef, useEffect } from 'react'
import { useEditor, EditorContent, type Editor, type JSONContent } from '@tiptap/react'
import { Extension, Mark } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { TextStyle, Color, BackgroundColor } from '@tiptap/extension-text-style'
import { UndoRedo, Placeholder } from '@tiptap/extensions'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model'
import { Ban, Baseline, Highlighter, Music, RemoveFormatting } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseLine, serializeLine, autoChordRanges, chordPartsOf, type Seg } from '@/lib/chords/line-markup'
import { SECTION_COLORS } from '@/lib/chords/blocks'

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
}

/** One section's chords and words: typed straight into, with chord marking, colours and highlights. */
export function RichBlockEditor({ value, onChange, label }: Props) {
  const [palette, setPalette] = useState<'text' | 'highlight' | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current) }, [])

  const editor = useEditor({
    // Rendered on the client only (the editor is shown once the chart is unlocked).
    immediatelyRender: false,
    extensions: [
      Document, Paragraph, Text, TextStyle, Color, BackgroundColor, UndoRedo, ChordMark, AutoChords,
      Placeholder.configure({ placeholder: PLACEHOLDER }),
    ],
    content: markupToContent(value),
    editorProps: {
      attributes: {
        class: 'rich-chart min-h-24 px-4 py-3 font-mono text-sm leading-relaxed text-gray-900 focus:outline-none',
        'aria-label': label,
        spellcheck: 'false',
      },
      // Pasted text keeps every line, blank ones included, and every space (chords line up with spaces).
      clipboardTextParser: (text, _context, _plain, view) => {
        const { schema } = view.state
        const lines = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')
        return new Slice(Fragment.from(lines.map(l => schema.nodes.paragraph.create(null, l ? schema.text(l) : null))), 1, 1)
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(contentToMarkup(e.getJSON())),
  })

  const flash = (text: string) => {
    setHint(text)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHint(null), 2500)
  }

  const markChords = () => {
    if (!editor) return
    const n = markChordsInSelection(editor)
    flash(n ? `Marked ${n} chord${n === 1 ? '' : 's'}` : 'Nothing there looks like a chord (A–G, then #, b, m, 7…)')
    editor.commands.focus()
  }

  const tool = 'flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  // Keep the text selection when a toolbar button is pressed.
  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault()

  return (
    <div>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-brand-100 px-2 py-1">
        <button type="button" onMouseDown={keep} onClick={markChords} className={cn(tool, 'text-brand-700')} title="Mark the selected chords">
          <Music className="h-3.5 w-3.5" /> Chord
        </button>
        <button type="button" onMouseDown={keep} onClick={() => { if (editor) { unmarkChordsInSelection(editor); editor.commands.focus() } }} className={tool} title="Unmark chords marked by hand">
          Not a chord
        </button>
        <span className="mx-1 h-5 w-px bg-brand-100" aria-hidden />
        <button type="button" onMouseDown={keep} onClick={() => setPalette(p => (p === 'text' ? null : 'text'))} aria-expanded={palette === 'text'} className={tool} title="Text colour">
          <Baseline className="h-4 w-4" /> <span className="hidden sm:inline">Colour</span>
        </button>
        <button type="button" onMouseDown={keep} onClick={() => setPalette(p => (p === 'highlight' ? null : 'highlight'))} aria-expanded={palette === 'highlight'} className={tool} title="Highlight">
          <Highlighter className="h-4 w-4" /> <span className="hidden sm:inline">Highlight</span>
        </button>
        <button type="button" onMouseDown={keep} onClick={() => editor?.chain().focus().unsetColor().unsetBackgroundColor().run()} className={tool} title="Remove colour and highlight" aria-label="Remove colour and highlight">
          <RemoveFormatting className="h-4 w-4" />
        </button>
        {hint && <span role="status" className="ml-1 text-xs font-semibold text-gray-500">{hint}</span>}
      </div>

      {palette && (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-100 px-3 py-2">
          <span className="mr-1 text-xs font-bold text-gray-500">{palette === 'text' ? 'Text colour:' : 'Highlight:'}</span>
          {(palette === 'text' ? TEXT_COLORS : HIGHLIGHTS).map(c => (
            <button
              key={c}
              type="button"
              onMouseDown={keep}
              onClick={() => {
                if (palette === 'text') editor?.chain().focus().setColor(c).run()
                else editor?.chain().focus().setBackgroundColor(c).run()
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
              if (palette === 'text') editor?.chain().focus().unsetColor().run()
              else editor?.chain().focus().unsetBackgroundColor().run()
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
