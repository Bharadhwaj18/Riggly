'use client'

import { useState } from 'react'
import { Search, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Chip } from '@/components/ui/Chip'
import { cn } from '@/lib/utils'
import type { AdminUser } from '@/lib/admin-data'

const field = 'w-full rounded-xl border border-brand-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400'
const date = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'
const within = (iso: string | null, days: number) => !!iso && Date.now() - Date.parse(iso) < days * 86400000

type Filter = 'all' | 'active' | 'new' | 'unconfirmed' | 'no-band'

/** Every account: who they are, when they joined and last signed in, and which bands they're in. */
export function AdminUsers({ users }: { users: AdminUser[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const q = query.trim().toLowerCase()
  const tests: Record<Filter, (u: AdminUser) => boolean> = {
    all: () => true,
    active: u => within(u.lastSignIn, 7),
    new: u => within(u.createdAt, 7),
    unconfirmed: u => !u.confirmed,
    'no-band': u => u.workspaces.length === 0,
  }
  const labels: Record<Filter, string> = { all: 'All', active: 'Active this week', new: 'New this week', unconfirmed: 'Email not confirmed', 'no-band': 'In no band' }
  const list = users
    .filter(tests[filter])
    .filter(u => !q || [u.email, u.name ?? '', ...u.workspaces.map(w => w.name)].some(t => t.toLowerCase().includes(q)))

  return (
    <div className="space-y-5">
      <PageHeader title="People" subtitle={`${users.length} accounts`} />
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(labels) as Filter[]).map(f => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{labels[f]} {users.filter(tests[f]).length}</Chip>
        ))}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, email or band" aria-label="Search people" className={cn(field, 'pl-9')} />
      </div>

      {list.length === 0 ? <p className="py-6 text-center text-sm text-gray-500">Nobody matches.</p> : (
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="hidden bg-brand-50 text-[11px] font-extrabold uppercase tracking-[0.1em] text-gray-500 md:table-header-group">
              <tr><th className="px-4 py-2.5">Person</th><th className="px-4 py-2.5">Bands</th><th className="px-4 py-2.5">Joined</th><th className="px-4 py-2.5">Last sign-in</th></tr>
            </thead>
            <tbody className="divide-y divide-brand-100">
              {list.map(u => (
                <tr key={u.id} className="flex flex-col gap-1 px-4 py-3 md:table-row md:p-0">
                  <td className="md:px-4 md:py-3">
                    <span className="flex items-center gap-1.5 font-bold text-gray-900">
                      {u.name || 'No name yet'}
                      {u.isAdmin && <ShieldCheck className="h-4 w-4 text-brand-600" aria-label="Platform admin" />}
                    </span>
                    <span className="block truncate text-xs text-gray-500">{u.email}{!u.confirmed && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">Not confirmed</span>}</span>
                  </td>
                  <td className="md:px-4 md:py-3">
                    {u.workspaces.length === 0 ? <span className="text-xs text-gray-400">None</span> : (
                      <span className="flex flex-wrap gap-1">
                        {u.workspaces.map(w => (
                          <span key={w.id} className="rounded-full bg-brand-100 px-2 py-px text-[11px] font-bold text-brand-700">{w.name}{w.role !== 'member' ? ` · ${w.role}` : ''}</span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="text-xs text-gray-600 md:px-4 md:py-3 md:text-sm"><span className="md:hidden">Joined </span>{date(u.createdAt)}</td>
                  <td className="text-xs text-gray-600 md:px-4 md:py-3 md:text-sm"><span className="md:hidden">Last sign-in </span>{date(u.lastSignIn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
