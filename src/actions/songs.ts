'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireWorkspaceId } from '@/lib/workspace'
import { songDetailsSchema, type SongFormData, type SongDetailsData } from '@/lib/validators'
import { addSongReference } from '@/actions/song-references'
import { cleanTitle, pairKey } from '@/lib/song-match'

/** Just the song's own columns from the form (the link and cover are handled separately). */
function songColumns(data: SongFormData) {
  const { title, artist, song_key, bpm, time_signature, chord_chart, notes } = data
  return { title: cleanTitle(title), artist, song_key, bpm: bpm ?? null, time_signature, chord_chart, notes }
}

export async function createSong(data: SongFormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: song, error } = await supabase
    .from('songs')
    .insert({
      ...songColumns(data),
      ...(data.cover_url ? { cover_url: data.cover_url } : {}),
      created_by: user.id,
      workspace_id: await requireWorkspaceId(),
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  // A link pasted on New song becomes the Original reference. The song is saved either way.
  if (data.reference_url) await addSongReference({ songId: song.id, link: data.reference_url, label: 'Original', moments: [] })

  revalidatePath('/songs')
  redirect(`/songs/${song.id}`)
}

export async function updateSong(id: string, data: SongFormData, redirectTo?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('songs')
    .update({
      ...songColumns(data),
      updated_by: user.id,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)

  revalidatePath('/songs')
  revalidatePath(`/songs/${id}`)
  redirect(redirectTo ?? `/songs/${id}`)
}

export async function saveTranspose(
  songId: string,
  chordChart: string,
  newKey: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('songs')
    .update({
      chord_chart: chordChart,
      ...(newKey !== null && { song_key: newKey }),
      updated_by: user.id,
    })
    .eq('id', songId)

  if (error) return { error: error.message }

  revalidatePath('/songs')
  revalidatePath(`/songs/${songId}`)
  return {}
}

/** Saves the song's details (name, key, tempo…), for the unlocked song page (auto-saved as you type). */
export async function saveSongDetails(songId: string, details: SongDetailsData): Promise<{ error?: string }> {
  const parsed = songDetailsSchema.safeParse(details)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Those details aren’t valid.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('songs')
    .update({ ...parsed.data, updated_by: user.id })
    .eq('id', songId)
    .select('id')

  if (error) return { error: error.message }
  if (!data?.length) return { error: 'You can’t edit this song.' }

  revalidatePath('/songs')
  revalidatePath(`/songs/${songId}`)
  return {}
}

/** Saves just the chord chart, for the song page's unlocked block editor (auto-saved as you type). */
export async function saveChordChart(songId: string, chordChart: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('songs')
    .update({ chord_chart: chordChart, updated_by: user.id })
    .eq('id', songId)
    .select('id')

  if (error) return { error: error.message }
  // Row-level security turns a change you aren't allowed to make into "nothing updated", not an error.
  if (!data?.length) return { error: 'You can’t edit this song.' }

  revalidatePath('/songs')
  revalidatePath(`/songs/${songId}`)
  return {}
}

export async function deleteSong(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.from('songs').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/songs')
  return {}
}

/** Folds a duplicate into the song you're keeping: setlists, links, notes and recordings move over, blanks are filled in. */
export async function mergeSongs(keepId: string, dropId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.rpc('merge_songs', { p_keep: keepId, p_drop: dropId })
  if (error) return { error: error.message }

  revalidatePath('/songs')
  revalidatePath('/setlists')
  return {}
}

/** Marks these songs as different songs that just look alike, so they stop being suggested as duplicates. */
export async function markNotDuplicates(songIds: string[]): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const workspace_id = await requireWorkspaceId()
  const rows: { workspace_id: string; song_a: string; song_b: string; created_by: string }[] = []
  for (let i = 0; i < songIds.length; i++) {
    for (let j = i + 1; j < songIds.length; j++) {
      const [song_a, song_b] = pairKey(songIds[i], songIds[j]).split('|')
      rows.push({ workspace_id, song_a, song_b, created_by: user.id })
    }
  }
  if (!rows.length) return {}

  const { error } = await supabase.from('song_not_duplicates').upsert(rows, { onConflict: 'song_a,song_b', ignoreDuplicates: true })
  if (error) return { error: error.message }

  revalidatePath('/songs')
  revalidatePath('/songs/duplicates')
  return {}
}
