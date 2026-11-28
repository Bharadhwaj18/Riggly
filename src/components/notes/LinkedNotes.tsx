import { createClient } from '@/lib/supabase/server'
import { getWorkspaceContext } from '@/lib/workspace'
import { InlineNotes } from './InlineNotes'

/**
 * Notes attached to a show or song, written and edited right there: nothing here leads to the Notes page.
 * Private notes only appear for their author (the database enforces it).
 */
export async function LinkedNotes({ showId, songId }: { showId?: string; songId?: string }) {
  const supabase = await createClient()
  const base = supabase
    .from('notes')
    .select('id, title, content, visibility')
    .is('deleted_at', null)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(30)
  const [{ data }, ctx] = await Promise.all([
    showId ? base.eq('show_id', showId) : base.eq('song_id', songId ?? ''),
    getWorkspaceContext(),
  ])

  return (
    <InlineNotes
      notes={(data ?? []).map(n => ({ id: n.id, title: n.title, content: n.content, visibility: n.visibility === 'private' ? 'private' : 'shared' }))}
      showId={showId ?? null}
      songId={songId ?? null}
      canEdit={ctx?.current.sections.notes === 'edit'}
      subject={showId ? 'show' : 'song'}
    />
  )
}
