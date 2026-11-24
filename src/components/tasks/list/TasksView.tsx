'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, ChevronDown, ChevronRight, ListChecks, NotebookPen, Plus, Search, Star, X } from 'lucide-react'
import { patchTask, type TaskPatch } from '@/actions/tasks'
import { useToast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'
import { addDaysISO, addMonthsISO } from '@/lib/dates'
import { openCountByList, orderLists, sectionsByWhen, type TaskSection } from '@/lib/task-view'
import type { Member, Task, TaskBoard, TaskBucket, TaskField } from '@/types/tasks'
import { AddColumnDialog } from './AddColumnDialog'
import { RepeatBadge } from '../RepeatBadge'
import { TaskSheet } from './TaskSheet'
import { DoneToggle, Faces, isStarred, recentTick, shortDate, type CellContext } from './cells'
import { QuickAddBar } from './QuickAddBar'
import { ListsManager } from './ListsManager'
import { ListButton, ListRail } from './ListPicker'
import { CellMenu } from './CellMenu'

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
  openTaskId?: string
  /** Start on everyone's tasks instead of your own. */
  everyone?: boolean
  /** Start on one list. */
  listId?: string
  /** Personal space only: the "This one | All workspaces" switch. */
  scopeToggle?: React.ReactNode
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
  if (p.dueDate === null) { next.recurrence = null; next.remind_days_before = null }
  if (p.recurrence !== undefined) next.recurrence = p.recurrence
  if (p.remindDaysBefore !== undefined) next.remind_days_before = p.remindDaysBefore
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

/** When a repeating task's next copy is due, once this one is ticked off. */
function nextDue(due: string, recurrence: string) {
  if (recurrence === 'daily') return addDaysISO(due, 1)
  if (recurrence === 'weekly') return addDaysISO(due, 7)
  return addMonthsISO(due, 1)
}

/** How long a ticked task stays where it was (struck through) before it folds into Done. */
const SETTLE_MS = 2500


/**
 * Tasks: one list. Yours or everyone's, all lists or one, by when they're due. Tap a task to see the rest.
 */
export function TasksView(props: Props) {
  const { buckets, fields, members, nameById, avatars, today, currentUserId, readOnly } = props
  const boards = useMemo(() => orderLists(props.boards), [props.boards])
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  const [everyone, setEveryone] = useState(!!props.everyone || !currentUserId)
  const [listId, setListId] = useState<string | null>(props.listId && boards.some(b => b.id === props.listId) ? props.listId : null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)

  // Edits made here that the server hasn't sent back yet.
  const [patches, setPatches] = useState<Record<string, TaskPatch[]>>({})
  const [baseTasks, setBaseTasks] = useState(props.tasks)
  if (baseTasks !== props.tasks) { setBaseTasks(props.tasks); setPatches({}) }
  const tasks = useMemo(
    () => baseTasks.map(t => (patches[t.id] ?? []).reduce((acc, p) => applyPatch(acc, p, buckets), t)),
    [baseTasks, patches, buckets],
  )

  // Tasks just ticked stay in place for a moment, so you see them go, then fold into Done.
  const [settling, setSettling] = useState<Set<string>>(() => new Set())
  const settle = (id: string, on: boolean) => setSettling(prev => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next })

  const onPatch = (task: Task, patch: TaskPatch) => {
    setPatches(prev => ({ ...prev, [task.id]: [...(prev[task.id] ?? []), patch] }))
    const completing = patch.progress === 'completed' && task.progress !== 'completed'
    if (completing) { settle(task.id, true); window.setTimeout(() => settle(task.id, false), SETTLE_MS) }
    if (patch.progress && patch.progress !== 'completed') settle(task.id, false)
    startTransition(async () => {
      const res = await patchTask(task.id, patch)
      if (res.error) {
        toast(res.error, 'error')
        setPatches(prev => ({ ...prev, [task.id]: (prev[task.id] ?? []).filter(p => p !== patch) }))
        return
      }
      if (patch.boardId && patch.boardId !== task.board_id) toast(`Moved to ${boards.find(b => b.id === patch.boardId)?.name ?? 'another list'}`, 'success')
      if (completing && task.recurrence && task.due_date) toast(`Done. The next one is due ${shortDate(nextDue(task.due_date, task.recurrence))}.`, 'success')
      router.refresh()
    })
  }

  const c: CellContext = { boards, buckets, members, nameById, avatars, today, readOnly, onPatch }
  const boardIds = useMemo(() => new Set(boards.map(b => b.id)), [boards])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter(t =>
      boardIds.has(t.board_id) &&
      (everyone || (!!currentUserId && t.assignee_ids.includes(currentUserId))) &&
      (!listId || t.board_id === listId) &&
      (!q || t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q)))
  }, [tasks, boardIds, everyone, currentUserId, listId, query])
  const sections = useMemo(() => {
    // A task ticked a moment ago is placed as if still open; the row itself shows it done.
    const byId = new Map(shown.map(t => [t.id, t]))
    const placed = shown.map(t => (settling.has(t.id) ? { ...t, progress: 'not_started' } : t))
    return sectionsByWhen(placed, today, addDaysISO(today, 7), addDaysISO(today, -14))
      .map(s => ({ ...s, tasks: s.tasks.map(t => byId.get(t.id) ?? t) }))
  }, [shown, today, settling])

  const [fieldDialog, setFieldDialog] = useState<{ field?: TaskField } | null>(null)
  const [listsOpen, setListsOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(props.openTaskId ?? null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const isCollapsed = (s: TaskSection) => collapsed[s.key] ?? !!s.collapsedByDefault
  const openTask = openId ? tasks.find(t => t.id === openId) ?? null : null

  // A link to another list or view while already here (a notification, the sidebar) moves the screen there.
  const linkKey = `${props.everyone ? 1 : 0}:${props.listId ?? ''}:${props.openTaskId ?? ''}`
  const [seenLink, setSeenLink] = useState(linkKey)
  if (seenLink !== linkKey) {
    setSeenLink(linkKey)
    setEveryone(!!props.everyone || !currentUserId)
    setListId(props.listId && boards.some(b => b.id === props.listId) ? props.listId : null)
    if (props.openTaskId) setOpenId(props.openTaskId)
  }

  // Keep what you're looking at in the address, so a refresh or a shared link lands on the same view.
  useEffect(() => {
    const url = new URL(window.location.href)
    for (const k of ['view', 'group', 'mine']) url.searchParams.delete(k)
    if (everyone && currentUserId) url.searchParams.set('who', 'all'); else url.searchParams.delete('who')
    if (listId) url.searchParams.set('list', listId); else url.searchParams.delete('list')
    if (openId) url.searchParams.set('task', openId); else url.searchParams.delete('task')
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url)
  }, [everyone, listId, openId, currentUserId])

  const open = shown.filter(t => t.progress !== 'completed')
  const overdue = open.filter(t => t.due_date && t.due_date < today).length
  const listName = useMemo(() => Object.fromEntries(boards.map(b => [b.id, b.name])) as Record<string, string>, [boards])
  // Open tasks per list, for whoever's tasks are showing.
  const counts = useMemo(
    () => openCountByList(tasks.filter(t => boardIds.has(t.board_id)), t => everyone || (!!currentUserId && t.assignee_ids.includes(currentUserId))),
    [tasks, boardIds, everyone, currentUserId],
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const current = boards.find(b => b.id === listId)
  const picker = { boards, counts, value: listId, onChange: setListId, onManage: readOnly ? null : () => setListsOpen(true) }

  return (
    <div className="lg:grid lg:max-w-5xl lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
      {/* Laptop: the lists down the left. */}
      {boards.length > 0 && (
        <aside className="hidden lg:block">
          <div className="sticky top-8 pt-1"><ListRail {...picker} /></div>
        </aside>
      )}

      <div className="min-w-0 max-w-2xl">
        {props.scopeToggle && <div className="mb-3 flex justify-end">{props.scopeToggle}</div>}
        <div className="mb-4">
          <h1 className="font-display text-3xl font-bold text-gray-900">{current ? current.name : 'Tasks'}</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {open.length} {everyone ? 'open' : 'for you'}{overdue > 0 && <> · <span className="font-bold text-red-600">{overdue} overdue</span></>}
            {current?.is_general && ' · tasks that aren’t in a list'}
          </p>
        </div>

        {boards.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-brand-200 px-6 py-14 text-center">
            <p className="font-bold text-gray-800">Make your first list</p>
            <p className="max-w-sm text-sm text-gray-500">Lists keep related tasks together, like a show, “Gig prep” or “Merch”.</p>
            {!readOnly && <button type="button" onClick={() => setListsOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-400 px-4 text-sm font-extrabold text-white hover:bg-brand-500"><Plus className="h-4 w-4" />New list</button>}
          </div>
        ) : (
          <>
            {/* Whose tasks, and (on a phone) which list. */}
            <div data-tour="task-filters" className="mb-4 flex items-center gap-2">
              {currentUserId && (
                <div role="group" aria-label="Whose tasks" className="inline-flex shrink-0 rounded-full bg-brand-100 p-0.5">
                  {([['Mine', false], ['Everyone', true]] as const).map(([label, on]) => (
                    <button key={label} type="button" aria-pressed={everyone === on} onClick={() => setEveryone(on)}
                      className={cn('min-h-8 rounded-full px-4 text-sm font-bold transition-colors',
                        everyone === on ? 'bg-white text-gray-900 shadow-sm ring-1 ring-brand-200' : 'text-gray-500 hover:text-gray-800')}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="min-w-0 lg:hidden"><ListButton {...picker} open={pickerOpen} onOpenChange={setPickerOpen} /></div>
              <button type="button" onClick={() => { setSearching(s => !s); if (searching) setQuery('') }} aria-label={searching ? 'Close search' : 'Search tasks'} aria-pressed={searching}
                className={cn('ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full', searching ? 'bg-brand-100 text-gray-900' : 'text-gray-500 hover:bg-brand-50')}>
                {searching ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              </button>
            </div>
            {searching && (
              <input type="search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tasks and notes" aria-label="Search tasks"
                className="mb-4 min-h-10 w-full rounded-xl border border-brand-200 bg-white px-3 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
            )}

            {!readOnly && <QuickAddBar key={listId ?? 'any'} boards={boards} members={members} currentUserId={currentUserId} today={today} listId={listId} mineOnly={!everyone} />}

            <div className="space-y-5">
              {sections.map(s => (
                <section key={s.key}>
                  <SectionHeader s={s} collapsed={isCollapsed(s)} onToggle={() => setCollapsed(prev => ({ ...prev, [s.key]: !isCollapsed(s) }))} danger={s.key === 'overdue'} />
                  {!isCollapsed(s) && (
                    <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
                      {s.tasks.map(t => (
                        <TaskRow key={t.id} task={t} c={c} listName={listId ? null : listName[t.board_id]} showFaces={everyone} onOpen={() => setOpenId(t.id)} />
                      ))}
                    </div>
                  )}
                </section>
              ))}
              {shown.length === 0 && (
                <p className="rounded-2xl border-2 border-dashed border-brand-200 px-4 py-10 text-center text-sm text-gray-500">
                  {query ? 'No tasks match that search.'
                    : current ? <>Nothing open in {current.name}. <button type="button" onClick={() => setListId(null)} className="font-bold text-brand-700 hover:underline">See all lists</button></>
                      : everyone ? 'No tasks yet. Add one above.'
                        : <>Nothing on your plate. Add a task above, or <button type="button" onClick={() => setEveryone(true)} className="font-bold text-brand-700 hover:underline">see everyone’s</button>.</>}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <TaskSheet task={openTask} c={c} fields={fields} onClose={() => setOpenId(null)} onEditField={field => setFieldDialog({ field })} />
      {fieldDialog && <AddColumnDialog key={fieldDialog.field?.id ?? 'new'} open onOpenChange={o => { if (!o) setFieldDialog(null) }} field={fieldDialog.field} />}
      <ListsManager open={listsOpen} onOpenChange={setListsOpen} boards={boards} tasks={tasks} readOnly={readOnly} />
    </div>
  )
}

function SectionHeader({ s, collapsed, onToggle, danger }: { s: TaskSection; collapsed: boolean; onToggle: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={!collapsed}
      className={cn('mb-2 flex w-full items-center gap-1.5 px-1 text-left text-sm font-extrabold', danger ? 'text-red-600' : 'text-gray-700 hover:text-gray-900')}>
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      {s.label}<span className="font-bold text-gray-400">{s.tasks.length}</span>
    </button>
  )
}

/** One task: a round tick, its name, when it's due and which list. Tap it to open everything else. */
function TaskRow({ task: t, c, listName, showFaces, onOpen }: { task: Task; c: CellContext; listName: string | null; showFaces: boolean; onOpen: () => void }) {
  const done = t.progress === 'completed'
  const overdue = !done && !!t.due_date && t.due_date < c.today
  const dueToday = !done && t.due_date === c.today
  const starred = !done && isStarred(t)
  const checked = t.checklist.filter(i => i.done).length
  const meta = [
    t.due_date && !dueToday ? shortDate(t.due_date) : null,
    listName,
  ].filter(Boolean).join(' · ')
  return (
    <div data-task-row className="group animate-row-in flex min-h-[60px] items-center gap-1 border-b border-brand-100 py-1.5 pl-1.5 pr-3 last:border-b-0">
      <DoneToggle task={t} c={c} size={22} />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left">
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[15px] font-bold', done ? cn('strike-draw text-gray-400', recentTick(t.id) && 'animate-strike-draw') : 'text-gray-900')}>{t.title}</span>
          {(meta || t.recurrence || t.checklist.length > 0 || t.description) && (
            <span className={cn('mt-0.5 flex flex-wrap items-center gap-x-2 text-xs font-semibold', overdue ? 'text-red-600' : 'text-gray-500')}>
              {meta && <span>{meta}</span>}
              <RepeatBadge recurrence={t.recurrence} />
              {t.checklist.length > 0 && <span className="inline-flex items-center gap-0.5 text-gray-500"><ListChecks className="h-3.5 w-3.5" />{checked}/{t.checklist.length}</span>}
              {t.description && <NotebookPen className="h-3.5 w-3.5 text-gray-400" aria-label="Has notes" />}
            </span>
          )}
        </span>
        {starred && <Star className="h-4 w-4 shrink-0 fill-current text-amber-500" aria-label="Important" />}
        {showFaces && t.assignee_ids.length > 0 && <Faces ids={t.assignee_ids} c={c} size={26} />}
      </button>
      {!c.readOnly && c.boards.length > 1 && (
        <CellMenu label={`Move “${t.title}” to another list`} value={t.board_id}
          className="hidden shrink-0 gap-1 rounded-full border border-brand-200 bg-white px-2.5 text-xs font-bold text-gray-600 lg:inline-flex lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover:opacity-100 lg:aria-expanded:opacity-100"
          trigger={<span className="inline-flex items-center gap-1"><ArrowRightLeft className="h-3.5 w-3.5" />Move</span>}
          options={c.boards.map(b => ({ value: b.id, label: b.name }))}
          onChange={v => { if (v !== t.board_id) c.onPatch(t, { boardId: v }) }} />
      )}
    </div>
  )
}
