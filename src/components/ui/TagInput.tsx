'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { addTag } from '@/lib/song-tags'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  /** Tags already used elsewhere, offered as one-tap picks (most used first). */
  known?: string[]
  placeholder?: string
  id?: string
}

/** Chips with a box to type more: Enter or comma adds, and the known tags below add with a tap. */
export function TagInput({ value, onChange, known = [], placeholder = 'Add a tag…', id }: TagInputProps) {
  const [text, setText] = useState('')

  const commit = (raw: string) => {
    let next = value
    for (const part of raw.split(',')) next = addTag(next, part, known)
    if (next !== value) onChange(next)
    setText('')
  }
  const picks = known.filter(k => !value.some(v => v.toLowerCase() === k.toLowerCase())).slice(0, 12)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-brand-200 bg-white px-2 py-1.5 focus-within:border-brand-400 focus-within:ring-1 focus-within:ring-brand-400">
        {value.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-0.5 pl-2.5 pr-1 text-xs font-bold text-brand-700">
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter(t => t !== tag))} className="rounded-full p-0.5 hover:bg-brand-200">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={e => (e.target.value.includes(',') ? commit(e.target.value) : setText(e.target.value))}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(text) }
            else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => text.trim() && commit(text)}
          placeholder={value.length ? '' : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
        />
      </div>
      {picks.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {picks.map(tag => (
            <button key={tag} type="button" onClick={() => onChange(addTag(value, tag, known))} className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-brand-100 hover:text-brand-700">
              <Plus className="h-3 w-3" /> {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
