'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Settings2, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { TagInput } from '@/components/ui/TagInput'
import { Select } from '@/components/ui/Select'
import { saveShowType, deleteShowType, setSetlistShowType } from '@/actions/show-types'
import { useToast } from '@/components/ui/Toaster'

export interface ShowTypeRow { id: string; name: string; tags: string[] }

interface FieldProps {
  types: ShowTypeRow[]
  value: string | null
  onChange: (id: string | null) => void
  /** Tags used on songs, offered when setting up a type. */
  knownTags: string[]
  canEdit?: boolean
  disabled?: boolean
}

/** Pick the kind of show a setlist is for, and set up the kinds your band plays. */
export function ShowTypeField({ types, value, onChange, knownTags, canEdit = true, disabled }: FieldProps) {
  const [managing, setManaging] = useState(false)
  return (
    <div>
      <div className="flex items-center gap-2">
        <Select
          value={value ?? ''}
          disabled={disabled}
          onChange={e => onChange(e.target.value || null)}
          aria-label="Type of show"
          className="w-full rounded-md border border-brand-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          <option value="">No type</option>
          {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        {canEdit && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setManaging(true)} className="shrink-0">
            <Settings2 className="h-4 w-4" /> {types.length ? 'Edit types' : 'Add a type'}
          </Button>
        )}
      </div>
      {canEdit && <ShowTypeManager open={managing} onOpenChange={setManaging} types={types} knownTags={knownTags} onCreated={id => onChange(id)} />}
    </div>
  )
}

function ShowTypeManager({ open, onOpenChange, types, knownTags, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; types: ShowTypeRow[]; knownTags: string[]; onCreated: (id: string) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Kinds of show" description="Each kind lists the song tags that suit it. Suggestions use these to pick songs." className="max-w-xl">
      <div className="space-y-4">
        {types.map(t => <TypeEditor key={t.id} type={t} knownTags={knownTags} />)}
        <TypeEditor key={`new-${types.length}`} knownTags={knownTags} onCreated={onCreated} />
      </div>
      <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={() => onOpenChange(false)}>Done</Button></div>
    </Modal>
  )
}

function TypeEditor({ type, knownTags, onCreated }: { type?: ShowTypeRow; knownTags: string[]; onCreated?: (id: string) => void }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [name, setName] = useState(type?.name ?? '')
  const [tags, setTags] = useState<string[]>(type?.tags ?? [])
  const dirty = !type || name !== type.name || tags.join('|') !== type.tags.join('|')

  const save = () => start(async () => {
    const res = await saveShowType({ id: type?.id, name, tags })
    if (res.error) { toast(res.error, 'error'); return }
    toast(type ? 'Saved' : 'Added', 'success')
    if (!type && res.id) onCreated?.(res.id)
    router.refresh()
  })
  const remove = () => {
    if (!type || !window.confirm(`Delete “${type.name}”? Setlists of this kind just lose their type.`)) return
    start(async () => {
      const res = await deleteShowType(type.id)
      if (res.error) toast(res.error, 'error')
      else router.refresh()
    })
  }

  return (
    <div className={`rounded-xl border p-3 ${type ? 'border-brand-200 bg-white' : 'border-dashed border-brand-300 bg-brand-50'}`}>
      <div className="flex items-center gap-2">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder={type ? 'Name' : 'New kind of show, e.g. Corporate'} aria-label="Name" className="flex-1" />
        {type && <button type="button" onClick={remove} disabled={pending} aria-label={`Delete ${type.name}`} className="rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
      </div>
      <div className="mt-2"><TagInput value={tags} onChange={setTags} known={knownTags} placeholder="Tags that suit it, e.g. Hindi, Commercial" /></div>
      {dirty && (
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={save} loading={pending} disabled={!name.trim()}>{type ? 'Save' : 'Add kind of show'}</Button>
        </div>
      )}
    </div>
  )
}

/** On a setlist's page: the current type, saved as soon as it changes. */
export function SetlistShowType({ setlistId, types, value, knownTags, canEdit }: { setlistId: string; types: ShowTypeRow[]; value: string | null; knownTags: string[]; canEdit: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  return (
    <ShowTypeField
      types={types}
      value={value}
      knownTags={knownTags}
      canEdit={canEdit}
      disabled={pending || !canEdit}
      onChange={id => start(async () => {
        const res = await setSetlistShowType(setlistId, id)
        if (res.error) toast(res.error, 'error')
        router.refresh()
      })}
    />
  )
}
