'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Flag, ListChecks, NotebookPen, Plus, Search, SlidersHorizontal, SquareKanban, UserRound, Users } from 'lucide-react'
import { createBoard, createTask, patchTask, type TaskPatch } from '@/actions/tasks'
import { useToast } from '@/components/ui/Toaster'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { DEFAULT_VIEW, activeFilterCount, filterTasks, groupTasks, sectionsByWhen, type TaskSection, type TaskViewState } from '@/lib/task-view'
import { addDaysISO } from '@/lib/dates'
import type { Member, Task, TaskBoard, TaskBucket, TaskField } from '@/types/tasks'
import { CellMenu } from './CellMenu'
import { AddColumnDialog } from './AddColumnDialog'
import { FilterSheet } from './FilterSheet'
import { RepeatBadge } from '../RepeatBadge'
import { TaskSheet } from './TaskSheet'
import { DoneToggle, Faces, recentTick, shortDate, type CellContext } from './cells'
import { KanbanPanel } from './KanbanPanel'
import { QuickAddBar } from './QuickAddBar'

interface Props {
  boards: TaskBoard[]
  buckets: TaskBucket[]
  tasks: Task[]
  fields: TaskField[]
  members: Member[]
  nameById: Record<string, string>
  avatars: Record<string, string>
  today: string
  currentUserId?: string
  readOnly: boolean
  /** My tasks (by when they're due), everyone's list, or the board. */
  view: 'mine' | 'list' | 'kanban'
  kanbanGroupId?: string
  openTaskId?: string
  /** Personal space only: the "This one | All workspaces" switch. */
  scopeToggle?: React.ReactNode
}

const VIEW_KEY = 'tasks-view-v2'

function readJson<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback } catch { return fallback }
}

/** Apply an edit to the task on screen straight away; the server catches up behind it. */
function applyPatch(t: Task, p: TaskPatch, buckets: TaskBucket[]): Task {
  const next = { ...t }
  if (p.title !== undefined) next.title = p.title
  if (p.progress !== undefined) { next.progress = p.progress; next.completed_at = p.progress === 'completed' ? (t.completed_at ?? new Date().toISOString()) : null }
  if (p.priority !== undefined) next.priority = p.priority
  if (p.dueDate !== undefined) next.due_date = p.dueDate
  if (p.startDate !== undefined) next.start_date = p.startDate
  if (p.assigneeIds !== undefined) next.assignee_ids = p.assigneeIds
  if (p.description !== undefined) next.description = p.description
  if (p.checklist !== undefined) next.checklist = p.checklist.map(c => ({ id: c.id ?? crypto.randomUUID(), text: c.text, done: c.done }))
  if (p.boardId !== undefined && p.boardId !== t.board_id) {
    next.board_id = p.boardId
    next.bucket_id = buckets.filter(b => b.board_id === p.boardId).sort((a, b) => a.position - b.position)[0]?.id ?? t.bucket_id
  } else if (p.bucketId !== undefined) next.bucket_id = p.bucketId
  if (p.custom) {
    const c = { ...((t.custom && typeof t.custom === 'object' && !Array.isArray(t.custom)) ? t.custom as Record<string, unknown> : {}) }
    if (p.custom.value === null || p.custom.value === '') delete c[p.custom.fieldId]
    else c[p.custom.fieldId] = p.custom.value
    next.custom = c as Task['custom']
  }
  return next
}

