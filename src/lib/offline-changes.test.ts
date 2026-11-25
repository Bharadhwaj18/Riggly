import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changesFor, loadChanges, parseChanges, queuedKitSold, sendOrQueue, setOfflineWorkspace, type QueuedChange } from './offline-changes'

const sale = (o: Partial<QueuedChange> = {}): QueuedChange => ({
  id: 'c1', workspaceId: 'w1', queuedAt: '2026-11-25T18:00:00.000Z', label: 'the ₹500 sale',
  kind: 'kitSale', kitId: 'k1', lines: [{ variantId: 'tee-m', qty: 2 }], paid: { cash: 500 }, userId: 'u1', photos: 0,
  ...o,
} as QueuedChange)

describe('parseChanges', () => {
  it('reads saved changes and ignores broken data', () => {
    expect(parseChanges(JSON.stringify([sale()]))).toEqual([sale()])
    expect(parseChanges(null)).toEqual([])
    expect(parseChanges('nope')).toEqual([])
    expect(parseChanges(JSON.stringify([{ id: 'x', kind: 'kitSale' }, { ...sale(), kind: 'hack' }]))).toEqual([])
  })
})

describe('changesFor', () => {
  it('keeps one workspace’s changes, oldest first', () => {
    const late = sale({ id: 'late', queuedAt: '2026-11-25T19:00:00.000Z' })
    const other = sale({ id: 'other', workspaceId: 'w2' })
    expect(changesFor([late, other, sale()], 'w1').map(c => c.id)).toEqual(['c1', 'late'])
  })
})

describe('queuedKitSold', () => {
  it('adds up the units waiting to be sent for one kit', () => {
    const changes = [sale(), sale({ id: 'c2', lines: [{ variantId: 'tee-m', qty: 1 }, { variantId: 'cap', qty: 3 }] } as Partial<QueuedChange>), sale({ id: 'c3', kitId: 'k2' } as Partial<QueuedChange>)]
    expect(queuedKitSold(changes, 'k1')).toEqual({ 'tee-m': 3, cap: 3 })
  })
})

describe('sendOrQueue', () => {
  const store: Record<string, string> = {}
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v }, removeItem: (k: string) => { delete store[k] } } })
    setOfflineWorkspace('w1')
  })
  afterEach(() => { vi.unstubAllGlobals(); for (const k of Object.keys(store)) delete store[k] })

  const change = { kind: 'taskPatch' as const, taskId: 't1', patch: { progress: 'completed' as const } }

  it('sends straight away when online', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    await expect(sendOrQueue(change, 'the task', async () => ({ error: undefined }))).resolves.toEqual({ error: undefined })
    expect(loadChanges()).toEqual([])
  })

  it('keeps the change when the phone is offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const send = vi.fn()
    await expect(sendOrQueue(change, 'the task', send)).resolves.toEqual({ queued: true })
    expect(send).not.toHaveBeenCalled()
    expect(loadChanges()).toMatchObject([{ kind: 'taskPatch', taskId: 't1', workspaceId: 'w1', label: 'the task' }])
  })

  it('keeps the change when the request never got through, but not when the server said no', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    await expect(sendOrQueue(change, 'the task', () => Promise.reject(new TypeError('Failed to fetch')))).resolves.toEqual({ queued: true })
    await expect(sendOrQueue(change, 'the task', async () => ({ error: 'Not allowed' }))).resolves.toEqual({ error: 'Not allowed' })
    expect(loadChanges()).toHaveLength(1)
  })
})
