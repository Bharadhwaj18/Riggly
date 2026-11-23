import { createClient } from '@/lib/supabase/server'
import { duplicateGroups, pairKey, type SongLike } from '@/lib/song-match'

/** Groups of songs that look like, or were marked as, copies of each other. */
export async function getDuplicateGroups<T extends SongLike>(songs: T[]): Promise<T[][]> {
  const supabase = await createClient()
  const [notDuplicates, links] = await Promise.all([
    supabase.from('song_not_duplicates').select('song_a, song_b'),
    supabase.from('song_duplicate_links').select('song_a, song_b'),
  ])
  const keys = (rows: { song_a: string; song_b: string }[] | null) => new Set((rows ?? []).map(r => pairKey(r.song_a, r.song_b)))
  return duplicateGroups(songs, keys(notDuplicates.data), keys(links.data))
}
