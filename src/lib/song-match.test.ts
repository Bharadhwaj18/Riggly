import { describe, it, expect } from 'vitest'
import { cleanTitle, normalizeTitle, matchTitles, findSimilar, duplicateGroups, pairKey } from './song-match'

describe('cleanTitle', () => {
  it('drops invisible characters and extra spaces', () => {
    expect(cleanTitle('⁠pavizha  ')).toBe('pavizha')
    expect(cleanTitle('Butta​  bomma')).toBe('Butta bomma')
  })
})

describe('matchTitles', () => {
  it('treats case, spacing, punctuation and invisible characters as the same song', () => {
    expect(matchTitles('⁠butta bomma', 'Butta Bomma')).toBe('same')
    expect(matchTitles('Wheres the party tonight', "Where's the party tonight")).toBe('same')
    expect(matchTitles('Jiya jale', 'jiyajale')).toBe('same')
  })
  it('catches the usual spelling swaps', () => {
    expect(matchTitles('Dhanashree', 'Dhanasree')).toBe('similar')
    expect(matchTitles('Malhaar', 'Malhar')).toBe('similar')
    expect(matchTitles('Gulaabi Aanken', 'Gulabi aankhen')).toBe('similar')
    expect(matchTitles('Ghungroo', 'gunghroo')).toBe('similar')
    expect(matchTitles('Jotheyali', 'Jotheyalli')).toBe('similar')
    expect(matchTitles('Ye mera dil', 'Yeh mera dil')).toBe('similar')
    expect(matchTitles('Gaali pata', 'Galipata')).toBe('similar')
  })
  it('ignores a note in brackets', () => {
    expect(matchTitles('Mitwa ( Hindi)', 'mitwa')).toBe('similar')
    expect(matchTitles('Kaantha (Telugu)', 'Kantha')).toBe('similar')
    expect(matchTitles('Aigiri (Live)', 'Srivalli')).toBeNull()
  })
  it('catches a single typo in a longer title', () => {
    expect(matchTitles('Sapta saagara', 'Sapthasagara')).toBe('similar')
    expect(matchTitles('Monna kanipinchavu', 'Monna kanipinchavo')).toBe('similar')
  })
  it('keeps different songs apart', () => {
    expect(matchTitles('Srivalli', 'Butta Bomma')).toBeNull()
    expect(matchTitles('Tum hi ho', 'Tu hi ho')).toBeNull()
    expect(matchTitles('', 'Aigiri')).toBeNull()
  })
})

describe('normalizeTitle', () => {
  it('keeps letters from other scripts', () => {
    expect(normalizeTitle('బుట్ట బొమ్మ')).not.toBe('')
  })
})

describe('findSimilar', () => {
  const songs = [
    { id: '1', title: 'Malhar' },
    { id: '2', title: 'Aigiri' },
    { id: '3', title: 'malhaar' },
  ]
  it('lists matches, exact ones first, and skips the song itself', () => {
    expect(findSimilar('Malhar', songs, '1').map(m => [m.song.id, m.kind])).toEqual([['3', 'similar']])
    expect(findSimilar('MALHAR', songs).map(m => m.song.id)).toEqual(['1', '3'])
  })
})

describe('duplicateGroups', () => {
  const songs = [
    { id: 'a', title: 'Gulaabi Aanken' },
    { id: 'b', title: 'Gulaabi aankhen' },
    { id: 'c', title: 'Gulabi aankhen' },
    { id: 'd', title: 'Aigiri' },
  ]
  it('groups copies and leaves the rest', () => {
    const groups = duplicateGroups(songs)
    expect(groups).toHaveLength(1)
    expect(groups[0].map(s => s.id)).toEqual(['a', 'b', 'c'])
  })
  it('always groups songs marked as duplicates, whatever their titles', () => {
    const g = duplicateGroups([{ id: 'x', title: 'Aigiri' }, { id: 'y', title: 'Mahishasura Mardini' }], new Set(), new Set([pairKey('x', 'y')]))
    expect(g).toHaveLength(1)
    expect(g[0].map(s => s.id)).toEqual(['x', 'y'])
  })
  it('drops a group once every pair in it was marked not the same', () => {
    const pairs = new Set([pairKey('a', 'b'), pairKey('a', 'c'), pairKey('b', 'c')])
    expect(duplicateGroups(songs, pairs)).toHaveLength(0)
  })
})
