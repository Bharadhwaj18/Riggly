import type { ReactNode } from 'react'
import { Wordmark } from '@/components/ui/Wordmark'
import { APP_TAGLINE } from '@/lib/brand'

export const dynamic = 'force-dynamic'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-300 to-brand-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <h1><Wordmark spotlight className="text-5xl text-gray-900" /></h1>
          <p className="text-sm text-gray-500">{APP_TAGLINE}</p>
        </div>
        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
          {children}
        </div>
      </div>
    </div>
  )
}
