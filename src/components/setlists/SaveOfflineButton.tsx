'use client'

import { useState, useEffect, useRef } from 'react'
import { WifiOff, CloudOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { saveSetlistOffline, removeSetlistOffline, getOfflineMeta, OFFLINE_VERSION } from '@/lib/offline'
import { useToast } from '@/components/ui/Toaster'
import type { Song } from '@/types'

interface SetlistSongEntry {
  song: Song
  section?: string | null
}

interface SaveOfflineButtonProps {
  setlistId: string
  setlistTitle: string
  items: SetlistSongEntry[]
}

/** A saved copy older than this is quietly saved again when the setlist is opened online. */
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000

export function SaveOfflineButton({ setlistId, setlistTitle, items }: SaveOfflineButtonProps) {
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const toast = useToast()
  const refreshed = useRef(false)

  const save = async (quiet: boolean) => {
    setSaving(true)
    try {
      const songMetas = items.map(({ song }) => ({
        id: song.id,
        title: song.title,
        artist: song.artist ?? null,
        song_key: song.song_key ?? null,
        setlistId,
        setlistTitle,
      }))
      await saveSetlistOffline(setlistId, setlistTitle, songMetas, (done, total) => {
        if (!quiet) setProgress(`Saving ${Math.min(done + 1, total)} of ${total}…`)
      })
      setSaved(true)
      if (!quiet) toast('Setlist saved for offline use', 'success')
    } catch (e) {
      if (!quiet) toast(e instanceof Error ? e.message : 'Failed to save offline', 'error')
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  useEffect(() => {
    // The saved list lives in localStorage, a browser-only external system that must be checked
    // after mount, not during the server render.
    const meta = getOfflineMeta(setlistId)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(!!meta)
    // Keep a saved copy up to date: redo it when it's from the old way of saving or a few hours old.
    if (meta && !refreshed.current && navigator.onLine) {
      const stale = meta.version !== OFFLINE_VERSION || Date.now() - new Date(meta.savedAt).getTime() > REFRESH_AFTER_MS
      if (stale) { refreshed.current = true; void save(true) }
    }
    // Runs once per setlist; `save` reads the latest props when it's called.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setlistId])

  const handleSave = () => { void save(false) }

  const handleRemove = async () => {
    await removeSetlistOffline(setlistId)
    setSaved(false)
    toast('Removed from offline storage', 'success')
  }

  if (saved) {
    return (
      <div className="animate-row-in flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 ring-1 ring-green-200">
        <WifiOff className="h-3.5 w-3.5 shrink-0 animate-check-pop" />
        <span>Saved offline</span>
        <button
          onClick={handleRemove}
          className="ml-1 text-green-500 hover:text-green-800 underline underline-offset-2"
        >
          Remove
        </button>
      </div>
    )
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudOff className="h-4 w-4" />}
      {saving ? (progress ?? 'Saving…') : 'Save offline'}
    </Button>
  )
}
