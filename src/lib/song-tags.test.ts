import { describe, it, expect } from 'vitest'
import { addTag, cleanTag, tagCounts, matchesTags, suggestSongs } from './song-tags'

describe('addTag', () => {
  it('adds once, ignoring case, and uses a known spelling', () => {
    expect(addTag([], '  hindi ')).toEqual(['hindi'])
    expect(addTag(['Hindi'], 'hindi')).toEqual(['Hindi'])
    expect(addTag([], 'hindi', ['Hindi'])).toEqual(['Hindi'])
    expect(addTag(['Hindi'], '   ')).toEqual(['Hindi'])
  })
  it('keeps tags short and tidy', () => {
    expect(cleanTag('a   b')).toBe('a b')
    expect(cleanTag('x'.repeat(80))).toHaveLength(30)
  })
})

describe('tagCounts', () => {
  it('counts per tag, most used first', () => {
    const r = tagCounts([{ tags: ['Hindi', 'Male'] }, { tags: ['hindi'] }, { tags: null }])
    expect(r).toEqual([{ tag: 'Hindi', count: 2 }, { tag: 'Male', count: 1 }])
  })
})

describe('matchesTags', () => {
  const song = { tags: ['Hindi', 'Commercial', 'Female'] }
  it('needs every word to be part of a tag', () => {
    expect(matchesTags(song, ['hindi'])).toBe(true)
    expect(matchesTags(song, ['hin', 'comm'])).toBe(true)
    expect(matchesTags(song, ['hindi', 'classical'])).toBe(false)
    expect(matchesTags(song, [])).toBe(false)
  })
})

describe('suggestSongs', () => {
  const songs = [
    { id: 'a', title: 'A', tags: ['Hindi'], chord_chart: 'x' },
    { id: 'b', title: 'B', tags: ['Hindi', 'Commercial'], chord_chart: '' },
    { id: 'c', title: 'C', tags: ['Hindi', 'Commercial'], chord_chart: 'x' },
    { id: 'd', title: 'D', tags: ['Telugu'], chord_chart: 'x' },
    { id: 'e', title: 'E', tags: ['hindi', 'commercial'], chord_chart: 'x' },
  ]
  it('ranks by tags matched, then times played, then chart', () => {
    const r = suggestSongs(songs, ['Hindi', 'Commercial'], { exclude: new Set(), plays: { b: 5, c: 1, e: 1 } })
    expect(r.map(x => x.song.id)).toEqual(['b', 'c', 'e', 'a'])
  })
  it('skips songs already in the setlist and songs with no matching tag', () => {
    const r = suggestSongs(songs, ['Hindi'], { exclude: new Set(['a']), plays: {} })
    expect(r.map(x => x.song.id)).not.toContain('a')
    expect(r.map(x => x.song.id)).not.toContain('d')
  })
  it('limits the list', () => {
    expect(suggestSongs(songs, ['Hindi'], { exclude: new Set(), plays: {}, limit: 2 })).toHaveLength(2)
  })
})
