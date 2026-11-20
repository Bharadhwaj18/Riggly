'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, Loader2, Lock, LockOpen } from 'lucide-react'
import { saveSongDetails } from '@/actions/songs'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'
import type { SongDetailsData } from '@/lib/validators'

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

/** How long typing has to pause before a change is saved. */
export const AUTOSAVE_DELAY_MS = 1200

interface SongEdit {
  canEdit: boolean
  locked: boolean
  unlock: () => void
  lock: () => Promise<void>
  /** The song's details as currently typed (saved a moment after typing stops). */
  details: SongDetailsData
  setDetail: <K extends keyof SongDetailsData>(field: K, value: SongDetailsData[K]) => void
  detailsError: string | null
  /** The save state of everything on the page, for the indicator next to the lock. */
  saveState: SaveState
  retry: () => void
  /** Other parts of the page (the chord chart) report how their saving is going… */
  reportSave: (part: string, state: SaveState) => void
  /** …and hand over a function that saves anything waiting, called when the song is locked. */
  registerFlush: (part: string, flush: () => Promise<void>) => () => void
}

const SongEditContext = createContext<SongEdit | null>(null)

export function useSongEdit() {
  return useContext(SongEditContext)
}

const RANK: Record<SaveState, number> = { idle: 0, saved: 1, pending: 2, saving: 3, error: 4 }

interface Props {
  songId: string
  canEdit: boolean
  initial: SongDetailsData
  children: ReactNode
}

/**
 * The song page's lock. Locked, everything reads as normal; unlocked, the details, band notes and
 * chord chart are all typed into in place and saved automatically.
 */
export function SongEditProvider({ songId, canEdit, initial, children }: Props) {
  const [locked, setLocked] = useState(true)
  const [details, setDetails] = useState(initial)
  const [detailsState, setDetailsState] = useState<SaveState>('idle')
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [partStates, setPartStates] = useState<Record<string, SaveState>>({})
  const router = useRouter()
  const toast = useToast()

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<SongDetailsData | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const flushers = useRef(new Map<string, () => Promise<void>>())

  // Fresh details from the server (after locking, or someone else's save) while nothing is waiting.
  const [prevInitial, setPrevInitial] = useState(initial)
  if (initial !== prevInitial) {
    setPrevInitial(initial)
    if (locked && detailsState !== 'pending' && detailsState !== 'saving') setDetails(initial)
  }

  const flushDetails = useCallback(async (): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (inFlight.current) await inFlight.current
    const next = pending.current
    if (!next) return
    pending.current = null
    setDetailsState('saving')
    const run = saveSongDetails(songId, next).then(result => {
      if (result.error) {
        if (!pending.current) pending.current = next
        setDetailsState('error')
        setDetailsError(result.error)
      } else {
        setDetailsError(null)
        setDetailsState(pending.current ? 'pending' : 'saved')
      }
    }).catch(() => {
      if (!pending.current) pending.current = next
      setDetailsState('error')
      toast('Couldn’t save the song details — check your connection.', 'error')
    })
    inFlight.current = run
    await run
    inFlight.current = null
  }, [songId, toast])

  // The latest details, for building the next change without waiting for a re-render.
  const detailsRef = useRef(details)
  useEffect(() => { detailsRef.current = details }, [details])

  const setDetail = useCallback(<K extends keyof SongDetailsData>(field: K, value: SongDetailsData[K]) => {
    const next = { ...detailsRef.current, [field]: value }
    detailsRef.current = next
    setDetails(next)
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (!next.title.trim()) {
      // Don't save a song with no name; keep what was typed and say why.
      pending.current = null
      setDetailsError('The song needs a name')
      setDetailsState('error')
      return
    }
    setDetailsError(null)
    pending.current = next
    setDetailsState('pending')
    timer.current = setTimeout(() => { void flushDetails() }, AUTOSAVE_DELAY_MS)
  }, [flushDetails])

  const reportSave = useCallback((part: string, state: SaveState) => {
    setPartStates(prev => (prev[part] === state ? prev : { ...prev, [part]: state }))
  }, [])

  const registerFlush = useCallback((part: string, flush: () => Promise<void>) => {
    flushers.current.set(part, flush)
    return () => { flushers.current.delete(part) }
  }, [])

  const unlock = useCallback(() => {
    setDetailsState('idle')
    setPartStates({})
    setLocked(false)
  }, [])

  const lock = useCallback(async () => {
    setLocked(true)
    // A blank name can't be saved: put the saved one back.
    setDetails(prev => (prev.title.trim() ? prev : { ...prev, title: initial.title }))
    setDetailsError(null)
    await Promise.all([flushDetails(), ...[...flushers.current.values()].map(f => f())])
    router.refresh()
  }, [flushDetails, initial.title, router])

  const retry = useCallback(() => {
    void flushDetails()
    for (const f of flushers.current.values()) void f()
  }, [flushDetails])

  // Warn before closing the tab with details still waiting to save, and save them when leaving the page.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (pending.current) e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (pending.current) void flushDetails()
    }
  }, [flushDetails])

  const saveState = [detailsState, ...Object.values(partStates)].reduce<SaveState>((a, b) => (RANK[b] > RANK[a] ? b : a), 'idle')

  const value = useMemo<SongEdit>(() => ({
    canEdit, locked, unlock, lock, details, setDetail, detailsError, saveState, retry, reportSave, registerFlush,
  }), [canEdit, locked, unlock, lock, details, setDetail, detailsError, saveState, retry, reportSave, registerFlush])

  return <SongEditContext.Provider value={value}>{children}</SongEditContext.Provider>
}

/** The lock button, with how saving is going while the song is unlocked. */
export function LockToggle({ showStatus = true, className }: { showStatus?: boolean; className?: string }) {
  const edit = useSongEdit()
  if (!edit?.canEdit) return null
  const { locked, unlock, lock } = edit
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Button
        size="sm"
        variant={locked ? 'secondary' : 'primary'}
        onClick={locked ? unlock : () => { void lock() }}
        aria-pressed={!locked}
        title={locked ? 'Unlock to edit this song' : 'Lock to stop editing'}
      >
        {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
        {locked ? 'Locked' : 'Editing'}
      </Button>
      {showStatus && !locked && <SaveIndicator />}
    </div>
  )
}

function SaveIndicator() {
  const edit = useSongEdit()
  if (!edit) return null
  const { saveState, detailsError, retry } = edit
  const base = 'inline-flex items-center gap-1.5 text-xs font-bold'
  if (saveState === 'error') {
    if (detailsError === 'The song needs a name') {
      return <span className={cn(base, 'text-red-600')}><AlertCircle className="h-3.5 w-3.5" /> The song needs a name</span>
    }
    return (
      <button type="button" onClick={retry} className={cn(base, 'text-red-600 hover:underline')}>
        <AlertCircle className="h-3.5 w-3.5" /> {detailsError ? `${detailsError} — tap to retry` : 'Not saved — tap to retry'}
      </button>
    )
  }
  if (saveState === 'pending' || saveState === 'saving') {
    return <span className={cn(base, 'text-gray-500')}><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</span>
  }
  if (saveState === 'saved') {
    return <span className={cn(base, 'text-emerald-700')}><Check className="h-3.5 w-3.5" /> Saved</span>
  }
  return <span className={cn(base, 'text-gray-500')}>Edit anything on the page — changes save automatically.</span>
}
