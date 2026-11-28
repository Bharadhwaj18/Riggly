'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Pencil, Plus, StickyNote, Trash2, Users } from 'lucide-react'
import { createNote, deleteNote, updateNoteText } from '@/actions/notes'
import { Button } from '@/components/ui/Button'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { useToast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'

export interface InlineNote {
  id: string
  title: string
  content: string | null
  visibility: 'private' | 'shared'
}

type Visibility = InlineNote['visibility']

const field = 'w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400'

/** Who sees a note: only the writer, or everyone in the workspace. */
function VisibilityPicker({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  const options: { value: Visibility; label: string; icon: typeof Lock }[] = [
    { value: 'private', label: 'Only me', icon: Lock },
    { value: 'shared', label: 'Workspace', icon: Users },
  ]
  return (
    <div role="radiogroup" aria-label="Who can see this note" className="inline-flex rounded-full bg-brand-100 p-0.5">
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn('inline-flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-extrabold', value === o.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>
          <o.icon className="h-3 w-3" />{o.label}
        </button>
      ))}
    </div>
  )
}

function NoteForm({ initial, busy, onSave, onCancel, onDelete }: {
  initial: { title: string; content: string; visibility: Visibility }
  busy: boolean
  onSave: (v: { title: string; content: string; visibility: Visibility }) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [title, setTitle] = useState(initial.title)
  const [content, setContent] = useState(initial.content)
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility)
  const empty = !title.trim() && !content.trim()
  return (
    <div className="space-y-2 rounded-xl border border-brand-300 bg-brand-50/50 p-3">
      <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Title (optional)" aria-label="Note title" className={field} />
      <textarea value={content} onChange={e => setContent(e.target.value)} rows={3} autoFocus placeholder="Write the note" aria-label="Note text" className={field} />
      <div className="flex flex-wrap items-center gap-2">
        <VisibilityPicker value={visibility} onChange={setVisibility} />
        <div className="ml-auto flex items-center gap-1">
          {onDelete && (
            <button type="button" onClick={onDelete} disabled={busy} aria-label="Delete note" title="Delete note"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
          )}
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={() => onSave({ title, content, visibility })} disabled={empty} loading={busy}>Save</Button>
        </div>
      </div>
    </div>
  )
}

/** A song's or show's notes, shown and edited in place. Tapping a note opens it where it is. */
export function InlineNotes({ notes, showId, songId, canEdit, subject }: {
  notes: InlineNote[]; showId: string | null; songId: string | null; canEdit: boolean; subject: 'song' | 'show'
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [pending, start] = useTransition()
  const toast = useToast()
  const router = useRouter()

  const run = (fn: () => Promise<{ error?: string }>, ok: string, done: () => void) => start(async () => {
    const res = await fn()
    if (res.error) { toast(res.error, 'error'); return }
    toast(ok, 'success')
    done()
    router.refresh()
  })

  return (
    <section className="rounded-2xl border border-brand-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel>Notes</SectionLabel>
        {canEdit && !adding && (
          <button type="button" onClick={() => { setAdding(true); setEditing(null) }} className="inline-flex min-h-8 items-center gap-1 text-xs font-bold text-brand-600 hover:underline">
            <Plus className="h-3.5 w-3.5" /> Add note
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {adding && (
          <li>
            <NoteForm initial={{ title: '', content: '', visibility: 'shared' }} busy={pending} onCancel={() => setAdding(false)}
              onSave={v => run(() => createNote({ ...v, pinned: false, color: null, labels: [], checklistItems: [], showId, songId }), 'Note added', () => setAdding(false))} />
          </li>
        )}
        {notes.map(n => (
          <li key={n.id}>
            {editing === n.id ? (
              <NoteForm initial={{ title: n.title, content: n.content ?? '', visibility: n.visibility }} busy={pending} onCancel={() => setEditing(null)}
                onSave={v => run(() => updateNoteText(n.id, v), 'Note saved', () => setEditing(null))}
                onDelete={() => run(() => deleteNote(n.id), 'Note deleted', () => setEditing(null))} />
            ) : (
              <button type="button" disabled={!canEdit} onClick={() => { setEditing(n.id); setAdding(false) }} aria-label={canEdit ? `Edit note: ${n.title || 'untitled'}` : undefined}
                className={cn('group flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left', canEdit ? 'hover:bg-brand-50' : 'cursor-default')}>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold text-gray-900">{n.title || n.content?.split('\n')[0] || 'Untitled'}</span>
                  {n.title && n.content && <span className="mt-0.5 block whitespace-pre-wrap break-words text-sm text-gray-600">{n.content}</span>}
                  {!n.title && n.content && n.content.includes('\n') && <span className="mt-0.5 block whitespace-pre-wrap break-words text-sm text-gray-600">{n.content.split('\n').slice(1).join('\n')}</span>}
                </span>
                {n.visibility === 'private' && <Lock className="mt-1 h-3 w-3 shrink-0 text-gray-400" aria-label="Only you" />}
                {canEdit && <Pencil className="mt-1 h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-gray-500" aria-hidden />}
              </button>
            )}
          </li>
        ))}
      </ul>

      {notes.length === 0 && !adding && (
        <p className="flex items-center gap-2 text-sm text-gray-400"><StickyNote className="h-4 w-4" /> No notes yet for this {subject}.</p>
      )}
    </section>
  )
}
