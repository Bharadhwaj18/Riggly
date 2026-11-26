import type { Metadata } from 'next'
import Link from 'next/link'
import { Wordmark } from '@/components/ui/Wordmark'
import { APP_NAME } from '@/lib/brand'

export const metadata: Metadata = { title: `Privacy and security · ${APP_NAME}` }

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'What we store',
    body: [
      `${APP_NAME} stores what your band puts into it: your account (name and email), setlists, songs, lyrics and chord charts, shows and calendar entries, tasks, merch stock and orders, and your finance records (gig fees, costs, budgets, payouts and splits).`,
    ],
  },
  {
    title: 'Who can see your band’s data',
    body: [
      'Inside the app, only people in your band’s workspace can see it, and what each person sees depends on their role. This is enforced by the database itself, not just by the screens.',
      `The person who runs ${APP_NAME} can technically reach the database, because the app has to read it to work. That means they could see your band’s data, including finance figures, setlists and songs. They do not look at it as part of normal running, and they only open it to fix a fault you have reported or to meet a legal duty.`,
      `${APP_NAME} is not end-to-end encrypted. If it were, features that need the server to read your data, such as fee splits, merch orders from your website and notifications, could not work.`,
    ],
  },
  {
    title: 'How it is protected',
    body: [
      'Everything travels over HTTPS. Data is held with Supabase (database and sign-in) and the app is served by Vercel. Passwords are handled by Supabase and are never stored by us in readable form.',
      'Access to the database is limited by row-level security, so one band cannot read another band’s records.',
    ],
  },
  {
    title: 'Services we use',
    body: [
      'Supabase (database and accounts), Vercel (hosting) and PostHog (product usage, only for signed-in users, to see which screens are used). Song reference search uses the YouTube Data API: only the search words you type are sent.',
    ],
  },
  {
    title: 'Your choices',
    body: [
      'You can ask for a copy of your data or ask for it to be deleted, and a band owner can ask for the whole workspace to be removed. Under India’s Digital Personal Data Protection Act and, where it applies, the GDPR, you also have the right to correct your data and to complain.',
    ],
  },
]

/** Public: what is stored, who can see it and how it is protected, said plainly. Always dark, like the front page. */
export default function PrivacyPage() {
  return (
    <div className="dark min-h-screen bg-[#0b0b0b] text-[#f2f2f2]">
      <div className="mx-auto max-w-2xl px-5 pb-16">
        <header className="flex items-center justify-between py-5">
          <Link href="/welcome" aria-label={`${APP_NAME} home`}><Wordmark className="text-xl" /></Link>
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-[#d4d4d4] hover:text-white">Sign in</Link>
        </header>
        <h1 className="mt-6 text-3xl font-extrabold">Privacy and security</h1>
        <p className="mt-3 text-[#a3a3a3]">What {APP_NAME} keeps about your band, who can see it and how it is looked after, in plain words.</p>
        {SECTIONS.map(s => (
          <section key={s.title} className="mt-8">
            <h2 className="text-lg font-bold text-[#7dd3a0]">{s.title}</h2>
            {s.body.map(p => <p key={p} className="mt-2 text-[15px] leading-relaxed text-[#d4d4d4]">{p}</p>)}
          </section>
        ))}
        <p className="mt-10 text-xs text-[#737373]">This page describes how {APP_NAME} works today and will be updated as it changes.</p>
      </div>
    </div>
  )
}
