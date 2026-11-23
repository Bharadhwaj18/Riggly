'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { deleteBoard, renameBoard } from '@/actions/tasks'
import { useToast } from '@/components/ui/Toaster'
import type { Member, Task, TaskBoard } from '@/types/tasks'
import { KanbanBoard } from '../KanbanBoard'
import { TaskModal } from '../TaskModal'
import { LabelsManager } from '../LabelsManager'
import { CellMenu } from './CellMenu'

interface Props {
  boards: TaskBoard[]
  /** Already filtered by the shared Filter sheet. */
  tasks: Task[]
  members: Member[]
  nameById: Record<string, string>
  today: string
  /** One group, or every group when not set. */
  groupId?: string
  readOnly: boolean
  onNewGroup: () => void
  toolbar: ReactNode
}

const NEW = '__new__'
const ALL = '__all__'

/** The board: To do, Doing, Done. Every group at once, or one group. */
export function KanbanPanel({ boards, tasks, members, nameById, today, groupId, readOnly, onNewGroup, toolbar }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [, startTransition] = useTransition()
  const board = groupId ? boards.find(b => b.id === groupId) ?? null : null
  const shownBoards = board ? [board] : boards
  const shownTasks = useMemo(() => (board ? tasks.filter(t => t.board_id === board.id) : tasks), [tasks, board])
  const labelsById = useMemo(() => Object.fromEntries(boards.flatMap(b => b.labels).map(l => [l.id, l])), [boards])
  const openTask = openTaskId ? shownTasks.find(t => t.id === openTaskId) : undefined
  const openBoard = openTask ? boards.find(b => b.id === openTask.board_id) : undefined

  const rename = () => {
    if (!board) return
    setMenuOpen(false)
    const next = window.prompt('Rename this group', board.name)?.trim()
    if (!next || next === board.name) return
    startTransition(async () => { const r = await renameBoard(board.id, next); if (r.error) toast(r.error, 'error'); else router.refresh() })
  }
  const remove = () => {
    if (!board) return
    setMenuOpen(false)
    const count = tasks.filter(t => t.board_id === board.id).length
    if (!window.confirm(`Delete “${board.name}” and its ${count} task${count === 1 ? '' : 's'}? This can’t be undone.`)) return
    startTransition(async () => {
      const r = await deleteBoard(board.id)
      if (r.error) { toast(r.error, 'error'); return }
      toast('Group deleted', 'success')
      router.push('/tasks?view=kanban')
    })
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CellMenu label="Group" value={board?.id ?? ALL} className="min-h-10 rounded-xl border border-brand-200 bg-white px-3"
          trigger={<span className="text-sm font-extrabold text-gray-900">{board ? `Group: ${board.name}` : 'All groups'}</span>}
          options={[
            { value: ALL, label: 'All groups' },
            ...boards.map(b => ({ value: b.id, label: b.name })),
            ...(readOnly ? [] : [{ value: NEW, label: <span className="flex items-center gap-1.5 text-brand-700"><Plus className="h-4 w-4" />New group</span> }]),
          ]}
          onChange={v => (v === NEW ? onNewGroup() : router.push(v === ALL ? '/tasks?view=kanban' : `/tasks?view=kanban&group=${v}`))} />
        {toolbar}
        {board && !readOnly && <LabelsManager boardId={board.id} labels={board.labels} />}
        {board && !readOnly && (
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen(v => !v)} aria-label="Group options" aria-expanded={menuOpen}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-200 bg-white text-gray-600 hover:bg-brand-50">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="animate-menu-in absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded-2xl border border-brand-200 bg-white p-1 shadow-lg">
                  <button type="button" onClick={rename} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-gray-700 hover:bg-brand-50"><Pencil className="h-4 w-4" />Rename group</button>
                  <button type="button" onClick={remove} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" />Delete group</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <KanbanBoard boards={shownBoards} tasks={shownTasks} labelsById={labelsById} nameById={nameById} today={today}
        readOnly={readOnly} showGroup={!board && boards.length > 1} onOpenTask={setOpenTaskId} />

      {openTask && openBoard && (
        <TaskModal key={openTask.id} task={openTask}
          labels={openBoard.labels} members={members} onClose={() => setOpenTaskId(null)} />
      )}
    </div>
  )
}
