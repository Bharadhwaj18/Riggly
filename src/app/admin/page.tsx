import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { adminOverview, adminUsers, adminWorkspaces } from '@/lib/admin-data'
import { cn } from '@/lib/utils'

const card = 'rounded-2xl border border-brand-200 bg-white p-5 shadow-sm'
const eyebrow = 'text-[11px] font-extrabold uppercase tracking-[0.12em] text-gray-500'
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

function Stat({ label, value, note, href }: { label: string; value: number; note?: string; href?: string }) {
  const body = (
    <>
      <p className={eyebrow}>{label}</p>
      <p className="mt-1 font-display text-3xl font-bold text-gray-900">{value.toLocaleString('en-IN')}</p>
      {note && <p className="mt-0.5 text-xs font-semibold text-gray-500">{note}</p>}
    </>
  )
  return href
    ? <Link href={href} className={cn(card, 'block transition-colors hover:border-brand-300')}>{body}</Link>
    : <div className={card}>{body}</div>
}

/** Admin overview: counts only, never a band's content. */
export default async function AdminOverviewPage() {
  const [o, workspaces, users] = await Promise.all([adminOverview(), adminWorkspaces(), adminUsers()])
  const bands = workspaces.filter(w => w.type !== 'personal' && !w.demo)
  const maxDay = Math.max(1, ...o.signups_by_day.map(d => d.n))
  const plans = Object.entries(o.plans).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" subtitle="How Riggly is doing. Counts only: no band's songs, money or notes are read here." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="People" value={o.users} note={`${o.confirmed} confirmed email`} href="/admin/users" />
        <Stat label="Band workspaces" value={o.bands} note={`${o.bands_7d} new this week`} href="/admin/workspaces" />
        <Stat label="Active this week" value={o.active_7d} note={`${o.active_30d} in 30 days`} />
        <Stat label="New this week" value={o.signups_7d} note={`${o.signups_30d} in 30 days`} />
        <Stat label="Demos" value={o.demos} />
        <Stat label="Personal spaces" value={o.personal} />
        <Stat label="Paused" value={o.paused} href="/admin/workspaces" />
        <Stat label="Live announcements" value={o.announcements_live} href="/admin/announcements" />
      </div>

      <section className={card}>
        <div className="flex items-baseline justify-between">
          <h2 className={eyebrow}>Sign-ups, last 30 days</h2>
          <span className="text-xs font-semibold text-gray-500">{o.signups_30d} total</span>
        </div>
        <div className="mt-4 flex h-32 items-end gap-[3px]" role="img" aria-label={`Sign-ups per day over the last 30 days, ${o.signups_30d} in total`}>
          {o.signups_by_day.map(d => (
            <div key={d.day} title={`${day(d.day)}: ${d.n}`} className="flex h-full flex-1 items-end">
              <div className={cn('w-full rounded-t', d.n ? 'bg-brand-400' : 'bg-brand-100')} style={{ height: `${Math.max(4, (d.n / maxDay) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-gray-500">
          <span>{day(o.signups_by_day[0]?.day ?? new Date().toISOString())}</span><span>Today</span>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={card}>
          <h2 className={eyebrow}>Plans</h2>
          {plans.length === 0 ? <p className="mt-2 text-sm text-gray-500">No band workspaces yet.</p> : (
            <ul className="mt-3 space-y-2">
              {plans.map(([plan, n]) => (
                <li key={plan} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 font-bold capitalize text-gray-900">{plan}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100"><span className="block h-full rounded-full bg-brand-400" style={{ width: `${(n / Math.max(1, o.bands)) * 100}%` }} /></span>
                  <span className="w-8 text-right font-semibold text-gray-600">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={card}>
          <div className="flex items-center justify-between"><h2 className={eyebrow}>Newest bands</h2><Link href="/admin/workspaces" className="text-xs font-bold text-brand-700">All <ArrowRight className="inline h-3 w-3" /></Link></div>
          <ul className="mt-3 space-y-2.5">
            {bands.slice(0, 5).map(w => (
              <li key={w.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-bold text-gray-900">{w.name}</span>
                <span className="shrink-0 text-xs text-gray-500">{w.members} · {day(w.createdAt)}</span>
              </li>
            ))}
            {bands.length === 0 && <li className="text-sm text-gray-500">None yet.</li>}
          </ul>
        </section>

        <section className={card}>
          <div className="flex items-center justify-between"><h2 className={eyebrow}>Newest people</h2><Link href="/admin/users" className="text-xs font-bold text-brand-700">All <ArrowRight className="inline h-3 w-3" /></Link></div>
          <ul className="mt-3 space-y-2.5">
            {users.slice(0, 5).map(u => (
              <li key={u.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-bold text-gray-900">{u.name || u.email}</span>
                <span className="shrink-0 text-xs text-gray-500">{day(u.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
