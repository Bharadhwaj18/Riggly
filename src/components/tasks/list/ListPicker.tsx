'use client'

import { Check, ChevronDown, FolderOpen, Inbox, Pencil, Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import type { TaskBoard } from '@/types/tasks'

interface Props {
  /** Already in display order (General first). */
  boards: TaskBoard[]
  /** Open tasks per list for whoever's tasks are showing. */
  counts: Record<string, number>
  /** null = All lists. */
  value: string | null
  onChange: (id: string | null) => void
  /** Opens the lists editor (new, rename, delete). */
  onManage: (() => void) | null
}

/** "Show tasks from": All lists, General, then the band's own lists, each with how many are open. */
function ListOptions({ boards, counts, value, onChange, onManage, onDone }: Props & { onDone?: () => void }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const general = boards.filter(b => b.is_general)
  const rest = boards.filter(b => !b.is_general)
  const pick = (id: string | null) => { onChange(id); onDone?.() }
  const item = (id: string | null, name: string, count: number, icon?: React.ReactNode) => {
    const on = value === id
    return (
      <button key={id ?? 'all'} type="button" aria-pressed={on} onClick={() => pick(id)}
        className={cn('flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm transition-colors',
          on ? 'bg-brand-100 font-extrabold text-gray-900' : 'font-semibold text-gray-700 hover:bg-brand-50')}>
        <span className="flex w-4 shrink-0 justify-center text-brand-600">{on ? <Check className="h-4 w-4" /> : icon}</span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className={cn('shrink-0 text-xs font-bold tabular-nums', count ? 'text-gray-500' : 'text-gray-300')}>{count}</span>
      </button>
    )
  }
  return (
    <div>
      {item(null, 'All lists', total)}
      {general.map(b => item(b.id, b.name, counts[b.id] ?? 0, <Inbox className="h-4 w-4 text-gray-400" />))}
      {rest.length > 0 && <div className="mx-3 my-1.5 border-t border-brand-100" />}
      {rest.map(b => item(b.id, b.name, counts[b.id] ?? 0))}
      {onManage && (
        <div className="mt-2 flex flex-wrap gap-2 px-1">
          <button type="button" onClick={() => { onDone?.(); onManage() }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3 text-xs font-extrabold text-gray-700 hover:bg-brand-50">
            <Plus className="h-3.5 w-3.5" />New list
          </button>
          <button type="button" onClick={() => { onDone?.(); onManage() }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3 text-xs font-extrabold text-gray-700 hover:bg-brand-50">
            <Pencil className="h-3.5 w-3.5" />Edit lists
          </button>
        </div>
      )}
    </div>
  )
}

/** Laptop: the lists down the left, always there. */
export function ListRail(props: Props) {
  return (
    <nav aria-label="Lists">
      <p className="mb-1.5 px-3 text-xs font-extrabold uppercase tracking-[0.1em] text-gray-500">Lists</p>
      <ListOptions {...props} />
    </nav>
  )
}

/** Phone: one "All lists ▾" button that opens the same choices as a sheet. */
export function ListButton({ open, onOpenChange, ...props }: Props & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const current = props.boards.find(b => b.id === props.value)
  return (
    <>
      <button type="button" onClick={() => onOpenChange(true)} aria-haspopup="dialog"
        className={cn('inline-flex min-h-9 max-w-[55vw] items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold',
          current ? 'border-brand-400 bg-brand-100 text-gray-900' : 'border-brand-200 bg-white text-gray-700 hover:bg-brand-50')}>
        <FolderOpen className="h-4 w-4 shrink-0" />
        <span className="truncate">{current?.name ?? 'All lists'}</span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>
      <Modal open={open} onOpenChange={onOpenChange} title="Show tasks from"
        className="max-w-md max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[85dvh] max-sm:max-w-none max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <ListOptions {...props} onDone={() => onOpenChange(false)} />
      </Modal>
    </>
  )
}
