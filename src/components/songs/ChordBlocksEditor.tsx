'use client'

import { useId, useState } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Ban, ClipboardCopy, Copy, GripVertical, Palette, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RichBlockEditor } from './RichBlockEditor'
import { newBlockId, sectionType, SECTION_COLORS, type ChartBlock, type SectionColor } from '@/lib/chords/blocks'
import type { PastedSection } from '@/lib/chords/paste-sections'

const SECTION_NAMES = ['Intro', 'Verse 1', 'Verse 2', 'Pre-chorus', 'Chorus', 'Bridge', 'Solo', 'Interlude', 'Outro']


interface Props {
  blocks: ChartBlock[]
  onChange: (blocks: ChartBlock[]) => void
  /** Heading colour per section type ("verse" → "blue"). */
  colors: Record<string, SectionColor>
  /** Sets (or clears) the colour for every section of one type. */
  onColorChange: (type: string, color: SectionColor | undefined) => void
}

/** The unlocked song chart: one card per section, typed straight into, dragged into a new order. */
export function ChordBlocksEditor({ blocks, onChange, colors, onColorChange }: Props) {
  const listId = useId()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const update = (id: string, patch: Partial<ChartBlock>) =>
    onChange(blocks.map(b => (b.id === id ? { ...b, ...patch } : b)))
  const move = (index: number, by: number) => {
    const to = index + by
    if (to < 0 || to >= blocks.length) return
    onChange(arrayMove(blocks, index, to))
  }
  const duplicate = (index: number) => {
    const copy = { ...blocks[index], id: newBlockId() }
    onChange([...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)])
  }
  const remove = (index: number) => {
    const b = blocks[index]
    if ((b.text.trim() || b.heading.trim()) && !window.confirm(`Delete ${b.heading.trim() ? `“${b.heading.trim()}”` : 'this section'}?`)) return
    onChange(blocks.filter((_, i) => i !== index))
  }
  const add = () => onChange([...blocks, { id: newBlockId(), heading: '', text: '' }])
  /** A pasted chord sheet with section names: this section's new text, and a card for each section after it. */
  const pasteSections = (index: number, paste: { text: string; heading?: string; sections: PastedSection[] }) => {
    const current = { ...blocks[index], text: paste.text, ...(paste.heading !== undefined ? { heading: paste.heading } : {}) }
    const added = paste.sections.map(s => ({ id: newBlockId(), heading: s.heading, text: s.text }))
    onChange([...blocks.slice(0, index), current, ...added, ...blocks.slice(index + 1)])
  }
  /** For an empty section, other sections of the same kind it could copy ("Chorus 2" → "Chorus 1"). */
  const copySources = (block: ChartBlock): ChartBlock[] => {
    const type = sectionType(block.heading)
    if (!type || block.text.trim()) return []
    const seen = new Set<string>()
    return blocks.filter(b => {
      if (b.id === block.id || sectionType(b.heading) !== type || !b.text.trim() || seen.has(b.text)) return false
      seen.add(b.text)
      return true
    }).slice(0, 3)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = blocks.findIndex(b => b.id === active.id)
    const to = blocks.findIndex(b => b.id === over.id)
    onChange(arrayMove(blocks, from, to))
  }

  return (
    <div className="space-y-2">
      <datalist id={`${listId}-names`}>
        {SECTION_NAMES.map(n => <option key={n} value={n} />)}
      </datalist>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((block, i) => (
            <BlockCard
              key={block.id}
              block={block}
              index={i}
              count={blocks.length}
              namesListId={`${listId}-names`}
              color={colors[sectionType(block.heading)]}
              onColor={c => onColorChange(sectionType(block.heading), c)}
              onChange={patch => update(block.id, patch)}
              onMove={by => move(i, by)}
              onDuplicate={() => duplicate(i)}
              onRemove={() => remove(i)}
              copyFrom={copySources(block)}
              onPasteSections={paste => pasteSections(i, paste)}
            />
          ))}
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-brand-200 py-2 text-sm font-bold text-gray-500 hover:border-brand-400 hover:text-gray-800"
      >
        <Plus className="h-4 w-4" /> Add section
      </button>

      <p className="px-1 text-xs leading-relaxed text-gray-400">
        Chords on their own line above the words, or after a dash or colon (VERSE - F# E C#), are picked up
        by themselves and turn the chord colour. Tap into a section for the Chord, colour and highlight tools.
        Paste a whole chord sheet and it&rsquo;s split into sections at their names ([Verse 1], Chorus:…).
      </p>
    </div>
  )
}

