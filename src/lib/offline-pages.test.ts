import { describe, expect, it } from 'vitest'
import { offlinePages } from './offline-pages'

const base = {
  today: '2026-11-25',
  hidden: [],
  setlists: [
    { id: 'past', show_date: '2026-11-01' },
    { id: 'next', show_date: '2026-11-30' },
    { id: 'soon', show_date: '2026-11-26' },
  ],
  shows: [{ id: 'gig', show_date: '2026-12-01' }],
  setlistSongs: [
    { setlist_id: 'next', song_id: 's1' },
    { setlist_id: 'soon', song_id: 's1' },
    { setlist_id: 'soon', song_id: 's2' },
  ],
  boardIds: ['b1'],
}

describe('offlinePages', () => {
  it('keeps every section, upcoming setlists soonest first, their songs once, shows and boards', () => {
    const urls = offlinePages(base)
    expect(urls.slice(0, 2)).toEqual(['/', '/shows'])
    expect(urls).toContain('/setlists')
    expect(urls.filter(u => u.startsWith('/setlists/'))).toEqual(['/setlists/soon', '/setlists/next', '/setlists/past'])
    expect(urls.filter(u => u.startsWith('/songs/'))).toEqual(['/songs/s1', '/songs/s2'])
    expect(urls).toContain('/shows/gig')
    expect(urls).toContain('/tasks/b1')
  })

  it('leaves out hidden sections and their pages', () => {
    const urls = offlinePages({ ...base, hidden: ['setlists', 'tasks'] })
    expect(urls.some(u => u.startsWith('/setlists'))).toBe(false)
    expect(urls.some(u => u.startsWith('/songs/'))).toBe(false)
    expect(urls.some(u => u.startsWith('/tasks'))).toBe(false)
    expect(urls).toContain('/songs')
  })
})
