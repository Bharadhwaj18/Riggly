'use client'

import { useState, useEffect, useMemo, useRef, useTransition, useCallback } from 'react'
import { ChevronUp, ChevronDown, Save, MonitorPlay } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { parseSong } from '@/lib/chords/parser'
import { formatSongAsChordPro } from '@/lib/chords/formatter'
import { renderBlockHtml } from '@/lib/chords/render'
import { transposeSong, transposeKey } from '@/lib/chords/transposer'
import { chordProToDoc, docToChordPro, blockToChordPro, colorFor, SECTION_COLORS, type ChartDoc, type SectionColor } from '@/lib/chords/blocks'
import { ensureChordSheetCss } from './chordSheetStyles'
import { saveChordChart, saveTranspose } from '@/actions/songs'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toaster'
import { StageMode, type SetlistNavSong } from './StageMode'
import { ChordBlocksEditor } from './ChordBlocksEditor'
import { useSongEdit, LockToggle, AUTOSAVE_DELAY_MS, type SaveState } from './SongEditContext'

const TEXT_SIZE_MIN = 11
const TEXT_SIZE_MAX = 26
const TEXT_SIZE_DEFAULT = 14
interface ChordViewerProps {
  chordChart: string
  songKey?: string | null
  printRef?: React.RefObject<HTMLDivElement | null>
  songId?: string
  songTitle?: string
  bpm?: number | null
  setlistSongs?: SetlistNavSong[]
  setlistId?: string
  setlistTitle?: string
  /** This song's band notes, shown in Stage mode when it's opened outside a setlist. */
  notes?: string | null
  /** Open straight into Stage mode (e.g. from a setlist's "Stage mode" button). */
  autoStage?: boolean
}

