import Link from 'next/link'
import { PauseCircle } from 'lucide-react'
import { APP_NAME } from '@/lib/brand'

/** What members see while Riggly's admin has paused their workspace. Their data stays as it is. */
export function WorkspacePaused({ workspaceName }: { workspaceName: string }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center py-8">
      <div className="w-full max-w-md rounded-3xl border border-brand-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700"><PauseCircle className="h-7 w-7" /></span>
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-gray-500">Paused</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-gray-900">{workspaceName} is paused</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-gray-500">
          {APP_NAME} has paused this workspace for now. Nothing in it has been deleted. Ask your band&rsquo;s owner, or reply to any email from {APP_NAME}.
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
