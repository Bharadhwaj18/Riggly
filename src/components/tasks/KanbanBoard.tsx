'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus } from 'lucide-react'
import { createTask, moveTask, patchTask } from '@/actions/tasks'
import { useToast } from '@/components/ui/Toaster'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { positionBetween } from '@/lib/tasks'
import { STATUS_TEXT } from '@/lib/task-view'
import { TaskCard } from './TaskCard'
import type { TaskBoard, TaskLabel, Task, TaskProgress } from '@/types/tasks'

// The board's columns are the task's status, so the board and the list always agree.
export const BOARD_COLUMNS: TaskProgress[] = ['not_started', 'in_progress', 'completed']

interface Props {
  /** The groups whose tasks are shown; quick add puts new tasks in the first one unless picked. */
  boards: TaskBoard[]
  tasks: Task[]
  labelsById: Record<string, TaskLabel>
  nameById: Record<string, string>
  today: string
  readOnly: boolean
  /** Show which group each card is in (when the board shows more than one group). */
  showGroup: boolean
  onOpenTask: (id: string) => void
}

type Columns = Record<TaskProgress, string[]>

function buildColumns(tasks: Task[]): Columns {
  const cols = { not_started: [], in_progress: [], completed: [] } as Columns
  const sorted = [...tasks].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
  for (const t of sorted) (cols[t.progress as TaskProgress] ?? cols.not_started).push(t.id)
  return cols
}

