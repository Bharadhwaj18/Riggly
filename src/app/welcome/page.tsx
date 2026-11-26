import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, CheckSquare, IndianRupee, ListMusic, Music2, Shirt, Smartphone } from 'lucide-react'
import { Wordmark } from '@/components/ui/Wordmark'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'

export const metadata: Metadata = { title: `${APP_NAME}: ${APP_TAGLINE}` }

const FEATURES = [
  { icon: ListMusic, title: 'Setlists', text: 'Build the set for every show, reorder in seconds and print or share it.' },
  { icon: IndianRupee, title: 'Finance', text: 'Gig fees, costs, budgets and fair splits, so everyone knows who is owed what.' },
  { icon: Music2, title: 'Songs & chords', text: 'Lyrics and chord charts for the whole catalogue, transposed when you need it.' },
  { icon: CalendarDays, title: 'Shows & calendar', text: 'Every gig, rehearsal and deadline in one band calendar.' },
  { icon: CheckSquare, title: 'Tasks', text: 'Who is bringing the cables, booking the van and posting the reel.' },
  { icon: Shirt, title: 'Merch', text: 'Stock, show-night sales and online orders, kept in step.' },
]

/** The public front page: what signed-out visitors (a shared link, LinkedIn) see before signing in. Always dark. */
export default function WelcomePage() {
  return (
    <div className="dark min-h-screen bg-[#0b0b0b] text-[#f2f2f2]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_30%_20%,#0f1813_0%,transparent_60%)]" />
      <div className="relative mx-auto flex max-w-5xl flex-col px-5 pb-16">
        <header className="flex items-center justify-between py-5">
          <Wordmark className="text-xl" />
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-[#d4d4d4] hover:text-white">Sign in</Link>
        </header>

        <section className="flex flex-col items-center pt-10 text-center sm:pt-16">
          <h1><Wordmark spotlight className="text-6xl sm:text-7xl" /></h1>
          <p className="mt-6 text-sm font-bold uppercase tracking-[0.35em] sm:text-base">{APP_TAGLINE}</p>
          <span className="mt-4 h-1 w-16 rounded-full bg-[#7dd3a0]" />
          <p className="mt-6 max-w-xl text-base text-[#a3a3a3] sm:text-lg">
            The band app for everything around the music: the set, the songs, the shows, the money and the merch, shared with the whole band.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/login?mode=signup" className="rounded-xl bg-[#7dd3a0] px-6 py-3 text-sm font-bold text-[#0b0b0b] hover:bg-[#93ddb1]">Create an account</Link>
            <Link href="/login" className="rounded-xl border border-[#264232] px-6 py-3 text-sm font-bold hover:bg-[#121a15]">Sign in</Link>
          </div>
        </section>

        <section className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-[#1f1f1f] bg-[#121212] p-5">
              <Icon className="h-5 w-5 text-[#7dd3a0]" />
              <h2 className="mt-3 font-bold">{title}</h2>
              <p className="mt-1 text-sm text-[#a3a3a3]">{text}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 flex items-center gap-3 rounded-2xl border border-[#264232] bg-[#0f1813] p-5">
          <Smartphone className="h-5 w-5 shrink-0 text-[#7dd3a0]" />
          <p className="text-sm text-[#d4d4d4]">Add {APP_NAME} to your home screen and it opens like an app, with your setlists and chords ready at the venue.</p>
        </section>

        <footer className="mt-16 text-center text-xs text-[#737373]">{APP_NAME} · {APP_TAGLINE} · <Link href="/privacy" className="underline hover:text-[#d4d4d4]">Privacy and security</Link></footer>
      </div>
    </div>
  )
}
