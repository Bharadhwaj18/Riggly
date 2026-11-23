'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, ChevronDown } from 'lucide-react'
import { setShowStatus } from '@/actions/shows'
import { useToast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'
import { BOOKING_STATUSES } from '@/types/shows'

const BOOKED = ['Confirmed', 'Advance Received', 'Completed']
const tone = (s: string | null) =>
  !s ? 'border border-dashed border-gray-300 text-gray-500' : BOOKED.includes(s) ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'

/** The status after this one, for the one-tap "Move to …" button. Null at the end. */
export const nextStatus = (s: string | null): string | null => {
  if (!s) return BOOKING_STATUSES[0]
  const i = (BOOKING_STATUSES as readonly string[]).indexOf(s)
  return i >= 0 && i < BOOKING_STATUSES.length - 1 ? BOOKING_STATUSES[i + 1] : null
}

const CANT_EDIT = 'Only members who can edit Shows can change the status.'

/**
 * A show's booking status as a tappable pill: pick any status from the menu, and it saves straight away.
 * `showNext` adds a "Move to …" button for the usual next step.
 */
export function ShowStatusMenu({ showId, status, canEdit, showNext = false, className }: {
  showId: string
  status: string | null
  canEdit: boolean
  showNext?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  // Shown straight away; rolled back if saving fails.
  const [current, setCurrent] = useState(status)
  const [pending, startTransition] = useTransition()
  const toast = useToast()
  const router = useRouter()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const change = (to: string | null) => {
    setOpen(false)
    if (to === current) return
    const before = current
    setCurrent(to)
    startTransition(async () => {
      const res = await setShowStatus(showId, to)
      if (res.error) { setCurrent(before); toast(res.error, 'error'); return }
      toast(to ? `Moved to ${to}` : 'Status cleared', 'success')
      router.refresh()
    })
  }

  const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation() }
  const next = nextStatus(current)

  return (
    <div ref={box} data-tour="show-status" className={cn('relative inline-flex items-center gap-1.5', className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Status: ${current ?? 'none'}. Change status`}
        onClick={e => { stop(e); if (!canEdit) { toast(CANT_EDIT, 'error'); return } setOpen(o => !o) }}
        className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-opacity', tone(current), pending && 'opacity-60')}
      >
        {current ?? 'Set status'}
        {canEdit && <ChevronDown className="h-3 w-3" />}
      </button>

      {showNext && canEdit && next && (
        <button
          type="button"
          onClick={e => { stop(e); change(next) }}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-white px-2.5 py-0.5 text-xs font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
        >
          Move to {next} <ArrowRight className="h-3 w-3" />
        </button>
      )}

      {open && (
        <div role="menu" onClick={e => e.stopPropagation()} className="absolute left-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-xl border border-brand-200 bg-white py-1 shadow-lg">
          {BOOKING_STATUSES.map(s => (
            <button key={s} type="button" role="menuitemradio" aria-checked={current === s} onClick={e => { stop(e); change(s) }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-900 hover:bg-brand-50">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', BOOKED.includes(s) ? 'bg-emerald-500' : 'bg-amber-500')} />
              <span className="flex-1">{s}</span>
              {current === s && <Check className="h-4 w-4 text-brand-600" />}
            </button>
          ))}
          {current && (
            <button type="button" role="menuitem" onClick={e => { stop(e); change(null) }}
              className="flex w-full items-center gap-2 border-t border-brand-100 px-3 py-2.5 text-left text-xs font-semibold text-gray-500 hover:bg-brand-50">
              Clear status
            </button>
          )}
        </div>
      )}
    </div>
  )
}
