// Gig-night changes made with no signal: kept on the phone and sent once it's back online
// (components/offline/OfflineChangesSync). Money entries have their own queue in lib/finance/offline-queue.
// Per browser, and tied to the workspace they were made in: they only ever go into that one.
// UPI payment photos for a queued merch sale are kept in IndexedDB (lib/offline-files), under the change's id.

import type { NoteFormData } from '@/actions/notes'
import type { TaskPatch } from '@/actions/tasks'
import { isNetworkError } from '@/lib/offline'

export type ChangeInput =
  | { kind: 'kitSale'; kitId: string; lines: { variantId: string; qty: number }[]; paid: { cash?: number; upi?: number; card?: number }; userId: string; photos: number }
  | { kind: 'taskPatch'; taskId: string; patch: TaskPatch }
  | { kind: 'noteCreate'; data: NoteFormData }

export type QueuedChange = ChangeInput & {
  id: string
  workspaceId: string
  queuedAt: string
  /** What it was, in a few words, for "Couldn't send …" messages. */
  label: string
}

export const CHANGES_KEY = 'riggly:offline-changes'
const KINDS = new Set(['kitSale', 'taskPatch', 'noteCreate'])

export function parseChanges(raw: string | null): QueuedChange[] {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter((c): c is QueuedChange => !!c && typeof c === 'object'
      && typeof (c as QueuedChange).id === 'string'
      && typeof (c as QueuedChange).workspaceId === 'string'
      && typeof (c as QueuedChange).queuedAt === 'string'
      && KINDS.has((c as QueuedChange).kind))
  } catch {
    return []
  }
}

/** Only this workspace's changes, oldest first, so they land in the order they happened. */
export const changesFor = (changes: QueuedChange[], workspaceId: string) =>
  changes.filter(c => c.workspaceId === workspaceId).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))

/** Units of each item sold from one kit that are still waiting to be sent, so the stall's "left" counts stay right. */
export function queuedKitSold(changes: QueuedChange[], kitId: string): Record<string, number> {
  const sold: Record<string, number> = {}
  for (const c of changes) {
    if (c.kind !== 'kitSale' || c.kitId !== kitId) continue
    for (const l of c.lines) sold[l.variantId] = (sold[l.variantId] ?? 0) + l.qty
  }
  return sold
}

// ── Browser storage, with one change signal for every component on the page ───────────────

const listeners = new Set<() => void>()
export const subscribeChanges = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }
const notify = () => listeners.forEach(l => l())

function read(): string | null {
  try { return window.localStorage.getItem(CHANGES_KEY) } catch { return null }
}
export const changesSnapshot = () => read() ?? ''
export const loadChanges = () => parseChanges(read())

function write(changes: QueuedChange[]): boolean {
  try {
    if (changes.length === 0) window.localStorage.removeItem(CHANGES_KEY)
    else window.localStorage.setItem(CHANGES_KEY, JSON.stringify(changes))
  } catch {
    return false
  }
  notify()
  return true
}

// The workspace the app is showing, set by OfflineChangesSync, so callers don't each need it.
let currentWorkspace = ''
export const setOfflineWorkspace = (id: string) => { currentWorkspace = id }

/** Keeps a change for later. Returns its id, or null when the browser won't store it. */
export function enqueueChange(change: ChangeInput, label: string): string | null {
  if (!currentWorkspace) return null
  const queued = { ...change, id: crypto.randomUUID(), workspaceId: currentWorkspace, queuedAt: new Date().toISOString(), label } as QueuedChange
  return write([...loadChanges(), queued]) ? queued.id : null
}

export function removeChange(id: string) {
  write(loadChanges().filter(c => c.id !== id))
}

export const NO_STORAGE = 'No signal, and this phone can’t save it for later. Try again when you’re online.'

/**
 * Sends a change now, or keeps it on the phone when there's no signal (no internet, or the request never got
 * through). `{ queued: true }` means it's saved for later; anything the server said comes back as it was.
 */
export async function sendOrQueue<T extends { error?: string }>(
  change: ChangeInput, label: string, send: () => Promise<T>,
): Promise<T | { queued: true; error?: undefined } | { error: string }> {
  const keep = () => (enqueueChange(change, label) ? { queued: true as const } : { error: NO_STORAGE })
  if (typeof navigator !== 'undefined' && !navigator.onLine) return keep()
  try {
    return await send()
  } catch (e) {
    if (isNetworkError(e)) return keep()
    throw e
  }
}
