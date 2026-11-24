'use client'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Hand, X } from 'lucide-react'
import { useToast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'
import { buildWalkthrough, pathMatches, tourForPath, toursFor, WALKTHROUGH_ID, type Tour } from '@/lib/tours'
import { placeTourCard } from '@/lib/tour-placement'
import type { SectionKey } from '@/lib/workspace-sections'

interface TourState { done: string[]; dismissed: string[] }
interface Ctx {
  start: (id: string) => void
  /** Tours this person can take (their sections), with whether they've finished each. */
  available: (Tour & { done: boolean })[]
}

const TourContext = createContext<Ctx>({ start: () => {}, available: [] })
export const useTour = () => useContext(TourContext)

// Finished and "not now" tours, per person, on this device.
const storeKey = (userId: string) => `rigly.tours.${userId}`
function readState(userId: string): TourState {
  try {
    const raw = JSON.parse(localStorage.getItem(storeKey(userId)) ?? '{}')
    return { done: Array.isArray(raw.done) ? raw.done : [], dismissed: Array.isArray(raw.dismissed) ? raw.dismissed : [] }
  } catch { return { done: [], dismissed: [] } }
}
function writeState(userId: string, s: TourState) {
  try { localStorage.setItem(storeKey(userId), JSON.stringify(s)) } catch { /* private mode */ }
}

const visible = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
}
const findTarget = (selectors: string[]) => {
  for (const sel of selectors) {
    const el = [...document.querySelectorAll(sel)].find(visible)
    if (el) return el as HTMLElement
  }
  return null
}

type Rect = { top: number; left: number; width: number; height: number }
const PAD = 6

/**
 * Runs guided tours over the real app: dims the screen, spotlights the thing a step is about, and explains it.
 * In a demo band, a section's tour is offered the first time it's opened.
 */
