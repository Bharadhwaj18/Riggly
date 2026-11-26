'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, ListMusic, Minus, Pencil, Plus, RotateCcw, Save,
  SlidersHorizontal, StickyNote, X, ArrowDownToLine, Moon, Sun, ZoomIn, ZoomOut,
} from 'lucide-react'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useSwipe } from '@/lib/use-swipe'
import { parseSong } from '@/lib/chords/parser'
import { formatSongAsChordPro } from '@/lib/chords/formatter'
import { transposeSong, transposeKey } from '@/lib/chords/transposer'
import { getStageChordSheetCss } from '@/lib/chords/theme'
import { renderBlockHtml } from '@/lib/chords/render'
import { chordProToDoc, blockToChordPro, colorFor, SECTION_COLORS } from '@/lib/chords/blocks'
import { paginateSections, pageOf, mergeHeadingOnlySections, type MeasuredSection, type StageSlice } from '@/lib/stage-pages'
import { ensureChordSheetCss } from './chordSheetStyles'
import { saveTranspose } from '@/actions/songs'
import { reorderSetlistSongs } from '@/actions/setlists'
import { useToast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'

export interface SetlistNavSong {
  id: string
  title: string
  chord_chart: string
  song_key: string | null
  bpm: number | null
  notes?: string | null
  section?: string | null
}

interface Props {
  /** The songs to move through, in order. A single song when opened outside a setlist. */
  songs: SetlistNavSong[]
  startSongId: string
  setlistId?: string
  setlistTitle?: string
  onClose: () => void
}

type StageTheme = 'dark' | 'light'
type Sheet = null | 'tools' | 'list' | 'edit'

const CSS_ID = 'stage-sheet-css'
const FONT_MIN = 14
const FONT_MAX = 48
/** Space between section cards, and above / below each page, in px (matches gap-3 / py-4). */
const CARD_GAP = 12
const PAGE_PAD_Y = 16
// Zoom (text size) is kept on this phone only, for each song: a song with long lines can be zoomed out without
// changing the others, and each band member's own phone keeps their own. A song never zoomed uses the last size set.
const PREF_FONT = 'stage-font-size'
const songFontKey = (songId: string) => `stage-font-size:${songId}`
const validFont = (v: string) => { const n = Number(v); return n >= FONT_MIN && n <= FONT_MAX ? n : null }
const readFont = (songId: string | undefined) =>
  readPref(songId ? songFontKey(songId) : PREF_FONT, readPref(PREF_FONT, 26, validFont), validFont)
const PREF_THEME = 'stage-theme'

// Fixed palettes, deliberately independent of the app's light/dark theme.
const PALETTES: Record<StageTheme, React.CSSProperties> = {
  dark: {
    '--stage-bg': '#0a0d0b', '--stage-surface': '#161b18', '--stage-raised': '#202723', '--stage-line': 'rgba(255,255,255,0.12)',
    '--stage-text': '#f4f4ef', '--stage-muted': '#a1a8a3', '--stage-chord': '#fbbf24', '--stage-section': '#6ee7b7',
    '--stage-accent': '#fbbf24', '--stage-accent-fg': '#111111',
  } as React.CSSProperties,
  light: {
    '--stage-bg': '#ffffff', '--stage-surface': '#f2f4f1', '--stage-raised': '#e6eae6', '--stage-line': 'rgba(0,0,0,0.12)',
    '--stage-text': '#0f1411', '--stage-muted': '#59615c', '--stage-chord': '#b45309', '--stage-section': '#047857',
    '--stage-accent': '#14392b', '--stage-accent-fg': '#ffffff',
  } as React.CSSProperties,
}

// Inside a card: tighter lines, no gap after the last line, and no empty chord row above a lyric line
// without chords, so more of the song fits on each page.
const STAGE_CARD_CSS = `
.stage-sheet .chord-sheet { line-height: 1.6; }
.stage-sheet .paragraph { margin-bottom: 0.8em; }
.stage-sheet .chart-section { margin-bottom: 0; }
.stage-sheet .paragraph:last-child, .stage-sheet .inline-line:last-child { margin-bottom: 0; }
.stage-sheet .row:not(:has(.chord:not(:empty))) .chord { display: none; }
`

const readPref = <T,>(key: string, fallback: T, parse: (v: string) => T | null): T => {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : parse(v) ?? fallback
  } catch { return fallback }
}
const writePref = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* private mode */ } }

