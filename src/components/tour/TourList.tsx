'use client'

import { Check, Play } from 'lucide-react'
import { useTour } from './TourProvider'

/** Every tour this person can take, with a Start button each. */
export function TourList() {
  const { available, start } = useTour()
  return (
    <ul className="divide-y divide-brand-100">
      {available.map(t => (
        <li key={t.id} className="flex items-center gap-3 py-3">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
              {t.title}
              {t.done && <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-700"><Check className="h-3 w-3" />Done</span>}
            </span>
            <span className="block text-xs text-gray-500">{t.blurb}</span>
          </span>
          <button type="button" onClick={() => start(t.id)} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-100 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-200">
            <Play className="h-3.5 w-3.5" /> {t.done ? 'Again' : 'Start'}
          </button>
        </li>
      ))}
    </ul>
  )
}
