'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Compass, RotateCcw, Sparkles } from 'lucide-react'
import { resetDemo } from '@/actions/demo'
import { useTour } from '@/components/tour/TourProvider'
import { tourForPath } from '@/lib/tours'
import { useToast } from '@/components/ui/Toaster'

/** Shown across the top while you're in a demo band: what it is, how to start over, and how to make your own. */
export function DemoBanner() {
  const [pending, start] = useTransition()
  const router = useRouter()
  const toast = useToast()
  const { start: startTour } = useTour()
  const pathname = usePathname()
  // The tour for this page, or the getting-around one.
  const showMeAround = () => startTour(tourForPath(pathname)?.id ?? 'today')

  const reset = () => {
    if (!window.confirm('Start the demo over? Everything you changed in it goes back to the sample data.')) return
    start(async () => {
      const res = await resetDemo()
      if (res.error) { toast(res.error, 'error'); return }
      toast('Demo reset', 'success')
      router.push('/')
      router.refresh()
    })
  }

  return (
    <div role="note" className="mb-4 flex flex-col gap-2 rounded-2xl border border-brand-300 bg-brand-100 px-4 py-3 text-sm text-gray-900 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        <span><strong>This is a demo band.</strong> Everything here is sample data, and only you see your changes. Try anything.</span>
      </p>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-6 sm:pl-0">
        <button type="button" onClick={showMeAround} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-200">
          <Compass className="h-3.5 w-3.5" /> Show me around
        </button>
        <button type="button" onClick={reset} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-200 disabled:opacity-60">
          <RotateCcw className="h-3.5 w-3.5" /> {pending ? 'Resetting…' : 'Reset demo'}
        </button>
        <Link href="/workspace/new" className="rounded-lg bg-brand-400 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-500">
          Create your own workspace
        </Link>
      </div>
    </div>
  )
}