const btn = 'flex items-center justify-center rounded-xl transition-colors active:scale-[0.97] disabled:opacity-30'
const iconBtn = cn(btn, 'h-12 w-12 text-[var(--stage-text)] hover:bg-[var(--stage-raised)]')
const zoomBtn = cn(btn, 'h-12 w-10 shrink-0 text-[var(--stage-text)] hover:bg-[var(--stage-raised)] sm:w-12')

/**
 * One full-screen mode for playing live: the chart big and readable, the next song one tap or swipe
 * away, and every last-minute change (key, text size, the chart itself, the running order) reachable
 * without leaving the stage.
 */
export function StageMode({ songs: initialSongs, startSongId, setlistId, setlistTitle, onClose }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [mounted, setMounted] = useState(false)
  const [songs, setSongs] = useState(initialSongs)
  const [dir, setDir] = useState(1)
  const [idx, setIdx] = useState(() => Math.max(0, initialSongs.findIndex(s => s.id === startSongId)))
  const [semitones, setSemitones] = useState(0)
  const [theme, setTheme] = useState<StageTheme>(() => readPref<StageTheme>(PREF_THEME, 'dark', v => (v === 'light' || v === 'dark' ? v : null)))
  const [fontSize, setFontSize] = useState(() => readFont(initialSongs[Math.max(0, initialSongs.findIndex(s => s.id === startSongId))]?.id))
  const [sheet, setSheet] = useState<Sheet>(null)
  // Pages that each fit the screen (the sections, or parts of a long one, on each), and the one showing.
  const [pages, setPages] = useState<StageSlice[][]>([])
  const [page, setPage] = useState(0)
  const [layoutTick, setLayoutTick] = useState(0)
  const [draft, setDraft] = useState('')
  const [saving, startSaving] = useTransition()

  const rootRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  /** The spot to keep on screen when pages are worked out again (text size, rotation, transpose). */
  const anchor = useRef({ section: 0, offset: 0 })
  /** Arriving from the next song with Previous: open on this song's last page. */
  const openOnLast = useRef(false)
  const { enter, exit } = useFullscreen(rootRef)

  const song = songs[idx]
  const total = songs.length
  const prev = idx > 0 ? songs[idx - 1] : null
  const next = idx < total - 1 ? songs[idx + 1] : null
  const currentKey = semitones === 0 ? song.song_key : transposeKey(song.song_key, semitones)
  // The song's sections as cards, the same blocks (names, colours) as on the song page.
  const sections = useMemo(() => {
    const doc = chordProToDoc(song.chord_chart)
    // A heading with nothing under it joins the unnamed section after it, so they're one card.
    return mergeHeadingOnlySections(doc.blocks
      .map(block => {
        const body = blockToChordPro(block, { withHeading: false })
        const color = colorFor(doc, block.heading)
        return {
          id: block.id,
          heading: block.heading.trim(),
          color: color ? SECTION_COLORS[color] : undefined,
          html: body.trim() ? renderBlockHtml(body, semitones) : '',
        }
      })
      .filter(s => s.heading || s.html))
  }, [song.chord_chart, semitones])

  // Mount: portal target, fullscreen, keep the screen awake.
  useEffect(() => {
    // createPortal needs document.body, which only exists after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    ensureChordSheetCss()
    enter()
    let wakeLock: WakeLockSentinel | null = null
    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(wl => { wakeLock = wl }).catch(() => {})
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      wakeLock?.release().catch(() => {})
      document.body.style.overflow = prevOverflow
      document.getElementById(CSS_ID)?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let el = document.getElementById(CSS_ID)
    if (!el) { el = document.createElement('style'); el.id = CSS_ID; document.head.appendChild(el) }
    el.textContent = getStageChordSheetCss(fontSize) + STAGE_CARD_CSS
  }, [fontSize])

  // Re-measure when the screen or the measured cards change size (rotation, fonts loading).
  useEffect(() => {
    if (!mounted) return
    const ro = new ResizeObserver(() => setLayoutTick(t => t + 1))
    if (areaRef.current) ro.observe(areaRef.current)
    if (measureRef.current) ro.observe(measureRef.current)
    return () => ro.disconnect()
  }, [mounted])

  // Work out the pages from the cards' real heights (measured off-screen) and the space available.
  useLayoutEffect(() => {
    const area = areaRef.current
    const measure = measureRef.current
    if (!area || !measure) return
    const measured = Array.from(measure.children, (c, i): MeasuredSection => measureCard(c as HTMLElement, !!sections[i]?.heading && !sections[i]?.html))
    const available = area.clientHeight - PAGE_PAD_Y * 2
    const next = paginateSections(measured, available, CARD_GAP)
    const target = openOnLast.current ? Math.max(0, next.length - 1) : pageOf(next, anchor.current.section, anchor.current.offset)
    openOnLast.current = false
    // Remember where we landed, so a second measurement (cards settling, fonts loading) stays put.
    const top = next[target]?.[0]
    anchor.current = { section: top?.section ?? 0, offset: top?.start ?? 0 }
    // Measuring the DOM is reading an external system, so the result is stored after layout.
    setPages(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    setPage(target)
  }, [sections, fontSize, layoutTick, mounted])

  const goTo = useCallback((i: number, onLastPage = false) => {
    if (i < 0 || i >= songs.length) return
    setDir(i > idx ? 1 : -1)
    setIdx(i)
    setSemitones(0)
    setFontSize(readFont(songs[i]?.id))
    anchor.current = { section: 0, offset: 0 }
    openOnLast.current = onLastPage
    setPage(0)
    setSheet(null)
  }, [songs, idx])

  const pageCount = Math.max(1, pages.length)
  const onFirstPage = page <= 0
  const onLastPage = page >= pageCount - 1
  const showPage = useCallback((n: number, direction: number) => {
    setDir(direction)
    setPage(n)
    const top = pages[n]?.[0]
    anchor.current = { section: top?.section ?? 0, offset: top?.start ?? 0 }
  }, [pages])
  /** Next page, or the next song from the last page. */
  const nextPage = useCallback(() => {
    if (!onLastPage) showPage(page + 1, 1)
    else goTo(idx + 1)
  }, [onLastPage, showPage, page, goTo, idx])
  /** Previous page, or the previous song's last page from the first page. */
  const prevPage = useCallback(() => {
    if (!onFirstPage) showPage(page - 1, -1)
    else goTo(idx - 1, true)
  }, [onFirstPage, showPage, page, goTo, idx])

  const close = useCallback(async () => {
    await exit()
    onClose()
  }, [exit, onClose])

  /** Zoom in (more text size, less on each page) or out (more on each page), remembered for this song. */
  const changeFont = (delta: number) => {
    const n = Math.min(FONT_MAX, Math.max(FONT_MIN, fontSize + delta))
    if (n === fontSize) { toast(delta > 0 ? 'That’s as big as the text goes.' : 'That’s as small as the text goes.', 'info'); return }
    setFontSize(n)
    writePref(songFontKey(song.id), String(n))
    writePref(PREF_FONT, String(n))
  }
  const changeTheme = (t: StageTheme) => { setTheme(t); writePref(PREF_THEME, t) }

  // Keyboard and Bluetooth page-turner pedals (which send arrows or Page Up/Down).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet === 'edit' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case ' ': case 'ArrowRight': case 'ArrowDown': case 'PageDown': e.preventDefault(); nextPage(); break
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp': e.preventDefault(); prevPage(); break
        case 'Escape': if (sheet) setSheet(null); else close(); break
        case '+': case '=': setSemitones(n => n + 1); break
        case '-': setSemitones(n => n - 1); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, nextPage, prevPage, close])

  const swipe = useSwipe(nextPage, prevPage)

  // Tapping the left or right third of the chart turns the page too (handy mid-song).
  const onAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    if (x < 1 / 3) prevPage()
    else if (x > 2 / 3) nextPage()
  }

  // ---- Last-minute changes -------------------------------------------------------------

  const saveKey = () => {
    const chart = formatSongAsChordPro(transposeSong(parseSong(song.chord_chart), semitones))
    startSaving(async () => {
      const res = await saveTranspose(song.id, chart, currentKey ?? null)
      if (res.error) { toast(res.error, 'error'); return }
      setSongs(list => list.map((s, i) => (i === idx ? { ...s, chord_chart: chart, song_key: currentKey ?? s.song_key } : s)))
      setSemitones(0)
      toast(`Saved in ${currentKey}`, 'success')
      router.refresh()
    })
  }

  const openEditor = () => {
    setDraft(semitones === 0 ? song.chord_chart : formatSongAsChordPro(transposeSong(parseSong(song.chord_chart), semitones)))
    setSheet('edit')
  }
  const saveEdit = () => {
    startSaving(async () => {
      const res = await saveTranspose(song.id, draft, currentKey ?? null)
      if (res.error) { toast(res.error, 'error'); return }
      setSongs(list => list.map((s, i) => (i === idx ? { ...s, chord_chart: draft, song_key: currentKey ?? s.song_key } : s)))
      setSemitones(0)
      setSheet(null)
      toast('Song saved', 'success')
      router.refresh()
    })
  }

  const reorder = (from: number, to: number) => {
    if (!setlistId || from === to) return
    const list = [...songs]
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    const playing = songs[idx].id
    setSongs(list)
    setIdx(list.findIndex(s => s.id === playing))
    startSaving(async () => {
      try {
        await reorderSetlistSongs(setlistId, list.map(s => ({ songId: s.id, section: s.section ?? null })))
        toast(`Moved “${moved.title}”`, 'success')
      } catch {
        toast('Couldn’t save the new order. It’s changed here only.', 'error')
      }
    })
  }

  if (!mounted) return null

  const pageSlices = (pages[page] ?? []).filter(sl => sections[sl.section])
  const nextTop = !onLastPage ? pages[page + 1]?.[0] : undefined
  const nextPageHeading = nextTop ? sections[nextTop.section]?.heading : undefined

  return createPortal(
    <div ref={rootRef} style={PALETTES[theme]}
      className="fixed inset-0 z-[200] flex flex-col bg-[var(--stage-bg)] text-[var(--stage-text)]">

      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-1 border-b border-[var(--stage-line)] bg-[var(--stage-surface)] px-2 py-2 sm:px-3">
        <button type="button" onClick={close} aria-label="Leave stage mode" title="Leave (Esc)" className={iconBtn}><X className="h-6 w-6" /></button>
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-lg font-bold leading-tight sm:text-xl">{song.title}</h1>
          <p className="truncate text-xs text-[var(--stage-muted)] sm:text-sm">
            {[total > 1 && `${idx + 1} of ${total}`, setlistTitle, song.bpm && `${song.bpm} BPM`].filter(Boolean).join(' · ')}
          </p>
        </div>
        {currentKey && (
          <button type="button" onClick={() => setSheet('tools')} title="Change key"
            className="shrink-0 rounded-lg bg-[var(--stage-raised)] px-3 py-1.5 text-base font-extrabold text-[var(--stage-chord)]">
            {currentKey}{semitones !== 0 && <span className="ml-1 text-xs text-[var(--stage-muted)]">{semitones > 0 ? `+${semitones}` : semitones}</span>}
          </button>
        )}
        {song.notes && (
          <button type="button" onClick={() => setSheet('tools')} aria-label="Band notes" title="Band notes" className={iconBtn}><StickyNote className="h-5 w-5" /></button>
        )}
        {total > 1 && <button type="button" onClick={() => setSheet('list')} aria-label="Running order" title="Running order" className={iconBtn}><ListMusic className="h-6 w-6" /></button>}
        <button type="button" onClick={() => changeFont(-2)} aria-label="Zoom out" title="Zoom out: more on each page" className={zoomBtn}><ZoomOut className="h-6 w-6" /></button>
        <button type="button" onClick={() => changeFont(2)} aria-label="Zoom in" title="Zoom in: bigger text" className={zoomBtn}><ZoomIn className="h-6 w-6" /></button>
        <button type="button" onClick={() => setSheet('tools')} aria-label="Tools" title="Key, text size and more" className={iconBtn}><SlidersHorizontal className="h-6 w-6" /></button>
      </header>

      {/* The chart: one screen-sized page of section cards at a time, no scrolling. */}
      <div ref={areaRef} {...swipe} onClick={onAreaClick} className="stage-sheet relative min-h-0 flex-1 overflow-hidden">
        {song.chord_chart.trim() ? (
          <>
            {/* Every card, measured off-screen at the real width and text size, to work out the pages. */}
            <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute inset-x-0 top-0 mx-auto max-w-4xl px-4 sm:px-8">
              {sections.map(s => <StageCard key={s.id} section={s} fontSize={fontSize} />)}
            </div>
            <div key={`${idx}-${page}`}
              className={cn('mx-auto flex h-full max-w-4xl flex-col gap-3 px-4 py-4 sm:px-8', dir > 0 ? 'animate-step-in' : 'animate-step-back')}>
              {pageSlices.map(sl => <StageCard key={`${sections[sl.section].id}-${sl.start}`} section={sections[sl.section]} fontSize={fontSize} slice={sl} />)}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-[var(--stage-muted)]">
            <p className="text-lg">No chart for this song yet.</p>
            <button type="button" onClick={e => { e.stopPropagation(); openEditor() }} className="rounded-xl bg-[var(--stage-accent)] px-5 py-3 font-bold text-[var(--stage-accent-fg)]">Add it now</button>
          </div>
        )}
      </div>

      {/* Turn the page: big buttons, and on the last page Next moves on to the next song. */}
      <footer className="shrink-0 border-t border-[var(--stage-line)] bg-[var(--stage-surface)] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <button type="button" onClick={prevPage} disabled={onFirstPage && !prev} aria-label={onFirstPage && prev ? `Previous song: ${prev.title}` : 'Previous page'}
            className={cn(btn, 'h-16 min-w-0 flex-1 gap-2 bg-[var(--stage-raised)] px-3 text-[var(--stage-text)]')}>
            <ChevronLeft className="h-7 w-7 shrink-0" />
            <span className="min-w-0 truncate text-left text-sm font-bold">
              {onFirstPage && prev ? <><span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--stage-muted)]">Previous song</span>{prev.title}</> : 'Previous'}
            </span>
          </button>

          <div className="w-16 shrink-0 text-center" aria-live="polite">
            <p className="text-xl font-extrabold leading-none">{page + 1}<span className="text-[var(--stage-muted)]">/{pageCount}</span></p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--stage-muted)]">Page</p>
          </div>

          <button type="button" onClick={nextPage} disabled={onLastPage && !next} aria-label={onLastPage && next ? `Next song: ${next.title}` : 'Next page'}
            className={cn(btn, 'h-16 min-w-0 flex-[1.4] gap-2 bg-[var(--stage-accent)] px-3 text-[var(--stage-accent-fg)]')}>
            <span className="min-w-0 truncate text-right text-sm font-extrabold">
              {onLastPage && next
                ? <><span className="block text-[11px] font-bold uppercase tracking-[0.1em] opacity-75">Next song</span>{next.title}</>
                : <>{'Next'}{nextPageHeading && <span className="block text-[11px] font-bold uppercase tracking-[0.1em] opacity-75">{nextPageHeading}</span>}</>}
            </span>
            <ChevronRight className="h-7 w-7 shrink-0" />
          </button>
        </div>
        <p className="mt-1.5 hidden text-center text-[11px] text-[var(--stage-muted)] lg:block">← → , Space or a pedal turn pages · tap the sides of the chart · + − key · Esc leave</p>
      </footer>

      {/* Sheets */}
      {sheet && sheet !== 'edit' && (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setSheet(null)}>
          <div onClick={e => e.stopPropagation()}
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-[var(--stage-line)] bg-[var(--stage-surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{sheet === 'list' ? 'Running order' : 'On-stage tools'}</h2>
              <button type="button" onClick={() => setSheet(null)} aria-label="Close" className={cn(btn, 'h-10 w-10 hover:bg-[var(--stage-raised)]')}><X className="h-5 w-5" /></button>
            </div>

            {sheet === 'tools' && (
              <div className="space-y-5">
                {song.notes && (
                  <div className="rounded-2xl bg-[var(--stage-raised)] p-4">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--stage-section)]"><StickyNote className="h-3.5 w-3.5" /> Band notes</p>
                    <p className="whitespace-pre-wrap text-base">{song.notes}</p>
                  </div>
                )}

                <ToolRow label="Key" hint={song.song_key ? `Written in ${song.song_key}` : undefined}>
                  <Stepper onMinus={() => setSemitones(n => n - 1)} onPlus={() => setSemitones(n => n + 1)}
                    value={<>{currentKey ?? '—'}{semitones !== 0 && <span className="ml-1 text-xs text-[var(--stage-muted)]">{semitones > 0 ? `+${semitones}` : semitones}</span>}</>} />
                </ToolRow>
                {semitones !== 0 && (
                  <div className="-mt-2 flex gap-2">
                    <button type="button" onClick={saveKey} disabled={saving} className={cn(btn, 'h-11 flex-1 gap-2 bg-[var(--stage-accent)] font-bold text-[var(--stage-accent-fg)]')}>
                      <Save className="h-4 w-4" /> Save {currentKey} as the song’s key
                    </button>
                    <button type="button" onClick={() => setSemitones(0)} className={cn(btn, 'h-11 gap-2 bg-[var(--stage-raised)] px-4 font-bold')}><RotateCcw className="h-4 w-4" /> Reset</button>
                  </div>
                )}

                <ToolRow label="Text size" hint="For this song, on this phone">
                  <Stepper onMinus={() => changeFont(-2)} onPlus={() => changeFont(2)} value={<>{fontSize}</>} minusLabel="A−" plusLabel="A+" />
                </ToolRow>

                <ToolRow label="Display">
                  <div className="flex rounded-xl bg-[var(--stage-raised)] p-1">
                    {([['dark', 'Dark', Moon], ['light', 'Light', Sun]] as const).map(([v, l, Icon]) => (
                      <button key={v} type="button" onClick={() => changeTheme(v)} aria-pressed={theme === v}
                        className={cn('flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-bold', theme === v ? 'bg-[var(--stage-accent)] text-[var(--stage-accent-fg)]' : 'text-[var(--stage-muted)]')}>
                        <Icon className="h-4 w-4" /> {l}
                      </button>
                    ))}
                  </div>
                </ToolRow>

                <div className="grid grid-cols-2 gap-2 border-t border-[var(--stage-line)] pt-4">
                  <button type="button" onClick={openEditor} className={cn(btn, 'h-12 gap-2 bg-[var(--stage-raised)] font-bold')}><Pencil className="h-4 w-4" /> Edit this chart</button>
                  <button type="button" onClick={() => { showPage(0, -1); setSheet(null) }} className={cn(btn, 'h-12 gap-2 bg-[var(--stage-raised)] font-bold')}><ArrowDownToLine className="h-4 w-4 rotate-180" /> First page</button>
                </div>
              </div>
            )}

            {sheet === 'list' && (
              <ol className="space-y-1">
                {songs.map((s, i) => {
                  const showSection = s.section && s.section !== songs[i - 1]?.section
                  return (
                    <li key={s.id}>
                      {showSection && <p className="px-2 pb-1 pt-3 text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--stage-section)]">{s.section}</p>}
                      <div className={cn('flex items-center gap-2 rounded-xl', i === idx ? 'bg-[var(--stage-accent)] text-[var(--stage-accent-fg)]' : 'hover:bg-[var(--stage-raised)]')}>
                        <button type="button" onClick={() => goTo(i)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left">
                          <span className="w-6 shrink-0 text-right text-sm font-bold opacity-60">{i + 1}</span>
                          <span className="min-w-0 truncate text-base font-semibold">{s.title}</span>
                          {s.song_key && <span className="shrink-0 text-xs font-bold opacity-70">{s.song_key}</span>}
                          {i === idx && <span className="ml-auto shrink-0 text-[11px] font-extrabold uppercase tracking-[0.1em]">Now</span>}
                        </button>
                        {setlistId && i !== idx && (
                          <div className="flex shrink-0 gap-1 pr-2">
                            {i !== idx + 1 && (
                              <button type="button" disabled={saving} onClick={() => reorder(i, i < idx ? idx : idx + 1)}
                                className="rounded-lg bg-[var(--stage-raised)] px-2.5 py-1.5 text-xs font-bold text-[var(--stage-text)]">Play next</button>
                            )}
                            {i < total - 1 && (
                              <button type="button" disabled={saving} onClick={() => reorder(i, total - 1)}
                                className="rounded-lg px-2 py-1.5 text-xs font-bold text-[var(--stage-muted)] hover:bg-[var(--stage-raised)]">To end</button>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>
      )}

      {sheet === 'edit' && (
        <div className="absolute inset-0 z-10 flex flex-col bg-[var(--stage-bg)]">
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--stage-line)] bg-[var(--stage-surface)] px-3 py-2">
            <button type="button" onClick={() => setSheet(null)} className={cn(btn, 'h-11 px-3 font-bold hover:bg-[var(--stage-raised)]')}>Cancel</button>
            <p className="min-w-0 flex-1 truncate text-center text-sm font-bold">Editing {song.title}{currentKey ? ` · ${currentKey}` : ''}</p>
            <button type="button" onClick={saveEdit} disabled={saving} className={cn(btn, 'h-11 gap-2 bg-[var(--stage-accent)] px-4 font-bold text-[var(--stage-accent-fg)]')}><Save className="h-4 w-4" /> Save</button>
          </div>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} spellCheck={false} aria-label="Chord chart"
            className="flex-1 resize-none bg-[var(--stage-bg)] p-5 font-mono text-base leading-relaxed text-[var(--stage-text)] focus:outline-none" />
          <p className="shrink-0 border-t border-[var(--stage-line)] px-4 py-2 text-xs text-[var(--stage-muted)]">Chords go in square brackets before the word, e.g. [G]Hello [C]world. Saving updates the song for everyone.</p>
        </div>
      )}
    </div>,
    document.body
  )
}

interface StageSection { id: string; heading: string; color?: string; html: string }

/**
 * A card's size for working out the pages: its heading and padding, its lines, and where a page may start inside
 * it. A page may start at any line, except words right under a line of chords alone (they go over together).
 */
function measureCard(card: HTMLElement, keepWithNext: boolean): MeasuredSection {
  const lines = card.querySelector<HTMLElement>('[data-stage-lines]')
  const cardHeight = card.getBoundingClientRect().height
  if (!lines) return { header: cardHeight, content: 0, breaks: [], keepWithNext }
  const box = lines.getBoundingClientRect()
  const breaks: number[] = []
  let afterChordsOnly = false
  for (const el of lines.querySelectorAll<HTMLElement>('.row, .inline-line, .line-gap')) {
    const hasWords = el.classList.contains('row') && !!(el.querySelector('.lyrics')?.textContent ?? '').trim()
    const y = Math.round(el.getBoundingClientRect().top - box.top)
    // Words stay with the line of chords just above them. (Lines of chords one after another may still be split.)
    const keptWithAbove = afterChordsOnly && hasWords
    if (!keptWithAbove && y > 0 && y < box.height && y !== breaks[breaks.length - 1]) breaks.push(y)
    // A line of chords alone: a row with no words, or a chords line shown inline ("VERSE - F# E C#").
    afterChordsOnly = el.classList.contains('inline-line') || (el.classList.contains('row') && !hasWords)
  }
  return { header: cardHeight - box.height, content: box.height, breaks: [0, ...breaks], keepWithNext }
}

/**
 * One section as a card, like on the song page, in Stage mode's own colours. With `slice`, only those of its lines
 * show (a long section cut across pages), and a part after the first says it carries on.
 */
function StageCard({ section, fontSize, slice }: { section: StageSection; fontSize: number; slice?: StageSlice }) {
  const continued = !!slice && slice.start > 0
  return (
    <section
      className="shrink-0 rounded-xl border border-[var(--stage-line)] bg-[var(--stage-surface)] px-4 py-3 sm:px-5"
      style={section.color ? { borderLeftColor: section.color, borderLeftWidth: 5 } : undefined}
    >
      {section.heading && (
        <h3 className="mb-1 truncate font-extrabold uppercase tracking-[0.14em]"
          style={{ color: section.color ?? 'var(--stage-section)', fontSize: Math.max(11, Math.round(fontSize * 0.45)) }}>
          {section.heading}{continued && <span className="opacity-60"> · cont.</span>}
        </h3>
      )}
      {section.html && (
        <div className="overflow-hidden" style={slice ? { height: slice.end - slice.start } : undefined}>
          {/* flow-root: the lines' own margins stay inside, so measured offsets match what's shown. */}
          <div data-stage-lines className="flow-root" style={slice ? { marginTop: -slice.start } : undefined}
            dangerouslySetInnerHTML={{ __html: section.html }} />
        </div>
      )}
    </section>
  )
}

function ToolRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-base font-bold">{label}</p>
        {hint && <p className="text-xs text-[var(--stage-muted)]">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Stepper({ onMinus, onPlus, value, minusLabel, plusLabel }: { onMinus: () => void; onPlus: () => void; value: React.ReactNode; minusLabel?: string; plusLabel?: string }) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-[var(--stage-raised)] p-1">
      <button type="button" onClick={onMinus} aria-label="Less" className={cn(btn, 'h-11 w-12 text-base font-extrabold hover:bg-[var(--stage-line)]')}>{minusLabel ?? <Minus className="h-5 w-5" />}</button>
      <span className="min-w-16 text-center text-lg font-extrabold">{value}</span>
      <button type="button" onClick={onPlus} aria-label="More" className={cn(btn, 'h-11 w-12 text-base font-extrabold hover:bg-[var(--stage-line)]')}>{plusLabel ?? <Plus className="h-5 w-5" />}</button>
    </div>
  )
}