export function ChordViewer({
  chordChart, songKey, printRef, songId, songTitle, bpm, setlistSongs, setlistId, setlistTitle, notes, autoStage,
}: ChordViewerProps) {
  // The chart as last saved (or as the server sent it), and the blocks it's edited as.
  const [chart, setChart] = useState(chordChart)
  const [doc, setDoc] = useState<ChartDoc>(() => chordProToDoc(chordChart))
  // The lock is the song page's (shared with the details and band notes above).
  const edit = useSongEdit()
  const locked = edit?.locked ?? true
  const canEdit = !!edit?.canEdit
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [semitones, setSemitones] = useState(0)
  const [stageOpen, setStageOpen] = useState(!!autoStage)
  const [textSize, setTextSize] = useState(TEXT_SIZE_DEFAULT)
  const [isSavingKey, startSaveKey] = useTransition()
  const internalRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const toast = useToast()

  // Autosave bookkeeping, in refs so the timer always sees the latest values.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<string | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)

  // A fresh chart from the server (someone else saved, or the page refreshed): pick it up while
  // locked with nothing waiting to save. Render-time reset, the same pattern used elsewhere here.
  const [prevChordChart, setPrevChordChart] = useState(chordChart)
  if (chordChart !== prevChordChart) {
    setPrevChordChart(chordChart)
    if (locked && saveState !== 'pending' && saveState !== 'saving' && chordChart !== chart) {
      setChart(chordChart)
      setDoc(chordProToDoc(chordChart))
    }
  }

  useEffect(() => {
    // Injected once per page (shared by every ChordViewer instance and the editor preview).
    ensureChordSheetCss()
    // Offline, a saved copy of this song can be served for a "&stage=1" address it wasn't saved
    // under, so Stage mode is also opened from the address itself.
    if (new URLSearchParams(window.location.search).get('stage') === '1') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStageOpen(true)
    }
  }, [])

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (inFlight.current) await inFlight.current
    const next = pending.current
    if (next === null || !songId) return
    pending.current = null
    setSaveState('saving')
    const run = saveChordChart(songId, next).then(result => {
      if (result.error) {
        // Put it back so the next change (or locking) tries again.
        if (pending.current === null) pending.current = next
        setSaveState('error')
        toast(`Couldn’t save the chart: ${result.error}`, 'error')
      } else {
        setChart(next)
        setSaveState(pending.current === null ? 'saved' : 'pending')
      }
    }).catch(() => {
      if (pending.current === null) pending.current = next
      setSaveState('error')
      toast('Couldn’t save the chart — check your connection.', 'error')
    })
    inFlight.current = run
    await run
    inFlight.current = null
  }, [songId, toast])

  const handleDocChange = (nextDoc: ChartDoc) => {
    setDoc(nextDoc)
    const nextChart = docToChordPro(nextDoc)
    if (nextChart === chart && pending.current === null) return
    pending.current = nextChart
    setSaveState('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush() }, AUTOSAVE_DELAY_MS)
  }

  const handleColorChange = (type: string, color: SectionColor | undefined) => {
    const colors = { ...doc.colors }
    if (color) colors[type] = color
    else delete colors[type]
    handleDocChange({ ...doc, colors })
  }

  // Warn before closing the tab with a change still waiting to save, and save it when leaving the page.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current !== null) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (pending.current !== null) void flush()
    }
  }, [flush])

  // Just unlocked: edit the chart as saved (drop a transpose that wasn't saved), and give an empty
  // chart a first block to type into.
  const [prevLocked, setPrevLocked] = useState(locked)
  if (locked !== prevLocked) {
    setPrevLocked(locked)
    if (!locked) {
      setSemitones(0)
      setSaveState('idle')
      if (!doc.blocks.length) setDoc(d => ({ ...d, blocks: [{ id: 'first', heading: '', text: '' }] }))
    }
  }

  // When the song is locked: leave out sections added and never filled in, and save what's waiting.
  const registerFlush = edit?.registerFlush
  useEffect(() => registerFlush?.('chart', async () => {
    setDoc(d => ({ ...d, blocks: d.blocks.filter(b => b.heading.trim() || b.text.trim()) }))
    await flush()
  }), [registerFlush, flush])

  // Tell the page how saving is going, for the indicator by the lock.
  const reportSave = edit?.reportSave
  useEffect(() => { reportSave?.('chart', saveState) }, [reportSave, saveState])

  const transpose = (delta: number) => setSemitones(prev => prev + delta)

  const handleSaveKey = () => {
    if (!songId) return
    const newKey = transposeKey(songKey, semitones)
    const transposedChart = formatSongAsChordPro(transposeSong(parseSong(chart), semitones))
    startSaveKey(async () => {
      const result = await saveTranspose(songId, transposedChart, newKey)
      if (result.error) {
        toast(result.error, 'error')
      } else {
        setChart(transposedChart)
        setDoc(chordProToDoc(transposedChart))
        setSemitones(0)
        toast('Key saved', 'success')
        router.refresh()
      }
    })
  }

  const currentKey = semitones === 0 ? songKey : transposeKey(songKey, semitones)

  // Each section rendered on its own (transposed), so the locked view shows the same blocks as the editor.
  const renderedBlocks = useMemo(() => doc.blocks
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
    .filter(b => b.heading || b.html), [doc, semitones])

  const hasChart = !!chart.trim()

  return (
    <>
      <div className="space-y-4">
        {/* Lock and Stage mode, then transpose and text size (below them on a phone, alongside on wider screens). */}
        <div className="flex flex-col gap-2 rounded-xl border border-brand-200 bg-gray-50 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:px-4">
          <div className="flex items-center gap-2">
            {songId && <LockToggle showStatus={!locked} />}
            {locked && hasChart && (
              <Button size="sm" className="ml-auto sm:ml-0" onClick={() => setStageOpen(true)}>
                <MonitorPlay className="h-4 w-4" /> Stage mode
              </Button>
            )}
          </div>

          {locked && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:flex-1 sm:gap-x-3">
              <span className="hidden text-xs font-extrabold uppercase tracking-[0.1em] text-gray-500 sm:inline">Transpose</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => transpose(-1)} className="h-8 w-8 p-0" aria-label="Transpose down">
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <span className="w-16 text-center text-sm font-mono font-semibold text-brand-600">
                  {semitones > 0 ? `+${semitones}` : semitones === 0 ? 'Original' : semitones}
                </span>
                <Button variant="ghost" size="sm" onClick={() => transpose(1)} className="h-8 w-8 p-0" aria-label="Transpose up">
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </div>

              {currentKey && (
                <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">
                  Key: {currentKey}
                </span>
              )}

              {semitones !== 0 && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setSemitones(0)}>
                    Reset
                  </Button>
                  {songId && canEdit && (
                    <Button size="sm" loading={isSavingKey} onClick={handleSaveKey}>
                      <Save className="h-3.5 w-3.5" /> Save key
                    </Button>
                  )}
                </>
              )}

              {/* Text size */}
              <div className="ml-auto flex items-center gap-1 text-gray-500">
                <span className="hidden text-xs font-bold sm:inline">Text</span>
                <Button variant="ghost" size="sm" aria-label="Smaller text" onClick={() => setTextSize(s => Math.max(TEXT_SIZE_MIN, s - 1))} className="h-8 px-2 text-xs font-extrabold">A−</Button>
                <Button variant="ghost" size="sm" aria-label="Larger text" onClick={() => setTextSize(s => Math.min(TEXT_SIZE_MAX, s + 1))} className="h-8 px-2 text-xs font-extrabold">A+</Button>
              </div>
            </div>
          )}
        </div>

        {!locked ? (
          <ChordBlocksEditor
            blocks={doc.blocks}
            onChange={blocks => handleDocChange({ ...doc, blocks })}
            colors={doc.colors}
            onColorChange={handleColorChange}
          />
        ) : renderedBlocks.length ? (
          <div
            ref={printRef ?? internalRef}
            className="space-y-2"
            style={{ '--chord-size': `${textSize}px` } as React.CSSProperties}
          >
            {renderedBlocks.map(b => (
              <section
                key={b.id}
                className="rounded-xl border border-brand-200 bg-white px-4 py-2.5 sm:px-5"
                style={b.color ? { borderLeftColor: b.color, borderLeftWidth: 4 } : undefined}
              >
                {/* Compact: a small label and the chords, so a one- or two-line section stays short. */}
                {b.heading && (
                  <h3
                    className="mb-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-500"
                    style={b.color ? { color: b.color } : undefined}
                  >
                    {b.heading}
                  </h3>
                )}
                {b.html && <div className="chord-view" dangerouslySetInnerHTML={{ __html: b.html }} />}
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-brand-200 p-10 text-center text-sm text-gray-500">
            No chord chart added yet.
            {canEdit && songId && (
              <>
                {' '}
                <button type="button" onClick={edit?.unlock} className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700">
                  Unlock to start writing
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {stageOpen && (
        <StageMode
          songs={setlistSongs && setlistSongs.some(s => s.id === songId) ? setlistSongs : [{
            id: songId ?? '', title: songTitle ?? 'Song', chord_chart: chart, song_key: songKey ?? null, bpm: bpm ?? null, notes,
          }]}
          startSongId={songId ?? ''}
          setlistId={setlistSongs?.some(s => s.id === songId) ? setlistId : undefined}
          setlistTitle={setlistTitle}
          onClose={() => setStageOpen(false)}
        />
      )}
    </>
  )
}
