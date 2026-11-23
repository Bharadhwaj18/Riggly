'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireWorkspaceId } from '@/lib/workspace'
import { sendNotificationToAll } from '@/actions/notifications'
import { formatDateDMY } from '@/lib/dates'
import type { ShowFormData } from '@/lib/validators'
import { BOOKING_STATUSES } from '@/types/shows'

// Only confirmed-or-later shows count as booked; everything before that is still an enquiry.
const BOOKED_STATUSES = ['Confirmed', 'Advance Received', 'Completed']
const isBooked = (status: string | null | undefined) => !!status && BOOKED_STATUSES.includes(status)

async function actorName(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle()
  return data?.display_name ?? 'Someone'
}

type ShowSnapshot = { title: string; show_date: string | null; venue: string | null; booking_status: string | null }
type ShowChange = Partial<Pick<ShowFormData, 'show_date' | 'venue' | 'booking_status'>>

/**
 * One "booked" notification, sent the moment a show first becomes confirmed. Until then it's an enquiry: no update
 * pings. After that, status, date and venue changes notify everyone.
 */
async function notifyShowChange(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, id: string, existing: ShowSnapshot, data: ShowChange) {
  const justBooked = isBooked(data.booking_status) && !isBooked(existing.booking_status)
  if (justBooked) {
    // A status-only change doesn't carry the date or venue, so fall back to what the show has.
    const date = data.show_date !== undefined ? data.show_date : existing.show_date
    const venue = data.venue !== undefined ? data.venue : existing.venue
    await sendNotificationToAll({
      title: `${await actorName(supabase, userId)} booked "${existing.title}"`,
      body: [date ? formatDateDMY(date) : null, venue].filter(Boolean).join(' · ') || undefined,
      link: `/shows/${id}`,
      type: 'show_created',
    })
  } else if (isBooked(existing.booking_status)) {
    const changes: string[] = []
    if (data.booking_status !== undefined && data.booking_status !== existing.booking_status) changes.push(`Status → ${data.booking_status ?? '—'}`)
    if (data.show_date !== undefined && data.show_date !== existing.show_date) changes.push(`Date → ${data.show_date ? formatDateDMY(data.show_date) : '—'}`)
    if (data.venue !== undefined && data.venue !== existing.venue) changes.push(`Venue → ${data.venue ?? '—'}`)

    if (changes.length) {
      await sendNotificationToAll({
        title: `${await actorName(supabase, userId)} updated "${existing.title}"`,
        body: changes.join(' · '),
        link: `/shows/${id}`,
        type: 'show_updated',
      })
    }
  }
}

export async function createShow(data: ShowFormData): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: show, error } = await supabase
    .from('shows')
    .insert({ ...data, created_by: user.id, workspace_id: await requireWorkspaceId(), })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await sendNotificationToAll({
    title: `${await actorName(supabase, user.id)} ${isBooked(data.booking_status) ? 'booked a new show' : 'got an enquiry for a show'}`,
    body: data.show_date ? `"${data.title}" on ${formatDateDMY(data.show_date)}` : `"${data.title}"`,
    link: `/shows/${show.id}`,
    type: isBooked(data.booking_status) ? 'show_created' : 'show_enquiry',
  })

  revalidatePath('/shows')
  revalidatePath('/finance')
  revalidatePath('/finance/split')
  revalidatePath('/calendar')
  redirect(`/shows/${show.id}`)
}

export async function updateShow(id: string, data: ShowFormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: existing } = await supabase.from('shows').select('title, show_date, venue, booking_status').eq('id', id).maybeSingle()

  const { error } = await supabase.from('shows').update({ ...data, updated_by: user.id }).eq('id', id)
  if (error) return { error: error.message }

  if (existing) await notifyShowChange(supabase, user.id, id, existing, data)

  revalidatePath('/shows')
  revalidatePath(`/shows/${id}`)
  revalidatePath('/finance')
  revalidatePath('/finance/split')
  revalidatePath('/calendar')
  redirect(`/shows/${id}`)
}

export async function deleteShow(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: show } = await supabase.from('shows').select('title, show_date').eq('id', id).maybeSingle()

  const { data: docs } = await supabase.from('show_documents').select('file_path').eq('show_id', id)

  const { error } = await supabase.from('shows').delete().eq('id', id)
  if (error) return { error: error.message }

  // Rows cascade away with the show; best-effort clean up their files too.
  if (docs?.length) await supabase.storage.from('show-documents').remove(docs.map(d => d.file_path))

  if (show && user) {
    await sendNotificationToAll({
      title: `${await actorName(supabase, user.id)} removed "${show.title}"`,
      body: show.show_date ? `Was on ${formatDateDMY(show.show_date)}` : undefined,
      link: '/shows',
      type: 'show_cancelled',
    })
  }

  revalidatePath('/shows')
  revalidatePath('/finance')
  revalidatePath('/finance/split')
  revalidatePath('/calendar')
  redirect('/shows')
}

/** Moves a show to another booking status from the show page or list, without opening the edit form. */
export async function setShowStatus(id: string, status: string | null): Promise<{ error?: string }> {
  if (status !== null && !(BOOKING_STATUSES as readonly string[]).includes(status)) return { error: 'That isn’t a show status.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: existing } = await supabase.from('shows').select('title, show_date, venue, booking_status').eq('id', id).maybeSingle()
  if (!existing) return { error: 'That show is no longer there.' }
  if (existing.booking_status === status) return {}

  // RLS lets only members who can edit Shows through; select the row back so a blocked update is caught.
  const { data: updated, error } = await supabase.from('shows').update({ booking_status: status, updated_by: user.id }).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!updated?.length) return { error: 'You can’t change shows in this workspace.' }

  await notifyShowChange(supabase, user.id, id, existing, { booking_status: status })

  revalidatePath('/shows')
  revalidatePath(`/shows/${id}`)
  revalidatePath('/')
  revalidatePath('/finance')
  revalidatePath('/calendar')
  return {}
}
