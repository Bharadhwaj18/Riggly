'use client'

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { CloudOff } from 'lucide-react'
import { useToast } from '@/components/ui/Toaster'
import { recordKitSale } from '@/actions/merch-kits'
import { patchTask } from '@/actions/tasks'
import { createNote } from '@/actions/notes'
import { uploadProofs } from '@/components/merch/UpiProof'
import { isNetworkError } from '@/lib/offline'
import { changesFor, changesSnapshot, loadChanges, parseChanges, removeChange, setOfflineWorkspace, subscribeChanges, type QueuedChange } from '@/lib/offline-changes'
import { dropFiles, loadFiles } from '@/lib/offline-files'
import { parseQueue, queueSnapshot, queuedFor, subscribeQueue } from '@/lib/finance/offline-queue'

class StillOffline extends Error {}

/** Sends one queued change. Throws StillOffline when the signal is gone again (the change stays queued). */
async function send(c: QueuedChange, workspaceId: string, userId: string): Promise<{ error?: string }> {
  const call = async <T,>(fn: () => Promise<T>) => {
    try { return await fn() } catch (e) { if (isNetworkError(e)) throw new StillOffline(); throw e }
  }
  switch (c.kind) {
    case 'kitSale': {
      let paths: string[] = []
      if (c.photos > 0) {
        const files = await loadFiles(c.id)
        if (!files.length) return { error: 'its UPI photo wasn’t kept on this phone. Record the sale again with the photo.' }
        const up = await uploadProofs(workspaceId, userId, files.map(file => ({ file, preview: '' })))
        if (up.error) { if (isNetworkError(up.error)) throw new StillOffline(); return { error: up.error } }
        paths = up.paths ?? []
      }
      return call(() => recordKitSale(c.kitId, c.lines, c.paid, null, paths))
    }
    case 'taskPatch':
      return call(() => patchTask(c.taskId, c.patch))
    case 'noteCreate':
      return call(() => createNote(c.data))
  }
}

/**
 * Sends the gig-night changes made with no signal (merch sales, task updates, new notes) as soon as the phone is
 * back online, and shows how many changes (money entries included) are still waiting.
 */
export function OfflineChangesSync({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const toast = useToast()
  const router = useRouter()
  const raw = useSyncExternalStore(subscribeChanges, changesSnapshot, () => '')
  const rawMoney = useSyncExternalStore(subscribeQueue, queueSnapshot, () => '')
  const waiting = useMemo(
    () => changesFor(parseChanges(raw || null), workspaceId).length + queuedFor(parseQueue(rawMoney || null), workspaceId).length,
    [raw, rawMoney, workspaceId],
  )
  const busy = useRef(false)

  useEffect(() => { setOfflineWorkspace(workspaceId) }, [workspaceId])

  const flush = useCallback(async () => {
    if (busy.current || !workspaceId || !navigator.onLine) return
    busy.current = true
    let sent = 0
    try {
      for (const c of changesFor(loadChanges(), workspaceId)) {
        let error: string | undefined
        try {
          error = (await send(c, workspaceId, userId)).error
        } catch (e) {
          if (e instanceof StillOffline) break // keep the rest and try again later
          error = 'something went wrong.'
        }
        removeChange(c.id)
        void dropFiles(c.id)
        if (error) toast(`Couldn’t send ${c.label}: ${error}`, 'error')
        else sent++
      }
    } finally {
      busy.current = false
    }
    if (sent > 0) {
      toast(sent === 1 ? 'Sent the change you made offline' : `Sent ${sent} changes you made offline`, 'success')
      router.refresh()
    }
  }, [workspaceId, userId, toast, router])

  useEffect(() => {
    void flush()
    window.addEventListener('online', flush)
    const timer = window.setInterval(() => { void flush() }, 30_000)
    return () => { window.removeEventListener('online', flush); window.clearInterval(timer) }
  }, [flush])

  if (waiting === 0) return null
  return (
    <div role="status" className="fixed bottom-24 left-4 z-30 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3.5 py-2 text-xs font-extrabold text-amber-900 shadow-lg lg:bottom-5">
      <CloudOff className="h-4 w-4" />
      {waiting} waiting to sync
    </div>
  )
}
