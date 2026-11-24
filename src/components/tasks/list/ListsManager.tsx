'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { createBoard, deleteBoard, renameBoard } from '@/actions/tasks'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toaster'
import type { Task, TaskBoard } from '@/types/tasks'
import { InlineText } from './cells'

/** Your lists (Aigiri, Merch, Media…): add one, rename one, or delete one with its tasks. */
export function ListsManager({ open, onOpenChange, boards, tasks, readOnly }: { open: boolean; onOpenChange: (o: boolean) => void; boards: TaskBoard[]; tasks: Task[]; readOnly: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [name, setName] = useState('')
  const [pending, start] = useTransition()

  const run = (action: () => Promise<{ error?: string }>, success?: string) => start(async () => {
    const res = await action()
    if (res.error) { toast(res.error, 'error'); return }
    if (success) toast(success, 'success')
    router.refresh()
  })

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    run(async () => { const r = await createBoard(name); if (!r.error) setName(''); return r }, 'List added')
  }

  const remove = (b: TaskBoard) => {
    const count = tasks.filter(t => t.board_id === b.id).length
    if (!window.confirm(`Delete the list “${b.name}”${count ? ` and its ${count} task${count === 1 ? '' : 's'}` : ''}? This can’t be undone.`)) return
    run(() => deleteBoard(b.id), 'List deleted')
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit lists" description="Lists keep related tasks together, like a show or Merch. Tap a name to rename it."
      className="max-w-md max-sm:top-auto max-sm:bottom-0 max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-3xl">
      <ul className="divide-y divide-brand-100 rounded-xl border border-brand-200">
        {boards.map(b => {
          const count = tasks.filter(t => t.board_id === b.id && t.progress !== 'completed').length
          return (
            <li key={b.id} className="flex min-h-12 items-center gap-2 pl-2 pr-1">
              <div className="min-w-0 flex-1">
                {b.is_general ? (
                  <p className="px-1 py-1.5"><span className="block text-sm font-bold text-gray-900">{b.name}</span><span className="block text-xs text-gray-500">Tasks with no list go here. It can’t be renamed or deleted.</span></p>
                ) : (
                  <InlineText value={b.name} label="List name" readOnly={readOnly} onSave={v => v && run(() => renameBoard(b.id, v))} className="text-sm font-bold text-gray-900" />
                )}
              </div>
              <span className="shrink-0 text-xs text-gray-500">{count} open</span>
              {!readOnly && !b.is_general && (
                <button type="button" onClick={() => remove(b)} disabled={pending} aria-label={`Delete ${b.name}`}
                  className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
              )}
            </li>
          )
        })}
        {boards.length === 0 && <li className="px-3 py-4 text-sm text-gray-500">No lists yet.</li>}
      </ul>
      {!readOnly && (
        <form onSubmit={add} className="mt-3 flex gap-2">
          <Input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="New list, like Gig prep" aria-label="New list name" className="min-h-11 flex-1" />
          <button type="submit" disabled={pending || !name.trim()} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-400 px-4 text-sm font-extrabold text-white hover:bg-brand-500 disabled:opacity-50">
            <Plus className="h-4 w-4" />Add
          </button>
        </form>
      )}
    </Modal>
  )
}
