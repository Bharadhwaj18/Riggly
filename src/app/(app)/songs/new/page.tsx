import { SongForm } from '@/components/songs/SongForm'
import { sectionGuard } from '@/lib/section-guard'
import { getCachedSongs } from '@/lib/data'
import { createSong } from '@/actions/songs'

export default async function NewSongPage() {
  const denied = await sectionGuard('songs')
  if (denied) return denied
  const songs = await getCachedSongs()
  const existing = songs.map(s => ({ id: s.id, title: s.title, artist: s.artist, hasChart: !!s.chord_chart?.trim() }))
  return <SongForm title="New song" backHref="/songs" backLabel="Songs" onSubmit={createSong} existing={existing} />
}
