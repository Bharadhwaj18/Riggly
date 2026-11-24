'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, FolderOpen, Plus, UserRound } from 'lucide-react'
import { createTask } from '@/actions/tasks'
import { useToast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'
import { addDaysISO } from '@/lib/dates'
import type { Member, TaskBoard } from '@/types/tasks'
import { CellMenu } from './CellMenu'
import { shortDate } from './cells'

const pill = 'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-extrabold transition-colors'
const pillOff = 'border-brand-200 bg-white text-gray-600 hover:bg-brand-50'
const pillOn = 'border-brand-400 bg-brand-100 text-gray-900'

/** "Arjun" from "Arjun (demo)" or "Asha (you)". */
const firstName = (name: string) => name.replace(/\s*\(.*\)\s*$/, '').split(/\s+/)[0] || name

/**
 * Add a task. Just a box until you start: then When, For and In appear, and a line reads them back
 * ("Due tomorrow, for you, in Merch"), so it's clear they describe the new task, not the list below.
 * With no list picked it goes in General.
 */
export function QuickAddBar({ boards, members, currentUserId, today, listId, mineOnly = false }: {
  /** In display order (General first). */
  boards: TaskBoard[]; members: Member[]; currentUserId?: string; today: string
  /** The list being looked at: new tasks go there. */
  listId?: string | null
  /** The list below shows only your tasks, so a task for someone else won't appear in it. */
  mineOnly?: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [title, setTitle] = useState('')
  const [active, setActive] = useState(false)
  const [due, setDue] = useState<string | null>(null)
  const [who, setWho] = useState<string[]>(currentUserId ? [currentUserId] : [])
  const general = boards.find(b => b.is_general)
  const [boardId, setBoardId] = useState(listId && boards.some(b => b.id === listId) ? listId : general?.id ?? boards[0]?.id ?? '')
  const board = boards.find(b => b.id === boardId) ?? general ?? boards[0]
  const open = active || !!title.trim()

  const tomorrow = addDaysISO(today, 1)
  const nextWeek = addDaysISO(today, 7)
  const dueWord = due === null ? null : due === today ? 'today' : due === tomorrow ? 'tomorrow' : `on ${shortDate(due)}`
  const duePill = due === null ? 'No date' : due === today ? 'Today' : due === tomorrow ? 'Tomorrow' : shortDate(due)
  const nameOf = (id: string) => members.find(m => m.id === id)?.name ?? 'someone'
  const forWord = who.length === 0 ? 'nobody yet'
    : who.length === 1 ? (who[0] === currentUserId ? 'you' : firstName(nameOf(who[0])))
      : who.includes(currentUserId ?? '') ? `you and ${who.length - 1} more` : `${who.length} people`

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !board) return
    start(async () => {
      const res = await createTask({ boardId: board.id, title, dueDate: due, assigneeIds: who })
      if (res.error) { toast(res.error, 'error'); return }
      // Say where it went when it won't show in the list you're looking at.
      const otherList = !!listId && board.id !== listId
      const notMine = mineOnly && !(currentUserId && who.includes(currentUserId))
      toast(otherList ? `Added to ${board.name}` : notMine ? 'Added. It’s not yours, so it’s under Everyone.' : 'Task added', 'success')
      setTitle('')
      setDue(null)
      input.current?.focus()
      router.refresh()
    })
  }

  return (
    <form onSubmit={add} data-tour="task-add"
      onFocus={() => setActive(true)}
      onBlur={e => {
        const form = e.currentTarget
        // Menus open on top of the page, outside the form: wait a beat, and stay open while one is up or anything's set.
        window.setTimeout(() => {
          if (form.contains(document.activeElement) || document.querySelector('[role="listbox"]')) return
          if (!input.current?.value.trim()) setActive(false)
        }, 150)
      }}
      className={cn('mb-5 rounded-2xl border bg-white p-2 transition-colors', open ? 'border-brand-400 shadow-sm' : 'border-brand-200')}>
      <div className="flex items-center gap-2">
        <Plus className="ml-1.5 h-5 w-5 shrink-0 text-brand-400" />
        <input ref={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a task" aria-label="New task" enterKeyHint="done"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none" />
        {open && (
          <button type="submit" disabled={pending || !title.trim()}
            className="min-h-10 shrink-0 rounded-xl bg-brand-400 px-4 text-sm font-extrabold text-white hover:bg-brand-500 disabled:opacity-40">
            Add
          </button>
        )}
      </div>

      {open && (
        <div className="animate-fade-up px-1 pb-1">
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <CellMenu label="When" value={due === null ? 'none' : due === today ? 'today' : due === tomorrow ? 'tomorrow' : due === nextWeek ? 'week' : 'other'}
              className={cn(pill, due ? pillOn : pillOff)}
              trigger={<span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{duePill}</span>}
              options={[
                { value: 'none', label: 'No date' },
                { value: 'today', label: 'Today' },
                { value: 'tomorrow', label: 'Tomorrow' },
                { value: 'week', label: `In a week (${shortDate(nextWeek)})` },
              ]}
              onChange={v => setDue(v === 'today' ? today : v === 'tomorrow' ? tomorrow : v === 'week' ? nextWeek : null)}
              footer={
                <label className="flex min-h-10 items-center justify-between gap-2 rounded-xl px-2.5 text-sm font-semibold text-gray-800">
                  Pick a date
                  <input type="date" value={due ?? ''} onChange={e => setDue(e.target.value || null)} aria-label="Pick a date"
                    className="min-h-9 rounded-lg border border-brand-200 bg-white px-2 text-sm text-gray-900" />
                </label>
              } />
            <CellMenu label="Who it’s for" multiple value={who}
              className={cn(pill, who.length ? pillOn : pillOff)}
              trigger={<span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />For {forWord}</span>}
              options={members.map(m => ({ value: m.id, label: m.name }))}
              onChange={id => setWho(w => (w.includes(id) ? w.filter(x => x !== id) : [...w, id]))}
              footer={who.length > 0 && (
                <button type="button" onClick={() => setWho([])} className="flex min-h-10 w-full items-center rounded-xl px-2.5 text-left text-sm font-semibold text-gray-600 hover:bg-brand-50">
                  Nobody yet
                </button>
              )} />
            {board && (
              <CellMenu label="Which list" value={board.id} className={cn(pill, pillOff)}
                trigger={<span className="inline-flex items-center gap-1.5"><FolderOpen className="h-3.5 w-3.5" />In {board.name}</span>}
                options={boards.map(b => ({ value: b.id, label: b.name }))} onChange={setBoardId} />
            )}
          </div>
          {board && (
            <p className="mt-2 px-1 text-xs text-gray-500">
              {dueWord ? `Due ${dueWord}` : 'No date'}, for {forWord}, in {board.name}.
              {board.is_general && !listId && ' Pick a list, or it goes in General.'}
            </p>
          )}
        </div>
      )}
    </form>
  )
}
