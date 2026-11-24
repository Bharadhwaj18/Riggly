'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, FolderOpen, Plus, UserRound } from 'lucide-react'
import { createTask } from '@/actions/tasks'
import { useToast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'
import { addDaysISO } from '@/lib/dates'
import type { Member, TaskBoard } from '@/types/tasks'
import { CellMenu } from './CellMenu'
import { shortDate } from './cells'

const GROUP_KEY = 'tasks-quick-add-group'

const chip = 'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-extrabold transition-colors'
const chipOff = 'border-brand-200 bg-white text-gray-600 hover:bg-brand-50'
const chipOn = 'border-brand-400 bg-brand-100 text-brand-700'

/**
 * Add a task with its date, who's doing it and its list in one go: type, tap the chips you need, press Enter.
 * It goes in the list you're looking at, otherwise the one you used last on this device.
 */
export function QuickAddBar({ boards, members, currentUserId, today, listId }: { boards: TaskBoard[]; members: Member[]; currentUserId?: string; today: string; listId?: string | null }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState<string | null>(null)
  const [who, setWho] = useState<string[]>(currentUserId ? [currentUserId] : [])
  const [boardId, setBoardId] = useState(listId && boards.some(b => b.id === listId) ? listId : boards[0]?.id ?? '')
  // The list used last on this device, read after the first render so the server and browser agree.
  useEffect(() => {
    if (listId) return
    try {
      const saved = localStorage.getItem(GROUP_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && boards.some(b => b.id === saved)) setBoardId(saved)
    } catch { /* private mode */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const board = boards.find(b => b.id === boardId) ?? boards[0]

  const pickGroup = (id: string) => {
    setBoardId(id)
    try { localStorage.setItem(GROUP_KEY, id) } catch { /* private mode */ }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !board) return
    start(async () => {
      const res = await createTask({ boardId: board.id, title, dueDate: due, assigneeIds: who })
      if (res.error) { toast(res.error, 'error'); return }
      toast('Task added', 'success')
      setTitle('')
      setDue(null)
      router.refresh()
    })
  }

  const tomorrow = addDaysISO(today, 1)
  const whoLabel = who.length === 0 ? 'Nobody' : who.length === 1 ? (who[0] === currentUserId ? 'Me' : members.find(m => m.id === who[0])?.name ?? '1 person') : `${who.length} people`

  return (
    <form onSubmit={add} data-tour="task-add" className="mb-4 rounded-2xl border border-brand-200 bg-white p-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <Plus className="ml-1.5 h-5 w-5 shrink-0 text-brand-400" />
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a task…" aria-label="New task"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none" />
        <button type="submit" disabled={pending || !title.trim()}
          className="min-h-10 shrink-0 rounded-xl bg-brand-400 px-4 text-sm font-extrabold text-white hover:bg-brand-500 disabled:opacity-40">
          Add
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1">
        <button type="button" onClick={() => setDue(due === today ? null : today)} className={cn(chip, due === today ? chipOn : chipOff)}>Today</button>
        <button type="button" onClick={() => setDue(due === tomorrow ? null : tomorrow)} className={cn(chip, due === tomorrow ? chipOn : chipOff)}>Tomorrow</button>
        <label className={cn(chip, 'relative cursor-pointer', due && due !== today && due !== tomorrow ? chipOn : chipOff)}>
          <CalendarDays className="h-3.5 w-3.5" />
          {due && due !== today && due !== tomorrow ? shortDate(due) : 'Date'}
          <input type="date" aria-label="Due date" value={due ?? ''} onChange={e => setDue(e.target.value || null)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
        <CellMenu label="Who’s doing it" multiple value={who} className={cn(chip, who.length ? chipOn : chipOff)}
          trigger={<span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{whoLabel}</span>}
          options={members.map(m => ({ value: m.id, label: m.id === currentUserId ? `${m.name} (you)` : m.name }))}
          onChange={id => setWho(w => (w.includes(id) ? w.filter(x => x !== id) : [...w, id]))} />
        {boards.length > 1 && board && (
          <CellMenu label="List" value={board.id} className={cn(chip, chipOff)}
            trigger={<span className="inline-flex items-center gap-1.5"><FolderOpen className="h-3.5 w-3.5" />{board.name}</span>}
            options={boards.map(b => ({ value: b.id, label: b.name }))} onChange={pickGroup} />
        )}
      </div>
    </form>
  )
}
