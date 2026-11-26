'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, Building2, LayoutDashboard, Megaphone, Sun, Users } from 'lucide-react'
import { Wordmark } from '@/components/ui/Wordmark'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/workspaces', label: 'Workspaces', icon: Building2 },
  { href: '/admin/users', label: 'People', icon: Users },
  { href: '/admin/today', label: 'Today', icon: Sun },
  { href: '/admin/announcements', label: 'Announcements', icon: Megaphone },
]

/** The admin dashboard's own navigation: a sidebar on wide screens, a scrolling tab row on phones. */
export function AdminNav({ email }: { email: string }) {
  const path = usePathname()
  const active = (href: string) => href === '/admin' ? path === '/admin' : path.startsWith(href)

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar lg:flex">
        <div className="px-5 pb-2 pt-6">
          <Wordmark tone="sidebar" className="text-2xl" />
          <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-sidebar-muted">Admin</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-3">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}
              className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                active(href) ? 'bg-sidebar-active text-sidebar-active-fg' : 'text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong')}>
              <Icon className="h-[18px] w-[18px] shrink-0" />{label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border px-3 py-3">
          <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong">
            <ArrowLeft className="h-4 w-4" />Back to the app
          </Link>
          <p className="truncate px-3 pt-1 text-xs text-sidebar-muted" title={email}>{email}</p>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-brand-200 bg-brand-50/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="flex items-baseline gap-2"><Wordmark className="text-xl" /><span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-gray-500">Admin</span></span>
          <Link href="/" className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-bold text-brand-700"><ArrowLeft className="h-4 w-4" />App</Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-2">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}
              className={cn('inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-bold',
                active(href) ? 'bg-brand-400 text-white' : 'text-gray-700 hover:bg-brand-100')}>
              <Icon className="h-4 w-4" />{label}
            </Link>
          ))}
        </nav>
      </header>
    </>
  )
}
