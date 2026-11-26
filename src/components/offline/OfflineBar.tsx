'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { CloudOff, RefreshCw } from 'lucide-react'
import { savedAgo, isNetworkError, OFFLINE_MESSAGE } from '@/lib/offline'
import { useToast } from '@/components/ui/Toaster'
import { useOnline } from '@/hooks/useOnline'

declare global {
  interface Window { __RIGGLY_SAVED_AT?: string }
}

const WARMED_KEY = 'riggly.offline.warmedAt'
const WARM_EVERY_MS = 30 * 60 * 1000

async function worker() {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.ready
  return reg.active
}

/**
 * Offline support on every app page:
 * - a bar when there's no internet, or when the page is a saved copy (the service worker marks those with
 *   window.__RIGGLY_SAVED_AT), saying how old it is;
 * - while online, asks the service worker to keep the page just opened and the key pages fresh (see sw.js);
 * - anything that needed the internet and failed shows "You're offline..." instead of a raw error.
 */
export function OfflineBar() {
  const online = useOnline()
  const [savedAt] = useState(() => (typeof window !== 'undefined' && window.__RIGGLY_SAVED_AT ? Number(window.__RIGGLY_SAVED_AT) : null))
  const [now, setNow] = useState(() => Date.now())
  const toast = useToast()
  const pathname = usePathname()
  const search = useSearchParams().toString()

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Keep the page just opened, then (every 30 minutes at most) the key pages.
  useEffect(() => {
    if (!online || savedAt) return
    let cancelled = false
    const url = pathname + (search ? `?${search}` : '')
    const t = setTimeout(async () => {
      const sw = await worker()
      if (!sw || cancelled) return
      sw.postMessage({ type: 'WARM', urls: [url], maxAgeMs: 10 * 60 * 1000 })
      let last = 0
      try { last = Number(localStorage.getItem(WARMED_KEY) ?? 0) } catch { /* private mode */ }
      if (Date.now() - last < WARM_EVERY_MS) return
      try { localStorage.setItem(WARMED_KEY, String(Date.now())) } catch { /* private mode */ }
      const res = await fetch('/api/offline/pages', { cache: 'no-store' }).catch(() => null)
      const body = res?.ok ? await res.json().catch(() => null) : null
      if (body?.urls) sw.postMessage({ type: 'WARM', urls: body.urls, maxAgeMs: WARM_EVERY_MS })
    }, 3000)
    return () => { cancelled = true; clearTimeout(t) }
  }, [online, savedAt, pathname, search])

  // A change that needed the internet and failed outright: explain it rather than letting it vanish.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (!isNetworkError(e.reason)) return
      e.preventDefault()
      toast(OFFLINE_MESSAGE, 'error')
    }
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [toast])

  if (online && !savedAt) return null
  const age = savedAt ? savedAgo(savedAt, now) : null
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-2 z-[60] flex justify-center px-4 lg:top-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm">
        <CloudOff className="h-3.5 w-3.5 shrink-0" />
        <span>{online ? 'Saved copy' : 'Offline'}{age ? ` · saved ${age}` : ' · showing what was saved'}</span>
        {online && savedAt && (
          <button type="button" onClick={() => location.reload()} className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 hover:bg-amber-200">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        )}
      </div>
    </div>
  )
}
