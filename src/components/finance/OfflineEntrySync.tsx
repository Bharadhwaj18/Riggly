'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useToast } from '@/components/ui/Toaster'
import { useMoney } from '@/components/finance/FinanceSettingsContext'
import { addTransaction } from '@/actions/finance'
import { isNetworkError, loadQueue, queuedFor, removeQueued } from '@/lib/finance/offline-queue'

/**
 * Adds the entries that were logged with no signal, as soon as the phone is back online. Entries only sync into
 * the workspace they were made in. OfflineChangesSync shows how many are still waiting.
 */
export function OfflineEntrySync() {
  const { workspaceId } = useMoney()
  const toast = useToast()
  const busy = useRef(false)

  const flush = useCallback(async () => {
    if (busy.current || !workspaceId || !navigator.onLine) return
    busy.current = true
    let added = 0
    try {
      for (const item of queuedFor(loadQueue(), workspaceId)) {
        let error: string | undefined
        try {
          error = (await addTransaction(item.payload)).error
        } catch (e) {
          if (isNetworkError(e)) break // still no signal: keep the rest and try again later
          error = 'Something went wrong.'
        }
        removeQueued(item.id)
        if (error) toast(`Couldn’t add “${item.payload.description}”: ${error}`, 'error')
        else added++
      }
    } finally {
      busy.current = false
    }
    if (added > 0) toast(added === 1 ? 'Added the entry you saved offline' : `Added ${added} entries you saved offline`, 'success')
  }, [workspaceId, toast])

  useEffect(() => {
    void flush()
    window.addEventListener('online', flush)
    const timer = window.setInterval(() => { void flush() }, 30_000)
    return () => { window.removeEventListener('online', flush); window.clearInterval(timer) }
  }, [flush])

  return null
}