interface CardProps {
  block: ChartBlock
  index: number
  count: number
  namesListId: string
  color: SectionColor | undefined
  onColor: (color: SectionColor | undefined) => void
  onChange: (patch: Partial<ChartBlock>) => void
  onMove: (by: number) => void
  onDuplicate: () => void
  onRemove: () => void
  copyFrom: ChartBlock[]
  onPasteSections: (paste: { text: string; heading?: string; sections: PastedSection[] }) => void
}

const iconButton = 'flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent'

function BlockCard({ block, index, count, namesListId, color, onColor, onChange, onMove, onDuplicate, onRemove, copyFrom, onPasteSections }: CardProps) {
  const [picking, setPicking] = useState(false)
  const type = sectionType(block.heading)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...(color ? { borderLeftColor: SECTION_COLORS[color], borderLeftWidth: 5 } : {}),
      }}
      className={cn(
        'rounded-xl border border-brand-200 bg-white focus-within:border-brand-400',
        isDragging && 'drag-lifted relative z-10 opacity-90 ring-2 ring-brand-400',
      )}
    >
      <div className="flex items-center gap-0.5 border-b border-brand-100 px-1.5 py-0.5">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-7 w-6 cursor-grab touch-none items-center justify-center text-gray-300 hover:text-gray-600 active:cursor-grabbing"
          aria-label="Drag to move this section"
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <input
          value={block.heading}
          onChange={e => onChange({ heading: e.target.value })}
          list={namesListId}
          placeholder="Section name (Verse, Chorus…)"
          aria-label="Section name"
          className="min-w-0 flex-1 bg-transparent px-1 py-1 text-xs font-extrabold uppercase tracking-[0.1em] text-gray-700 placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal placeholder:text-gray-400 focus:outline-none"
          style={color ? { color: SECTION_COLORS[color] } : undefined}
        />
        <button
          type="button"
          className={iconButton}
          onClick={() => setPicking(p => !p)}
          disabled={!type}
          aria-expanded={picking}
          aria-label={type ? `Colour for every ${type}` : 'Name the section to give it a colour'}
          title={type ? `Colour for every “${type}”` : 'Name the section to give it a colour'}
        >
          {color
            ? <span className="h-4 w-4 rounded-full" style={{ background: SECTION_COLORS[color] }} />
            : <Palette className="h-4 w-4" />}
        </button>
        <button type="button" className={iconButton} onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
        <button type="button" className={iconButton} onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
        <button type="button" className={iconButton} onClick={onDuplicate} aria-label="Duplicate section"><Copy className="h-4 w-4" /></button>
        <button type="button" className={cn(iconButton, 'hover:text-red-600')} onClick={onRemove} aria-label="Delete section"><Trash2 className="h-4 w-4" /></button>
      </div>
      {picking && type && (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-100 px-3 py-2">
          <span className="mr-1 text-xs font-bold text-gray-500">Every “{type}”:</span>
          {(Object.keys(SECTION_COLORS) as SectionColor[]).map(c => (
            <button
              key={c}
              type="button"
              onClick={() => { onColor(c); setPicking(false) }}
              aria-label={c}
              aria-pressed={color === c}
              className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-white', color === c && 'ring-2 ring-gray-900')}
              style={{ background: SECTION_COLORS[c] }}
            />
          ))}
          <button
            type="button"
            onClick={() => { onColor(undefined); setPicking(false) }}
            aria-label="No colour"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-brand-200 text-gray-400 hover:text-gray-700"
          >
            <Ban className="h-4 w-4" />
          </button>
        </div>
      )}
      {copyFrom.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-brand-100 px-3 py-1.5">
          <span className="text-xs font-semibold text-gray-500">Same as before?</span>
          {copyFrom.map(src => (
            <button
              key={src.id}
              type="button"
              onClick={() => onChange({ text: src.text, ...(src.kind ? { kind: src.kind } : {}) })}
              className="flex h-7 items-center gap-1 rounded-lg border border-brand-200 px-2 text-xs font-bold text-gray-700 hover:border-brand-400 hover:bg-gray-50"
            >
              <ClipboardCopy className="h-3.5 w-3.5" /> Copy {src.heading.trim()}
            </button>
          ))}
        </div>
      )}
      <RichBlockEditor
        value={block.text}
        onChange={text => onChange({ text })}
        label={`${block.heading.trim() || 'Section'} chords and words`}
        heading={block.heading}
        onPasteSections={onPasteSections}
      />
    </div>
  )
}