export function TourProvider({ userId, inDemo, hiddenSections, children }: {
  userId: string
  inDemo: boolean
  hiddenSections: SectionKey[]
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const toast = useToast()
  const [active, setActive] = useState<{ id: string; step: number } | null>(null)
  const [state, setState] = useState<TourState>({ done: [], dismissed: [] })
  const [rect, setRect] = useState<Rect | null>(null)
  // 'looking' while waiting for the page or the element; 'found' with a spotlight; 'missing' shows the card alone.
  const [phase, setPhase] = useState<'looking' | 'found' | 'missing'>('looking')
  const [offer, setOffer] = useState<Tour | null>(null)
  const target = useRef<HTMLElement | null>(null)

  // Read saved progress after the first render, so server and browser agree.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(readState(userId))
  }, [userId])
  const save = useCallback((next: TourState) => { setState(next); writeState(userId, next) }, [userId])

  // Only tours for sections this person has; the full walkthrough strings those together.
  const hiddenKey = hiddenSections.join(',')
  const sectionTours = useMemo(() => toursFor(hiddenKey ? (hiddenKey.split(',') as SectionKey[]) : []), [hiddenKey])
  const walkthrough = useMemo(() => buildWalkthrough(sectionTours), [sectionTours])
  const getTour = useCallback((id: string) => (id === WALKTHROUGH_ID ? walkthrough : sectionTours.find(t => t.id === id)), [walkthrough, sectionTours])
  const available = [walkthrough, ...sectionTours].map(t => ({ ...t, done: state.done.includes(t.id) }))
  const tour = active ? getTour(active.id) : undefined
  const step = tour && active ? tour.steps[active.step] : undefined

  const start = useCallback((id: string) => {
    const t = getTour(id)
    if (!t) return
    setOffer(null)
    setActive({ id, step: 0 })
    if (!pathMatches(t.steps[0], pathname)) router.push(t.startPath)
  }, [pathname, router, getTour])

  const end = useCallback((finished: boolean) => {
    if (!active) return
    const id = active.id
    setActive(null)
    setRect(null)
    target.current = null
    // Finishing the walkthrough counts as having seen every tour in it.
    const finishedIds = id === WALKTHROUGH_ID ? [id, ...sectionTours.map(t => t.id)] : [id]
    save({
      done: finished ? [...new Set([...state.done, ...finishedIds])] : state.done,
      dismissed: [...new Set([...state.dismissed, id])],
    })
    if (finished) toast(id === WALKTHROUGH_ID ? 'Walkthrough done. Help & tours in Settings has every tour again.' : `That’s the ${getTour(id)?.title ?? ''} tour. Help & tours in Settings has the others.`, 'success')
  }, [active, save, state, toast, sectionTours, getTour])

  const next = useCallback(() => {
    if (!active || !tour) return
    if (active.step + 1 >= tour.steps.length) { end(true); return }
    // Moving on to another section: go to its page; the next step waits for it.
    const goTo = tour.steps[active.step].goTo
    if (goTo) router.push(goTo)
    setActive({ id: active.id, step: active.step + 1 })
  }, [active, tour, end, router])
  const back = () => { if (active && active.step > 0) setActive({ id: active.id, step: active.step - 1 }) }

  // Find the step's element: wait for its page, then for it to appear. Keep the spotlight on it as things move.
  useEffect(() => {
    if (!step) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase('looking')
    setRect(null)
    target.current = null
    const startedAt = Date.now()
    let scrolled = false
    const tick = () => {
      if (!pathMatches(step, pathname)) {
        if (Date.now() - startedAt > 8000) setPhase('missing')
        return
      }
      if (!step.target) { setPhase('missing'); return }
      const el = target.current && document.contains(target.current) && visible(target.current) ? target.current : findTarget(step.target)
      if (!el) {
        if (Date.now() - startedAt > 3000) setPhase('missing')
        return
      }
      target.current = el
      if (!scrolled) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); scrolled = true }
      const r = el.getBoundingClientRect()
      setRect(prev => (prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height ? prev : { top: r.top, left: r.left, width: r.width, height: r.height }))
      setPhase('found')
    }
    tick()
    const timer = window.setInterval(tick, 120)
    return () => window.clearInterval(timer)
  }, [step, pathname])

  // A "tap it" step moves on when the highlighted thing is tapped (which usually opens the next page).
  useEffect(() => {
    if (step?.action !== 'tap' || phase !== 'found' || !target.current) return
    const el = target.current
    const onTap = () => window.setTimeout(next, 0)
    el.addEventListener('click', onTap, { capture: true })
    return () => el.removeEventListener('click', onTap, { capture: true })
  }, [step, phase, next])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') end(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, end])

  // In a demo, offer a section's tour the first time its page is opened.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOffer(null)
    if (!inDemo || active) return
    // Today offers the full walkthrough; other pages offer their own tour.
    const found = pathname === '/' ? walkthrough : tourForPath(pathname)
    const t = found && (found.id === WALKTHROUGH_ID ? found : sectionTours.find(x => x.id === found.id))
    if (!t || state.done.includes(t.id) || state.dismissed.includes(t.id)) return
    if (t.section && hiddenSections.includes(t.section)) return
    const timer = window.setTimeout(() => setOffer(t), 700)
    return () => window.clearTimeout(timer)
  }, [pathname, inDemo, active, state, hiddenSections, walkthrough, sectionTours])

  const hole = rect && phase === 'found'
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null

  return (
    <TourContext.Provider value={{ start, available }}>
      {children}

      {offer && !active && (
        <div role="dialog" aria-label={`${offer.title} tour`} className="animate-fade-up fixed bottom-24 left-4 right-4 z-[60] rounded-2xl border border-brand-300 bg-white p-4 shadow-xl sm:right-auto sm:w-80 lg:bottom-6">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-600">New here?</p>
          <p className="mt-1 text-sm font-bold text-gray-900">{offer.id === WALKTHROUGH_ID ? 'Take a walk through Rigly' : `Take the 30-second ${offer.title} tour`}</p>
          <p className="mt-0.5 text-xs text-gray-500">{offer.blurb}</p>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={() => start(offer.id)} className="rounded-lg bg-brand-400 px-3.5 py-2 text-sm font-bold text-white hover:bg-brand-500">Show me</button>
            <button type="button" onClick={() => { save({ ...state, dismissed: [...new Set([...state.dismissed, offer.id])] }); setOffer(null) }} className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-brand-50">Not now</button>
          </div>
        </div>
      )}

      {tour && step && active && phase !== 'looking' && (
        <div className="fixed inset-0 z-[60]" aria-live="polite">
          {hole ? (
            <>
              {/* Dim everything but the hole; clicks outside it are caught. */}
              <div className="fixed left-0 right-0 top-0" style={{ height: Math.max(0, hole.top) }} />
              <div className="fixed bottom-0 left-0 right-0" style={{ top: hole.top + hole.height }} />
              <div className="fixed left-0" style={{ top: hole.top, height: hole.height, width: Math.max(0, hole.left) }} />
              <div className="fixed right-0" style={{ top: hole.top, height: hole.height, left: hole.left + hole.width }} />
              {/* Only a "tap it" step lets the highlighted thing be used. */}
              {step.action !== 'tap' && <div className="fixed" style={hole} />}
              <div
                aria-hidden="true"
                className="pointer-events-none fixed rounded-xl ring-2 ring-brand-300 transition-all duration-300 ease-out"
                style={{ ...hole, boxShadow: '0 0 0 9999px rgba(10, 20, 16, 0.55)' }}
              />
              <div aria-hidden="true" className="tour-pulse pointer-events-none fixed rounded-xl ring-2 ring-brand-300" style={hole} />
            </>
          ) : (
            <div className="fixed inset-0 bg-[rgba(10,20,16,0.55)] transition-opacity" />
          )}
          <TourCard
            key={`${active.id}-${active.step}`}
            tour={tour}
            index={active.step}
            hole={hole}
            onBack={back}
            onNext={next}
            onEnd={() => end(false)}
            onDoIt={() => target.current?.click()}
          />
        </div>
      )}
    </TourContext.Provider>
  )
}

