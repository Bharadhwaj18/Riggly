'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, Compass, MapPin, Plus, RotateCcw } from 'lucide-react'
import { resetDemo } from '@/actions/demo'
import { useTour } from '@/components/tour/TourProvider'
import { tourForPath, WALKTHROUGH_ID } from '@/lib/tours'
import { useToast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'

/**
 * A small "Demo" pill in the header while you're in a demo band. Tap it for what the demo is, the tours, starting
 * over, and making your own workspace. Takes no room on the page itself.
 */
export function DemoPill({ align = 'right', tone = 'page' }: { align?: 'left' | 'right'; tone?: 'page' | 'sidebar' }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const { start: startTour, available } = useTour()
  const box = useRef<HTMLDivElement>(null)
  // This page's own tour, if it has one and the person can see that section.
  const pageTourId = tourForPath(pathname)?.id
  const pageTour = available.find(t => t.id === pageTourId && t.id !== WALKTHROUGH_ID)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const tour = (id: string) => { setOpen(false); startTour(id) }
  const reset = () => {
    if (!window.confirm('Start the demo over? Everything you changed in it goes back to the sample data.')) return
    setOpen(false)
    start(async () => {
      const res = await resetDemo()
      if (res.error) { toast(res.error, 'error'); return }
      toast('Demo reset', 'success')
      router.push('/')
      router.refresh()
    })
  }

  const item = 'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-bold text-gray-800 hover:bg-brand-50 disabled:opacity-60'

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-extrabold',
          tone === 'sidebar'
            ? 'border-sidebar-border bg-sidebar-hover text-sidebar-strong'
            : 'border-brand-300 bg-brand-100 text-brand-800',
        )}
      >
        <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
        {pending ? 'Resetting…' : 'Demo'}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Demo"
          className={cn(
            'animate-fade-up absolute top-full z-50 mt-2 w-72 max-w-[calc(100vw-24px)] rounded-2xl border border-brand-200 bg-white p-2 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="text-sm font-extrabold text-gray-900">You’re in a demo band</p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-500">Everything here is sample data, and only you see your changes. Try anything.</p>
          </div>
          <div className="border-t border-brand-100 pt-1">
            <button type="button" role="menuitem" onClick={() => tour(WALKTHROUGH_ID)} className={item}>
              <Compass className="h-4 w-4 text-brand-600" /> Show me around
            </button>
            {pageTour && (
              <button type="button" role="menuitem" onClick={() => tour(pageTour.id)} className={item}>
                <MapPin className="h-4 w-4 text-brand-600" /> Tour of {pageTour.title}
              </button>
            )}
            <button type="button" role="menuitem" onClick={reset} disabled={pending} className={item}>
              <RotateCcw className="h-4 w-4 text-brand-600" /> Start the demo over
            </button>
          </div>
          <Link href="/workspace/new" role="menuitem" onClick={() => setOpen(false)}
            className="mt-1 flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-400 px-3 text-sm font-extrabold text-white hover:bg-brand-500">
            <Plus className="h-4 w-4" /> Create your own workspace
          </Link>
        </div>
      )}
    </div>
  )
}
