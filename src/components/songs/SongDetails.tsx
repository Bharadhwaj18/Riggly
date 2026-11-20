'use client'

import type { ReactNode } from 'react'
import { Select } from '@/components/ui/Select'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { StatusPill } from '@/components/ui/StatusPill'
import { MUSICAL_KEYS, TIME_SIGNATURES } from '@/lib/utils'
import { useSongEdit } from './SongEditContext'

const field =
  'w-full rounded-md border border-brand-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400'
const labelClass = 'mb-1 block text-xs font-extrabold uppercase tracking-[0.1em] text-gray-500'

/** The song's name, artist, key, tempo and time signature: read normally, typed into when unlocked. */
export function SongDetails({ cover, coverLink }: { cover?: ReactNode; coverLink?: ReactNode }) {
  const edit = useSongEdit()
  if (!edit) return null
  const { details, setDetail, locked, detailsError } = edit

  if (locked) {
    return (
      <div className="flex min-w-0 items-center gap-4">
        {cover}
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-gray-900">{details.title}</h1>
          {details.artist && <p className="mt-0.5 text-gray-500">{details.artist}</p>}
          {coverLink}
          <div className="mt-3 flex flex-wrap gap-2">
            {details.song_key && (
              <span className="inline-flex items-center rounded-full bg-hero px-3 py-1 text-xs font-bold text-hero-fg">Key of {details.song_key}</span>
            )}
            {details.bpm && <StatusPill className="px-3 py-1 text-xs">{details.bpm} BPM</StatusPill>}
            {details.time_signature && <StatusPill className="px-3 py-1 text-xs">{details.time_signature}</StatusPill>}
          </div>
        </div>
      </div>
    )
  }

  const titleMissing = detailsError === 'The song needs a name'
  return (
    <div className="grid w-full min-w-0 grid-cols-2 gap-3 sm:grid-cols-6">
      <div className="col-span-2 sm:col-span-6">
        <label htmlFor="song-title" className="sr-only">Song name</label>
        <input
          id="song-title"
          value={details.title}
          onChange={e => setDetail('title', e.target.value)}
          placeholder="Song name"
          aria-invalid={titleMissing}
          className="w-full rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-3xl font-bold text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 aria-[invalid=true]:border-red-500"
        />
      </div>
      <div className="col-span-2 sm:col-span-6">
        <label htmlFor="song-artist" className={labelClass}>Artist</label>
        <input id="song-artist" value={details.artist} onChange={e => setDetail('artist', e.target.value)} placeholder="Original artist" className={field} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="song-key" className={labelClass}>Key</label>
        <Select id="song-key" value={details.song_key} onChange={e => setDetail('song_key', e.target.value)} className={field}>
          <option value="">—</option>
          {MUSICAL_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
        </Select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="song-bpm" className={labelClass}>Tempo (BPM)</label>
        <input
          id="song-bpm"
          type="number"
          inputMode="numeric"
          min={20}
          max={280}
          value={details.bpm ?? ''}
          onChange={e => {
            const n = parseInt(e.target.value, 10)
            setDetail('bpm', Number.isNaN(n) ? null : n)
          }}
          placeholder="120"
          className={field}
        />
      </div>
      <div className="col-span-2 sm:col-span-2">
        <label htmlFor="song-time" className={labelClass}>Time signature</label>
        <Select id="song-time" value={details.time_signature} onChange={e => setDetail('time_signature', e.target.value)} className={field}>
          <option value="">—</option>
          {TIME_SIGNATURES.map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>
    </div>
  )
}

/** The band notes: shown when there are some, and always editable when the song is unlocked. */
export function SongNotesCard() {
  const edit = useSongEdit()
  if (!edit) return null
  const { details, setDetail, locked } = edit
  if (locked && !details.notes) return null
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <SectionLabel className="mb-1.5 text-amber-700">Band notes</SectionLabel>
      {locked ? (
        <p className="whitespace-pre-wrap">{details.notes}</p>
      ) : (
        <textarea
          value={details.notes}
          onChange={e => setDetail('notes', e.target.value)}
          rows={Math.max(3, details.notes.split('\n').length + 1)}
          placeholder="Capo, special instructions, dynamics…"
          aria-label="Band notes"
          className="w-full resize-y rounded-md border border-amber-200 bg-white/70 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
      )}
    </div>
  )
}
