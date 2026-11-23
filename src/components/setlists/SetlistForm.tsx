'use client'

import { useTransition } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link2 } from 'lucide-react'
import { setlistSchema, type SetlistFormData } from '@/lib/validators'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { ShowTypeField, type ShowTypeRow } from './ShowTypeField'
import type { Setlist } from '@/types'

interface LinkedShow { id: string; title: string; show_date: string | null; venue: string | null }
interface SetlistFormProps {
  setlist?: Setlist
  onSubmit: (data: SetlistFormData) => Promise<void>
  /** Present when creating a setlist from a show's own page — pre-fills date/venue from the show and carries show_id through on submit. */
  linkedShow?: LinkedShow
  showTypes?: ShowTypeRow[]
  /** Tags used on songs, offered when setting up a kind of show. */
  knownTags?: string[]
}

export function SetlistForm({ setlist, onSubmit, linkedShow, showTypes = [], knownTags = [] }: SetlistFormProps) {
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, control, formState: { errors } } = useForm<SetlistFormData>({
    resolver: zodResolver(setlistSchema),
    defaultValues: {
      title: setlist?.title ?? (linkedShow ? linkedShow.title : ''),
      show_date: setlist?.show_date ?? linkedShow?.show_date ?? '',
      venue: setlist?.venue ?? linkedShow?.venue ?? '',
      notes: setlist?.notes ?? '',
      show_id: setlist?.show_id ?? linkedShow?.id ?? null,
      show_type_id: setlist?.show_type_id ?? null,
    },
  })

  const handleFormSubmit = (data: SetlistFormData) => {
    startTransition(async () => { await onSubmit(data) })
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
      {linkedShow && (
        <div className="flex items-center gap-2 rounded-xl bg-brand-100 px-3 py-2 text-sm font-medium text-brand-700">
          <Link2 className="h-4 w-4 shrink-0" />
          Linked to show <span className="font-semibold">{linkedShow.title}</span>
        </div>
      )}
      <div>
        <Label htmlFor="title">Setlist Title *</Label>
        <Input id="title" className="mt-1" placeholder="Night at The Forum" error={errors.title?.message} {...register('title')} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="show_date">Show Date</Label>
          <Input id="show_date" type="date" className="mt-1" {...register('show_date')} />
        </div>
        <div>
          <Label htmlFor="venue">Venue</Label>
          <Input id="venue" placeholder="Blue Frog" className="mt-1" {...register('venue')} />
        </div>
      </div>
      <div>
        <Label>Type of show</Label>
        <div className="mt-1">
          <Controller name="show_type_id" control={control} render={({ field }) => (
            <ShowTypeField types={showTypes} value={field.value ?? null} onChange={field.onChange} knownTags={knownTags} />
          )} />
        </div>
        <p className="mt-1 text-xs text-gray-500">Pick one and the setlist suggests songs that suit it.</p>
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          rows={3}
          placeholder="Set length, special requests..."
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          {...register('notes')}
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={() => history.back()}>Cancel</Button>
        <Button type="submit" loading={isPending}>{setlist ? 'Save changes' : 'Create setlist'}</Button>
      </div>
    </form>
  )
}