export function TasksView(props: Props) {
  const { boards, buckets, fields, members, nameById, avatars, today, currentUserId, readOnly } = props
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  const [view, setView] = useState<TaskViewState>(DEFAULT_VIEW)
  // Saved per device; read after the first render so the server and browser agree.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(v => ({ ...readJson(VIEW_KEY, DEFAULT_VIEW), query: v.query }))
  }, [])
  const changeView = (v: TaskViewState) => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ ...v, query: '' })) } catch { /* private mode */ }
  }

  // Edits made here that the server hasn't sent back yet.
  const [patches, setPatches] = useState<Record<string, TaskPatch[]>>({})
  const [baseTasks, setBaseTasks] = useState(props.tasks)
  if (baseTasks !== props.tasks) { setBaseTasks(props.tasks); setPatches({}) }
  const tasks = useMemo(
    () => baseTasks.map(t => (patches[t.id] ?? []).reduce((acc, p) => applyPatch(acc, p, buckets), t)),
    [baseTasks, patches, buckets],
  )

  const onPatch = (task: Task, patch: TaskPatch) => {
    setPatches(prev => ({ ...prev, [task.id]: [...(prev[task.id] ?? []), patch] }))
    startTransition(async () => {
      const res = await patchTask(task.id, patch)
      if (res.error) {
        toast(res.error, 'error')
        setPatches(prev => ({ ...prev, [task.id]: (prev[task.id] ?? []).filter(p => p !== patch) }))
        return
      }
      router.refresh()
    })
  }

  const c: CellContext = { boards, buckets, members, nameById, avatars, today, readOnly, onPatch }
  const boardIds = useMemo(() => new Set(boards.map(b => b.id)), [boards])
  const mine = props.view === 'mine'
  const shown = useMemo(() => {
    if (!mine) return filterTasks(tasks, view, { today, userId: currentUserId, boardIds })
    const q = view.query.trim().toLowerCase()
    return tasks.filter(t => boardIds.has(t.board_id) && !!currentUserId && t.assignee_ids.includes(currentUserId) && (!q || t.title.toLowerCase().includes(q)))
  }, [mine, tasks, view, today, currentUserId, boardIds])
  const sections = useMemo(
    () => (mine ? sectionsByWhen(shown, today, addDaysISO(today, 7), addDaysISO(today, -14)) : groupTasks(shown, view, { boards, nameById })),
    [mine, shown, today, view, boards, nameById],
  )

  const [filterOpen, setFilterOpen] = useState(false)
  const [fieldDialog, setFieldDialog] = useState<{ field?: TaskField } | null>(null)
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(props.openTaskId ?? null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const isCollapsed = (s: TaskSection) => collapsed[s.key] ?? !!s.collapsedByDefault
  const openTask = openId ? tasks.find(t => t.id === openId) ?? null : null

  const counted = mine ? shown : tasks.filter(t => boardIds.has(t.board_id))
  const openCount = counted.filter(t => t.progress !== 'completed').length
  const overdue = counted.filter(t => t.progress !== 'completed' && t.due_date && t.due_date < today).length
  const filters = activeFilterCount(view)
  const groupName = useMemo(() => Object.fromEntries(boards.map(b => [b.id, b.name])) as Record<string, string>, [boards])

  const viewTabs = (
    <div role="tablist" aria-label="View" className="flex rounded-xl bg-brand-100 p-1">
      {([['mine', 'Mine', UserRound], ['list', 'Everyone', Users], ['kanban', 'Board', SquareKanban]] as const).map(([key, label, Icon]) => (
        <Link key={key} role="tab" aria-selected={props.view === key} href={key === 'mine' ? '/tasks' : key === 'list' ? '/tasks?view=list' : `/tasks?view=kanban${props.kanbanGroupId ? `&group=${props.kanbanGroupId}` : ''}`}
          className={cn('flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-extrabold transition-colors sm:px-3', props.view === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900')}>
          <Icon className="hidden h-4 w-4 sm:block" />{label}
        </Link>
      ))}
    </div>
  )

  const header = (
    <>
    {props.scopeToggle && <div className="mb-3 flex justify-end">{props.scopeToggle}</div>}
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-bold text-gray-900">Tasks</h1>
        <p className="mt-0.5 hidden text-sm text-gray-500 sm:block">{mine ? `${openCount} on your plate` : `${openCount} open across ${boards.length} ${boards.length === 1 ? 'group' : 'groups'}`}{overdue > 0 && <> · <span className="font-bold text-red-600">{overdue} overdue</span></>}</p>
      </div>
      {viewTabs}
    </div>
    </>
  )

  if (boards.length === 0) {
    return (
      <div>
        {header}
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-brand-200 px-6 py-14 text-center">
          <p className="font-bold text-gray-800">No task groups yet</p>
          <p className="max-w-sm text-sm text-gray-500">Groups keep related tasks together, like “Gig prep” or “Merch”. Make your first one to start adding tasks.</p>
          {!readOnly && <button type="button" onClick={() => setNewGroupOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-400 px-4 text-sm font-extrabold text-white hover:bg-brand-500"><Plus className="h-4 w-4" />New group</button>}
        </div>
        <NewGroupDialog open={newGroupOpen} onOpenChange={setNewGroupOpen} />
      </div>
    )
  }

  if (props.view === 'kanban') {
    return (
      <div>
        {header}
        <KanbanPanel boards={boards} tasks={shown} members={members} nameById={nameById} today={today} groupId={props.kanbanGroupId}
          readOnly={readOnly} onNewGroup={() => setNewGroupOpen(true)}
          toolbar={<FilterButton count={filters} onClick={() => setFilterOpen(true)} />} />
        <FilterSheet open={filterOpen} onOpenChange={setFilterOpen} view={view} onChange={changeView} members={members} boards={boards} currentUserId={currentUserId} shownCount={shown.length} />
        <NewGroupDialog open={newGroupOpen} onOpenChange={setNewGroupOpen} />
      </div>
    )
  }

  const addTarget = (s: TaskSection): { boardId: string; extra: TaskPatch } => {
    const fallback = view.groups.length === 1 ? view.groups[0] : boards[0].id
    if (view.groupBy === 'group') return { boardId: s.key, extra: {} }
    if (view.groupBy === 'status' && s.key !== 'not_started') return { boardId: fallback, extra: { progress: s.key as Task['progress'] as TaskPatch['progress'] } }
    if (view.groupBy === 'priority') return { boardId: fallback, extra: { priority: s.key } }
    return { boardId: fallback, extra: {} }
  }

  return (
    <div className="max-w-3xl">
      {header}

      {!readOnly && <QuickAddBar boards={boards} members={members} currentUserId={currentUserId} today={today} />}

      <div className="mb-4 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="search" value={view.query} onChange={e => setView({ ...view, query: e.target.value })} placeholder="Search tasks" aria-label="Search tasks"
            className="min-h-10 w-full rounded-xl border border-brand-200 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
        </div>
        {!mine && <FilterButton count={filters} onClick={() => setFilterOpen(true)} />}
      </div>

      <div className="space-y-4">
        {sections.map(s => (
          <section key={s.key}>
            {(mine || view.groupBy !== 'none') && (
              <SectionHeader s={s} collapsed={isCollapsed(s)} onToggle={() => setCollapsed(prev => ({ ...prev, [s.key]: !isCollapsed(s) }))} className={cn('px-1 pb-2 pt-1', mine && s.key === 'overdue' && 'text-red-600')} />
            )}
            {!isCollapsed(s) && (
              <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
                {s.tasks.map(t => (
                  <TaskRow key={t.id} task={t} c={c} groupName={(!mine && view.groupBy === 'group') || boards.length < 2 ? null : groupName[t.board_id]} onOpen={() => setOpenId(t.id)} />
                ))}
                {!readOnly && !mine && <AddTaskRow boards={boards} target={addTarget(s)} className="pl-3" />}
              </div>
            )}
          </section>
        ))}
        {shown.length === 0 && (
          <p className="rounded-2xl border-2 border-dashed border-brand-200 px-4 py-10 text-center text-sm text-gray-500">
            {mine
              ? view.query ? 'None of your tasks match.' : <>Nothing on your plate. Tasks given to you show up here; <Link href="/tasks?view=list" className="font-bold text-brand-700 hover:underline">see everyone’s</Link>.</>
              : 'No tasks match. Try clearing a filter.'}
          </p>
        )}
      </div>

      <TaskSheet task={openTask} c={c} fields={fields} onClose={() => setOpenId(null)} onEditField={field => setFieldDialog({ field })} />
      <FilterSheet open={filterOpen} onOpenChange={setFilterOpen} view={view} onChange={changeView} members={members} boards={boards} currentUserId={currentUserId} shownCount={shown.length} />
      {fieldDialog && <AddColumnDialog key={fieldDialog.field?.id ?? 'new'} open onOpenChange={o => { if (!o) setFieldDialog(null) }} field={fieldDialog.field} />}
      <NewGroupDialog open={newGroupOpen} onOpenChange={setNewGroupOpen} />
    </div>
  )
}

function FilterButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-extrabold text-gray-800', count ? 'border-brand-400 bg-brand-100' : 'border-brand-200 bg-white hover:bg-brand-50')}>
      <SlidersHorizontal className="h-4 w-4" />Filter
      {count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-400 px-1.5 text-[11px] text-white">{count}</span>}
    </button>
  )
}

function SectionHeader({ s, collapsed, onToggle, className }: { s: TaskSection; collapsed: boolean; onToggle: () => void; className?: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={!collapsed}
      className={cn('flex w-full items-center gap-2 text-left text-xs font-extrabold uppercase tracking-[0.1em] text-gray-500 hover:text-gray-800', className)}>
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      {s.label}<span className="text-gray-400">{s.tasks.length}</span>
    </button>
  )
}

/** One task: a tick, its name, when it's due and who's on it. Tap anywhere else to open it. */
function TaskRow({ task: t, c, groupName, onOpen }: { task: Task; c: CellContext; groupName: string | null; onOpen: () => void }) {
  const done = t.progress === 'completed'
  const overdue = !done && !!t.due_date && t.due_date < c.today
  const dueToday = !done && t.due_date === c.today
  const flagged = !done && (t.priority === 'urgent' || t.priority === 'important')
  const checked = t.checklist.filter(i => i.done).length
  return (
    <div data-task-row className="animate-row-in flex min-h-[60px] items-center gap-1 border-b border-brand-100 py-1.5 pl-1.5 pr-3 last:border-b-0">
      <DoneToggle task={t} c={c} size={22} />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left hover:bg-brand-50/60">
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[15px] font-bold', done ? cn('strike-draw text-gray-400', recentTick(t.id) && 'animate-strike-draw') : 'text-gray-900')}>{t.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs font-bold">
            {t.due_date
              ? <span className={overdue ? 'text-red-600' : dueToday ? 'text-amber-600' : 'text-gray-500'}>{overdue ? `Overdue · ${shortDate(t.due_date)}` : dueToday ? 'Due today' : `Due ${shortDate(t.due_date)}`}</span>
              : !done && <span className="text-gray-400">No date</span>}
            <RepeatBadge recurrence={t.recurrence} />
            {flagged && <span className={cn('inline-flex items-center gap-0.5', t.priority === 'urgent' ? 'text-red-600' : 'text-amber-600')}><Flag className="h-3 w-3" />{t.priority === 'urgent' ? 'Urgent' : 'Important'}</span>}
            {t.checklist.length > 0 && <span className="inline-flex items-center gap-0.5 text-gray-500"><ListChecks className="h-3.5 w-3.5" />{checked}/{t.checklist.length}</span>}
            {t.description && <NotebookPen className="h-3.5 w-3.5 text-gray-400" aria-label="Has notes" />}
            {groupName && <span className="rounded bg-gray-100 px-1.5 py-px text-[10px] font-extrabold uppercase tracking-wide text-gray-500">{groupName}</span>}
          </span>
        </span>
        {t.assignee_ids.length > 0 && <Faces ids={t.assignee_ids} c={c} size={26} />}
      </button>
    </div>
  )
}

/** "Add a task" at the bottom of a section: type a name, press Enter. Lands in that section. */
function AddTaskRow({ boards, target, className }: { boards: TaskBoard[]; target: { boardId: string; extra: TaskPatch }; className?: string }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [boardId, setBoardId] = useState(target.boardId)
  const [pending, startTransition] = useTransition()
  const board = boards.find(b => b.id === boardId) ?? boards[0]

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    startTransition(async () => {
      const res = await createTask({ boardId: board.id, title })
      if (res.error || !res.id) { toast(res.error ?? 'Couldn’t add that task', 'error'); return }
      if (Object.keys(target.extra).length) await patchTask(res.id, target.extra)
      setTitle('')
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button type="button" data-tour="task-add" onClick={() => setOpen(true)} className={cn('flex min-h-11 w-full items-center gap-2 border-t border-brand-100 text-left text-sm font-bold text-gray-500 hover:text-gray-800', className)}>
        <Plus className="h-4 w-4" />Add a task
      </button>
    )
  }
  return (
    <form onSubmit={add} className={cn('flex flex-wrap items-center gap-2 border-t border-brand-100 py-2 pr-3', className)}>
      <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs doing?" aria-label="New task name"
        onKeyDown={e => { if (e.key === 'Escape') { setTitle(''); setOpen(false) } }} className="min-h-10 min-w-[12rem] flex-1" />
      {boards.length > 1 && (
        <CellMenu label="Group for the new task" value={board.id} className="min-h-10 rounded-xl border border-brand-200 bg-white px-2.5"
          trigger={<span className="text-sm font-bold text-gray-800">{board.name}</span>}
          options={boards.map(b => ({ value: b.id, label: b.name }))} onChange={setBoardId} />
      )}
      <button type="submit" disabled={pending || !title.trim()} className="min-h-10 rounded-xl bg-brand-400 px-4 text-sm font-extrabold text-white hover:bg-brand-500 disabled:opacity-50">Add</button>
      <button type="button" onClick={() => { setTitle(''); setOpen(false) }} className="min-h-10 rounded-xl px-3 text-sm font-bold text-gray-500 hover:bg-brand-50">Cancel</button>
    </form>
  )
}

export function NewGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  const toast = useToast()
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const res = await createBoard(name)
      if (res.error) { toast(res.error, 'error'); return }
      toast('Group created', 'success')
      setName('')
      onOpenChange(false)
      router.refresh()
    })
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New group" description="Keeps related tasks together, like “Gig prep” or “Merch”."
      className="max-w-md max-sm:top-auto max-sm:bottom-0 max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-3xl">
      <form onSubmit={save} className="mt-4 space-y-4">
        <Input autoFocus value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="Group name" aria-label="Group name" className="min-h-12 text-base" />
        <button type="submit" disabled={pending || !name.trim()} className="min-h-12 w-full rounded-2xl bg-brand-400 text-[15px] font-extrabold text-white hover:bg-brand-500 disabled:opacity-50">Create group</button>
      </form>
    </Modal>
  )
}
