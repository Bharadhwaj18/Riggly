// Song tags (Hindi, Commercial, Male…) and picking songs that fit a kind of show.
// Rules only: songs with more of the wanted tags come first, then the ones played most.

export const cleanTag = (tag: string) => tag.replace(/\s+/g, ' ').trim().slice(0, 30)
const key = (tag: string) => cleanTag(tag).toLowerCase()

/** Adds a tag unless it's already there (ignoring case). A tag spelled like a known one takes the known spelling. */
export function addTag(tags: string[], tag: string, known: string[] = []): string[] {
  const clean = cleanTag(tag)
  if (!clean || tags.some(t => key(t) === key(clean))) return tags
  const spelled = known.find(k => key(k) === key(clean)) ?? clean
  return [...tags, spelled]
}

/** Every tag in use with how many songs have it, most used first. */
export function tagCounts(songs: { tags?: string[] | null }[]): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>()
  for (const s of songs) {
    for (const t of s.tags ?? []) {
      const entry = counts.get(key(t))
      if (entry) entry.count++
      else counts.set(key(t), { tag: t, count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** True when every word typed is part of one of the song's tags: "hindi commercial" finds Hindi + Commercial songs. */
export function matchesTags(song: { tags?: string[] | null }, words: string[]): boolean {
  const tags = (song.tags ?? []).map(key)
  return words.length > 0 && words.every(w => tags.some(t => t.includes(w.toLowerCase())))
}

export interface Suggestible { id: string; title: string; tags?: string[] | null; chord_chart?: string | null }

/**
 * Songs that fit a show type's tags, best first: the most tags matched, then the most played, then ones with a
 * chord chart. Songs with none of the wanted tags are left out.
 */
export function suggestSongs<T extends Suggestible>(
  songs: T[],
  wanted: string[],
  opts: { exclude: Set<string>; plays: Record<string, number>; limit?: number },
): { song: T; matched: string[] }[] {
  const wantedKeys = wanted.map(key)
  const found = songs
    .filter(s => !opts.exclude.has(s.id))
    .map(song => {
      const have = new Set((song.tags ?? []).map(key))
      return { song, matched: wanted.filter((_, i) => have.has(wantedKeys[i])) }
    })
    .filter(x => x.matched.length > 0)
    .sort((a, b) =>
      b.matched.length - a.matched.length ||
      (opts.plays[b.song.id] ?? 0) - (opts.plays[a.song.id] ?? 0) ||
      Number(!!b.song.chord_chart?.trim()) - Number(!!a.song.chord_chart?.trim()) ||
      a.song.title.localeCompare(b.song.title))
  return opts.limit ? found.slice(0, opts.limit) : found
}
