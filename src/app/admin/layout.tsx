import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { requireAdmin } from '@/lib/admin-data'
import { APP_NAME } from '@/lib/brand'

export const metadata: Metadata = { title: `Admin · ${APP_NAME}`, robots: { index: false, follow: false } }

/** The platform admin dashboard: its own screen, apart from any band. Anyone who isn't a platform admin gets "not found". */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await requireAdmin()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <AdminNav email={user?.email ?? ''} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-10">{children}</div>
      </main>
    </div>
  )
}
