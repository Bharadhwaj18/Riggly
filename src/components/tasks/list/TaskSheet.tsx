'use client'

import { Plus, Settings2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { STATUS_TEXT } from '@/lib/task-view'
import type { Task, TaskField, TaskProgress } from '@/types/tasks'
import { RepeatBadge } from '../RepeatBadge'
import { CustomCell, DateCell, GroupCell, InlineText, PeopleCell, PriorityCell, type CellContext } from './cells'
import { TaskExtras } from './TaskExtras'

const STATUSES: TaskProgress[] = ['not_started', 'in_progress', 'completed']

/**
 * Everything about one task in one place. Full screen on a phone, a panel down the right on bigger screens.
 * Every change saves as you make it.
 */
export function TaskSheet({ task, c, fields, onClose, onEditField }: {
  task: Task | null
  c: CellContext
  fields: TaskField[]
  onClose: () => void
  /** Open the dialog to add a field (no argument) or change one. */
  onEditField: (field?: TaskField) => void
}) {
  if (!task) return null
  const overdue = task.progress !== 'completed' && !!task.due_date && task.due_date < c.today

  return (
    <Modal
      open
      onOpenChange={o => { if (!o) onClose() }}
      title="Task"
      className={cn(
        // Phones: the whole screen. Larger screens: a panel along the right edge, full height.
        'left-0 top-0 h-dvh max-h-none max-w-none translate-x-0 rounded-none pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]',
        'sm:left-auto sm:right-0 sm:top-0 sm:h-dvh sm:max-h-none sm:max-w-md sm:translate-x-0 sm:translate-y-0',
      )}
    >
      <div className="space-y-5 pb-6">
        <InlineText value={task.title} label="Task name" readOnly={c.readOnly} onSave={v => v && c.onPatch(task, { title: v })}
          className="min-h-11 text-xl font-bold text-gray-900" />

        <div role="radiogroup" aria-label="Status" className="flex rounded-xl bg-brand-100 p-1">
          {STATUSES.map(s => (
            <button key={s} type="button" role="radio" aria-checked={task.progress === s} disabled={c.readOnly}
              onClick={() => task.progress !== s && c.onPatch(task, { progress: s })}
              className={cn('min-h-10 flex-1 rounded-lg text-sm font-extrabold transition-colors',
                task.progress === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900')}>
              {STATUS_TEXT[s]}
            </button>
          ))}
        </div>

        <div className="divide-y divide-brand-100 rounded-xl border border-brand-200 bg-white">
          <Line label="Due">
            <span className="flex items-center gap-1.5">
              <RepeatBadge recurrence={task.recurrence} />
              <DateCell value={task.due_date} label="Due date" readOnly={c.readOnly} overdue={overdue} onChange={v => c.onPatch(task, { dueDate: v })} />
            </span>
          </Line>
          <Line label="Who"><PeopleCell task={task} c={c} size={24} /></Line>
          <Line label="Priority"><PriorityCell task={task} c={c} /></Line>
          <Line label="Group"><GroupCell task={task} c={c} /></Line>
          {fields.map(f => (
            <Line key={f.id} label={
              <button type="button" disabled={c.readOnly} onClick={() => onEditField(f)} className="text-left disabled:cursor-default" title="Rename, change options or remove">{f.name}</button>
            }>
              <CustomCell task={task} field={f} c={c} />
            </Line>
          ))}
        </div>
        {!c.readOnly && (
          <button type="button" onClick={() => onEditField()} className="-mt-3 inline-flex items-center gap-1.5 rounded-lg px-1 text-xs font-bold text-brand-700 hover:underline">
            {fields.length ? <Settings2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {fields.length ? 'Add another field' : 'Add a field (like Venue or Budget)'}
          </button>
        )}

        <TaskExtras task={task} c={c} stacked />
      </div>
    </Modal>
  )
}

function Line({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 pl-3 pr-1.5">
      <span className="shrink-0 text-[13px] font-bold text-gray-500">{label}</span>
      <span className="flex min-w-0 justify-end">{children}</span>
    </div>
  )
}
