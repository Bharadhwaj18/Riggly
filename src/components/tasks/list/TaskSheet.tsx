'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Plus, Star, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toaster'
import { deleteTask } from '@/actions/tasks'
import { cn } from '@/lib/utils'
import { RECURRENCE_LABELS, REMINDER_PRESETS, TASK_RECURRENCE, type Task, type TaskField, type TaskRecurrence } from '@/types/tasks'
import { CellMenu } from './CellMenu'
import { RepeatBadge } from '../RepeatBadge'
import { CustomCell, DateCell, DoneToggle, GroupCell, InlineText, PeopleCell, isStarred, type CellContext } from './cells'
import { TaskExtras } from './TaskExtras'

/**
 * Everything about one task, kept short: date, who, list and a star, then notes and a checklist. Repeat, extra fields
 * and delete sit under More. Full screen on a phone, a panel down the right on bigger screens. Every change saves as
 * you make it.
 */
export function TaskSheet({ task, c, fields, onClose, onEditField }: {
  task: Task | null
  c: CellContext
  fields: TaskField[]
  onClose: () => void
  /** Open the dialog to add a field (no argument) or change one. */
  onEditField: (field?: TaskField) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [more, setMore] = useState(false)
  const [deleting, start] = useTransition()
  if (!task) return null
  const done = task.progress === 'completed'
  const overdue = !done && !!task.due_date && task.due_date < c.today
  const starred = isStarred(task)

  const remove = () => {
    if (!window.confirm(`Delete “${task.title}”? This can’t be undone.`)) return
    start(async () => {
      const res = await deleteTask(task.id)
      if (res.error) { toast(res.error, 'error'); return }
      toast('Task deleted', 'success')
      onClose()
      router.refresh()
    })
  }

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
        <div className="flex items-start gap-1">
          <DoneToggle task={task} c={c} size={24} />
          <InlineText value={task.title} label="Task name" readOnly={c.readOnly} onSave={v => v && c.onPatch(task, { title: v })}
            className={cn('min-h-11 text-xl font-bold', done ? 'text-gray-400 line-through' : 'text-gray-900')} />
        </div>

        <div className="divide-y divide-brand-100 rounded-xl border border-brand-200 bg-white">
          <Line label="Date">
            <span className="flex items-center gap-1.5">
              <RepeatBadge recurrence={task.recurrence} />
              <DateCell value={task.due_date} label="Date" readOnly={c.readOnly} overdue={overdue} onChange={v => c.onPatch(task, { dueDate: v })} />
            </span>
          </Line>
          <Line label="Who"><PeopleCell task={task} c={c} size={24} /></Line>
          <Line label="List"><GroupCell task={task} c={c} /></Line>
          <Line label="Important">
            <button type="button" role="switch" aria-checked={starred} aria-label="Important" disabled={c.readOnly}
              onClick={() => c.onPatch(task, { priority: starred ? 'medium' : 'important' })}
              className={cn('flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-bold', starred ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600')}>
              <Star className={cn('h-5 w-5', starred && 'fill-current')} />{starred ? 'Yes' : 'No'}
            </button>
          </Line>
        </div>

        <TaskExtras task={task} c={c} stacked hideDelete />

        <div className="border-t border-brand-100 pt-3">
          <button type="button" onClick={() => setMore(m => !m)} aria-expanded={more}
            className="flex min-h-10 w-full items-center gap-1.5 text-left text-sm font-bold text-gray-600 hover:text-gray-900">
            <ChevronDown className={cn('h-4 w-4 transition-transform', more && 'rotate-180')} />More
          </button>
          {more && (
            <div className="mt-2 space-y-3">
              <div className="divide-y divide-brand-100 rounded-xl border border-brand-200 bg-white">
                <Line label="Repeat">
                  <CellMenu label="Repeat" disabled={c.readOnly} value={task.recurrence ?? 'never'}
                    trigger={<span className={cn('px-1 text-sm font-bold', task.recurrence ? 'text-gray-800' : 'text-gray-400')}>{task.recurrence ? RECURRENCE_LABELS[task.recurrence as TaskRecurrence] ?? 'Repeats' : 'Never'}</span>}
                    options={[{ value: 'never', label: 'Never' }, ...TASK_RECURRENCE.map(r => ({ value: r, label: RECURRENCE_LABELS[r] }))]}
                    onChange={v => c.onPatch(task, { recurrence: v === 'never' ? null : (v as TaskRecurrence) })} />
                </Line>
                <Line label="Remind me">
                  <CellMenu label="Remind me" disabled={c.readOnly} value={task.remind_days_before == null ? 'off' : String(task.remind_days_before)}
                    trigger={<span className={cn('px-1 text-sm font-bold', task.remind_days_before != null ? 'text-gray-800' : 'text-gray-400')}>{reminderLabel(task.remind_days_before)}</span>}
                    options={[{ value: 'off', label: 'No reminder' }, ...REMINDER_PRESETS.map(p => ({ value: String(p.value), label: p.label }))]}
                    onChange={v => c.onPatch(task, { remindDaysBefore: v === 'off' ? null : Number(v) })} />
                </Line>
              </div>
              {!task.due_date && !c.readOnly && <p className="-mt-1 px-1 text-xs text-gray-500">Repeat and reminders need a date. Set one above first.</p>}
              {fields.length > 0 && (
                <div className="divide-y divide-brand-100 rounded-xl border border-brand-200 bg-white">
                  {fields.map(f => (
                    <Line key={f.id} label={
                      <button type="button" disabled={c.readOnly} onClick={() => onEditField(f)} className="text-left disabled:cursor-default" title="Rename, change options or remove">{f.name}</button>
                    }>
                      <CustomCell task={task} field={f} c={c} />
                    </Line>
                  ))}
                </div>
              )}
              {!c.readOnly && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onEditField()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-brand-700 hover:bg-brand-50">
                    <Plus className="h-3.5 w-3.5" />Add a field (like Venue or Budget)
                  </button>
                  <button type="button" onClick={remove} disabled={deleting} className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" />Delete task
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** "1 day before", or a plain count for any other number of days. */
function reminderLabel(days: number | null) {
  if (days == null) return 'No reminder'
  return REMINDER_PRESETS.find(p => p.value === days)?.label ?? `${days} days before`
}

function Line({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 pl-3 pr-1.5">
      <span className="shrink-0 text-[13px] font-bold text-gray-500">{label}</span>
      <span className="flex min-w-0 justify-end">{children}</span>
    </div>
  )
}
