import Link from 'next/link'
import { ListMusic } from 'lucide-react'
import { formatGuestDate } from '@/lib/setlist-guest'

/** What a setlist guest sees once their last day has passed. */
export function GuestEnded({ workspaceName, accessUntil }: { workspaceName: string; accessUntil: string | null }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center py-8">
      <div className="w-full max-w-md rounded-3xl border border-brand-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600"><ListMusic className="h-7 w-7" /></span>
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-gray-500">Access ended</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-gray-900">Thanks for playing along</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-gray-500">
          Your access to {workspaceName}’s setlists ended{accessUntil ? ` on ${formatGuestDate(accessUntil)}` : ''}. If you need them again, ask whoever invited you.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/choose-workspace" className="rounded-xl border border-brand-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 hover:bg-brand-50">
            Switch workspace
          </Link>
        </div>
      </div>
    </div>
  )
}