export function KanbanBoard({ boards, tasks, labelsById, nameById, today, readOnly, showGroup, onOpenTask }: Props) {
  const router = useRouter()
  const tasksById = useMemo(() => Object.fromEntries(tasks.map(t => [t.id, t])) as Record<string, Task>, [tasks])
  const groupName = useMemo(() => Object.fromEntries(boards.map(b => [b.id, b.name])) as Record<string, string>, [boards])
  const propColumns = useMemo(() => buildColumns(tasks), [tasks])

  // Local copy so a drag moves cards instantly; it re-syncs whenever fresh server data arrives.
  const [columns, setColumns] = useState<Columns>(propColumns)
  const [prevProp, setPrevProp] = useState(propColumns)
  const [activeId, setActiveId] = useState<string | null>(null)
  if (propColumns !== prevProp && activeId === null) {
    setPrevProp(propColumns)
    setColumns(propColumns)
  }

  const toast = useToast()
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  )

  const findContainer = (id: string): TaskProgress | undefined =>
    (BOARD_COLUMNS as string[]).includes(id) ? (id as TaskProgress) : BOARD_COLUMNS.find(key => columns[key].includes(id))

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over) return
    const activeKey = String(active.id)
    const overKey = String(over.id)
    const from = findContainer(activeKey)
    const to = findContainer(overKey)
    if (!from || !to || from === to) return
    setColumns(prev => {
      const target = prev[to]
      let index: number
      if ((BOARD_COLUMNS as string[]).includes(overKey)) index = target.length
      else {
        const below = !!active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height / 2
        index = target.indexOf(overKey) + (below ? 1 : 0)
      }
      return { ...prev, [from]: prev[from].filter(id => id !== activeKey), [to]: [...target.slice(0, index), activeKey, ...target.slice(index)] }
    })
  }

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    setActiveId(null)
    const activeKey = String(active.id)
    if (!over || readOnly) { setColumns(propColumns); return }
    const overKey = String(over.id)
    const container = findContainer(activeKey)
    if (!container || container !== findContainer(overKey)) { setColumns(propColumns); return }

    let list = columns[container]
    const from = list.indexOf(activeKey)
    const to = (BOARD_COLUMNS as string[]).includes(overKey) ? from : list.indexOf(overKey)
    if (from !== to && to >= 0) list = arrayMove(list, from, to)
    setColumns(prev => ({ ...prev, [container]: list }))

    const task = tasksById[activeKey]
    const statusChanged = task.progress !== container
    const orderChanged = propColumns[container].join() !== list.join()
    if (!statusChanged && !orderChanged) return

    const index = list.indexOf(activeKey)
    const position = positionBetween(tasksById[list[index - 1]]?.position, tasksById[list[index + 1]]?.position)
    void (async () => {
      const results = await Promise.all([
        statusChanged ? patchTask(task.id, { progress: container }) : Promise.resolve({}),
        orderChanged ? moveTask(task.id, task.bucket_id, position) : Promise.resolve({}),
      ])
      const failed = results.find(r => 'error' in r && r.error) as { error?: string } | undefined
      if (failed?.error) { toast(failed.error, 'error'); setColumns(propColumns); return }
      router.refresh()
    })()
  }

  const activeTask = activeId ? tasksById[activeId] : null

  return (
    <DndContext id="task-board" sensors={sensors} collisionDetection={closestCorners}
      onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}
      onDragCancel={() => { setActiveId(null); setColumns(propColumns) }}>
      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {BOARD_COLUMNS.map(status => (
          <Column key={status} status={status} taskIds={columns[status]} tasksById={tasksById} labelsById={labelsById} nameById={nameById}
            groupName={showGroup ? groupName : null} today={today} boards={boards} readOnly={readOnly} onOpenTask={onOpenTask} />
        ))}
      </div>
      <DragOverlay>
        {activeTask && (
          <div className="rotate-2 cursor-grabbing">
            <TaskCard task={activeTask} labelsById={labelsById} nameById={nameById} today={today} onOpen={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

const COLUMN_TONE: Record<TaskProgress, string> = {
  not_started: 'bg-gray-400',
  in_progress: 'bg-sky-500',
  completed: 'bg-emerald-500',
}

function Column({ status, taskIds, tasksById, labelsById, nameById, groupName, today, boards, readOnly, onOpenTask }: {
  status: TaskProgress
  taskIds: string[]
  tasksById: Record<string, Task>
  labelsById: Record<string, TaskLabel>
  nameById: Record<string, string>
  groupName: Record<string, string> | null
  today: string
  boards: TaskBoard[]
  readOnly: boolean
  onOpenTask: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section className="w-72 shrink-0 rounded-xl bg-brand-50/70 p-2.5" aria-label={STATUS_TEXT[status]}>
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span className={cn('h-2 w-2 rounded-full', COLUMN_TONE[status])} aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-gray-800">{STATUS_TEXT[status]}</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-500">{taskIds.length}</span>
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={cn('min-h-[3rem] space-y-2 rounded-lg p-0.5 transition-colors', isOver && 'bg-brand-100/60')}>
          {taskIds.map(id => tasksById[id] && (
            <SortableCard key={id} task={tasksById[id]} labelsById={labelsById} nameById={nameById} today={today}
              group={groupName?.[tasksById[id].board_id] ?? null} onOpen={() => onOpenTask(id)} />
          ))}
        </div>
      </SortableContext>
      {!readOnly && status !== 'completed' && <QuickAdd boards={boards} status={status} />}
    </section>
  )
}

function SortableCard({ task, labelsById, nameById, today, group, onOpen }: { task: Task; labelsById: Record<string, TaskLabel>; nameById: Record<string, string>; today: string; group: string | null; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && 'opacity-30')} {...attributes} tabIndex={-1} {...listeners}>
      {group && <p className="mb-0.5 truncate px-1 text-[10px] font-extrabold uppercase tracking-wide text-gray-400">{group}</p>}
      <TaskCard task={task} labelsById={labelsById} nameById={nameById} today={today} onOpen={onOpen} />
    </div>
  )
}

/** "Add task" at the bottom of a column: it lands in that column, in the group you pick when there's more than one. */
function QuickAdd({ boards, status }: { boards: TaskBoard[]; status: TaskProgress }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [boardId, setBoardId] = useState(boards[0]?.id ?? '')
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const submit = () => {
    if (!title.trim()) { setOpen(false); return }
    startTransition(async () => {
      const result = await createTask({ boardId, title })
      if (result.error || !result.id) { toast(result.error ?? 'Couldn’t add that task', 'error'); return }
      if (status !== 'not_started') await patchTask(result.id, { progress: status })
      setTitle('')
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-white hover:text-gray-700">
        <Plus className="h-4 w-4" /> Add task
      </button>
    )
  }
  return (
    <div className="mt-2 space-y-2">
      <Input autoFocus placeholder="What needs doing?" value={title} disabled={isPending} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setTitle(''); setOpen(false) } }} />
      {boards.length > 1 && (
        <select aria-label="Group for the new task" value={boardId} onChange={e => setBoardId(e.target.value)}
          className="w-full rounded-md border border-brand-200 bg-white px-2 py-1.5 text-sm text-gray-900">
          {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} loading={isPending} disabled={!title.trim()}>Add</Button>
        <Button size="sm" variant="ghost" onClick={() => { setTitle(''); setOpen(false) }}>Done</Button>
      </div>
    </div>
  )
}
