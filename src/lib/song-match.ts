// Finding songs that are really the same song: same title typed differently, or the same title spelled a
// different way (Dhanashree / Dhanasree, Malhaar / Malhar, Gulaabi aankhen / Gulabi aankhen).
//
// Nothing here decides anything. 'same' means the titles match once case, spaces, punctuation and invisible
// characters are ignored; 'similar' means they sound alike or are one typo apart. People confirm either one.

// Zero-width and soft-hyphen characters that ride along when a title is pasted from a chat app.
const INVISIBLE = /[­​-‏‪-‮⁠-⁤﻿]/g

/** A title as it should be saved: invisible characters gone, spaces collapsed and trimmed. */
export const cleanTitle = (title: string) => title.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim()

/** The title with everything that doesn't matter removed: case, accents, spaces and punctuation. */
export function normalizeTitle(title: string): string {
  return cleanTitle(title).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/** How a title sounds, roughly: the usual spelling swaps between Indian-language songs written in English. */
export function soundKey(title: string): string {
  return normalizeTitle(title)
    .replace(/h/g, '')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/(.)\1+/gu, '$1')
}

/** The title without anything in brackets: "Mitwa ( Hindi)" -> "Mitwa". */
const withoutBrackets = (t: string) => t.replace(/[([{][^)\]}]*[)\]}]/g, ' ')

function distance(a: string, b: string): number {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length]
}

export type MatchKind = 'same' | 'similar'

/** Whether two titles are the same song written differently, and how sure that is. null: no reason to think so. */
export function matchTitles(a: string, b: string): MatchKind | null {
  const na = normalizeTitle(a), nb = normalizeTitle(b)
  if (!na || !nb) return null
  if (na === nb) return 'same'
  const ka = soundKey(a), kb = soundKey(b)
  if (ka === kb) return 'similar'
  // A language or version note in brackets doesn't make it another song.
  const ba = withoutBrackets(a), bb = withoutBrackets(b)
  if ((ba !== a || bb !== b) && normalizeTitle(ba) && normalizeTitle(bb) && soundKey(ba) === soundKey(bb)) return 'similar'
  // One typo apart. Short titles need to be exact on sound, or "Tum" and "Tu" would match.
  const shortest = Math.min(ka.length, kb.length)
  if (shortest < 6) return null
  return distance(ka, kb) <= (shortest >= 12 ? 2 : 1) ? 'similar' : null
}

export interface SongLike { id: string; title: string }

/** Songs already in the list that look like this title. 'same' first. */
export function findSimilar<T extends SongLike>(title: string, songs: T[], excludeId?: string): { song: T; kind: MatchKind }[] {
  const found: { song: T; kind: MatchKind }[] = []
  for (const song of songs) {
    if (song.id === excludeId) continue
    const kind = matchTitles(title, song.title)
    if (kind) found.push({ song, kind })
  }
  return found.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'same' ? -1 : 1))
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * Groups of songs that look like copies of each other. A pair someone said isn't a duplicate (`notDuplicates`,
 * as pairKey strings) doesn't link two songs, though they can still end up together through a third. A pair someone
 * marked as a duplicate by hand (`linked`) always does, whatever the titles look like.
 */
export function duplicateGroups<T extends SongLike>(songs: T[], notDuplicates: Set<string> = new Set(), linked: Set<string> = new Set()): T[][] {
  const parent = songs.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < songs.length; i++) {
    for (let j = i + 1; j < songs.length; j++) {
      const pair = pairKey(songs[i].id, songs[j].id)
      if (linked.has(pair) || (!notDuplicates.has(pair) && matchTitles(songs[i].title, songs[j].title))) parent[find(j)] = find(i)
    }
  }
  const groups = new Map<number, T[]>()
  songs.forEach((s, i) => {
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), s])
  })
  return [...groups.values()].filter(g => g.length > 1)
}