function TourCard({ tour, index, hole, onBack, onNext, onEnd, onDoIt }: {
  tour: Tour
  index: number
  hole: Rect | null
  onBack: () => void
  onNext: () => void
  onEnd: () => void
  onDoIt: () => void
}) {
  const step = tour.steps[index]
  const last = index === tour.steps.length - 1
  const tap = step.action === 'tap' && !!hole
  // Measure the card and the visible screen, so the whole card stays on screen (phones with a short screen or the
  // keyboard up included).
  const ref = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(0)
  const [view, setView] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      setCardHeight(el.offsetHeight)
      const vv = window.visualViewport
      setView({ width: vv?.width ?? window.innerWidth, height: vv?.height ?? window.innerHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [])
  // Below the spotlight when there's room, otherwise above it; in the middle when there's nothing to point at.
  const style: React.CSSProperties = {}
  if (hole && view) {
    const p = placeTourCard(hole, { height: cardHeight || 200 }, view)
    Object.assign(style, p)
  }
  const prevSamePage = index > 0 && tour.steps[index - 1].path === step.path && tour.steps[index - 1].action !== 'tap'

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={step.title}
      className={cn(
        'animate-fade-up fixed z-[61] overflow-y-auto overscroll-contain rounded-2xl border border-brand-200 bg-white p-4 shadow-2xl',
        !hole && 'left-1/2 top-1/2 max-h-[calc(100dvh-24px)] w-[min(360px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2',
        hole && !view && 'invisible',
      )}
      style={style}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-600">{tour.title} · {index + 1} of {tour.steps.length}</p>
        <button type="button" onClick={onEnd} aria-label="End the tour" className="-m-1 rounded-lg p-1 text-gray-400 hover:bg-brand-50 hover:text-gray-700"><X className="h-4 w-4" /></button>
      </div>
      <p className="mt-1 text-base font-bold text-gray-900">{step.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-gray-600">{step.body}</p>
      {/* Dots: how far through the tour */}
      <div aria-hidden="true" className="mt-3 flex gap-1">
        {tour.steps.map((s, i) => <span key={i} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-4 bg-brand-400' : i < index ? 'w-1.5 bg-brand-300' : 'w-1.5 bg-gray-200')} />)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {prevSamePage ? (
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-gray-500 hover:bg-brand-50"><ArrowLeft className="h-4 w-4" /> Back</button>
        ) : <span />}
        {tap ? (
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><Hand className="h-3.5 w-3.5" /> Tap it</span>
            <button type="button" onClick={onDoIt} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-500 underline hover:text-gray-700">Do it for me</button>
          </span>
        ) : (
          <button type="button" onClick={onNext} autoFocus className="inline-flex items-center gap-1 rounded-lg bg-brand-400 px-3.5 py-1.5 text-sm font-bold text-white hover:bg-brand-500">
            {last ? 'Done' : <>Next <ArrowRight className="h-4 w-4" /></>}
          </button>
        )}
      </div>
    </div>
  )
}
