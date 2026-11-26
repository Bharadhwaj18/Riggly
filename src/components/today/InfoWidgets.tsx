import { Megaphone, Newspaper, Quote, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { APP_NAME } from '@/lib/brand'
import { DEFAULT_TODAY, type TodayContent } from '@/lib/today-config'

/** A small label that says which section a widget belongs to (or that it's app-wide info). */
export function SectionTag({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-600">{label}</span>
  )
}

export interface InfoCard { id: string; node: ReactNode }

/**
 * App-wide cards used to fill the gaps on Today. They're shown after the member's own widgets, so
 * the screen is never half empty. News and reviews are sample copy until real feeds exist.
 */
export function infoCards(today: string, c: TodayContent): InfoCard[] {
  const dayIndex = Math.floor(Date.parse(today + 'T00:00:00Z') / 86400000)
  const review = c.reviews.length ? c.reviews[dayIndex % c.reviews.length] : null
  const tip = (n: number) => c.tips.length ? c.tips[(dayIndex + n) % c.tips.length] : null
  const frame = (tag: string, title: string, icon: typeof Sparkles, body: ReactNode) => (
    <section className="flex h-full flex-col gap-3 rounded-2xl border border-brand-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        {(() => { const Icon = icon; return <Icon className="h-5 w-5 text-brand-600" /> })()}
        <SectionTag label={tag} />
      </div>
      <h3 className="font-display text-lg font-bold text-gray-900">{title}</h3>
      {body}
    </section>
  )
  const p = (text: string) => <p className="text-sm text-gray-700">{text}</p>
  // The built-in review and news are made up, so they say so until real ones are written in the admin dashboard.
  const sampleReviews = JSON.stringify(c.reviews) === JSON.stringify(DEFAULT_TODAY.reviews)
  const sampleNews = c.news === DEFAULT_TODAY.news
  const cards: (InfoCard | null)[] = [
    tip(0) ? { id: 'tip', node: frame('Tip', 'Tip of the day', Sparkles, p(tip(0)!)) } : null,
    c.updates.length ? {
      id: 'updates',
      node: frame(APP_NAME, "What's new", Megaphone, (
        <ul className="space-y-1.5 text-sm text-gray-700">
          {c.updates.map(u => <li key={u} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-500" />{u}</li>)}
        </ul>
      )),
    } : null,
    review ? {
      id: 'review',
      node: frame(sampleReviews ? 'Sample review' : 'Review', 'From people using it', Quote, (
        <figure>
          <blockquote className="text-sm text-gray-700">&ldquo;{review.quote}&rdquo;</blockquote>
          <figcaption className="mt-2 text-xs text-gray-500">{review.by}</figcaption>
        </figure>
      )),
    } : null,
    c.news.trim() ? { id: 'news', node: frame(sampleNews ? 'Sample news' : 'News', 'Artist news', Newspaper, p(c.news)) } : null,
    c.start.trim() ? { id: 'start', node: frame(APP_NAME, 'Get started', Sparkles, p(c.start)) } : null,
    tip(2) ? { id: 'tip2', node: frame('Tip', 'Quick tip', Sparkles, p(tip(2)!)) } : null,
  ]
  return cards.filter((x): x is InfoCard => !!x)
}
